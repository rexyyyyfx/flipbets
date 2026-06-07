const Settings = require('../../models/Settings');
const EmbedHelper = require('../../utils/embedBuilder');
const config = require('../../config');

const VALID_GAMES = ['mines', 'limbo', 'blackjack', 'coinflip', 'hilo', 'wheel', 'crash', 'roulette', 'baccarat'];

module.exports = {
  name: 'disable',
  aliases: ['enablegame', 'togglegame'],
  admin: true,
  async execute(message, args) {
    if (!config.ownerIds.includes(message.author.id)) {
      return message.reply({ embeds: [EmbedHelper.createError('Only admins can disable games.')] });
    }
    const game = (args[0] || '').toLowerCase();
    if (!game || !VALID_GAMES.includes(game)) {
      return message.reply({
        embeds: [EmbedHelper.createError(
          'Usage: `.disable <game>`\nValid games: ' + VALID_GAMES.join(', ')
        )]
      });
    }
    let s = await Settings.findOne({ key: 'gamesEnabled' });
    const enabled = s?.value && typeof s.value === 'object' ? { ...s.value } : {};
    enabled[game] = false;
    await Settings.findOneAndUpdate(
      { key: 'gamesEnabled' },
      { key: 'gamesEnabled', value: enabled },
      { upsert: true }
    );
    const name = game.charAt(0).toUpperCase() + game.slice(1);
    return message.reply({
      embeds: [EmbedHelper.createSuccess('Game Disabled', `**${name}** has been disabled on the website.`)]
    });
  }
};
