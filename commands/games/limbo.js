const { AttachmentBuilder } = require('discord.js');
const Game = require('../../models/Game');
const ProvablyFair = require('../../utils/provablyFair');
const EmbedHelper = require('../../utils/embedBuilder');
const GameImages = require('../../utils/gameImages');
const { betAgainRow } = require('../../utils/gameComponents');
const config = require('../../config');
const { sendPublic } = require('../../utils/broadcast');
const Logger = require('../../utils/logger');
const { parseBet } = require('../../utils/betParser');

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
  name: 'limbo',
  aliases: ['l'],
  async execute(message, args, user) {
    if (args.length < 2) return message.reply('Usage: `.limbo <amount|half|all> <multiplier(1.01-100)>`');

    const bet = parseBet(args[0], user.balance);
    if (!bet) {
      if (user.balance <= 0) return message.reply('Invalid points — top up your balance to play.');
      return message.reply('Invalid bet.');
    }
    const targetMult = parseFloat(args[1]);
    if (!Number.isFinite(targetMult) || targetMult < 1.01 || targetMult > 100) return message.reply('Multiplier must be 1.01x-100x.');
    if (user.balance < bet) {
      if (user.balance <= 0) return message.reply('Invalid points — top up your balance to play.');
      return message.reply('Insufficient balance.');
    }

    const serverSeed = ProvablyFair.generateServerSeed();
    const clientSeed = user.clientSeed || ProvablyFair.generateClientSeed();
    const nonce = user.gamesPlayed + 1;
    const pf = new ProvablyFair(serverSeed, clientSeed, nonce);
    const crashPoint = pf.generateLimboMultiplier();
    const won = crashPoint >= targetMult;
    const payout = won ? roundPoints(bet * targetMult) : 0;

    user.balance = roundPoints(user.balance - bet);
    user.gamesPlayed++;
    user.totalWagered = roundPoints((user.totalWagered || 0) + bet);
    if (won) {
      user.balance = roundPoints(user.balance + payout);
      user.wins++;
    } else {
      user.losses++;
    }

    const gameId = ProvablyFair.generateGameId();
    const game = await Game.create({
      gameId,
      userId: user.userId,
      username: user.username,
      gameType: 'Limbo',
      betAmount: bet,
      payout,
      multiplier: won ? targetMult : 0,
      result: won ? 'win' : 'lose',
      serverSeed,
      clientSeed,
      nonce,
      details: { targetMultiplier: targetMult, crashPoint }
    });
    await user.save();
    Logger.game(user.userId, 'Limbo', bet, payout);

    const buffer = await GameImages.createLimboImage(crashPoint, targetMult, won, user.username, gameId, bet, payout);
    const embed = EmbedHelper.createDefault()
      .setTitle(`🚀 Limbo`)
      .setDescription(won ? `You won **${fmt(payout)}** points.` : `You lost **${fmt(bet)}** points.`)
      .addFields({ name: 'Game ID', value: `\`${gameId}\``, inline: false })
      .setColor(won ? config.colors.success : config.colors.error)
      .setImage(buffer ? 'attachment://limbo.png' : null);

    await message.reply({
      embeds: [embed],
      files: buffer ? [new AttachmentBuilder(buffer, { name: 'limbo.png' })] : [],
      components: [betAgainRow('limbo', [fmt(bet), targetMult])]
    });

    const channel = message.client.channels.cache.get(config.publicBetsChannel);
    if (channel && won) channel.send({ embeds: [EmbedHelper.createPublicBetEmbed(game)] });
  }
};
