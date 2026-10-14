#!/usr/bin/env node
// One-off helper: read an object-list PDF (the studio's earlier "Ersteinschätzung" layout: A4 landscape, one table row per object with
// photo | No. | title | technique | size | assessment | hours) into JSON + JPEG photos for the "Object list" block.
//
//   node scripts/import-object-pdf.mjs <file.pdf> [outDir]        (default outDir: seed/object-list/)
//
// Writes  <outDir>/objects.json   the finished `objects` block (rows have `image: "001.jpg"` instead of an image id)
//         <outDir>/text.txt       every other line of text (intro, closing sections) with its page, position and size, to copy by hand
//         <outDir>/images/*.jpg   the photos, as embedded in the PDF
// Everything is written under seed/ (git-ignored): the PDF holds client data, so neither it nor its text belongs in the repository.
// Photos are converted with macOS `sips` to at most 900 px (they print about 20 mm wide).
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { deflateSync, crc32 } from 'node:zlib';
import { join, resolve } from 'node:path';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

const [pdfPath, outArg] = process.argv.slice(2);
if (!pdfPath) { console.error('usage: node scripts/import-object-pdf.mjs <file.pdf> [outDir]'); process.exit(1); }
const out = resolve(outArg ?? 'seed/object-list');
mkdirSync(join(out, 'images'), { recursive: true });

// column boundaries by x position (PDF points; the table starts at the object number)
const COL = [['no', 105, 150], ['title', 150, 300], ['technique', 300, 425], ['size', 425, 510], ['text', 510, 950], ['hours', 950, 2000]];
const HEADER = /^(Bild|Obj\.-Nr\.|Bezeichnung \/ Motiv|Technik \/ Träger|Masse gerahmt|\(H × B\)|Erste Einschätzung|Geschätzter|Zeitaufwand)$/;

const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];

function png(w, h, data, channels) {
  const rows = [];
  for (let y = 0; y < h; y++) { const r = Buffer.alloc(1 + w * channels); r.set(data.subarray(y * w * channels, (y + 1) * w * channels), 1); rows.push(r); }
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td) >>> 0); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = channels === 4 ? 6 : channels === 3 ? 2 : 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}

const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(pdfPath)), useSystemFonts: true }).promise;
const rows = [], textLines = [];
let imageNo = 0;

for (let pn = 1; pn <= doc.numPages; pn++) {
  const page = await doc.getPage(pn);
  // photos with their position on the page
  const ops = await page.getOperatorList(), OPS = pdfjs.OPS;
  let ctm = [1, 0, 0, 1, 0, 0]; const stack = [], imgs = [];
  for (let k = 0; k < ops.fnArray.length; k++) {
    const fn = ops.fnArray[k], a = ops.argsArray[k];
    if (fn === OPS.save) stack.push(ctm);
    else if (fn === OPS.restore) ctm = stack.pop() ?? ctm;
    else if (fn === OPS.transform) ctm = mul(a, ctm);
    else if (fn === OPS.paintImageXObject) imgs.push({ name: a[0], top: ctm[5] + ctm[3], bottom: ctm[5], x: ctm[4] });
  }
  imgs.sort((p, q) => q.top - p.top);
  const text = (await page.getTextContent()).items.filter((i) => i.str.trim()).map((i) => ({ s: i.str.trim(), x: i.transform[4], y: i.transform[5], size: Math.round(i.transform[0] * 10) / 10 }));
  const nums = text.filter((t) => /^\d{3}$/.test(t.s) && t.x >= COL[0][1] && t.x < COL[0][2]).sort((p, q) => q.y - p.y);
  if (nums.length !== imgs.length) throw new Error(`page ${pn}: ${nums.length} object numbers but ${imgs.length} photos; this PDF does not have one photo per row`);

  const band = (i) => [i + 1 < imgs.length ? (imgs[i].bottom + imgs[i + 1].top) / 2 : -Infinity, i > 0 ? (imgs[i - 1].bottom + imgs[i].top) / 2 : Infinity];
  const headerY = Math.min(...text.filter((t) => HEADER.test(t.s)).map((t) => t.y), Infinity) - 1;   // anything at or above the table header is not a row cell
  const used = new Set();
  for (let i = 0; i < nums.length; i++) {
    const [lo, hi] = band(i), cells = Object.fromEntries(COL.map(([c]) => [c, []]));
    text.forEach((t, ix) => {
      if (HEADER.test(t.s) || t.y <= lo || t.y > hi || t.y >= headerY) return;
      const col = COL.find(([, a, b]) => t.x >= a && t.x < b); if (!col) return;
      cells[col[0]].push(t); used.add(ix);
    });
    const cell = (c) => cells[c].sort((p, q) => q.y - p.y).map((t) => t.s).join(' ').replace(/\s+/g, ' ').trim();
    const m = /ca\.\s*([\d.,]+)\s*(?:[–-]\s*([\d.,]+))?\s*h/.exec(cell('hours'));
    if (!m) throw new Error(`page ${pn}, object ${nums[i].s}: no hours found (“${cell('hours')}”)`);
    // the photo
    const obj = await new Promise((res) => page.objs.get(imgs[i].name, res));
    const { width: w, height: h, data, kind } = obj;
    const ch = kind === 3 ? 4 : kind === 2 ? 3 : 1;
    if (!data) throw new Error(`page ${pn}: photo ${imgs[i].name} has no pixel data`);
    const file = `${nums[i].s}`; const tmp = join(out, `${file}.png`);
    writeFileSync(tmp, png(w, h, data, ch));
    execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '80', '-Z', '900', tmp, '--out', join(out, 'images', `${file}.jpg`)], { stdio: 'ignore' });
    rmSync(tmp); imageNo++;
    const size = cell('size');
    rows.push({ no: nums[i].s, title: cell('title'), technique: cell('technique'), size: size === '?' ? '' : size, text: cell('text'),
      hoursMin: Number(m[1].replace(',', '.')), ...(m[2] ? { hoursMax: Number(m[2].replace(',', '.')) } : {}), image: `${file}.jpg` });
  }
  // everything else (intro, closing sections, headings), top to bottom
  text.forEach((t, ix) => { if (!used.has(ix) && !HEADER.test(t.s)) textLines.push({ page: pn, ...t }); });
}

// the assessment text most rows share becomes the block's shared text; only different ones stay on their rows
const freq = new Map(); for (const r of rows) freq.set(r.text, (freq.get(r.text) ?? 0) + 1);
const [defaultText] = [...freq.entries()].sort((a, b) => b[1] - a[1])[0] ?? [''];
for (const r of rows) if (r.text === defaultText) delete r.text;
writeFileSync(join(out, 'objects.json'), JSON.stringify({ type: 'objects', defaultText, rows }, null, 2));
writeFileSync(join(out, 'text.txt'), textLines.sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x).map((t) => `p${t.page} y=${Math.round(t.y)} x=${Math.round(t.x)} ${t.size}pt  ${t.s}`).join('\n') + '\n');
console.log(`${rows.length} objects, ${imageNo} photos, ${rows.filter((r) => r.text).length} with their own text -> ${out}`);
