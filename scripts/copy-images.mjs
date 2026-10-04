#!/usr/bin/env node
// Copy every image referenced in the LOCAL database from the local R2 store to another R2 store.
// Used when moving to Cloudflare (see docs/DEPLOY.md).
//
//   node scripts/copy-images.mjs --remote                 local -> your real Cloudflare bucket
//   node scripts/copy-images.mjs --persist-to ./some-dir  local -> another local store (for testing)
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const remote = args.includes('--remote');
const persist = args.includes('--persist-to') ? args[args.indexOf('--persist-to') + 1] : null;
if (!remote && !persist) { console.error('Pass --remote (real bucket) or --persist-to <dir> (test copy).'); process.exit(1); }

const BUCKET = 'snape-docs-images';
const wr = (a) => execFileSync('npx', ['wrangler', ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

const q = JSON.parse(wr(['d1', 'execute', 'DB', '--local', '--json', '--command', 'SELECT DISTINCT r2_key, mime FROM images']));
const rows = q[0].results;
const tmp = mkdtempSync(join(tmpdir(), 'snape-img-'));
let n = 0;
for (const { r2_key, mime } of rows) {
  const file = join(tmp, 'x');
  try {
    wr(['r2', 'object', 'get', `${BUCKET}/${r2_key}`, '--local', '--file', file]);
    wr(['r2', 'object', 'put', `${BUCKET}/${r2_key}`, ...(remote ? ['--remote'] : ['--local', '--persist-to', persist]), '--file', file, '--content-type', mime]);
    console.log(`ok   ${r2_key}`); n++;
  } catch (e) { console.log(`FAIL ${r2_key}: ${String(e.stderr || e.message).split('\n').find((l) => /error/i.test(l)) ?? ''}`); }
}
rmSync(tmp, { recursive: true, force: true });
console.log(`${n}/${rows.length} images copied`);
