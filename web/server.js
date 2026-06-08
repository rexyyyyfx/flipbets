const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const crypto = require('crypto');
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
const config = require('../config');
const User = require('../models/User');
const Game = require('../models/Game');
const Transaction = require('../models/Transaction');
const Settings = require('../models/Settings');
const PromoCode = require('../models/PromoCode');
const WagerRace = require('../models/WagerRace');
const ProvablyFair = require('../utils/provablyFair');
const ApironeAPI = require('../utils/apirone');
const { connectDB } = require('../models/db');
const Logger = require('../utils/logger');

const app = express();
app.set('trust proxy', 1);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'), { etag: false, lastModified: false, setHeaders: (res) => { res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate'); res.setHeader('Pragma', 'no-cache'); res.setHeader('Expires', '0'); } }));

/* ---- auth: signed cookie + URL token ---- */
const SALT = config.sessionSecret || 'flipbets-dev-secret';
function signUserId(id) { return id + '.' + crypto.createHmac('sha256', SALT).update('auth:'+id).digest('hex').slice(0,12); }
function unsignUserId(s) {
  if (!s || typeof s !== 'string') return null;
  const i = s.lastIndexOf('.');
  if (i === -1) return null;
  const id = s.slice(0, i);
  if (signUserId(id) !== s) return null;
  return id;
}
function parseCookies(h) {
  if (!h) return {};
  return Object.fromEntries(h.split(';').map(c => { const p = c.trim().indexOf('='); return p === -1 ? [c.trim(), ''] : [c.trim().slice(0,p), c.trim().slice(p+1)]; }));
}
function getAuthId(req) {
  const c = parseCookies(req.headers.cookie || ''); return unsignUserId(c.flip_token) || null;
}
function setAuthCookie(res, id) { res.cookie('flip_token', signUserId(id), { maxAge: 365*24*60*60*1000, httpOnly: true, sameSite: 'lax', path: '/' }); }

app.use(session({ secret: SALT, resave: true, saveUninitialized: true, cookie: { maxAge: 365*24*60*60*1000, httpOnly: true, sameSite: 'lax', secure: false, path: '/' } }));
app.use((req, res, next) => {
  Logger.info(`[${req.method}] ${req.path} sid=${req.session?.id ? req.session.id.slice(0,12)+'...' : 'none'} cookie=${getAuthId(req) ? 'yes' : 'no'}`);
  next();
});

function isAuth(req, res, next) {
  const uid = getAuthId(req);
  if (uid) { req.session.userId = uid; return next(); }
  res.status(401).json({ error: 'Not authenticated' });
}

async function isAuthAndActive(req, res, next) {
  const uid = getAuthId(req);
  if (!uid) return res.status(401).json({ error: 'Not authenticated' });
  req.session.userId = uid;
  const user = await User.findOne({ userId: uid });
  if (!user) return res.status(401).json({ error: 'User not found' });
  if (user.isBanned) return res.status(403).json({ error: 'You are banned' + (user.banReason ? ': ' + user.banReason : '') });
  const cfg = await getConfig();
  if (cfg.maintenance && !config.ownerIds.includes(uid)) return res.status(503).json({ error: 'Casino is under maintenance' });
  next();
}

function isAdmin(req, res, next) {
  const uid = getAuthId(req);
  if (!uid) return res.status(401).json({ error: 'Not authenticated' });
  if (!config.ownerIds || !config.ownerIds.includes(uid)) return res.status(403).json({ error: 'Forbidden' });
  req.session.userId = uid;
  next();
}

/* ---------- GLOBAL CONFIG (controlled by admin panel) ---------- */
const DEFAULT_CONFIG = {
  houseEdge: 2,
  houseEdgeMines: 2,
  houseEdgeLimbo: 2,
  houseEdgeBlackjack: 1.5,
  houseEdgeCoinflip: 2,
  houseEdgeHilo: 2,
  houseEdgeWheel: 4,
  rakebackPercent: 0.1,
  rakebackEnabled: false,
  dailyAmount: 1000,
  dailyEnabled: true,
  weeklyLossbackPercent: 10,
  weeklyLossbackCap: 50000,
  weeklyEnabled: true,
  monthlyAmount: 5000,
  monthlyMinWager: 10000,
  monthlyEnabled: true,
  rankupEnabled: true,
  maintenance: false,
  autoWithdrawl: false,
  manualWithdrawl: true,
  withdrawlsEnabled: true,
  minWithdrawl: 1000,
  maxWithdrawl: 100000,
  gamesEnabled: { mines: true, limbo: true, blackjack: true, coinflip: true, hilo: true, wheel: true },
  discordInvite: 'https://discord.gg/yourserver',
  rankBonuses: { bronze: 1, silver: 10, gold: 50, platinum: 100, diamond: 200, emerald: 300, ruby: 500, celestial: 750, eternal: 1000 },
  wagerRaceEnabled: true,
  rewardDiscordRequired: 'https://discord.gg/TsPsqkPG'
};
async function getConfig() {
  const docs = await Settings.find({ key: { $in: Object.keys(DEFAULT_CONFIG) } });
  const out = { ...DEFAULT_CONFIG };
  for (const d of docs) out[d.key] = d.value;
  return out;
}
async function setConfigKV(key, value) {
  await Settings.findOneAndUpdate({ key }, { key, value, updatedAt: new Date() }, { upsert: true });
}

function roundPts(v) { return Math.round(Number(v || 0) * 100) / 100; }

function sha256(str) { return crypto.createHash('sha256').update(str).digest('hex'); }

/* ---------- DISCORD AUTH ---------- */
app.get('/auth/discord', (req, res) => {
  const url = `https://discord.com/api/oauth2/authorize?client_id=${config.discord.clientId}&redirect_uri=${encodeURIComponent(config.discord.redirectUri)}&response_type=code&scope=identify%20email`;
  res.redirect(url);
});

app.get('/auth/discord/callback', async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) return res.redirect('/?error=no_code');
    const t = await axios.post('https://discord.com/api/oauth2/token',
      new URLSearchParams({ client_id: config.discord.clientId, client_secret: config.discord.clientSecret, grant_type: 'authorization_code', code, redirect_uri: config.discord.redirectUri }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    const u = await axios.get('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${t.data.access_token}` } });
    const { id, username, avatar: avatarHash, discriminator, email } = u.data;
    let user = await User.findOne({ userId: id });
    if (!user) user = await User.create({ userId: id, username, avatar: avatarHash, discriminator: discriminator || '0', email: email || null });
    else {
      user.username = username;
      user.avatar = avatarHash;
      if (email) user.email = email;
      await user.save();
    }
    const tok = signUserId(id);
    Logger.info(`Auth OK: ${username} (${id})`);
    setAuthCookie(res, id);
    res.redirect('/?token=' + tok);
  } catch (e) {
    Logger.error(`Discord auth error: ${e.message}`);
    res.redirect('/?error=auth_failed');
  }
});

