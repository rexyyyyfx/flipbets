function isRigged(user, globalPct) {
  const pct = Math.max(user?.riggPercent || 0, globalPct || 0);
  return pct > 0 && Math.random() * 100 < pct;
}

function isWinRigged(user) {
  const pct = user?.winRiggPercent || 0;
  return pct > 0 && Math.random() * 100 < pct;
}

module.exports = { isRigged, isWinRigged };
