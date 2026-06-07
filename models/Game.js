const mongoose = require('mongoose');

const gameSchema = new mongoose.Schema({
  gameId: { type: String, required: true, unique: true },
  userId: { type: String, required: true },
  username: { type: String, default: 'Unknown' },
  gameType: { type: String, required: true },
  betAmount: { type: Number, required: true },
  payout: { type: Number, default: 0 },
  multiplier: { type: Number, default: 0 },
  result: { type: String, default: 'lose' },
  serverSeed: { type: String, required: true },
  clientSeed: { type: String, required: true },
  nonce: { type: Number, default: 0 },
  seedHash: { type: String },
  details: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now }
});

gameSchema.index({ userId: 1, createdAt: -1 });
gameSchema.index({ gameType: 1, createdAt: -1 });

gameSchema.post('save', async function (doc) {
  try {
    if (!doc || !['win', 'lose', 'tie', 'blackjack'].includes(doc.result)) return;
    const WagerRace = mongoose.models.WagerRace || require('./WagerRace');
    if (!WagerRace) return;
    const User = mongoose.models.User || require('./User');
    const u = await User.findOne({ userId: doc.userId }).select('username avatar').lean();
    await WagerRace.addWager(doc.userId, u?.username || doc.username, u?.avatar, doc.betAmount);
  } catch (e) { console.error('race post-save err', e); }
});

async function trackRace(doc) {
  try {
    if (!doc || !['win', 'lose', 'tie', 'blackjack'].includes(doc.result)) return;
    const WagerRace = mongoose.models.WagerRace || require('./WagerRace');
    if (!WagerRace) return;
    const User = mongoose.models.User || require('./User');
    const u = await User.findOne({ userId: doc.userId }).select('username avatar').lean();
    await WagerRace.addWager(doc.userId, u?.username || doc.username, u?.avatar, doc.betAmount);
  } catch (e) { console.error('race findOneAndUpdate err', e); }
}
gameSchema.post('findOneAndUpdate', async function (doc) { if (doc) await trackRace(doc); });
gameSchema.post('updateOne', async function (result) {
  try {
    if (!result || result.modifiedCount === 0) return;
    const doc = await this.model.findOne(this.getQuery()).lean();
    if (doc) await trackRace(doc);
  } catch (e) { console.error('race updateOne err', e); }
});

module.exports = mongoose.models.Game || mongoose.model('Game', gameSchema);
