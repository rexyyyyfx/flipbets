const DEFAULT_BET = 10;

let user = null;
let settings = loadSettings();
let curPage = 'home';
let lbType = 'wagered';

// Mines
let minesActive = false, minesGameId = null, minesCount = 3, minesRevealed = 0, minesGrid = [], minesTapping = false;
// BJ
let bjActive = false, bjGameId = null;
// Limbo
let limActive = false, limGameId = null, limCrashPoint = 1, limAnimFrame = null, limStartTime = 0, limResultRevealed = false, limRecent = [];
// CF
let cfActive = false, cfGameId = null, cfPickSide = null;
// HL
let hlActive = false, hlGameId = null, hlStreakCount = 0, hlCurrentCard = null, hlCurrentMult = 1;
// Wheel
let whlActive = false, whlRot = 0;

let walletFiat = localStorage.getItem('ezbet_fiat') || 'USD';
let walletShowFiat = localStorage.getItem('ezbet_fiat_toggle') === '1';

const FIAT_RATES = { USD: 0.01, INR: 0.83, EUR: 0.0093 };
const FIAT_SYMBOL = { USD: '$', INR: '\u20B9', EUR: '\u20AC' };
const FIAT_DECIMALS = { USD: 2, INR: 2, EUR: 2 };

const getEl = id => document.getElementById(id);
const $ = (s, p) => (p || document).querySelector(s);
const $$ = (s, p) => Array.from((p || document).querySelectorAll(s));

const nFmt = n => {
  if (n === null || n === undefined || isNaN(n)) return '0';
  n = Math.round(Number(n) * 100) / 100;
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
};
const usd = pts => '$' + (pts * 0.01).toFixed(2);
const fiatFromPts = pts => pts * (FIAT_RATES[walletFiat] || 0.01);
const formatFiat = pts => FIAT_SYMBOL[walletFiat] + fiatFromPts(pts).toFixed(FIAT_DECIMALS[walletFiat] || 2);
const formatBalance = pts => walletShowFiat ? formatFiat(pts) : nFmt(pts) + ' pts';

function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem('ezbet_settings') || '{}');
    return { sound: s.sound !== false, anim: s.anim !== false, instant: !!s.instant, info: s.info !== false };
  } catch (e) { return { sound: true, anim: true, instant: false, info: true }; }
}
function saveSettings() { localStorage.setItem('ezbet_settings', JSON.stringify(settings)); }
function saveAndApply() {
  const s = settings;
  s.sound = getEl('optSound')?.checked !== false;
  s.anim = getEl('optAnim')?.checked !== false;
  s.instant = getEl('optInstant')?.checked === true;
  s.info = getEl('optInfo')?.checked !== false;
  saveSettings();
  toast('Settings saved', 'success');
  closeSettingsModal();
}
function toggleSetting(key) {
  const e = getEl('opt' + key.charAt(0).toUpperCase() + key.slice(1));
  if (!e) return;
  settings[key] = e.checked;
  saveSettings();
}

function toast(msg, type) {
  const box = getEl('toastBox');
  if (!box) { console.log(type, msg); return; }
  const t = document.createElement('div');
  t.className = 'toast ' + (type || 'info');
  t.textContent = msg;
  box.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateX(20px)'; }, 2000);
  setTimeout(() => t.remove(), 2300);
}

async function api(url, opts = {}) {
  try {
    const res = await fetch(url, { credentials: 'include', ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } });
    if (res.status === 401) { user = null; renderUI(); throw new Error('Login required'); }
    if (!res.ok) {
      let errBody = null;
      try { errBody = await res.json(); } catch (_) {}
      if (errBody && errBody.error) toast(errBody.error, 'error');
      else toast('Request failed (' + res.status + ')', 'error');
      throw errBody || new Error('Request failed');
    }
    return res.json();
  } catch (e) { return e && typeof e === 'object' ? e : null; }
}

window.addEventListener('DOMContentLoaded', async () => {
  bindUI();
  applySidebarState();
  await loadMe();
  applySettings();
  applyFiat();
  renderUI();
  await loadPublicConfig();
  renderCasinoGrid();
  initMines();
  initLimbo();
  initCF();
  initHL();
  loadLiveWins();
  if (user) loadNotifications();
  // Hide all pages initially via JS as safety net in case CSS fails
  $$('.page').forEach(p => { if (!p.classList.contains('active')) p.style.display = 'none'; });
  const initial = window.location.pathname.slice(1) || 'home';
  goPage(initial);
});

async function loadMe() {
  const p = new URLSearchParams(window.location.search);
  const token = p.get('token');
  if (token) {
    const me = await api('/api/auth/verify?token=' + encodeURIComponent(token));
    if (me) {
      user = me;
      user.balance = user.balance || 0;
      user.gamesPlayed = user.gamesPlayed || 0;
      window.history.replaceState({}, '', window.location.pathname);
      return;
    }
  }
  const me = await api('/api/me');
  if (me) { user = me; user.balance = user.balance || 0; user.gamesPlayed = user.gamesPlayed || 0; }
}

function renderUI() {
  const amt = getEl('topBalanceAmt');
  if (amt) amt.textContent = walletShowFiat ? formatFiat(user?.balance || 0) : nFmt(user?.balance || 0);
  const pts = getEl('topBalancePts');
  if (pts) pts.textContent = walletShowFiat ? '' : 'PTS';
  // If floating stats is open, refresh its chart
  const fs = getEl('floatingStats');
  if (fs && fs.style.display !== 'none') loadFloatingStats();

  const sf = getEl('sidebarFooter');
  if (sf) {
    if (user) {
      const rk = computeRank(user.totalWagered || 0);
      sf.innerHTML = `<div class="user-mini"><img class="user-avatar" src="${user.avatar || 'https://cdn.discordapp.com/embed/avatars/0.png'}" alt=""/><div class="user-mini-info"><div class="user-mini-name"><img class="user-rank" src="/assets/ranks/${rk.img}" alt="${rk.name}" title="${rk.name}"/><b>${esc(user.username)}</b></div><span class="user-mini-balance">${nFmt(user.balance)} pts</span></div><button class="user-logout" onclick="logout()" title="Logout"><svg class="ni" style="width:14px;height:14px"><use href="#i-logout"/></svg></button></div>`;
    } else {
      sf.innerHTML = `<button class="login-btn" onclick="window.location.href='/auth/discord'"><svg class="ni" style="width:16px;height:16px"><use href="#i-user"/></svg><span>Login</span></button>`;
    }
  }

  if (user) {
    const setVal = (id, v) => { const e = getEl(id); if (e) e.textContent = v; };
    setVal('wbalVal', walletShowFiat ? formatFiat(user.balance) : usd(user.balance));
    setVal('wbalSub', nFmt(user.balance) + ' pts');
    setVal('wsDep', usd(user.totalDeposited || 0));
    setVal('wsWdr', usd(user.totalWithdrawn || 0));
    setVal('wsWag', usd(user.totalWagered || 0));
    const prof = (user.totalWagered || 0) - (user.totalDeposited || 0) + (user.totalWithdrawn || 0) - (user.balance || 0);
    const profEl = getEl('wsProfit');
    if (profEl) { profEl.textContent = usd(prof); profEl.parentElement.classList.toggle('neg', prof < 0); }
    setVal('wdrAvail', nFmt(user.balance));
    const wBadge = getEl('topWagerBadge');
    if (wBadge) {
      if ((user.wagerRequired || 0) > 0) {
        wBadge.style.display = 'inline-flex';
        wBadge.title = 'Wager ' + nFmt(user.wagerRequired) + ' pts to unlock withdraw/tip';
        wBadge.textContent = '🔒';
      } else {
        wBadge.style.display = 'none';
      }
    }
    if (typeof wdrPreview === 'function') wdrPreview();
    if (typeof tipPreview === 'function') tipPreview();
  }
}

function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }

function playOnDiscord() {
  const link = window.__discordInvite || 'https://discord.gg/ezbet';
  window.open(link, '_blank');
}

function bindUI() {
  $$('.nav-item').forEach(n => {
    n.addEventListener('click', e => {
      e.preventDefault();
      if (n.dataset.page) goPage(n.dataset.page);
    });
  });
  $$('.top-tab').forEach(t => {
    t.addEventListener('click', e => { e.preventDefault(); goPage(t.dataset.page); });
  });
  $$('[data-page]').forEach(el => {
    if (el.classList.contains('section-more') || el.classList.contains('game-card') || el.classList.contains('brand-logo'))
      el.addEventListener('click', e => { e.preventDefault(); goPage(el.dataset.page); });
  });
  $$('.wallet-tab').forEach(t => t.addEventListener('click', () => switchWalletTab(t.dataset.wtab)));
  $$('.pf-tab').forEach(t => t.addEventListener('click', () => switchPFTab(t.dataset.pf)));
  $$('.tx-tab').forEach(t => t.addEventListener('click', () => switchTxTab(t.dataset.txtab)));
  const maxBtn = getEl('maxBetBtn');
  if (maxBtn) maxBtn.addEventListener('click', setMaxBet);
  $$('.lb-tab').forEach(t => t.addEventListener('click', () => { lbType = t.dataset.lb; loadLeaderboard(); }));
  $$('.fiat-card').forEach(c => c.addEventListener('click', () => {
    $$('.fiat-card').forEach(x => x.classList.remove('active'));
    c.classList.add('active');
    walletFiat = c.dataset.fiat;
    localStorage.setItem('ezbet_fiat', walletFiat);
    renderUI();
  }));

  const settingsBtn = getEl('settingsBtn');
  if (settingsBtn) settingsBtn.addEventListener('click', () => getEl('settingsModal').classList.add('show'));
  ['optSound', 'optAnim', 'optInstant', 'optInfo'].forEach(id => {
    const el = getEl(id);
    if (!el) return;
    el.addEventListener('change', () => {
      settings = { sound: getEl('optSound').checked, anim: getEl('optAnim').checked, instant: getEl('optInstant').checked, info: getEl('optInfo').checked };
      saveSettings();
    });
  });
  ['setHideZero', 'setShowFiat'].forEach(id => {
    const el = getEl(id);
    if (!el) return;
    el.addEventListener('change', () => {
      walletShowFiat = getEl('setShowFiat').checked;
      localStorage.setItem('ezbet_fiat_toggle', walletShowFiat ? '1' : '0');
      renderUI();
    });
  });

  document.addEventListener('input', e => {
    if (!e.target) return;
    if (e.target.id === 'limTarget') limUpdate();
    else if (e.target.id === 'minesBet') minesUpdate();
    else if (e.target.id === 'limBet') limUpdate();
    else if (e.target.id === 'cfBet') cfUpdate();
    else if (e.target.id === 'hlBet') hlUpdate();
    else if (e.target.id === 'bjBet') {/* nothing live to update */}
  });

  const rand = getEl('minesRandomBtn');
  if (rand) rand.disabled = true;

  const statsBtn = getEl('statsBtn') || document.querySelector('.gb-stats');
  if (statsBtn) statsBtn.addEventListener('click', toggleFloatingStats);
  const fairnessBtn = getEl('fairnessBtn') || document.querySelector('.gb-fairness');
  if (fairnessBtn) fairnessBtn.addEventListener('click', togglePFOverlay);
  document.addEventListener('click', e => {
    const menu = getEl('profileMenu');
    if (menu && !menu.contains(e.target)) menu.classList.remove('show');
  });
}

function toggleSidebar() {
  const collapsed = document.body.classList.toggle('sidebar-collapsed');
  localStorage.setItem('ezbet_sidebar_collapsed', collapsed ? '1' : '0');
}
function applySidebarState() {
  document.body.classList.toggle('sidebar-collapsed', localStorage.getItem('ezbet_sidebar_collapsed') === '1');
}
function toggleProfileMenu() { getEl('profileMenu')?.classList.toggle('show'); }

function applySettings() { ['optSound', 'optAnim', 'optInstant', 'optInfo'].forEach(id => { const e = getEl(id); if (e) e.checked = settings[id.replace('opt', '').toLowerCase()]; }); }
function applyFiat() {
  $$('.fiat-card').forEach(c => c.classList.toggle('active', c.dataset.fiat === walletFiat));
  if (getEl('setShowFiat')) getEl('setShowFiat').checked = walletShowFiat;
}
function closeSettingsModal() { getEl('settingsModal').classList.remove('show'); }
function openSettingsModal() {
  applySettings();
  getEl('settingsModal').classList.add('show');
}

/* =========== NOTIFICATION PANEL =========== */
let notifOpen = false;
function toggleNotifPanel() {
  notifOpen = !notifOpen;
  const p = getEl('notifPanel');
  if (!p) return;
  if (notifOpen) { p.classList.add('show'); loadNotifications(); }
  else p.classList.remove('show');
}
async function loadNotifications() {
  const list = getEl('notifList');
  const dot = getEl('notifDot');
  if (!list || !user) return;
  list.innerHTML = '<div class="notif-empty">Loading...</div>';
  const r = await api('/api/transactions/' + user.userId);
  if (!r || !r.length) { list.innerHTML = '<div class="notif-empty">No notifications yet</div>'; if (dot) dot.hidden = true; return; }
  const recent = r.slice(0, 8);
  if (dot) dot.hidden = false;
  list.innerHTML = recent.map(t => {
    const pos = t.amount > 0;
    const isBonus = (t.description || '').toLowerCase().includes('bonus');
    let bg = 'var(--accent)', icon = 'deposit', color = '#0a1830';
    if (t.type === 'withdraw') { bg = 'var(--gold)'; icon = 'withdraw'; }
    if (isBonus) { bg = 'var(--purple)'; icon = 'gift'; color = '#fff'; }
    const usd = '$' + (Math.abs(t.amount) * 0.01).toFixed(2);
    return `<div class="notif-item">
      <div class="ni-icon" style="background:${bg};color:${color}"><svg class="ni" style="width:14px;height:14px"><use href="#i-${icon}"/></svg></div>
      <div class="ni-text"><b>${esc(t.description || 'Transaction')}</b><span>${new Date(t.createdAt).toLocaleString()}</span></div>
      <div class="ni-amt ${pos ? 'pos' : 'neg'}">${pos ? '+' : '-'}${usd}</div>
    </div>`;
  }).join('');
}
document.addEventListener('click', e => {
  if (!notifOpen) return;
  const p = getEl('notifPanel'); const b = getEl('notifBtn');
  if (p && !p.contains(e.target) && b && !b.contains(e.target)) toggleNotifPanel();
});

/* =========== TRANSACTIONS PAGE =========== */
let txFilter = 'all';
function switchTxTab(f) {
  txFilter = f;
  $$('.tx-tab').forEach(t => t.classList.toggle('active', t.dataset.txtab === f));
  loadTxPage();
}
async function loadTxPage() {
  if (!user) return;
  const list = getEl('txListPage');
  if (!list) return;
  list.innerHTML = '<div class="history-empty">Loading...</div>';
  const r = await api('/api/transactions/' + user.userId);
  if (!r) { list.innerHTML = '<div class="tx-empty">No transactions</div>'; return; }
  let filtered = r;
  if (txFilter === 'deposit') filtered = r.filter(t => t.currency === 'ltc' || (t.type === 'deposit' && t.description && t.description.includes('Deposit')));
  else if (txFilter === 'withdraw') filtered = r.filter(t => t.type === 'withdraw');
  else if (txFilter === 'bonus') filtered = r.filter(t => t.type === 'deposit' && (t.description || '').toLowerCase().includes('bonus'));
  if (!filtered.length) { list.innerHTML = '<div class="tx-empty">No ' + (txFilter === 'all' ? '' : txFilter) + ' transactions</div>'; return; }
  list.innerHTML = filtered.map(t => {
    const pos = t.amount > 0;
    const isBonus = (t.description || '').toLowerCase().includes('bonus');
    let icon = 'wallet', cls = 'deposit';
    if (t.type === 'withdraw') { icon = 'withdraw'; cls = 'withdraw'; }
    if (isBonus) { icon = 'gift'; cls = 'bonus'; }
    const usd = '$' + (Math.abs(t.amount) * 0.01).toFixed(2);
    const crypto = t.cryptoAmount ? t.cryptoAmount + ' LTC' : '';
    return `<div class="tx-row">
      <div class="tx-icon ${cls}"><svg class="ni"><use href="#i-${icon}"/></svg></div>
      <div class="tx-info"><b>${esc(t.description || (t.type === 'deposit' ? 'Deposit' : t.type === 'withdraw' ? 'Withdrawal' : 'Tip'))}</b><span>${t.transactionId} &middot; ${new Date(t.createdAt).toLocaleString()}</span></div>
      <div class="tx-amt ${pos ? 'pos' : 'neg'}">${pos ? '+' : '-'}${usd}${crypto ? '<small>' + crypto + '</small>' : ''}</div>
    </div>`;
  }).join('');
}

