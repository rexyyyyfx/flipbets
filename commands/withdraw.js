const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Settings = require('../models/Settings');
const ApironeAPI = require('../utils/apirone');
const EmbedHelper = require('../utils/embedBuilder');
const config = require('../config');
const Logger = require('../utils/logger');
const crypto = require('crypto');
const logChannel = require('../utils/logChannel');
const { send: sendToChannel } = require('../utils/logChannel');

function isValidLtc(addr) {
  if (!addr) return false;
  return addr.startsWith('ltc1') || addr.startsWith('L') || addr.startsWith('M') || addr.startsWith('3');
}

module.exports = {
  name: 'withdraw',
  aliases: ['wd', 'w'],
  async execute(message, args, user) {
    const cfg = await Settings.findOne({ key: 'withdrawlsEnabled' });
    if (cfg && cfg.value === false) return message.reply({ embeds: [EmbedHelper.createError('Withdrawls are currently disabled by admin.')] });
    if (args.length < 2) {
      return message.reply({ embeds: [EmbedHelper.createError('Usage: `.withdraw <amount> <ltc_address>`\nExample: `.withdraw 5000 ltc1qx...`')] });
    }

    const pointsAmount = parseInt(args[0]);
    if (isNaN(pointsAmount) || pointsAmount <= 0) {
      return message.reply({ embeds: [EmbedHelper.createError('Invalid amount.')] });
    }

    const address = args[1];
    if (!isValidLtc(address)) {
      return message.reply({ embeds: [EmbedHelper.createError('Invalid LTC address. Must start with `ltc1`, `L`, `M`, or `3`.')] });
    }

    const minCfg = await Settings.findOne({ key: 'minWithdrawl' });
    const minW = minCfg ? Number(minCfg.value) || 200 : 200;
    const maxCfg = await Settings.findOne({ key: 'maxWithdrawl' });
    const maxW = maxCfg ? Number(maxCfg.value) || 100000 : 100000;
    if (pointsAmount < minW) {
      return message.reply({ embeds: [EmbedHelper.createError('Minimum withdrawl is **' + minW + ' points** ($' + (minW*0.01).toFixed(2) + ').')] });
    }
    if (pointsAmount > maxW) {
      return message.reply({ embeds: [EmbedHelper.createError('Maximum withdrawl is **' + maxW.toLocaleString() + ' points** ($' + (maxW*0.01).toFixed(2) + ').')] });
    }

    if (user.balance < pointsAmount) {
      if (user.balance <= 0) return message.reply({ embeds: [EmbedHelper.createError('Invalid points — top up your balance to withdraw.')] });
      return message.reply({ embeds: [EmbedHelper.createError('Invalid points — you have **' + user.balance.toLocaleString() + '** points.')] });
    }
    if ((user.wagerRequired || 0) > 0) {
      return message.reply({ embeds: [EmbedHelper.createError('Wager requirement not met — wager **' + Math.floor(user.wagerRequired).toLocaleString() + '** more pts to unlock withdrawals.')] });
    }

    const statusMsg = await message.reply({ embeds: [EmbedHelper.createDefault().setDescription(config.emojis.loading + ' Processing withdrawal...').setColor(config.colors.warning)] });

    try {
      const cryptoAmount = ApironeAPI.convertPointsToCrypto(pointsAmount, 'ltc');
      const txId = 'WDX' + crypto.randomBytes(4).toString('hex').toUpperCase();

      user.balance -= pointsAmount;
      user.totalWithdrawn += pointsAmount;
      await user.save();

      await Transaction.create({
        transactionId: txId,
        userId: user.userId,
        username: user.username,
        type: 'withdraw',
        currency: 'ltc',
        amount: -pointsAmount,
        cryptoAmount: cryptoAmount,
        cryptoAddress: address,
        status: 'pending',
        description: 'Withdrawal of ' + pointsAmount + ' points (' + cryptoAmount.toFixed(6) + ' LTC)'
      });

      const embed = EmbedHelper.createDefault()
        .setTitle('📤 Withdrawal ' + config.emojis.litecoin)
        .setDescription('Withdrawal request submitted for **' + pointsAmount + '** points. Pending admin approval.')
        .addFields(
          { name: 'Currency', value: 'LTC', inline: true },
          { name: 'Amount Sent', value: cryptoAmount.toFixed(6) + ' LTC', inline: true },
          { name: 'Address', value: '`' + address.substring(0, 12) + '...' + address.substring(address.length - 6) + '`', inline: false },
          { name: 'Remaining Balance', value: user.balance.toLocaleString() + ' points', inline: true },
          { name: 'Transaction ID', value: '`' + txId + '`', inline: true },
          { name: 'Status', value: 'Pending review', inline: true }
        )
        .setColor(config.colors.warning)
        .setFooter({ text: 'EzBet • Withdrawal' })
        .setTimestamp();

      Logger.economy(user.userId, 'withdraw', pointsAmount);
      logChannel.send({ content: `**Withdrawal Requested (Bot)** — ${user.username} (\`${user.userId}\`)\nAmount: **${pointsAmount.toLocaleString()} pts** (${cryptoAmount.toFixed(6)} LTC)\nTo: \`${address.slice(0, 16)}...\`\nID: \`${txId}\`` });
      try {
        const reqChannel = await message.client.channels.fetch(config.withdrawRequestChannel);
        if (reqChannel) reqChannel.send({ content: `**Withdrawal Request** — ${user.username} (\`${user.userId}\`)\nAmount: **${pointsAmount.toLocaleString()} pts** ($${(pointsAmount * config.conversionRate).toFixed(2)})\nTo: \`${address}\`\nID: \`${txId}\`\nApprove: \`.wdapprove ${txId}\`` }).catch(() => {});
      } catch {}
      statusMsg.edit({ embeds: [embed] });
    } catch (error) {
      user.balance += pointsAmount;
      await user.save();
      Logger.error('Withdrawal error: ' + error.message);
      statusMsg.edit({ embeds: [EmbedHelper.createError('Withdrawal failed. Please try again later.')] });
    }
  }
};
