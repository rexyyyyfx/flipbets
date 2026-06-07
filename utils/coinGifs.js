function colorIndex(r, g, b, a = 255) {
  if (a < 128) return 0;
  if (r > 230 && g > 180 && b < 80) return 2;
  if (r > 170 && g > 110 && b < 50) return 3;
  if (r > 240 && g > 240 && b > 210) return 4;
  if (r > 210 && g > 210 && b > 210) return 5;
  if (r > 35 && g > 180 && b > 95) return 6;
  return 1;
}

function putShort(out, value) {
  out.push(value & 255, (value >> 8) & 255);
}

function lzwEncode(indices, minCodeSize = 8) {
  const clear = 1 << minCodeSize;
  const end = clear + 1;
  let next = end + 1;
  let codeSize = minCodeSize + 1;
  const dict = new Map();
  for (let i = 0; i < clear; i++) dict.set(String.fromCharCode(i), i);

  const codes = [clear];
  let phrase = String.fromCharCode(indices[0]);
  for (let i = 1; i < indices.length; i++) {
    const ch = String.fromCharCode(indices[i]);
    const combo = phrase + ch;
    if (dict.has(combo)) {
      phrase = combo;
    } else {
      codes.push(dict.get(phrase));
      if (next < 4096) {
        dict.set(combo, next++);
        if (next === (1 << codeSize) && codeSize < 12) codeSize++;
      } else {
        codes.push(clear);
        dict.clear();
        for (let j = 0; j < clear; j++) dict.set(String.fromCharCode(j), j);
        next = end + 1;
        codeSize = minCodeSize + 1;
      }
      phrase = ch;
    }
  }
  codes.push(dict.get(phrase), end);

  const bytes = [];
  let bitBuffer = 0;
  let bitCount = 0;
  next = end + 1;
  codeSize = minCodeSize + 1;
  for (const code of codes) {
    bitBuffer |= code << bitCount;
    bitCount += codeSize;
    while (bitCount >= 8) {
      bytes.push(bitBuffer & 255);
      bitBuffer >>= 8;
      bitCount -= 8;
    }
    if (code === clear) {
      next = end + 1;
      codeSize = minCodeSize + 1;
    } else if (code !== end) {
      next++;
      if (next === (1 << codeSize) && codeSize < 12) codeSize++;
    }
  }
  if (bitCount > 0) bytes.push(bitBuffer & 255);
  return bytes;
}

function makeFrame(width, height, endSide, step, steps) {
  const data = new Uint8Array(width * height);
  data.fill(1);

  const cx = width / 2;
  const cy = height / 2 - 4;
  const t = step / (steps - 1);
  const squash = Math.max(0.18, Math.abs(Math.cos(t * Math.PI * 5)));
  const rx = 34 * squash;
  const ry = 34;
  const showLetter = step >= steps - 3;
  const letter = endSide === 'heads' ? 'H' : 'T';

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1) {
        const shine = (x < cx - 8 && y < cy - 8) ? 4 : 2;
        data[y * width + x] = shine;
        if (Math.abs(dx * dx + dy * dy - 1) < 0.11) data[y * width + x] = 3;
      }
    }
  }

  if (showLetter) {
    const letterPixels = letter === 'H'
      ? [[-9,-13],[-9,-7],[-9,-1],[-9,5],[-9,11],[9,-13],[9,-7],[9,-1],[9,5],[9,11],[-3,-1],[3,-1]]
      : [[-12,-13],[-6,-13],[0,-13],[6,-13],[12,-13],[0,-7],[0,-1],[0,5],[0,11]];
    for (const [lx, ly] of letterPixels) {
      for (let yy = -3; yy <= 3; yy++) {
        for (let xx = -3; xx <= 3; xx++) {
          const px = Math.round(cx + lx + xx);
          const py = Math.round(cy + ly + yy);
          if (px >= 0 && py >= 0 && px < width && py < height) data[py * width + px] = 5;
        }
      }
    }
  }

  return data;
}

function gifBuffer(side) {
  const width = 160;
  const height = 120;
  const steps = 12;
  const out = [];
  for (const c of 'GIF89a') out.push(c.charCodeAt(0));
  putShort(out, width);
  putShort(out, height);
  out.push(0xf7, 0, 0);

  const palette = [
    [0, 0, 0], [31, 31, 39], [255, 215, 0], [154, 101, 0],
    [255, 247, 173], [248, 250, 252], [35, 224, 120]
  ];
  while (palette.length < 256) palette.push([0, 0, 0]);
  for (const [r, g, b] of palette) out.push(r, g, b);

  out.push(0x21, 0xff, 0x0b);
  for (const c of 'NETSCAPE2.0') out.push(c.charCodeAt(0));
  out.push(0x03, 0x01, 0x00, 0x00, 0x00);

  for (let i = 0; i < steps; i++) {
    const frame = makeFrame(width, height, side, i, steps);
    out.push(0x21, 0xf9, 0x04, 0x00);
    putShort(out, i === steps - 1 ? 60 : 6);
    out.push(0x00, 0x00);
    out.push(0x2c);
    putShort(out, 0); putShort(out, 0); putShort(out, width); putShort(out, height);
    out.push(0x00, 0x08);
    const encoded = lzwEncode(frame, 8);
    for (let p = 0; p < encoded.length; p += 255) {
      const block = encoded.slice(p, p + 255);
      out.push(block.length, ...block);
    }
    out.push(0x00);
  }
  out.push(0x3b);
  return Buffer.from(out);
}

module.exports = {
  heads: () => gifBuffer('heads'),
  tails: () => gifBuffer('tails')
};
