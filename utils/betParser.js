function parseBet(input, balance) {
  if (input === undefined || input === null) return null;
  const str = String(input).toLowerCase();
  if (str === 'all' || str === 'max') return balance;
  if (str === 'half') return Math.floor(balance / 2);
  const num = parseFloat(str);
  return Number.isFinite(num) && num > 0 ? Math.round(num * 100) / 100 : null;
}

module.exports = { parseBet };
