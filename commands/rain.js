const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Settings = require('../models/Settings');
const EmbedHelper = require('../utils/embedBuilder');
const { getStatusGate } = require('../utils/rewardGate');
const config = require('../config');

module.exports = {
  name: 'rain',
  aliases: ['tiprain', 'showers'],
  async execute(message, args, user) {
    if (!config.ownerIds.includes(message.author.id)) {
      return message.reply({ embeds: [EmbedHelper.createError('Only admins can trigger a rain.')] });
    }

    const amt = parseInt(args[0]) || 1000;
    if (amt < 100) return message.reply({ embeds: [EmbedHelper.createError('Minimum rain amount is 100 pts.')] });
    if (amt > 50000) return message.reply({ embeds: [EmbedHelper.createError('Maximum rain amount is 50,000 pts.')] });

    const gate = await getStatusGate(message.guild, message.author.id);
    if (!gate.ok) return message.reply({ embeds: [EmbedHelper.createError(gate.msg || 'You must meet the requirements to rain.')] });

    if (user.balance < amt) return message.reply({ embeds: [EmbedHelper.createError('You don\'t have enough points to rain.')] });

    const msgs = await message.channel.messages.fetch({ limit: 50 });
    const eligible = new Map();
    for (const m of msgs.values()) {
      if (m.author.bot) continue;
      if (m.author.id === message.author.id) continue;
      if (Date.now() - m.createdAt.getTime() > 10 * 60 * 1000) continue;
      if (!eligible.has(m.author.id)) eligible.set(m.author.id, m.author.username);
      if (eligible.size >= 5) break;
    }
    if (eligible.size === 0) return message.reply({ embeds: [EmbedHelper.createError('No eligible users found in the last 10 minutes.')] });

    const perUser = Math.floor(amt / eligible.size);
    if (perUser < 1) return message.reply({ embeds: [EmbedHelper.createError('Rain amount too small to split among ' + eligible.size + ' users.')] });

    user.balance -= amt;
    await user.save();
    await Transaction.create({
      transactionId: 'RN' + Date.now() + Math.random().toString(36).slice(2, 7).toUpperCase(),
      userId: user.userId, username: user.username,
      type: 'withdraw', currency: 'points', amount: -amt,
      status: 'completed', description: 'rain:Rain to ' + eligible.size + ' users'
    });

    const lines = [];
    let count = 0;
    for (const [uid, uname] of eligible.entries()) {
      const target = await User.findOne({ userId: uid });
      if (!target) continue;
      target.balance = (target.balance || 0) + perUser;
      await target.save();
      await Transaction.create({
        transactionId: 'RNR' + Date.now() + Math.random().toString(36).slice(2, 7).toUpperCase(),
        userId: uid, username: uname,
        type: 'deposit', currency: 'points', amount: perUser,
        status: 'completed', description: 'rain:From ' + user.username
      });
      lines.push('<@' + uid + '>');
      count++;
    }

    const emb = EmbedHelper.createSuccess('Rain!', '**' + message.author.username + '** is raining **' + amt.toLocaleString() + ' pts** to **' + count + ' active users** in this channel!\n\n' + lines.join(' ') + '\n\nEach user receives **' + perUser.toLocaleString() + ' pts**.');
    return message.channel.send({ content: lines.join(' '), embeds: [emb] });
  }
};
