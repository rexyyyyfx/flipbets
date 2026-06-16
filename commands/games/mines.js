const { parseBet } = require('../../utils/betParser');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const Game = require('../../models/Game');
const User = require('../../models/User');
const ProvablyFair = require('../../utils/provablyFair');
const EmbedHelper = require('../../utils/embedBuilder');
const { betAgainRow } = require('../../utils/gameComponents');
const config = require('../../config');
const { sendPublic } = require('../../utils/broadcast');
const Logger = require('../../utils/logger');
const { isRigged } = require('../../utils/rigg');
const { applyWagerDecrement } = require('../../utils/wager');

function roundPoints(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function fmt(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return '0';
  const parts = Math.round(n * 100) / 100 + '';
  const x = parts.split('.');
  x[0] = x[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return x.join('.');
}

module.exports = {
  name: 'mines',
  aliases: ['mine', 'm'],
  async execute(message, args, user) {
    if (args.length < 1) return message.reply('Usage: `.mines <bet> [mines(1-10)]`');

    const bet = parseBet(args[0], user.balance);
    if (!bet) {
      if (user.balance <= 0) return message.reply('Invalid points — top up your balance to play.');
      return message.reply('Invalid bet. Use `.mines <amount|half|all> <bombs>`');
    }
    const bombCount = args[1] === undefined ? 3 : parseInt(args[1], 10);
    if (!Number.isInteger(bombCount) || bombCount < 1 || bombCount > 10) return message.reply('Mines must be 1-10.');
    if (user.balance < bet) {
      if (user.balance <= 0) return message.reply('Invalid points — top up your balance to play.');
      return message.reply('Insufficient balance.');
    }

    const width = 5, height = 5, totalTiles = 25;
    const serverSeed = ProvablyFair.generateServerSeed();
    const clientSeed = user.clientSeed || ProvablyFair.generateClientSeed();
    const nonce = user.gamesPlayed + 1;
    const pf = new ProvablyFair(serverSeed, clientSeed, nonce);
    const minePositions = pf.generateMinesPositions(width, height, bombCount);
    const _rigged = isRigged(user, user._globalRiggPct);
    if (_rigged) {
      for (let i = 0; i < totalTiles; i++) {
        if (!minePositions.includes(i)) { minePositions.push(i); break; }
      }
    }
    const gameId = ProvablyFair.generateGameId();

    user.balance = roundPoints(user.balance - bet);
    user.gamesPlayed++;
    user.totalWagered = roundPoints((user.totalWagered || 0) + bet);
    applyWagerDecrement(user, bet);
    await user.save();

    let game = await Game.create({
      gameId, userId: user.userId, username: user.username,
      gameType: 'Mines', betAmount: bet, payout: 0, multiplier: 1,
      result: 'pending', serverSeed, clientSeed, nonce,
      details: { bombCount, minePositions, revealed: [] }
    });

    function currentMultiplier(revealed) {
      const safe = totalTiles - bombCount;
      const shown = revealed.filter(idx => !minePositions.includes(idx)).length;
      if (shown <= 0) return 1;
      return 0.95 * Math.pow(safe / Math.max(1, safe - shown), bombCount + 1);
    }

    function buildGrid(revealed, disabled = false) {
      const rows = [];
      for (let y = 0; y < height; y++) {
        const row = new ActionRowBuilder();
        for (let x = 0; x < width; x++) {
          const idx = y * width + x;
          const isRevealed = revealed.includes(idx);
          const isMine = minePositions.includes(idx);
          const btn = new ButtonBuilder()
            .setCustomId(`m_${gameId}_${idx}`)
            .setStyle(isRevealed ? (isMine ? ButtonStyle.Danger : ButtonStyle.Success) : ButtonStyle.Secondary)
            .setDisabled(disabled || isRevealed);
          if (isRevealed) {
            btn.setEmoji(isMine ? '💣' : '💎');
          } else {
            btn.setLabel('\u200b');
          }
          row.addComponents(btn);
        }
        rows.push(row);
      }
      return rows;
    }

    function buildEmbed(revealed, over = false, won = false) {
      const safe = totalTiles - bombCount;
      const shown = revealed.filter(idx => !minePositions.includes(idx)).length;
      const mult = currentMultiplier(revealed);
      const payout = roundPoints(bet * mult);
      const fields = [
        { name: 'Bet', value: `${fmt(bet)} pts`, inline: true },
        { name: 'Mines', value: `${bombCount}`, inline: true },
        { name: 'Revealed', value: `${shown}/${safe}`, inline: true },
        { name: 'Multiplier', value: `${mult.toFixed(2)}x`, inline: true },
        { name: 'Cashout', value: `${fmt(payout)} pts`, inline: true }
      ];
      if (over) fields.push({ name: 'Game ID', value: `\`${gameId}\``, inline: false });
      return EmbedHelper.createDefault()
        .setTitle(over ? (won ? `${config.emojis.money} Mines - Cashed Out` : `${config.emojis.bombBlasted} Mines - BOOM`) : `${config.emojis.gem} Mines`)
        .setDescription(over ? (won ? `${config.emojis.tick} You won **${fmt(payout)}** points.` : `${config.emojis.cross} You lost **${fmt(bet)}** points.`) : `${config.emojis.money} Click safe tiles. React with ${config.emojis.money} to cash out.`)
        .addFields(fields)
        .setColor(over ? (won ? config.colors.success : config.colors.error) : config.colors.primary);
    }

    const msg = await message.reply({ embeds: [buildEmbed([])], components: buildGrid([]) });
    await msg.react('💰');

    let gameOver = false;
    let revealed = [];

    const collector = msg.createMessageComponentCollector({ time: 300000 });
    const reactionCollector = msg.createReactionCollector({
      time: 300000,
      filter: (r, u) => u.id === message.author.id
    });

    async function finish(won, finalRevealed, interaction = null) {
      if (gameOver) return;
      gameOver = true;
      collector.stop();
      reactionCollector.stop();
      await msg.reactions.removeAll().catch(() => {});

      const mult = currentMultiplier(finalRevealed);
      const payout = won ? roundPoints(bet * mult) : 0;
      const freshUser = await User.findOne({ userId: user.userId });
      if (won) { freshUser.balance = roundPoints(freshUser.balance + payout); freshUser.wins++; }
      else freshUser.losses++;
      applyWagerDecrement(freshUser, bet);
      await freshUser.save();

      game.result = won ? 'win' : 'lose';
      game.payout = payout;
      game.multiplier = won ? mult : 0;
      game.details.revealed = finalRevealed;
      game.markModified('details');
      await game.save();
      Logger.game(user.userId, 'Mines', bet, payout);

      const payload = { embeds: [buildEmbed(finalRevealed, true, won)], components: [betAgainRow('mines', [bet, bombCount], message.author.id)] };
      if (interaction) await interaction.editReply(payload).catch(() => {});
      else await msg.edit(payload).catch(() => {});

      if (won) {
        const channel = message.client.channels.cache.get(config.publicBetsChannel);
        if (channel) channel.send({ embeds: [EmbedHelper.createPublicBetEmbed(game)] }).catch(() => {});
      }
    }

    collector.on('collect', async (interaction) => {
      try {
        if (interaction.user.id !== message.author.id) return interaction.reply({ content: 'Not your game.', flags: MessageFlags.Ephemeral });
        if (gameOver) return interaction.deferUpdate();
        await interaction.deferUpdate();

        const parts = interaction.customId.split('_');
        const tileIdx = parseInt(parts[2], 10);
        if (!Number.isInteger(tileIdx) || tileIdx < 0 || tileIdx >= totalTiles) return interaction.editReply({ content: 'Invalid tile.' }).catch(() => {});

        game = await Game.findOne({ gameId });
        if (!game || game.result !== 'pending') return interaction.editReply({ content: 'Game already finished.' }).catch(() => {});

        const curr = game.details.revealed || [];
        revealed = Array.from(new Set([...curr, tileIdx]));
        game.details.revealed = revealed;
        game.markModified('details');

        if (_rigged && revealed.length === 1 && !minePositions.includes(tileIdx)) {
          minePositions.push(tileIdx);
        }
        if (minePositions.includes(tileIdx)) {
          await game.save();
          return finish(false, revealed, interaction);
        }

        game.multiplier = currentMultiplier(revealed);
        await game.save();
        await interaction.editReply({ embeds: [buildEmbed(revealed)], components: buildGrid(revealed) });
      } catch (err) {
        Logger.error(`Mines button error: ${err.message} | ${err.stack?.split('\n')[1]?.trim() || ''}`);
        try { await interaction.editReply({ content: `${config.emojis.warning} Error. Try again.`, embeds: [], components: [] }); } catch {}
      }
    });

    reactionCollector.on('collect', async (reaction, rUser) => {
      try {
        if (gameOver || rUser.id !== message.author.id) return;
        if (reaction.partial) await reaction.fetch();
        if (reaction.emoji.name !== '💰') return;

        game = await Game.findOne({ gameId });
        if (!game || game.result !== 'pending') return;
        const curr = game.details.revealed || [];
        const safeCount = curr.filter(idx => !minePositions.includes(idx)).length;
        if (safeCount === 0) {
          const temp = await message.reply('Reveal at least 1 safe tile first.');
          setTimeout(() => temp.delete().catch(() => {}), 3000);
          return;
        }
        return finish(true, curr);
      } catch (err) {
        Logger.error(`Mines reaction error: ${err.message}`);
      }
    });

    collector.on('end', () => {
      if (!gameOver) {
        gameOver = true;
        msg.edit({ components: [] }).catch(() => {});
      }
    });
  }
};
