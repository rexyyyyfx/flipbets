const PromoCode = require('../models/PromoCode');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Ranks = require('../utils/ranks');
const { getStatusGate } = require('../utils/rewardGate');
const EmbedHelper = require('../utils/embedBuilder');
const config = require('../config');
const crypto = require('crypto');

function roundPoints(v) { return Math.round(Number(v || 0) * 100) / 100; }
function fmt(v) { const n = Number(v || 0); if (!Number.isFinite(n)) return '0'; return (Math.round(n * 100) / 100 + '').replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

module.exports = {
  name: 'claim',
  aliases: ['redeemcode'],
  async execute(message, args, user) {
    if (!args[0]) {
      return message.reply({ embeds: [EmbedHelper.createError('Usage: `.claim <code>`')] });
    }
    const gate = await getStatusGate(message.guild, message.author.id);
    if (!gate.ok) return message.reply({ embeds: [EmbedHelper.createError(gate.msg || 'You must meet the requirements to redeem codes.')] });

    const code = String(args[0]).toUpperCase();
    const p = await PromoCode.findOne({ code, isActive: true });
    if (!p) return message.reply({ embeds: [EmbedHelper.createError('Invalid or expired promo code.')] });
    if (p.expiresAt && new Date() > p.expiresAt) return message.reply({ embeds: [EmbedHelper.createError('This promo code has expired.')] });
    if (p.used >= p.maxUses) return message.reply({ embeds: [EmbedHelper.createError('This promo code is fully used.')] });
    if (p.usedBy.find(u => u.userId === user.userId)) return message.reply({ embeds: [EmbedHelper.createError('You have already used this promo code.')] });
    if (p.minRank) {
      const r = Ranks.getRank(user.totalWagered || 0).rank;
      const have = Ranks.indexOfName(r ? r.name : 'Bronze');
      const need = Ranks.indexOfName(p.minRank);
      if (have < need) return message.reply({ embeds: [EmbedHelper.createError('This code requires ' + p.minRank + ' rank or higher.')] });
    }

    p.usedBy.push({ userId: user.userId, username: user.username });
    p.used++;
    await p.save();
    const wm = Number(p.wagerMult || 2);
    const wagerReq = roundPoints((p.amount || 0) * wm);
    user.balance = roundPoints((user.balance || 0) + p.amount);
    user.wagerRequired = roundPoints((user.wagerRequired || 0) + wagerReq);
    user.promoLocked = roundPoints((user.promoLocked || 0) + wagerReq);
    await user.save();
    await Transaction.create({
      transactionId: 'PR' + crypto.randomBytes(5).toString('hex').toUpperCase(),
      userId: user.userId, username: user.username,
      type: 'bonus', currency: 'points', amount: p.amount,
      status: 'completed', description: 'promo:' + p.code
    });

    const emb = EmbedHelper.createSuccess('Code Claimed!',
      '**' + p.code + '** → **+' + fmt(p.amount) + ' pts**\nNew balance: **' + fmt(user.balance) + ' pts**' +
      (wagerReq > 0 ? '\n\nWager requirement: **' + fmt(wagerReq) + ' pts** (' + wm + 'x) before withdrawal' : '')
    );
    emb.addFields({ name: 'Play on Website', value: `[ezbet.site](${config.websiteUrl})` });
    return message.reply({ embeds: [emb] });
  }
};
