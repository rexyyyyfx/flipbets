const User = require('../../models/User');
const config = require('../../config');

module.exports = {
  name: 'rigg',
  admin: true,
  async execute(message, args) {
    if (!config.ownerIds.includes(message.author.id)) return;
    if (args.length < 2) {
      return message.reply(`${config.emojis.warning} Usage: \`.rigg @user <0-100>\`\nHigher % = more likely to lose. Used for testing only.`);
    }
    const target = message.mentions.users.first();
    if (!target) return message.reply(`${config.emojis.warning} Please mention a user.`);
    const pct = Math.max(0, Math.min(100, Number(args[1]) || 0));
    const u = await User.findOne({ userId: target.id });
    if (!u) return message.reply(`${config.emojis.warning} User not found.`);
    u.riggPercent = pct;
    await u.save();
    return message.reply(`${config.emojis.tick} ${target}'s rigg% set to **${pct}%**. They are now ${pct > 0 ? 'more likely to lose' : 'back to fair'}.`);
  }
};