/* =========== URL-BASED ROUTING =========== */
const GAME_PAGES = ['mines', 'limbo', 'blackjack', 'coinflip', 'hilo', 'wheel'];
function goPage(name) {
  if (!name) return;
  curPage = name;
  $$('.page').forEach(p => { p.classList.remove('active'); p.style.display = 'none'; });
  const pg = getEl('page-' + name);
  if (pg) { pg.classList.add('active'); pg.style.display = 'block'; }
  $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === name));
  const topMode = name === 'sport' ? 'sport' : 'casino';
  $$('.top-tab').forEach(t => t.classList.toggle('active', t.dataset.page === topMode));
  window.scrollTo(0, 0);
  // Update URL
  const url = name === 'home' ? '/' : '/' + name;
  if (window.location.pathname !== url) window.history.pushState({ page: name }, '', url);
  // Show/hide bottom bar (game pages only)
  const bb = getEl('gameBottombar');
  const isGame = GAME_PAGES.includes(name);
  if (bb) bb.style.display = isGame ? '' : 'none';
  document.body.classList.toggle('has-bottombar', isGame);
  // Load page-specific data
  if (name === 'leaderboard') { loadRace(); loadLeaderboard(); }
  if (name === 'history') loadHistory();
  if (name === 'profile') loadProfile();
  if (name === 'transactions') switchTxTab('all');
  if (name === 'fairness') loadFairnessPage();
  if (name === 'rewards') loadRewards();
  if (name === 'adminpanel') loadAdmin();
  if (name === 'mines') initMines();
  if (name === 'blackjack') bjReset();
  if (name === 'limbo') initLimbo();
  if (name === 'coinflip') initCF();
  if (name === 'hilo') initHL();
  if (name === 'wheel') whlReset();
  if (name === 'casino') renderCasinoGrid();
}

// Handle browser back/forward
window.addEventListener('popstate', e => {
  const name = e.state?.page || window.location.pathname.slice(1) || 'home';
  goPage(name);
});

/* =========== FAUCET / SIMULATED DEPOSIT =========== */
function setDepMsg(id, t, type) { const m = getEl(id); if (m) { m.textContent = t; m.className = 'deposit-test-msg show ' + (type || ''); } }
async function claimFaucet() {
  return toast('Faucet is disabled. Please deposit to play.', 'error');
}
async function simulateDeposit() {
  return toast('Simulated deposits are disabled. Use real Apirone deposits (see instructions in deposit section).', 'error');
}

/* =========== REWARDS =========== */
async function loadRewards() {
  if (!user) return;
  const r = await api('/api/rewards/state');
  if (!r) return;
  const setTxt = (id, v) => { const e = getEl(id); if (e) e.textContent = v; };
  const setCls = (id, v, cls) => { const e = getEl(id); if (e) { e.textContent = v; e.className = 'rw-status ' + cls; } };
  // Daily
  if (r.daily && r.daily.amount) setTxt('rwDailyAmt', '+' + nFmt(r.daily.amount) + ' pts');
  if (r.daily && r.daily.cooldown) setTxt('rwDailyCd', r.daily.cooldown);
  const dBtn = getEl('rwDailyBtn');
  if (dBtn) { dBtn.disabled = !r.daily?.available; }
  setCls('rwDailyStatus', r.daily?.available ? 'Ready' : 'Cooldown', r.daily?.available ? 'ready' : 'cooldown');
  // Weekly
  if (r.weekly && r.weekly.rate) setTxt('rwWeeklyRate', r.weekly.rate);
  if (r.weekly && r.weekly.cap) setTxt('rwWeeklyCap', nFmt(r.weekly.cap) + ' pts');
  const wBtn = getEl('rwWeeklyBtn');
  if (wBtn) { wBtn.disabled = !r.weekly?.available; }
  setCls('rwWeeklyStatus', r.weekly?.available ? 'Ready' : 'Cooldown', r.weekly?.available ? 'ready' : 'cooldown');
  // Monthly
  if (r.monthly && r.monthly.amount) setTxt('rwMonthlyAmt', '+' + nFmt(r.monthly.amount) + ' pts');
  if (r.monthly && r.monthly.minWager) setTxt('rwMonthlyWag', nFmt(r.monthly.minWager) + ' pts');
  const mBtn = getEl('rwMonthlyBtn');
  if (mBtn) { mBtn.disabled = !r.monthly?.available; }
  setCls('rwMonthlyStatus', r.monthly?.available ? 'Ready' : (r.monthly?.lockedReason || 'Locked'), r.monthly?.available ? 'ready' : 'cooldown');
  // Rankup
  if (r.rankup) {
    setTxt('rwRankCurrent', r.rankup.current || 'Bronze');
    if (r.rankup.nextBonus) setTxt('rwRankNext', '+' + nFmt(r.rankup.nextBonus) + ' pts');
  }
  // Rakeback
  if (r.rakeback) {
    if (r.rakeback.rate) setTxt('rwRakeRate', r.rakeback.rate);
    setTxt('rwRakeToday', '+' + nFmt(r.rakeback.today || 0) + ' pts');
    setTxt('rwRakeLife', '+' + nFmt(r.rakeback.lifetime || 0) + ' pts');
  }
  // History
  const hl = getEl('rwHistoryList');
  if (hl) {
    if (r.history && r.history.length) {
      hl.innerHTML = r.history.map(h => '<div class="history-row"><div class="hr-game"><b>' + h.reward + '</b><span>' + new Date(h.t).toLocaleString() + '</span></div><div class="hr-payout" style="color:var(--green)">+' + nFmt(h.amount) + ' pts</div></div>').join('');
    } else {
      hl.innerHTML = '<div class="muted" style="padding:20px;text-align:center">No rewards claimed yet.</div>';
    }
  }
}
async function claimReward(kind) {
  if (!user) return window.location.href = '/auth/discord';
  const r = await api('/api/rewards/claim', { method: 'POST', body: JSON.stringify({ kind }) });
  if (!r) { toast('Failed to claim', 'error'); return; }
  if (r.error) { toast(r.error, 'error'); return; }
  if (r.balance !== undefined) user.balance = r.balance;
  renderUI();
  toast('+' + nFmt(r.amount) + ' pts from ' + kind + '!', 'success');
  loadRewards();
}
async function claimPromoCode(ev) {
  if (ev) ev.preventDefault();
  if (!user) return window.location.href = '/auth/discord';
  const inp = getEl('rwPromoInput');
  const msg = getEl('rwPromoMsg');
  const code = (inp?.value || '').trim().toUpperCase();
  if (!code) { if (msg) { msg.className = 'reward-promo-msg error'; msg.textContent = 'Enter a code first'; } return; }
  if (msg) { msg.className = 'reward-promo-msg'; msg.textContent = 'Checking...'; }
  const r = await api('/api/promo/redeem', { method: 'POST', body: JSON.stringify({ code }) });
  if (!r) { if (msg) { msg.className = 'reward-promo-msg error'; msg.textContent = 'Failed to redeem.'; } return; }
  if (r.error) { if (msg) { msg.className = 'reward-promo-msg error'; msg.textContent = r.error; } return; }
  if (msg) { msg.className = 'reward-promo-msg success'; msg.textContent = '+' + nFmt(r.amount) + ' pts from ' + code + (r.wagerReq ? ' (wager ' + nFmt(r.wagerReq) + ' to withdraw)' : ''); }
  if (r.balance !== undefined) { user.balance = r.balance; }
  if (r.wagerRequired !== undefined) { user.wagerRequired = r.wagerRequired; user.promoLocked = (user.promoLocked || 0) + (r.wagerReq || 0); }
  renderUI();
  if (inp) inp.value = '';
  loadRewards();
}

