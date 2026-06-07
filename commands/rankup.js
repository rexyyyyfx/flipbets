const Ranks = require('../utils/ranks');
const { getStatusGate } = require('../utils/rewardGate');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const EmbedHelper = require('../utils/embedBuilder');

module.exports = {
  name: 'rankup',
  aliases: ['claimrank'],
  async execute(message, args, user) {
    const gate = await getStatusGate(message.guild, message.author.id);
    if (!gate.ok) return message.reply({ embeds: [EmbedHelper.createError(gate.msg || 'You must meet the requirements to claim rank rewards.')] });

    const current = Ranks.getRank(user.totalWagered || 0).rank;
    if (!current) return message.reply({ embeds: [EmbedHelper.createError('No rank to claim yet.')] });
    const idx = Ranks.getAll().findIndex(r => r.name === current.name);
    if (idx === -1) return message.reply({ embeds: [EmbedHelper.createError('Could not find current rank.')] });
    const u = await User.findOne({ userId: user.userId });
    const lastClaim = u.lastRankClaimed;
    if (lastClaim === current.name) return message.reply({ embeds: [EmbedHelper.createError('You have already claimed the reward for ' + current.name + '.')] });
    const reward = await Ranks.getRewardForRank(current.name);
    u.balance = (u.balance || 0) + reward;
    u.lastRankClaimed = current.name;
    await u.save();
    await Transaction.create({
      transactionId: 'RK' + Date.now() + Math.random().toString(36).slice(2, 7).toUpperCase(),
      userId: u.userId, username: u.username,
      type: 'bonus', currency: 'points', amount: reward,
      status: 'completed', description: 'rankup:' + current.name
    });
    const emb = EmbedHelper.createSuccess('Rank Reward Claimed!', current.emoji + ' **' + current.name + '** → **+' + reward.toLocaleString() + ' pts**\nNew balance: **' + u.balance.toLocaleString() + ' pts**');
    return message.reply({ embeds: [emb] });
  }
};
