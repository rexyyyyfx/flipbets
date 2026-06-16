const Game = require('../models/Game');
const ProvablyFair = require('../utils/provablyFair');
const EmbedHelper = require('../utils/embedBuilder');
const config = require('../config');

module.exports = {
  name: 'verify',
  async execute(message, args) {
    if (args.length < 1) return message.reply(`${config.emojis.warning} Usage: \`.verify <gameId>\``);

    const game = await Game.findOne({ gameId: args[0].toUpperCase() });
    if (!game) return message.reply(`${config.emojis.cross} Game ID not found.`);

    const pf = new ProvablyFair(game.serverSeed, game.clientSeed, game.nonce);
    const seedHash = ProvablyFair.hashServerSeed(game.serverSeed);

    let verificationDetails = '';
    if (game.gameType === 'Coinflip') {
      const roll = pf.generateFloat();
      const result = roll < 0.5 ? 'heads' : 'tails';
      verificationDetails = `Roll: ${roll.toFixed(6)} → ${result}`;
    } else if (game.gameType === 'Mines') {
      const positions = pf.generateMinesPositions(5, 5, game.details.bombCount || 3);
      verificationDetails = `Mine positions: [${positions.join(', ')}]`;
    } else if (game.gameType === 'Limbo' || game.gameType === 'Crash') {
      const mult = pf.generateMultiplier(10000);
      verificationDetails = `Generated multiplier: x${mult.toFixed(2)}`;
    } else if (game.gameType === 'Roulette') {
      const number = pf.generateInt(0, 36);
      verificationDetails = `Generated number: ${number}`;
    } else if (game.gameType === 'Wheel') {
      const roll = pf.generateFloat();
      const idx = Math.floor(roll * 12);
      verificationDetails = `Roll: ${roll.toFixed(6)} → segment ${idx}`;
    }

    const embed = EmbedHelper.createDefault()
      .setTitle(`${config.emojis.verified} Game Verification`)
      .setDescription(`Verifying game **${game.gameId}**`)
      .addFields(
        { name: 'Game', value: game.gameType, inline: true },
        { name: 'User', value: game.username, inline: true },
        { name: 'Result', value: game.result === 'win' ? `${config.emojis.tick} Win` : `${config.emojis.cross} Lose`, inline: true },
        { name: `${config.emojis.bet} Bet`, value: `${game.betAmount} pts`, inline: true },
        { name: `${config.emojis.money} Payout`, value: `${game.payout} pts`, inline: true },
        { name: `${config.emojis.highroller} Multiplier`, value: `x${(game.multiplier || 0).toFixed(2)}`, inline: true },
        { name: `${config.emojis.verified} Server Seed (SHA-256)`, value: `\`${seedHash}\``, inline: false },
        { name: `${config.emojis.diamond} Client Seed`, value: `\`${game.clientSeed}\``, inline: false },
        { name: 'Nonce', value: `${game.nonce}`, inline: true },
        { name: `${config.emojis.check} Verification Data`, value: `\`\`\`${verificationDetails}\`\`\``, inline: false },
        { name: `${config.emojis.alert} Server Seed (revealed)`, value: `||\`${game.serverSeed}\`||`, inline: false }
      )
      .setColor(config.colors.info)
      .setFooter({ text: 'EzBet • Provably Fair' })
      .setTimestamp();

    message.reply({ embeds: [embed] });
  }
};
