function roundPts(v) { return Math.round(Number(v || 0) * 100) / 100; }

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

module.exports = { applyWagerDecrement, addWagerRequirement };
