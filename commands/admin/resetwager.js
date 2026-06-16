const User = require('../../models/User');
const config = require('../../config');

module.exports = {
  name: 'resetwager',
  admin: true,
  async execute(message, args) {
    if (!config.ownerIds.includes(message.author.id)) return;
    const target = message.mentions.users.first();
    if (!target) return message.reply(`${config.emojis.warning} Usage: \`.resetwager @user\``);
    const u = await User.findOne({ userId: target.id });
    if (!u) return message.reply(`${config.emojis.warning} User has no account.`);
    u.totalWagered = 0;
    await u.save();
    return message.reply(`${config.emojis.tick} Reset **${target.username}**'s wagered to **0 pts**.`);
  }
};