/* =========== ADMIN PANEL =========== */
const ADMIN_IDS = ['1456255350205579378', '1388859512517165087'];
const DEFAULT_AVATAR = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><circle cx='12' cy='8' r='4' fill='%236b7d8c'/><path d='M4 21a8 8 0 0116 0z' fill='%236b7d8c'/></svg>";
function avatarImg(u) {
  if (u.avatar) return 'https://cdn.discordapp.com/avatars/' + u.userId + '/' + u.avatar + '.png';
  return DEFAULT_AVATAR;
}
function isAdminUser() { return user && ADMIN_IDS.includes(user.userId); }
async function loadAdmin() {
  if (!isAdminUser()) { getEl('adminGate').style.display = 'block'; getEl('adminContent').style.display = 'none'; return; }
  getEl('adminGate').style.display = 'none'; getEl('adminContent').style.display = 'block';
  const cfg = await api('/api/admin/config');
  if (cfg) {
    getEl('cfgHouseEdge').value = cfg.houseEdge;
    getEl('cfgDailyAmt').value = cfg.dailyAmount; getEl('cfgDailyOn').checked = cfg.dailyEnabled;
    getEl('cfgWeeklyPct').value = cfg.weeklyLossbackPercent; getEl('cfgWeeklyCap').value = cfg.weeklyLossbackCap; getEl('cfgWeeklyOn').checked = cfg.weeklyEnabled;
    getEl('cfgMonthlyAmt').value = cfg.monthlyAmount; getEl('cfgMonthlyWag').value = cfg.monthlyMinWager; getEl('cfgMonthlyOn').checked = cfg.monthlyEnabled;
    getEl('cfgRakePct').value = cfg.rakebackPercent; getEl('cfgRakeOn').checked = cfg.rakebackEnabled;
    if (cfg.rankBonuses) {
      getEl('cfgRankBronze').value = cfg.rankBonuses.bronze || 0; getEl('cfgRankSilver').value = cfg.rankBonuses.silver || 0; getEl('cfgRankGold').value = cfg.rankBonuses.gold || 0;
      getEl('cfgRankPlatinum').value = cfg.rankBonuses.platinum || 0; getEl('cfgRankDiamond').value = cfg.rankBonuses.diamond || 0; getEl('cfgRankEmerald').value = cfg.rankBonuses.emerald || 0;
      getEl('cfgRankRuby').value = cfg.rankBonuses.ruby || 0; getEl('cfgRankCelestial').value = cfg.rankBonuses.celestial || 0; getEl('cfgRankEternal').value = cfg.rankBonuses.eternal || 0;
    }
    getEl('cfgWdrOn').checked = cfg.withdrawlsEnabled; getEl('cfgAutoWdr').checked = cfg.autoWithdrawl; getEl('cfgManualWdr').checked = cfg.manualWithdrawl; getEl('cfgMinWdr').value = cfg.minWithdrawl; if (getEl('cfgMaxWdr')) getEl('cfgMaxWdr').value = cfg.maxWithdrawl || 100000;
    getEl('cfgMaintenance').checked = cfg.maintenance; getEl('cfgDiscordInvite').value = cfg.discordInvite || ''; if (cfg.apirone) { getEl('apiApironeStatus').textContent = cfg.apirone.live ? 'Live' : 'Not configured'; getEl('apiApironeStatus').className = cfg.apirone.live ? 'badge-success' : 'badge-banned'; getEl('apiApironeId').textContent = cfg.apirone.accountId || '—'; getEl('apiApironeCb').textContent = cfg.apirone.callbackUrl || '—'; getEl('apiApironeRate').textContent = cfg.apirone.rates && cfg.apirone.rates.ltc ? cfg.apirone.rates.ltc + ' pts' : '—'; }
    if (getEl('cfgWagerRace')) getEl('cfgWagerRace').checked = cfg.wagerRaceEnabled !== false;
  }
  adminLoadGlobal();
  adminLoadUsers();
  adminLoadGames();
  adminLoadPromos();
  loadAdminRaces();
}
function switchAdminTab(name) {
  $$('.admin-tab').forEach(t => t.classList.toggle('active', t.dataset.atab === name));
  $$('.admin-panel').forEach(p => p.style.display = p.dataset.apanel === name ? 'block' : 'none');
  if (name === 'races') loadAdminRaces();
  if (name === 'withdrawals') adminWithdrawTab();
}
async function adminLoadGlobal() {
  const s = await api('/api/admin/global-stats');
  if (!s) return;
  getEl('gsWagered').textContent = '$' + (s.totalWagered * 0.01).toFixed(2);
  getEl('gsDeposits').textContent = '$' + (s.totalDeposited * 0.01).toFixed(2);
  getEl('gsWithdrawals').textContent = '$' + (s.totalWithdrawn * 0.01).toFixed(2);
  getEl('gsPlayers').textContent = s.totalUsers;
  getEl('gsBets').textContent = s.totalGames;
  getEl('gsProfit').textContent = '$' + (s.houseProfit * 0.01).toFixed(2);
}
async function adminSaveGlobal() {
  const v = Number(getEl('cfgHouseEdge').value) || 0;
  const r = await api('/api/admin/config', { method: 'POST', body: JSON.stringify({ houseEdge: v }) });
  if (r) toast('Saved', 'success');
}
async function adminLoadUsers() {
  const search = getEl('userSearch').value; const sort = getEl('userSort').value;
  const list = await api('/api/admin/users?search=' + encodeURIComponent(search) + '&sort=' + sort + '&limit=200');
  const box = getEl('adminUsersList');
  if (!list) { box.innerHTML = '<div class="muted">No users</div>'; return; }
  box.innerHTML = list.map(u => `
    <div class="admin-user-row ${u.isBanned?'banned':''}" onclick="adminOpenUser('${u.userId}')">
      <div class="au-head">
        <img class="au-avatar" src="${avatarImg(u)}" onerror="this.onerror=null;this.src='${DEFAULT_AVATAR}'"/>
        <div style="flex:1;min-width:0">
          <div class="au-name">${u.username} ${u.isBanned?'🚫':''}</div>
          <div class="au-id">${u.userId} · ${u.email||'no email'}</div>
        </div>
      </div>
      <div class="au-stats">
        <div><span>Balance</span><b>$${(u.balance*0.01).toFixed(2)}</b></div>
        <div><span>Wagered</span><b>$${(u.totalWagered*0.01).toFixed(2)}</b></div>
        <div><span>P&amp;L</span><b style="color:${u.totalProfit>=0?'var(--green)':'var(--red)'}">$${(u.totalProfit*0.01).toFixed(2)}</b></div>
        <div><span>Deposit</span><b>$${(u.totalDeposited*0.01).toFixed(2)}</b></div>
        <div><span>Withdraw</span><b>$${(u.totalWithdrawn*0.01).toFixed(2)}</b></div>
        <div><span>Games</span><b>${u.gamesPlayed}</b></div>
      </div>
    </div>
  `).join('');
}
async function adminOpenUser(id) {
  switchAdminTab('user-detail');
  const d = await api('/api/admin/users/' + id);
  if (!d) return;
  const u = d.user;
  getEl('adUserTitle').textContent = u.username + ' (' + u.userId + ')';
  const html = `
    <div class="admin-user-row" style="cursor:default">
      <div class="au-head">
        <img class="au-avatar" src="${avatarImg(u)}" onerror="this.onerror=null;this.src='${DEFAULT_AVATAR}'"/>
        <div style="flex:1;min-width:0">
          <div class="au-name">${u.username} ${u.isBanned?'🚫':''} <span style="color:var(--gold);font-size:11px">${u.currentRank}</span></div>
          <div class="au-id">${u.userId} · ${u.email||'no email'} · joined ${new Date(u.createdAt).toLocaleDateString()}</div>
        </div>
      </div>
      <div class="au-stats">
        <div><span>Balance</span><b>$${(u.balance*0.01).toFixed(2)}</b></div>
        <div><span>Wagered</span><b>$${(u.totalWagered*0.01).toFixed(2)}</b></div>
        <div><span>Deposit</span><b>$${(u.totalDeposited*0.01).toFixed(2)}</b></div>
        <div><span>Withdraw</span><b>$${(u.totalWithdrawn*0.01).toFixed(2)}</b></div>
        <div><span>Wins</span><b>${u.wins}</b></div>
        <div><span>Losses</span><b>${u.losses}</b></div>
      </div>
      <div class="au-stats" style="margin-top:6px">
        <div><span>Wager Req</span><b style="color:${(u.wagerRequired||0)>0?'var(--orange)':'var(--text2)'}">$${((u.wagerRequired||0)*0.01).toFixed(2)}</b></div>
        <div><span>Deposit Lock</span><b>$${((u.depositLocked||0)*0.01).toFixed(2)}</b></div>
        <div><span>Promo Lock</span><b>$${((u.promoLocked||0)*0.01).toFixed(2)}</b></div>
        <div><span>Tip Lock</span><b>$${((u.tipLocked||0)*0.01).toFixed(2)}</b></div>
        <div><span>Rigg%</span><b>${u.riggPercent||0}%</b></div>
        <div><span>VIP</span><b>${u.vip?'Yes':'No'}</b></div>
      </div>
      <div class="au-actions">
        <button class="primary" onclick="adminModalBalance('${u.userId}','add')">+ Add Money</button>
        <button onclick="adminModalBalance('${u.userId}','remove')">- Remove Money</button>
        <button onclick="adminModalBalance('${u.userId}','set')">= Set Balance</button>
        <button onclick="adminModalWager('${u.userId}')">+ Add Wager</button>
        <button onclick="adminModalRigg('${u.userId}',${u.riggPercent||0})">Rigg% (${u.riggPercent||0}%)</button>
        <button class="${u.isBanned?'primary':'danger'}" onclick="adminToggleBan('${u.userId}',${!u.isBanned})">${u.isBanned?'Unban':'Ban'}</button>
        <button onclick="adminResetStats('${u.userId}')">Reset Stats</button>
        <button class="danger" onclick="adminResetAll('${u.userId}')">Reset All</button>
      </div>
    </div>
    <div class="admin-card">
      <h4>Bet History (latest 200)</h4>
      <table class="ad-history-table"><thead><tr><th>When</th><th>Game</th><th>Bet</th><th>Mult</th><th>Payout</th><th>Result</th></tr></thead><tbody>
        ${d.games.map(g => `<tr><td>${new Date(g.createdAt).toLocaleString()}</td><td>${g.gameType}</td><td>$${(g.betAmount*0.01).toFixed(2)}</td><td>${(g.multiplier||0).toFixed(2)}x</td><td>$${((g.payout||0)*0.01).toFixed(2)}</td><td style="color:${g.result==='win'?'var(--green)':g.result==='lose'?'var(--red)':'var(--gold)'}">${g.result}</td></tr>`).join('')}
      </tbody></table>
    </div>
    <div class="admin-card">
      <h4>Transactions (deposits, withdrawals, bonuses, tips)</h4>
      <table class="ad-history-table"><thead><tr><th>When</th><th>Type</th><th>Amount</th><th>Status</th><th>Description</th><th>Address</th><th>Hash</th></tr></thead><tbody>
        ${d.transactions.map(t => `<tr><td>${new Date(t.createdAt).toLocaleString()}</td><td>${t.type}</td><td>$${((t.amount||0)*0.01).toFixed(2)} ${t.currency||''}</td><td>${t.status}</td><td>${t.description||''}</td><td style="font-size:10px">${t.cryptoAddress||''}</td><td style="font-size:10px">${t.cryptoHash||''}</td></tr>`).join('')}
      </tbody></table>
    </div>`;
  getEl('adUserContent').innerHTML = html;
}
function adminModalBalance(id, action) {
  const amt = prompt('Amount in points ('+action+'):');
  if (!amt) return;
  api('/api/admin/user/'+id+'/balance', { method: 'POST', body: JSON.stringify({ action, amount: Number(amt) }) }).then(r => { if (r) { toast('Done. New balance: $' + (r.balance*0.01).toFixed(2), 'success'); adminOpenUser(id); } });
}
function adminModalWager(id) {
  const amt = prompt('Add wagered amount in points:');
  if (!amt) return;
  api('/api/admin/user/'+id+'/wager', { method: 'POST', body: JSON.stringify({ amount: Number(amt) }) }).then(r => { if (r) { toast('Wagered now: $' + (r.totalWagered*0.01).toFixed(2), 'success'); adminOpenUser(id); } });
}
function adminModalRigg(id, current) {
  const v = prompt('Rigg % (0-100, more = more losses). Current: ' + current);
  if (v === null) return;
  api('/api/admin/user/'+id+'/rigg', { method: 'POST', body: JSON.stringify({ percent: Number(v) }) }).then(r => { if (r) { toast('Rigg set to ' + r.riggPercent + '%', 'success'); adminOpenUser(id); } });
}
function adminToggleBan(id, banned) {
  if (banned && !confirm('Ban this user?')) return;
  const reason = banned ? (prompt('Ban reason?') || '') : '';
  api('/api/admin/user/'+id+'/ban', { method: 'POST', body: JSON.stringify({ banned, reason }) }).then(r => { if (r) { toast(r.isBanned?'Banned':'Unbanned', 'success'); adminOpenUser(id); } });
}
function adminResetStats(id) {
  if (!confirm('Reset this user stats? This clears bet history and resets wager/wins/losses/rank.')) return;
  api('/api/admin/user/'+id+'/reset-stats', { method: 'POST' }).then(r => { if (r) { toast('Stats reset', 'success'); adminOpenUser(id); } });
}
function adminResetAll(id) {
  if (!confirm('DANGER: This will delete ALL data for this user including deposits, withdrawls, history. Continue?')) return;
  if (!confirm('Are you absolutely sure? This cannot be undone.')) return;
  api('/api/admin/user/'+id+'/reset-all', { method: 'POST' }).then(r => { if (r) { toast('All data reset', 'success'); adminOpenUser(id); } });
}
async function adminLoadGames() {
  const list = await api('/api/admin/games');
  const box = getEl('adminGamesList');
  if (!list) return;
  box.innerHTML = list.map(g => `
    <div class="admin-game-row ${g.enabled?'':'disabled'}" onclick="adminOpenGame('${g.key}')">
      <div class="agr-img" style="background-image:url('assets/game_cards/${g.key==='wheel'?'crash':g.key}.png')"></div>
      <div class="agr-info">
        <div class="agr-name">${g.name} ${g.enabled?'<span style="color:var(--green);font-size:10px">● ON</span>':'<span style="color:var(--red);font-size:10px">● OFF</span>'}</div>
        <div class="agr-stats">
          <span>House: ${g.houseEdge}%</span>
          <span>Bets: ${g.totalBets}</span>
          <span>Wager: $${(g.wagered*0.01).toFixed(0)}</span>
        </div>
      </div>
    </div>
  `).join('');
}
async function adminOpenGame(key) {
  switchAdminTab('game-detail');
  const [all, history] = await Promise.all([api('/api/admin/games'), api('/api/admin/games/'+key+'/history')]);
  const g = all.find(x => x.key === key);
  if (!g) return;
  getEl('adGameTitle').textContent = g.name;
  getEl('adGameContent').innerHTML = `
    <div class="admin-grid">
      <div class="admin-card"><div class="ac-label">Total Wagered</div><div class="ac-val">$${(g.wagered*0.01).toFixed(2)}</div></div>
      <div class="admin-card"><div class="ac-label">Total Payouts</div><div class="ac-val">$${(g.payout*0.01).toFixed(2)}</div></div>
      <div class="admin-card"><div class="ac-label">Profit</div><div class="ac-val" style="color:${g.profit>=0?'var(--green)':'var(--red)'}">$${(g.profit*0.01).toFixed(2)}</div></div>
      <div class="admin-card"><div class="ac-label">Total Bets</div><div class="ac-val">${g.totalBets}</div></div>
      <div class="admin-card"><div class="ac-label">Big Wins (10x+)</div><div class="ac-val" style="color:var(--gold)">${g.bigWins}</div></div>
    </div>
    <div class="admin-card">
      <h4>Game Settings</h4>
      <div class="admin-row">
        <label>House Edge %</label>
        <input type="number" id="gameEdge" class="ctrl-input" step="0.1" min="0" max="50" value="${g.houseEdge}"/>
        <button class="btn-primary" onclick="adminSaveGameEdge('${key}')">Save Edge</button>
      </div>
      <div class="admin-row">
        <label>Game Status</label>
        <label style="display:inline-flex;align-items:center;gap:6px"><input type="checkbox" id="gameEnabled" ${g.enabled?'checked':''}/> Enabled (visible to players)</label>
        <button class="btn-primary" onclick="adminToggleGame('${key}')">Apply</button>
      </div>
    </div>
    <div class="admin-card">
      <h4>Recent Bet History</h4>
      <table class="ad-history-table"><thead><tr><th>When</th><th>User</th><th>Bet</th><th>Mult</th><th>Payout</th><th>Result</th></tr></thead><tbody>
        ${(history||[]).map(h => `<tr><td>${new Date(h.createdAt).toLocaleString()}</td><td>${h.username}</td><td>$${(h.betAmount*0.01).toFixed(2)}</td><td>${(h.multiplier||0).toFixed(2)}x</td><td>$${((h.payout||0)*0.01).toFixed(2)}</td><td style="color:${h.result==='win'?'var(--green)':h.result==='lose'?'var(--red)':'var(--gold)'}">${h.result}</td></tr>`).join('')}
      </tbody></table>
    </div>
  `;
}
function adminSaveGameEdge(key) {
  const v = Number(getEl('gameEdge').value) || 0;
  api('/api/admin/games/'+key+'/edge', { method: 'POST', body: JSON.stringify({ edge: v }) }).then(r => { if (r) toast('Saved', 'success'); });
}
function adminToggleGame(key) {
  const en = getEl('gameEnabled').checked;
  api('/api/admin/games/'+key+'/toggle', { method: 'POST', body: JSON.stringify({ enabled: en }) }).then(r => { if (r) { toast(en?'Game enabled':'Game disabled', 'success'); adminOpenGame(key); adminLoadGames(); } });
}
async function adminSaveRewards() {
  const body = {
    dailyAmount: Number(getEl('cfgDailyAmt').value) || 0, dailyEnabled: getEl('cfgDailyOn').checked,
    weeklyLossbackPercent: Number(getEl('cfgWeeklyPct').value) || 0, weeklyLossbackCap: Number(getEl('cfgWeeklyCap').value) || 0, weeklyEnabled: getEl('cfgWeeklyOn').checked,
    monthlyAmount: Number(getEl('cfgMonthlyAmt').value) || 0, monthlyMinWager: Number(getEl('cfgMonthlyWag').value) || 0, monthlyEnabled: getEl('cfgMonthlyOn').checked,
    rakebackPercent: Number(getEl('cfgRakePct').value) || 0, rakebackEnabled: getEl('cfgRakeOn').checked,
    rankBonuses: { bronze: Number(getEl('cfgRankBronze').value)||0, silver: Number(getEl('cfgRankSilver').value)||0, gold: Number(getEl('cfgRankGold').value)||0, platinum: Number(getEl('cfgRankPlatinum').value)||0, diamond: Number(getEl('cfgRankDiamond').value)||0, emerald: Number(getEl('cfgRankEmerald').value)||0, ruby: Number(getEl('cfgRankRuby').value)||0, celestial: Number(getEl('cfgRankCelestial').value)||0, eternal: Number(getEl('cfgRankEternal').value)||0 }
  };
  const r = await api('/api/admin/config', { method: 'POST', body: JSON.stringify(body) });
  if (r) toast('Rewards saved', 'success');
}
async function adminCreatePromo() {
  const code = getEl('prCode').value.trim(); if (!code) return toast('Code required', 'error');
  const body = { code, amount: Number(getEl('prAmount').value)||0, maxUses: Number(getEl('prMax').value)||1, wagerReq: Number(getEl('prWager').value)||0, wagerMult: Number(getEl('prWagerMult').value)||2, withdrawlWagerReq: Number(getEl('prWdrWager').value)||0, minRank: getEl('prMinRank').value.trim() };
  const r = await api('/api/admin/promo', { method: 'POST', body: JSON.stringify(body) });
  if (r) { toast('Promo created', 'success'); adminLoadPromos(); getEl('prCode').value=''; getEl('prAmount').value=''; }
}
async function adminLoadPromos() {
  const list = await api('/api/admin/promos');
  const box = getEl('adminPromoList');
  if (!list) return;
  box.innerHTML = '<table class="ad-history-table"><thead><tr><th>Code</th><th>Amount</th><th>Uses</th><th>Wager (×)</th><th>Min Rank</th><th>Active</th><th></th></tr></thead><tbody>' +
    list.map(p => `<tr><td><b>${p.code}</b></td><td>$${(p.amount*0.01).toFixed(2)}</td><td>${p.used}/${p.maxUses}</td><td>${(p.amount * (p.wagerMult||2)).toLocaleString()} (×${p.wagerMult||2})</td><td>${p.minRank||'—'}</td><td>${p.isActive?'✓':'✗'}</td><td><button class="danger" onclick="adminDeletePromo('${p._id}')">Delete</button></td></tr>`).join('') + '</tbody></table>';
}
function adminDeletePromo(id) {
  if (!confirm('Delete this promo code?')) return;
  api('/api/admin/promo/'+id, { method: 'DELETE' }).then(() => adminLoadPromos());
}
async function adminSaveUtility() {
  const body = {
    withdrawlsEnabled: getEl('cfgWdrOn').checked, autoWithdrawl: getEl('cfgAutoWdr').checked, manualWithdrawl: getEl('cfgManualWdr').checked, minWithdrawl: Number(getEl('cfgMinWdr').value) || 0, maxWithdrawl: Number(getEl('cfgMaxWdr').value) || 0,
    maintenance: getEl('cfgMaintenance').checked, discordInvite: getEl('cfgDiscordInvite').value,
    wagerRaceEnabled: getEl('cfgWagerRace') ? getEl('cfgWagerRace').checked : true
  };
  const r = await api('/api/admin/config', { method: 'POST', body: JSON.stringify(body) });
  if (r) toast('Saved', 'success');
  loadPublicConfig();
}
async function adminGlobalRigg() {
  const v = Number(getEl('globalRiggInput').value) || 0;
  if (v < 0 || v > 100) return toast('Rigg% must be 0-100', 'error');
  if (!confirm('Apply rigg=' + v + '% to EVERY user? This will make everyone lose ' + v + '% more of their bets.')) return;
  const r = await api('/api/admin/user/rigg-all', { method: 'POST', body: JSON.stringify({ percent: v }) });
  if (r) { toast('Global rigg set to ' + v + '% (' + r.matched + ' users)', 'success'); adminLoadUsers(); }
}
async function loadAdminRaces() {
  const card = getEl('raceCurrentCard'); if (!card) return;
  const r = await api('/api/admin/races');
  if (!r) return;
  const cur = r.current;
  if (cur) {
    const total = (cur.entries || []).reduce((s, e) => s + e.wagered, 0);
    const top3 = (cur.entries || []).slice().sort((a, b) => b.wagered - a.wagered).slice(0, 3);
    card.innerHTML = `
      <div style="display:flex;gap:12px;flex-wrap:wrap">
        <div style="flex:1;min-width:200px">
          <h3 style="margin:0 0 6px">${esc(cur.title)}</h3>
          <div class="muted" style="font-size:12px">Key: <code>${esc(cur.key)}</code></div>
          <div class="muted" style="font-size:12px">Status: <b style="color:${cur.status === 'active' ? 'var(--accent)' : 'var(--muted)'}">${cur.status}</b></div>
          <div class="muted" style="font-size:12px">Ends: ${new Date(cur.endAt).toLocaleString()}</div>
        </div>
        <div style="flex:1;min-width:200px">
          <div class="admin-stat"><span>Prize Pool</span><b>$${(cur.prizePool * 0.01).toFixed(2)}</b></div>
          <div class="admin-stat"><span>Total Wagered</span><b>$${(total * 0.01).toFixed(2)}</b></div>
          <div class="admin-stat"><span>Players</span><b>${(cur.entries || []).length}</b></div>
          <div class="admin-stat"><span>Distribution</span><b>${(cur.distribution || []).join('% / ')}%</b></div>
        </div>
      </div>
      ${top3.length ? '<div style="margin-top:10px"><b>Top 3:</b><ol style="margin:6px 0;padding-left:20px">' + top3.map(e => '<li>' + esc(e.username || '?') + ' — $' + (e.wagered * 0.01).toFixed(2) + '</li>').join('') + '</ol></div>' : ''}`;
  } else {
    card.innerHTML = '<div class="muted">No active race. Start one below.</div>';
  }
  const hist = getEl('raceHistoryList');
  if (hist) {
    const list = r.history || [];
    if (!list.length) hist.innerHTML = '<div class="muted">No past races yet.</div>';
    else hist.innerHTML = '<div style="display:flex;flex-direction:column;gap:6px">' + list.map(race => {
      const total = (race.entries || []).reduce((s, e) => s + e.wagered, 0);
      return `<div style="display:flex;justify-content:space-between;padding:8px 10px;background:var(--bg3);border:1px solid var(--line2);border-radius:6px;font-size:12px">
        <div><b>${esc(race.title)}</b><br><span class="muted" style="font-size:10px">${new Date(race.startAt).toLocaleDateString()} → ${new Date(race.endAt).toLocaleDateString()}</span></div>
        <div style="text-align:right"><b>$${(race.prizePool * 0.01).toFixed(2)}</b><br><span class="muted" style="font-size:10px">${race.status} · ${race.entries.length} players · $${(total*0.01).toFixed(2)} wagered</span></div>
      </div>`;
    }).join('') + '</div>';
  }
}
async function adminCreateRace() {
  if (!confirm('End the current race and start a new one with the configured prize pool?')) return;
  const title = getEl('raceNewTitle').value || 'Weekly Wager Race';
  const pool = Number(getEl('raceNewPool').value) || 50000;
  const days = Math.max(1, Number(getEl('raceNewDays').value) || 7);
  const dist = (getEl('raceNewDist').value || '40,25,15,10,7,3').split(',').map(n => parseInt(n.trim()) || 0).filter(n => n > 0);
  const r = await api('/api/admin/races', { method: 'POST', body: JSON.stringify({ title, prizePool: pool, days, distribution: dist }) });
  if (r) { toast('New race started', 'success'); loadAdminRaces(); }
}
function adminResetAllStats() {
  if (!confirm('Reset ALL statistics for ALL users? This clears every bet history but keeps user accounts.')) return;
  api('/api/admin/utility/reset-all-stats', { method: 'POST' }).then(r => { if (r) { toast('All stats reset', 'success'); adminLoadGlobal(); } });
}
function adminResetDatabase() {
  if (!confirm('DANGER: This will DELETE everything - all users, bets, transactions, promos. Continue?')) return;
  if (!confirm('Type CHECK in next prompt to confirm.')) return;
  const c = prompt('Type CHECK (uppercase) to confirm:');
  if (c !== 'CHECK') return toast('Cancelled', 'error');
  api('/api/admin/utility/reset-database', { method: 'POST' }).then(r => { if (r) { toast('Database wiped', 'success'); location.reload(); } });
}

