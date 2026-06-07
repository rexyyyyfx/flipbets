const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  username: { type: String, default: 'Unknown' },
  email: { type: String, default: null },
  balance: { type: Number, default: 0 },
  totalDeposited: { type: Number, default: 0 },
  totalWithdrawn: { type: Number, default: 0 },
  totalWagered: { type: Number, default: 0 },
  totalProfit: { type: Number, default: 0 },
  wagerRequired: { type: Number, default: 0 },
  depositLocked: { type: Number, default: 0 },
  promoLocked: { type: Number, default: 0 },
  tipLocked: { type: Number, default: 0 },
  gamesPlayed: { type: Number, default: 0 },
  wins: { type: Number, default: 0 },
  losses: { type: Number, default: 0 },
  depositAddresses: {
    ltc: { type: String, default: null }
  },
  createdAt: { type: Date, default: Date.now },
  lastDaily: { type: Date, default: null },
  isBanned: { type: Boolean, default: false },
  banReason: { type: String, default: '' },
  riggPercent: { type: Number, default: 0 },
  vip: { type: Boolean, default: false },
  avatar: { type: String, default: null },
  clientSeed: { type: String, default: null },
  activeServerSeed: { type: String, default: null },
  previousServerSeed: { type: String, default: null },
  seedRotatedAt: { type: Date, default: null },
  _processedTxs: { type: [String], default: [] }
});

userSchema.methods.addBalance = function(amount) {
  this.balance += amount;
  return this.save();
};

userSchema.methods.removeBalance = function(amount) {
  if (this.balance < amount) return false;
  this.balance -= amount;
  this.save();
  return true;
};

module.exports = mongoose.model('User', userSchema);
