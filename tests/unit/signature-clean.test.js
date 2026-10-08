import { describe, expect, it } from 'vitest';
import '../../public/signature-clean.js';                   // a browser script: publishes globalThis.cleanSignature
const { cleanSignature } = globalThis;

// An invented stand-in that looks like a signature photo: white paper, a full-width baseline, and two strokes that cross it.
function fakeSignature({ w = 300, h = 220, withLine = true, lineY = 170, lineThick = 4 } = {}) {
  const data = new Uint8ClampedArray(w * h * 4).fill(255);
  const ink = (x, y) => { if (x < 0 || x >= w || y < 0 || y >= h) return; const i = (y * w + x) * 4; data[i] = data[i + 1] = data[i + 2] = 15; };
  if (withLine) for (let y = lineY; y < lineY + lineThick; y++) for (let x = 0; x < w; x++) ink(x, y);
  const stroke = (x0, y0, x1, y1, t = 5) => { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)); for (let s = 0; s <= n; s++) { const x = Math.round(x0 + ((x1 - x0) * s) / n), y = Math.round(y0 + ((y1 - y0) * s) / n); for (let dx = 0; dx < t; dx++) for (let dy = 0; dy < t; dy++) ink(x + dx, y + dy); } };
  stroke(110, 30, 130, 205);          // a stroke that crosses the line and reaches ~35 px below it
  stroke(150, 40, 175, 200);
  stroke(100, 120, 190, 100);         // a stroke above the line
  return { data, width: w, height: h };
}
const alphaAt = (img, x, y) => img.data[(y * img.width + x) * 4 + 3];

describe('signature cleaning', () => {
  it('makes the paper transparent and the ink black', () => {
    const r = cleanSignature(fakeSignature({ withLine: false }));
    const alphas = [...r.data].filter((_, i) => i % 4 === 3);
    expect(alphas.filter((a) => a === 0).length).toBeGreaterThan(alphas.length * 0.3);       // lots of transparent paper
    expect(alphas.filter((a) => a > 200).length).toBeGreaterThan(100);                       // solid ink
    for (let i = 0; i < r.data.length; i += 4) if (r.data[i + 3] > 0) { expect(r.data[i]).toBeLessThan(40); break; }
  });
  it('crops to the ink', () => {
    const r = cleanSignature(fakeSignature({ withLine: false }));
    expect(r.width).toBeLessThan(110); expect(r.height).toBeLessThan(200);
  });
  it('removes a full-width baseline but keeps the strokes that cross it', () => {
    const src = fakeSignature(), r = cleanSignature(src);
    const crop = { x: 100 - 3, y: 30 - 3 };                                                   // the ink box starts here in the original
    const lineMid = 171 - crop.y;
    expect(alphaAt(r, 2, lineMid)).toBe(0);                                                   // far from any stroke: line is gone
    expect(alphaAt(r, r.width - 3, lineMid)).toBe(0);
    const crossing = [...Array(r.width).keys()].filter((x) => alphaAt(r, x, lineMid) > 100);
    expect(crossing.length).toBeGreaterThanOrEqual(8);                                        // both strokes still pass through the line
    expect(r.width).toBeLessThan(120);                                                        // the line no longer stretches the picture
  });
  it('reports how far the strokes reach below the line (so it can be placed on the form line the same way)', () => {
    const r = cleanSignature(fakeSignature());
    expect(r.baseline).toBeGreaterThan(0.1); expect(r.baseline).toBeLessThan(0.35);           // ~35px below the line of ~190px
    expect(cleanSignature(fakeSignature({ withLine: false })).baseline).toBeNull();
  });
  it('copes with a picture that is only paper', () => {
    const blank = { data: new Uint8ClampedArray(50 * 40 * 4).fill(255), width: 50, height: 40 };
    expect(cleanSignature(blank).baseline).toBeNull();
  });
});
