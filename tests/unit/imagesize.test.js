import { describe, expect, it } from 'vitest';
import { imageSize } from '../../src/core/imageSize';
import { png } from '../layout/png.js';

const ab = (buf) => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

describe('image dimensions (used to choose portrait/landscape)', () => {
  it('reads PNG sizes', () => { expect(imageSize(ab(png(120, 80)))).toEqual({ w: 120, h: 80 }); });
  it('reads JPEG sizes, skipping other segments first', () => {
    const jpeg = Buffer.from([0xff, 0xd8,                                  // SOI
      0xff, 0xe0, 0x00, 0x10, ...Array(14).fill(0),                       // APP0, length 16
      0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0x58, 0x03, 0x20, 0x03, ...Array(9).fill(0)]);   // SOF0: height 600, width 800
    expect(imageSize(ab(jpeg))).toEqual({ w: 800, h: 600 });
  });
  it('returns null for anything else', () => { expect(imageSize(ab(Buffer.from('not an image at all')))).toBeNull(); });
});
