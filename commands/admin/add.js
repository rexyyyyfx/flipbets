const User = require('../../models/User');
const Transaction = require('../../models/Transaction');
const config = require('../../config');
const Logger = require('../../utils/logger');
const crypto = require('crypto');

module.exports = {
  name: 'add',
  admin: true,
  async execute(message, args) {
    if (!config.ownerIds.includes(message.author.id)) return;

    if (args.length < 2) {
      return message.reply(`${config.emojis.warning} Usage: \`.add @user <points>\``);
    }

    const target = message.mentions.users.first();
    if (!target) return message.reply(`${config.emojis.warning} Please mention a user.`);
    if (target.bot) return message.reply(`${config.emojis.warning} Cannot add points to bots.`);

    const amount = parseInt(args[1]);
    if (isNaN(amount) || amount <= 0) {
      return message.reply(`${config.emojis.warning} Please provide a valid positive number.`);
    }

    let user = await User.findOne({ userId: target.id });
    if (!user) {
      user = new User({ userId: target.id, username: target.username });
    }

    user.balance += amount;
    await user.save();

    const txId = 'ADM' + crypto.randomBytes(4).toString('hex').toUpperCase();
    await Transaction.create({
      transactionId: txId,
      userId: target.id,
      username: target.username,
      type: 'admin',
      amount: amount,
      description: `Admin add: ${amount} points by ${message.author.username}`
    });

    Logger.economy(target.id, 'admin_add', amount);
    message.reply(`${config.emojis.tick} Added **${amount.toLocaleString()}** points to ${target}. They now have **${user.balance.toLocaleString()}** points.`);
  }
};
