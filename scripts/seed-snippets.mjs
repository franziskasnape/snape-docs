#!/usr/bin/env node
// Upsert the starter snippet library into the running local app (npm run dev must be running).
// Usage: node scripts/seed-snippets.mjs [http://localhost:8787]
import { existsSync, readFileSync } from 'node:fs';
const base = process.argv[2] ?? 'http://localhost:8787';
// The repository ships a generic starter library. If you keep your own full library in seed/snippets-seed.private.json
// (git-ignored; may contain wording taken from real jobs), that one is used instead.
const privateFile = new URL('../seed/snippets-seed.private.json', import.meta.url);
const items = JSON.parse(readFileSync(existsSync(privateFile) ? privateFile : new URL('./snippets-seed.json', import.meta.url), 'utf8'));
console.log(existsSync(privateFile) ? 'Using the private library in seed/' : 'Using the generic starter library');
for (const s of items) {
  const r = await fetch(`${base}/api/snippets`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(s) });
  console.log(r.status, s.kind, s.key);
}
