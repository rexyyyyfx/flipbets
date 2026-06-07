let canvasModule = null;
try { canvasModule = require('@napi-rs/canvas'); } catch {}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawBackground(ctx, w, h) {
  ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, w, h);
}

function drawWatermark(ctx, w, h) {
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.font = '11px Arial'; ctx.textAlign = 'center';
  ctx.fillText('Flipbets', w / 2, h - 12);
}

function drawUsername(ctx, username, w) {
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.font = '11px Arial'; ctx.textAlign = 'right';
  ctx.fillText(username, w - 15, 22);
}

function drawStatBox(ctx, x, y, w, h, label, value, valColor) {
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  roundRect(ctx, x, y, w, h, 6); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.font = '10px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText(label, x + w / 2, y + 6);
  ctx.fillStyle = valColor || 'rgba(255,255,255,0.9)';
  ctx.font = 'bold 16px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillText(value, x + w / 2, y + h - 8);
}

const C = {
  page: '#1f1f27',
  board: '#171525',
  board2: '#201e30',
  card: '#f8fafc',
  card2: '#e5e7eb',
  text: '#f4f4f5',
  muted: '#858394',
  blue: '#3794d9',
  green: '#23e078',
  red: '#ef4444',
  yellow: '#facc15',
  orange: '#f59e0b'
};

const SUITS = {
  h: '\u2665', d: '\u2666', c: '\u2663', s: '\u2660',
  heart: '\u2665', diamond: '\u2666', club: '\u2663', spade: '\u2660',
  hearts: '\u2665', diamonds: '\u2666', clubs: '\u2663', spades: '\u2660'
};

function clear(ctx, w, h) {
  ctx.clearRect(0, 0, w, h);
}

function fillPanel(ctx, x, y, w, h, r = 18) {
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, '#282733');
  g.addColorStop(1, '#22212d');
  ctx.fillStyle = g;
  roundRect(ctx, x, y, w, h, r);
  ctx.fill();
}

function fillBoard(ctx, x, y, w, h, r = 14) {
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, '#1d1b2d');
  g.addColorStop(1, '#151423');
  ctx.fillStyle = g;
  roundRect(ctx, x, y, w, h, r);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 2;
  ctx.stroke();
}

function normalizeSuit(card) {
  const raw = String(card?.suit || '').toLowerCase();
  return SUITS[raw] || card?.suit || '?';
}

function cardColor(card) {
  const suit = normalizeSuit(card);
  return suit === '\u2665' || suit === '\u2666' ? '#e11d48' : '#111827';
}

function drawCard(ctx, card, x, y, w, h, faceDown = false) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.28)';
  ctx.shadowBlur = 3;
  ctx.shadowOffsetY = 2;
  roundRect(ctx, x, y, w, h, 5);

  if (faceDown) {
    const back = ctx.createLinearGradient(x, y, x, y + h);
    back.addColorStop(0, '#2e3c75');
    back.addColorStop(1, '#11172e');
    ctx.fillStyle = back;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#c7d2fe';
    ctx.font = `bold ${Math.round(h * 0.32)}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', x + w / 2, y + h / 2 + 1);
    ctx.restore();
    return;
  }

  const face = ctx.createLinearGradient(x, y, x, y + h);
  face.addColorStop(0, C.card);
  face.addColorStop(1, C.card2);
  ctx.fillStyle = face;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(15,23,42,0.16)';
  ctx.lineWidth = 1;
  ctx.stroke();

  const rank = String(card?.rank || '?');
  const suit = normalizeSuit(card);
  const ink = cardColor(card);

  ctx.fillStyle = ink;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = `bold ${Math.max(11, Math.round(w * 0.24))}px Arial`;
  ctx.fillText(rank, x + 6, y + 6);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${Math.round(h * 0.36)}px Arial`;
  ctx.fillText(suit, x + w / 2, y + h / 2 + 7);
  ctx.restore();
}

