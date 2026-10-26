// Draws the Sakinah app icons (khatam star, Sun Glare on Darkest Hour) as PNGs — no dependencies.
// Output: docs/assets/icons/*.png      Run: node tools/make-icons.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = path.join(__dirname, '..', 'docs', 'assets', 'icons');
const LIME = [0xdf, 0xff, 0x00];
const BG_CENTER = [0x2b, 0x2f, 0x45];
const BG_EDGE = [0x1e, 0x1e, 0x1e];

// Signed distance to a rounded square centred at the origin (half-size h, corner radius r).
function roundedBox(x, y, h, r) {
  const qx = Math.abs(x) - (h - r);
  const qy = Math.abs(y) - (h - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

// Coverage of the star outline at a point, in a 48×48 design space centred on (24, 24).
function starHit(x, y, scale) {
  const dx = x - 24;
  const dy = y - 24;
  const h = 11 * scale;
  const half = (2.4 * Math.sqrt(scale)) / 2;
  const rx = (dx + dy) / Math.SQRT2;
  const ry = (dy - dx) / Math.SQRT2;
  return (
    Math.abs(roundedBox(dx, dy, h, 1.5)) <= half ||
    Math.abs(roundedBox(rx, ry, h, 1.5)) <= half ||
    Math.abs(Math.hypot(dx, dy) - 5 * scale) <= half
  );
}

function render(size, scale) {
  const SS = 4; // supersampling per axis for smooth edges
  const px = Buffer.alloc(size * (size * 3 + 1));
  for (let j = 0; j < size; j++) {
    px[j * (size * 3 + 1)] = 0; // PNG filter: none
    for (let i = 0; i < size; i++) {
      let hit = 0;
      for (let sy = 0; sy < SS; sy++)
        for (let sx = 0; sx < SS; sx++)
          if (starHit(((i + (sx + 0.5) / SS) / size) * 48, ((j + (sy + 0.5) / SS) / size) * 48, scale)) hit++;
      const a = hit / (SS * SS);
      // Soft radial background, slightly lighter towards the upper centre.
      const t = Math.min(1, Math.hypot(i / size - 0.5, (j / size - 0.35) * 1.1) / 0.75);
      const o = j * (size * 3 + 1) + 1 + i * 3;
      for (let c = 0; c < 3; c++) {
        const bg = BG_CENTER[c] + (BG_EDGE[c] - BG_CENTER[c]) * t;
        px[o + c] = Math.round(bg + (LIME[c] - bg) * a);
      }
    }
  }
  return png(size, size, px);
}

function png(w, h, raw) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

fs.mkdirSync(OUT, { recursive: true });
const icons = {
  'apple-touch-icon.png': [180, 1.05], // iOS rounds the corners itself
  'icon-192.png': [192, 1.05],
  'icon-512.png': [512, 1.05],
  'icon-maskable-512.png': [512, 0.78], // star kept inside Android's safe zone
};
for (const [name, [size, scale]] of Object.entries(icons)) {
  fs.writeFileSync(path.join(OUT, name), render(size, scale));
  console.log(`  ${name.padEnd(24)} ${size}×${size}  ${(fs.statSync(path.join(OUT, name)).size / 1024).toFixed(1)} KB`);
}
