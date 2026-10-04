#!/usr/bin/env node
/**
 * Restore the LOCAL database and photos from a backup made by scripts/backup.mjs.
 *
 *   node scripts/restore.mjs latest
 *   node scripts/restore.mjs 2026-10-04_175332
 *   node scripts/restore.mjs /full/path/to/snapshots/2026-10-04_175332
 *
 * Options: --dest <backup folder>   where the backups are (same rules as backup.mjs)
 *          --state <dir>            restore into another state folder (for testing); default .wrangler/state
 *          --force                  restore even if the dev server seems to be running
 *
 * The current data is NOT deleted: it is moved to .wrangler/state.before-restore-<time> so a restore can be undone.
 * Stop the dev server first (Ctrl+C).
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveDest } from './backup.mjs';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const BUCKET = 'snape-docs-images';
const args = process.argv.slice(2);
const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const which = args.find((a, i) => !a.startsWith('--') && !['--dest', '--state'].includes(args[i - 1]));
if (!which) { console.error('usage: node scripts/restore.mjs <latest | snapshot-name | path> [--dest dir] [--state dir] [--force]'); process.exit(1); }

const dest = resolveDest(opt('--dest'));
const stateDir = resolve(opt('--state') ?? join(ROOT, '.wrangler/state'));
const snapRoot = join(dest, 'snapshots');
let snap = which.includes('/') ? resolve(which) : which === 'latest'
  ? join(snapRoot, readdirSync(snapRoot).filter((n) => /^\d{4}-/.test(n)).sort().at(-1) ?? '')
  : join(snapRoot, which);
if (!existsSync(join(snap, 'database.sql.gz'))) { console.error(`Not a snapshot: ${snap}`); process.exit(1); }

if (!args.includes('--force')) {
  try { execFileSync('pgrep', ['-f', 'wrangler dev'], { stdio: 'ignore' }); console.error('The dev server seems to be running. Stop it (Ctrl+C) first, or pass --force.'); process.exit(1); } catch { /* not running */ }
}

const manifest = JSON.parse(readFileSync(join(snap, 'manifest.json'), 'utf8'));
console.log(`Restoring ${snap}\n  ${manifest.documents} documents, ${manifest.photos} photos (taken ${manifest.createdAt})`);

// keep what is there
if (existsSync(stateDir)) {
  const aside = `${stateDir}.before-restore-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  renameSync(stateDir, aside);
  console.log(`  current data moved to ${aside}`);
}
mkdirSync(stateDir, { recursive: true });

// database
const tmp = mkdtempSync(join(tmpdir(), 'snape-restore-'));
try {
  writeFileSync(join(tmp, 'db.sql'), gunzipSync(readFileSync(join(snap, 'database.sql.gz'))));
  execFileSync('npx', ['wrangler', 'd1', 'execute', 'DB', '--local', '--persist-to', stateDir, '--file', join(tmp, 'db.sql')], { cwd: ROOT, stdio: 'ignore' });
} finally { rmSync(tmp, { recursive: true, force: true }); }

// photos: the index (which photo is which) from the snapshot, the files from the shared mirror
const r2 = join(stateDir, 'v3/r2');
mkdirSync(join(r2, BUCKET, 'blobs'), { recursive: true });
cpSync(join(snap, 'r2-index'), join(r2, 'miniflare-R2BucketObject'), { recursive: true });
execFileSync('rsync', ['-rt', join(dest, 'photos') + '/', join(r2, BUCKET, 'blobs') + '/']);

console.log('Restored. Start the app with: npm run dev');
