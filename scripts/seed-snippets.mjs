#!/usr/bin/env node
// Upsert the starter snippet library into the running local app (npm run dev must be running).
// Usage: node scripts/seed-snippets.mjs [http://localhost:8787]
import { readFileSync } from 'node:fs';
const base = process.argv[2] ?? 'http://localhost:8787';
const items = JSON.parse(readFileSync(new URL('./snippets-seed.json', import.meta.url), 'utf8'));
for (const s of items) {
  const r = await fetch(`${base}/api/snippets`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(s) });
  console.log(r.status, s.kind, s.key);
}
