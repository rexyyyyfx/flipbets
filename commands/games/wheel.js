const Game = require('../../models/Game');
const ProvablyFair = require('../../utils/provablyFair');
const EmbedHelper = require('../../utils/embedBuilder');
const GameImages = require('../../utils/gameImages');
const { betAgainRow } = require('../../utils/gameComponents');
const config = require('../../config');
const { sendPublic } = require('../../utils/broadcast');
const Logger = require('../../utils/logger');
const { parseBet } = require('../../utils/betParser');
const { isRigged, isWinRigged } = require('../../utils/rigg');
const { applyWagerDecrement } = require('../../utils/wager');

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
      { mult: 0, weight: 73 }, { mult: 1.2, weight: 320 }, { mult: 0, weight: 73 }, { mult: 1.5, weight: 120 },
      { mult: 0, weight: 73 }, { mult: 2, weight: 60 }, { mult: 0, weight: 73 }, { mult: 3, weight: 30 },
      { mult: 0, weight: 73 }, { mult: 5, weight: 27 }, { mult: 0, weight: 73 }, { mult: 10, weight: 5 }
    ];
    const totalWeight = segments.reduce((sum, s) => sum + s.weight, 0);
    let rollWeight = pf.generateFloat() * totalWeight;
    let segmentIdx = 0;
    for (let i = 0; i < segments.length; i++) {
      rollWeight -= segments[i].weight;
      if (rollWeight <= 0) { segmentIdx = i; break; }
    }
    let segment = segments[segmentIdx];
    if (segment.mult > 0 && isRigged(user, user._globalRiggPct)) { segmentIdx = 0; segment = segments[0]; }
    if (segment.mult === 0 && isWinRigged(user)) {
      segmentIdx = 2; segment = segments[2];
    }
    const won = segment.mult > 0;
    const payout = won ? Math.floor(bet * segment.mult) : 0;

    user.balance -= bet; user.gamesPlayed++; user.totalWagered += bet;
    if (won) { user.balance += payout; user.wins++; } else user.losses++;
    const gameId = ProvablyFair.generateGameId();
    const game = new Game({
      gameId, userId: user.userId, username: user.username,
      gameType: 'Wheel', betAmount: bet, payout, multiplier: segment.mult,
      result: won ? 'win' : 'lose', serverSeed, clientSeed, nonce,
      details: { segment: segmentIdx, weights: segments.map(s => s.weight), rtp: 0.959 }
    });
    applyWagerDecrement(user, bet);
    await game.save(); await user.save();
    Logger.game(user.userId, 'Wheel', bet, payout);

    const buffer = await GameImages.createWheelImage(segmentIdx, segment.mult, won, user.username, gameId, segments);
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
      .setFooter({ text: `EzBet • Game ID: ${gameId}` });

    message.reply({
      embeds: [embed],
      files: buffer ? [new AttachmentBuilder(buffer, { name: 'wheel.png' })] : [],
      components: [betAgainRow('wheel', [bet], message.author.id)]
    }).then(() => {
      const channel = message.client.channels.cache.get(config.publicBetsChannel);
      if (channel && won) channel.send({ embeds: [EmbedHelper.createPublicBetEmbed(game)] });
    });
  }
};
