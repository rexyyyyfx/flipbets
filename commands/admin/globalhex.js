const Settings = require('../../models/Settings');
const config = require('../../config');
const globalRiggCache = require('../../utils/globalRiggCache');
let setGlobalRiggPct = null;
try { const s = require('../../web/server'); setGlobalRiggPct = s.setGlobalRiggPct; } catch {};

module.exports = {
  name: 'globalhex',
  admin: true,
  async execute(message, args) {
    if (!config.ownerIds.includes(message.author.id)) return;
    if (args.length < 1) {
      return message.reply(`${config.emojis.warning} Usage: \`.globalhex <0-100>\`\nApplies rig to ALL users. Used for testing only.`);
    }
    const pct = Math.max(0, Math.min(100, Number(args[0]) || 0));
    await Settings.updateOne(
      { key: 'globalRiggPercent' },
      { $set: { value: pct } },
      { upsert: true }
    );
    globalRiggCache.clear();
    if (setGlobalRiggPct) setGlobalRiggPct(pct);
    return message.reply(`${config.emojis.tick} Global rig set to **${pct}%**. ${pct >= 100 ? 'Every player will lose every game!' : `All players will have their fair outcomes flipped ${pct}% of the time.`}`);
  }
};