/* ---------- ADMIN WITHDRAWALS ---------- */
async function adminLoadWithdrawals(status) {
  const data = await api('/api/admin/withdrawals' + (status ? '?status=' + status : ''));
  const list = getEl('adWithdrawList');
  if (!list) return;
  if (!data || !data.length) { list.innerHTML = '<div class="muted">No withdrawals found</div>'; return; }
  list.innerHTML = data.map(tx => {
    const amt = Math.abs(tx.amount || 0);
    const d = new Date(tx.createdAt);
    const statusClass = tx.status === 'completed' ? 'badge-success' : tx.status === 'failed' ? 'badge-banned' : 'badge-pending';
    return '<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--line2);font-size:12px">' +
      '<span class="mono" style="flex-shrink:0;color:var(--muted);font-size:10px">#' + esc(tx.transactionId) + '</span>' +
      '<span class="muted" style="flex:1">' + esc(tx.username) + '</span>' +
      '<b style="color:var(--gold)">' + nFmt(amt) + ' pts</b>' +
      '<span class="' + statusClass + '">' + tx.status + '</span>' +
      '<span class="muted" style="font-size:10px">' + d.toLocaleDateString() + '</span>' +
      (tx.status === 'pending' ? '<button class="gc-play" style="padding:4px 12px;font-size:11px;width:auto;margin:0" onclick="adminApproveWdr(\'' + esc(tx.transactionId) + '\')">Approve</button><button class="gc-secondary" style="padding:4px 12px;font-size:11px;width:auto" onclick="adminRejectWdr(\'' + esc(tx.transactionId) + '\')">Reject</button>' : '') +
      '<span class="muted" style="font-size:10px;max-width:100px;overflow:hidden;text-overflow:ellipsis">' + esc(tx.cryptoAddress || '') + '</span>' +
    '</div>';
  }).join('');
}

async function adminApproveWdr(id) {
  const r = await api('/api/admin/withdrawals/' + encodeURIComponent(id) + '/approve', { method: 'POST' });
  if (r) { toast('Withdrawal approved', 'success'); adminLoadWithdrawals('pending'); adminLoadHouseBal(); }
}

async function adminRejectWdr(id) {
  if (!confirm('Reject withdraw ' + id + '? User will be refunded automatically.')) return;
  const r = await api('/api/admin/withdrawals/' + encodeURIComponent(id) + '/reject', { method: 'POST' });
  if (r) { toast('Withdrawal rejected, refunded ' + nFmt(r.refunded) + ' pts', 'success'); adminLoadWithdrawals('pending'); adminLoadHouseBal(); }
}

async function adminLoadHouseBal() {
  const r = await api('/api/admin/house-balance');
  if (!r) return;
  const set = (id, v) => { const e = getEl(id); if (e) e.textContent = v; };
  set('adHouseBal', nFmt(r.netHouse || 0) + ' pts');
  set('adPendingCount', r.pendingCount || '—');
  set('adTotalDep', nFmt(r.totalDeposited || 0) + ' pts');
  set('adTotalWagered', nFmt(r.totalWagered || 0) + ' pts');
  // Also update global panel
  set('gsDeposits', '$' + (r.totalDeposited * 0.01).toFixed(2));
  set('gsWithdrawals', '$' + (r.totalWithdrawn * 0.01).toFixed(2));
}

async function adminWithdrawTab() {
  adminLoadHouseBal();
  adminLoadWithdrawals('pending');
}

// Public config (maintenance, enabled games)
async function loadPublicConfig() {
  const cfg = await api('/api/public/config');
  if (!cfg) return;
  if (cfg.discordInvite) {
    window.__discordInvite = cfg.discordInvite;
    const link = getEl('maintDiscordLink');
    if (link) link.href = cfg.discordInvite;
  }
  const banner = getEl('maintenanceBanner');
  if (banner) banner.style.display = cfg.maintenance ? 'block' : 'none';
  if (cfg.gamesEnabled) {
    $$('.game-card').forEach(c => {
      const pg = c.dataset.page;
      if (pg && cfg.gamesEnabled[pg] === false) c.style.display = 'none';
      else c.style.display = '';
    });
    $$('.nav-item').forEach(n => {
      const pg = n.dataset.page;
      if (pg && cfg.gamesEnabled[pg] === false) n.style.display = 'none';
      else n.style.display = '';
    });
  }
  if (cfg.minWithdrawl !== undefined) {
    const minEl = getEl('wdrMin');
    if (minEl) minEl.textContent = cfg.minWithdrawl;
  }
  if (cfg.maxWithdrawl !== undefined) {
    window.__maxWithdrawl = cfg.maxWithdrawl;
    const maxEl = getEl('wdrMax');
    if (maxEl) maxEl.textContent = cfg.maxWithdrawl.toLocaleString();
  }
  if (cfg.rewardDiscordRequired) {
    window.__rewardDiscordRequired = cfg.rewardDiscordRequired;
  }
}

// =========== WALLET ===========
function openWalletModal(tab) {
  if (!user) { window.location.href = '/auth/discord'; return; }
  switchWalletTab(tab || 'overview');
  getEl('walletModal').classList.add('show');
  const avail = getEl('wdrAvail'); if (avail) avail.textContent = nFmt(user.balance || 0);
  setTimeout(() => { loadDepositAddress(); wdrPreview(); }, 200);
}
function closeWalletModal() { getEl('walletModal').classList.remove('show'); }
function switchWalletTab(name) {
  $$('.wallet-tab').forEach(t => t.classList.toggle('active', t.dataset.wtab === name));
  $$('.wallet-panel').forEach(p => p.classList.toggle('active', p.dataset.wpanel === name));
  if (name === 'deposit') setTimeout(loadDepositAddress, 100);
}

async function loadDepositAddress() {
  if (!user) return;
  const status = getEl('depositStatus');
  const statusText = status?.querySelector('.deposit-status-text');
  const res = await api('/api/me/deposit');
  if (!res || !res.address) {
    if (status) status.className = 'deposit-status error';
    if (statusText) statusText.textContent = (res && res.error) || 'Apirone not configured';
    const ph = getEl('depositQrPlaceholder');
    if (ph) { ph.style.display = 'flex'; ph.innerHTML = '<svg class="ni" style="width:32px;height:32px;color:var(--red)"><use href="#i-x"/></svg><span style="color:var(--red);text-align:center;padding:0 12px">' + ((res && res.error) || 'Deposits unavailable') + '</span>'; }
    return;
  }
  const addr = res.address;
  const el = getEl('depositAddr');
  if (el) el.textContent = addr;
  if (status) status.className = 'deposit-status online';
  if (statusText) statusText.textContent = 'Live \u2014 ' + (res.network || 'LTC') + ' deposits enabled';

  const canvas = getEl('depositQrCanvas');
  const placeholder = getEl('depositQrPlaceholder');
  if (res.qrDataUrl && placeholder) {
    if (canvas) canvas.style.display = 'none';
    placeholder.style.display = 'flex';
    placeholder.innerHTML = `<img class="deposit-qr-img" src="${esc(res.qrDataUrl)}" alt="Litecoin deposit QR"/>`;
    loadDepositRecent();
    return;
  }
  if (canvas) {
    try {
      canvas.style.display = 'block';
      if (placeholder) placeholder.style.display = 'none';
      if (typeof QRCode !== 'undefined') {
        canvas.width = 220; canvas.height = 220;
        QRCode.toCanvas(canvas, addr, { width: 220, margin: 2, color: { dark: '#0f1923', light: '#fff' } }, err => {
          if (err) { canvas.style.display = 'none'; if (placeholder) { placeholder.style.display = 'flex'; placeholder.innerHTML = '<span style="color:var(--red)">QR error</span>'; } }
        });
      } else {
        try {
          canvas.style.display = 'block';
          if (placeholder) placeholder.style.display = 'none';
          canvas.width = 220; canvas.height = 220;
          const QR = window.QRCode || window.qrcode;
          if (QR && typeof QR.toCanvas === 'function') QR.toCanvas(canvas, addr, { width: 220, margin: 2, color: { dark: '#0f1923', light: '#fff' } });
          else {
            canvas.style.display = 'none';
            if (placeholder) { placeholder.style.display = 'flex'; placeholder.innerHTML = '<span class="muted">Use address below to deposit</span>'; }
          }
        } catch (e) { console.error('QR error:', e); canvas.style.display = 'none'; if (placeholder) { placeholder.style.display = 'flex'; placeholder.innerHTML = '<span class="muted">Use address below to deposit</span>'; } }
      }
    } catch (e) { console.error('QR error:', e); }
  }
  loadDepositRecent();
}
async function loadDepositRecent() {
  const wrap = getEl('depositRecent');
  if (!wrap || !user) return;
  const tx = await api('/api/me/transactions?type=deposit&limit=8');
  if (!tx || !tx.length) { wrap.innerHTML = '<div class="muted" style="font-size:12px">No deposits yet. Make your first one above.</div>'; return; }
  wrap.innerHTML = tx.map(t => {
    const amt = (t.amount || 0) * 0.01;
    const st = t.status || 'confirmed';
    return `<div class="dr-row">
      <div class="dr-info"><b>+$${amt.toFixed(2)}</b><small>${esc(t.address || '')}</small></div>
      <div class="dr-amt">${(amt * 100).toFixed(0)} pts</div>
      <div class="dr-status ${st}">${st}</div>
    </div>`;
  }).join('');
}

function copyDepositAddr() {
  const addr = getEl('depositAddr')?.textContent;
  if (!addr || addr === '\u2014') return toast('No address yet', 'error');
  navigator.clipboard.writeText(addr).then(() => toast('Address copied to clipboard', 'success'));
}

function wdrHalve() { const i = getEl('wdrAmt'); if (i) { i.value = Math.max(1, Math.floor((user?.balance || 0) / 2)); wdrPreview(); } }
function wdrDouble() { const i = getEl('wdrAmt'); if (i) { i.value = Math.min(user?.balance || 0, (parseInt(i.value) || 0) * 2); wdrPreview(); } }
function wdrMax() { const i = getEl('wdrAmt'); if (i && user) { i.value = user.balance || 0; wdrPreview(); } }
function wdrPreview() {
  const amt = parseInt(getEl('wdrAmt')?.value) || 0;
  const minEl = getEl('wdrMin');
  const min = minEl ? parseInt(minEl.textContent) || 1000 : 1000;
  const maxW = window.__maxWithdrawl || 100000;
  const fee = 100;
  const preview = getEl('wdrPreview');
  const warn = getEl('wdrWarn');
  const avail = user?.balance || 0;
  const wReq = user?.wagerRequired || 0;
  const dLock = user?.depositLocked || 0;
  const pLock = user?.promoLocked || 0;
  const tLock = user?.tipLocked || 0;
  const wBanner = getEl('wdrWagerBanner');
  if (wBanner) {
    if (wReq > 0) {
      wBanner.style.display = 'block';
      let breakdown = [];
      if (dLock > 0) breakdown.push('Deposit: ' + nFmt(dLock));
      if (pLock > 0) breakdown.push('Promo: ' + nFmt(pLock));
      if (tLock > 0) breakdown.push('Tip: ' + nFmt(tLock));
      wBanner.innerHTML = '<strong>Wager required:</strong> ' + nFmt(wReq) + ' pts before you can withdraw.' + (breakdown.length ? ' (' + breakdown.join(' · ') + ')' : '');
    } else {
      wBanner.style.display = 'none';
    }
  }
  if (amt > 0) { if (preview) preview.style.display = 'grid'; set('wdrSend', nFmt(amt) + ' pts'); set('wdrReceive', nFmt(Math.max(0, amt - fee)) + ' pts'); }
  else { if (preview) preview.style.display = 'none'; }
  if (warn) {
    if (avail <= 0) warn.textContent = 'Invalid points \u2014 top up your balance to withdraw';
    else if (wReq > 0) warn.textContent = 'Wager requirement not met \u2014 wager ' + nFmt(wReq) + ' more pts to unlock withdrawals';
    else if (amt < min) warn.textContent = 'Below minimum withdrawl of ' + nFmt(min) + ' pts';
    else if (amt > maxW) warn.textContent = 'Above maximum withdrawl of ' + nFmt(maxW) + ' pts';
    else if (amt > avail) warn.textContent = 'Invalid points \u2014 you only have ' + nFmt(avail) + ' pts';
    else warn.style.display = 'none';
    warn.style.display = (avail <= 0 || wReq > 0 || amt < min || amt > maxW || amt > avail) ? 'block' : 'none';
  }
  const btn = getEl('wdrBtn');
  if (btn) btn.disabled = wReq > 0;
}
function set(id, v) { const e = getEl(id); if (e) e.textContent = v; }
function wdrMsg(t, type) { const m = getEl('withdrawMsg'); if (m) { m.textContent = t; m.className = 'withdraw-msg show ' + (type || ''); } }
function tipMsg(t, type) { const m = getEl('tipMsg'); if (m) { m.textContent = t; m.className = 'withdraw-msg show ' + (type || ''); } }

async function doWithdraw() {
  if (!user) return;
  const addr = getEl('wdrAddr')?.value.trim();
  const amt = parseInt(getEl('wdrAmt')?.value);
  const minEl = getEl('wdrMin');
  const min = minEl ? parseInt(minEl.textContent) || 1000 : 1000;
  const maxW = window.__maxWithdrawl || 100000;
  if ((user.balance || 0) <= 0) return wdrMsg('Invalid points \u2014 top up your balance to withdraw', 'error');
  if ((user.wagerRequired || 0) > 0) return wdrMsg('Wager requirement not met \u2014 wager ' + nFmt(user.wagerRequired) + ' more pts to unlock withdrawals', 'error');
  if (!addr || !(addr.startsWith('ltc1') || addr.startsWith('L') || addr.startsWith('3') || addr.startsWith('M'))) return wdrMsg('Enter a valid LTC address (ltc1, L, M, or 3...)', 'error');
  if (!amt || amt < min) return wdrMsg('Minimum withdrawl: ' + nFmt(min) + ' pts', 'error');
  if (amt > maxW) return wdrMsg('Maximum withdrawl: ' + nFmt(maxW) + ' pts', 'error');
  if (amt > user.balance) return wdrMsg('Invalid points \u2014 you have ' + nFmt(user.balance) + ' pts', 'error');
  const btn = getEl('wdrBtn');
  btn.disabled = true; btn.textContent = 'Submitting...';
  const res = await api('/api/withdraw', { method: 'POST', body: JSON.stringify({ address: addr, amount: amt }) });
  btn.disabled = false; btn.textContent = 'Withdraw';
  if (res) { user.balance = res.balance; renderUI(); wdrMsg('Withdrawal submitted! Confirmations typically take 2\u20136 blocks.', 'success'); getEl('wdrAddr').value = ''; wdrPreview(); }
  else wdrMsg('Failed. Check that you meet the wager requirement and the address is valid.', 'error');
}

async function doTip() {
  if (!user) return;
  if ((user.balance || 0) <= 0) return tipMsg('Invalid points \u2014 top up your balance to tip', 'error');
  if ((user.wagerRequired || 0) > 0) return tipMsg('Wager requirement not met \u2014 wager ' + nFmt(user.wagerRequired) + ' more pts to unlock tipping', 'error');
  const id = getEl('tipUserId')?.value.trim();
  const amt = parseInt(getEl('tipAmt')?.value);
  const isNumeric = /^\d{17,20}$/.test(id);
  const res = await api('/api/tip', { method: 'POST', body: JSON.stringify(isNumeric ? { targetUserId: id, amount: amt } : { targetUsername: id, amount: amt }) });
  if (res) { user.balance = res.balance; renderUI(); tipMsg('Sent!', 'success'); getEl('tipUserId').value = ''; }
  else tipMsg('Failed', 'error');
}

function tipPreview() {
  const banner = getEl('tipWagerBanner');
  if (!banner) return;
  const wReq = user?.wagerRequired || 0;
  if (wReq > 0) {
    banner.style.display = 'block';
    banner.innerHTML = '<strong>Wager required:</strong> ' + nFmt(wReq) + ' pts before you can tip.';
  } else {
    banner.style.display = 'none';
  }
  const btn = getEl('tipBtn');
  if (btn) btn.disabled = wReq > 0 || (user?.balance || 0) <= 0;
}

