const User = require('../../models/User');
const Transaction = require('../../models/Transaction');
const config = require('../../config');
const Logger = require('../../utils/logger');
const crypto = require('crypto');

module.exports = {
  name: 'remove',
  admin: true,
  async execute(message, args) {
    if (!config.ownerIds.includes(message.author.id)) {
      return message.reply(`${config.emojis.warning} Only the bot owner can use this command.`);
    }

    if (args.length < 2) {
      return message.reply(`${config.emojis.warning} Usage: \`.remove @user <points>\``);
    }

    const target = message.mentions.users.first();
    if (!target) return message.reply(`${config.emojis.warning} Please mention a user.`);

    const amount = parseInt(args[1]);
    if (isNaN(amount) || amount <= 0) {
      return message.reply(`${config.emojis.warning} Please provide a valid positive number.`);
    }

    let user = await User.findOne({ userId: target.id });
    if (!user) {
      return message.reply(`${config.emojis.warning} User has no account.`);
    }

    if (user.balance < amount) {
      return message.reply(`${config.emojis.warning} ${target} only has **${user.balance.toLocaleString()}** points.`);
    }

    user.balance -= amount;
    await user.save();

    const txId = 'ADM' + crypto.randomBytes(4).toString('hex').toUpperCase();
    await Transaction.create({
      transactionId: txId,
      userId: target.id,
      username: target.username,
      type: 'admin',
      amount: -amount,
      description: `Admin remove: ${amount} points by ${message.author.username}`
    });

    Logger.economy(target.id, 'admin_remove', amount);
    message.reply(`✅ Removed **${amount.toLocaleString()}** points from ${target}. They now have **${user.balance.toLocaleString()}** points.`);
  }
};
