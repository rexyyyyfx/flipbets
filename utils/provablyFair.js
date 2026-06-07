const crypto = require('crypto');

class ProvablyFair {
  constructor(serverSeed, clientSeed, nonce) {
    this.serverSeed = serverSeed;
    this.clientSeed = clientSeed;
    this.nonce = nonce;
    this._callCount = 0;
  }

  static generateServerSeed() {
    return crypto.randomBytes(32).toString('hex');
  }

  static hashServerSeed(serverSeed) {
    return crypto.createHash('sha256').update(serverSeed).digest('hex');
  }

  _nextHash() {
    const data = `${this.serverSeed}:${this.clientSeed}:${this.nonce}:${this._callCount++}`;
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  generateFloat(salt) {
    const hash = salt ? crypto.createHash('sha256').update(`${this.serverSeed}:${this.clientSeed}:${this.nonce}:${this._callCount++}:${salt}`).digest('hex') : this._nextHash();
    const int = parseInt(hash.substring(0, 8), 16);
    return int / 0xFFFFFFFF;
  }

  generateInt(min, max) {
    return Math.floor(this.generateFloat() * (max - min + 1)) + min;
  }

  generateMultiplier(maxMultiplier = 10000) {
    const float = this.generateFloat();
    const crashPoint = Math.floor(maxMultiplier / (1 - float + 0.0001));
    return Math.max(1, crashPoint / 100);
  }

  generateLimboMultiplier() {
    const float = this.generateFloat();
    const houseEdge = 0.99;
    const adjusted = float * houseEdge;
    const mult = 1 / (1 - adjusted);
    return Math.min(1000000, mult);
  }

  generateMinesPositions(width, height, mineCount) {
    const totalTiles = width * height;
    const positions = new Set();
    while (positions.size < mineCount) {
      const pos = this.generateInt(0, totalTiles - 1);
      positions.add(pos);
    }
    return Array.from(positions);
  }

  generateDeck() {
    const suits = ['h', 'd', 'c', 's'];
    const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    const deck = [];
    for (const suit of suits) {
      for (const rank of ranks) {
        deck.push({ rank, suit, value: this.getCardValue(rank) });
      }
    }
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(this.generateFloat() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }

  getCardValue(rank) {
    const values = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 10, 'Q': 10, 'K': 10, 'A': 11 };
    return values[rank];
  }

  static generateGameId() {
    return crypto.randomBytes(4).toString('hex').toUpperCase();
  }

  static generateClientSeed() {
    return crypto.randomBytes(8).toString('hex');
  }
}

module.exports = ProvablyFair;
