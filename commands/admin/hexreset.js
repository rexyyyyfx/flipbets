const config = require('../../config');

module.exports = {
  name: 'hexreset',
  aliases: ['riggreset'],
  admin: true,
  async execute(message, args) {
    if (!config.ownerIds.includes(message.author.id)) return;
    const target = message.mentions.users.first();
    if (!target) {
      return message.reply(`${config.emojis.warning} Usage: \`.hexreset @user\` or \`.riggreset @user\``);
    }
    const User = require('../../models/User');
    const u = await User.findOne({ userId: target.id });
    if (!u) {
      return message.reply(`${config.emojis.warning} User not found.`);
    }
    u.riggPercent = 0;
    await u.save();
    return message.reply(`${config.emojis.tick} Reset rig for **${target.username}** to 0%.`);
  }
};
