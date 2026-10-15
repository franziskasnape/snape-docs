// Restoring a snapshot taken BEFORE a later database change must give a database with the new structure, and keep the data.
// The snapshot is built here from the real migration files 0001 and 0002 (the structure before the revision column existed).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterAll, describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../..');
const has = (bin) => { try { execFileSync(bin, ['--version'], { stdio: 'ignore' }); return true; } catch { return false; } };
const ready = existsSync(join(ROOT, 'node_modules/.bin/wrangler')) && has('sqlite3');
if (!ready) console.warn('Restore tests skipped: need wrangler (npm install) and the sqlite3 command.');
const d = ready ? describe : describe.skip;

const tmp = mkdtempSync(join(tmpdir(), 'snape-restore-test-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const sqliteFiles = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? sqliteFiles(join(dir, e.name)) : e.name.endsWith('.sqlite') && !e.name.includes('metadata') ? [join(dir, e.name)] : []));
const q = (file, sql) => execFileSync('sqlite3', [file, sql], { encoding: 'utf8' }).trim();

function oldSnapshot(dest, name) {
  const mig = (f) => readFileSync(join(ROOT, 'migrations', f), 'utf8');
  const sql = [
    'CREATE TABLE IF NOT EXISTS "d1_migrations"(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP);',
    mig('0001_init.sql'), mig('0002_version_kind.sql'),
    `INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(1,'0001_init.sql','2026-10-04 15:30:57');`,
    `INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(2,'0002_version_kind.sql','2026-10-04 17:03:48');`,
    `INSERT INTO documents (type, number, lang, status, title, data) VALUES ('offer','ANG-2000-001','de','draft','Old snapshot offer (invented)','{"v":2,"meta":{"date":"2026-10-04","validUntil":""},"blocks":[],"cost":{"materials":false},"rate":100}');`,
  ].join('\n');
  const snap = join(dest, 'snapshots', name);
  mkdirSync(join(snap, 'r2-index'), { recursive: true }); mkdirSync(join(dest, 'photos'), { recursive: true });
  writeFileSync(join(snap, 'database.sql.gz'), gzipSync(sql));
  writeFileSync(join(snap, 'manifest.json'), JSON.stringify({ documents: 1, photos: 0, createdAt: '2026-10-04T17:03:48.000Z' }));
}

d('restore', () => {
  it('a snapshot from before the revision column is brought up to date and keeps its documents', () => {
    const dest = join(tmp, 'backups'), state = join(tmp, 'state');
    oldSnapshot(dest, '2026-10-04_170348');
    execFileSync('node', [join(ROOT, 'scripts/restore.mjs'), '2026-10-04_170348', '--dest', dest, '--state', state, '--force'], { cwd: ROOT, stdio: 'pipe' });
    const [db] = sqliteFiles(state);
    expect(db, 'the restored database file').toBeTruthy();
    expect(q(db, "select count(*) from pragma_table_info('documents') where name='rev'")).toBe('1');                     // migration 0003 applied
    expect(q(db, 'select group_concat(name) from d1_migrations order by id')).toMatch(/0003_revision\.sql/);
    expect(q(db, "select title || ' / rev ' || rev from documents where number='ANG-2000-001'")).toBe('Old snapshot offer (invented) / rev 0');
    expect(JSON.parse(q(db, "select data from documents where number='ANG-2000-001'")).rate).toBe(100);
  });

  it('restoring never deletes what was there: the current data is moved aside', () => {
    const dest = join(tmp, 'backups2'), state = join(tmp, 'state2');
    oldSnapshot(dest, '2026-10-04_170348');
    mkdirSync(state, { recursive: true }); writeFileSync(join(state, 'marker.txt'), 'existing data');
    execFileSync('node', [join(ROOT, 'scripts/restore.mjs'), 'latest', '--dest', dest, '--state', state, '--force'], { cwd: ROOT, stdio: 'pipe' });
    const aside = readdirSync(tmp).find((n) => n.startsWith('state2.before-restore-'));
    expect(aside).toBeTruthy();
    expect(readFileSync(join(tmp, aside, 'marker.txt'), 'utf8')).toBe('existing data');
  });
});
