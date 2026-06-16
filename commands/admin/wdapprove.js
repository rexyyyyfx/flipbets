const User = require('../../models/User');
const Transaction = require('../../models/Transaction');
const config = require('../../config');
const logChannel = require('../../utils/logChannel');

module.exports = {
  name: 'wdapprove',
  admin: true,
  async execute(message, args) {
    if (!config.ownerIds.includes(message.author.id)) return;
    if (!args.length) return message.reply(`${config.emojis.warning} Usage: \`.wdapprove <wd_id>\``);
    const wdId = args[0].toUpperCase();
    const tx = await Transaction.findOne({ transactionId: wdId, type: 'withdraw', status: 'pending' });
    if (!tx) return message.reply(`${config.emojis.cross} Pending withdrawal \`${wdId}\` not found.`);
    tx.status = 'completed';
    await tx.save();
    logChannel.send({ content: `**Withdrawal Approved** — ${tx.username} (\`${tx.userId}\`)\nAmount: **${Math.abs(tx.amount || 0).toLocaleString()} pts**\nID: \`${tx.transactionId}\`\nApproved by: ${message.author.username}` });
    return message.reply(`${config.emojis.tick} Withdrawal \`${wdId}\` approved.`);
  }
};