function openVerifyModal() { getEl('verifyModal').classList.add('show'); }
function closeVerifyModal() { getEl('verifyModal').classList.remove('show'); }

async function verifyGame() {
  const id = getEl('verifyId')?.value.trim();
  if (!id) return toast('Enter a Game ID', 'error');
  const out = getEl('verifyOut');
  out.innerHTML = '<div style="color:var(--muted);padding:6px">Loading...</div>';
  const res = await api('/api/fair/' + encodeURIComponent(id));
  if (!res) { out.innerHTML = '<div class="vr-err">Game not found</div>'; return; }
  const win = res.result === 'win';
  out.innerHTML = `
    <div class="vr-head ${win ? 'win' : 'lose'}">${esc(res.gameType)} \u2014 ${win ? 'WIN' : 'LOSE'} @ ${(res.multiplier || 0).toFixed(2)}x</div>
    <div class="vr-row"><span>Game ID</span><b>${esc(res.gameId)}</b></div>
    <div class="vr-row"><span>Server Seed Hash</span><b>${esc(res.seedHash || '')}</b></div>
    <div class="vr-row"><span>Client Seed</span><b>${esc(res.clientSeed || '')}</b></div>
    <div class="vr-row"><span>Nonce</span><b>${res.nonce}</b></div>
    <div class="vr-row"><span>Server Seed</span><b>${esc(res.serverSeed || '')}</b></div>
    <div class="vr-row"><span>Bet</span><b>${nFmt(res.betAmount)} pts</b></div>
    <div class="vr-row"><span>Payout</span><b>${nFmt(res.payout)} pts</b></div>`;
}

async function logout() { await api('/auth/logout', { method: 'POST' }); user = null; renderUI(); toast('Logged out'); }

// =========== GAMES LIST ===========
const GAMES = [
  { name: 'Mines', page: 'mines', img: 'mines.webp', tag: 'ORIGINAL' },
  { name: 'Limbo', page: 'limbo', img: 'limbo.webp', tag: 'ORIGINAL' },
  { name: 'Blackjack', page: 'blackjack', img: 'blackjack.webp', tag: 'ORIGINAL' },
  { name: 'Coinflip', page: 'coinflip', img: 'coinflip.webp', tag: 'ORIGINAL' },
  { name: 'HiLo', page: 'hilo', img: 'hilo.webp', tag: 'ORIGINAL' },
  { name: 'Wheel', page: 'wheel', img: 'wheel.webp', tag: 'ORIGINAL' }
];

function renderCasinoGrid() {
  const g = getEl('casinoGrid');
  if (!g) return;
  g.innerHTML = GAMES.map(ga => `<a class="game-card" data-page="${ga.page}"><div class="game-card-img" style="background-image:url('assets/game_cards/${ga.img}')"><div class="game-card-badge">${ga.tag}</div></div><div class="game-card-info"><b>${ga.name}</b><span>${desc(ga.page)}</span></div></a>`).join('');
  g.querySelectorAll('.game-card').forEach(c => c.addEventListener('click', () => goPage(c.dataset.page)));
}
function desc(p) { return { mines: 'Uncover gems', limbo: 'Bet on multiplier', blackjack: 'Beat the dealer', coinflip: 'Heads or tails', hilo: 'Higher or lower', wheel: 'Spin to win' }[p] || ''; }

// =========== LIVE WINS ===========
let liveWinsTimer = null;
async function loadLiveWins() {
  const w = getEl('liveWins');
  if (!w) return;
  const r = await api('/api/live-wins');
  if (!r || !r.length) {
    w.innerHTML = '<div class="live-win empty"><svg class="ni" style="width:24px;height:24px;color:var(--muted)"><use href="#i-fire"/></svg><span>No wins yet. Be the first!</span></div>';
    return;
  }
  const gameIcon = (g) => { const map = { Mines: 'i-bomb', Blackjack: 'i-blackjack', HiLo: 'i-hilo', Coinflip: 'i-coin', Limbo: 'i-limbo', Wheel: 'i-wheel' }; return map[g] || 'i-bet'; };
  w.innerHTML = r.slice(0, 4).map(u => {
    const profit = u.profit || 0;
    const multTxt = (u.multiplier || 0).toFixed(2) + 'x';
    return `<div class="live-win">
      <div class="lw-user">
        <div class="lw-game-icon"><svg class="ni" style="width:18px;height:18px"><use href="#${gameIcon(u.game)}"/></svg></div>
        <div class="lw-info">
          <span class="lw-name">${esc(u.username || 'Player')}</span>
          <span class="lw-game">${esc(u.game || '')}</span>
        </div>
      </div>
      <div class="lw-right">
        <div class="lw-mult">+$${(profit * 0.01).toFixed(2)}</div>
        <div class="lw-bet">${multTxt} \u00b7 $${((u.bet || 0) * 0.01).toFixed(2)}</div>
      </div>
    </div>`;
  }).join('');
  if (liveWinsTimer) clearInterval(liveWinsTimer);
  liveWinsTimer = setInterval(loadLiveWins, 8000);
}

// =========== LEADERBOARD ===========
let raceTimer = null;
async function loadRace() {
  const r = await api('/api/race/current');
  if (!r) return;
  const set = (id, v) => { const e = getEl(id); if (e) e.textContent = v; };
  set('raceTitle', r.title);
  set('racePrizePool', '$' + (r.prizePool * 0.01).toFixed(2));
  set('raceTotalWagered', '$' + (r.totalWagered * 0.01).toFixed(2));
  set('racePlayerCount', r.totalEntries);
  const end = new Date(r.endAt).getTime();
  if (raceTimer) clearInterval(raceTimer);
  const tick = () => {
    const diff = end - Date.now();
    if (diff <= 0) { set('raceCountdown', 'Race Ended'); return; }
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    const pad = (n) => (n < 10 ? '0' : '') + n;
    set('raceCountdown', (d > 0 ? d + 'd ' : '') + pad(h) + ':' + pad(m) + ':' + pad(s));
    const start = new Date(r.startAt).getTime();
    const total = end - start;
    const pct = Math.min(100, Math.max(0, ((Date.now() - start) / total) * 100));
    const bar = getEl('raceProgressBar'); if (bar) bar.style.width = (100 - pct).toFixed(2) + '%';
  };
  tick(); raceTimer = setInterval(tick, 1000);
  const my = r.myEntry;
  const wrap = getEl('raceMyRank');
  if (my) {
    const sorted = (r.top || []).slice();
    sorted.push(my);
    sorted.sort((a, b) => b.wagered - a.wagered);
    const myRank = sorted.findIndex(e => e.userId === (user && user.userId)) + 1;
    if (wrap) wrap.style.display = 'flex';
    set('raceMyRankNum', '#' + (myRank || 1));
    set('raceMyWagered', '$' + (my.wagered * 0.01).toFixed(2) + ' wagered');
  } else if (wrap) { wrap.style.display = 'none'; }
  const podium = (r.top || []).slice(0, 3);
  const oldPodium = document.getElementById('racePodium');
  if (oldPodium) oldPodium.remove();
  if (podium.length) {
    const html = `<div class="race-podium" id="racePodium">${podium.map((e, i) => `
      <div class="race-podium-card p${i + 1}">
        <div class="podium-place">${i === 0 ? '1st' : i === 1 ? '2nd' : '3rd'}</div>
        <div class="podium-user">
          <img class="podium-avatar" src="${e.avatar || 'https://cdn.discordapp.com/embed/avatars/0.png'}" alt=""/>
          <div class="podium-name">${esc(e.username || 'Player')}</div>
        </div>
        <div class="podium-wagered">$${(e.wagered * 0.01).toFixed(2)}</div>
        <div class="podium-prize">$${(e.prize * 0.01).toFixed(2)} prize</div>
      </div>`).join('')}</div>`;
    const lb = getEl('leaderboardList');
    if (lb) lb.insertAdjacentHTML('beforebegin', html);
  }
}
async function loadLeaderboard() {
  const list = getEl('leaderboardList');
  if (!list) return;
  list.innerHTML = '<div class="history-empty">Loading...</div>';
  const r = await api('/api/leaderboard?type=' + lbType);
  if (!r || !r.length) { list.innerHTML = '<div class="history-empty">No data</div>'; return; }
  const max = Math.max(...r.map(u => u.value));
  list.innerHTML = r.map((u, i) => `<div class="lb-row">
    <div class="lb-pos ${i === 0 ? 'pos-1' : i === 1 ? 'pos-2' : i === 2 ? 'pos-3' : ''}">${i < 3 ? ['<svg viewBox="0 0 24 24" width="20" height="20"><path fill="#ffd700" d="M7 4h10v3a5 5 0 01-5 5 5 5 0 01-5-5V4z"/><path fill="#ffd700" d="M9 14h6v3H9zM7 20h10v2H7z"/></svg>', '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="#c0c0c0" d="M7 4h10v3a5 5 0 01-5 5 5 5 0 01-5-5V4z"/><path fill="#c0c0c0" d="M9 14h6v3H9zM7 20h10v2H7z"/></svg>', '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="#cd7f32" d="M7 4h10v3a5 5 0 01-5 5 5 5 0 01-5-5V4z"/><path fill="#cd7f32" d="M9 14h6v3H9zM7 20h10v2H7z"/></svg>'][i] : '#' + (i + 1)}</div>
    <div class="lb-user"><img class="lb-avatar" src="${u.avatar || 'https://cdn.discordapp.com/embed/avatars/0.png'}" alt=""/><div class="lb-user-info"><b>${esc(u.username)}</b><span class="lb-rank-tag" style="color:${u.rankColor || 'var(--muted)'}"><img class="rank-img" src="/assets/ranks/${u.rankImg || 'bronze.webp'}" alt=""/> ${esc(u.rankName || 'Bronze')}</span></div></div>
    <div class="lb-bar"><div class="lb-bar-fill" style="width:${(u.value / max * 100).toFixed(0)}%"></div></div>
    <div class="lb-val">${nFmt(u.value)}</div></div>`).join('');
}

// =========== HISTORY ===========
async function loadHistory() {
  if (!user) return;
  const list = getEl('historyList');
  if (!list) return;
  list.innerHTML = '<div class="history-empty">Loading...</div>';
  const type = getEl('histFilterType')?.value || '';
  const res = getEl('histFilterResult')?.value || '';
  const r = await api(`/api/games/${user.userId}?type=${type}&result=${res}&limit=80`);
  if (!r || !r.length) { list.innerHTML = '<div class="history-empty">No bets yet</div>'; return; }
  list.innerHTML = r.map(g => histRow(g)).join('');
}

const GAME_ICONS = { Mines: 'i-bomb', Limbo: 'i-limbo', Blackjack: 'i-blackjack', Coinflip: 'i-coin', HiLo: 'i-hilo', Hilo: 'i-hilo', Wheel: 'i-wheel' };
function gameIconSvg(type) {
  const id = GAME_ICONS[type] || 'i-dice';
  return `<svg class="ni hr-svg"><use href="#${id}"/></svg>`;
}
function histRow(g) {
  const w = g.result === 'win';
  const p = g.result === 'pending';
  return `<div class="history-row ${p ? 'hr-pending' : ''}">
    <div class="hr-icon">${gameIconSvg(g.gameType)}</div>
    <div class="hr-game"><b>${esc(g.gameType)}</b><span>${new Date(g.createdAt).toLocaleString()}</span></div>
    <div class="hr-payout ${w ? 'win' : 'lose'}">${w ? '+' : (p ? '...' : '-')}${nFmt(g.payout || 0)}</div>
    <div class="hr-payout">${(g.multiplier || 0).toFixed(2)}x</div>
    <div class="hr-result ${w ? 'win' : ''}">${p ? 'PENDING' : (w ? 'WIN' : 'LOSS')}</div>
    <div class="hr-verify" onclick="verifyById('${esc(g.gameId)}')"><svg class="ni" style="width:12px;height:12px"><use href="#i-shield"/></svg></div>
  </div>`;
}
function icon(n) { return gameIconSvg(n); }
function verifyById(id) { getEl('verifyId').value = id; openVerifyModal(); verifyGame(); }

// =========== FAIRNESS PAGE ===========
async function loadFairnessPage() {
  const r = await api('/api/fair/active');
  const set = (id, v) => { const e = getEl(id); if (e) e.textContent = v; };
  if (r) {
    set('pfHash', r.serverSeedHash || '—');
    set('pfClient', r.clientSeed || '—');
    set('pfNonce', String(r.nonce || 0));
    set('pfBets', String(r.totalBets || 0));
  } else {
    set('pfHash', '—'); set('pfClient', '—'); set('pfNonce', '0'); set('pfBets', '0');
  }
  const list = getEl('pfRevealsList');
  if (list) {
    if (!user) { list.innerHTML = '<div class="history-empty">Login to see your bet history</div>'; return; }
    const r2 = await api(`/api/games/${user.userId}?limit=20`);
    if (!r2 || !r2.length) { list.innerHTML = '<div class="history-empty">No bets yet</div>'; return; }
    list.innerHTML = r2.map(g => histRow(g)).join('');
  }
}
async function rotateSeed() {
  if (!user) return window.location.href = '/auth/discord';
  const r = await api('/api/fair/rotate', { method: 'POST' });
  if (r) { toast('Client seed rotated. New seed: ' + r.clientSeed, 'success'); loadFairnessPage(); }
  else toast('Could not rotate seed', 'error');
}

// =========== PROFILE ===========
async function loadProfile() {
  if (!user) return;
  getEl('profileName').textContent = user.username || 'User';
  getEl('profileHandle').textContent = '@' + (user.username || 'user').toLowerCase().replace(/\s+/g, '');
  const av = getEl('profileAvatar');
  av.src = user.avatar || 'https://cdn.discordapp.com/embed/avatars/' + (parseInt(user.userId) % 5) + '.png';

  const sv = (id, v) => { const e = getEl(id); if (e) e.textContent = v; };
  sv('psBalance', formatBalance(user.balance));
  sv('psWagered', usd(user.totalWagered || 0));
  sv('psGames', nFmt(user.gamesPlayed || 0));
  const wr = (user.gamesPlayed || 0) > 0 ? ((user.wins || 0) / user.gamesPlayed * 100).toFixed(1) : '0.0';
  sv('psWinrate', wr + '%');
  sv('psWins', nFmt(user.wins || 0));
  sv('psLosses', nFmt(user.losses || 0));
  sv('pwDep', usd(user.totalDeposited || 0));
  sv('pwWdr', usd(user.totalWithdrawn || 0));
  sv('pwWag', usd(user.totalWagered || 0));
  const p = (user.totalWagered || 0) - (user.totalDeposited || 0) + (user.totalWithdrawn || 0) - (user.balance || 0);
  const pe = getEl('pwProfit');
  if (pe) { pe.textContent = usd(p); pe.parentElement.classList.toggle('neg', p < 0); }

  const rk = computeRank(user.totalWagered || 0);
  if (getEl('profileRankImg')) { getEl('profileRankImg').src = '/assets/ranks/' + rk.img; getEl('profileRankImg').alt = rk.name; }
  if (getEl('profileRankLabel')) sv('profileRankLabel', rk.name);
  if (getEl('profileRankTag')) { getEl('profileRankTag').style.color = rk.color; }
  const pct = rk.next ? Math.min(100, ((user.totalWagered - rk.min) / (rk.next - rk.min) * 100)) : 100;
  if (getEl('profileRankFill')) { getEl('profileRankFill').style.width = pct + '%'; getEl('profileRankFill').style.background = `linear-gradient(90deg, ${rk.color}, var(--accent))`; }
  sv('profileRankText', rk.next ? rk.name + ' \u2192 ' + rk.nextName : rk.name + ' (MAX)');

  const rec = getEl('profileRecent');
  const r = await api('/api/games/' + user.userId + '?limit=10');
  if (!r || !r.length) { rec.innerHTML = '<div class="history-empty">No games yet</div>'; } else { rec.innerHTML = r.map(histRow).join(''); }

  // Render ranks grid
  const rg = getEl('profileRanksGrid');
  if (rg) {
    const wagered = user.totalWagered || 0;
    const currentRankName = rk.name;
    rg.innerHTML = RANKS.map((rk2, i) => {
      const achieved = wagered >= rk2.min;
      const isCurrent = rk2.name === currentRankName;
      const nextR = RANKS[i+1];
      return `<div class="profile-rank-card ${achieved ? 'achieved' : ''} ${isCurrent ? 'current' : ''}" style="--rank-color:${rk2.color}">
        <img class="profile-rank-card-img" src="/assets/ranks/${rk2.img}" alt="${rk2.name}"/>
        <div class="profile-rank-card-name">${rk2.name}</div>
        <div class="profile-rank-card-req">${i === 0 ? 'Starting rank' : usd(rk2.min) + ' wagered'}</div>
        <div class="profile-rank-card-arrow">${nextR ? '\u2192 ' + nextR.name : '\u2605 MAX'}</div>
      </div>`;
    }).join('');
  }
}

