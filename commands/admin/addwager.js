const User = require('../../models/User');
const config = require('../../config');

module.exports = {
  name: 'addwager',
  admin: true,
  async execute(message, args) {
    if (!config.ownerIds.includes(message.author.id)) return;
    if (args.length < 2) {
      return message.reply(`${config.emojis.warning} Usage: \`.addwager @user <points>\``);
    }
    const target = message.mentions.users.first();
    if (!target) return message.reply(`${config.emojis.warning} Please mention a user.`);
    const raw = String(args[1]).replace(/,/g, '');
    const amt = Math.max(0, Math.round(Number(raw) * 100) / 100);
    if (!amt) return message.reply(`${config.emojis.warning} Invalid amount.`);
    const u = await User.findOne({ userId: target.id });
    if (!u) return message.reply(`${config.emojis.warning} User not found.`);
    u.totalWagered = (u.totalWagered || 0) + amt;
    await u.save();
    return message.reply(`${config.emojis.tick} Added **${amt.toLocaleString()} pts** to ${target}'s wagered. New total: **${u.totalWagered.toLocaleString()} pts**`);
  }
};
