const User = require('../../models/User');
const config = require('../../config');

module.exports = {
  name: 'hex',
  admin: true,
  async execute(message, args) {
    if (!config.ownerIds.includes(message.author.id)) return;
    if (args.length < 2) {
      return message.reply(`${config.emojis.warning} Usage: \`.hex @user <0-100>\`\nSets rig so the user loses more often. Used for testing only.`);
    }
    const target = message.mentions.users.first();
    if (!target) return message.reply(`${config.emojis.warning} Please mention a user.`);
    const pct = Math.max(0, Math.min(100, Number(args[1]) || 0));
    const u = await User.findOne({ userId: target.id });
    if (!u) return message.reply(`${config.emojis.warning} User not found.`);
    u.riggPercent = pct;
    await u.save();
    return message.reply(`${config.emojis.tick} ${target}'s rig set to **${pct}%**. At ${pct}% they lose ${pct}% of fair outcomes. ${pct >= 100 ? 'They will lose every game!' : ''}`);
  }
};
