const User = require('../../models/User');
const config = require('../../config');

module.exports = {
  name: 'botban',
  admin: true,
  async execute(message, args) {
    if (!config.ownerIds.includes(message.author.id)) return;
    const target = message.mentions.users.first();
    if (!target) return message.reply(`${config.emojis.warning} Usage: \`.botban @user [reason]\``);
    const reason = args.slice(1).join(' ') || 'No reason provided';
    const u = await User.findOne({ userId: target.id });
    if (!u) return message.reply(`${config.emojis.warning} User has no account.`);
    u.isBanned = true;
    u.banReason = reason;
    await u.save();
    return message.reply(`${config.emojis.tick} Banned **${target.username}** from playing games.\nReason: ${reason}`);
  }
};
