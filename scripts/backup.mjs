#!/usr/bin/env node
/**
 * Back up the LOCAL database and photos.
 *
 *   npm run backup                       default destination (see below)
 *   npm run backup -- --dest ~/somewhere
 *   npm run backup -- --force            take a snapshot even if nothing changed
 *   npm run backup -- --quiet            one line of output (used by the scheduler)
 *
 * Destination, first match wins: --dest, $BACKUP_DIR, the path in the git-ignored file `.backup-dir`,
 * ~/git/projects/snape-docs-backups.
 *
 * Layout:
 *   <dest>/photos/                 every photo ever stored, mirrored once (photos never change, so this only grows)
 *   <dest>/snapshots/<timestamp>/  database.sql.gz, r2-index/ (which photo is which), manifest.json
 *
 * Unchanged data is skipped. Old snapshots are thinned out: everything for 14 days, then one per day for 90 days,
 * then one per month. Photos are never deleted from the mirror.
 * Restore with scripts/restore.mjs.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync, mkdtempSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const BUCKET = 'snape-docs-images';

// ---------- retention (exported for tests) ----------
/** Which snapshot folder names to delete. Names look like 2026-10-04_175332. */
export function selectPrune(names, now = new Date()) {
  const parse = (n) => { const m = /^(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})(\d{2})$/.exec(n); return m ? new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : null; };
  const sorted = names.filter((n) => parse(n)).sort().reverse();                    // newest first
  const keep = new Set(sorted.slice(0, 1));                                           // never delete the newest
  const seenDay = new Set(), seenMonth = new Set();
  for (const n of sorted) {                                                           // newest first, so the first per bucket is the latest of it
    const ageDays = (now - parse(n)) / 864e5, day = n.slice(0, 10), month = n.slice(0, 7);
    if (ageDays <= 14) keep.add(n);
    else if (ageDays <= 90) { if (!seenDay.has(day)) { seenDay.add(day); keep.add(n); } }
    else if (!seenMonth.has(month)) { seenMonth.add(month); keep.add(n); }
  }
  return sorted.filter((n) => !keep.has(n));
}

const stamp = (d = new Date()) => { const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; };
const sha = (buf) => createHash('sha256').update(buf).digest('hex');

export function resolveDest(argDest) {
  if (argDest) return resolve(argDest.replace(/^~/, homedir()));
  if (process.env.BACKUP_DIR) return resolve(process.env.BACKUP_DIR.replace(/^~/, homedir()));
  const f = join(ROOT, '.backup-dir');
  if (existsSync(f)) return resolve(readFileSync(f, 'utf8').trim().replace(/^~/, homedir()));
  return join(homedir(), 'git/projects/snape-docs-backups');
}

function main() {
  const args = process.argv.slice(2);
  const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
  const quiet = args.includes('--quiet'), force = args.includes('--force');
  const dest = resolveDest(opt('--dest'));
  const stateDir = resolve(opt('--state') ?? join(ROOT, '.wrangler/state'));
  const r2Dir = join(stateDir, 'v3/r2');
  const say = (...a) => { if (!quiet) console.log(...a); };

  if (!existsSync(r2Dir)) { console.error(`No local data found at ${r2Dir}. Nothing to back up.`); process.exit(1); }
  mkdirSync(join(dest, 'snapshots'), { recursive: true });
  mkdirSync(join(dest, 'photos'), { recursive: true });

  // 1) database dump (deterministic, so identical data gives an identical hash)
  const tmp = mkdtempSync(join(tmpdir(), 'snape-backup-'));
  try {
    execFileSync('npx', ['wrangler', 'd1', 'export', 'DB', '--local', '--output', join(tmp, 'db.sql')], { cwd: ROOT, stdio: 'ignore' });
    const sql = readFileSync(join(tmp, 'db.sql'));

    // 2) photo index: consistent copy of the SQLite files that map photo keys to files (safe while the server runs)
    const idxSrc = join(r2Dir, 'miniflare-R2BucketObject');
    const idxTmp = join(tmp, 'r2-index'); mkdirSync(idxTmp);
    const rows = [];
    for (const f of readdirSync(idxSrc).filter((f) => f.endsWith('.sqlite'))) {
      execFileSync('sqlite3', [join(idxSrc, f), `.backup '${join(idxTmp, f)}'`], { stdio: 'ignore' });
      execFileSync('sqlite3', [join(idxTmp, f), 'PRAGMA journal_mode=DELETE;'], { stdio: 'ignore' });      // single self-contained file
      try { rows.push(execFileSync('sqlite3', [join(idxTmp, f), 'select key || "=" || blob_id from _mf_objects order by key'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })); } catch { /* not the bucket db */ }
    }
    for (const f of readdirSync(idxTmp).filter((f) => !f.endsWith('.sqlite'))) rmSync(join(idxTmp, f), { force: true });   // leftover -shm/-wal side files
    const fingerprint = sha(Buffer.concat([sql, Buffer.from(rows.join('\n'))]));

    // 3) skip if nothing changed since the last snapshot
    const snaps = readdirSync(join(dest, 'snapshots')).filter((n) => /^\d{4}-/.test(n)).sort();
    const last = snaps.at(-1);
    if (last && !force) {
      try {
        if (JSON.parse(readFileSync(join(dest, 'snapshots', last, 'manifest.json'), 'utf8')).fingerprint === fingerprint) {
          console.log(`No changes since ${last} — nothing to do.`); return;
        }
      } catch { /* unreadable manifest: take a new snapshot */ }
    }

    // 4) photos first (so every photo a snapshot refers to exists), then the snapshot itself
    execFileSync('rsync', ['-rt', join(r2Dir, BUCKET, 'blobs') + '/', join(dest, 'photos') + '/']);
    const name = stamp(), snap = join(dest, 'snapshots', name);
    mkdirSync(snap);
    writeFileSync(join(snap, 'database.sql.gz'), gzipSync(sql));
    execFileSync('cp', ['-R', idxTmp, join(snap, 'r2-index')]);
    const count = (t) => (sql.toString().match(new RegExp(`^INSERT INTO "${t}"`, 'gm')) ?? []).length;
    const manifest = { createdAt: new Date().toISOString(), fingerprint, documents: count('documents'), clients: count('clients'), snippets: count('snippets'), photos: rows.join('\n').split('\n').filter(Boolean).length, versions: count('document_versions') };
    writeFileSync(join(snap, 'manifest.json'), JSON.stringify(manifest, null, 2));

    // 5) thin out old snapshots
    const pruned = selectPrune(readdirSync(join(dest, 'snapshots')));
    for (const n of pruned) rmSync(join(dest, 'snapshots', n), { recursive: true, force: true });

    console.log(quiet
      ? `${name}: ${manifest.documents} documents, ${manifest.photos} photos${pruned.length ? `, pruned ${pruned.length}` : ''}`
      : `Backup written to ${snap}\n  ${manifest.documents} documents, ${manifest.clients} clients, ${manifest.snippets} snippets, ${manifest.versions} versions, ${manifest.photos} photos${pruned.length ? `\n  removed ${pruned.length} old snapshot(s)` : ''}\n  photos mirror: ${join(dest, 'photos')}`);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
