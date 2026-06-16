const Settings = require('../../models/Settings');
const config = require('../../config');

module.exports = {
  name: 'disable',
  admin: true,
  async execute(message, args) {
    if (!config.ownerIds.includes(message.author.id)) return;
    if (!args.length) {
      return message.reply(`${config.emojis.warning} Usage: \`.disable withdrawl\` (toggles withdrawals on/off)`);
    }
    const setting = args.join(' ').toLowerCase();
    if (setting === 'withdrawl' || setting === 'withdrawal' || setting === 'withdrawals') {
      const doc = await Settings.findOne({ key: 'withdrawlsEnabled' });
      const cur = doc ? doc.value : true;
      const next = !cur;
      await Settings.updateOne(
        { key: 'withdrawlsEnabled' },
        { $set: { value: next } },
        { upsert: true }
      );
      return message.reply(`${config.emojis.tick} Withdrawals are now **${next ? 'enabled' : 'disabled'}**.`);
    }
    return message.reply(`${config.emojis.warning} Unknown setting. Use \`.disable withdrawl\`.`);
  }
};