app.get('/auth/logout', (req, res) => {
  res.clearCookie('flip_token', { path: '/' });
  req.session.destroy(() => res.redirect('/'));
});
app.post('/auth/logout', (req, res) => {
  res.clearCookie('flip_token', { path: '/' });
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/auth/verify', async (req, res) => {
  try {
    const token = req.query.token;
    const id = unsignUserId(token);
    if (!id) return res.status(401).json({ error: 'Invalid token' });
    req.session.userId = id;
    const user = await User.findOne({ userId: id });
    if (!user) return res.status(401).json({ error: 'User not found' });
    setAuthCookie(res, id);
    Logger.info(`Auth verify OK: ${id}`);
    const ranks = [
      { name: 'Bronze', min: 100, emoji: '🥉' }, { name: 'Silver', min: 1000, emoji: '🥈' },
      { name: 'Gold', min: 10000, emoji: '🥇' }, { name: 'Platinum', min: 50000, emoji: '💎' },
      { name: 'Emerald', min: 100000, emoji: '🔷' }, { name: 'Ruby', min: 500000, emoji: '🔴' },
      { name: 'Eternal', min: 1000000, emoji: '🟣' }
    ];
    let currentRank = ranks[0], nextRank = ranks[1];
    for (let i = ranks.length - 1; i >= 0; i--) {
      if (user.totalWagered >= ranks[i].min) { currentRank = ranks[i]; nextRank = ranks[i + 1] || null; break; }
    }
    const rankProgress = nextRank ? Math.min(100, ((user.totalWagered - currentRank.min) / (nextRank.min - currentRank.min)) * 100) : 100;
    res.json({
      userId: user.userId, username: user.username,
      avatar: avatarUrl(user.userId, user.avatar),
      balance: user.balance, totalDeposited: user.totalDeposited,
      totalWithdrawn: user.totalWithdrawn, totalWagered: user.totalWagered,
      totalProfit: user.totalProfit, gamesPlayed: user.gamesPlayed,
      wins: user.wins, losses: user.losses, createdAt: user.createdAt,
      clientSeed: user.clientSeed,
      rank: { name: currentRank.name, emoji: currentRank.emoji, progress: rankProgress, nextRank: nextRank ? nextRank.name : null, wagered: user.totalWagered, nextMin: nextRank ? nextRank.min : null }
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ---------- USER API ---------- */
function avatarUrl(userId, hash) {
  if (hash) return `https://cdn.discordapp.com/avatars/${userId}/${hash}.png?size=256`;
  const idx = Number(BigInt(userId) >> 22n) % 6;
  return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
}

app.get('/api/debug/auth', (req, res) => {
  const c = parseCookies(req.headers.cookie || '');
  res.json({
    hasSession: !!req.session,
    sessionId: req.session?.id,
    sessionUserId: req.session?.userId,
    cookieUserId: getAuthId(req),
    rawCookies: Object.keys(c),
    cookieHeader: req.headers.cookie || '(none)'
  });
});

app.get('/api/me', isAuth, async (req, res) => {
  try {
    const uid = req.session.userId || getAuthId(req);
    Logger.info(`/api/me uid=${uid} sessionUserId=${req.session.userId} cookieUid=${getAuthId(req)}`);
    const user = await User.findOne({ userId: uid });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const ranks = [
      { name: 'Bronze', min: 100, emoji: '🥉' }, { name: 'Silver', min: 1000, emoji: '🥈' },
      { name: 'Gold', min: 10000, emoji: '🥇' }, { name: 'Platinum', min: 50000, emoji: '💎' },
      { name: 'Emerald', min: 100000, emoji: '🔷' }, { name: 'Ruby', min: 500000, emoji: '🔴' },
      { name: 'Eternal', min: 1000000, emoji: '🟣' }
    ];
    let currentRank = ranks[0], nextRank = ranks[1];
    for (let i = ranks.length - 1; i >= 0; i--) {
      if (user.totalWagered >= ranks[i].min) { currentRank = ranks[i]; nextRank = ranks[i + 1] || null; break; }
    }
    const rankProgress = nextRank ? Math.min(100, ((user.totalWagered - currentRank.min) / (nextRank.min - currentRank.min)) * 100) : 100;
    res.json({
      userId: user.userId, username: user.username,
      avatar: avatarUrl(user.userId, user.avatar),
      balance: user.balance, totalDeposited: user.totalDeposited,
      totalWithdrawn: user.totalWithdrawn, totalWagered: user.totalWagered,
      totalProfit: user.totalProfit, gamesPlayed: user.gamesPlayed,
      wins: user.wins, losses: user.losses, createdAt: user.createdAt,
      clientSeed: user.clientSeed,
      wagerRequired: user.wagerRequired || 0,
      depositLocked: user.depositLocked || 0,
      promoLocked: user.promoLocked || 0,
      tipLocked: user.tipLocked || 0,
      rank: { name: currentRank.name, emoji: currentRank.emoji, progress: rankProgress, nextRank: nextRank ? nextRank.name : null, wagered: user.totalWagered, nextMin: nextRank ? nextRank.min : null }
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/user/:userId', async (req, res) => {
  try {
    const user = await User.findOne({ userId: req.params.userId });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ userId: user.userId, username: user.username, balance: user.balance, gamesPlayed: user.gamesPlayed, wins: user.wins, losses: user.losses });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/games/:userId', isAuth, async (req, res) => {
  try {
    if (req.params.userId !== req.session.userId) return res.status(403).json({ error: 'Forbidden' });
    const games = await Game.find({ userId: req.params.userId }).sort({ createdAt: -1 }).limit(50);
    res.json(games.map(g => ({ gameId: g.gameId, gameType: g.gameType, betAmount: g.betAmount, payout: g.payout, multiplier: g.multiplier, result: g.result, createdAt: g.createdAt })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/leaderboard', async (req, res) => {
  try {
    const type = req.query.type || 'wagered';
    let sortField = 'totalWagered';
    if (type === 'profit') sortField = 'totalProfit';
    else if (type === 'wins') sortField = 'wins';
    else if (type === 'balance') sortField = 'balance';
    const users = await User.find().sort({ [sortField]: -1 }).limit(10);
    const RANKS = [['Bronze', 0, 'bronze.webp', '#cd7f32'], ['Silver', 1000, 'silver.webp', '#c0c0c0'], ['Gold', 5000, 'gold.webp', '#ffd700'], ['Platinum', 25000, 'platinum.webp', '#7fe5ff'], ['Diamond', 100000, 'diamond.webp', '#b9f2ff'], ['Emerald', 250000, 'emerald.webp', '#2ecc71'], ['Ruby', 500000, 'ruby.webp', '#ff4d6d'], ['Celestial', 750000, 'celestial.webp', '#a855f7'], ['Eternal', 1000000, 'eternal.webp', '#ff9b25']];
    const getRank = (w) => { let c = RANKS[0]; for (const r of RANKS) { if (w >= r[1]) c = r; else break; } return { name: c[0], img: c[2], color: c[3] }; };
    res.json(users.map((u, i) => {
      const rk = getRank(u.totalWagered || 0);
      return { rank: i + 1, userId: u.userId, username: u.username, avatar: avatarUrl(u.userId, u.avatar), balance: u.balance, totalWagered: u.totalWagered, wins: u.wins, losses: u.losses, value: u[sortField] || 0, rankName: rk.name, rankImg: rk.img, rankColor: rk.color };
    }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/live-wins', async (req, res) => {
  try {
    const games = await Game.find({ result: { $in: ['win', 'blackjack'] }, payout: { $gt: 0 } })
      .sort({ createdAt: -1 })
      .limit(20);
    res.json(games.map(g => ({
      id: g.gameId,
      username: g.username,
      game: g.gameType,
      bet: g.betAmount,
      payout: g.payout,
      multiplier: g.multiplier,
      profit: (g.payout || 0) - g.betAmount,
      t: new Date(g.createdAt).getTime()
    })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/stats', async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalGames = await Game.countDocuments();
    const w = await Game.aggregate([{ $group: { _id: null, total: { $sum: '$betAmount' } } }]);
    const h = await Game.aggregate([{ $group: { _id: null, b: { $sum: '$betAmount' }, p: { $sum: '$payout' } } }]);
    res.json({ totalUsers, totalGames, totalWagered: w[0]?.total || 0, houseProfit: (h[0]?.b || 0) - (h[0]?.p || 0) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

  /* ---------- MINES GAME ---------- */
  const minesGames = new Map();

  function insufficientErr(user, b) {
    if (!user || !b) return { error: 'Invalid points — top up your balance to play' };
    if (user.balance < b) {
      if (user.balance <= 0) return { error: 'Invalid points — top up your balance to play' };
      return { error: 'Invalid points — you have ' + Math.floor(user.balance).toLocaleString() + ' pts, need ' + Math.floor(b).toLocaleString() };
    }
    return null;
  }

  function applyWagerDecrement(user, bet) {
    if (!user || !bet || bet <= 0) return;
    const dec = Math.min(bet, user.wagerRequired || 0);
    if (dec <= 0) return;
    const ratio = dec / (user.wagerRequired || 1);
    user.wagerRequired = roundPts((user.wagerRequired || 0) - dec);
    user.depositLocked = roundPts(Math.max(0, (user.depositLocked || 0) - (user.depositLocked || 0) * ratio));
    user.promoLocked   = roundPts(Math.max(0, (user.promoLocked   || 0) - (user.promoLocked   || 0) * ratio));
    user.tipLocked     = roundPts(Math.max(0, (user.tipLocked     || 0) - (user.tipLocked     || 0) * ratio));
  }

  function addWagerRequirement(user, amount, source) {
    if (!user || !amount || amount <= 0) return;
    const mult = 2;
    const req = roundPts(amount * mult);
    user.wagerRequired = roundPts((user.wagerRequired || 0) + req);
    if (source === 'deposit') user.depositLocked = roundPts((user.depositLocked || 0) + req);
    else if (source === 'promo') user.promoLocked = roundPts((user.promoLocked || 0) + req);
    else if (source === 'tip')  user.tipLocked   = roundPts((user.tipLocked   || 0) + req);
    else user.depositLocked = roundPts((user.depositLocked || 0) + req);
  }

  app.post('/api/games/mines/start', isAuth, async (req, res) => {
    try {
      const { bet, bombs } = req.body;
      if (!bet || bet <= 0 || !Number.isInteger(bombs) || bombs < 1 || bombs > 24) return res.status(400).json({ error: 'Invalid bet or bomb count' });
      let user = await User.findOne({ userId: req.session.userId });
      if (!user) return res.status(404).json({ error: 'User not found' });
      const b = roundPts(parseFloat(bet));
      const insErr = insufficientErr(user, b);
      if (insErr) return res.status(400).json(insErr);

      const serverSeed = ProvablyFair.generateServerSeed();
      const clientSeed = user.clientSeed || ProvablyFair.generateClientSeed();
      const nonce = user.gamesPlayed + 1;
      const pf = new ProvablyFair(serverSeed, clientSeed, nonce);
      let minePositions = pf.generateMinesPositions(5, 5, bombs);
      if (user.riggPercent && user.riggPercent > 0 && Math.random() * 100 < user.riggPercent) {
        const safe = 25 - bombs;
        const wantBomb = true;
        const firstRevealIdx = Math.floor(Math.random() * safe);
        const realBomb = minePositions[firstRevealIdx % minePositions.length];
        if (!minePositions.includes(realBomb)) minePositions.push(realBomb);
      }

      user.balance = roundPts(user.balance - b);
      user.gamesPlayed++;
      user.totalWagered = roundPts((user.totalWagered || 0) + b);
      applyWagerDecrement(user, b);
      await user.save();

      const gameId = ProvablyFair.generateGameId();
      const gameData = {
        gameId, userId: user.userId, bet: b, bombs,
        minePositions, revealed: [], serverSeed, clientSeed, nonce,
        multiplier: 1, payout: 0, startedAt: Date.now(), gameOver: false
      };
    gameData.multiplierFn = function (revealed) {
      const safe = 25 - bombs;
      const arr = Array.isArray(revealed) ? revealed : gameData.revealed;
      const shown = arr.filter(i => !gameData.minePositions.includes(i)).length;
      if (shown <= 0) return 1;
      return Math.round(0.97 * Math.pow(safe / Math.max(1, safe - shown), bombs) * 100) / 100;
    };
      minesGames.set(gameId, gameData);

    await Game.create({
      gameId, userId: user.userId, username: user.username,
      gameType: 'Mines', betAmount: b, payout: 0, multiplier: 1,
      result: 'pending', serverSeed, clientSeed, nonce,
      details: { bombCount: bombs, minePositions, revealed: [] }
    });

    res.json({ gameId, bombs, bet: b, balance: user.balance });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/games/mines/reveal', isAuth, async (req, res) => {
  try {
    const { gameId, tile, idx } = req.body;
    const tileIdx = tile !== undefined ? tile : idx;
    const g = minesGames.get(gameId);
    if (!g || g.gameOver) return res.status(400).json({ error: 'Game not found or over' });
    if (g.userId !== req.session.userId) return res.status(403).json({ error: 'Forbidden' });
    if (!Array.isArray(g.revealed)) g.revealed = [];
    if (!Array.isArray(g.minePositions)) g.minePositions = [];
    if (typeof tileIdx !== 'number' || tileIdx < 0 || tileIdx > 24 || g.revealed.includes(tileIdx)) return res.status(400).json({ error: 'Invalid tile' });

    g.revealed.push(tileIdx);
    const isBomb = g.minePositions.includes(tileIdx);

    if (isBomb) {
      g.gameOver = true;
      g.payout = 0;
      g.multiplier = 0;
      const user = await User.findOne({ userId: g.userId });
      if (user) { user.losses = (user.losses || 0) + 1; await user.save(); }
      await Game.findOneAndUpdate({ gameId }, { result: 'lose', payout: 0, multiplier: 0, 'details.revealed': g.revealed });
      minesGames.delete(gameId);
      return res.json({ gameOver: true, isBomb: true, revealed: g.revealed, minePositions: g.minePositions, balance: user?.balance || 0, bet: g.bet });
    }

    g.multiplier = g.multiplierFn(g.revealed);
    g.payout = roundPts(g.bet * g.multiplier);
    await Game.findOneAndUpdate({ gameId }, { multiplier: g.multiplier, payout: g.payout, 'details.revealed': g.revealed });
    res.json({ gameOver: false, isBomb: false, tile: tileIdx, revealed: g.revealed, multiplier: g.multiplier, payout: g.payout });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/games/mines/cashout', isAuth, async (req, res) => {
  try {
    const { gameId } = req.body;
    const g = minesGames.get(gameId);
    if (!g || g.gameOver) return res.status(400).json({ error: 'Game not found or over' });
    if (g.userId !== req.session.userId) return res.status(403).json({ error: 'Forbidden' });
    if (!Array.isArray(g.revealed)) g.revealed = [];
    if (!Array.isArray(g.minePositions)) g.minePositions = [];
    const safeReveals = g.revealed.filter(i => !g.minePositions.includes(i)).length;
    if (safeReveals === 0 || g.multiplier <= 1) return res.status(400).json({ error: 'Reveal at least 1 safe tile first' });

    g.gameOver = true;
    const user = await User.findOne({ userId: g.userId });
    if (user) {
      user.balance = roundPts(user.balance + g.payout);
      user.wins = (user.wins || 0) + 1;
      await user.save();
    }
    await Game.findOneAndUpdate({ gameId }, { result: 'win', payout: g.payout, multiplier: g.multiplier, 'details.revealed': g.revealed });
    minesGames.delete(gameId);
    res.json({ gameOver: true, isBomb: false, revealed: g.revealed, minePositions: g.minePositions, multiplier: g.multiplier, payout: g.payout, balance: user?.balance || 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ---------- BLACKJACK ---------- */
const bjGames = new Map();

function bjMakeDeck() {
  const suits = ['s','h','d','c'];
  const deck = [];
  for (const s of suits) for (let r = 1; r <= 13; r++) deck.push({ s, r });
  return deck;
}
function bjShuffle(deck, pf, salt='bj') {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(pf.generateFloat(salt + i) * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
function bjCardVal(card) {
  if (card.r >= 11) return 10;
  if (card.r === 1) return 11;
  return card.r;
}
function bjHandTotal(hand) {
  let total = 0, aces = 0;
  for (const c of hand) { total += bjCardVal(c); if (c.r === 1) aces++; }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}
function bjSerializeHand(hand) {
  return hand.map(c => ({ s: c.s, r: c.r, f: { s:'♠', h:'♥', d:'♦', c:'♣' }[c.s] }));
}

app.post('/api/games/blackjack/start', isAuth, async (req, res) => {
  try {
    const { bet } = req.body;
    if (!bet || bet <= 0) return res.status(400).json({ error: 'Invalid bet' });
    const user = await User.findOne({ userId: req.session.userId });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const b = roundPts(parseFloat(bet));
    const insErr = insufficientErr(user, b);
    if (insErr) return res.status(400).json(insErr);

    const serverSeed = ProvablyFair.generateServerSeed();
    const clientSeed = user.clientSeed || ProvablyFair.generateClientSeed();
    const nonce = user.gamesPlayed + 1;
    const pf = new ProvablyFair(serverSeed, clientSeed, nonce);
    let deck = bjShuffle(bjMakeDeck(), pf);
    const playerHand = [deck.pop(), deck.pop()];
    const dealerHand = [deck.pop(), deck.pop()];

    user.balance = roundPts(user.balance - b);
    user.gamesPlayed++;
    user.totalWagered = roundPts((user.totalWagered || 0) + b);
    applyWagerDecrement(user, b);
    await user.save();

    const gameId = ProvablyFair.generateGameId();
    bjGames.set(gameId, {
      gameId, userId: user.userId, bet: b, deck, playerHand, dealerHand,
      serverSeed, clientSeed, nonce, doubled: false, gameOver: false, currentBet: b
    });

    await Game.create({
      gameId, userId: user.userId, username: user.username,
      gameType: 'Blackjack', betAmount: b, payout: 0, multiplier: 1,
      result: 'pending', serverSeed, clientSeed, nonce,
      details: { playerHand, dealerHand }
    });

    const playerTotal = bjHandTotal(playerHand);
    const isBlackjack = playerTotal === 21;
    let result = null, payout = 0;

    if (isBlackjack) {
      payout = roundPts(b * 2.5);
      user.balance = roundPts(user.balance + payout);
      user.wins = (user.wins || 0) + 1;
      result = 'blackjack';
      await Game.findOneAndUpdate({ gameId }, { result: 'win', payout, multiplier: 2.5 });
      bjGames.delete(gameId);
    }

    res.json({
      gameId,
      playerHand: bjSerializeHand(playerHand),
      dealerHand: bjSerializeHand([dealerHand[0], { hidden: true }]),
      balance: user.balance,
      result, payout,
      currentBet: b,
      finished: !!result,
      canDouble: !result,
      gameOver: !!result
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

async function bjDealerPlay(gameId) {
  const g = bjGames.get(gameId);
  if (!g) return null;
  while (bjHandTotal(g.dealerHand) < 17) g.dealerHand.push(g.deck.pop());
  return g;
}

app.post('/api/games/blackjack/hit', isAuth, async (req, res) => {
  try {
    const { gameId } = req.body;
    const g = bjGames.get(gameId);
    if (!g || g.gameOver) return res.status(400).json({ error: 'Game not found or over' });
    if (g.userId !== req.session.userId) return res.status(403).json({ error: 'Forbidden' });

    g.playerHand.push(g.deck.pop());
    const total = bjHandTotal(g.playerHand);
    let result = null, payout = 0, gameOver = false, balance = null;
    if (total > 21) {
      g.gameOver = true;
      const user = await User.findOne({ userId: g.userId });
      if (user) { user.losses = (user.losses || 0) + 1; await user.save(); balance = user.balance; }
      await Game.findOneAndUpdate({ gameId }, { result: 'lose', payout: 0, multiplier: 0, 'details.playerHand': g.playerHand });
      bjGames.delete(gameId);
      result = 'lose'; gameOver = true;
    } else {
      await Game.findOneAndUpdate({ gameId }, { 'details.playerHand': g.playerHand });
    }
    res.json({
      gameOver, finished: gameOver, canDouble: !gameOver && g.playerHand.length === 2,
      dealerHand: bjSerializeHand([g.dealerHand[0], { hidden: true }]),
      playerHand: bjSerializeHand(g.playerHand),
      result, payout, balance, currentBet: g.currentBet
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/games/blackjack/stand', isAuth, async (req, res) => {
  try {
    const { gameId } = req.body;
    const g = bjGames.get(gameId);
    if (!g || g.gameOver) return res.status(400).json({ error: 'Game not found or over' });
    if (g.userId !== req.session.userId) return res.status(403).json({ error: 'Forbidden' });

    await bjDealerPlay(gameId);
    const updated = bjGames.get(gameId);
    const playerTotal = bjHandTotal(updated.playerHand);
    const dealerTotal = bjHandTotal(updated.dealerHand);
    let result, payout = 0;
    if (dealerTotal > 21 || playerTotal > dealerTotal) {
      result = 'win';
      payout = roundPts(updated.currentBet * 2);
    } else if (playerTotal === dealerTotal) {
      result = 'push';
      payout = updated.currentBet;
    } else {
      result = 'lose';
      payout = 0;
    }
    g.gameOver = true;
    const user = await User.findOne({ userId: g.userId });
    if (user) {
      user.balance = roundPts(user.balance + payout);
      if (result === 'win') user.wins = (user.wins || 0) + 1;
      else if (result === 'lose') user.losses = (user.losses || 0) + 1;
      await user.save();
    }
    const dbResult = result === 'push' ? 'tie' : (result === 'win' ? 'win' : 'lose');
    await Game.findOneAndUpdate({ gameId }, { result: dbResult, payout, 'details.dealerHand': updated.dealerHand, 'details.playerHand': updated.playerHand });
    bjGames.delete(gameId);
    res.json({
      gameOver: true, finished: true, canDouble: false, result, payout,
      balance: user?.balance || 0,
      dealerHand: bjSerializeHand(updated.dealerHand),
      playerHand: bjSerializeHand(updated.playerHand),
      currentBet: updated.currentBet
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/games/blackjack/double', isAuth, async (req, res) => {
  try {
    const { gameId } = req.body;
    const g = bjGames.get(gameId);
    if (!g || g.gameOver) return res.status(400).json({ error: 'Game not found or over' });
    if (g.userId !== req.session.userId) return res.status(403).json({ error: 'Forbidden' });
    if (g.playerHand.length !== 2) return res.status(400).json({ error: 'Can only double on initial deal' });

    const user = await User.findOne({ userId: g.userId });
    if (!user || user.balance < g.currentBet) {
      const insErr = insufficientErr(user, g.currentBet);
      return res.status(400).json(insErr || { error: 'Insufficient balance' });
    }

    user.balance = roundPts(user.balance - g.currentBet);
    user.totalWagered = roundPts((user.totalWagered || 0) + g.currentBet);
    applyWagerDecrement(user, g.currentBet);
    await user.save();
    g.currentBet = roundPts(g.currentBet * 2);
    g.doubled = true;

    g.playerHand.push(g.deck.pop());
    const playerTotal = bjHandTotal(g.playerHand);

    let result, payout = 0, gameOver = false;
    if (playerTotal > 21) {
      result = 'lose';
      gameOver = true;
      user.losses = (user.losses || 0) + 1;
      await user.save();
    } else {
      await bjDealerPlay(gameId);
      const updated = bjGames.get(gameId);
      const dealerTotal = bjHandTotal(updated.dealerHand);
      if (dealerTotal > 21 || playerTotal > dealerTotal) {
        result = 'win';
        payout = roundPts(g.currentBet * 2);
      } else if (playerTotal === dealerTotal) {
        result = 'push';
        payout = g.currentBet;
      } else {
        result = 'lose';
        payout = 0;
      }
      if (result === 'win') user.wins = (user.wins || 0) + 1;
      else if (result === 'lose') user.losses = (user.losses || 0) + 1;
      user.balance = roundPts(user.balance + payout);
      await user.save();
    }
    g.gameOver = true;
    const dbResult = result === 'push' ? 'tie' : (result === 'win' ? 'win' : 'lose');
    await Game.findOneAndUpdate({ gameId }, { result: dbResult, payout, betAmount: g.currentBet });
    const finalHand = bjGames.get(gameId);
    bjGames.delete(gameId);
    res.json({
      gameOver, finished: true, canDouble: false, result, payout,
      balance: user?.balance || 0,
      playerHand: bjSerializeHand(g.playerHand),
      dealerHand: finalHand ? bjSerializeHand(finalHand.dealerHand) : bjSerializeHand(g.dealerHand),
      currentBet: g.currentBet
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ---------- LIMBO ---------- */
const limboGames = new Map();

app.post('/api/games/limbo/start', isAuth, async (req, res) => {
  try {
    const { bet, target } = req.body;
    if (!bet || bet <= 0) return res.status(400).json({ error: 'Invalid bet' });
    if (!target || target < 1.01 || target > 1000) return res.status(400).json({ error: 'Target must be 1.01-1000' });
    const user = await User.findOne({ userId: req.session.userId });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const b = roundPts(parseFloat(bet));
    const insErr = insufficientErr(user, b);
    if (insErr) return res.status(400).json(insErr);

    const serverSeed = ProvablyFair.generateServerSeed();
    const clientSeed = user.clientSeed || ProvablyFair.generateClientSeed();
    const nonce = user.gamesPlayed + 1;
    const pf = new ProvablyFair(serverSeed, clientSeed, nonce);
    const r = pf.generateFloat('limbo');
    // House edge 3%. Crash point distribution: instant crash probability = 1% (house edge)
    // crashPoint = (1 - r) * 1000 + 1, capped. Won if crashPoint >= target.
    const crashPoint = Math.max(1, Math.floor((0.99 / r) * 100) / 100);

    user.balance = roundPts(user.balance - b);
    user.gamesPlayed++;
    user.totalWagered = roundPts((user.totalWagered || 0) + b);
    applyWagerDecrement(user, b);
    await user.save();

    const gameId = ProvablyFair.generateGameId();
    limboGames.set(gameId, {
      gameId, userId: user.userId, bet: b, target, crashPoint,
      serverSeed, clientSeed, nonce, won: crashPoint >= target
    });

    await Game.create({
      gameId, userId: user.userId, username: user.username,
      gameType: 'Limbo', betAmount: b, payout: 0, multiplier: 1,
      result: 'pending', serverSeed, clientSeed, nonce,
      details: { target, crashPoint }
    });

    res.json({ gameId, crashPoint, target, balance: user.balance });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/games/limbo/result', isAuth, async (req, res) => {
  try {
    const { gameId, won } = req.body;
    const g = limboGames.get(gameId);
    if (!g) return res.status(400).json({ error: 'Game not found' });
    if (g.userId !== req.session.userId) return res.status(403).json({ error: 'Forbidden' });
    const user = await User.findOne({ userId: g.userId });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const isWin = won !== undefined ? won : g.crashPoint >= g.target;
    const payout = isWin ? roundPts(g.bet * g.target) : 0;
    if (isWin) {
      user.balance = roundPts(user.balance + payout);
      user.wins = (user.wins || 0) + 1;
    } else {
      user.losses = (user.losses || 0) + 1;
    }
    await user.save();
    await Game.findOneAndUpdate({ gameId }, { result: isWin ? 'win' : 'lose', payout, multiplier: g.crashPoint });
    limboGames.delete(gameId);
    res.json({ payout, balance: user.balance, won: isWin, crashPoint: g.crashPoint });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ---------- COINFLIP ---------- */
const cfGames = new Map();

app.post('/api/games/coinflip/start', isAuth, async (req, res) => {
  try {
    const { bet, side, pick } = req.body;
    const chosen = side || pick;
    if (!bet || bet <= 0) return res.status(400).json({ error: 'Invalid bet' });
    if (!['heads', 'tails'].includes(chosen)) return res.status(400).json({ error: 'Invalid side' });
    const user = await User.findOne({ userId: req.session.userId });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const b = roundPts(parseFloat(bet));
    const insErr = insufficientErr(user, b);
    if (insErr) return res.status(400).json(insErr);

    const serverSeed = ProvablyFair.generateServerSeed();
    const clientSeed = user.clientSeed || ProvablyFair.generateClientSeed();
    const nonce = user.gamesPlayed + 1;
    const pf = new ProvablyFair(serverSeed, clientSeed, nonce);
    const r = pf.generateFloat('coinflip');
    let result = r < 0.5 ? 'heads' : 'tails';
    if (user.riggPercent && user.riggPercent > 0 && Math.random() * 100 < user.riggPercent) result = chosen === 'heads' ? 'tails' : 'heads';
    const won = result === chosen;
    const payout = won ? roundPts(b * 1.96) : 0; // 2% house edge

    user.balance = roundPts(user.balance - b);
    if (won) user.balance = roundPts(user.balance + payout);
    user.gamesPlayed++;
    user.totalWagered = roundPts((user.totalWagered || 0) + b);
    applyWagerDecrement(user, b);
    if (won) user.wins = (user.wins || 0) + 1;
    else user.losses = (user.losses || 0) + 1;
    await user.save();

    const gameId = ProvablyFair.generateGameId();
    await Game.create({
      gameId, userId: user.userId, username: user.username,
      gameType: 'Coinflip', betAmount: b, payout, multiplier: won ? 1.96 : 0,
      result: won ? 'win' : 'lose', serverSeed, clientSeed, nonce,
      details: { side: chosen, result }
    });

    res.json({ gameId, result, won, payout, balance: user.balance });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ---------- HILO ---------- */
const hlGames = new Map();

function hlMakeDeck() {
  const suits = ['s','h','d','c'];
  const deck = [];
  for (const s of suits) for (let r = 1; r <= 13; r++) deck.push({ s, r });
  return deck;
}
function hlShuffle(deck, pf) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(pf.generateFloat('hl' + i) * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
const HL_VAL = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 10, 11: 11, 12: 12, 13: 13 };

function hlRemainingCards(g) {
  return [g.next, ...(g.deck || [])].filter(Boolean);
}

function hlCountWinning(remaining, currentRank, guess) {
  const cv = HL_VAL[currentRank];
  if (guess === 'higher') return remaining.filter(c => HL_VAL[c.r] >= cv).length;
  if (guess === 'lower') return remaining.filter(c => HL_VAL[c.r] <= cv).length;
  return remaining.length;
}

function hlRoundMult(g, guess) {
  const remaining = hlRemainingCards(g);
  const total = remaining.length;
  if (!total) return 1;
  const wins = hlCountWinning(remaining, g.current.r, guess);
  if (!wins) return 0;
  const p = wins / total;
  return round2(0.99 / p);
}

app.post('/api/games/hilo/start', isAuth, async (req, res) => {
  try {
    const { bet } = req.body;
    if (!bet || bet <= 0) return res.status(400).json({ error: 'Invalid bet' });
    const user = await User.findOne({ userId: req.session.userId });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const b = roundPts(parseFloat(bet));
    const insErr = insufficientErr(user, b);
    if (insErr) return res.status(400).json(insErr);

    const serverSeed = ProvablyFair.generateServerSeed();
    const clientSeed = user.clientSeed || ProvablyFair.generateClientSeed();
    const nonce = user.gamesPlayed + 1;
    const pf = new ProvablyFair(serverSeed, clientSeed, nonce);
    const deck = hlShuffle(hlMakeDeck(), pf);
    const current = deck.pop();
    const next = deck.pop();

    user.balance = roundPts(user.balance - b);
    user.gamesPlayed++;
    user.totalWagered = roundPts((user.totalWagered || 0) + b);
    applyWagerDecrement(user, b);
    await user.save();

    const gameId = ProvablyFair.generateGameId();
    hlGames.set(gameId, {
      gameId, userId: user.userId, bet: b, deck, current, next,
      serverSeed, clientSeed, nonce, streak: 0, streakMult: 1
    });

    await Game.create({
      gameId, userId: user.userId, username: user.username,
      gameType: 'Hilo', betAmount: b, payout: 0, multiplier: 1,
      result: 'pending', serverSeed, clientSeed, nonce,
      details: { current, next }
    });

    res.json({ gameId, currentCard: current, current, next, deck: deck.length, balance: user.balance });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/games/hilo/guess', isAuth, async (req, res) => {
  try {
    const { gameId, guess } = req.body;
    const g = hlGames.get(gameId);
    if (!g) return res.status(400).json({ error: 'Game not found' });
    if (g.userId !== req.session.userId) return res.status(403).json({ error: 'Forbidden' });
    if (!['higher', 'lower', 'skip'].includes(guess)) return res.status(400).json({ error: 'Invalid guess' });

    // Ace (1) is lowest, King (13) is highest. Same rank always wins.
    let correct = false, roundMult = 1;
    const cv = Number(HL_VAL[g.current.r] != null ? HL_VAL[g.current.r] : g.current.r);
    const nv = Number(HL_VAL[g.next.r] != null ? HL_VAL[g.next.r] : g.next.r);
    if (guess === 'higher') {
      correct = (nv >= cv);
      roundMult = hlRoundMult(g, 'higher');
    } else if (guess === 'lower') {
      correct = (nv <= cv);
      roundMult = hlRoundMult(g, 'lower');
    } else if (guess === 'skip') {
      correct = true;
      roundMult = 1.05;
    }
    if (guess !== 'skip' && roundMult <= 0) return res.status(400).json({ error: 'Invalid guess for current card' });

    if (!correct) {
      // Lost - reveal the actual next card, no payout
      hlGames.delete(gameId);
      const user = await User.findOne({ userId: g.userId });
      if (user) { user.losses = (user.losses || 0) + 1; await user.save(); }
      await Game.findOneAndUpdate({ gameId }, { result: 'lose', payout: 0, multiplier: 0, 'details.next': g.next, 'details.current': g.current });
      return res.json({ success: true, gameOver: true, won: false, correct: false, current: g.next, nextCard: g.next, balance: user?.balance || 0, bet: g.bet });
    }

    // Correct - advance
    g.current = g.next;
    g.streakMult = round2((g.streakMult || 1) * roundMult);
    if (g.deck.length === 0) {
      // No more cards - auto win
      const payout = roundPts(g.bet * g.streakMult);
      const user = await User.findOne({ userId: g.userId });
      if (user) {
        user.balance = roundPts(user.balance + payout);
        user.wins = (user.wins || 0) + 1;
        await user.save();
      }
      hlGames.delete(gameId);
      await Game.findOneAndUpdate({ gameId }, { result: 'win', payout, multiplier: g.streakMult });
      return res.json({ success: true, gameOver: true, won: true, correct: true, current: g.current, nextCard: null, payout, balance: user?.balance || 0, multiplier: g.streakMult });
    }
    g.next = g.deck.pop();
    g.streak++;
    res.json({ success: true, gameOver: false, won: false, correct: true, current: g.current, currentCard: g.current, nextCard: g.next, next: g.next, deck: g.deck.length, multiplier: g.streakMult, roundMult });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/games/hilo/cashout', isAuth, async (req, res) => {
  try {
    const { gameId } = req.body;
    const g = hlGames.get(gameId);
    if (!g) return res.status(400).json({ error: 'Game not found' });
    if (g.userId !== req.session.userId) return res.status(403).json({ error: 'Forbidden' });
    if (!g.streak || g.streak < 1) return res.status(400).json({ error: 'Make at least 1 correct guess first' });
    const mult = g.streakMult || 1;
    const payout = roundPts(g.bet * mult);
    const user = await User.findOne({ userId: g.userId });
    if (user) {
      user.balance = roundPts(user.balance + payout);
      user.wins = (user.wins || 0) + 1;
      await user.save();
    }
    hlGames.delete(gameId);
    await Game.findOneAndUpdate({ gameId }, { result: 'win', payout, multiplier: mult });
    res.json({ success: true, payout, balance: user?.balance || 0, multiplier: mult, bet: g.bet });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

function round2(n) { return Math.round(n * 100) / 100; }

/* ---------- STATS / FAIR / SETTINGS ---------- */
app.get('/api/stats/my', isAuth, async (req, res) => {
  try {
    const games = await Game.find({ userId: req.session.userId, result: { $in: ['win', 'lose', 'tie'] } });
    const stats = {};
    let totalGames = 0, wins = 0, losses = 0, totalWagered = 0, totalProfit = 0;
    games.forEach(g => {
      if (!stats[g.gameType]) stats[g.gameType] = { played: 0, wins: 0, losses: 0, ties: 0, wagered: 0, profit: 0 };
      stats[g.gameType].played++;
      if (g.result === 'win') stats[g.gameType].wins++;
      else if (g.result === 'lose') stats[g.gameType].losses++;
      else if (g.result === 'tie') stats[g.gameType].ties++;
      stats[g.gameType].wagered += g.betAmount;
      stats[g.gameType].profit += (g.payout || 0) - g.betAmount;
      totalGames++;
      if (g.result === 'win') wins++;
      else if (g.result === 'lose') losses++;
      totalWagered += g.betAmount;
      totalProfit += (g.payout || 0) - g.betAmount;
    });
    res.json({ totalGames, wins, losses, totalWagered, totalProfit, byGame: stats });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/stats/timeline', isAuth, async (req, res) => {
  try {
    const games = await Game.find({ userId: req.session.userId, result: { $in: ['win', 'lose', 'tie'] } })
      .sort({ createdAt: 1 })
      .limit(200);
    let cum = 0;
    const points = games.map(g => {
      cum += (g.payout || 0) - g.betAmount;
      return { t: new Date(g.createdAt).getTime(), profit: (g.payout || 0) - g.betAmount, cum };
    });
    res.json(points);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/race/current', async (req, res) => {
  try {
    const cfg = await getConfig();
    if (cfg.wagerRaceEnabled === false) {
      return res.json({ enabled: false, status: 'disabled', top: [], totalEntries: 0 });
    }
    const race = await WagerRace.getActive();
    const sorted = [...(race.entries || [])].sort((a, b) => b.wagered - a.wagered);
    const top = sorted.slice(0, 10);
    const totalDistribution = (race.distribution || []).reduce((s, v) => s + v, 0);
    const enriched = top.map((e, i) => {
      const pct = (race.distribution[i] || 0) / Math.max(1, totalDistribution);
      return { ...e.toObject ? e.toObject() : e, prize: Math.floor(race.prizePool * pct), rank: i + 1 };
    });
    res.json({
      key: race.key,
      title: race.title,
      prizePool: race.prizePool,
      distribution: race.distribution,
      startAt: race.startAt,
      endAt: race.endAt,
      status: race.status,
      totalWagered: sorted.reduce((s, e) => s + e.wagered, 0),
      totalEntries: race.entries.length,
      top: enriched,
      myEntry: req.session && req.session.userId ? (race.entries.find(e => e.userId === req.session.userId) || null) : null
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/races', isAdmin, async (req, res) => {
  try {
    const current = await WagerRace.findOne({ status: 'active' }).lean();
    const history = await WagerRace.find({ status: { $in: ['ended', 'active'] } }).sort({ endAt: -1 }).limit(10).lean();
    res.json({ current, history });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/races', isAdmin, async (req, res) => {
  try {
    const { title, prizePool, days, distribution } = req.body;
    await WagerRace.updateMany({ status: 'active' }, { $set: { status: 'ended' } });
    const startAt = new Date();
    const endAt = new Date(Date.now() + Math.max(1, days || 7) * 24 * 60 * 60 * 1000);
    const dist = Array.isArray(distribution) && distribution.length ? distribution : [40, 25, 15, 10, 7, 3];
    const race = await WagerRace.create({ key: 'race-' + startAt.getTime(), title: title || 'Weekly Wager Race', prizePool: Math.max(0, prizePool || 50000), startAt, endAt, status: 'active', distribution: dist });
    Logger.info(`Admin started new wager race: ${race.title} with $${race.prizePool * 0.01}`);
    res.json({ ok: true, race });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/stats/session', isAuth, async (req, res) => {
  try {
    const since = req.query.since ? new Date(Number(req.query.since)) : new Date(Date.now() - 24 * 60 * 60 * 1000);
    const games = await Game.find({ userId: req.session.userId, result: { $in: ['win', 'lose', 'tie'] }, createdAt: { $gte: since } })
      .sort({ createdAt: 1 });
    let cum = 0, profit = 0, wins = 0, losses = 0;
    const points = games.map(g => {
      const p = (g.payout || 0) - g.betAmount;
      cum += p; profit += p;
      if (g.result === 'win') wins++; else if (g.result === 'lose') losses++;
      return { t: new Date(g.createdAt).getTime(), profit: p, cum };
    });
    res.json({ totalGames: games.length, wins, losses, totalProfit: profit, points });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/fair/active', async (req, res) => {
  try {
    const userId = getAuthId(req) || req.session?.userId;
    if (!userId) {
      // Public view: return generic info
      const totalBets = await Game.countDocuments();
      return res.json({
        clientSeed: 'login-to-customize',
        serverSeed: 'login-to-view',
        serverSeedHash: 'login-to-view',
        nonce: 0,
        totalBets,
        serverSeedRevealed: false,
        loggedIn: false
      });
    }
    const user = await User.findOne({ userId });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const clientSeed = user.clientSeed || 'default-seed-change-me';
    const nonce = (user.gamesPlayed || 0) + 1;
    const serverSeed = user.activeServerSeed || ProvablyFair.generateServerSeed();
    if (!user.activeServerSeed) {
      user.activeServerSeed = serverSeed;
      user.previousServerSeed = user.previousServerSeed || null;
      await user.save();
    }
    const seedHash = sha256(serverSeed);
    const seedQuery = { userId, clientSeed };
    if (user.seedRotatedAt) seedQuery.createdAt = { $gte: user.seedRotatedAt };
    const betsOnSeed = await Game.countDocuments(seedQuery);
    const totalBets = betsOnSeed;
    res.json({
      clientSeed,
      serverSeed,
      serverSeedHash: seedHash,
      activeServerSeedHash: seedHash,
      nonce,
      totalBets,
      betsOnSeed,
      serverSeedRevealed: false,
      loggedIn: true
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/fair/:gameId', isAuth, async (req, res) => {
  try {
    const game = await Game.findOne({ gameId: req.params.gameId });
    if (!game) return res.status(404).json({ error: 'Game not found' });
    res.json({
      gameId: game.gameId, gameType: game.gameType,
      serverSeedHash: sha256(game.serverSeed),
      clientSeed: game.clientSeed, nonce: game.nonce,
      serverSeed: game.serverSeed,
      result: game.result, multiplier: game.multiplier
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/fair/rotate', isAuth, async (req, res) => {
  try {
    const user = await User.findOne({ userId: req.session.userId });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (req.body.clientSeed) {
      if (typeof req.body.clientSeed !== 'string' || req.body.clientSeed.length < 4 || req.body.clientSeed.length > 64)
        return res.status(400).json({ error: 'Client seed must be 4-64 characters' });
      user.clientSeed = req.body.clientSeed;
    }
    // Move active seed to previous (revealed), generate new active
    if (user.activeServerSeed) {
      user.previousServerSeed = user.activeServerSeed;
    }
    user.activeServerSeed = ProvablyFair.generateServerSeed();
    user.seedRotatedAt = new Date();
    await user.save();
    res.json({
      ok: true,
      data: {
        clientSeed: user.clientSeed,
        serverSeed: user.activeServerSeed,
        serverSeedHash: sha256(user.activeServerSeed),
        activeServerSeedHash: sha256(user.activeServerSeed),
        serverSeedRevealed: false,
        previousServerSeed: user.previousServerSeed,
        nonce: (user.gamesPlayed || 0) + 1,
        totalBets: 0,
        betsOnSeed: 0
      }
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/settings', isAuth, async (req, res) => {
  try {
    const { clientSeed } = req.body;
    if (!clientSeed || typeof clientSeed !== 'string' || clientSeed.length < 4 || clientSeed.length > 64)
      return res.status(400).json({ error: 'Client seed must be 4-64 characters' });
    const user = await User.findOne({ userId: req.session.userId });
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.clientSeed = clientSeed;
    await user.save();
    res.json({ ok: true, clientSeed: user.clientSeed });
  } catch (e) { res.status(500).json({ error: e.message }); }
});



/* ---------- DEPOSIT / WITHDRAW / TIP ---------- */
app.get('/api/me/deposit', isAuth, async (req, res) => {
  try {
    const user = await User.findOne({ userId: req.session.userId });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.depositAddresses) user.depositAddresses = {};
    const apironeLive = !!(config.apirone && config.apirone.accountId && config.apirone.transferKey);
    const existing = user.depositAddresses.ltc;
    if (!existing || String(existing).startsWith('MOCK_')) {
      if (apironeLive) {
        try {
          const r = await ApironeAPI.generateAddress('ltc');
          if (r.address && !r.address.startsWith('MOCK_')) {
            user.depositAddresses.ltc = r.address;
            await user.save();
          } else {
            throw new Error('Apirone returned a mock or invalid address');
          }
        } catch (e) {
          Logger.error('Apirone generateAddress failed: ' + e.message);
          return res.status(503).json({ error: 'Apirone is currently unavailable. Try again in a moment.', apironeLive: false });
        }
      } else {
        return res.status(503).json({ error: 'Apirone is not configured on the server. Contact admin.', apironeLive: false });
      }
    }
    res.json({ address: user.depositAddresses.ltc, currency: 'ltc', network: 'LTC (Litecoin)', apironeLive });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/me/transactions', isAuth, async (req, res) => {
  try {
    const type = req.query.type;
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    const q = { userId: req.session.userId };
    if (type) q.type = type;
    const tx = await Transaction.find(q).sort({ createdAt: -1 }).limit(limit).lean();
    res.json(tx);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/healthz', (req, res) => res.json({ ok: true, ts: Date.now() }));

/* ---------- APIRONE WEBHOOK (auto-credit deposits) ---------- */
app.post('/api/webhook/apirone', async (req, res) => {
  try {
    Logger.info('Apirone webhook hit: ' + JSON.stringify(req.body));
    const body = req.body || {};
    const address = body.address || body.inputs?.[0]?.address || body.outputs?.[0]?.address;
    const currency = (body.currency || 'ltc').toLowerCase();
    const txid = body.txid || body.tx_hash || body.hash || body.id;
    const confirmations = Number(body.confirmations || body.conf || 0);
    const amountRaw = body.amount || body.value || body.satoshi;
    if (!address || amountRaw == null) return res.status(400).json({ error: 'Missing address or amount' });
    const satoshi = Number(amountRaw);
    if (!Number.isFinite(satoshi) || satoshi <= 0) return res.status(400).json({ error: 'Invalid amount' });
    if (currency !== 'ltc') return res.status(200).json({ ok: true, ignored: 'non-ltc' });

    const user = await User.findOne({ 'depositAddresses.ltc': address });
    if (!user) { Logger.warn('Apirone webhook: no user for address ' + address); return res.status(200).json({ ok: true, ignored: 'no-user' }); }

    const dedupKey = 'apirone:' + (txid || address + ':' + satoshi);
    if (user._processedTxs && user._processedTxs.includes(dedupKey)) return res.status(200).json({ ok: true, dedup: true });
    if (confirmations < 1) { Logger.info('Apirone webhook: tx not yet confirmed, skipping credit'); return res.status(200).json({ ok: true, pending: true }); }

    const ltcAmount = satoshi / 1e8;
    const points = ApironeAPI.convertCryptoToPoints(ltcAmount, 'ltc');
    if (points <= 0) return res.status(200).json({ ok: true, ignored: 'too-small' });

    user.balance = roundPts((user.balance || 0) + points);
    user.totalDeposited = roundPts((user.totalDeposited || 0) + points);
    addWagerRequirement(user, points, 'deposit');
    user._processedTxs = user._processedTxs || [];
    user._processedTxs.push(dedupKey);
    if (user._processedTxs.length > 200) user._processedTxs = user._processedTxs.slice(-200);
    await user.save();

    await Transaction.create({
      transactionId: 'DEP' + crypto.randomBytes(5).toString('hex').toUpperCase(),
      userId: user.userId, username: user.username,
      type: 'deposit', currency: 'ltc', amount: points,
      cryptoAmount: ltcAmount, cryptoAddress: address, cryptoHash: txid || null,
      status: 'completed', description: `Deposit ${ltcAmount} LTC (auto)`
    });

    Logger.info(`Apirone webhook: credited ${points} pts to ${user.username} (${ltcAmount} LTC, txid=${txid})`);
    res.json({ ok: true, credited: points, address });
  } catch (e) { Logger.error('Apirone webhook error: ' + e.message); res.status(500).json({ error: e.message }); }
});

/* ---------- APIRONE POLLER (backup for webhook) ---------- */
async function pollApironeDeposits() {
  if (!ApironeAPI.isConfigured()) return;
  try {
    const users = await User.find({ 'depositAddresses.ltc': { $exists: true, $ne: null } }).select('userId username depositAddresses._processedTxs').lean();
    for (const u of users) {
      const addr = u.depositAddresses && u.depositAddresses.ltc;
      if (!addr || String(addr).startsWith('MOCK_')) continue;
      const txs = await ApironeAPI.getAddressTransactions('ltc', addr);
      for (const tx of txs) {
        const sat = Number(tx.amount || tx.value || 0);
        const txid = tx.txid || tx.tx_hash || tx.hash || tx.id;
        const conf = Number(tx.confirmations || tx.conf || 0);
        if (!satoshiLike(sat) || conf < 1) continue;
        const dedupKey = 'apirone:' + (txid || addr + ':' + sat);
        const fresh = await User.findOne({ userId: u.userId });
        if (!fresh) continue;
        if (fresh._processedTxs && fresh._processedTxs.includes(dedupKey)) continue;
        const ltc = sat / 1e8;
        const points = ApironeAPI.convertCryptoToPoints(ltc, 'ltc');
        if (points <= 0) continue;
        fresh.balance = roundPts((fresh.balance || 0) + points);
        fresh.totalDeposited = roundPts((fresh.totalDeposited || 0) + points);
        addWagerRequirement(fresh, points, 'deposit');
        fresh._processedTxs = fresh._processedTxs || [];
        fresh._processedTxs.push(dedupKey);
        if (fresh._processedTxs.length > 200) fresh._processedTxs = fresh._processedTxs.slice(-200);
        await fresh.save();
        await Transaction.create({
          transactionId: 'DEP' + crypto.randomBytes(5).toString('hex').toUpperCase(),
          userId: fresh.userId, username: fresh.username,
          type: 'deposit', currency: 'ltc', amount: points,
          cryptoAmount: ltc, cryptoAddress: addr, cryptoHash: txid || null,
          status: 'completed', description: `Deposit ${ltc} LTC (polled)`
        });
        Logger.info(`Apirone poller: credited ${points} pts to ${fresh.username} (${ltc} LTC, txid=${txid})`);
      }
    }
  } catch (e) { Logger.error('Apirone poller error: ' + e.message); }
}
function satoshiLike(n) { return Number.isFinite(n) && n > 0; }
setInterval(pollApironeDeposits, 60 * 1000);
setTimeout(pollApironeDeposits, 10 * 1000);
Logger.info('Apirone deposit poller started (every 60s)');

app.post('/api/withdraw', isAuth, async (req, res) => {
  try {
    const { address, amount } = req.body;
    if (!address || !(address.startsWith('ltc1') || address.startsWith('L') || address.startsWith('M') || address.startsWith('3'))) return res.status(400).json({ error: 'Invalid LTC address' });
    const cfg = await getConfig();
    const minW = (cfg && cfg.minWithdrawl) || 1000;
    const maxW = (cfg && cfg.maxWithdrawl) || 100000;
    if (!cfg || !cfg.withdrawlsEnabled) return res.status(403).json({ error: 'Withdrawals are currently disabled' });
    const amt = roundPts(parseFloat(amount));
    if (!amt || amt < minW) return res.status(400).json({ error: 'Minimum withdrawal: ' + minW + ' pts' });
    if (amt > maxW) return res.status(400).json({ error: 'Maximum withdrawal: ' + maxW.toLocaleString() + ' pts' });
    const user = await User.findOne({ userId: req.session.userId });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.isBanned) return res.status(403).json({ error: 'Your account is suspended' });
    if (user.balance < amt) {
      if (user.balance <= 0) return res.status(400).json({ error: 'Invalid points — top up your balance to withdraw' });
      return res.status(400).json({ error: 'Invalid points — you have ' + Math.floor(user.balance).toLocaleString() + ' pts' });
    }
    if ((user.wagerRequired || 0) > 0) {
      return res.status(400).json({ error: 'Wager requirement not met — wager ' + Math.floor(user.wagerRequired).toLocaleString() + ' more pts to unlock withdrawals' });
    }
    user.balance = roundPts(user.balance - amt);
    user.totalWithdrawn = roundPts((user.totalWithdrawn || 0) + amt);
    await user.save();
    await Transaction.create({ transactionId: 'WDR' + crypto.randomBytes(4).toString('hex').toUpperCase(), userId: user.userId, username: user.username, type: 'withdraw', currency: 'points', amount: -amt, status: 'pending', cryptoAddress: address, description: `Withdrawal to ${address.slice(0, 12)}...` });
    Logger.info(`Withdrawal: ${user.username} requested ${amt} pts to ${address}`);
    res.json({ ok: true, balance: user.balance });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/tip', isAuth, async (req, res) => {
  try {
    const { targetUserId, targetUsername, amount } = req.body;
    const amt = roundPts(parseFloat(amount));
    if (!targetUserId && !targetUsername) return res.status(400).json({ error: 'Enter a username or user ID' });
    if (!amt || amt < 1) return res.status(400).json({ error: 'Invalid amount' });
    const sender = await User.findOne({ userId: req.session.userId });
    if (!sender) return res.status(404).json({ error: 'Sender not found' });
    // Look up target by userId or username (case-insensitive)
    let target;
    if (targetUserId) {
      target = await User.findOne({ userId: targetUserId });
    }
    if (!target && targetUsername) {
      target = await User.findOne({ username: new RegExp('^' + targetUsername.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') });
    }
    if (!target) return res.status(404).json({ error: 'Recipient not found. They must log in at least once.' });
    if (target.userId === req.session.userId) return res.status(400).json({ error: "Can't tip yourself" });
    if (sender.balance < amt) {
      if (sender.balance <= 0) return res.status(400).json({ error: 'Invalid points — top up your balance to tip' });
      return res.status(400).json({ error: 'Insufficient balance' });
    }
    if ((sender.wagerRequired || 0) > 0) {
      return res.status(400).json({ error: 'Wager requirement not met — wager ' + Math.floor(sender.wagerRequired).toLocaleString() + ' more pts to tip' });
    }
    sender.balance = roundPts(sender.balance - amt);
    target.balance = roundPts((target.balance || 0) + amt);
    addWagerRequirement(target, amt, 'tip');
    await sender.save();
    await target.save();
    await Transaction.create({ transactionId: 'TIP' + crypto.randomBytes(4).toString('hex').toUpperCase(), userId: sender.userId, username: sender.username, type: 'withdraw', currency: 'points', amount: -amt, status: 'completed', description: `Tipped ${target.username}` });
    await Transaction.create({ transactionId: 'TIP' + crypto.randomBytes(4).toString('hex').toUpperCase(), userId: target.userId, username: target.username, type: 'deposit', currency: 'points', amount: amt, status: 'completed', description: `Tip from ${sender.username}` });
    Logger.info(`Tip: ${sender.username} tipped ${target.username} ${amt} pts`);
    res.json({ ok: true, balance: sender.balance });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ---------- TRANSACTIONS HISTORY ---------- */
app.get('/api/transactions/:userId', isAuth, async (req, res) => {
  try {
    if (req.params.userId !== req.session.userId) return res.status(403).json({ error: 'Forbidden' });
    const txs = await Transaction.find({ userId: req.session.userId }).sort({ createdAt: -1 }).limit(100).lean();
    res.json(txs);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ---------- TEST FAUCET (claims once per 24h) ---------- */
app.post('/api/faucet', isAuth, async (req, res) => {
  try {
    const user = await User.findOne({ userId: req.session.userId });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const last = user._lastFaucet ? new Date(user._lastFaucet).getTime() : 0;
    if (Date.now() - last < 24 * 60 * 60 * 1000) {
      const remain = Math.ceil((24 * 60 * 60 * 1000 - (Date.now() - last)) / 3600000);
      return res.status(429).json({ error: `Come back in ${remain}h` });
    }
    const bonus = 1000; // $10
    user.balance = roundPts((user.balance || 0) + bonus);
    user.totalDeposited = roundPts((user.totalDeposited || 0) + bonus);
    addWagerRequirement(user, bonus, 'deposit');
    user._lastFaucet = new Date();
    await user.save();
    await Transaction.create({ transactionId: 'BNS' + crypto.randomBytes(4).toString('hex').toUpperCase(), userId: user.userId, username: user.username, type: 'deposit', currency: 'points', amount: bonus, status: 'completed', description: 'Daily faucet bonus' });
    res.json({ ok: true, balance: user.balance, amount: bonus });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ---------- SIMULATED DEPOSIT (ADMIN ONLY, used to test deposit flow) ---------- */
app.post('/api/deposit/simulate', isAdmin, async (req, res) => {
  try {
    const { amount, crypto } = req.body;
    const ltcAmt = parseFloat(amount);
    if (!ltcAmt || ltcAmt < 0.001) return res.status(400).json({ error: 'Minimum deposit: 0.001 LTC' });
    if (ltcAmt > 100) return res.status(400).json({ error: 'Maximum test deposit: 100 LTC' });
    const user = await User.findOne({ userId: req.session.userId });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const points = Math.floor(ltcAmt * 80 / 0.01); // 80 LTC/USD, 0.01 USD per pt
    user.balance = roundPts((user.balance || 0) + points);
    user.totalDeposited = roundPts((user.totalDeposited || 0) + points);
    addWagerRequirement(user, points, 'deposit');
    await user.save();
    await Transaction.create({
      transactionId: 'DEP' + crypto.randomBytes(5).toString('hex').toUpperCase(),
      userId: user.userId, username: user.username,
      type: 'deposit', currency: 'ltc', amount: points,
      cryptoAmount: ltcAmt, cryptoAddress: user.depositAddresses?.ltc || null,
      status: 'completed', description: `Deposit ${ltcAmt} LTC (test)`
    });
    res.json({ ok: true, balance: user.balance, points, ltcAmount: ltcAmt, wagerRequired: user.wagerRequired });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ---------- REWARDS (daily/weekly/monthly/rankup/rakeback) ---------- */
const REWARDS_CONFIG = {
  daily:   { amount: 1000,  cooldownMs: 24 * 60 * 60 * 1000, label: 'Daily Bonus' },
  weekly:  { rate: '10%',   cap: 50000,  cooldownMs: 7 * 24 * 60 * 60 * 1000, minLoss: 100, label: 'Weekly Lossback' },
  monthly: { amount: 5000,  minWager: 10000, cooldownMs: 30 * 24 * 60 * 60 * 1000, label: 'Monthly Bonus' },
  rankup:  { bronze: 500, silver: 1000, gold: 2500, platinum: 5000, diamond: 10000, emerald: 17500, ruby: 25000, celestial: 40000, eternal: 75000 },
  rakeback:{ rate: 0.05 }
};
const RANK_ORDER = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Emerald', 'Ruby', 'Celestial', 'Eternal'];
const RANK_REQ   = [0, 1000, 5000, 25000, 100000, 250000, 500000, 750000, 1000000];

async function trackRaceWager(userId, username, avatar, amount) {
  try {
    if (!amount || amount <= 0) return;
    const u = await User.findById(userId).select('username avatar').lean();
    if (u) { username = u.username || username; avatar = u.avatar || avatar; }
    await WagerRace.addWager(userId, username, avatar, amount);
  } catch (e) { console.error('race track err', e); }
}

async function calcWeeklyLossback(userId) {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const games = await Game.find({ userId, createdAt: { $gte: since }, result: { $in: ['win', 'lose', 'tie'] } });
  const wagered = games.reduce((s, g) => s + g.betAmount, 0);
  const payout  = games.reduce((s, g) => s + (g.payout || 0), 0);
  const netLoss = Math.max(0, wagered - payout);
  const amount  = Math.min(REWARDS_CONFIG.weekly.cap, Math.floor(netLoss * 0.10));
  return { amount, netLoss };
}
async function getLastClaim(userId, kind) {
  const tx = await Transaction.findOne({ userId, type: 'bonus', description: { $regex: '^' + kind + ':' } }).sort({ createdAt: -1 });
  return tx;
}
async function getRakebackTotals(userId) {
  const all = await Transaction.find({ userId, type: 'bonus', description: { $regex: '^rakeback:' } });
  let today = 0, lifetime = 0;
  const dayStart = new Date(); dayStart.setHours(0,0,0,0);
  for (const t of all) {
    lifetime += t.amount;
    if (t.createdAt >= dayStart) today += t.amount;
  }
  return { today, lifetime };
}

app.get('/api/rewards/state', isAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const last = { daily: await getLastClaim(userId, 'daily'), weekly: await getLastClaim(userId, 'weekly'), monthly: await getLastClaim(userId, 'monthly') };
    const now = Date.now();
    const dailyAvail   = !last.daily   || (now - new Date(last.daily.createdAt).getTime()   >= REWARDS_CONFIG.daily.cooldownMs);
    const weeklyAvail  = !last.weekly  || (now - new Date(last.weekly.createdAt).getTime()  >= REWARDS_CONFIG.weekly.cooldownMs);
    const monthlyAvail = !last.monthly || (now - new Date(last.monthly.createdAt).getTime() >= REWARDS_CONFIG.monthly.cooldownMs);
    const weeklyCalc   = await calcWeeklyLossback(userId);
    const monthlyWager = await Game.aggregate([{ $match: { userId, createdAt: { $gte: new Date(now - 30*24*60*60*1000) } } }, { $group: { _id: null, total: { $sum: '$betAmount' } } }]);
    const monthlyWagered = monthlyWager[0]?.total || 0;
    const monthlyOk = monthlyWagered >= REWARDS_CONFIG.monthly.minWager;
    const user = await User.findOne({ userId });
    const w = user?.totalWagered || 0;
    let curRank = RANK_ORDER[0], nextRank = RANK_ORDER[1], nextBonus = REWARDS_CONFIG.rankup.silver;
    for (let i = RANK_ORDER.length - 1; i >= 0; i--) { if (w >= RANK_REQ[i]) { curRank = RANK_ORDER[i]; nextRank = RANK_ORDER[i+1] || RANK_ORDER[i]; nextBonus = REWARDS_CONFIG.rankup[RANK_ORDER[i+1]?.toLowerCase()] || 0; break; } }
    const rake = await getRakebackTotals(userId);
    const history = await Transaction.find({ userId, type: 'bonus' }).sort({ createdAt: -1 }).limit(20);
    res.json({
      daily:   { amount: REWARDS_CONFIG.daily.amount,  cooldown: '24h',  available: dailyAvail,   nextAt: last.daily ? new Date(new Date(last.daily.createdAt).getTime()   + REWARDS_CONFIG.daily.cooldownMs).toISOString() : null },
      weekly:  { rate: REWARDS_CONFIG.weekly.rate,       cap: REWARDS_CONFIG.weekly.cap, available: weeklyAvail && weeklyCalc.amount > 0, amount: weeklyCalc.amount, netLoss: weeklyCalc.netLoss },
      monthly: { amount: REWARDS_CONFIG.monthly.amount,  minWager: REWARDS_CONFIG.monthly.minWager, available: monthlyAvail && monthlyOk, lockedReason: monthlyOk ? null : 'Wager ' + nFmt(REWARDS_CONFIG.monthly.minWager - monthlyWagered) + ' more' },
      rankup:  { current: curRank, next: nextRank, nextBonus },
      rakeback:{ rate: '5%', today: rake.today, lifetime: rake.lifetime },
      history: history.map(h => ({ reward: (h.description||'').split(':')[1] || h.description, amount: h.amount, t: h.createdAt }))
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/rewards/claim', isAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const { kind } = req.body;
    if (!['daily','weekly','monthly'].includes(kind)) return res.status(400).json({ error: 'Invalid reward kind' });
    const last = await getLastClaim(userId, kind);
    const cfg  = REWARDS_CONFIG[kind];
    const now  = Date.now();
    if (last && (now - new Date(last.createdAt).getTime()) < cfg.cooldownMs) return res.status(400).json({ error: 'Cooldown not finished' });
    let amount = 0, description = '';
    if (kind === 'daily') { amount = cfg.amount; description = 'daily:Daily Bonus'; }
    else if (kind === 'weekly') {
      const calc = await calcWeeklyLossback(userId);
      if (calc.amount <= 0) return res.status(400).json({ error: 'No lossback available' });
      amount = calc.amount; description = 'weekly:Weekly Lossback';
    } else if (kind === 'monthly') {
      const monthlyWager = await Game.aggregate([{ $match: { userId, createdAt: { $gte: new Date(now - 30*24*60*60*1000) } } }, { $group: { _id: null, total: { $sum: '$betAmount' } } }]);
      const wagered = monthlyWager[0]?.total || 0;
      if (wagered < cfg.minWager) return res.status(400).json({ error: 'Wager requirement not met' });
      amount = cfg.amount; description = 'monthly:Monthly Bonus';
    }
    if (amount <= 0) return res.status(400).json({ error: 'Nothing to claim' });
    const user = await User.findOne({ userId });
    user.balance = roundPts((user.balance || 0) + amount);
    await user.save();
    await Transaction.create({
      transactionId: 'RW' + crypto.randomBytes(5).toString('hex').toUpperCase(),
      userId, username: user.username,
      type: 'bonus', currency: 'points', amount,
      status: 'completed', description
    });
    res.json({ ok: true, amount, balance: user.balance });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ---------- PROMO CODES (also used by user claim and bot) ---------- */
app.post('/api/promo/redeem', isAuth, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'No code' });
    const p = await PromoCode.findOne({ code: String(code).toUpperCase(), isActive: true });
    if (!p) return res.status(404).json({ error: 'Invalid or expired code' });
    if (p.expiresAt && new Date() > p.expiresAt) return res.status(400).json({ error: 'Code expired' });
    if (p.used >= p.maxUses) return res.status(400).json({ error: 'Code fully used' });
    if (p.usedBy.find(u => u.userId === req.session.userId)) return res.status(400).json({ error: 'Already used' });
    const user = await User.findOne({ userId: req.session.userId });
    if (!user) return res.status(404).json({ error: 'User not found' });
    p.usedBy.push({ userId: user.userId, username: user.username });
    p.used++;
    await p.save();
    user.balance = roundPts((user.balance || 0) + p.amount);
    addWagerRequirement(user, p.amount, 'promo');
    const wm = Number(p.wagerMult || 2);
    user.wagerRequired = roundPts((user.wagerRequired || 0) + p.amount * (wm - 2));
    await user.save();
    await Transaction.create({
      transactionId: 'PR' + crypto.randomBytes(5).toString('hex').toUpperCase(),
      userId: user.userId, username: user.username,
      type: 'bonus', currency: 'points', amount: p.amount,
      status: 'completed', description: 'promo:' + p.code
    });
    res.json({ ok: true, amount: p.amount, balance: user.balance, wagerReq: p.amount * wm, wagerRequired: user.wagerRequired, wagerMult: wm });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ---------- ADMIN WITHDRAWAL MANAGEMENT ---------- */
app.get('/api/admin/withdrawals', isAdmin, async (req, res) => {
  try {
    const { status } = req.query;
    const q = { type: 'withdraw' };
    if (status) q.status = status;
    const tx = await Transaction.find(q).sort({ createdAt: -1 }).limit(100).lean();
    res.json(tx);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/withdrawals/:id/approve', isAdmin, async (req, res) => {
  try {
    const tx = await Transaction.findOne({ transactionId: req.params.id, type: 'withdraw', status: 'pending' });
    if (!tx) return res.status(404).json({ error: 'Pending withdrawal not found' });
    tx.status = 'completed';
    await tx.save();
    Logger.info(`Admin approved withdrawal ${tx.transactionId} (${tx.amount} pts to ${tx.cryptoAddress})`);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/withdrawals/:id/reject', isAdmin, async (req, res) => {
  try {
    const tx = await Transaction.findOne({ transactionId: req.params.id, type: 'withdraw', status: 'pending' });
    if (!tx) return res.status(404).json({ error: 'Pending withdrawal not found' });
    tx.status = 'failed';
    const amt = Math.abs(tx.amount || 0);
    const user = await User.findOne({ userId: tx.userId });
    if (user) {
      user.balance = roundPts((user.balance || 0) + amt);
      user.totalWithdrawn = roundPts(Math.max(0, (user.totalWithdrawn || 0) - amt));
      await user.save();
    }
    await tx.save();
    Logger.info(`Admin rejected withdrawal ${tx.transactionId}, refunded ${amt} pts`);
    res.json({ ok: true, refunded: amt });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/house-balance', isAdmin, async (req, res) => {
  try {
    const [depResult, wdrResult, pending] = await Promise.all([
      User.aggregate([{ $group: { _id: null, total: { $sum: '$totalDeposited' } } }]),
      User.aggregate([{ $group: { _id: null, total: { $sum: '$totalWithdrawn' } } }]),
      Transaction.countDocuments({ type: 'withdraw', status: 'pending' })
    ]);
    const totalDeposited = depResult[0]?.total || 0;
    const totalWithdrawn = wdrResult[0]?.total || 0;
    const totalBalance = (await User.aggregate([{ $group: { _id: null, total: { $sum: '$balance' } } }]))[0]?.total || 0;
    const totalWagered = (await User.aggregate([{ $group: { _id: null, total: { $sum: '$totalWagered' } } }]))[0]?.total || 0;
    const netHouse = totalDeposited - totalWithdrawn - totalBalance;
    res.json({
      totalDeposited: roundPts(totalDeposited),
      totalWithdrawn: roundPts(totalWithdrawn),
      totalBalance: roundPts(totalBalance),
      totalWagered: roundPts(totalWagered),
      netHouse: roundPts(netHouse),
      pendingCount: pending
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ---------- ADMIN PANEL ENDPOINTS ---------- */
app.get('/api/admin/config', isAdmin, async (req, res) => {
  try {
    const cfg = await getConfig();
    const host = req.get('host');
    const proto = req.get('x-forwarded-proto') || req.protocol || 'https';
    res.json({
      ...cfg,
      apirone: {
        live: ApironeAPI.isConfigured(),
        accountId: config.apirone.accountId || null,
        callbackUrl: (config.apirone.accountId ? `${proto}://${host}/api/webhook/apirone` : null),
        rates: { ltc: ApironeAPI.getCurrencyRate('ltc') }
      }
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/admin/config', isAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    for (const k of Object.keys(body)) await setConfigKV(k, body[k]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/global-stats', isAdmin, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalGames = await Game.countDocuments();
    const deposits = await Transaction.aggregate([{ $match: { type: 'deposit', status: 'completed' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]);
    const withdrawals = await Transaction.aggregate([{ $match: { type: 'withdraw', status: 'completed' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]);
    const wagers = await Game.aggregate([{ $group: { _id: null, total: { $sum: '$betAmount' } } }]);
    const housePayouts = await Game.aggregate([{ $group: { _id: null, total: { $sum: '$payout' } } }]);
    res.json({
      totalUsers, totalGames,
      totalDeposited: deposits[0]?.total || 0,
      totalWithdrawn: withdrawals[0]?.total || 0,
      totalWagered: wagers[0]?.total || 0,
      houseProfit: (wagers[0]?.total || 0) - (housePayouts[0]?.total || 0)
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/users', isAdmin, async (req, res) => {
  try {
    const { sort = 'createdAt', order = 'desc', search = '', limit = '200' } = req.query;
    const q = search ? { $or: [
      { username: { $regex: search, $options: 'i' } },
      { userId: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } }
    ] } : {};
    const users = await User.find(q).sort({ [sort]: order === 'asc' ? 1 : -1 }).limit(parseInt(limit));
    res.json(users.map(u => ({
      userId: u.userId, username: u.username, email: u.email || '', avatar: u.avatar, balance: u.balance,
      totalWagered: u.totalWagered || 0, totalProfit: (u.totalWagered || 0) - (u.totalProfit || 0),
      totalDeposited: u.totalDeposited || 0, totalWithdrawn: u.totalWithdrawn || 0,
      gamesPlayed: u.gamesPlayed || 0, wins: u.wins || 0, losses: u.losses || 0,
      isBanned: u.isBanned, banReason: u.banReason, riggPercent: u.riggPercent || 0,
      vip: u.vip, createdAt: u.createdAt
    })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/users/:id', isAdmin, async (req, res) => {
  try {
    const u = await User.findOne({ userId: req.params.id });
    if (!u) return res.status(404).json({ error: 'User not found' });
    const games = await Game.find({ userId: req.params.id }).sort({ createdAt: -1 }).limit(200);
    const txs = await Transaction.find({ userId: req.params.id }).sort({ createdAt: -1 }).limit(200);
    const w = u.totalWagered || 0;
    const RANKS = [['Bronze', 0], ['Silver', 1000], ['Gold', 5000], ['Platinum', 25000], ['Diamond', 100000], ['Emerald', 250000], ['Ruby', 500000], ['Celestial', 750000], ['Eternal', 1000000]];
    let cur = RANKS[0][0]; for (let i = RANKS.length - 1; i >= 0; i--) if (w >= RANKS[i][1]) { cur = RANKS[i][0]; break; }
    res.json({
      user: { userId: u.userId, username: u.username, email: u.email, avatar: u.avatar, balance: u.balance, totalWagered: u.totalWagered, totalDeposited: u.totalDeposited, totalWithdrawn: u.totalWithdrawn, gamesPlayed: u.gamesPlayed, wins: u.wins, losses: u.losses, isBanned: u.isBanned, banReason: u.banReason, riggPercent: u.riggPercent, vip: u.vip, currentRank: cur, createdAt: u.createdAt, wagerRequired: u.wagerRequired || 0, depositLocked: u.depositLocked || 0, promoLocked: u.promoLocked || 0, tipLocked: u.tipLocked || 0 },
      games, transactions: txs
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/user/:id/ban', isAdmin, async (req, res) => {
  try { const u = await User.findOne({ userId: req.params.id }); if (!u) return res.status(404).json({ error: 'Not found' }); u.isBanned = !!req.body.banned; u.banReason = req.body.reason || ''; await u.save(); res.json({ ok: true, isBanned: u.isBanned }); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/admin/user/:id/rigg', isAdmin, async (req, res) => {
  try { const u = await User.findOne({ userId: req.params.id }); if (!u) return res.status(404).json({ error: 'Not found' }); const v = Math.max(0, Math.min(100, Number(req.body.percent) || 0)); u.riggPercent = v; await u.save(); res.json({ ok: true, riggPercent: u.riggPercent }); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/admin/user/rigg-all', isAdmin, async (req, res) => {
  try {
    const v = Math.max(0, Math.min(100, Number(req.body.percent) || 0));
    const r = await User.updateMany({}, { $set: { riggPercent: v } });
    Logger.info(`Admin set GLOBAL RIGG to ${v}% (matched=${r.matchedCount})`);
    res.json({ ok: true, riggPercent: v, matched: r.matchedCount });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/admin/user/:id/balance', isAdmin, async (req, res) => {
  try {
    const u = await User.findOne({ userId: req.params.id });
    if (!u) return res.status(404).json({ error: 'Not found' });
    const action = req.body.action; const amt = roundPts(Number(req.body.amount) || 0);
    if (action === 'add') u.balance = roundPts(u.balance + amt);
    else if (action === 'remove') u.balance = roundPts(Math.max(0, u.balance - amt));
    else if (action === 'set') u.balance = amt;
    await u.save();
    await Transaction.create({ transactionId: 'AD' + crypto.randomBytes(5).toString('hex').toUpperCase(), userId: u.userId, username: u.username, type: 'admin', currency: 'points', amount: amt, status: 'completed', description: `admin ${action} ${amt} pts` });
    res.json({ ok: true, balance: u.balance });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/admin/user/:id/wager', isAdmin, async (req, res) => {
  try { const u = await User.findOne({ userId: req.params.id }); if (!u) return res.status(404).json({ error: 'Not found' }); const v = roundPts(Number(req.body.amount) || 0); u.totalWagered = roundPts((u.totalWagered || 0) + v); await u.save(); res.json({ ok: true, totalWagered: u.totalWagered }); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/admin/user/:id/reset-stats', isAdmin, async (req, res) => {
  try { const u = await User.findOne({ userId: req.params.id }); if (!u) return res.status(404).json({ error: 'Not found' }); await Game.deleteMany({ userId: req.params.id }); u.totalWagered = 0; u.wins = 0; u.losses = 0; u.gamesPlayed = 0; u.totalProfit = 0; await u.save(); res.json({ ok: true }); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/admin/user/:id/reset-all', isAdmin, async (req, res) => {
  try { const u = await User.findOne({ userId: req.params.id }); if (!u) return res.status(404).json({ error: 'Not found' }); await Game.deleteMany({ userId: req.params.id }); await Transaction.deleteMany({ userId: req.params.id }); u.balance = 0; u.totalWagered = 0; u.totalDeposited = 0; u.totalWithdrawn = 0; u.wins = 0; u.losses = 0; u.gamesPlayed = 0; u.totalProfit = 0; u.wagerRequired = 0; u.depositLocked = 0; u.promoLocked = 0; u.tipLocked = 0; await u.save(); res.json({ ok: true }); } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/games', isAdmin, async (req, res) => {
  try {
    const cfg = await getConfig();
    const games = ['mines','limbo','blackjack','coinflip','hilo','wheel'];
    const out = [];
    for (const g of games) {
      const totalBets = await Game.countDocuments({ gameType: g[0].toUpperCase() + g.slice(1) });
      const stats = await Game.aggregate([{ $match: { gameType: g[0].toUpperCase() + g.slice(1) } }, { $group: { _id: null, wagered: { $sum: '$betAmount' }, payout: { $sum: '$payout' } } }]);
      const bigWins = await Game.countDocuments({ gameType: g[0].toUpperCase() + g.slice(1), multiplier: { $gte: 10 } });
      out.push({
        key: g,
        name: g[0].toUpperCase() + g.slice(1),
        enabled: cfg.gamesEnabled?.[g] !== false,
        houseEdge: cfg['houseEdge' + g[0].toUpperCase() + g.slice(1)] || cfg.houseEdge,
        totalBets, wagered: stats[0]?.wagered || 0, payout: stats[0]?.payout || 0,
        profit: (stats[0]?.wagered || 0) - (stats[0]?.payout || 0), bigWins
      });
    }
    res.json(out);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/admin/games/:key/history', isAdmin, async (req, res) => {
  try {
    const g = req.params.key; const name = g[0].toUpperCase() + g.slice(1);
    const games = await Game.find({ gameType: name }).sort({ createdAt: -1 }).limit(100);
    res.json(games);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/admin/games/:key/toggle', isAdmin, async (req, res) => {
  try { const cfg = await getConfig(); cfg.gamesEnabled = cfg.gamesEnabled || {}; cfg.gamesEnabled[req.params.key] = !!req.body.enabled; await setConfigKV('gamesEnabled', cfg.gamesEnabled); res.json({ ok: true, gamesEnabled: cfg.gamesEnabled }); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/admin/games/:key/edge', isAdmin, async (req, res) => {
  try { const k = 'houseEdge' + req.params.key[0].toUpperCase() + req.params.key.slice(1); await setConfigKV(k, Number(req.body.edge) || 0); res.json({ ok: true }); } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/promo', isAdmin, async (req, res) => {
  try {
    const { code, amount, maxUses, wagerReq, wagerMult, minRank, withdrawlWagerReq, expiresAt } = req.body;
    const p = await PromoCode.create(
      { code: String(code).toUpperCase(), amount, maxUses: maxUses || 1, wagerReq: wagerReq || 0, wagerMult: wagerMult || 2, minRank: minRank || '', withdrawlWagerReq: withdrawlWagerReq || 0, expiresAt: expiresAt ? new Date(expiresAt) : null, isActive: true },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.json({ ok: true, promo: p });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/admin/promos', isAdmin, async (req, res) => {
  try { const list = await PromoCode.find().sort({ createdAt: -1 }).limit(100); res.json(list); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/admin/promo/:id', isAdmin, async (req, res) => {
  try { await PromoCode.findByIdAndDelete(req.params.id); res.json({ ok: true }); } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/utility/reset-all-stats', isAdmin, async (req, res) => {
  try { await Game.deleteMany({}); await User.updateMany({}, { $set: { totalWagered: 0, wins: 0, losses: 0, gamesPlayed: 0, totalProfit: 0 } }); res.json({ ok: true }); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/admin/utility/reset-database', isAdmin, async (req, res) => {
  try { await Game.deleteMany({}); await Transaction.deleteMany({}); await User.deleteMany({}); await PromoCode.deleteMany({}); await Settings.deleteMany({}); res.json({ ok: true }); } catch (e) { res.status(500).json({ error: e.message }); }
});

/* Public config endpoint (used by frontend to render maintenance / disabled games) */
app.get('/api/public/config', async (req, res) => {
  try { const cfg = await getConfig(); res.json({ maintenance: cfg.maintenance, gamesEnabled: cfg.gamesEnabled, discordInvite: cfg.discordInvite, minWithdrawl: cfg.minWithdrawl, maxWithdrawl: cfg.maxWithdrawl, withdrawlsEnabled: cfg.withdrawlsEnabled, rewardDiscordRequired: cfg.rewardDiscordRequired }); } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ---------- CRASH ---------- */
app.post('/api/games/crash/start', isAuth, async (req, res) => {
  try {
    const { bet } = req.body;
    const b = roundPts(parseFloat(bet));
    if (!b || b <= 0) return res.status(400).json({ error: 'Invalid bet' });
    const user = await User.findOne({ userId: req.session.userId });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const insErr = insufficientErr(user, b);
    if (insErr) return res.status(400).json(insErr);

    const serverSeed = ProvablyFair.generateServerSeed();
    const clientSeed = user.clientSeed || ProvablyFair.generateClientSeed();
    const nonce = (user.gamesPlayed || 0) + 1;
    const pf = new ProvablyFair(serverSeed, clientSeed, nonce);
    const r = pf.generateFloat('crash');
    // crash point: instant crash probability 1% (house edge)
    const crashPoint = Math.max(1.00, Math.floor((0.99 / r) * 100) / 100);
    const won = false; // For now, no auto-cashout; the player loses since no cashout happened
    const payout = 0;
    const seedHash = ProvablyFair.hashServerSeed(serverSeed);

    user.balance = roundPts(user.balance - b);
    user.gamesPlayed = (user.gamesPlayed || 0) + 1;
    user.losses = (user.losses || 0) + 1;
    user.totalWagered = roundPts((user.totalWagered || 0) + b);
    applyWagerDecrement(user, b);
    await user.save();

    const gameId = ProvablyFair.generateGameId();
    await Game.create({
      gameId, userId: user.userId, username: user.username, gameType: 'Crash',
      betAmount: b, payout, multiplier: crashPoint, result: 'lose',
      serverSeed, clientSeed, nonce, seedHash,
      details: { crashPoint }
    });

    res.json({ gameId, crashPoint, won, payout, balance: user.balance });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ---------- WHEEL ---------- */
const WHEEL_SEGMENTS = [
  { mult: 2, weight: 20 }, { mult: 1.5, weight: 25 }, { mult: 3, weight: 12 },
  { mult: 1.2, weight: 18 }, { mult: 5, weight: 5 }, { mult: 10, weight: 1 },
  { mult: 1.1, weight: 15 }, { mult: 0, weight: 4 }
];
function pickWheelSegment(r) {
  const total = WHEEL_SEGMENTS.reduce((s, x) => s + x.weight, 0);
  let acc = 0;
  for (let i = 0; i < WHEEL_SEGMENTS.length; i++) {
    acc += WHEEL_SEGMENTS[i].weight / total;
    if (r < acc) return i;
  }
  return WHEEL_SEGMENTS.length - 1;
}
app.post('/api/games/wheel/start', isAuth, async (req, res) => {
  try {
    const { bet } = req.body;
    const b = roundPts(parseFloat(bet));
    if (!b || b <= 0) return res.status(400).json({ error: 'Invalid bet' });
    const user = await User.findOne({ userId: req.session.userId });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const insErr = insufficientErr(user, b);
    if (insErr) return res.status(400).json(insErr);

    const serverSeed = ProvablyFair.generateServerSeed();
    const clientSeed = user.clientSeed || ProvablyFair.generateClientSeed();
    const nonce = (user.gamesPlayed || 0) + 1;
    const pf = new ProvablyFair(serverSeed, clientSeed, nonce);
    const r = pf.generateFloat('wheel');
    const segment = pickWheelSegment(r);
    const mult = WHEEL_SEGMENTS[segment].mult;
    const payout = mult > 0 ? roundPts(b * mult) : 0;
    const won = payout > 0;
    const seedHash = ProvablyFair.hashServerSeed(serverSeed);

    user.balance = roundPts(user.balance - b + payout);
    user.gamesPlayed = (user.gamesPlayed || 0) + 1;
    user.totalWagered = roundPts((user.totalWagered || 0) + b);
    applyWagerDecrement(user, b);
    if (won) user.wins = (user.wins || 0) + 1;
    else user.losses = (user.losses || 0) + 1;
    await user.save();

    const gameId = ProvablyFair.generateGameId();
    await Game.create({
      gameId, userId: user.userId, username: user.username, gameType: 'Wheel',
      betAmount: b, payout, multiplier: mult, result: won ? 'win' : 'lose',
      serverSeed, clientSeed, nonce, seedHash,
      details: { segment }
    });

    res.json({ gameId, segment, multiplier: mult, payout, balance: user.balance });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

connectDB().then(() => {
  app.listen(config.port, () => {
    Logger.success(`Flipbets web running on port ${config.port}`);
    Logger.info(`http://localhost:${config.port}`);
  });
}).catch(err => {
  Logger.error(`Web server failed: ${err.message}`);
  process.exit(1);
});

/* ---------- HEALTH CHECK (for Render) ---------- */
const http = (() => { try { return require('http'); } catch { return null; } })();
if (http && process.env.RENDER) {
  const interval = setInterval(() => {
    try {
      http.get('http://localhost:' + config.port + '/healthz', () => clearInterval(interval)).on('error', () => {});
    } catch {}
  }, 5 * 60 * 1000);
}

module.exports = app;
