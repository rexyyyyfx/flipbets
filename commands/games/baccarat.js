const Game = require('../../models/Game');
const ProvablyFair = require('../../utils/provablyFair');
const EmbedHelper = require('../../utils/embedBuilder');
const GameImages = require('../../utils/gameImages');
const { betAgainRow } = require('../../utils/gameComponents');
const config = require('../../config');
const { sendPublic } = require('../../utils/broadcast');
const Logger = require('../../utils/logger');
const { parseBet } = require('../../utils/betParser');

function bVal(hand) {
  let t = 0;
  for (const c of hand) {
    if (['J', 'Q', 'K', '10'].includes(c.rank)) t += 0;
    else if (c.rank === 'A') t += 1;
    else t += parseInt(c.rank);
  }
  return t % 10;
}

module.exports = {
  name: 'baccarat',
  aliases: ['bac', 'bc'],
  async execute(message, args, user) {
    if (args.length < 2) return message.reply(`${config.emojis.cross} Usage: \`.baccarat <amount|half|all> <player/banker/tie>\``);

    const bet = parseBet(args[0], user.balance);
    if (!bet) {
      if (user.balance <= 0) return message.reply(`${config.emojis.cross} Invalid points — top up your balance to play.`);
      return message.reply(`${config.emojis.cross} Invalid bet.`);
    }
    if (bet < 10) return message.reply(`${config.emojis.cross} Min bet 10 pts.`);
    const choice = args[1] ? args[1].toLowerCase() : '';
    if (!['player', 'banker', 'tie', 'p', 'b', 't'].includes(choice)) return message.reply(`${config.emojis.cross} Choose \`player\`, \`banker\`, or \`tie\`.`);
    const nc = choice === 'p' ? 'player' : choice === 'b' ? 'banker' : choice === 't' ? 'tie' : choice;
    if (user.balance < bet) {
      if (user.balance <= 0) return message.reply(`${config.emojis.cross} Invalid points — top up your balance to play.`);
      return message.reply(`${config.emojis.cross} Insufficient balance.`);
    }

    const ss = ProvablyFair.generateServerSeed();
    const cs = user.clientSeed || ProvablyFair.generateClientSeed();
    const nn = user.gamesPlayed + 1;
    const pf = new ProvablyFair(ss, cs, nn);
    const deck = pf.generateDeck();
    const pC = [deck[0], deck[2]], bC = [deck[1], deck[3]];
    let pV = bVal(pC), bV = bVal(bC), di = 4;

    if (pV < 8 && bV < 8) {
      if (pV <= 5) { pC.push(deck[di++]); pV = bVal(pC); }
      const tc = pC.length === 3 ? pC[2] : null;
      if (bV <= 2) bC.push(deck[di++]);
      else if (bV === 3 && tc && tc.rank !== '8') bC.push(deck[di++]);
      else if (bV === 4 && tc && ['2','3','4','5','6','7'].includes(tc.rank)) bC.push(deck[di++]);
      else if (bV === 5 && tc && ['4','5','6','7'].includes(tc.rank)) bC.push(deck[di++]);
      else if (bV === 6 && tc && ['6','7'].includes(tc.rank)) bC.push(deck[di++]);
      bV = bVal(bC);
    }

    let result, mult;
    if (pV > bV) { result = 'player'; mult = 2; }
    else if (bV > pV) { result = 'banker'; mult = 1.95; }
    else { result = 'tie'; mult = 9; }

    const won = nc === result || (nc === 'tie' && result === 'tie');
    const payout = won ? (result === 'tie' ? Math.floor(bet * 9) : Math.floor(bet * mult)) : 0;
    user.balance -= bet; user.gamesPlayed++; user.totalWagered += bet;
    if (won) { user.balance += payout; user.wins++; } else user.losses++;
    const gid = ProvablyFair.generateGameId();
    const game = new Game({
      gameId: gid, userId: user.userId, username: user.username,
      gameType: 'Baccarat', betAmount: bet, payout, multiplier: mult,
      result: won ? 'win' : 'lose', serverSeed: ss, clientSeed: cs, nonce: nn,
      details: { choice: nc, result, playerCards: pC.map(c => `${c.rank}${c.suit}`), bankerCards: bC.map(c => `${c.rank}${c.suit}`), pV, bV }
    });
    await game.save(); await user.save();

    const buffer = await GameImages.createBaccaratImage(pC, pV, bC, bV, result, won, user.username, gid);
    const { AttachmentBuilder } = require('discord.js');
    const embed = EmbedHelper.createDefault()
      .setTitle(`${config.emojis.heart} Baccarat`)
      .setDescription(`You bet **${nc}** • ${result.toUpperCase()} wins!`)
      .addFields(
        { name: `Player (${pV})`, value: pC.map(c => `${c.rank}${c.suit}`).join(' '), inline: true },
        { name: `Banker (${bV})`, value: bC.map(c => `${c.rank}${c.suit}`).join(' '), inline: true },
        { name: 'Payout', value: won ? `+${payout}` : '0', inline: true },
        { name: 'Game ID', value: `\`${gid}\``, inline: false }
      )
      .setColor(won ? config.colors.success : config.colors.error)
      .setThumbnail(message.author.displayAvatarURL())
      .setImage(buffer ? 'attachment://baccarat.png' : null)
      .setFooter({ text: `Flipbets • Game ID: ${gid}` });

    message.reply({
      embeds: [embed],
      files: buffer ? [new AttachmentBuilder(buffer, { name: 'baccarat.png' })] : [],
      components: [betAgainRow('baccarat', [bet, nc])]
    }).then(() => {
      const channel = message.client.channels.cache.get(config.publicBetsChannel);
      if (channel && won) channel.send({ embeds: [EmbedHelper.createPublicBetEmbed(game)] });
    });
  }
};
