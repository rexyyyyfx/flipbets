const crypto = require('crypto');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const ApironeAPI = require('./apirone');
const EmbedHelper = require('./embedBuilder');
const config = require('../config');
const logChannel = require('./logChannel');

const REQUIRED_CONFIRMATIONS = Number(process.env.DEPOSIT_CONFIRMATIONS || 3);
let discordClient = null;

function roundPts(v) {
  return Math.round(Number(v || 0) * 100) / 100;
}

function amountToSatoshi(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n < 1 ? Math.floor(n * 1e8) : Math.floor(n);
}

function normalizeConfirmations(value, tx) {
  const raw = Number(value ?? tx?.confirmations ?? tx?.confirmation ?? tx?.conf);
  if (Number.isFinite(raw) && raw >= 0) return Math.floor(raw);
  if (tx?.is_confirmed === true) return REQUIRED_CONFIRMATIONS;
  if (tx?.is_confirmed === false) return 0;
  const height = Number(tx?.block?.height || 0);
  if (height > 1 || tx?.block?.hash) return REQUIRED_CONFIRMATIONS;
  return 0;
}

function normalizeWebhook(body = {}) {
  const address = body.input_address || body.address || body.inputs?.[0]?.address || body.data?.address;
  const txHash = body.input_transaction_hash || body.txid || body.tx_hash || body.hash || body.id || body.payment;
  const satoshi = amountToSatoshi(body.value ?? body.amount ?? body.satoshi);
  const currency = String(body.currency || 'ltc').toLowerCase();
  return {
    address,
    currency,
    txHash,
    satoshi,
    confirmations: normalizeConfirmations(body.confirmations ?? body.confirmation ?? body.conf, body)
  };
}

function normalizeHistoryTx(tx = {}, address) {
  return {
    address,
    currency: String(tx.currency || 'ltc').toLowerCase(),
    txHash: tx.txid || tx.tx_hash || tx.hash || tx.id,
    satoshi: amountToSatoshi(tx.amount ?? tx.value ?? tx.satoshi),
    confirmations: normalizeConfirmations(undefined, tx)
  };
}

function txBaseKey(data) {
  return `${data.currency || 'ltc'}:${data.txHash || data.address + ':' + data.satoshi}`;
}

async function sendDm(userId, payload) {
  const client = discordClient;
  if (!client || !userId) return false;
  const target = await client.users.fetch(userId).catch(() => null);
  if (!target) return false;
  await target.send(payload).catch(() => null);
  return true;
}

function pendingEmbed({ satoshi, confirmations, txHash }) {
  const ltcAmount = satoshi / 1e8;
  const points = ApironeAPI.convertCryptoToPoints(ltcAmount, 'ltc');
  return EmbedHelper.createDefault()
    .setTitle(`${config.emojis.loading} Deposit Detected`)
    .setDescription('Your LTC deposit is on-chain. It will credit automatically after enough confirmations.')
    .addFields(
      { name: `${config.emojis.litecoin} Amount`, value: `${ltcAmount.toFixed(8)} LTC`, inline: true },
      { name: `${config.emojis.money} Incoming`, value: `${points.toLocaleString()} pts`, inline: true },
      { name: `${config.emojis.alert} Confirmations`, value: `${confirmations}/${REQUIRED_CONFIRMATIONS}`, inline: true },
      { name: 'Transaction', value: `\`${String(txHash || 'pending').slice(0, 24)}...\``, inline: false }
    )
    .setColor(config.colors.warning)
    .setFooter({ text: 'EzBet Deposit' })
    .setTimestamp();
}

