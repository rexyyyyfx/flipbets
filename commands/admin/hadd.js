const Settings = require('../../models/Settings');
const config = require('../../config');

function roundPts(v) { return Math.round(Number(v || 0) * 100) / 100; }

module.exports = {
  name: 'hadd',
  admin: true,
  async execute(message, args) {
    if (!config.ownerIds.includes(message.author.id)) return;
    if (args.length < 1) {
      return message.reply(`${config.emojis.warning} Usage: \`.hadd <points>\` (adds fake profit to house balance)`);
    }
    const raw = String(args[0]).replace(/,/g, '');
    const amt = roundPts(Number(raw));
    if (!amt || amt <= 0) return message.reply(`${config.emojis.warning} Invalid amount.`);
    const doc = await Settings.findOne({ key: 'houseFakeBalance' });
    const cur = doc ? Number(doc.value) || 0 : 0;
    const total = roundPts(cur + amt);
    await Settings.updateOne(
      { key: 'houseFakeBalance' },
      { $set: { value: total } },
      { upsert: true }
    );
    return message.reply(`${config.emojis.tick} Added **${amt.toLocaleString()} pts** to house balance (total: **${total.toLocaleString()} pts**).`);
  }
};
