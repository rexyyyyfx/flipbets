const User = require('../models/User');
const Transaction = require('../models/Transaction');
const EmbedHelper = require('../utils/embedBuilder');
const { getDailyConfig, getStatusGate } = require('../utils/rewardGate');
const config = require('../config');

const COOLDOWN_MS = 24 * 60 * 60 * 1000;

module.exports = {
  name: 'daily',
  aliases: ['dailies', 'd'],
  async execute(message, args, user) {
    const cfg = await getDailyConfig();
    if (!cfg.enabled) return message.reply({ embeds: [EmbedHelper.createError('Daily rewards are currently disabled.')] });

    const gate = await getStatusGate(message.guild, message.author.id);
    if (!gate.ok) {
      return message.reply({ embeds: [EmbedHelper.createError(gate.msg || 'You must meet the requirements to claim daily rewards.')] });
    }

    const u = await User.findOne({ userId: message.author.id });
    const last = u.lastDaily ? new Date(u.lastDaily).getTime() : 0;
    const now = Date.now();
    if (last && (now - last) < COOLDOWN_MS) {
      const remain = COOLDOWN_MS - (now - last);
      const h = Math.floor(remain / 3600000);
      const m = Math.floor((remain % 3600000) / 60000);
      return message.reply({ embeds: [EmbedHelper.createError('You already claimed your daily reward. Come back in **' + h + 'h ' + m + 'm**.')] });
    }

    const amt = cfg.amount;
    u.balance = (u.balance || 0) + amt;
    u.lastDaily = new Date();
    await u.save();
    await Transaction.create({
      transactionId: 'DL' + Date.now() + Math.random().toString(36).slice(2, 7).toUpperCase(),
      userId: u.userId, username: u.username,
      type: 'bonus', currency: 'points', amount: amt,
      status: 'completed', description: 'daily:Daily Bonus'
    });

    const emb = EmbedHelper.createSuccess('Daily Reward Claimed!', '**+' + amt.toLocaleString() + ' pts** added to your balance.\nNew balance: **' + u.balance.toLocaleString() + ' pts**\n\nCome back in 24h for more!');
    return message.reply({ embeds: [emb] });
  }
};
