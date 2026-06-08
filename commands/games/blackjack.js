const Game = require('../../models/Game');
const ProvablyFair = require('../../utils/provablyFair');
const EmbedHelper = require('../../utils/embedBuilder');
const GameImages = require('../../utils/gameImages');
const { betAgainRow } = require('../../utils/gameComponents');
const config = require('../../config');
const { sendPublic } = require('../../utils/broadcast');
const Logger = require('../../utils/logger');
const { parseBet } = require('../../utils/betParser');

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
    await game.save();
    await user.save();

    const { AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
    let msg = null;
    let collector = null;

    async function finish(result, payout, multiplier) {
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
          ? `Push! Your **${fmtPoints(bet)}** points returned.`
          : `Dealer wins! You lost **${fmtPoints(bet)}** points.`;

      const embed = EmbedHelper.createDefault()
        .setTitle(config.emojis.spade + ' Blackjack')
        .setDescription(description)
        .addFields({ name: 'Game ID', value: `\`${gameId}\``, inline: false })
        .setColor(result === 'win' ? config.colors.success : result === 'tie' ? config.colors.warning : config.colors.error)
        .setImage(image ? 'attachment://bj.png' : null);
      const files = image ? [new AttachmentBuilder(image, { name: 'bj.png' })] : [];
      const payload = { embeds: [embed], files, components: [betAgainRow('blackjack', [fmtPoints(bet)])] };

      if (msg) await msg.edit(payload);
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
      user.balance = roundPoints(user.balance + bet);
      await user.save();
      return finish('tie', bet, 1);
    }
    if (initialPlayerTotal === 21) {
      const payout = roundPoints(bet * 2.5);
      user.balance = roundPoints(user.balance + payout);
      user.wins++;
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
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`bj_hit_${gameId}`).setLabel('Hit').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`bj_stand_${gameId}`).setLabel('Stand').setStyle(ButtonStyle.Secondary)
    );
    const files = image ? [new AttachmentBuilder(image, { name: 'bj.png' })] : [];
    msg = await message.reply({ embeds: [embed], files, components: [row] });

    let over = false;
    collector = msg.createMessageComponentCollector({ time: 120000 });
    collector.on('collect', async (interaction) => {
      if (interaction.user.id !== message.author.id) return interaction.reply({ content: 'Not your game.', flags: MessageFlags.Ephemeral });
      if (over) return;
      await interaction.deferUpdate();

      if (interaction.customId === `bj_hit_${gameId}`) {
        playerCards.push(deck[deckIndex++]);
        const total = calcHand(playerCards);
        if (total > 21) {
          over = true;
          user.losses++;
          await user.save();
          Logger.game(user.userId, 'Blackjack', bet, 0);
          return finish('lose', 0, 0);
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
          components: [row]
        });
      }

      if (interaction.customId === `bj_stand_${gameId}`) {
        over = true;
        while (calcHand(dealerCards) < 17) dealerCards.push(deck[deckIndex++]);

        const playerTotal = calcHand(playerCards);
        const dealerTotal = calcHand(dealerCards);
        let result = 'lose';
        let payout = 0;
        let multiplier = 0;

        if (dealerTotal > 21 || playerTotal > dealerTotal) {
          result = 'win';
          payout = roundPoints(bet * 2);
          multiplier = 2;
          user.wins++;
          user.balance = roundPoints(user.balance + payout);
        } else if (playerTotal === dealerTotal) {
          result = 'tie';
          payout = bet;
          multiplier = 1;
          user.balance = roundPoints(user.balance + bet);
        } else {
          user.losses++;
        }

        await user.save();
        Logger.game(user.userId, 'Blackjack', bet, payout);
        return finish(result, payout, multiplier);
      }
    });
    collector.on('end', () => { over = true; });
  }
};
