const Settings = require('../models/Settings');
const config = require('../config');

const DEFAULT_DAILY = 1000;
const DEFAULT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

async function getDailyConfig() {
  try {
    const cfg = await Settings.find({ key: { $in: ['dailyAmount', 'dailyEnabled', 'rewardDiscordRequired'] } });
    const out = {};
    for (const d of cfg) out[d.key] = d.value;
    return {
      amount: Number(out.dailyAmount) || DEFAULT_DAILY,
      enabled: out.dailyEnabled !== false,
      requiredInvite: out.rewardDiscordRequired || 'https://discord.gg/ezbet'
    };
  } catch {
    return { amount: DEFAULT_DAILY, enabled: true, requiredInvite: 'https://discord.gg/ezbet' };
  }
}

async function getStatusGate(guild, userId) {
  if (!guild) return { ok: true, bypass: true };
  try {
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return { ok: false, reason: 'not_in_guild' };
    const act = member.presence?.activities;
    const hasInvite = Array.isArray(act) && act.some(a => {
      if (!a) return false;
      const s = ((a.state || '') + ' ' + (a.name || '')).toLowerCase();
      return s.includes('discord.gg/ezbet');
    });
    if (!hasInvite) {
      const required = (await getDailyConfig()).requiredInvite;
      if (required) {
        return { ok: false, reason: 'no_invite', msg: 'Please set **' + required + '** as your Discord custom status (User Settings → Custom Status) before claiming rewards.' };
      }
    }
    return { ok: true };
  } catch (e) {
    return { ok: true, bypass: true };
  }
}

module.exports = { getDailyConfig, getStatusGate };
