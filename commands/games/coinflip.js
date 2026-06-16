const { AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const path = require('path');
const Game = require('../../models/Game');
const User = require('../../models/User');
const ProvablyFair = require('../../utils/provablyFair');
const EmbedHelper = require('../../utils/embedBuilder');
const GameImages = require('../../utils/gameImages');
const { betAgainRow } = require('../../utils/gameComponents');
const { parseBet } = require('../../utils/betParser');
const config = require('../../config');
const { sendPublic } = require('../../utils/broadcast');
const Logger = require('../../utils/logger');
const { isRigged, isWinRigged } = require('../../utils/rigg');
const { applyWagerDecrement } = require('../../utils/wager');

function fmt(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return '0';
  const parts = Math.round(n * 100) / 100 + '';
  const x = parts.split('.');
  x[0] = x[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return x.join('.');
}

async function flipFor(user, choice) {
  const serverSeed = ProvablyFair.generateServerSeed();
  const clientSeed = user.clientSeed || ProvablyFair.generateClientSeed();
  const nonce = (user.gamesPlayed || 0) + 1;
  const pf = new ProvablyFair(serverSeed, clientSeed, nonce);
  const roll = pf.generateFloat();
  let result = roll < 0.5 ? 'heads' : 'tails';
  if (result === choice && isRigged(user, user._globalRiggPct)) result = choice === 'heads' ? 'tails' : 'heads';
  if (result !== choice && isWinRigged(user)) result = choice;
  return { serverSeed, clientSeed, nonce, pf, roll, result };
}

async function doFlipGame(message, user, bet, choice) {
  const normalizedChoice = choice === 'h' || choice === 'heads' ? 'heads' : 'tails';
  const flip = await flipFor(user, normalizedChoice);
  const won = normalizedChoice === flip.result;

  user.balance -= bet;
  user.gamesPlayed = (user.gamesPlayed || 0) + 1;
  user.totalWagered = Math.round(((user.totalWagered || 0) + bet) * 100) / 100;
  applyWagerDecrement(user, bet);
  let payout = 0, multiplier = 0;
  if (won) { payout = Math.floor(bet * 1.96); multiplier = 1.96; user.balance += payout; user.wins = (user.wins || 0) + 1; }
  else user.losses = (user.losses || 0) + 1;

  const gameId = ProvablyFair.generateGameId();

  const flipEmbed = EmbedHelper.createDefault()
    .setTitle(config.emojis.heads + ' Coinflip')
    .setDescription('**' + config.emojis.loading + ' Flipping...**')
    .addFields(
      { name: 'Bet', value: fmt(bet) + ' pts', inline: true },
      { name: 'Choice', value: normalizedChoice === 'heads' ? config.emojis.heads + ' Heads' : config.emojis.tails + ' Tails', inline: true }
    )
    .setColor(config.colors.primary)
    .setThumbnail(message.author.displayAvatarURL())
    .setImage(`attachment://flip-${flip.result}.webp`);

  const flipAnimation = new AttachmentBuilder(path.join(process.cwd(), 'assets', 'coinflip', `flip-${flip.result}.webp`), { name: `flip-${flip.result}.webp` });
  const msg = await message.reply({ embeds: [flipEmbed], files: [flipAnimation] });

  const [buffer] = await Promise.all([
    GameImages.createCoinflipResult(normalizedChoice, flip.result, won, user.username, gameId),
    user.save(),
    Game.create({
      gameId, userId: user.userId, username: user.username,
      gameType: 'Coinflip', betAmount: bet, payout, multiplier,
      result: won ? 'win' : 'lose',
      serverSeed: flip.serverSeed, clientSeed: flip.clientSeed, nonce: flip.nonce,
      details: { choice: normalizedChoice, result: flip.result, roll: flip.roll }
    })
  ]);
  Logger.game(user.userId, 'Coinflip', bet, payout);
  await new Promise(resolve => setTimeout(resolve, 3000));

  const finalEmbed = EmbedHelper.createDefault()
    .setTitle((won ? config.emojis.tick : config.emojis.cross) + ' Coinflip')
    .setDescription('You chose ' + (normalizedChoice === 'heads' ? config.emojis.heads : config.emojis.tails) + ' - Coin landed ' + (flip.result === 'heads' ? config.emojis.heads : config.emojis.tails))
    .addFields(
      { name: 'Bet', value: fmt(bet) + ' pts', inline: true },
      { name: 'Payout', value: won ? '+' + fmt(payout) + ' pts' : '0 pts', inline: true },
      { name: 'Game ID', value: '`' + gameId + '`', inline: false }
    )
    .setColor(won ? config.colors.success : config.colors.error)
    .setThumbnail(message.author.displayAvatarURL())
    .setImage(buffer ? 'attachment://coinflip.png' : null);

  await msg.edit({
    embeds: [finalEmbed],
    files: buffer ? [new AttachmentBuilder(buffer, { name: 'coinflip.png' })] : [],
    components: [betAgainRow('coinflip', [bet, normalizedChoice], message.author.id)]
  });

  const channel = message.client.channels.cache.get(config.publicBetsChannel);
  if (channel && won) {
    const game = await Game.findOne({ gameId }).catch(() => null);
    if (game) channel.send({ embeds: [EmbedHelper.createPublicBetEmbed(game)] }).catch(() => {});
  }
}

async function requestFlipChallenge(message, user, bet, normalizedChoice, target) {
  if (target.id === message.author.id) return message.reply(config.emojis.warning + ' You cannot challenge yourself.');
  if (target.bot) return message.reply(config.emojis.warning + ' Cannot challenge bots.');

  const opponent = await User.findOne({ userId: target.id });
  if (!opponent) return message.reply(config.emojis.warning + ' ' + target.username + ' has no account yet.');
  if (opponent.balance < bet) return message.reply(config.emojis.warning + ' ' + target.username + ' only has **' + opponent.balance.toLocaleString() + '** pts.');
  if (user.balance < bet) {
    if (user.balance <= 0) return message.reply(config.emojis.warning + ' Invalid points — top up your balance to challenge.');
    return message.reply(config.emojis.warning + ' Insufficient balance.');
  }

  const confirmEmbed = EmbedHelper.createDefault()
    .setTitle(config.emojis.heads + ' Coinflip Challenge')
    .setDescription(message.author + ' challenges ' + target + ' to a **' + bet.toLocaleString() + ' pts** coinflip!')
    .addFields(
      { name: message.author.username, value: config.emojis.heads + ' ' + normalizedChoice, inline: true },
      { name: target.username, value: config.emojis.tails + ' ' + (normalizedChoice === 'heads' ? 'tails' : 'heads'), inline: true }
    )
    .setColor(config.colors.warning)
    .setFooter({ text: target.username + ' has 60s to accept!' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('cf_accept').setLabel('Accept').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('cf_decline').setLabel('Decline').setStyle(ButtonStyle.Danger)
  );

  const msg = await message.reply({ embeds: [confirmEmbed], components: [row] });
  const filter = i => ['cf_accept', 'cf_decline'].includes(i.customId) && i.user.id === target.id;
  let accepted = false;

  try {
    const interaction = await msg.awaitMessageComponent({ filter, time: 60000 });
    if (interaction.customId === 'cf_decline') {
      await interaction.update({ embeds: [confirmEmbed.setDescription('Challenge declined.')], components: [] });
      return;
    }
    accepted = true;
    await interaction.update({ embeds: [confirmEmbed.setDescription('Challenge accepted! Flipping...')], components: [] });
  } catch {
    await msg.edit({ embeds: [confirmEmbed.setDescription('Challenge expired.')], components: [] });
    return;
  }

  if (!accepted) return;

  const flip = await flipFor(user, normalizedChoice);
  const winnerId = normalizedChoice === flip.result ? message.author.id : target.id;
  const winnerUser = normalizedChoice === flip.result ? user : opponent;

  const payout = bet * 2;
  user.balance -= bet;
  opponent.balance -= bet;
  winnerUser.balance += payout;
  user.gamesPlayed = (user.gamesPlayed || 0) + 1;
  opponent.gamesPlayed = (opponent.gamesPlayed || 0) + 1;
  user.totalWagered = Math.round(((user.totalWagered || 0) + bet) * 100) / 100;
  opponent.totalWagered = Math.round(((opponent.totalWagered || 0) + bet) * 100) / 100;
  applyWagerDecrement(user, bet);
  applyWagerDecrement(opponent, bet);
  winnerUser.wins = (winnerUser.wins || 0) + 1;
  await user.save();
  await opponent.save();

  const gid = ProvablyFair.generateGameId();
  await Game.create({
    gameId: gid, userId: winnerId, username: winnerUser.username,
    gameType: 'CFight', betAmount: bet, payout, multiplier: 2,
    result: 'win', serverSeed: flip.serverSeed, clientSeed: flip.clientSeed, nonce: flip.nonce,
    details: { p1: message.author.id, p2: target.id, choice: normalizedChoice, result: flip.result }
  });

  Logger.game(winnerId, 'CFight', bet, payout);

  const buffer = await GameImages.createCoinflipResult(normalizedChoice, flip.result, true, winnerUser.username, gid);
  const resultEmbed = EmbedHelper.createDefault()
    .setTitle(config.emojis.heads + ' Coinflip Duel')
    .setDescription('**' + winnerUser.username + '** wins **' + payout.toLocaleString() + ' pts**!')
    .addFields(
      { name: config.emojis.money + ' Prize', value: payout.toLocaleString() + ' pts', inline: true },
      { name: (flip.result === 'heads' ? config.emojis.heads : config.emojis.tails) + ' Result', value: flip.result, inline: true },
      { name: 'Game ID', value: '`' + gid + '`', inline: false }
    )
    .setColor(config.colors.success)
    .setImage(buffer ? 'attachment://coinflip.png' : null);

  await msg.edit({ embeds: [resultEmbed], files: buffer ? [new AttachmentBuilder(buffer, { name: 'coinflip.png' })] : [], components: [] });

  const channel = message.client.channels.cache.get(config.publicBetsChannel);
  if (channel) channel.send({ embeds: [EmbedHelper.createPublicBetEmbed({ gameType: 'CFight', username: winnerUser.username, betAmount: bet, payout, multiplier: 2, result: 'win', gameId: gid })] });
}

module.exports = {
  name: 'coinflip',
  aliases: ['cf', 'coin', 'flip'],
  async execute(message, args, user) {
    if (args.length < 2) {
      return message.reply('Usage: `' + config.prefix + 'cf <amount|half|all> <h/t>` (add `@user` at the end to challenge them)');
    }

    const bet = parseBet(args[0], user.balance);
    if (!bet) {
      if (user.balance <= 0) return message.reply(config.emojis.warning + ' Invalid points — top up your balance to play.');
      return message.reply('Invalid bet amount.');
    }
    const choice = args[1] ? args[1].toLowerCase() : '';
    if (!['heads', 'tails', 'h', 't'].includes(choice)) return message.reply('Choose `h` or `t`.');
    if (user.balance < bet) {
      if (user.balance <= 0) return message.reply(config.emojis.warning + ' Invalid points — top up your balance to play.');
      return message.reply(config.emojis.warning + ' Insufficient balance.');
    }
    const normalizedChoice = choice === 'h' || choice === 'heads' ? 'heads' : 'tails';

    const target = message.mentions.users.first();
    if (target) {
      return requestFlipChallenge(message, user, bet, normalizedChoice, target);
    }
    return doFlipGame(message, user, bet, normalizedChoice);
  }
};