const RANKS = [
  { name: 'Bronze',     min: 100,     img: 'bronze.webp',     color: '#cd7f32', reward: 1 },
  { name: 'Silver',     min: 1000,    img: 'silver.webp',     color: '#c0c0c0', reward: 10 },
  { name: 'Gold',       min: 10000,   img: 'gold.webp',       color: '#ffd700', reward: 50 },
  { name: 'Platinum',   min: 50000,   img: 'platinum.webp',   color: '#7fe5ff', reward: 100 },
  { name: 'Diamond',    min: 100000,  img: 'diamond.webp',    color: '#b9f2ff', reward: 200 },
  { name: 'Emerald',    min: 250000,  img: 'emerald.webp',    color: '#2ecc71', reward: 300 },
  { name: 'Ruby',       min: 500000,  img: 'ruby.webp',       color: '#ff4d6d', reward: 500 },
  { name: 'Celestial',  min: 750000,  img: 'celestial.webp',  color: '#a855f7', reward: 750 },
  { name: 'Eternal',    min: 1000000, img: 'eternal.webp',    color: '#ff9b25', reward: 1000 }
];
function computeRank(w) {
  let c = RANKS[0];
  for (const r of RANKS) { if (w >= r.min) c = r; else break; }
  const idx = RANKS.indexOf(c);
  const next = RANKS[idx + 1];
  const prevMin = c.min || 0;
  const span = Math.max(1, (next?.min || c.min || 1) - prevMin);
  const pct = next ? Math.min(99, Math.max(0, ((w - prevMin) / span) * 100)) : 100;
  return { ...c, next: next?.min || null, nextName: next?.name || '', pct };
}
function rankImg(name) { const r = RANKS.find(x => x.name === name) || RANKS[0]; return `<img class="rank-img" src="/assets/ranks/${r.img}" alt="${r.name}">`; }

/* =========== FLOATING STATS =========== */
let fsDragging = false, fsDragOffX = 0, fsDragOffY = 0;
let fsPollTimer = null;
function toggleFloatingStats() {
  const box = getEl('floatingStats');
  if (!box) return;
  const shown = box.style.display !== 'none';
  if (!shown) {
    box.style.display = 'block';
  }
  loadFloatingStats();
  if (!fsPollTimer) {
    fsPollTimer = setInterval(loadFloatingStats, 4000);
  }
}
function closeFloatingStats() { const box = getEl('floatingStats'); if (box) box.style.display = 'none'; if (fsPollTimer) { clearInterval(fsPollTimer); fsPollTimer = null; } }
function resetSessionStats() {
  window.__sessionStart = Date.now();
  loadFloatingStats();
  toast('Session stats reset', 'success');
}
function showResult(text, cls) {
  if (cls !== 'win') return;
  const ov = document.createElement('div');
  ov.className = 'mines-result-toast' + (cls ? ' ' + cls : '');
  ov.textContent = text;
  const cur = document.querySelector('.page.active .game-canvas') || document.body;
  cur.appendChild(ov);
  setTimeout(() => ov.remove(), 1800);
}
function openSettings() {
  const overlay = getEl('settingsOverlay');
  if (overlay) { overlay.style.display = 'flex'; return; }
  const cur = localStorage.getItem('ezbet_settings') || '{}';
  let s; try { s = JSON.parse(cur); } catch { s = {}; }
  const sound = s.sound !== false;
  const animations = s.animations !== false;
  const odds = s.showOdds !== false;
  const html = `
    <div class="modal-backdrop settings-overlay" onclick="closeSettings(event)">
      <div class="modal-card" onclick="event.stopPropagation()">
        <div class="modal-head">
          <h3>Settings</h3>
          <button class="icon-btn" onclick="closeSettings()"><svg class="ni"><use href="#i-x"/></svg></button>
        </div>
        <div class="modal-body" style="display:flex;flex-direction:column;gap:14px;min-width:340px">
          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:var(--bg3);border-radius:8px">
            <div><div style="font-weight:700">Sound</div><div style="font-size:11px;color:var(--text2)">Play sound effects on bets</div></div>
            <label class="switch"><input type="checkbox" id="setSound" ${sound?'checked':''}><span class="slider"></span></label>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:var(--bg3);border-radius:8px">
            <div><div style="font-weight:700">Animations</div><div style="font-size:11px;color:var(--text2)">Enable card/coin animations</div></div>
            <label class="switch"><input type="checkbox" id="setAnim" ${animations?'checked':''}><span class="slider"></span></label>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:var(--bg3);border-radius:8px">
            <div><div style="font-weight:700">Show odds</div><div style="font-size:11px;color:var(--text2)">Display win chance percentages</div></div>
            <label class="switch"><input type="checkbox" id="setOdds" ${odds?'checked':''}><span class="slider"></span></label>
          </div>
          <button class="gc-play" onclick="saveSettings()" style="margin-top:6px">Save Settings</button>
        </div>
      </div>
    </div>`;
  const div = document.createElement('div');
  div.id = 'settingsOverlay';
  div.innerHTML = html;
  document.body.appendChild(div);
}
function closeSettings(e) { if (e && e.target !== e.currentTarget) return; const o = getEl('settingsOverlay'); if (o) o.remove(); }
function saveSettings() {
  const s = {
    sound: getEl('setSound')?.checked !== false,
    animations: getEl('setAnim')?.checked !== false,
    showOdds: getEl('setOdds')?.checked !== false
  };
  localStorage.setItem('ezbet_settings', JSON.stringify(s));
  toast('Settings saved', 'success');
  closeSettings();
}
async function loadFloatingStats() {
  const fsBox = getEl('floatingStats');
  if (!fsBox) return;
  if (!user) {
    const set = (id, v) => { const e = getEl(id); if (e) e.textContent = v; };
    set('fsBets', '0'); set('fsWins', '0'); set('fsLosses', '0'); set('fsPl', '$0.00');
    return;
  }
  if (!window.__sessionStart) window.__sessionStart = Date.now();
  const r = await api('/api/stats/session?since=' + window.__sessionStart);
  if (!r) return;
  const set = (id, v) => { const e = getEl(id); if (e) e.textContent = v; };
  set('fsBets', r.totalGames || 0);
  set('fsWins', r.wins || 0);
  set('fsLosses', r.losses || 0);
  const prof = r.totalProfit || 0;
  const plEl = getEl('fsPl');
  if (plEl) {
    plEl.textContent = (prof >= 0 ? '+' : '-') + '$' + Math.abs(prof * 0.01).toFixed(2);
    plEl.parentElement.classList.remove('fs-pl-pos', 'fs-pl-neg');
    plEl.parentElement.classList.add(prof >= 0 ? 'fs-pl-pos' : 'fs-pl-neg');
  }
  const winsCard = plEl ? plEl.parentElement.parentElement.querySelectorAll('.fs-card') : [];
  if (winsCard[0]) winsCard[0].classList.add('fs-wins');
  if (winsCard[1]) winsCard[1].classList.add('fs-losses');
  drawFSChart(r.points || []);
  const upd = getEl('fsLastUpdate');
  if (upd) upd.textContent = 'Updated ' + new Date().toLocaleTimeString();
}
function closeFloatingStats() { const box = getEl('floatingStats'); if (box) box.style.display = 'none'; if (fsPollTimer) { clearInterval(fsPollTimer); fsPollTimer = null; } }
function drawFSChart(pts) {
  const c = getEl('fsChart');
  if (!c) return;
  const ctx = c.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = c.getBoundingClientRect();
  if (c.width !== rect.width * dpr) { c.width = rect.width * dpr; c.height = rect.height * dpr; }
  const w = c.width, h = c.height;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);
  if (!pts.length) {
    ctx.fillStyle = '#6b7d8c'; ctx.font = '12px Inter'; ctx.textAlign = 'center';
    ctx.fillText('No data yet \u2014 place a bet', w/2/dpr, h/2/dpr); return;
  }
  const pad = 16, cw = (w/dpr)-pad*2, ch = (h/dpr)-pad*2;
  const vals = pts.map(p => p.cum ?? p.profit ?? p.value ?? 0);
  const min = Math.min(0, ...vals), max = Math.max(0, ...vals);
  const range = Math.max(1, max-min);
  const grad = ctx.createLinearGradient(0, pad, 0, h/dpr-pad);
  grad.addColorStop(0, 'rgba(59,130,246,.4)'); grad.addColorStop(1, 'rgba(59,130,246,0)');
  ctx.beginPath();
  pts.forEach((p,i) => {
    const x = pad + cw*(i/Math.max(1,pts.length-1));
    const y = pad + ch*(1 - (vals[i]-min)/range);
    if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  });
  ctx.strokeStyle='#3b82f6'; ctx.lineWidth=2; ctx.stroke();
  ctx.lineTo(pad+cw, h/dpr-pad); ctx.lineTo(pad, h/dpr-pad); ctx.closePath();
  ctx.fillStyle=grad; ctx.fill();
  // zero line
  const y0 = pad + ch*(1 - (0-min)/range);
  ctx.strokeStyle = 'rgba(255,255,255,.15)'; ctx.lineWidth = 1; ctx.setLineDash([3,3]);
  ctx.beginPath(); ctx.moveTo(pad, y0); ctx.lineTo(pad+cw, y0); ctx.stroke();
  ctx.setLineDash([]);
  // last point
  const lx = pad + cw, ly = pad + ch*(1 - (vals[vals.length-1]-min)/range);
  ctx.fillStyle = '#3b82f6'; ctx.beginPath(); ctx.arc(lx, ly, 3, 0, Math.PI*2); ctx.fill();
}
// Drag functionality
document.addEventListener('mousedown', e => {
  const h = e.target.closest('#fsDragHandle');
  if (!h) return;
  const box = getEl('floatingStats');
  if (!box) return;
  fsDragging = true;
  const r = box.getBoundingClientRect();
  fsDragOffX = e.clientX - r.left;
  fsDragOffY = e.clientY - r.top;
  box.style.cursor = 'grabbing';
});
document.addEventListener('mousemove', e => {
  if (!fsDragging) return;
  const box = getEl('floatingStats');
  if (!box) return;
  box.style.left = (e.clientX - fsDragOffX) + 'px';
  box.style.top = (e.clientY - fsDragOffY) + 'px';
  box.style.right = 'auto';
  box.style.bottom = 'auto';
});
document.addEventListener('mouseup', () => {
  if (fsDragging) {
    fsDragging = false;
    const box = getEl('floatingStats');
    if (box) box.style.cursor = '';
  }
});

/* =========== PROVABLY FAIR OVERLAY =========== */
function switchPFTab(name) {
  $$('.pf-tab').forEach(t => t.classList.toggle('active', t.dataset.pf === name));
  $$('.pf-panel').forEach(p => p.classList.toggle('active', p.dataset.pfPanel === name));
}
function togglePFOverlay() {
  const o = getEl('pfOverlay');
  if (!o) return;
  const shown = o.style.display !== 'none';
  o.style.display = shown ? 'none' : 'flex';
  if (!shown) refreshFair();
}
function closePFOverlay(e) { if (e && e.target !== e.currentTarget) return; const o = getEl('pfOverlay'); if (o) o.style.display = 'none'; }
async function refreshFair() {
  if (!user) return;
  const r = await api('/api/fair/active');
  if (!r) return;
  if (getEl('pfActiveHash')) getEl('pfActiveHash').textContent = r.activeServerSeedHash || r.serverSeedHash || '';
  if (getEl('pfClientSeed')) getEl('pfClientSeed').textContent = r.clientSeed || '';
  if (getEl('pfNonce')) getEl('pfNonce').textContent = r.nonce ?? '0';
  if (getEl('pfBetCount')) getEl('pfBetCount').textContent = String(r.betsOnSeed ?? r.totalBets ?? 0);
}
async function pfRotate() {
  const s = getEl('pfRotateInput')?.value.trim();
  const r = await api('/api/fair/rotate', { method: 'POST', body: JSON.stringify({ clientSeed: s }) });
  if (r) { getEl('pfRotateInput').value = ''; toast('Seed rotated!', 'success'); refreshFair(); }
}
async function pfVerify() {
  const id = getEl('pfVerifyId')?.value.trim();
  if (!id) return toast('Enter a Game ID', 'error');
  const out = getEl('pfVerifyOut');
  out.innerHTML = '<div class="muted" style="padding:6px">Loading...</div>';
  const r = await api('/api/fair/' + encodeURIComponent(id));
  if (!r) { out.innerHTML = '<div class="vr-err">Not found</div>'; return; }
  out.innerHTML = `<div class="vr-head ${r.result === 'win' ? 'win' : 'lose'}">${esc(r.gameType)} \u2014 ${(r.result === 'win' ? 'WIN' : 'LOSS')} @ ${(r.multiplier || 0).toFixed(2)}x</div>
    <div class="vr-row"><span>Game ID</span><b>${esc(r.gameId)}</b></div>
    <div class="vr-row"><span>Hash</span><b>${esc(r.seedHash || '')}</b></div>
    <div class="vr-row"><span>Client Seed</span><b>${esc(r.clientSeed || '')}</b></div>
    <div class="vr-row"><span>Nonce</span><b>${r.nonce}</b></div>`;
}

// =================== MINES ===================
function initMines() {
  const bet = parseInt(localStorage.getItem('mines_bet') || String(DEFAULT_BET));
  const mines = parseInt(localStorage.getItem('mines_count') || '3');
  if (getEl('minesBet')) getEl('minesBet').value = bet;
  setMinesCount(mines);
  minesUpdate();
  if (!minesActive) buildMinesGrid();
  else renderMinesTiles();
}
function buildMinesGrid() {
  const g = getEl('minesGrid');
  if (!g) return;
  g.innerHTML = '';
  minesGrid = [];
  for (let i = 0; i < 25; i++) {
    const t = document.createElement('div');
    t.className = 'mines-tile';
    t.dataset.idx = i;
    t.addEventListener('click', () => minesTap(i));
    g.appendChild(t);
    minesGrid.push({ el: t, revealed: false });
  }
}
function renderMinesTiles() {
  minesGrid.forEach((t, i) => {
    t.el.classList.remove('gem', 'bomb', 'revealed');
    if (t.revealed) {
      t.el.classList.add('revealed');
      t.el.classList.add(t.bomb ? 'bomb' : 'gem');
      t.el.innerHTML = t.bomb ? '<svg class="ti"><use href="#i-bomb"/></svg>' : '<svg class="ti"><use href="#i-gem"/></svg>';
    } else t.el.innerHTML = '';
  });
}
function minesMultAt(reveals, m) {
  let mult = 1;
  for (let i = 0; i < reveals; i++) mult *= (25 - i) / (25 - m - i);
  return mult;
}
function minesUpdate() {
  const bet = parseInt(getEl('minesBet')?.value || 0);
  const mult = minesMultAt(minesRevealed, minesCount);
  const profit = Math.floor(bet * (mult - 1));
  const c = getEl('minesCurrency'); if (c) c.textContent = '$ ' + (bet * 0.01).toFixed(2);
  const m = getEl('minesCurrentMult'); if (m) m.textContent = mult.toFixed(2);
  const p = getEl('minesCurrentProfit'); if (p) p.textContent = '$ ' + (profit * 0.01).toFixed(2);
  const btn = getEl('minesBetBtn');
  if (btn && btn.classList.contains('state-cashout')) {
    if (mult <= 1) { btn.disabled = true; btn.classList.add('disabled'); btn.title = 'Reveal at least 1 safe tile to cashout'; }
    else { btn.disabled = false; btn.classList.remove('disabled'); btn.title = ''; }
  }
}
function setMinesCount(n) {
  minesCount = Math.max(1, Math.min(24, n));
  const sel = getEl('minesCountSelect'); if (sel) sel.value = String(minesCount);
  const gems = getEl('minesGems');
  if (gems) { gems.value = 24 - minesCount; gems.max = 24 - minesCount; }
  localStorage.setItem('mines_count', minesCount);
  minesUpdate();
}
function minesRandom() {
  if (!minesActive || !Array.isArray(minesGrid) || !minesGrid.length) return;
  const hidden = [];
  for (let i = 0; i < minesGrid.length; i++) if (minesGrid[i] && !minesGrid[i].revealed) hidden.push(i);
  if (!hidden.length) return;
  const pick = hidden[Math.floor(Math.random() * hidden.length)];
  minesTap(pick);
}
function minesSet(v) { const i = getEl('minesBet'); if (i) { i.value = v; localStorage.setItem('mines_bet', v); minesUpdate(); } }
function minesSetMin() { minesSet(1); }
function minesSetMax() { if (user) minesSet(user.balance); }
function minesHalve() { const i = getEl('minesBet'); if (i) { i.value = Math.max(1, Math.floor((parseInt(i.value) || 0) / 2)); minesUpdate(); } }
function minesDouble() { const i = getEl('minesBet'); if (i) { i.value = Math.min(user?.balance || 999999, (parseInt(i.value) || 0) * 2); minesUpdate(); } }

