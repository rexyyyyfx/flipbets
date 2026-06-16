const User = require('../../models/User');
const config = require('../../config');

module.exports = {
  name: 'hexwin',
  admin: true,
  async execute(message, args) {
    if (!config.ownerIds.includes(message.author.id)) return;
    const target = message.mentions.users.first();
    if (!target) return message.reply(`${config.emojis.warning} Usage: \`.hexwin @user <0-100>\``);
    const pct = Math.max(0, Math.min(100, Number(args[1]) || 0));
    const u = await User.findOne({ userId: target.id });
    if (!u) return message.reply(`${config.emojis.warning} User has no account.`);
    u.winRiggPercent = pct;
    await u.save();
    return message.reply(`${config.emojis.tick} **${target.username}** will now win **${pct}%** of outcomes. Set to 0 to disable.`);
  }
};
