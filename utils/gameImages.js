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
  ctx.fillText('EzBet', w / 2, h - 12);
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
    const canvas = createCanvas(420, 300);
    const ctx = canvas.getContext('2d');
    clear(ctx, 420, 300);
    fillPanel(ctx, 0, 0, 420, 300, 18);

    function drawCoin(cx, cy, r, side) {
      ctx.save();
      ctx.shadowColor = side === 'heads' ? 'rgba(250,204,21,.34)' : 'rgba(167,139,250,.28)';
      ctx.shadowBlur = 26;
      ctx.shadowOffsetY = 8;

      const outer = ctx.createRadialGradient(cx - r * .35, cy - r * .45, 2, cx, cy, r);
      if (side === 'heads') {
        outer.addColorStop(0, '#fff7c7');
        outer.addColorStop(0.55, '#ffd84a');
        outer.addColorStop(1, '#a66700');
      } else {
        outer.addColorStop(0, '#eef0ff');
        outer.addColorStop(0.55, '#8c88aa');
        outer.addColorStop(1, '#1b1725');
      }
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = outer;
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.beginPath();
      ctx.arc(cx, cy, r - 7, 0, Math.PI * 2);
      ctx.fillStyle = side === 'heads' ? '#fff0a3' : '#aeb5ca';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(cx, cy, r - 13, 0, Math.PI * 2);
      const coin = ctx.createRadialGradient(cx - r * .35, cy - r * .45, 3, cx, cy, r);
      if (side === 'heads') {
        coin.addColorStop(0, '#fff7b8');
        coin.addColorStop(0.3, '#ffd338');
        coin.addColorStop(0.72, '#f59e0b');
        coin.addColorStop(1, '#9a5700');
      } else {
        coin.addColorStop(0, '#d8d5ff');
        coin.addColorStop(0.32, '#817a9f');
        coin.addColorStop(0.72, '#353044');
        coin.addColorStop(1, '#171421');
      }
      ctx.fillStyle = coin;
      ctx.fill();

      ctx.lineWidth = 3;
      ctx.strokeStyle = side === 'heads' ? '#b77900' : '#241f33';
      ctx.beginPath();
      ctx.arc(cx, cy, r - 22, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = side === 'heads' ? '#fff4b8' : '#d8d5ff';
      ctx.strokeStyle = side === 'heads' ? '#ad7400' : '#242033';
      ctx.lineWidth = 5;
      ctx.font = `bold ${Math.round(r * .9)}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const letter = side === 'heads' ? 'H' : 'T';
      ctx.strokeText(letter, cx, cy + 1);
      ctx.fillText(letter, cx, cy + 1);
      ctx.font = `bold ${Math.round(r * .15)}px Arial`;
      ctx.fillText(side.toUpperCase(), cx, cy + r * .66);
      ctx.restore();
    }

    drawCoin(210, 112, 84, result);

    ctx.fillStyle = won ? C.green : C.red;
    ctx.font = 'bold 28px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(won ? 'WON' : 'LOST', 210, 230);
    ctx.fillStyle = C.muted;
    ctx.font = '13px Arial';
    ctx.fillText(`Choice: ${choice.toUpperCase()}  |  Result: ${result.toUpperCase()}`, 210, 260);
    return canvas.toBuffer('image/png');
  }

  static async createBlackjackImage(playerHand, playerTotal, dealerHand, dealerTotal, result, hideDealer, username, gameId) {
    if (!canvasModule) return null;
    const { createCanvas } = canvasModule;
    const canvas = createCanvas(800, 560);
    const ctx = canvas.getContext('2d');
    clear(ctx, 800, 560);

    const bg = ctx.createLinearGradient(0, 0, 0, 560);
    bg.addColorStop(0, '#090a0f');
    bg.addColorStop(1, '#020304');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 800, 560);

    ctx.save();
    ctx.translate(400, 280);
    ctx.scale(1.08, .78);
    ctx.beginPath();
    ctx.arc(0, 0, 275, 0, Math.PI * 2);
    const felt = ctx.createRadialGradient(-80, -90, 40, 0, 0, 290);
    felt.addColorStop(0, '#1b1d24');
    felt.addColorStop(.72, '#0a0d12');
    felt.addColorStop(1, '#010203');
    ctx.fillStyle = felt;
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#1a222c';
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,.08)';
    ctx.beginPath();
    ctx.arc(0, 0, 230, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = 'rgba(255,255,255,.86)';
    ctx.font = 'bold 29px Arial';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(hideDealer ? String(dealerHand?.[0]?.rank || dealerHand?.[0]?.value || '') : String(dealerTotal), 214, 162);
    ctx.fillText(String(playerTotal), 212, 408);

    ctx.fillStyle = 'rgba(255,255,255,.28)';
    ctx.font = 'bold 13px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('DEALER', 300, 48);
    ctx.fillText('YOU', 286, 292);

    drawHand(ctx, dealerHand, 304, 58, 132, 188, -78, 330, hideDealer ? 1 : -1);
    drawHand(ctx, playerHand, 288, 302, 132, 188, -74, 370);

    ctx.save();
    ctx.translate(672, 72);
    roundRect(ctx, 0, 0, 118, 168, 13);
    ctx.fillStyle = '#293446';
    ctx.fill();
    ctx.strokeStyle = '#07080c';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(148,163,184,.28)';
    ctx.lineWidth = 2;
    for (let x = 20; x < 104; x += 14) {
      ctx.beginPath();
      ctx.moveTo(x, 22);
      ctx.lineTo(x, 146);
      ctx.stroke();
    }
    for (let y = 22; y < 148; y += 14) {
      ctx.beginPath();
      ctx.moveTo(20, y);
      ctx.lineTo(104, y);
      ctx.stroke();
    }
    ctx.restore();

    const label = resultText(result);
    if (label) {
      ctx.fillStyle = result === 'tie' ? C.yellow : result === 'win' ? C.green : C.red;
      ctx.font = 'bold 30px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(label, 400, 528);
    }

    ctx.fillStyle = 'rgba(255,255,255,.16)';
    ctx.font = '12px Arial';
    ctx.fillText(`Game ID: ${gameId}`, 400, 550);

    return canvas.toBuffer('image/png');
  }

  static async createWheelImage(slice, multiplier, won, username, gameId, segments = null) {
    if (!canvasModule) return null;
    const { createCanvas } = canvasModule;
    const canvas = createCanvas(620, 480);
    const ctx = canvas.getContext('2d');
    clear(ctx, 620, 480);
    fillPanel(ctx, 0, 0, 620, 480, 18);

    const layout = segments && segments.length ? segments : [
      { mult: 0 }, { mult: 1.2 }, { mult: 0 }, { mult: 1.5 },
      { mult: 0 }, { mult: 2 }, { mult: 0 }, { mult: 3 },
      { mult: 0 }, { mult: 5 }, { mult: 0 }, { mult: 10 }
    ];
    const selectedIndex = Number.isFinite(Number(slice?.index ?? slice)) ? Number(slice?.index ?? slice) : 0;
    const cx = 235, cy = 232, r = 175;
    const colors = ['#161822', '#2563eb', '#171924', '#16a34a', '#161822', '#f59e0b', '#171924', '#dc2626', '#161822', '#7c3aed', '#171924', '#facc15'];
    const arc = Math.PI * 2 / layout.length;

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.45)';
    ctx.shadowBlur = 22;
    ctx.shadowOffsetY = 10;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 12, 0, Math.PI * 2);
    ctx.fillStyle = '#080a12';
    ctx.fill();
    ctx.restore();

    for (let i = 0; i < layout.length; i++) {
      const start = (i - selectedIndex) * arc - Math.PI / 2 - arc / 2;
      const end = start + arc;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, start, end);
      ctx.closePath();
      const grad = ctx.createRadialGradient(cx, cy, 12, cx, cy, r);
      grad.addColorStop(0, i === selectedIndex ? '#fbfbff' : '#2c2f3d');
      grad.addColorStop(0.6, i === selectedIndex ? '#dfe6f3' : colors[i % colors.length]);
      grad.addColorStop(1, i === selectedIndex ? '#ffffff' : colors[i % colors.length]);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.65)';
      ctx.lineWidth = 3;
      ctx.stroke();

      const label = layout[i].mult > 0 ? `${layout[i].mult}x` : 'LOSE';
      const mid = start + arc / 2;
      ctx.save();
      ctx.translate(cx + Math.cos(mid) * 119, cy + Math.sin(mid) * 119);
      ctx.rotate(mid + Math.PI / 2);
      ctx.fillStyle = i === selectedIndex ? '#111827' : '#f8fafc';
      ctx.font = 'bold 15px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, 0, 0);
      ctx.restore();
    }

    ctx.beginPath();
    ctx.arc(cx, cy, r + 2, 0, Math.PI * 2);
    ctx.strokeStyle = '#02030a';
    ctx.lineWidth = 6;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx, cy - r - 30);
    ctx.lineTo(cx - 18, cy - r + 2);
    ctx.lineTo(cx + 18, cy - r + 2);
    ctx.closePath();
    ctx.fillStyle = '#ffd700';
    ctx.fill();
    ctx.strokeStyle = '#8a5a00';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, 58, 0, Math.PI * 2);
    const hub = ctx.createRadialGradient(cx - 12, cy - 14, 2, cx, cy, 58);
    hub.addColorStop(0, '#fff7ad');
    hub.addColorStop(0.45, '#ffd700');
    hub.addColorStop(1, '#8a5a00');
    ctx.fillStyle = hub;
    ctx.fill();
    ctx.strokeStyle = '#fef3c7';
    ctx.stroke();
    ctx.fillStyle = '#111827';
    ctx.font = 'bold 21px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${Number(multiplier || 0).toFixed(2)}x`, cx, cy + 1);

    roundRect(ctx, 452, 58, 128, 238, 14);
    ctx.fillStyle = 'rgba(5,8,14,.48)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.08)';
    ctx.stroke();
    ctx.fillStyle = C.text;
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('MULTIPLIERS', 472, 88);
    ctx.font = '14px Arial';
    const wins = layout.filter(s => s.mult > 0).map(s => `${s.mult}x`);
    wins.forEach((label, i) => {
      ctx.fillStyle = label === `${multiplier}x` && won ? C.green : i === wins.length - 1 ? C.yellow : C.muted;
      ctx.fillText(label, 476, 120 + i * 31);
    });

    ctx.fillStyle = won ? C.green : C.red;
    ctx.font = 'bold 25px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(won ? 'WON' : 'LOST', cx, 438);
    ctx.fillStyle = 'rgba(255,255,255,.24)';
    ctx.font = '12px Arial';
    ctx.fillText(`Game ID: ${gameId}`, 496, 438);
    return canvas.toBuffer('image/png');
  }

  static async createRouletteImage(number, color, won, username, gameId) {
    if (!canvasModule) return null;
    const { createCanvas } = canvasModule;
    const canvas = createCanvas(400, 360);
    const ctx = canvas.getContext('2d');
    clear(ctx, 400, 360);
    fillPanel(ctx, 0, 0, 400, 360, 18);

    const cx = 200, cy = 160, r = 118;
    const redNums = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
    const order = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
    const arc = Math.PI * 2 / order.length;
    for (let i = 0; i < order.length; i++) {
      const n = order[i];
      const start = i * arc - Math.PI / 2;
      const end = start + arc;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, start, end);
      ctx.closePath();
      ctx.fillStyle = n === 0 ? '#16a34a' : redNums.has(n) ? '#dc2626' : '#111827';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1;
      ctx.stroke();

      const mid = start + arc / 2;
      ctx.save();
      ctx.translate(cx + Math.cos(mid) * 101, cy + Math.sin(mid) * 101);
      ctx.rotate(mid + Math.PI / 2);
      ctx.fillStyle = '#f8fafc';
      ctx.font = n === 0 ? 'bold 8px Arial' : 'bold 7px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(n), 0, 0);
      ctx.restore();
    }

    ctx.beginPath();
    ctx.arc(cx, cy, 70, 0, Math.PI * 2);
    ctx.fillStyle = '#2a2738';
    ctx.fill();
    ctx.strokeStyle = '#facc15';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, 38, 0, Math.PI * 2);
    ctx.fillStyle = '#141320';
    ctx.fill();

    const hitIndex = order.indexOf(number);
    const angle = hitIndex * arc + arc / 2 - Math.PI / 2;
    const bx = cx + Math.cos(angle) * 96;
    const by = cy + Math.sin(angle) * 96;
    ctx.beginPath();
    ctx.arc(bx, by, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#f8fafc';
    ctx.fill();

    const c = color === 'red' ? C.red : color === 'green' ? C.green : '#e5e7eb';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 42px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(number), cx, cy + 4);
    ctx.font = 'bold 18px Arial';
    ctx.fillStyle = c;
    ctx.fillText(String(color || '').toUpperCase(), cx, 306);
    return canvas.toBuffer('image/png');
  }

  static async createLimboImage(multiplier, target, won, username, gameId, bet = null, payout = null) {
    if (!canvasModule) return null;
    const { createCanvas } = canvasModule;
    const canvas = createCanvas(560, 380);
    const ctx = canvas.getContext('2d');
    clear(ctx, 560, 380);
    fillPanel(ctx, 0, 0, 560, 380, 18);
    const c = won ? C.green : C.red;

    roundRect(ctx, 34, 34, 492, 250, 18);
    const board = ctx.createLinearGradient(34, 34, 34, 284);
    board.addColorStop(0, '#1d1b2d');
    board.addColorStop(0.55, '#151525');
    board.addColorStop(1, '#0f0e19');
    ctx.fillStyle = board;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.55)';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255,255,255,.06)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 5; i++) {
      const y = 34 + (250 * i / 5);
      ctx.beginPath();
      ctx.moveTo(58, y);
      ctx.lineTo(502, y);
      ctx.stroke();
    }
    for (let i = 1; i < 7; i++) {
      const x = 34 + (492 * i / 7);
      ctx.beginPath();
      ctx.moveTo(x, 64);
      ctx.lineTo(x, 260);
      ctx.stroke();
    }

    const max = Math.max(Number(multiplier || 1), Number(target || 1), 2);
    const graphX = 72, graphY = 250, graphW = 420, graphH = 154;
    ctx.beginPath();
    for (let i = 0; i <= 72; i++) {
      const t = i / 72;
      const v = 1 + (Number(multiplier || 1) - 1) * Math.pow(t, 1.9);
      const px = graphX + t * graphW;
      const py = graphY - ((v - 1) / (max - 1)) * graphH;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.strokeStyle = c;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.stroke();

    const targetY = graphY - ((Number(target || 1) - 1) / (max - 1)) * graphH;
    ctx.setLineDash([8, 7]);
    ctx.strokeStyle = 'rgba(255,255,255,.22)';
    ctx.beginPath();
    ctx.moveTo(62, targetY);
    ctx.lineTo(498, targetY);
    ctx.stroke();
    ctx.setLineDash([]);

    roundRect(ctx, 132, 68, 296, 126, 18);
    ctx.fillStyle = 'rgba(10,10,18,.78)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.055)';
    ctx.stroke();
    ctx.fillStyle = c;
    ctx.font = 'bold 72px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${Number(multiplier || 0).toFixed(2)}x`, 280, 124);
    ctx.fillStyle = C.muted;
    ctx.font = '17px Arial';
    ctx.fillText(`Target: ${Number(target || 0).toFixed(2)}x`, 280, 174);
    if (bet !== null) ctx.fillText(`Bet: ${formatPoints(bet)} pts`, 280, 210);

    roundRect(ctx, 140, 298, 280, 46, 23);
    ctx.fillStyle = won ? 'rgba(35,224,120,.14)' : 'rgba(239,68,68,.14)';
    ctx.fill();
    ctx.strokeStyle = won ? 'rgba(35,224,120,.42)' : 'rgba(239,68,68,.42)';
    ctx.stroke();
    ctx.fillStyle = c;
    ctx.font = 'bold 22px Arial';
    const result = won ? `WON ${formatPoints(payout || 0)} pts` : `LOST ${formatPoints(bet || 0)} pts`;
    ctx.fillText(result, 280, 321);
    ctx.fillStyle = 'rgba(255,255,255,.22)';
    ctx.font = '12px Arial';
    ctx.fillText(`Game ID: ${gameId}`, 280, 362);
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

  static async createTowersImage({ mode, floor = 0, bet = 0, status = 'select', pickedTiles = [], revealMap = [], gameId = null, payout = 0 }) {
    if (!canvasModule) return null;
    const { createCanvas } = canvasModule;
    const canvas = createCanvas(440, 560);
    const ctx = canvas.getContext('2d');
    clear(ctx, 440, 560);

    const accent = status === 'lost' ? C.red : status === 'won' ? C.green : '#f59e0b';
    const panel = ctx.createLinearGradient(0, 0, 0, 560);
    panel.addColorStop(0, '#201333');
    panel.addColorStop(1, '#120c20');
    ctx.fillStyle = panel;
    roundRect(ctx, 0, 0, 440, 560, 18);
    ctx.fill();
    ctx.strokeStyle = 'rgba(168,85,247,.5)';
    ctx.lineWidth = 5;
    ctx.stroke();

    ctx.fillStyle = '#facc15';
    ctx.font = 'bold 18px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('FLIPBET TOWER', 24, 28);
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.font = '11px Arial';
    ctx.fillText(`mode - ${mode?.label ? String(mode.label).toLowerCase() : 'choose'}`, 24, 46);

    const currentMult = mode ? Math.max(1, Number(mode.multiplier || 1)) : 1;
    ctx.textAlign = 'right';
    ctx.fillStyle = '#bda7d9';
    ctx.font = 'bold 24px Arial';
    ctx.fillText(`${currentMult.toFixed(2)}x`, 410, 28);
    ctx.fillStyle = 'rgba(255,255,255,.45)';
    ctx.font = '11px Arial';
    ctx.fillText('current multiplier', 410, 46);

    const tiles = mode?.tiles || 4;
    const rows = 9;
    const startX = 24;
    const startY = 76;
    const gap = 8;
    const tileW = Math.floor((392 - (tiles - 1) * gap) / tiles);
    const tileH = 36;
    const picked = new Map((pickedTiles || []).map(p => [Number(p.floor), Number(p.pick)]));
    const reveal = status === 'won' || status === 'lost';
    const revealByFloor = new Map((revealMap || []).map(r => [Number(r.floor), r.bombs || []]));

    function drawEgg(cx, cy) {
      const g = ctx.createRadialGradient(cx - 4, cy - 6, 2, cx, cy, 14);
      g.addColorStop(0, '#fff7cf');
      g.addColorStop(0.45, '#facc15');
      g.addColorStop(1, '#a16207');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 11, 14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffe58a';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    function drawBomb(cx, cy) {
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(cx, cy + 2, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#7f1d1d';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.strokeStyle = '#fbbf24';
      ctx.beginPath();
      ctx.moveTo(cx + 7, cy - 8);
      ctx.quadraticCurveTo(cx + 15, cy - 18, cx + 22, cy - 8);
      ctx.stroke();
    }

    for (let visual = 0; visual < rows; visual++) {
      const logicalFloor = rows - visual;
      const y = startY + visual * (tileH + gap);
      const active = status === 'playing' && logicalFloor === floor + 1;
      const safePick = picked.get(logicalFloor);
      const bombs = revealByFloor.get(logicalFloor) || [];
      for (let col = 1; col <= tiles; col++) {
        const x = startX + (col - 1) * (tileW + gap);
        roundRect(ctx, x, y, tileW, tileH, 7);
        ctx.fillStyle = active ? 'rgba(250,204,21,.1)' : 'rgba(255,255,255,.035)';
        ctx.fill();
        ctx.strokeStyle = active ? '#f59e0b' : 'rgba(168,85,247,.22)';
        ctx.lineWidth = active ? 2 : 1;
        ctx.stroke();

        const cx = x + tileW / 2;
        const cy = y + tileH / 2;
        if (reveal && bombs.includes(col)) drawBomb(cx, cy);
        else if (reveal && !bombs.includes(col)) drawEgg(cx, cy);
        else if (safePick === col) drawEgg(cx, cy);
        else if (active) {
          ctx.fillStyle = '#facc15';
          ctx.font = 'bold 17px Arial';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('?', cx, cy + 1);
        } else {
          ctx.fillStyle = 'rgba(189,167,217,.55)';
          ctx.beginPath();
          ctx.arc(cx, cy, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      if (active && mode?.nextMultiplier) {
        ctx.fillStyle = '#facc15';
        ctx.font = 'bold 11px Arial';
        ctx.textAlign = 'right';
        ctx.fillText(`${mode.nextMultiplier.toFixed(2)}x`, 414, y + tileH / 2);
      }
    }

    ctx.fillStyle = 'rgba(255,255,255,.6)';
    ctx.font = '11px Arial';
    ctx.textAlign = 'center';
    const footer = status === 'lost'
      ? 'bomb hit - tower ended'
      : status === 'won'
        ? `cashed out ${formatPoints(payout)} pts`
        : floor > 0 ? `stake ${formatPoints(bet)} pts - pick the next safe tile` : `stake ${formatPoints(bet)} pts - pick a safe tile to begin`;
    ctx.fillText(footer, 220, 506);
    if (gameId) {
      ctx.fillStyle = 'rgba(255,255,255,.26)';
      ctx.font = '10px Arial';
      ctx.fillText(`Game ID: ${gameId}`, 220, 528);
    }
    return canvas.toBuffer('image/png');
  }

  static async createMarketImage({ points = [], prediction = 'up', result = 'up', won = false, bet = 0, payout = 0, gameId = null }) {
    if (!canvasModule) return null;
    const { createCanvas } = canvasModule;
    const canvas = createCanvas(640, 340);
    const ctx = canvas.getContext('2d');
    clear(ctx, 640, 340);

    const bg = ctx.createLinearGradient(0, 0, 0, 340);
    bg.addColorStop(0, '#11131a');
    bg.addColorStop(1, '#090b10');
    ctx.fillStyle = bg;
    roundRect(ctx, 0, 0, 640, 340, 10);
    ctx.fill();

    ctx.fillStyle = '#f5f7fb';
    ctx.font = 'bold 20px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('FLIPBET  |  MARKET PREDICTION', 24, 34);

    ctx.fillStyle = won ? C.green : C.red;
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'right';
    ctx.fillText(won ? `PROFIT +${formatPoints(payout)} pts` : `LIQUIDATED -${formatPoints(bet)} pts`, 616, 34);

    const chartX = 30;
    const chartY = 58;
    const chartW = 580;
    const chartH = 220;
    ctx.save();
    roundRect(ctx, chartX, chartY, chartW, chartH, 8);
    ctx.clip();
    ctx.fillStyle = '#0b0e13';
    ctx.fillRect(chartX, chartY, chartW, chartH);

    ctx.strokeStyle = 'rgba(255,255,255,.045)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 12; i++) {
      const x = chartX + (chartW / 12) * i;
      ctx.beginPath();
      ctx.moveTo(x, chartY);
      ctx.lineTo(x, chartY + chartH);
      ctx.stroke();
    }
    for (let i = 0; i <= 8; i++) {
      const y = chartY + (chartH / 8) * i;
      ctx.beginPath();
      ctx.moveTo(chartX, y);
      ctx.lineTo(chartX + chartW, y);
      ctx.stroke();
    }

    const data = points.length > 1 ? points : [0.5, 0.56, 0.47, 0.62];
    const min = Math.min(...data);
    const max = Math.max(...data);
    const span = Math.max(0.01, max - min);
    const mapped = data.map((v, i) => ({
      x: chartX + 22 + (i / (data.length - 1)) * (chartW - 44),
      y: chartY + 18 + (1 - ((v - min) / span)) * (chartH - 36)
    }));
    const split = Math.max(1, Math.floor(mapped.length * 0.55));

    function strokeSegment(start, end, color) {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(mapped[start].x, mapped[start].y);
      for (let i = start + 1; i <= end; i++) ctx.lineTo(mapped[i].x, mapped[i].y);
      ctx.stroke();
      ctx.restore();
    }

    strokeSegment(0, split, '#64748b');
    strokeSegment(split, mapped.length - 1, result === 'up' ? C.green : C.red);
    const last = mapped[mapped.length - 1];
    ctx.fillStyle = result === 'up' ? C.green : C.red;
    ctx.beginPath();
    ctx.arc(last.x, last.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const predColor = prediction === 'up' ? C.green : C.red;
    const resColor = result === 'up' ? C.green : C.red;
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.fillText('YOUR PREDICTION', 32, 306);
    ctx.fillText('MARKET RESULT', 298, 306);
    ctx.fillStyle = predColor;
    ctx.font = 'bold 20px Arial';
    ctx.fillText(prediction.toUpperCase(), 32, 330);
    ctx.fillStyle = resColor;
    ctx.fillText(result.toUpperCase(), 298, 330);

    ctx.fillStyle = 'rgba(255,255,255,.35)';
    ctx.font = '11px Arial';
    ctx.textAlign = 'right';
    if (gameId) ctx.fillText(`Game ID: ${gameId}`, 612, 326);
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
