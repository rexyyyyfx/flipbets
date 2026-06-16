const User = require('../models/User');
const ApironeAPI = require('./apirone');
const DepositProcessor = require('./depositProcessor');
const logChannel = require('./logChannel');

const POLL_INTERVAL = 60000;

class DepositMonitor {
  static start(client) {
    DepositProcessor.setClient(client);
    logChannel.setClient(client);
    this.checkDeposits(client).catch(err => console.error(`[DepositMonitor] Error: ${err.message}`));
    setInterval(() => this.checkDeposits(client), POLL_INTERVAL);
    console.log('[DepositMonitor] Started (interval: 60s)');
  }

  static async checkDeposits() {
    if (!ApironeAPI.isConfigured()) return;
    try {
      const users = await User.find({ 'depositAddresses.ltc': { $exists: true, $ne: null } }).select('userId username depositAddresses _processedTxs');
      for (const user of users) {
        const address = user.depositAddresses?.ltc;
        if (!address || String(address).startsWith('MOCK_')) continue;
        const txs = await ApironeAPI.getAddressTransactions('ltc', address);
        if (!Array.isArray(txs) || !txs.length) continue;
        for (const tx of txs) {
          const data = DepositProcessor.normalizeHistoryTx(tx, address);
          const result = await DepositProcessor.process(data, { source: 'poller' });
          if (result.status === 'credited') {
            console.log(`[DepositMonitor] Credited ${result.points} pts to ${user.username || user.userId}`);
          }
        }
      }
    } catch (err) {
      console.error(`[DepositMonitor] Error: ${err.message}`);
    }
  }
}

module.exports = DepositMonitor;
