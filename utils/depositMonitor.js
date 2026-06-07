const User = require('../models/User');
const Transaction = require('../models/Transaction');
const ApironeAPI = require('./apirone');
const EmbedHelper = require('./embedBuilder');
const config = require('../config');
const crypto = require('crypto');

const POLL_INTERVAL = 60000;
const LTC_RATE = 80;

class DepositMonitor {
  static start(client) {
    setInterval(() => this.checkDeposits(client), POLL_INTERVAL);
    console.log('[DepositMonitor] Started (interval: 60s)');
  }

  static async checkDeposits(client) {
    try {
      const users = await User.find({ 'depositAddresses.ltc': { $ne: null } });
      for (const user of users) {
        const address = user.depositAddresses.ltc;
        const txs = await ApironeAPI.getAddressTransactions('ltc', address);
        if (!txs || !Array.isArray(txs)) continue;

        for (const tx of txs) {
          const txHash = tx.txid || tx.hash || tx.id;
          if (!txHash) continue;
          if ((user._lastCheckedTx && txHash <= user._lastCheckedTx) || user._processedTxs?.includes(txHash)) continue;

          const amount = (tx.amount || tx.value || 0) / 1e8;
          if (amount <= 0) continue;

          const confirmations = tx.confirmations || 0;
          const points = Math.floor(amount * LTC_RATE / config.conversionRate);

          if (confirmations > 0 && confirmations < 3) {
            await this.sendPending(client, user, txHash, amount, points, confirmations);
          } else if (confirmations >= 3) {
            await this.creditUser(client, user, txHash, amount, points);
          }
        }
      }
    } catch (err) {
      console.error(`[DepositMonitor] Error: ${err.message}`);
    }
  }

  static async sendPending(client, user, txHash, amount, points, confirmations) {
    const dmChannel = await client.users.fetch(user.userId).catch(() => null);
    if (!dmChannel) return;

    const embed = EmbedHelper.createDefault()
      .setTitle(`${config.emojis.loading} Deposit Pending`)
      .setDescription(`Transaction detected on chain! Waiting for confirmations...`)
      .addFields(
        { name: `${config.emojis.litecoin} Amount`, value: `${amount.toFixed(6)} LTC`, inline: true },
        { name: `${config.emojis.money} Points Incoming`, value: `**${points.toLocaleString()} pts**`, inline: true },
        { name: `${config.emojis.alert} Confirmations`, value: `${confirmations}/3`, inline: true },
        { name: 'Transaction', value: `\`${txHash.substring(0, 16)}...\``, inline: false }
      )
      .setColor(config.colors.warning)
      .setFooter({ text: 'Flipbets • Deposit' })
      .setTimestamp();

    await dmChannel.send({ embeds: [embed] }).catch(() => {});
  }

  static async creditUser(client, user, txHash, amount, points) {
    user.balance += points;
    user.totalDeposited += points;
    if (!user._processedTxs) user._processedTxs = [];
    user._processedTxs.push(txHash);
    if (user._processedTxs.length > 20) user._processedTxs = user._processedTxs.slice(-20);
    await user.save();

    const txId = 'LTC' + crypto.randomBytes(4).toString('hex').toUpperCase();
    await Transaction.create({
      transactionId: txId,
      userId: user.userId,
      username: user.username,
      type: 'deposit',
      currency: 'ltc',
      amount: points,
      cryptoAmount: amount,
      cryptoAddress: user.depositAddresses.ltc,
      cryptoHash: txHash,
      status: 'completed',
      description: `LTC Deposit: ${amount.toFixed(6)} LTC → ${points} pts`
    });

    const dmChannel = await client.users.fetch(user.userId).catch(() => null);
    if (!dmChannel) return;

    const embed = EmbedHelper.createDefault()
      .setTitle(`${config.emojis.tick} Deposit Credited!`)
      .setDescription(`Your deposit of **${amount.toFixed(6)} LTC** has been confirmed and credited!`)
      .addFields(
        { name: `${config.emojis.litecoin} Amount`, value: `${amount.toFixed(6)} LTC`, inline: true },
        { name: `${config.emojis.money} Points Credited`, value: `**+${points.toLocaleString()} pts**`, inline: true },
        { name: `${config.emojis.wallet} New Balance`, value: `**${user.balance.toLocaleString()} pts**`, inline: true },
        { name: 'Transaction', value: `\`${txHash.substring(0, 16)}...\``, inline: false },
        { name: 'Transaction ID', value: `\`${txId}\``, inline: false }
      )
      .setColor(config.colors.success)
      .setFooter({ text: 'Flipbets • Deposit' })
      .setTimestamp();

    await dmChannel.send({ embeds: [embed] }).catch(() => {});

    const channel = client.channels.cache.get(config.publicBetsChannel);
    if (channel) {
      const pubEmbed = EmbedHelper.createDefault()
        .setTitle(`${config.emojis.litecoin} Deposit`)
        .setDescription(`${user.username} deposited **$${(amount * LTC_RATE).toFixed(2)}** worth of LTC!`)
        .setColor(config.colors.success)
        .setTimestamp();
      channel.send({ embeds: [pubEmbed] }).catch(() => {});
    }
  }
}

module.exports = DepositMonitor;
