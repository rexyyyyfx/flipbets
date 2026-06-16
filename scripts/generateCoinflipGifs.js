const fs = require('fs');
const path = require('path');
const { createCanvas, GifEncoder } = require('@napi-rs/canvas');
const sharp = require('sharp');
const WebP = require('node-webpmux');

const outDir = path.join(process.cwd(), 'assets', 'coinflip');
const previewDir = path.join(process.cwd(), 'tmp-game-images');
const W = 560;
const H = 340;
const WEBP_W = 360;
const WEBP_H = 219;
const FRAMES = 34;
const DELAY = 75;
const HOLD_START = 23;

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function sideStyle(side) {
  return side === 'heads'
    ? {
        letter: 'H',
        label: 'HEADS',
        outer0: '#fff8c7',
        outer1: '#ffd84a',
        outer2: '#a66700',
        rim: '#fff0a3',
        light: '#fff7b8',
        mid: '#ffd338',
        mid2: '#f59e0b',
        dark: '#9a5700',
        ink: '#fff4b8',
        stroke: '#8f5d00',
        glow: 'rgba(250,204,21,.42)'
      }
    : {
        letter: 'T',
        label: 'TAILS',
        outer0: '#eef0ff',
        outer1: '#8c88aa',
        outer2: '#1b1725',
        rim: '#aeb5ca',
        light: '#d8d5ff',
        mid: '#817a9f',
        mid2: '#353044',
        dark: '#171421',
        ink: '#ddd9ff',
        stroke: '#242033',
        glow: 'rgba(167,139,250,.36)'
      };
}

