const mongoose = require('mongoose');

const promoSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, uppercase: true },
  amount: { type: Number, required: true },
  maxUses: { type: Number, default: 1 },
  used: { type: Number, default: 0 },
  usedBy: [{
    userId: String,
    username: String,
    at: { type: Date, default: Date.now }
  }],
  wagerReq: { type: Number, default: 0 },
  wagerMult: { type: Number, default: 2 },
  minRank: { type: String, default: '' },
  withdrawlWagerReq: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, default: null }
});

module.exports = mongoose.model('PromoCode', promoSchema);
