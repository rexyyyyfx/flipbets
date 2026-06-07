const mongoose = require('mongoose');

const RaceEntrySchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  username: String,
  avatar: String,
  wagered: { type: Number, default: 0 },
  prize: { type: Number, default: 0 }
}, { _id: false });

const WagerRaceSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  title: { type: String, default: '$500 Wager Race' },
  prizePool: { type: Number, default: 50000 },
  startAt: { type: Date, default: Date.now },
  endAt: { type: Date, required: true },
  status: { type: String, enum: ['active', 'ended', 'draft'], default: 'active' },
  distribution: {
    type: [Number],
    default: [40, 25, 15, 10, 7, 3]
  },
  entries: [RaceEntrySchema]
}, { timestamps: true });

WagerRaceSchema.index({ status: 1, endAt: -1 });

WagerRaceSchema.statics.getActive = async function () {
  let race = await this.findOne({ status: 'active' });
  if (!race) {
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    const startAt = new Date();
    const endAt = new Date(Date.now() + sevenDays);
    race = await this.create({ key: 'race-' + startAt.getTime(), title: '$500 Weekly Wager Race', prizePool: 50000, startAt, endAt, status: 'active' });
  }
  if (race.endAt < new Date() && race.status === 'active') {
    race.status = 'ended';
    await race.save();
  }
  return race;
};

WagerRaceSchema.statics.addWager = async function (userId, username, avatar, amount) {
  if (!amount || amount <= 0) return null;
  try {
    const Settings = require('./Settings');
    const s = await Settings.findOne({ key: 'wagerRaceEnabled' });
    if (s && s.value === false) return null;
  } catch {}
  const race = await this.getActive();
  let entry = race.entries.find(e => e.userId === userId);
  if (!entry) {
    entry = { userId, username, avatar, wagered: 0, prize: 0 };
    race.entries.push(entry);
  }
  entry.wagered += amount;
  entry.username = username || entry.username;
  entry.avatar = avatar || entry.avatar;
  await race.save();
  return race;
};

module.exports = mongoose.models.WagerRace || mongoose.model('WagerRace', WagerRaceSchema);
