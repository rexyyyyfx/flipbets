function parseBet(input, balance) {
  if (input === undefined || input === null) return null;
  const str = String(input).toLowerCase().replace(/,/g, '').trim();
  if (str === 'all' || str === 'max') return balance;
  if (str === 'half') return Math.floor(balance / 2);
  const mult = str.endsWith('k') ? 1000 : str.endsWith('m') ? 1000000 : 1;
  const num = parseFloat(str.replace(/[km]$/, '')) * mult;
  return Number.isFinite(num) && num > 0 ? Math.round(num * 100) / 100 : null;
}

module.exports = { parseBet };
