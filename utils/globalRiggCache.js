const Settings = require('../models/Settings');
let cached = null;
let lastFetch = 0;
const TTL = 10000;

async function get() {
  if (cached !== null && Date.now() - lastFetch < TTL) return cached;
  try {
    const doc = await Settings.findOne({ key: 'globalRiggPercent' }).lean();
    cached = doc ? Number(doc.value) || 0 : 0;
  } catch {
    cached = 0;
  }
  lastFetch = Date.now();
  return cached;
}

function clear() {
  cached = null;
  lastFetch = 0;
}

function peek() {
  return cached;
}

module.exports = { get, clear, peek };