function drawBackground(ctx) {
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#252431');
  bg.addColorStop(1, '#191822');
  ctx.fillStyle = bg;
  roundRect(ctx, 0, 0, W, H, 24);
  ctx.fill();

  const glow = ctx.createRadialGradient(W / 2, 132, 20, W / 2, 132, 240);
  glow.addColorStop(0, 'rgba(59,130,246,.14)');
  glow.addColorStop(0.58, 'rgba(35,224,120,.055)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = 'rgba(255,255,255,.04)';
  ctx.lineWidth = 1;
  for (let x = 34; x < W; x += 38) {
    ctx.beginPath();
    ctx.moveTo(x, 24);
    ctx.lineTo(x, H - 28);
    ctx.stroke();
  }
  for (let y = 34; y < H; y += 38) {
    ctx.beginPath();
    ctx.moveTo(26, y);
    ctx.lineTo(W - 26, y);
    ctx.stroke();
  }
}

function drawFace(ctx, side, r, visible) {
  const s = sideStyle(side);
  const rx = r;
  const ry = Math.max(8, r * visible);

  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  const outer = ctx.createRadialGradient(-rx * 0.36, -ry * 0.46, 2, 0, 0, Math.max(rx, ry));
  outer.addColorStop(0, s.outer0);
  outer.addColorStop(0.58, s.outer1);
  outer.addColorStop(1, s.outer2);
  ctx.fillStyle = outer;
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(0, 0, rx * 0.91, ry * 0.91, 0, 0, Math.PI * 2);
  ctx.fillStyle = s.rim;
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(0, 0, rx * 0.82, ry * 0.82, 0, 0, Math.PI * 2);
  const face = ctx.createRadialGradient(-rx * 0.28, -ry * 0.36, 3, 0, 0, Math.max(rx, ry));
  face.addColorStop(0, s.light);
  face.addColorStop(0.34, s.mid);
  face.addColorStop(0.72, s.mid2);
  face.addColorStop(1, s.dark);
  ctx.fillStyle = face;
  ctx.fill();

  ctx.lineWidth = Math.max(1.5, 2.5 * visible);
  ctx.strokeStyle = s.stroke;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx * 0.66, ry * 0.66, 0, 0, Math.PI * 2);
  ctx.stroke();

  if (visible < 0.36) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, (visible - 0.36) / 0.34);
  ctx.fillStyle = s.ink;
  ctx.strokeStyle = s.stroke;
  ctx.lineWidth = 5;
  ctx.font = `bold ${Math.round(r * 0.92)}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeText(s.letter, 0, 1);
  ctx.fillText(s.letter, 0, 1);
  ctx.font = `bold ${Math.round(r * 0.15)}px Arial`;
  ctx.fillText(s.label, 0, r * 0.66);
  ctx.restore();
}

function drawEdge(ctx, side, r) {
  const s = sideStyle(side);
  const edge = ctx.createLinearGradient(-r, 0, r, 0);
  edge.addColorStop(0, s.dark);
  edge.addColorStop(0.18, s.mid2);
  edge.addColorStop(0.47, s.rim);
  edge.addColorStop(0.82, s.mid2);
  edge.addColorStop(1, s.dark);
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.98, Math.max(8, r * 0.12), 0, 0, Math.PI * 2);
  ctx.fillStyle = edge;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.42)';
  ctx.lineWidth = 2;
  ctx.stroke();
}

function animationSide(finalSide, frame) {
  if (frame >= HOLD_START) return finalSide;
  const phase = frame / HOLD_START;
  const halfTurn = Math.floor(phase * 14);
  const finalParity = finalSide === 'heads' ? 0 : 1;
  return halfTurn % 2 === finalParity ? 'heads' : 'tails';
}

function drawCoin(ctx, finalSide, frame) {
  const moving = frame < HOLD_START;
  const t = moving ? frame / HOLD_START : 1;
  const easeOut = 1 - Math.pow(1 - t, 2.6);
  const arc = Math.sin(Math.PI * t);
  const side = animationSide(finalSide, frame);
  const finalSettle = moving ? 0 : (frame - HOLD_START) / (FRAMES - HOLD_START - 1);

  const cx = W / 2 + Math.sin(t * Math.PI * 0.92) * 46 * (1 - finalSettle);
  const cy = 200 - arc * 112;
  const r = 78 + arc * 12 - finalSettle * 2;
  const spin = moving ? easeOut * Math.PI * 14 : Math.PI * 14;
  const visible = moving ? Math.max(0.08, Math.abs(Math.cos(spin))) : 1;
  const tilt = moving ? Math.sin(t * Math.PI * 2) * 0.12 : 0;
  const s = sideStyle(side);

  ctx.fillStyle = 'rgba(0,0,0,.35)';
  ctx.beginPath();
  ctx.ellipse(W / 2, 282, 112 - arc * 34, 17 - arc * 5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(tilt);
  ctx.shadowColor = s.glow;
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 12;
  if (visible < 0.15) drawEdge(ctx, side, r);
  else drawFace(ctx, side, r, visible);
  ctx.restore();
}

function renderFrame(finalSide, frame) {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  drawBackground(ctx);
  drawCoin(ctx, finalSide, frame);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f4f4f5';
  ctx.font = 'bold 22px Arial';
  ctx.fillText(frame >= HOLD_START ? `Result: ${sideStyle(finalSide).label}` : 'Flipping Coin...', W / 2, 306);
  ctx.fillStyle = 'rgba(255,255,255,.42)';
  ctx.font = '12px Arial';
  ctx.fillText('Heads = H   |   Tails = T', W / 2, 326);
  return canvas;
}

function makeGif(finalSide) {
  const encoder = new GifEncoder(W, H);
  for (let i = 0; i < FRAMES; i++) {
    const canvas = renderFrame(finalSide, i);
    const rgba = canvas.getContext('2d').getImageData(0, 0, W, H).data;
    encoder.addFrame(new Uint8Array(rgba), W, H, DELAY);
  }
  return encoder.finish();
}

async function makeWebP(finalSide) {
  const frames = [];
  for (let i = 0; i < FRAMES; i++) {
    const canvas = renderFrame(finalSide, i);
    const png = canvas.toBuffer('image/png');
    const webp = await sharp(png)
      .resize(WEBP_W, WEBP_H, { fit: 'fill' })
      .webp({ quality: 58, effort: 4, smartSubsample: true })
      .toBuffer();
    frames.push(await WebP.Image.generateFrame({
      buffer: webp,
      delay: DELAY,
      blend: false,
      dispose: true
    }));
  }
  return WebP.Image.save(null, {
    width: WEBP_W,
    height: WEBP_H,
    loops: 0,
    bgColor: [25, 24, 34, 255],
    frames
  });
}

function makePreview() {
  const canvas = createCanvas(W * 4, H * 2);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#111827';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  [0, 10, 22, 34].forEach((frame, i) => ctx.drawImage(renderFrame('heads', frame), i * W, 0));
  [0, 10, 22, 34].forEach((frame, i) => ctx.drawImage(renderFrame('tails', frame), i * W, H));
  return canvas.toBuffer('image/png');
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(previewDir, { recursive: true });
  for (const side of ['heads', 'tails']) {
    const gifFile = path.join(outDir, `flip-${side}.gif`);
    const webpFile = path.join(outDir, `flip-${side}.webp`);
    fs.writeFileSync(gifFile, makeGif(side));
    fs.writeFileSync(webpFile, await makeWebP(side));
    console.log(`${gifFile} ${fs.statSync(gifFile).size}`);
    console.log(`${webpFile} ${fs.statSync(webpFile).size}`);
  }
  fs.writeFileSync(path.join(previewDir, 'coinflip-animation-preview.png'), makePreview());
})();