async function minesStart() {
  if (!user) return window.location.href = '/auth/discord';
  const btn = getEl('minesBetBtn');
  if (minesActive) return minesCashout();
  const bet = parseInt(getEl('minesBet')?.value);
  if (!bet || bet <= 0) return toast('Enter a valid bet', 'error');
  if (bet > user.balance) return toast('Insufficient balance', 'error');
  localStorage.setItem('mines_bet', bet);
  btn.disabled = true; btn.innerHTML = '<svg class="bet-btn-icon"><use href="#i-spinner"/></svg><span>Starting...</span>';
  const res = await api('/api/games/mines/start', { method: 'POST', body: JSON.stringify({ bet, bombs: minesCount }) });
  btn.disabled = false;
  if (!res) { btn.innerHTML = '<svg class="bet-btn-icon"><use href="#i-bet"/></svg><span>Bet</span>'; return; }
  minesActive = true; minesGameId = res.gameId; minesRevealed = 0; user.balance = res.balance;
  renderUI(); buildMinesGrid();
  btn.innerHTML = '<svg class="bet-btn-icon"><use href="#i-bet"/></svg><span>Cashout</span>';
  btn.className = 'gc-play state-cashout';
  getEl('minesCashoutOverlay').classList.remove('show');
  const rand = getEl('minesRandomBtn'); if (rand) rand.disabled = false;
  minesUpdate();
}

async function minesTap(idx) {
  if (minesTapping) return;
  if (!minesActive || !minesGameId) return;
  if (!minesGrid[idx] || minesGrid[idx].revealed) return;
  minesTapping = true;
  const tileEl = minesGrid[idx].el;
  if (tileEl) { tileEl.classList.add('disabled', 'revealing'); }
  const res = await api('/api/games/mines/reveal', { method: 'POST', body: JSON.stringify({ gameId: minesGameId, idx }) });
  if (!res) {
    if (tileEl) tileEl.classList.remove('disabled', 'revealing');
    minesTapping = false;
    return;
  }
  if (!res.isBomb) {
    minesGrid[idx].revealed = true;
    if (tileEl) { tileEl.classList.add('gem'); tileEl.classList.remove('revealing'); }
    minesRevealed++;
    renderMinesTiles();
    minesUpdate();
  } else {
    minesGrid[idx].revealed = true;
    minesGrid[idx].bomb = true;
    if (tileEl) tileEl.classList.add('bomb', 'bomb-hit');
    if (res.minePositions) {
      res.minePositions.forEach((pos) => {
        if (minesGrid[pos] && pos !== idx) {
          minesGrid[pos].revealed = true;
          minesGrid[pos].bomb = true;
        }
      });
    }
    await new Promise(r => setTimeout(r, 400));
    minesActive = false;
    if (res.balance !== undefined) user.balance = res.balance;
    renderUI();
    renderMinesTiles();
    const btn = getEl('minesBetBtn');
    btn.innerHTML = '<svg class="bet-btn-icon"><use href="#i-bet"/></svg><span>Bet</span>';
    btn.className = 'gc-play';
    const rand = getEl('minesRandomBtn'); if (rand) rand.disabled = true;
    minesUpdate();
    toast('Bomb!', 'error');
    minesGameId = null;
  }
  minesTapping = false;
}
function showMinesResult(prefix, pts, cls) {
  const ov = document.createElement('div');
  ov.className = 'mines-result-toast' + (cls ? ' ' + cls : '');
  ov.textContent = prefix + nFmt(pts);
  const canvas = document.querySelector('#page-mines .game-canvas') || document.body;
  canvas.appendChild(ov);
  setTimeout(() => ov.remove(), 1800);
}

async function minesCashout() {
  if (!minesActive || !minesGameId) return;
  const btn = getEl('minesBetBtn');
  btn.disabled = true; btn.innerHTML = '<svg class="bet-btn-icon"><use href="#i-spinner"/></svg><span>Cashing out...</span>';
  const res = await api('/api/games/mines/cashout', { method: 'POST', body: JSON.stringify({ gameId: minesGameId }) });
  btn.disabled = false;
  if (!res) return;
  user.balance = res.balance; renderUI(); minesActive = false; minesRevealed = 0;
  const ov = getEl('minesCashoutOverlay');
  getEl('minesCashoutMult').textContent = (res.multiplier || 0).toFixed(2) + 'x';
  ov.classList.add('show');
  btn.innerHTML = '<svg class="bet-btn-icon"><use href="#i-bet"/></svg><span>Bet</span>';
  btn.className = 'gc-play';
  const rand = getEl('minesRandomBtn'); if (rand) rand.disabled = true;
  minesUpdate();
  setTimeout(() => ov.classList.remove('show'), 3000);
  minesGameId = null;
    toast('Cashed out', 'success');
}

// =================== BLACKJACK ===================
function bjReset() {
  bjActive = false; bjGameId = null;
  getEl('bjDealerHand').innerHTML = '';
  getEl('bjPlayerHand').innerHTML = '';
  getEl('bjDealerScore').textContent = '';
  getEl('bjPlayerScore').textContent = '';
  getEl('bjPot').textContent = '0 pts';
  getEl('bjActions').innerHTML = '<button class="gc-play" id="bjDealBtn" onclick="bjDeal()"><svg class="bet-btn-icon"><use href="#i-bet"/></svg><span>Deal</span></button>';
  const bet = parseInt(localStorage.getItem('bj_bet') || String(DEFAULT_BET));
  if (getEl('bjBet')) getEl('bjBet').value = bet;
  bjUpdate();
}
function bjUpdate() {
  const bet = parseInt(getEl('bjBet')?.value || 0);
  const cur = getEl('bjCurrency'); if (cur) cur.textContent = '$ ' + (bet * 0.01).toFixed(2);
}
function bjHalve() { const i = getEl('bjBet'); if (i) { i.value = Math.max(1, Math.floor((parseInt(i.value) || 0) / 2)); bjUpdate(); } }
function bjDouble() { const i = getEl('bjBet'); if (i) { i.value = Math.min(user?.balance || 999999, (parseInt(i.value) || 0) * 2); bjUpdate(); } }
function bjSetBet(v) { const i = getEl('bjBet'); if (i) { i.value = v; localStorage.setItem('bj_bet', v); bjUpdate(); } }
function bjSetBetMin() { bjSetBet(1); }
function bjSetBetMax() { if (user) bjSetBet(user.balance); }

function cardHtml(c, hidden) {
  if (!c) return '<div class="card hidden"></div>';
  if (hidden || c.hidden) return '<div class="card hidden"></div>';
  const suit = c.suit || c.s || 's';
  const rank = c.rank || c.r;
  if (!rank && rank !== 0) return '<div class="card hidden"></div>';
  const red = suit === 'h' || suit === 'd';
  const sm = { s: '\u2660', h: '\u2665', d: '\u2666', c: '\u2663' };
  const rm = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
  const r = rm[rank] || String(rank);
  const sym = sm[suit] || '';
  return `<div class="card ${red ? 'red' : ''}"><div class="card-corner"><div class="card-rank">${r}</div><div>${sym}</div></div><div class="card-suit">${sym}</div><div class="card-corner bot"><div class="card-rank">${r}</div><div>${sym}</div></div></div>`;
}
function handScore(hand) {
  let t = 0, a = 0;
  for (const c of hand) {
    if (c.hidden) continue;
    const rank = c.rank || c.r;
    if (rank === 1) { a++; t += 11; }
    else if (rank >= 11) t += 10;
    else t += rank;
  }
  while (t > 21 && a > 0) { t -= 10; a--; }
  return t;
}

async function bjDeal() {
  if (!user) return window.location.href = '/auth/discord';
  if (bjActive) return;
  const bet = parseInt(getEl('bjBet')?.value);
  if (!bet || bet <= 0) return toast('Enter a valid bet', 'error');
  if (bet > user.balance) return toast('Insufficient balance', 'error');
  localStorage.setItem('bj_bet', bet);
  const btn = getEl('bjDealBtn');
  if (btn) btn.disabled = true;
  const res = await api('/api/games/blackjack/start', { method: 'POST', body: JSON.stringify({ bet }) });
  if (!res) { if (btn) btn.disabled = false; return; }
  bjActive = true; bjGameId = res.gameId; user.balance = res.balance; renderUI();
  renderBJ(res.dealerHand, res.playerHand, true, res.bet || res.currentBet, true);
  updateBJ(res);
}
function renderBJ(dealer, player, hide, bet, animate) {
  const dEl = getEl('bjDealerHand');
  const pEl = getEl('bjPlayerHand');
  if (!dEl || !pEl) return;
  dealer = dealer || [];
  player = player || [];
  const dealOrder = [];
  const maxLen = Math.max(dealer.length, player.length);
  for (let i = 0; i < maxLen; i++) {
    if (i < player.length) dealOrder.push({ hand: 'player', card: player[i], idx: i });
    if (i < dealer.length) dealOrder.push({ hand: 'dealer', card: dealer[i], idx: i, hidden: hide && i === 1 });
  }
  dEl.innerHTML = '';
  pEl.innerHTML = '';
  const pot = getEl('bjPot'); if (pot) pot.textContent = nFmt(bet || 0) + ' pts';
  const updateScores = (shownDealer, shownPlayer) => {
    const dScore = getEl('bjDealerScore');
    if (dScore) dScore.textContent = hide ? (shownDealer[0] ? handScore([shownDealer[0]]) + '/?' : '\u2014') : (shownDealer.length ? handScore(shownDealer) : '\u2014');
    const pScore = getEl('bjPlayerScore');
    if (pScore) pScore.textContent = shownPlayer.length ? handScore(shownPlayer) : '\u2014';
  };
  if (!animate || !settings.anim) {
    dEl.innerHTML = dealer.map((c, i) => cardHtml(c, hide && i === 1)).join('');
    pEl.innerHTML = player.map(c => cardHtml(c)).join('');
    updateScores(dealer, player);
    return;
  }
  const shownDealer = [], shownPlayer = [];
  dealOrder.forEach((item, i) => {
    setTimeout(() => {
      const el = document.createElement('div');
      el.innerHTML = cardHtml(item.card, item.hidden);
      const card = el.firstElementChild;
      card.style.animation = 'dealCard .45s cubic-bezier(.22,1,.36,1) both';
      if (item.hand === 'player') { pEl.appendChild(card); shownPlayer.push(item.card); }
      else { dEl.appendChild(card); if (!item.hidden) shownDealer.push(item.card); else shownDealer.push({ ...item.card, hidden: true }); }
      updateScores(shownDealer.filter(c => !c.hidden), shownPlayer);
    }, i * 280);
  });
}
function updateBJ(state) {
  const wrap = getEl('bjActions');
  if (!wrap) return;
  if (state.gameOver || state.finished) {
    const isWin = state.result === 'win' || state.result === 'blackjack';
    const isPush = state.result === 'push' || state.result === 'tie';
    const prefix = isWin ? '+' : (isPush ? '=' : '-');
    const label = isWin ? 'WIN' : (isPush ? 'PUSH' : 'LOST');
    wrap.innerHTML = `<button class="gc-play" onclick="bjReset()"><svg class="bet-btn-icon"><use href="#i-bet"/></svg><span>Bet</span></button>`;
    bjActive = false; bjGameId = null;
    toast(isWin ? 'You won!' : isPush ? 'Push' : 'You lost', isWin ? 'success' : 'info');
    return;
  }
  wrap.innerHTML =
    `<button class="gc-play bj-action-btn" onclick="bjHit()"><img src="assets/icons/handshake.svg" class="bj-act-icon" alt=""/><span>Hit</span></button>` +
    `<button class="gc-play bj-action-btn bj-stand" onclick="bjStand()"><img src="assets/icons/secure.svg" class="bj-act-icon" alt=""/><span>Stand</span></button>` +
    (state.canDouble === true ? `<button class="gc-play bj-action-btn bj-double" onclick="bjDoubleDown()"><img src="assets/icons/dice.svg" class="bj-act-icon" alt=""/><span>Double</span></button>` : '') +
    (state.canSplit ? `<button class="gc-play bj-action-btn bj-split" onclick="toast('Split coming soon','info')"><img src="assets/icons/cards.svg" class="bj-act-icon" alt=""/><span>Split</span></button>` : '');
}
async function bjHit() { if (!bjActive || !bjGameId) return; const r = await api('/api/games/blackjack/hit', { method: 'POST', body: JSON.stringify({ gameId: bjGameId }) }); if (!r) return; if (r.dealerHand) renderBJ(r.dealerHand, r.playerHand, !r.gameOver, r.currentBet || r.bet); if (r.balance !== undefined) { user.balance = r.balance; renderUI(); } updateBJ(r); }
async function bjStand() { if (!bjActive || !bjGameId) return; const r = await api('/api/games/blackjack/stand', { method: 'POST', body: JSON.stringify({ gameId: bjGameId }) }); if (!r) return; if (r.dealerHand) renderBJ(r.dealerHand, r.playerHand, false, r.currentBet || r.bet); if (r.balance !== undefined) { user.balance = r.balance; renderUI(); } updateBJ(r); }
async function bjDoubleDown() { if (!bjActive || !bjGameId) return; const r = await api('/api/games/blackjack/double', { method: 'POST', body: JSON.stringify({ gameId: bjGameId }) }); if (!r) return; if (r.dealerHand) renderBJ(r.dealerHand, r.playerHand, false, r.currentBet || r.bet); if (r.balance !== undefined) { user.balance = r.balance; renderUI(); } updateBJ(r); }

// =================== LIMBO ===================
function initLimbo() {
  const bet = parseInt(localStorage.getItem('limbo_bet') || String(DEFAULT_BET));
  const target = parseFloat(localStorage.getItem('limbo_target') || '2');
  if (getEl('limBet')) getEl('limBet').value = bet;
  if (getEl('limTarget')) getEl('limTarget').value = target;
  limUpdate();
  renderLimRecent();
}
function limUpdate() {
  const bet = parseInt(getEl('limBet')?.value || 0);
  const target = parseFloat(getEl('limTarget')?.value || 2);
  const cur = getEl('limCurrency'); if (cur) cur.textContent = '$ ' + (bet * 0.01).toFixed(2);
  if (getEl('limWinChance')) getEl('limWinChance').textContent = (99 / target).toFixed(2) + '%';
  const profit = Math.floor(bet * (target - 1));
  if (getEl('limProfit')) getEl('limProfit').textContent = '$ ' + (profit * 0.01).toFixed(2);
}
function limHalve() { const i = getEl('limBet'); if (i) { i.value = Math.max(1, Math.floor((parseInt(i.value) || 0) / 2)); limUpdate(); } }
function limDouble() { const i = getEl('limBet'); if (i) { i.value = Math.min(user?.balance || 999999, (parseInt(i.value) || 0) * 2); limUpdate(); } }
function limSetBet(v) { const i = getEl('limBet'); if (i) { i.value = v; localStorage.setItem('limbo_bet', v); limUpdate(); } }
function limSetBetMin() { limSetBet(1); }
function limSetBetMax() { if (user) limSetBet(user.balance); }

