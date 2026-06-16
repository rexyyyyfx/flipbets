const Game = require('../../models/Game');
const ProvablyFair = require('../../utils/provablyFair');
const EmbedHelper = require('../../utils/embedBuilder');
const GameImages = require('../../utils/gameImages');
const { betAgainRow } = require('../../utils/gameComponents');
const config = require('../../config');
const { sendPublic } = require('../../utils/broadcast');
const Logger = require('../../utils/logger');
const { parseBet } = require('../../utils/betParser');
const { isRigged } = require('../../utils/rigg');
const { applyWagerDecrement } = require('../../utils/wager');

function calcHand(hand) {
  let total = 0;
  let aces = 0;
  for (const card of hand) {
    if (card.rank === 'A') {
      aces++;
      total += 11;
    } else if (['K', 'Q', 'J'].includes(card.rank)) {
      total += 10;
    } else {
      total += parseInt(card.rank, 10);
    }
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return total;
}

function fmtPoints(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return '0';
  const parts = Math.round(n * 100) / 100 + '';
  const x = parts.split('.');
  x[0] = x[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return x.join('.');
}

function roundPoints(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

module.exports = {
  name: 'blackjack',
  aliases: ['bj', '21'],
  async execute(message, args, user) {
    const bet = parseBet(args[0], user.balance);
    if (!bet) {
      if (user.balance <= 0) return message.reply('Invalid points — top up your balance to play.');
      return message.reply('Usage: `.bj <amount|half|all>`');
    }
    if (user.balance < bet) {
      if (user.balance <= 0) return message.reply('Invalid points — top up your balance to play.');
      return message.reply(`Insufficient balance. You have **${fmtPoints(user.balance)}** points.`);
    }

    const serverSeed = ProvablyFair.generateServerSeed();
    const clientSeed = user.clientSeed || ProvablyFair.generateClientSeed();
    const nonce = user.gamesPlayed + 1;
    const pf = new ProvablyFair(serverSeed, clientSeed, nonce);
    const deck = pf.generateDeck();
    const playerHand = [deck[0], deck[2]];
    const dealerHand = [deck[1], deck[3]];
    const playerCards = [...playerHand];
    const dealerCards = [...dealerHand];
    const _rigged = isRigged(user, user._globalRiggPct);
    if (_rigged) {
      [playerCards[0], dealerCards[0]] = [dealerCards[0], playerCards[0]];
    }
    let deckIndex = 4;
    const gameId = ProvablyFair.generateGameId();

    user.balance = roundPoints(user.balance - bet);
    user.gamesPlayed++;
    user.totalWagered = roundPoints((user.totalWagered || 0) + bet);

    const game = new Game({
      gameId,
      userId: user.userId,
      username: user.username,
      gameType: 'Blackjack',
      betAmount: bet,
      payout: 0,
      multiplier: 0,
      result: 'pending',
      serverSeed,
      clientSeed,
      nonce,
      details: {
        playerHand: playerCards.map(c => `${c.rank}${c.suit}`),
        dealerHand: dealerCards.map(c => `${c.rank}${c.suit}`)
      }
    });
    applyWagerDecrement(user, bet);
    await game.save();
    await user.save();

    const { AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
    let msg = null;
    let collector = null;
    let totalBet = bet;
    let insuranceBet = 0;
    let insurancePayout = 0;
    let firstMove = true;

    function actionRow() {
      const buttons = [
        new ButtonBuilder().setCustomId(`bj_hit_${gameId}`).setLabel('Hit').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`bj_stand_${gameId}`).setLabel('Stand').setStyle(ButtonStyle.Secondary)
      ];
      if (firstMove && playerCards.length === 2) {
        buttons.push(new ButtonBuilder().setCustomId(`bj_double_${gameId}`).setLabel('Double').setStyle(ButtonStyle.Success).setDisabled(user.balance < bet));
      }
      return new ActionRowBuilder().addComponents(...buttons);
    }

    async function finish(result, payout, multiplier, int) {
      const playerTotal = calcHand(playerCards);
      const dealerTotal = calcHand(dealerCards);
      game.result = result;
      game.payout = payout;
      game.multiplier = multiplier;
      game.details = {
        ...game.details,
        playerHand: playerCards.map(c => `${c.rank}${c.suit}`),
        dealerHand: dealerCards.map(c => `${c.rank}${c.suit}`)
      };
      await game.save();

      const image = await GameImages.createBlackjackImage(playerCards, playerTotal, dealerCards, dealerTotal, result, false, user.username, gameId);
      const description = result === 'win'
        ? playerTotal === 21 && playerCards.length === 2
          ? `BLACKJACK! You won **${fmtPoints(payout)}** points!`
          : `You won **${fmtPoints(payout)}** points!`
        : result === 'tie'
          ? `Push! Your **${fmtPoints(totalBet)}** points returned.`
          : `Dealer wins! You lost **${fmtPoints(totalBet)}** points.${insurancePayout ? ` Insurance paid **${fmtPoints(insurancePayout)}** points.` : ''}`;

      const embed = EmbedHelper.createDefault()
        .setTitle(config.emojis.spade + ' Blackjack')
        .setDescription(description)
        .addFields({ name: 'Game ID', value: `\`${gameId}\``, inline: false })
        .setColor(result === 'win' ? config.colors.success : result === 'tie' ? config.colors.warning : config.colors.error)
        .setImage(image ? 'attachment://bj.png' : null);
      const files = image ? [new AttachmentBuilder(image, { name: 'bj.png' })] : [];
      const payload = { embeds: [embed], files, components: [betAgainRow('blackjack', [bet], message.author.id)] };

      if (int) await int.editReply(payload);
      else if (msg) await msg.edit(payload);
      else msg = await message.reply(payload);

      if (result === 'win') {
        const publicChannel = message.client.channels.cache.get(config.publicBetsChannel);
        if (publicChannel) publicChannel.send({ embeds: [EmbedHelper.createPublicBetEmbed(game)] });
      }
      if (collector) collector.stop();
    }

    const initialPlayerTotal = calcHand(playerCards);
    const initialDealerTotal = calcHand(dealerCards);
    if (initialPlayerTotal === 21 && initialDealerTotal === 21) {
      if (_rigged) { user.losses++; applyWagerDecrement(user, bet); await user.save(); return finish('lose', 0, 0); }
      user.balance = roundPoints(user.balance + bet);
      applyWagerDecrement(user, bet);
      await user.save();
      return finish('tie', bet, 1);
    }
    if (initialPlayerTotal === 21) {
      if (_rigged) { user.losses++; applyWagerDecrement(user, bet); await user.save(); return finish('lose', 0, 0); }
      const payout = roundPoints(bet * 2.5);
      user.balance = roundPoints(user.balance + payout);
      user.wins++;
      applyWagerDecrement(user, bet);
      await user.save();
      Logger.game(user.userId, 'Blackjack', bet, payout);
      return finish('win', payout, 2.5);
    }

    const image = await GameImages.createBlackjackImage(playerCards, initialPlayerTotal, dealerCards, initialDealerTotal, 'playing', true, user.username, gameId);
    const embed = EmbedHelper.createDefault()
      .setTitle(`${config.emojis.cards} Blackjack`)
      .setDescription('Hit or Stand?')
      .setColor(config.colors.primary)
      .setImage(image ? 'attachment://bj.png' : null);
    const insuranceRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`bj_insure_${gameId}`).setLabel('Insurance').setStyle(ButtonStyle.Primary).setDisabled(user.balance < bet / 2),
      new ButtonBuilder().setCustomId(`bj_noinsure_${gameId}`).setLabel('No Insurance').setStyle(ButtonStyle.Secondary)
    );
    const files = image ? [new AttachmentBuilder(image, { name: 'bj.png' })] : [];
    const dealerShowsAce = dealerCards[0].rank === 'A';
    if (dealerShowsAce) embed.setDescription('Dealer shows an Ace. Take insurance?');
    msg = await message.reply({ embeds: [embed], files, components: dealerShowsAce ? [insuranceRow] : [actionRow()] });

    let over = false;
    let insuranceResolved = !dealerShowsAce;

    async function resolveStand(int) {
      if (_rigged) {
        while (calcHand(dealerCards) <= calcHand(playerCards) && calcHand(dealerCards) <= 21 && deckIndex < deck.length) {
          dealerCards.push(deck[deckIndex++]);
        }
      } else {
        while (calcHand(dealerCards) < 17) dealerCards.push(deck[deckIndex++]);
      }

      const playerTotal = calcHand(playerCards);
      const dealerTotal = calcHand(dealerCards);
      let result = 'lose';
      let payout = insurancePayout;
      let multiplier = 0;

      if (dealerTotal > 21 || playerTotal > dealerTotal) {
        result = 'win';
        payout = roundPoints(totalBet * 2 + insurancePayout);
        multiplier = totalBet / bet * 2;
        user.wins++;
        user.balance = roundPoints(user.balance + payout);
      } else if (playerTotal === dealerTotal) {
        result = 'tie';
        payout = roundPoints(totalBet + insurancePayout);
        multiplier = 1;
        user.balance = roundPoints(user.balance + payout);
      } else {
        if (insurancePayout) user.balance = roundPoints(user.balance + insurancePayout);
        user.losses++;
      }

      applyWagerDecrement(user, totalBet);
      await user.save();
      Logger.game(user.userId, 'Blackjack', totalBet, payout);
      return finish(result, payout, multiplier, int);
    }

    collector = msg.createMessageComponentCollector({ time: 120000 });
    collector.on('collect', async (interaction) => {
      if (interaction.user.id !== message.author.id) return interaction.reply({ content: 'Not your game.', flags: MessageFlags.Ephemeral });
      if (over) return interaction.deferUpdate();
      await interaction.deferUpdate();

      if (interaction.customId === `bj_insure_${gameId}` || interaction.customId === `bj_noinsure_${gameId}`) {
        insuranceResolved = true;
        if (interaction.customId === `bj_insure_${gameId}`) {
          insuranceBet = roundPoints(bet / 2);
          if (user.balance < insuranceBet) {
            return interaction.followUp({ content: 'Not enough balance for insurance.', flags: MessageFlags.Ephemeral });
          }
          user.balance = roundPoints(user.balance - insuranceBet);
          applyWagerDecrement(user, insuranceBet);
          await user.save();
        }

        if (calcHand(dealerCards) === 21) {
          over = true;
          if (insuranceBet) {
            insurancePayout = roundPoints(insuranceBet * 3);
            user.balance = roundPoints(user.balance + insurancePayout);
          }
          user.losses++;
          applyWagerDecrement(user, totalBet);
          await user.save();
          Logger.game(user.userId, 'Blackjack', totalBet, insurancePayout);
          return finish('lose', insurancePayout, 0, interaction);
        }

        const nextEmbed = EmbedHelper.createDefault()
          .setTitle(`${config.emojis.cards} Blackjack`)
          .setDescription(insuranceBet ? `Insurance placed: **${fmtPoints(insuranceBet)}** pts. Hit or Stand?` : 'Hit or Stand?')
          .setColor(config.colors.primary)
          .setImage(image ? 'attachment://bj.png' : null);
        return interaction.editReply({ embeds: [nextEmbed], components: [actionRow()] });
      }

      if (!insuranceResolved) return;

      if (interaction.customId === `bj_hit_${gameId}`) {
        firstMove = false;
        playerCards.push(deck[deckIndex++]);
        const total = calcHand(playerCards);
        if (total > 21) {
          over = true;
          if (insurancePayout) user.balance = roundPoints(user.balance + insurancePayout);
          user.losses++;
          applyWagerDecrement(user, totalBet);
          await user.save();
          Logger.game(user.userId, 'Blackjack', totalBet, insurancePayout);
          return finish('lose', insurancePayout, 0, interaction);
        }
        if (total === 21) {
          over = true;
          return resolveStand(interaction);
        }

        const nextImage = await GameImages.createBlackjackImage(playerCards, total, dealerCards, calcHand(dealerCards), 'playing', true, user.username, gameId);
        const nextEmbed = EmbedHelper.createDefault()
          .setTitle(`${config.emojis.cards} Blackjack`)
          .setDescription('Hit or Stand?')
          .setColor(config.colors.primary)
          .setImage(nextImage ? 'attachment://bj.png' : null);
        await interaction.editReply({
          embeds: [nextEmbed],
          files: nextImage ? [new AttachmentBuilder(nextImage, { name: 'bj.png' })] : [],
          components: [actionRow()]
        });
      }

      if (interaction.customId === `bj_double_${gameId}`) {
        if (playerCards.length !== 2) return interaction.followUp({ content: 'You can only double on your first move.', flags: MessageFlags.Ephemeral });
        if (user.balance < bet) return interaction.followUp({ content: 'Not enough balance to double.', flags: MessageFlags.Ephemeral });
        firstMove = false;
        user.balance = roundPoints(user.balance - bet);
        totalBet = roundPoints(totalBet + bet);
        game.betAmount = totalBet;
        applyWagerDecrement(user, bet);
        await user.save();
        await game.save();

        playerCards.push(deck[deckIndex++]);
        const total = calcHand(playerCards);
        over = true;
        if (total > 21) {
          if (insurancePayout) user.balance = roundPoints(user.balance + insurancePayout);
          user.losses++;
          applyWagerDecrement(user, totalBet);
          await user.save();
          Logger.game(user.userId, 'Blackjack', totalBet, insurancePayout);
          return finish('lose', insurancePayout, 0, interaction);
        }
        return resolveStand(interaction);
      }

      if (interaction.customId === `bj_stand_${gameId}`) {
        over = true;
        return resolveStand(interaction);
      }
    });
    collector.on('end', () => { over = true; });
  }
};
