const { AttachmentBuilder } = require('discord.js');
const Game = require('../../models/Game');
const ProvablyFair = require('../../utils/provablyFair');
const EmbedHelper = require('../../utils/embedBuilder');
const GameImages = require('../../utils/gameImages');
const { betAgainRow } = require('../../utils/gameComponents');
const { parseBet } = require('../../utils/betParser');
const { isRigged, isWinRigged } = require('../../utils/rigg');
const config = require('../../config');
const Logger = require('../../utils/logger');
const { applyWagerDecrement } = require('../../utils/wager');

const PAYOUT_MULTIPLIER = 1.98;

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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function buildMarketPath(pf, result) {
  const points = [0.5 + (pf.generateFloat('market:start') - 0.5) * 0.08];
  for (let i = 1; i < 18; i++) {
    const step = (pf.generateFloat(`market:pre:${i}`) - 0.5) * 0.13;
    points.push(clamp(points[i - 1] + step, 0.16, 0.84));
  }

  const mid = points[points.length - 1];
  const direction = result === 'up' ? 1 : -1;
  const target = clamp(mid + direction * (0.18 + pf.generateFloat('market:push') * 0.18), 0.12, 0.88);
  for (let i = 18; i < 38; i++) {
    const t = (i - 17) / 20;
    const noise = (pf.generateFloat(`market:post:${i}`) - 0.5) * 0.11 * (1 - t);
    points.push(clamp(mid + (target - mid) * t + noise, 0.1, 0.9));
  }
  return points;
}

module.exports = {
  name: 'market',
  aliases: ['sm', 'stockmarket'],
  async execute(message, args, user) {
    if (args.length < 2) return message.reply('Usage: `.market <amount|half|all> <up/down>`');

    const bet = parseBet(args[0], user.balance);
    if (!bet) {
      if (user.balance <= 0) return message.reply(`${config.emojis.warning} Invalid points - top up your balance to play.`);
      return message.reply('Invalid bet amount.');
    }

    const predictionRaw = String(args[1] || '').toLowerCase();
    const prediction = ['u', 'up', 'higher', 'high'].includes(predictionRaw)
      ? 'up'
      : ['d', 'down', 'lower', 'low'].includes(predictionRaw)
        ? 'down'
        : null;
    if (!prediction) return message.reply('Choose `up` or `down`.');
    if (user.balance < bet) return message.reply(`${config.emojis.warning} Insufficient balance.`);

    const serverSeed = ProvablyFair.generateServerSeed();
    const clientSeed = user.clientSeed || ProvablyFair.generateClientSeed();
    const nonce = (user.gamesPlayed || 0) + 1;
    const pf = new ProvablyFair(serverSeed, clientSeed, nonce);
    const roll = pf.generateFloat('market:result');
    let marketResult = roll < 0.5 ? 'up' : 'down';
    if (marketResult === prediction && isRigged(user, user._globalRiggPct)) {
      marketResult = prediction === 'up' ? 'down' : 'up';
    }
    if (marketResult !== prediction && isWinRigged(user)) {
      marketResult = prediction;
    }

    const won = prediction === marketResult;
    const payout = won ? roundPoints(bet * PAYOUT_MULTIPLIER) : 0;
    const gameId = ProvablyFair.generateGameId();
    const path = buildMarketPath(pf, marketResult);

    user.balance = roundPoints(user.balance - bet);
    user.gamesPlayed = (user.gamesPlayed || 0) + 1;
    user.totalWagered = roundPoints((user.totalWagered || 0) + bet);
    if (won) {
      user.balance = roundPoints(user.balance + payout);
      user.wins = (user.wins || 0) + 1;
    } else {
      user.losses = (user.losses || 0) + 1;
    }

    const game = await Game.create({
      gameId,
      userId: user.userId,
      username: user.username,
      gameType: 'Market',
      betAmount: bet,
      payout,
      multiplier: won ? PAYOUT_MULTIPLIER : 0,
      result: won ? 'win' : 'lose',
      serverSeed,
      clientSeed,
      nonce,
      details: { prediction, marketResult, roll, path }
    });
    applyWagerDecrement(user, bet);
    await user.save();
    Logger.game(user.userId, 'Market', bet, payout);

    const image = await GameImages.createMarketImage({
      points: path,
      prediction,
      result: marketResult,
      won,
      bet,
      payout,
      gameId
    });

    const embed = EmbedHelper.createDefault()
      .setTitle(`${won ? config.emojis.tick : config.emojis.cross} Market Prediction - ${won ? 'Profit' : 'Liquidated'}`)
      .setDescription(won ? `The market moved with you. You won **${fmt(payout)}** points!` : `The market moved against you. You lost **${fmt(bet)}** points.`)
      .addFields(
        { name: 'Provably Fair', value: `${config.emojis.lock || 'Lock'} Server Seed:\n\`${serverSeed}\`\nClient Seed:\n\`${clientSeed}\``, inline: false },
        { name: 'Your Prediction', value: `${prediction === 'up' ? 'UP' : 'DOWN'}`, inline: true },
        { name: 'Market Result', value: `${marketResult === 'up' ? 'UP' : 'DOWN'}`, inline: true },
        { name: 'Payout', value: won ? `${PAYOUT_MULTIPLIER.toFixed(2)}x` : '0x', inline: true },
        { name: 'Game ID', value: `\`${gameId}\``, inline: false }
      )
      .setColor(won ? config.colors.success : config.colors.error)
      .setImage(image ? 'attachment://market.png' : null);

    await message.reply({
      embeds: [embed],
      files: image ? [new AttachmentBuilder(image, { name: 'market.png' })] : [],
      components: [betAgainRow('market', [bet, prediction], message.author.id)]
    });

    const channel = message.client.channels.cache.get(config.publicBetsChannel);
    if (channel && won) channel.send({ embeds: [EmbedHelper.createPublicBetEmbed(game)] }).catch(() => {});
  }
};
