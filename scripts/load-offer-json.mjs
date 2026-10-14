#!/usr/bin/env node
// Create a new offer in the RUNNING local app (http://localhost:8787) from a JSON file, uploading its photos.
//
//   node scripts/load-offer-json.mjs <offer.json> [imagesDir] [baseUrl]
//
// offer.json: { "lang": "de", "artwork": [{k, v}], "title"?: "...", "data": { …OfferData… } }
// Rows of an `objects` block may carry `"image": "001.jpg"` (a file in imagesDir); it is uploaded and replaced by `imageId`.
// The file holds client data: keep it under seed/ (git-ignored), never in the repository.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const [file, imagesArg, baseArg] = process.argv.slice(2);
if (!file) { console.error('usage: node scripts/load-offer-json.mjs <offer.json> [imagesDir] [baseUrl]'); process.exit(1); }
const base = baseArg ?? 'http://localhost:8787';
const imagesDir = resolve(imagesArg ?? join(dirname(file), 'images'));
const offer = JSON.parse(readFileSync(file, 'utf8'));
const call = async (path, method, body, headers = { 'content-type': 'application/json' }) => {
  const r = await fetch(base + path, { method, headers, body });
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${await r.text()}`);
  return r.json();
};

const created = await call('/api/documents', 'POST', JSON.stringify({ type: 'offer', lang: offer.lang ?? 'de' }));
const dims = (f) => { const o = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', f]).toString(); return [/pixelWidth: (\d+)/.exec(o)[1], /pixelHeight: (\d+)/.exec(o)[1]]; };
let n = 0;
for (const b of offer.data.blocks) for (const r of b.rows ?? []) {
  if (!r.image) continue;
  const f = join(imagesDir, r.image), [w, h] = dims(f);
  r.imageId = (await call(`/api/images?documentId=${created.id}&w=${w}&h=${h}`, 'POST', readFileSync(f), { 'content-type': 'image/jpeg' })).id;
  delete r.image; n++;
}
const doc = await call(`/api/documents/${created.id}`, 'GET');
const data = { ...doc.data, ...offer.data, meta: { ...doc.data.meta, ...offer.data.meta }, cost: { ...doc.data.cost, ...offer.data.cost } };
for (const b of data.blocks) b.id ??= Math.random().toString(16).slice(2, 10);
await call(`/api/documents/${created.id}`, 'PUT', JSON.stringify({ data, ...(offer.artwork ? { artwork: offer.artwork } : {}), ...(offer.title ? { title: offer.title } : {}) }));
console.log(`created ${created.number} (id ${created.id}) with ${n} photos: ${base}/edit.html?id=${created.id}`);
