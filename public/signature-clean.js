/**
 * Prepares an uploaded signature picture for printing (runs in the browser on upload; also testable in Node).
 *
 *   cleanSignature({ data, width, height })  ->  { data, width, height, baseline }
 *
 * - paper becomes transparent and the ink becomes clean black (soft edges are kept), so a photo or scan of a signature
 *   on white paper works on any background
 * - a long horizontal baseline in the picture (the line a signature "stands on") is removed, except where strokes cross it:
 *   the printed form already has its own line
 * - the picture is cropped to the ink
 * - `baseline` = how far the strokes reach BELOW that removed line, as a fraction of the cropped height (or null if the
 *   picture had no line). The offer uses it to place the signature so it sits on the form's line the same way.
 * `data` is RGBA like ImageData.data.
 */
(function (root) {
  function cleanSignature(img) {
    const { width: w, height: h } = img, src = img.data;
    const lum = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) { const a = src[i * 4 + 3] / 255; lum[i] = a < 0.5 ? 255 : 0.299 * src[i * 4] + 0.587 * src[i * 4 + 1] + 0.114 * src[i * 4 + 2]; }
    const sorted = Float32Array.from(lum).sort();
    const paper = sorted[Math.floor(sorted.length * 0.95)] || 255, inkLevel = sorted[Math.floor(sorted.length * 0.02)] || 0;
    const range = Math.max(40, paper - inkLevel);
    const dark = (x, y) => x >= 0 && x < w && y >= 0 && y < h && lum[y * w + x] < paper - range * 0.45;

    // 1) find the baseline: the lowest band of rows that is dark across most of the width
    const rowDark = new Int32Array(h);
    for (let y = 0; y < h; y++) { let n = 0; for (let x = 0; x < w; x++) if (dark(x, y)) n++; rowDark[y] = n; }
    let band = null;
    for (let y = h - 1; y >= 0; y--) {
      if (rowDark[y] >= w * 0.7) { let top = y; while (top > 0 && rowDark[top - 1] >= w * 0.7) top--; if (y - top + 1 <= Math.max(4, h * 0.08)) band = { top, bottom: y }; break; }
    }

    // 2) clear the line, keep pixels where a stroke passes through it
    const keepAt = new Uint8Array(w * h);
    if (band) {
      const reach = 3;
      for (let y = band.top; y <= band.bottom; y++) for (let x = 0; x < w; x++) {
        let above = false, below = false;
        for (let dx = -1; dx <= 1 && !(above && below); dx++) for (let k = 1; k <= reach; k++) { if (dark(x + dx, band.top - k)) above = true; if (dark(x + dx, band.bottom + k)) below = true; }
        keepAt[y * w + x] = above && below ? 1 : 0;
      }
    }

    // 3) ink alpha from darkness; crop to the ink
    const out = new Uint8ClampedArray(w * h * 4);
    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const inLine = band && y >= band.top && y <= band.bottom && !keepAt[y * w + x];
      let a = inLine ? 0 : Math.round(Math.min(1, Math.max(0, (paper - lum[y * w + x]) / (paper - inkLevel))) * 255);
      if (a < 24) a = 0;
      const i = (y * w + x) * 4; out[i] = 10; out[i + 1] = 10; out[i + 2] = 10; out[i + 3] = a;
      if (a > 40) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    }
    if (maxX < 0) return { data: out, width: w, height: h, baseline: null };           // nothing but paper
    const pad = 3; minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad); maxX = Math.min(w - 1, maxX + pad); maxY = Math.min(h - 1, maxY + pad);
    const cw = maxX - minX + 1, ch = maxY - minY + 1, cropped = new Uint8ClampedArray(cw * ch * 4);
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) { const s = ((y + minY) * w + (x + minX)) * 4, d = (y * cw + x) * 4; cropped[d] = out[s]; cropped[d + 1] = out[s + 1]; cropped[d + 2] = out[s + 2]; cropped[d + 3] = out[s + 3]; }
    let baseline = null;
    if (band) { const lineY = (band.top + band.bottom) / 2 - minY; baseline = Math.min(0.4, Math.max(0, (ch - lineY) / ch)); }
    return { data: cropped, width: cw, height: ch, baseline };
  }
  root.cleanSignature = cleanSignature;
  if (typeof module !== 'undefined' && module.exports) module.exports = { cleanSignature };
})(typeof window !== 'undefined' ? window : globalThis);
