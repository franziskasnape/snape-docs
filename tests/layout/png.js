// Tiny dependency-free PNG generator for test photos (solid-ish gradients, invented, small).
import { deflateSync, crc32 } from 'node:zlib';

export function png(w, h, seed = 1) {
  const rows = [];
  for (let y = 0; y < h; y++) {
    const row = Buffer.alloc(1 + w * 3);
    for (let x = 0; x < w; x++) {
      const u = x / w, v = y / h, o = 1 + x * 3;
      row[o] = 60 + Math.abs(Math.sin(u * 5 + seed)) * 150;
      row[o + 1] = 50 + Math.abs(Math.cos(v * 4 + seed * 2)) * 140;
      row[o + 2] = 90 + u * 120;
    }
    rows.push(row);
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}

export const dataUri = (buf) => `data:image/png;base64,${buf.toString('base64')}`;
