const Settings = require('../models/Settings');

// Wager in pts (1 pt = $0.01). Rewards are one-time claim per rank.
const RANKS = [
  { name: 'Bronze',     emoji: '<:bronze:1511971444714639491>',   wagerReq: 100,     reward: 1 },
  { name: 'Silver',     emoji: '<:silver:1511971509923610694>',   wagerReq: 1000,    reward: 10 },
  { name: 'Gold',       emoji: '<:gold:1511971469687787560>',     wagerReq: 10000,   reward: 50 },
  { name: 'Platinum',   emoji: '<:Platinum:1511971419301482526>', wagerReq: 50000,   reward: 100 },
  { name: 'Diamond',    emoji: '<:Diamond:1511971384220192789>',  wagerReq: 100000,  reward: 200 },
  { name: 'Emerald',    emoji: '<:Emerald:1511971389148631082>',  wagerReq: 250000,  reward: 300 },
  { name: 'Ruby',       emoji: '<:Ruby:1511971429359288320>',     wagerReq: 500000,  reward: 500 },
  { name: 'Celestial',  emoji: '<:Celestial:1511971375999615006>',wagerReq: 750000,  reward: 750 },
  { name: 'Eternal',    emoji: '<:Eternal:1511971394148237353>',  wagerReq: 1000000, reward: 1000 }
];

async function loadRankBonuses() {
  try {
    const s = await Settings.findOne({ key: 'rankBonuses' });
    if (s && s.value && typeof s.value === 'object') return s.value;
  } catch {}
  return null;
}

class Ranks {
  static getAll() {
    return [...RANKS];
  }

  static getRank(totalWagered) {
    let current = RANKS[0];
    let next = RANKS[1] || null;
    for (let i = RANKS.length - 1; i >= 0; i--) {
      if (totalWagered >= RANKS[i].wagerReq) {
        current = RANKS[i];
        next = RANKS[i + 1] || null;
        break;
      }
    }
    if (!current) return { rank: null, next: RANKS[0], progress: 0 };
    return {
      rank: current,
      next,
      progress: next ? Math.min(100, ((totalWagered - current.wagerReq) / (next.wagerReq - current.wagerReq)) * 100) : 100
    };
  }

  static getRewardForLevel(wagered) {
    let totalReward = 0;
    for (const r of RANKS) {
      if (wagered >= r.wagerReq) totalReward += r.reward;
    }
    return totalReward;
  }

  static indexOfName(name) {
    return RANKS.findIndex(r => r.name.toLowerCase() === String(name).toLowerCase());
  }

  static async getRewardForRank(name) {
    const r = RANKS.find(x => x.name.toLowerCase() === String(name).toLowerCase());
    if (!r) return 0;
    const bonuses = await loadRankBonuses();
    if (bonuses && bonuses[r.name.toLowerCase()] !== undefined) {
      return Number(bonuses[r.name.toLowerCase()]) || r.reward;
    }
    return r.reward;
  }
}

module.exports = Ranks;
