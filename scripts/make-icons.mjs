// Bağımlılıksız PNG simge üretici: `npm run icons`
// Marka rengini/ilerleme halkasını değiştirmek için aşağıdaki sabitleri düzenleyin.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const BG = [0x5a, 0x4b, 0xcf];
const FG = [255, 255, 255];
const PROGRESS = 0.72;

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

function png(size) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  const c = size / 2;
  const R = size * 0.3;
  const half = size * 0.05;
  const cap = (px, py) => Math.max(0, Math.min(1, half - Math.hypot(px - capX, py - capY) + 0.5));
  // Halkanın ilerleme ucundaki yuvarlak başlık ve başlangıç noktası
  const ang = (a) => [c + R * Math.sin(a), c - R * Math.cos(a)];
  const [sx, sy] = ang(0);
  const [ex, ey] = ang(PROGRESS * 2 * Math.PI);
  let capX = sx, capY = sy;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - c, dy = y + 0.5 - c;
      const r = Math.hypot(dx, dy);
      const ring = Math.max(0, Math.min(1, half - Math.abs(r - R) + 0.5));
      let theta = Math.atan2(dx, -dy);
      if (theta < 0) theta += 2 * Math.PI;
      const filled = theta <= PROGRESS * 2 * Math.PI;
      capX = sx; capY = sy;
      const c1 = cap(x + 0.5, y + 0.5);
      capX = ex; capY = ey;
      const c2 = cap(x + 0.5, y + 0.5);
      const fg = Math.max(filled ? ring : ring * 0.3, c1, c2);
      const o = y * (size * 3 + 1) + 1 + x * 3;
      for (let k = 0; k < 3; k++) raw[o + k] = Math.round(BG[k] * (1 - fg) + FG[k] * fg);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync('public', { recursive: true });
for (const [name, size] of [['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512]]) {
  writeFileSync(`public/${name}`, png(size));
  console.log('yazıldı: public/' + name);
}