async function limPlay() {
  if (!user) return window.location.href = '/auth/discord';
  if (limActive) return;
  const bet = parseInt(getEl('limBet')?.value);
  const target = parseFloat(getEl('limTarget')?.value);
  if (!bet || bet <= 0) return toast('Enter a valid bet', 'error');
  if (target < 1.01) return toast('Target must be at least 1.01x', 'error');
  if (bet > user.balance) return toast('Insufficient balance', 'error');
  localStorage.setItem('limbo_bet', bet); localStorage.setItem('limbo_target', target);

  const btn = getEl('limBetBtn');
  btn.disabled = true; btn.innerHTML = '<svg class="bet-btn-icon"><use href="#i-spinner"/></svg><span>Starting...</span>';
  const res = await api('/api/games/limbo/start', { method: 'POST', body: JSON.stringify({ bet, target }) });
  if (!res) { btn.innerHTML = '<svg class="bet-btn-icon"><use href="#i-bet"/></svg><span>Bet</span>'; btn.disabled = false; return; }
  limActive = true; limGameId = res.gameId; limCrashPoint = res.crashPoint; limResultRevealed = false;
  user.balance = res.balance; renderUI();
  const mv = getEl('limMultVal'); const st = getEl('limStatus');
  mv.classList.remove('crashed', 'won'); mv.textContent = '1.00x';
  st.textContent = 'Flying...';
  btn.innerHTML = '<svg class="bet-btn-icon"><use href="#i-spinner"/></svg><span>Flying...</span>';
  limStartTime = performance.now(); limAnimate();
}
function limAnimate() {
  const elapsed = (performance.now() - limStartTime) / 1000;
  const dur = limCrashPoint < 2 ? 0.8 : limCrashPoint < 10 ? 1.6 : 2.5;
  const t = Math.min(1, elapsed / dur);
  if (t < 1) { getEl('limMultVal').textContent = Math.pow(limCrashPoint, 1 - Math.pow(1 - t, 2.5)).toFixed(2) + 'x'; limAnimFrame = requestAnimationFrame(limAnimate); return; }
  const won = limCrashPoint >= parseFloat(getEl('limTarget')?.value || 2);
  getEl('limMultVal').textContent = limCrashPoint.toFixed(2) + 'x';
  getEl('limMultVal').classList.add(won ? 'won' : 'crashed');
  getEl('limStatus').textContent = won ? 'You won!' : 'Crashed at ' + limCrashPoint.toFixed(2) + 'x';
  limFinish(won);
}
async function limFinish(won) {
  if (limResultRevealed) return;
  limResultRevealed = true;
  if (limAnimFrame) cancelAnimationFrame(limAnimFrame);
  const r = await api('/api/games/limbo/result', { method: 'POST', body: JSON.stringify({ gameId: limGameId, won }) });
  const btn = getEl('limBetBtn');
  btn.disabled = false; btn.innerHTML = '<svg class="bet-btn-icon"><use href="#i-bet"/></svg><span>Bet</span>';
  if (r && r.balance !== undefined) { user.balance = r.balance; renderUI(); }
  limActive = false;
  limRecent.unshift({ value: limCrashPoint, win: won });
  if (limRecent.length > 12) limRecent.pop();
  renderLimRecent();
  limGameId = null;
  if (won) toast('You won!', 'success');
}
function renderLimRecent() {
  const w = getEl('limRecent');
  if (!w) return;
  if (!limRecent.length) { w.innerHTML = ''; return; }
  w.innerHTML = limRecent.map((r, i) =>
    '<div class="lim-recent-pill ' + (r.win ? 'win' : 'lose') + '" style="animation-delay:' + (i * 40) + 'ms">' +
    '<svg class="ni lim-pill-icon"><use href="#' + (r.win ? 'i-check' : 'i-x') + '"/></svg>' +
    '<span>' + r.value.toFixed(2) + 'x</span></div>'
  ).join('');
}

// =================== COINFLIP ===================
function initCF() {
  const bet = parseInt(localStorage.getItem('cf_bet') || String(DEFAULT_BET));
  if (getEl('cfBet')) getEl('cfBet').value = bet;
  cfPickSide = 'heads';
  $$('.cf-pick-btn').forEach(b => b.classList.toggle('active', b.dataset.side === 'heads'));
  getEl('cfResult').textContent = '';
  const coin = getEl('cfCoin');
  if (coin) { coin.style.transform = ''; coin.classList.remove('flipping'); }
  const btn = getEl('cfBetBtn');
  if (btn) { btn.disabled = false; btn.innerHTML = '<svg class="bet-btn-icon"><use href="#i-bet"/></svg><span>Flip Coin</span>'; }
  cfUpdate();
}
function cfUpdate() {
  const bet = parseInt(getEl('cfBet')?.value || 0);
  const cur = getEl('cfCurrency'); if (cur) cur.textContent = '$ ' + (bet * 0.01).toFixed(2);
  const pay = getEl('cfPayout'); if (pay) pay.textContent = '$ ' + (bet * 1.96 * 0.01).toFixed(2);
}
function cfHalve() { const i = getEl('cfBet'); if (i) { i.value = Math.max(1, Math.floor((parseInt(i.value) || 0) / 2)); cfUpdate(); } }
function cfDouble() { const i = getEl('cfBet'); if (i) { i.value = Math.min(user?.balance || 999999, (parseInt(i.value) || 0) * 2); cfUpdate(); } }
function cfSetBet(v) { const i = getEl('cfBet'); if (i) { i.value = v; localStorage.setItem('cf_bet', v); cfUpdate(); } }
function cfSetBetMin() { cfSetBet(1); }
function cfSetBetMax() { if (user) cfSetBet(user.balance); }

function cfPick(side) {
  if (cfActive) return;
  cfPickSide = side;
  $$('.cf-pick-btn').forEach(b => b.classList.toggle('active', b.dataset.side === side));
}

async function cfFlip() {
  if (!user) return window.location.href = '/auth/discord';
  if (cfActive) return;
  if (!cfPickSide) cfPickSide = 'heads';
  const bet = parseInt(getEl('cfBet')?.value);
  if (!bet || bet <= 0) return toast('Enter a valid bet', 'error');
  if (bet > user.balance) return toast('Insufficient balance', 'error');
  localStorage.setItem('cf_bet', bet);

  const btn = getEl('cfBetBtn');
  btn.disabled = true; btn.innerHTML = '<svg class="bet-btn-icon"><use href="#i-spinner"/></svg><span>Flipping...</span>';
  cfActive = true;
  const res = await api('/api/games/coinflip/start', { method: 'POST', body: JSON.stringify({ bet, pick: cfPickSide }) });
  if (!res) { btn.innerHTML = '<svg class="bet-btn-icon"><use href="#i-bet"/></svg><span>Flip Coin</span>'; btn.disabled = false; cfActive = false; return; }
  user.balance = res.balance; renderUI();

  const coin = getEl('cfCoin');
  const result = res.result;
  const won = res.won;
  const finalFace = result === 'tails' ? 180 : 0;
  const spins = 6 + Math.floor(Math.random() * 2);
  const totalRot = 360 * spins + finalFace;
  coin.classList.remove('flipping', 'cf-land');
  coin.style.transition = 'none';
  coin.style.transform = 'rotateY(0deg) scale(1)';
  void coin.offsetWidth;
  coin.style.transition = 'transform 2.4s cubic-bezier(.17,.67,.22,1.02)';
  coin.classList.add('flipping');
  requestAnimationFrame(() => {
    coin.style.transform = 'rotateY(' + totalRot + 'deg) scale(1.05)';
  });
  setTimeout(() => coin.classList.add('cf-land'), 2400);

  setTimeout(() => {
    showResult(result.toUpperCase(), won ? 'win' : '');
    btn.disabled = false; btn.innerHTML = '<svg class="bet-btn-icon"><use href="#i-bet"/></svg><span>Flip Coin</span>';
    cfActive = false;
    toast(won ? 'You won!' : 'You lost', won ? 'success' : 'error');
  }, 2500);
}

// =================== HILO ===================
function initHL() {
  const bet = parseInt(localStorage.getItem('hl_bet') || String(DEFAULT_BET));
  if (getEl('hlBet')) getEl('hlBet').value = bet;
  hlActive = false; hlStreakCount = 0; hlCurrentMult = 1;
  const sv = getEl('hlStreakVal'); if (sv) sv.textContent = '0';
  const m = getEl('hlMult'); if (m) m.textContent = '1.00x';
  const sl = getEl('hlStreakLbl'); if (sl) sl.textContent = 'Streak: 0';
  hlUpdate();
  const prev = getEl('hlCardPrev'); if (prev) prev.innerHTML = '';
  const next = getEl('hlCardNext'); if (next) { next.textContent = '?'; next.style.background = ''; next.style.border = ''; }
  getEl('hlStats').textContent = 'Higher or lower?';
  getEl('hlActions').innerHTML = '<button class="gc-play" onclick="hlStart()"><svg class="bet-btn-icon"><use href="#i-bet"/></svg><span>Start</span></button>';
}
function hlUpdate() {
  const bet = parseInt(getEl('hlBet')?.value || 0);
  const cur = getEl('hlCurrency'); if (cur) cur.textContent = '$ ' + (bet * 0.01).toFixed(2);
  const nw = getEl('hlNextWin'); if (nw) nw.textContent = '$ ' + (Math.floor(bet * hlCurrentMult) * 0.01).toFixed(2);
}
function hlHalve() { const i = getEl('hlBet'); if (i) { i.value = Math.max(1, Math.floor((parseInt(i.value) || 0) / 2)); hlUpdate(); } }
function hlDouble() { const i = getEl('hlBet'); if (i) { i.value = Math.min(user?.balance || 999999, (parseInt(i.value) || 0) * 2); hlUpdate(); } }
function hlSetBet(v) { const i = getEl('hlBet'); if (i) { i.value = v; localStorage.setItem('hl_bet', v); hlUpdate(); } }
function hlSetBetMin() { hlSetBet(1); }
function hlSetBetMax() { if (user) hlSetBet(user.balance); }

function hlRenderStreak() {
  const sv = getEl('hlStreakVal'); if (sv) sv.textContent = String(hlStreakCount);
  const m = getEl('hlMult'); if (m) m.textContent = hlCurrentMult.toFixed(2) + 'x';
  const sl = getEl('hlStreakLbl'); if (sl) sl.textContent = 'Streak: ' + hlStreakCount;
  hlUpdate();
}

async function hlStart() {
  if (!user) return window.location.href = '/auth/discord';
  if (hlActive) return;
  const bet = parseInt(getEl('hlBet')?.value);
  if (!bet || bet <= 0) return toast('Enter a valid bet', 'error');
  if (bet > user.balance) return toast('Insufficient balance', 'error');
  localStorage.setItem('hl_bet', bet);
  const res = await api('/api/games/hilo/start', { method: 'POST', body: JSON.stringify({ bet }) });
  if (!res) return;
  hlActive = true; hlGameId = res.gameId; hlCurrentCard = res.currentCard; hlStreakCount = 0; hlCurrentMult = 1;
  user.balance = res.balance; renderUI();
  const prev = getEl('hlCardPrev');
  if (prev) prev.innerHTML = cardHtml(res.currentCard);
  const next = getEl('hlCardNext');
  if (next) { next.textContent = '?'; next.style.background = 'linear-gradient(135deg, var(--bg4), var(--bg3))'; next.style.border = '2px solid var(--line)'; next.style.borderRadius = '6px'; next.style.display = 'flex'; next.style.alignItems = 'center'; next.style.justifyContent = 'center'; }
  hlRenderStreak();
  getEl('hlStats').textContent = 'Higher or lower?';
  hlShowActions();
}
function hlShowActions() {
  if (!hlActive) return;
  const cur = hlCurrentCard;
  const r = cur?.r ?? cur?.rank;
  const isA = r === 1;
  const isK = r === 13;
  const higherDis = isK ? 'disabled style="background:var(--bg3);color:var(--muted);cursor:not-allowed;opacity:.5"' : '';
  const lowerDis  = isA ? 'disabled style="background:var(--bg3);color:var(--muted);cursor:not-allowed;opacity:.5"' : '';
  getEl('hlActions').innerHTML =
    `<button class="gc-play" onclick="hlGuess('higher')" style="background:var(--accent)" ${higherDis}><span>Higher</span></button>` +
    `<button class="gc-play" onclick="hlGuess('lower')" style="background:var(--red);color:#fff" ${lowerDis}><span>Lower</span></button>`;
}
function hlShowCashout() {
  if (!hlActive) return;
  const cur = hlCurrentCard;
  const r = cur?.r ?? cur?.rank;
  const isA = r === 1;
  const isK = r === 13;
  const higherDis = isK ? 'disabled style="background:var(--bg3);color:var(--muted);cursor:not-allowed;opacity:.5"' : '';
  const lowerDis  = isA ? 'disabled style="background:var(--bg3);color:var(--muted);cursor:not-allowed;opacity:.5"' : '';
  const ca = Math.floor(parseInt(getEl('hlBet')?.value || 0) * hlCurrentMult);
  getEl('hlActions').innerHTML =
    `<button class="gc-play" onclick="hlGuess('higher')" style="background:var(--accent)" ${higherDis}><span>Higher</span></button>` +
    `<button class="gc-play state-cashout" onclick="hlCashout()"><span>Cashout</span></button>` +
    `<button class="gc-play" onclick="hlGuess('lower')" style="background:var(--red);color:#fff" ${lowerDis}><span>Lower</span></button>`;
}
async function hlGuess(choice) {
  if (!hlActive) return;
  const res = await api('/api/games/hilo/guess', { method: 'POST', body: JSON.stringify({ gameId: hlGameId, guess: choice }) });
  if (!res || !res.success) { if (res && res.error) toast(res.error, 'error'); return; }
  const next = getEl('hlCardNext');
  const prev = getEl('hlCardPrev');
  if (next && res.nextCard) {
    next.innerHTML = cardHtml(res.nextCard);
    next.classList.add('hl-flip-in');
  }
  if (res.correct) {
    hlStreakCount++;
    if (res.multiplier) hlCurrentMult = res.multiplier;
    if (res.nextCard) hlCurrentCard = res.nextCard;
    getEl('hlStats').textContent = res.gameOver ? 'You cleared the deck!' : 'Correct! Higher or lower?';
    hlRenderStreak();
    if (res.gameOver) {
      user.balance = res.balance || user.balance; renderUI();
      showResult('WIN', 'win');
  toast('You cleared the deck!', 'success');

      hlActive = false; hlGameId = null;
      hlStreakCount = 0; hlCurrentMult = 1;
      setTimeout(() => {
        hlRenderStreak();
        if (prev) prev.innerHTML = '';
        if (next) { next.textContent = '?'; next.className = 'hl-card hl-card-hidden'; }
        getEl('hlStats').textContent = 'Pick higher or lower to start.';
        getEl('hlActions').innerHTML = '<button class="gc-play" onclick="hlStart()"><svg class="bet-btn-icon"><use href="#i-bet"/></svg><span>Bet</span></button>';
      }, 1800);
      return;
    }
    setTimeout(() => {
      if (prev && res.nextCard) prev.innerHTML = cardHtml(res.nextCard);
      if (next) { next.textContent = '?'; next.className = 'hl-card hl-card-hidden'; }
    }, 800);
    hlShowCashout();
  } else {
    if (res.balance !== undefined) { user.balance = res.balance; renderUI(); }
    hlActive = false; hlGameId = null;
    const lostAmt = res.bet || parseInt(getEl('hlBet')?.value || 0);
    toast('Wrong!', 'error');
    if (next) next.classList.add('hl-flip-wrong');
    setTimeout(() => {
      hlStreakCount = 0; hlCurrentMult = 1;
      hlRenderStreak();
      if (prev) prev.innerHTML = '';
      if (next) { next.textContent = '?'; next.className = 'hl-card hl-card-hidden'; }
      getEl('hlStats').textContent = 'Wrong! Try again.';
      getEl('hlActions').innerHTML = '<button class="gc-play" onclick="hlStart()"><svg class="bet-btn-icon"><use href="#i-bet"/></svg><span>Bet</span></button>';
    }, 1500);
  }
}
async function hlCashout() {
  if (!hlActive) return;
  const res = await api('/api/games/hilo/cashout', { method: 'POST', body: JSON.stringify({ gameId: hlGameId }) });
  if (!res) return;
  user.balance = res.balance; renderUI();
  toast('Cashed out', 'success');
  hlActive = false; hlGameId = null;
  getEl('hlStats').textContent = 'Cashed out';
  hlStreakCount = 0; hlCurrentMult = 1;
  hlRenderStreak();
  getEl('hlActions').innerHTML = '<button class="gc-play" onclick="hlStart()"><svg class="bet-btn-icon"><use href="#i-bet"/></svg><span>Bet</span></button>';
}

// =================== WHEEL ===================
function whlReset() {
  whlActive = false;
  getEl('whlWheel').style.transform = 'rotate(0deg)';
  getEl('whlResult').textContent = '';
}
function whlHalve() { const i = getEl('whlBet'); if (i) i.value = Math.max(1, Math.floor((parseInt(i.value) || 0) / 2)); }
function whlDouble() { const i = getEl('whlBet'); if (i) i.value = Math.min(user?.balance || 999999, (parseInt(i.value) || 0) * 2); }
async function whlSpin() {
  if (!user) return window.location.href = '/auth/discord';
  if (whlActive) return;
  const bet = parseInt(getEl('whlBet')?.value);
  if (!bet || bet <= 0) return toast('Enter a valid bet', 'error');
  if (bet > user.balance) return toast('Insufficient balance', 'error');
  whlActive = true;
  const res = await api('/api/games/wheel/start', { method: 'POST', body: JSON.stringify({ bet }) });
  if (!res) { whlActive = false; return; }
  user.balance = res.balance; renderUI();
  const segs = 8, segAngle = 360 / segs;
  const finalRot = 360 * 5 + (segs - 1 - res.segment) * segAngle + segAngle / 2;
  whlRot += finalRot;
  getEl('whlWheel').style.transform = 'rotate(' + whlRot + 'deg)';
  setTimeout(() => {
    const mult = res.multiplier;
    const won = mult > 0;
    showResult(mult + 'x', won ? 'win' : '');
    whlActive = false;
    toast(won ? 'Wheel won' : 'Wheel: 0x', won ? 'success' : 'error');
  }, 4100);
}

function setMaxBet() {
  const map = { mines:'minesBet', limbo:'limBet', blackjack:'bjBet', coinflip:'cfBet', hilo:'hlBet', wheel:'whlBet' };
  const id = map[curPage];
  if (!id) return;
  const i = getEl(id);
  if (i && user) i.value = user.balance;
}