function creditedEmbed({ user, satoshi, points, txHash, transactionId }) {
  const ltcAmount = satoshi / 1e8;
  return EmbedHelper.createDefault()
    .setTitle(`${config.emojis.tick} Deposit Credited`)
    .setDescription(`Your deposit of **${ltcAmount.toFixed(8)} LTC** has been credited.`)
    .addFields(
      { name: `${config.emojis.money} Points`, value: `+${points.toLocaleString()} pts`, inline: true },
      { name: `${config.emojis.wallet} Balance`, value: `${roundPts(user.balance).toLocaleString()} pts`, inline: true },
      { name: 'Transaction', value: `\`${String(txHash || transactionId).slice(0, 24)}...\``, inline: false },
      { name: 'Receipt', value: `\`${transactionId}\``, inline: false }
    )
    .setColor(config.colors.success)
    .setFooter({ text: 'EzBet Deposit' })
    .setTimestamp();
}

class DepositProcessor {
  static setClient(client) {
    discordClient = client;
  }

  static normalizeWebhook(body) {
    return normalizeWebhook(body);
  }

  static normalizeHistoryTx(tx, address) {
    return normalizeHistoryTx(tx, address);
  }

  static async process(data, opts = {}) {
    if (!data || data.currency !== 'ltc') return { status: 'ignored', reason: 'currency' };
    if (!data.address || !data.satoshi || data.satoshi <= 0) return { status: 'ignored', reason: 'missing-data' };

    const baseKey = txBaseKey(data);
    const creditedKey = `apirone:credited:${baseKey}`;
    const user = await User.findOne({ 'depositAddresses.ltc': data.address });
    if (!user) return { status: 'ignored', reason: 'no-user' };
    if (user._processedTxs?.includes(creditedKey)) return { status: 'deduped' };

    if (data.confirmations < REQUIRED_CONFIRMATIONS) {
      const pendingKey = `apirone:pending:${baseKey}:${data.confirmations}`;
      if (!user._processedTxs?.includes(pendingKey)) {
        user._processedTxs = user._processedTxs || [];
        user._processedTxs.push(pendingKey);
        if (user._processedTxs.length > 200) user._processedTxs = user._processedTxs.slice(-200);
        await user.save();
        await sendDm(user.userId, { embeds: [pendingEmbed(data)] });
      }
      return { status: 'pending', confirmations: data.confirmations };
    }

    const ltcAmount = data.satoshi / 1e8;
    const points = ApironeAPI.convertCryptoToPoints(ltcAmount, 'ltc');
    if (points <= 0) return { status: 'ignored', reason: 'too-small' };
    const wagerReq = roundPts(points * 2);

    const updated = await User.findOneAndUpdate(
      { userId: user.userId, _processedTxs: { $ne: creditedKey } },
      {
        $inc: {
          balance: points,
          totalDeposited: points,
          wagerRequired: wagerReq,
          depositLocked: wagerReq
        },
        $addToSet: { _processedTxs: creditedKey },
        $set: { username: user.username || 'Unknown' }
      },
      { new: true }
    );
    if (!updated) return { status: 'deduped' };

    if (updated._processedTxs.length > 200) {
      updated._processedTxs = updated._processedTxs.slice(-200);
      await updated.save();
    }

    const transactionId = 'DEP' + crypto.randomBytes(5).toString('hex').toUpperCase();
    await Transaction.create({
      transactionId,
      userId: updated.userId,
      username: updated.username,
      type: 'deposit',
      currency: 'ltc',
      amount: points,
      cryptoAmount: ltcAmount,
      cryptoAddress: data.address,
      cryptoHash: data.txHash || null,
      status: 'completed',
      description: `LTC deposit: ${ltcAmount.toFixed(8)} LTC (${opts.source || 'apirone'})`
    });

    await sendDm(updated.userId, { embeds: [creditedEmbed({ user: updated, satoshi: data.satoshi, points, txHash: data.txHash, transactionId })] });
    logChannel.send({ content: `**Deposit Credited** — ${updated.username} (\`${updated.userId}\`)\nAmount: **${ltcAmount.toFixed(8)} LTC** (${points.toLocaleString()} pts)\nTransaction: \`${String(data.txHash || transactionId).slice(0, 24)}...\`` });
    return { status: 'credited', points, user: updated, transactionId };
  }
}

module.exports = DepositProcessor;
module.exports.sendDm = sendDm;
