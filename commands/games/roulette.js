const Game = require('../../models/Game');
const ProvablyFair = require('../../utils/provablyFair');
const EmbedHelper = require('../../utils/embedBuilder');
const GameImages = require('../../utils/gameImages');
const { betAgainRow } = require('../../utils/gameComponents');
const config = require('../../config');
const { sendPublic } = require('../../utils/broadcast');
const Logger = require('../../utils/logger');
const { parseBet } = require('../../utils/betParser');

module.exports = {
  name: 'roulette',
  aliases: ['roul', 'rl'],
  async execute(message, args, user) {
    if (args.length < 2) return message.reply(`${config.emojis.warning} Usage: \`.roulette <amount|half|all> <type>\`\nTypes: \`red\`, \`black\`, \`green\`, \`odd\`, \`even\`, \`1-18\`, \`19-36\`, \`<0-36>\``);

    const bet = parseBet(args[0], user.balance);
    if (!bet) {
      if (user.balance <= 0) return message.reply(`${config.emojis.warning} Invalid points — top up your balance to play.`);
      return message.reply(`${config.emojis.warning} Invalid bet.`);
    }
    const betType = args[1] ? args[1].toLowerCase() : '';
    if (user.balance < bet) {
      if (user.balance <= 0) return message.reply(`${config.emojis.warning} Invalid points — top up your balance to play.`);
      return message.reply(`${config.emojis.warning} Insufficient balance.`);
    }

    const serverSeed = ProvablyFair.generateServerSeed();
    const clientSeed = user.clientSeed || ProvablyFair.generateClientSeed();
    const nonce = user.gamesPlayed + 1;
    const pf = new ProvablyFair(serverSeed, clientSeed, nonce);
    const number = pf.generateInt(0, 36);
    const redN = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
    const color = number === 0 ? 'green' : redN.includes(number) ? 'red' : 'black';

    const bets = {
      'red': { c: color === 'red', m: 2 }, 'black': { c: color === 'black', m: 2 },
      'green': { c: color === 'green', m: 14 }, 'odd': { c: number % 2 !== 0 && number !== 0, m: 2 },
      'even': { c: number % 2 === 0 && number !== 0, m: 2 },
      '1-18': { c: number >= 1 && number <= 18, m: 2 }, '19-36': { c: number >= 19 && number <= 36, m: 2 }
    };

    let won = false, mult = 0;
    const numBet = parseInt(betType);
    if (!isNaN(numBet) && numBet >= 0 && numBet <= 36) { won = numBet === number; mult = won ? 36 : 0; }
    else if (bets[betType]) { won = bets[betType].c; mult = bets[betType].m; }
    else return message.reply(`${config.emojis.warning} Invalid bet type.`);

    const payout = won ? Math.floor(bet * mult) : 0;
    user.balance -= bet; user.gamesPlayed++; user.totalWagered += bet;
    if (won) { user.balance += payout; user.wins++; } else user.losses++;
    const gameId = ProvablyFair.generateGameId();
    const game = new Game({
      gameId, userId: user.userId, username: user.username,
      gameType: 'Roulette', betAmount: bet, payout, multiplier: mult,
      result: won ? 'win' : 'lose', serverSeed, clientSeed, nonce,
      details: { number, color, betType }
    });
    await game.save(); await user.save();

    const buffer = await GameImages.createRouletteImage(number, color, won, user.username, gameId);
    const { AttachmentBuilder } = require('discord.js');
    const embed = EmbedHelper.createDefault()
      .setTitle(`${config.emojis.highroller} Roulette`)
      .setDescription(`Ball landed on **${number} ${color}**`)
      .addFields(
        { name: 'Bet', value: `\`${betType}\` • ${bet} pts`, inline: true },
        { name: 'Payout', value: won ? `+${payout} pts` : '0 pts', inline: true },
        { name: 'Game ID', value: `\`${gameId}\``, inline: false }
      )
      .setColor(won ? config.colors.success : config.colors.error)
      .setThumbnail(message.author.displayAvatarURL())
      .setImage(buffer ? 'attachment://roulette.png' : null)
      .setFooter({ text: `Flipbets • Game ID: ${gameId}` });

    message.reply({
      embeds: [embed],
      files: buffer ? [new AttachmentBuilder(buffer, { name: 'roulette.png' })] : [],
      components: [betAgainRow('roulette', [bet, betType])]
    }).then(() => {
      const channel = message.client.channels.cache.get(config.publicBetsChannel);
      if (channel && won) channel.send({ embeds: [EmbedHelper.createPublicBetEmbed(game)] });
    });
  }
};
