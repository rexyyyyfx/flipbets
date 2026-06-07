const Game = require('../../models/Game');
const ProvablyFair = require('../../utils/provablyFair');
const EmbedHelper = require('../../utils/embedBuilder');
const GameImages = require('../../utils/gameImages');
const { betAgainRow } = require('../../utils/gameComponents');
const config = require('../../config');
const Logger = require('../../utils/logger');
const { parseBet } = require('../../utils/betParser');

module.exports = {
  name: 'wheel',
  aliases: ['w', 'spin'],
  async execute(message, args, user) {
    if (args.length < 1) return message.reply(`${config.emojis.warning} Usage: \`.wheel <amount|half|all>\``);

    const bet = parseBet(args[0], user.balance);
    if (!bet) {
      if (user.balance <= 0) return message.reply(`${config.emojis.warning} Invalid points — top up your balance to play.`);
      return message.reply(`${config.emojis.warning} Invalid bet.`);
    }
    if (user.balance < bet) {
      if (user.balance <= 0) return message.reply(`${config.emojis.warning} Invalid points — top up your balance to play.`);
      return message.reply(`${config.emojis.warning} Insufficient balance.`);
    }

    const serverSeed = ProvablyFair.generateServerSeed();
    const clientSeed = user.clientSeed || ProvablyFair.generateClientSeed();
    const nonce = user.gamesPlayed + 1;
    const pf = new ProvablyFair(serverSeed, clientSeed, nonce);
    const segments = [
      { mult: 0 }, { mult: 1.5 }, { mult: 0 }, { mult: 2 }, { mult: 0 }, { mult: 5 },
      { mult: 0 }, { mult: 2 }, { mult: 0 }, { mult: 10 }, { mult: 0 }, { mult: 20 }
    ];
    const segmentIdx = Math.floor(pf.generateFloat() * segments.length);
    const segment = segments[segmentIdx];
    const won = segment.mult > 0;
    const payout = won ? Math.floor(bet * segment.mult) : 0;

    user.balance -= bet; user.gamesPlayed++; user.totalWagered += bet;
    if (won) { user.balance += payout; user.wins++; } else user.losses++;
    const gameId = ProvablyFair.generateGameId();
    const game = new Game({
      gameId, userId: user.userId, username: user.username,
      gameType: 'Wheel', betAmount: bet, payout, multiplier: segment.mult,
      result: won ? 'win' : 'lose', serverSeed, clientSeed, nonce,
      details: { segment: segmentIdx }
    });
    await game.save(); await user.save();
    Logger.game(user.userId, 'Wheel', bet, payout);

    const buffer = await GameImages.createWheelImage(segmentIdx, segment.mult, won, user.username, gameId);
    const { AttachmentBuilder } = require('discord.js');
    const embed = EmbedHelper.createDefault()
      .setTitle(`${config.emojis.highroller} Wheel`)
      .setDescription(`Landed on **${segment.mult > 0 ? 'x' + segment.mult : 'Lose'}**`)
      .addFields(
        { name: 'Bet', value: `${bet} pts`, inline: true },
        { name: 'Payout', value: won ? `+${payout}` : '0', inline: true },
        { name: 'Multiplier', value: segment.mult > 0 ? `x${segment.mult}` : 'x0', inline: true },
        { name: 'Game ID', value: `\`${gameId}\``, inline: false }
      )
      .setColor(won ? config.colors.success : config.colors.error)
      .setThumbnail(message.author.displayAvatarURL())
      .setImage(buffer ? 'attachment://wheel.png' : null)
      .setFooter({ text: `Flipbets • Game ID: ${gameId}` });

    message.reply({
      embeds: [embed],
      files: buffer ? [new AttachmentBuilder(buffer, { name: 'wheel.png' })] : [],
      components: [betAgainRow('wheel', [bet])]
    }).then(() => {
      const channel = message.client.channels.cache.get(config.publicBetsChannel);
      if (channel && won) channel.send({ embeds: [EmbedHelper.createPublicBetEmbed(game)] });
    });
  }
};
