/** The pre-push guard, exercised against throwaway git repositories (nothing real is touched). */
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const GUARD = resolve(import.meta.dirname, '../../scripts/pre-push-guard.sh');
const git = (cwd, ...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', ...a], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
let root, work, bare;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'guard-'));
  bare = join(root, 'remote.git'); work = join(root, 'work');
  mkdirSync(bare); git(bare, 'init', '-q', '--bare');
  mkdirSync(work); git(work, 'init', '-q'); git(work, 'remote', 'add', 'origin', bare);
  copyFileSync(GUARD, join(work, '.git/hooks/pre-push')); chmodSync(join(work, '.git/hooks/pre-push'), 0o755);
  writeFileSync(join(work, '.git/sensitive-terms.txt'), '# private terms\nMusterkunde GmbH\nVerbotenerKünstler\n');
  writeFileSync(join(work, 'README.md'), 'clean\n'); mkdirSync(join(work, 'migrations')); writeFileSync(join(work, 'migrations/0001.sql'), 'CREATE TABLE t(x);\n');
  mkdirSync(join(work, 'public')); writeFileSync(join(work, 'public/seal.png'), 'png');
  git(work, 'add', '-A'); git(work, 'commit', '-q', '-m', 'clean'); git(work, 'checkout', '-q', '-B', 'main');
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

/** Commit `files` on a fresh branch off main and try to push it. */
function tryPush(files) {
  const branch = `t${Math.random().toString(36).slice(2, 8)}`;
  git(work, 'checkout', '-q', 'main'); git(work, 'checkout', '-q', '-b', branch);
  for (const [path, content] of Object.entries(files)) { mkdirSync(join(work, path, '..'), { recursive: true }); writeFileSync(join(work, path), content); }
  git(work, 'add', '-f', '-A'); git(work, 'commit', '-q', '-m', 'change');
  const r = spawnSync('git', ['push', 'origin', branch], { cwd: work, encoding: 'utf8' });
  return { ok: r.status === 0, out: r.stdout + r.stderr };
}

describe('pre-push guard', () => {
  it('lets clean code through, including SQL migrations and the studio seal', () => {
    expect(tryPush({ 'src/a.ts': 'export const a = 1;\n', 'migrations/0002.sql': 'ALTER TABLE t ADD y;\n', 'public/seal.png': 'png2' }).ok).toBe(true);
  });
  it.each([
    ['a photo', { 'photo.jpg': 'x' }], ['a PDF', { 'offer.pdf': 'x' }], ['a font', { 'public/fonts/A.otf': 'x' }],
    ['another image', { 'public/art.png': 'x' }], ['a database dump', { 'dump.sql': 'INSERT' }], ['a SQL file outside migrations', { 'scripts/export.sql': 'x' }],
    ['a spreadsheet', { 'clients.xlsx': 'x' }], ['a sqlite file', { 'local.sqlite': 'x' }],
  ])('blocks %s', (_, files) => {
    const r = tryPush(files);
    expect(r.ok).toBe(false); expect(r.out).toContain('BLOCKED');
  });
  it('blocks a private term, case-insensitively, in any file', () => {
    const r = tryPush({ 'docs/notes.md': 'Offer for musterkunde gmbh\n' });
    expect(r.ok).toBe(false); expect(r.out).toContain('docs/notes.md');
  });
  it('blocks a private term hidden in an older commit of the pushed branch, even if removed again', () => {
    const branch = 'hidden'; git(work, 'checkout', '-q', 'main'); git(work, 'checkout', '-q', '-b', branch);
    writeFileSync(join(work, 'oops.txt'), 'VerbotenerKünstler\n'); git(work, 'add', '-A'); git(work, 'commit', '-q', '-m', 'oops');
    git(work, 'rm', '-q', 'oops.txt'); git(work, 'commit', '-q', '-m', 'removed again');
    expect(spawnSync('git', ['push', 'origin', branch], { cwd: work, encoding: 'utf8' }).status).not.toBe(0);
  });
});
