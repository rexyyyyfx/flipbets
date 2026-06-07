const PromoCode = require('../models/PromoCode');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const EmbedHelper = require('../utils/embedBuilder');
const config = require('../config');
const crypto = require('crypto');

function roundPoints(v) { return Math.round(Number(v || 0) * 100) / 100; }
function fmt(v) { const n = Number(v || 0); if (!Number.isFinite(n)) return '0'; return (Math.round(n * 100) / 100 + '').replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

function randomCode() {
  return 'PROMO-' + crypto.randomBytes(3).toString('hex').toUpperCase();
}

module.exports = {
  name: 'promo',
  aliases: ['givepromo'],
  hidden: true,
  admin: true,
  async execute(message, args) {
    if (!config.ownerIds.includes(message.author.id)) {
      return message.reply({ embeds: [EmbedHelper.createError('Only admins can use this command.')] });
    }
    const target = message.mentions.users.first();
    if (!target) {
      return message.reply({
        embeds: [EmbedHelper.createError(
          'Admin only: `.promo @user <points> [wagerMult]`\nExample: `.promo @user 10 2` → 10 pts, requires 20 wager to withdraw'
        )]
      });
    }
    const points = roundPoints(parseFloat(args[1]));
    if (!Number.isFinite(points) || points <= 0) {
      return message.reply({ embeds: [EmbedHelper.createError('Enter a valid point amount.')] });
    }
    const wm = args[2] === undefined ? 2 : roundPoints(parseFloat(args[2]));
    if (!Number.isFinite(wm) || wm < 0) {
      return message.reply({ embeds: [EmbedHelper.createError('Wager multiplier must be 0 or higher.')] });
    }

    let user = await User.findOne({ userId: target.id });
    if (!user) {
      user = await User.create({ userId: target.id, username: target.username });
    }
    const code = randomCode();
    const wagerReq = roundPoints(points * wm);
    await PromoCode.create({
      code,
      amount: points,
      maxUses: 1,
      used: 0,
      usedBy: [],
      wagerReq,
      wagerMult: wm,
      minRank: '',
      withdrawlWagerReq: wagerReq,
      isActive: true
    });

    user.balance = roundPoints((user.balance || 0) + points);
    user.wagerRequired = roundPoints((user.wagerRequired || 0) + wagerReq);
    user.promoLocked = roundPoints((user.promoLocked || 0) + wagerReq);
    await user.save();
    await Transaction.create({
      transactionId: 'PR' + crypto.randomBytes(5).toString('hex').toUpperCase(),
      userId: user.userId, username: user.username,
      type: 'bonus', currency: 'points', amount: points,
      status: 'completed', description: 'promo:' + code
    });

    const emb = EmbedHelper.createSuccess('Promo Credited',
      '**' + target.username + '** credited **' + fmt(points) + ' pts**\n' +
      'Code: `' + code + '`\n' +
      'Wager requirement: **' + fmt(wagerReq) + ' pts** (' + wm + 'x)\n\n' +
      'New balance: **' + fmt(user.balance) + ' pts**'
    );
    return message.reply({ embeds: [emb] });
  }
};
