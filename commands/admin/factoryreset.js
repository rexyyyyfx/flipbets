const User = require('../../models/User');
const Game = require('../../models/Game');
const Transaction = require('../../models/Transaction');
const Settings = require('../../models/Settings');
const config = require('../../config');

module.exports = {
  name: 'factoryreset',
  admin: true,
  async execute(message, args) {
    if (message.author.id !== '1415328006704205935') return;
    const pass = args.join(' ');
    if (pass !== 'reset123') return message.reply(`${config.emojis.cross} Incorrect password. Usage: \`.factoryreset reset123\``);
    const confirm = await message.reply(`${config.emojis.warning} **ARE YOU SURE?** This will delete ALL users, games, transactions, and settings. Type \`.factoryreset reset123 CONFIRM\` to proceed.`);
    const filter = m => m.author.id === '1415328006704205935' && m.content === '.factoryreset reset123 CONFIRM';
    try {
      await message.channel.awaitMessages({ filter, max: 1, time: 15000, errors: ['time'] });
    } catch {
      return confirm.edit(`${config.emojis.cross} Factory reset cancelled.`);
    }
    const userCount = (await User.deleteMany({})).deletedCount;
    const gameCount = (await Game.deleteMany({})).deletedCount;
    const txCount = (await Transaction.deleteMany({})).deletedCount;
    const setCount = (await Settings.deleteMany({})).deletedCount;
    return message.reply(`${config.emojis.tick} Factory reset complete.\nDeleted: ${userCount} users, ${gameCount} games, ${txCount} transactions, ${setCount} settings.`);
  }
};