function drawHand(ctx, cards, x, y, cardW, cardH, gap, maxW, hiddenIndex = -1) {
  const hand = Array.isArray(cards) ? cards : [];
  if (!hand.length) return;
  const natural = hand.length * cardW + (hand.length - 1) * gap;
  const scale = natural > maxW ? maxW / natural : 1;
  const w = cardW * scale;
  const h = cardH * scale;
  const g = gap * scale;
  hand.forEach((card, i) => drawCard(ctx, card, x + i * (w + g), y, w, h, i === hiddenIndex));
}

function formatPoints(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return '0';
  const parts = Math.round(n * 100) / 100 + '';
  const x = parts.split('.');
  x[0] = x[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return x.join('.');
}

function resultText(result) {
  if (result === 'win') return 'WIN';
  if (result === 'tie') return 'PUSH';
  if (result === 'lose') return 'DEALER WINS';
  return '';
}

async function drawAvatar(ctx, avatarUrl, x, y, r) {
  const { loadImage } = canvasModule || {};
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  if (avatarUrl && loadImage) {
    try {
      const img = await loadImage(avatarUrl);
      const side = Math.min(img.width, img.height);
      const sx = (img.width - side) / 2;
      const sy = (img.height - side) / 2;
      ctx.drawImage(img, sx, sy, side, side, x - r, y - r, r * 2, r * 2);
      ctx.restore();
      return;
    } catch {}
  }

  const g = ctx.createRadialGradient(x - r / 3, y - r / 3, 2, x, y, r);
  g.addColorStop(0, '#3b82f6');
  g.addColorStop(1, '#111827');
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.restore();
}

class GameImages {
  static isAvailable() { return canvasModule !== null; }

  static async createCoinflipResult(choice, result, won, username, gameId) {
    if (!canvasModule) return null;
    const { createCanvas } = canvasModule;
    const canvas = createCanvas(360, 250);
    const ctx = canvas.getContext('2d');
    clear(ctx, 360, 250);
    fillPanel(ctx, 0, 0, 360, 250, 18);

    const cx = 180, cy = 105, r = 68;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    const coin = ctx.createRadialGradient(cx - 24, cy - 28, 4, cx, cy, r);
    if (won) {
      coin.addColorStop(0, '#fff7ad');
      coin.addColorStop(0.3, '#ffd700');
      coin.addColorStop(1, '#9a6500');
    } else {
      coin.addColorStop(0, '#f1f5f9');
      coin.addColorStop(0.45, '#94a3b8');
      coin.addColorStop(1, '#334155');
    }
    ctx.fillStyle = coin;
    ctx.fill();
    ctx.strokeStyle = won ? '#fef3c7' : '#cbd5e1';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 48px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(result === 'heads' ? 'H' : 'T', cx, cy + 1);

    ctx.fillStyle = won ? C.green : C.red;
    ctx.font = 'bold 22px Arial';
    ctx.fillText(won ? 'WON' : 'LOST', cx, 205);
    return canvas.toBuffer('image/png');
  }

  static async createBlackjackImage(playerHand, playerTotal, dealerHand, dealerTotal, result, hideDealer, username, gameId) {
    if (!canvasModule) return null;
    const { createCanvas } = canvasModule;
    const canvas = createCanvas(400, 280);
    const ctx = canvas.getContext('2d');
    clear(ctx, 400, 280);

    fillBoard(ctx, 0, 0, 400, 280, 18);
    ctx.fillStyle = C.muted;
    ctx.font = '12px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('DEALER', 16, 27);
    ctx.fillText('YOU', 16, 136);

    ctx.fillStyle = C.text;
    ctx.font = 'bold 20px Arial';
    ctx.textAlign = 'right';
    ctx.fillText(hideDealer ? String(dealerHand?.[0]?.value || '') : String(dealerTotal), 362, 30);
    ctx.fillText(String(playerTotal), 362, 139);

    drawHand(ctx, dealerHand, 20, 40, 56, 78, 10, 270, hideDealer ? 1 : -1);
    drawHand(ctx, playerHand, 20, 147, 56, 78, 10, 270);

    const label = resultText(result);
    if (label) {
      ctx.fillStyle = result === 'tie' ? C.yellow : result === 'win' ? C.green : C.red;
      ctx.font = 'bold 24px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(label, 252, 242);
    }

    return canvas.toBuffer('image/png');
  }

  static async createWheelImage(slice, multiplier, won, username, gameId) {
    if (!canvasModule) return null;
    const { createCanvas } = canvasModule;
    const canvas = createCanvas(360, 360);
    const ctx = canvas.getContext('2d');
    clear(ctx, 360, 360);
    fillPanel(ctx, 0, 0, 360, 360, 18);

    const cx = 180, cy = 166, r = 122;
    const colors = ['#dc2626', '#f59e0b', '#16a34a', '#2563eb', '#7c3aed', '#db2777', '#991b1b', '#ca8a04', '#15803d', '#1d4ed8', '#6d28d9', '#be185d'];
    const arc = Math.PI * 2 / 12;
    for (let i = 0; i < 12; i++) {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, i * arc - Math.PI / 2, (i + 1) * arc - Math.PI / 2);
      ctx.closePath();
      ctx.fillStyle = i === slice ? '#e5e7eb' : colors[i];
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.moveTo(cx, cy - r - 20);
    ctx.lineTo(cx - 13, cy - r);
    ctx.lineTo(cx + 13, cy - r);
    ctx.closePath();
    ctx.fillStyle = '#ffd700';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx, cy, 44, 0, Math.PI * 2);
    const hub = ctx.createRadialGradient(cx - 12, cy - 14, 2, cx, cy, 44);
    hub.addColorStop(0, '#fff7ad');
    hub.addColorStop(0.45, '#ffd700');
    hub.addColorStop(1, '#8a5a00');
    ctx.fillStyle = hub;
    ctx.fill();
    ctx.strokeStyle = '#fef3c7';
    ctx.stroke();
    ctx.fillStyle = '#111827';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${Number(multiplier || 0).toFixed(2)}x`, cx, cy + 1);

    ctx.fillStyle = won ? C.green : C.red;
    ctx.font = 'bold 20px Arial';
    ctx.fillText(won ? 'WON' : 'LOST', cx, 326);
    return canvas.toBuffer('image/png');
  }

  static async createRouletteImage(number, color, won, username, gameId) {
    if (!canvasModule) return null;
    const { createCanvas } = canvasModule;
    const canvas = createCanvas(320, 260);
    const ctx = canvas.getContext('2d');
    clear(ctx, 320, 260);
    fillPanel(ctx, 0, 0, 320, 260, 18);

    const c = color === 'red' ? C.red : color === 'green' ? C.green : '#111827';
    ctx.beginPath();
    ctx.arc(160, 108, 74, 0, Math.PI * 2);
    ctx.fillStyle = c;
    ctx.fill();
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 48px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(number), 160, 110);
    ctx.font = 'bold 18px Arial';
    ctx.fillText(String(color || '').toUpperCase(), 160, 202);
    return canvas.toBuffer('image/png');
  }

  static async createLimboImage(multiplier, target, won, username, gameId, bet = null, payout = null) {
    if (!canvasModule) return null;
    const { createCanvas } = canvasModule;
    const canvas = createCanvas(400, 280);
    const ctx = canvas.getContext('2d');
    clear(ctx, 400, 280);
    fillPanel(ctx, 0, 0, 400, 280, 18);
    fillBoard(ctx, 20, 34, 360, 200, 16);
    const c = won ? C.green : C.red;
    ctx.fillStyle = c;
    ctx.font = 'bold 58px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${Number(multiplier || 0).toFixed(2)}x`, 200, 98);
    ctx.fillStyle = C.muted;
    ctx.font = '18px Arial';
    ctx.fillText(`Target: ${Number(target || 0).toFixed(2)}x`, 200, 150);
    if (bet !== null) ctx.fillText(`Bet: ${formatPoints(bet)} pts`, 200, 184);
    ctx.fillStyle = c;
    ctx.font = 'bold 22px Arial';
    const result = won ? `WON ${formatPoints(payout || 0)} pts` : `LOST ${formatPoints(bet || 0)} pts`;
    ctx.fillText(result, 200, 220);
    return canvas.toBuffer('image/png');
  }

  static async createCrashImage(crashPoint, currentMult, won, username, gameId) {
    if (!canvasModule) return null;
    const { createCanvas } = canvasModule;
    const canvas = createCanvas(400, 260);
    const ctx = canvas.getContext('2d');
    clear(ctx, 400, 260);
    fillPanel(ctx, 0, 0, 400, 260, 18);

    const x = 36, y = 42, w = 328, h = 130;
    const display = Number(currentMult || crashPoint || 1);
    const max = Math.max(display * 1.25, Number(crashPoint || 1) * 1.25, 2);
    const c = won ? C.green : display >= Number(crashPoint || 0) ? C.red : C.green;
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    for (let i = 0; i <= 3; i++) {
      ctx.beginPath();
      ctx.moveTo(x, y + h * i / 3);
      ctx.lineTo(x + w, y + h * i / 3);
      ctx.stroke();
    }
    ctx.beginPath();
    let jetX = x;
    let jetY = y + h;
    for (let i = 0; i < 70; i++) {
      const t = i / 69;
      const v = 1 + (display - 1) * Math.pow(t, 2.15);
      const px = x + t * w;
      const py = y + h - ((v - 1) / (max - 1)) * h;
      jetX = px;
      jetY = py;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.strokeStyle = c;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.save();
    ctx.translate(jetX, jetY);
    ctx.rotate(-0.55);
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(-12, -8);
    ctx.lineTo(-6, 0);
    ctx.lineTo(-12, 8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#60a5fa';
    ctx.beginPath();
    ctx.arc(-2, 0, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fb923c';
    ctx.beginPath();
    ctx.moveTo(-13, 0);
    ctx.lineTo(-28, -6);
    ctx.lineTo(-22, 0);
    ctx.lineTo(-28, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = c;
    ctx.font = 'bold 32px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${display.toFixed(2)}x`, 200, 218);
    return canvas.toBuffer('image/png');
  }

  static async createHiloImage(cards, won, username, gameId, currentValue, arrowDir = 0) {
    if (!canvasModule) return null;
    const { createCanvas } = canvasModule;
    const canvas = createCanvas(420, 240);
    const ctx = canvas.getContext('2d');
    clear(ctx, 420, 240);
    fillPanel(ctx, 0, 0, 420, 240, 18);
    const cArr = Array.isArray(cards) ? cards : [];
    if (cArr.length >= 2) {
      drawHand(ctx, [cArr[0]], 10, 50, 65, 98, 8, 180);
      const arrowX = 152, arrowY = 105;
      const color = arrowDir > 0 ? C.green : C.red;
      ctx.save();
      ctx.translate(arrowX, arrowY);
      if (arrowDir < 0) ctx.scale(-1, 1);
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-30, 0);
      ctx.lineTo(30, 0);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(30, 0);
      ctx.lineTo(18, -14);
      ctx.lineTo(18, 14);
      ctx.closePath();
      ctx.fill();
      ctx.font = 'bold 14px Arial';
      ctx.textAlign = 'center';
      ctx.fillStyle = color;
      ctx.fillText(arrowDir > 0 ? 'HIGHER' : 'LOWER', 0, 40);
      ctx.restore();
      drawHand(ctx, [cArr[1]], 230, 50, 65, 98, 8, 180);
    } else {
      drawHand(ctx, cArr.slice(-6), 60, 50, 65, 98, 8, 300);
    }
    if (won !== undefined) {
      ctx.fillStyle = won ? C.green : C.red;
      ctx.font = 'bold 22px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(won ? 'WON' : 'LOST', 210, 198);
    }
    return canvas.toBuffer('image/png');
  }

  static async createBaccaratImage(pCard, pV, bCard, bV, result, won, username, gameId) {
    if (!canvasModule) return null;
    const { createCanvas } = canvasModule;
    const canvas = createCanvas(400, 300);
    const ctx = canvas.getContext('2d');
    clear(ctx, 400, 300);
    fillBoard(ctx, 0, 0, 400, 300, 18);
    ctx.fillStyle = C.muted;
    ctx.font = '12px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('PLAYER', 16, 28);
    ctx.fillText('BANKER', 16, 142);
    ctx.fillStyle = C.text;
    ctx.font = 'bold 20px Arial';
    ctx.textAlign = 'right';
    ctx.fillText(String(pV), 360, 31);
    ctx.fillText(String(bV), 360, 145);
    drawHand(ctx, pCard, 20, 42, 50, 72, 10, 250);
    drawHand(ctx, bCard, 20, 156, 50, 72, 10, 250);
    ctx.fillStyle = won ? C.green : C.red;
    ctx.font = 'bold 22px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(result === 'tie' ? 'TIE' : String(result || '').toUpperCase(), 250, 264);
    return canvas.toBuffer('image/png');
  }

  static async createBalanceCard(username, balance, usdValue, avatarUrl, gamesPlayed, wins, losses) {
    if (!canvasModule) return null;
    if (typeof avatarUrl !== 'string' || !/^https?:\/\//.test(avatarUrl)) avatarUrl = null;
    const { createCanvas } = canvasModule;
    const canvas = createCanvas(400, 140);
    const ctx = canvas.getContext('2d');
    clear(ctx, 400, 140);

    fillBoard(ctx, 0, 0, 400, 140, 18);
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 4;
    roundRect(ctx, 6, 6, 388, 128, 16);
    ctx.stroke();

    await drawAvatar(ctx, avatarUrl, 68, 70, 36);
    ctx.fillStyle = C.text;
    ctx.font = 'bold 20px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(username, 120, 54);
    ctx.fillStyle = C.blue;
    ctx.font = 'bold 28px Arial';
    ctx.fillText(`${formatPoints(balance)} pts`, 120, 82);
    ctx.fillStyle = 'rgba(255,255,255,0.58)';
    ctx.font = '15px Arial';
    ctx.fillText(`$${usdValue} USD`, 120, 108);

    return canvas.toBuffer('image/png');
  }

  static async createTipImage(fromUsername, toUsername, amount, usdValue, fromAvatarUrl = null, toAvatarUrl = null) {
    if (!canvasModule) return null;
    const { createCanvas } = canvasModule;
    const canvas = createCanvas(420, 170);
    const ctx = canvas.getContext('2d');
    clear(ctx, 420, 170);
    fillBoard(ctx, 0, 0, 420, 170, 18);

    await drawAvatar(ctx, fromAvatarUrl, 70, 72, 30);
    await drawAvatar(ctx, toAvatarUrl, 350, 72, 30);

    ctx.strokeStyle = C.green;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(118, 72);
    ctx.lineTo(302, 72);
    ctx.stroke();
    ctx.fillStyle = C.green;
    ctx.beginPath();
    ctx.moveTo(302, 72);
    ctx.lineTo(286, 62);
    ctx.lineTo(286, 82);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = C.text;
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${formatPoints(amount)} pts`, 210, 56);
    ctx.fillStyle = 'rgba(255,255,255,0.58)';
    ctx.font = '15px Arial';
    ctx.fillText(`$${usdValue} USD`, 210, 104);

    ctx.fillStyle = C.text;
    ctx.font = 'bold 14px Arial';
    ctx.fillText(fromUsername, 70, 124);
    ctx.fillText(toUsername, 350, 124);

    return canvas.toBuffer('image/png');
  }
}

module.exports = GameImages;
