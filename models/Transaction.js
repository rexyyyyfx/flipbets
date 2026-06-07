const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  transactionId: { type: String, required: true, unique: true },
  userId: { type: String, required: true },
  username: { type: String, default: 'Unknown' },
  type: { type: String, enum: ['deposit', 'withdraw', 'bet', 'win', 'admin', 'bonus', 'rakeback', 'tip'], required: true },
  currency: { type: String, enum: ['points', 'ltc'], default: 'points' },
  amount: { type: Number, required: true },
  fee: { type: Number, default: 0 },
  status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'completed' },
  cryptoAmount: { type: Number, default: null },
  cryptoAddress: { type: String, default: null },
  cryptoHash: { type: String, default: null },
  description: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

transactionSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Transaction', transactionSchema);
