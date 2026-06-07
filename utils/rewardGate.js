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
      requiredInvite: out.rewardDiscordRequired || config.apirone?.requiredInvite || 'https://discord.gg/TsPsqkPG'
    };
  } catch {
    return { amount: DEFAULT_DAILY, enabled: true, requiredInvite: 'https://discord.gg/TsPsqkPG' };
  }
}

async function getStatusGate(guild, userId) {
  if (!guild) return { ok: true, bypass: true };
  try {
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return { ok: false, reason: 'not_in_guild' };
    if (member.presence?.status !== 'online') {
      return { ok: false, reason: 'offline', msg: 'Your status must be set to **Online** to claim rewards. Right-click your name → Status → Online, then try again.' };
    }
    const act = member.presence?.activities;
    const hasInvite = Array.isArray(act) && act.some(a => {
      if (!a) return false;
      const s = ((a.state || '') + ' ' + (a.name || '')).toLowerCase();
      return s.includes('discord.gg/tspsqkpg') || s.includes('discord.gg/yourserver') || s.includes('flipbets');
    });
    if (!hasInvite) {
      return { ok: false, reason: 'no_invite', msg: 'Please set the Discord invite **' + (await getDailyConfig()).requiredInvite + '** as your custom status (User Settings → Custom Status) before claiming rewards.' };
    }
    return { ok: true };
  } catch (e) {
    return { ok: true, bypass: true };
  }
}

module.exports = { getDailyConfig, getStatusGate };
