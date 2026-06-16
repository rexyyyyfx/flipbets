const { AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const Game = require('../../models/Game');
const ProvablyFair = require('../../utils/provablyFair');
const EmbedHelper = require('../../utils/embedBuilder');
const GameImages = require('../../utils/gameImages');
const { parseBet } = require('../../utils/betParser');
const config = require('../../config');
const { sendPublic } = require('../../utils/broadcast');
const Logger = require('../../utils/logger');
const { isRigged, isWinRigged } = require('../../utils/rigg');
const { applyWagerDecrement } = require('../../utils/wager');

const cardNames = { 1: 'A', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K' };
const suits = ['♠', '♥', '♦', '♣'];
const suitMap = { '♠': 's', '♥': 'h', '♦': 'd', '♣': 'c' };
const HOUSE_EDGE = 0.97;

function fmt(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return '0';
  const parts = Math.round(n * 100) / 100 + '';
  const x = parts.split('.');
  x[0] = x[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return x.join('.');
}

function getPayoutMultiplier(value, guess) {
  if (guess === 'higher') {
    const prob = (13 - value) / 13;
    return prob > 0 ? Math.floor(HOUSE_EDGE / prob * 100) / 100 : 0;
  }
  const prob = (value - 1) / 13;
  return prob > 0 ? Math.floor(HOUSE_EDGE / prob * 100) / 100 : 0;
}

module.exports = {
  name: 'hilo',
  aliases: ['hi', 'lo'],
  async execute(message, args, user) {
    if (args.length < 1) return message.reply(`Usage: \`${config.prefix}hilo <amount|half|all>\``);

    const bet = parseBet(args[0], user.balance);
    if (!bet) {
      if (user.balance <= 0) return message.reply('Invalid points — top up your balance to play.');
      return message.reply('Invalid bet.');
    }
    if (user.balance < bet) {
      if (user.balance <= 0) return message.reply('Invalid points — top up your balance to play.');
      return message.reply('Insufficient balance.');
    }

    const ss = ProvablyFair.generateServerSeed();
    const cs = user.clientSeed || ProvablyFair.generateClientSeed();
    const nn = user.gamesPlayed + 1;
    const pf = new ProvablyFair(ss, cs, nn);
    const currentValue = pf.generateInt(1, 13);
    const currentSuit = suits[pf.generateInt(0, 3)];

    user.balance -= bet;
    user.gamesPlayed++;
    user.totalWagered = Math.round((user.totalWagered || 0) + bet * 100) / 100;
    applyWagerDecrement(user, bet);
    await user.save();

    const gid = ProvablyFair.generateGameId();
    let game = await Game.create({
      gameId: gid, userId: user.userId, username: user.username,
      gameType: 'Hilo', betAmount: bet, payout: 0, multiplier: 0,
      result: 'pending', serverSeed: ss, clientSeed: cs, nonce: nn,
      details: { currentValue, currentSuit, cards: [`${cardNames[currentValue]}${currentSuit}`] }
    });

    let gameOver = false;

    function buildButtons(v) {
      const btns = [];
      if (v > 1) btns.push(new ButtonBuilder().setCustomId(`hilo_low_${gid}`).setLabel('⬇').setStyle(ButtonStyle.Danger));
      btns.push(new ButtonBuilder().setCustomId(`hilo_skip_${gid}`).setLabel('⏭').setStyle(ButtonStyle.Secondary));
      if (v < 13) btns.push(new ButtonBuilder().setCustomId(`hilo_high_${gid}`).setLabel('⬆').setStyle(ButtonStyle.Success));
      return [new ActionRowBuilder().addComponents(btns)];
    }

    async function endGame(won, payout, mult, nc, ns, guess, int) {
      gameOver = true;
      game.result = won ? 'win' : 'lose';
      game.payout = payout;
      game.multiplier = mult;
      game.details.cards.push(`${cardNames[nc]}${ns}`);
      await game.save();

      const cards = [
        { rank: cardNames[currentValue], suit: suitMap[currentSuit] || 's', value: currentValue },
        { rank: cardNames[nc], suit: suitMap[ns] || 's', value: nc }
      ];
      const arrowDir = guess === 'higher' ? 1 : -1;
      const buf = await GameImages.createHiloImage(cards, won, user.username, gid, nc, arrowDir);

      const wonPts = won ? payout : 0;
      const u = await require('../../models/User').findOne({ userId: user.userId });
      if (won) { u.balance += payout; u.wins++; }
      else u.losses++;
      applyWagerDecrement(u, bet);
      await u.save();
      Logger.game(user.userId, 'Hilo', bet, wonPts);

      const e = EmbedHelper.createDefault()
        .setTitle(`${won ? config.emojis.tick : config.emojis.cross} Hi-Lo - ${won ? 'Won!' : 'Lost'}`)
        .setDescription(`${cardNames[nc]}${ns} • ${won ? `+${fmt(payout)} pts` : `Lost ${fmt(bet)} pts`}`)
        .addFields(
          { name: 'Bet', value: `${fmt(bet)} pts`, inline: true },
          { name: 'Payout', value: won ? `+${fmt(payout)}` : '0', inline: true },
          { name: 'Game ID', value: `\`${gid}\``, inline: false }
        )
        .setColor(won ? config.colors.success : config.colors.error)
        .setImage(buf ? 'attachment://hilo.png' : null)
        .setFooter({ text: `EzBet • Game ID: ${gid}` });

      if (int) await int.editReply({ embeds: [e], files: buf ? [new AttachmentBuilder(buf, { name: 'hilo.png' })] : [], components: [] });
      else await msg.edit({ embeds: [e], files: buf ? [new AttachmentBuilder(buf, { name: 'hilo.png' })] : [], components: [] });
      if (won) {
        const c = message.client.channels.cache.get(config.publicBetsChannel);
        if (c) c.send({ embeds: [EmbedHelper.createPublicBetEmbed(game)] });
      }
    }

    async function render(value, suit) {
      const cards = [{ rank: cardNames[value], suit: suitMap[suit] || 's', value }];
      const buf = await GameImages.createHiloImage(cards, undefined, user.username, gid, value);

      const e = EmbedHelper.createDefault()
        .setTitle(`${config.emojis.cards} Hi-Lo`)
        .setDescription(`${cardNames[value]}${suit}`)
        .addFields(
          { name: 'Bet', value: `${fmt(bet)} pts`, inline: true }
        )
        .setColor(config.colors.primary)
        .setImage(buf ? 'attachment://hilo.png' : null)
        .setFooter({ text: 'EzBet • Hi-Lo' });

      await msg.edit({ embeds: [e], files: buf ? [new AttachmentBuilder(buf, { name: 'hilo.png' })] : [], components: buildButtons(value) });
    }

    const initBuf = await GameImages.createHiloImage(
      [{ rank: cardNames[currentValue], suit: suitMap[currentSuit] || 's', value: currentValue }],
      undefined, user.username, gid, currentValue
    );
    const embed = EmbedHelper.createDefault()
      .setTitle(`${config.emojis.cards} Hi-Lo`)
      .setDescription(`${cardNames[currentValue]}${currentSuit}`)
      .addFields(
        { name: 'Bet', value: `${fmt(bet)} pts`, inline: true }
      )
      .setColor(config.colors.primary)
      .setImage(initBuf ? 'attachment://hilo.png' : null)
      .setFooter({ text: 'EzBet • Hi-Lo' });

    const msg = await message.reply({ embeds: [embed], files: initBuf ? [new AttachmentBuilder(initBuf, { name: 'hilo.png' })] : [], components: buildButtons(currentValue) });

    const collector = msg.createMessageComponentCollector({ time: 120000 });
    collector.on('collect', async (interaction) => {
      if (interaction.user.id !== message.author.id) return interaction.reply({ content: 'Not your game!', flags: MessageFlags.Ephemeral });
      if (gameOver) return interaction.deferUpdate();
      await interaction.deferUpdate();

      const gd = await Game.findOne({ gameId: gid });
      if (!gd || gd.result !== 'pending') { gameOver = true; return interaction.editReply({ content: 'Game already finished.' }).catch(() => {}); }

      if (interaction.customId === `hilo_skip_${gid}`) {
        gameOver = true;
        collector.stop();
        const payout = bet;
        const won = true;
        const u = await require('../../models/User').findOne({ userId: user.userId });
        u.balance += payout;
        u.wins++;
        applyWagerDecrement(u, bet);
        await u.save();
        game.result = 'win';
        game.payout = payout;
        game.multiplier = 1;
        await game.save();
        Logger.game(user.userId, 'Hilo', bet, payout);
        const e = EmbedHelper.createDefault()
          .setTitle(`${config.emojis.tick} Hi-Lo - Cashed Out`)
          .setDescription(`Cashed out **${fmt(bet)}** pts (no change)`)
          .addFields(
            { name: 'Game ID', value: `\`${gid}\``, inline: false }
          )
          .setColor(config.colors.success);
        await interaction.editReply({ embeds: [e], components: [] });
        return;
      }

      const guess = interaction.customId.includes('high') ? 'higher' : 'lower';
      const roundNum = gd.details.currentValue;
      const npf = new ProvablyFair(ss, cs, nn + 1);
      let nc = npf.generateInt(1, 13);
      const ns = suits[npf.generateInt(0, 3)];
      let correct = guess === 'higher' ? nc > currentValue : nc < currentValue;
      if (correct && isRigged(user, user._globalRiggPct)) {
        if (guess === 'higher') { nc = currentValue > 1 ? currentValue - 1 : 13; }
        else { nc = currentValue < 13 ? currentValue + 1 : 1; }
        correct = false;
      }
      if (!correct && isWinRigged(user)) {
        if (guess === 'higher') { nc = currentValue < 13 ? currentValue + 1 : currentValue - 1; }
        else { nc = currentValue > 1 ? currentValue - 1 : currentValue + 1; }
        correct = true;
      }

      if (nc === currentValue) {
        gd.details.cards.push(`${cardNames[nc]}${ns}`);
        await gd.save();
        const cards = [{ rank: cardNames[nc], suit: suitMap[ns] || 's', value: nc }];
        const buf = await GameImages.createHiloImage(cards, undefined, user.username, gid, nc);
        const e = EmbedHelper.createDefault()
          .setTitle(`${config.emojis.cards} Hi-Lo - Same Card!`)
          .setDescription(`${cardNames[nc]}${ns} — Same card! Your bet is refunded, going again...`)
          .addFields({ name: 'Bet', value: `${fmt(bet)} pts`, inline: true })
          .setColor(config.colors.warning)
          .setImage(buf ? 'attachment://hilo.png' : null);
        await interaction.editReply({ embeds: [e], files: buf ? [new AttachmentBuilder(buf, { name: 'hilo.png' })] : [], components: [] }).catch(() => {});
        await new Promise(r => setTimeout(r, 500));
        return render(currentValue, currentSuit);
      }

      if (!correct) {
        collector.stop();
        return endGame(false, 0, 0, nc, ns, guess, interaction);
      }

      collector.stop();
      const mult = getPayoutMultiplier(currentValue, guess);
      const payout = Math.floor(bet * mult);
      if (!Number.isFinite(payout) || payout <= 0) {
        return endGame(false, 0, 0, nc, ns, guess, interaction);
      }
      return endGame(true, payout, mult, nc, ns, guess, interaction);
    });

    collector.on('end', () => { if (!gameOver) { gameOver = true; msg.edit({ components: [] }).catch(() => {}); } });
  }
};
