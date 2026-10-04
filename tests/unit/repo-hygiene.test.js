/** Guards for the PUBLIC repository: runs against what git actually tracks. */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../..');
const sh = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' });
const tracked = () => sh('ls-files').split('\n').filter(Boolean);
const termsFile = resolve(ROOT, '.git/sensitive-terms.txt');
const terms = existsSync(termsFile) ? readFileSync(termsFile, 'utf8').split('\n').map((s) => s.trim()).filter((s) => s && !s.startsWith('#')) : [];

describe('public repository hygiene', () => {
  it('tracks no images (except the studio seal), documents, fonts, databases or exports', () => {
    const bad = tracked().filter((f) => /\.(jpe?g|heic|tiff?|gif|webp|pdf|otf|ttf|woff2?|sqlite3?|db|xlsx?|docx?|numbers|pages|indd|psd|bundle|png)$/i.test(f) && f !== 'public/seal.png');
    expect(bad).toEqual([]);
    expect(tracked().filter((f) => /\.sql$/.test(f) && !/^migrations\/[^/]+\.sql$/.test(f))).toEqual([]);
  });
  it('tracks no private working folders, environment files or the vendored third-party script', () => {
    expect(tracked().filter((f) => /^(seed|\.wrangler|node_modules)\//.test(f) || /(^|\/)\.(env|dev\.vars|backup-dir)/.test(f) || f === 'public/paged.polyfill.js')).toEqual([]);
  });
  it.skipIf(!terms.length)('mentions none of the private terms in .git/sensitive-terms.txt (client, artist and piece names)', () => {
    const hits = tracked().filter((f) => f !== 'package-lock.json').flatMap((f) => {
      const text = readFileSync(resolve(ROOT, f), 'utf8').toLowerCase();
      return terms.filter((t) => text.includes(t.toLowerCase())).map((t) => `${f}: "${t}"`);
    });
    expect(hits).toEqual([]);
  });
  it('ignores what must never be committed', () => {
    const ignore = readFileSync(resolve(ROOT, '.gitignore'), 'utf8');
    for (const rule of ['.wrangler/', 'seed/', '.backup-dir', 'public/fonts/*.otf', 'public/paged.polyfill.js', '*.jpg', '*.pdf', '*.sql', '!migrations/*.sql', '!public/seal.png']) expect(ignore).toContain(rule);
  });
  it('ships a generic starter snippet library with both languages and no piece-specific wording', () => {
    const seed = JSON.parse(readFileSync(resolve(ROOT, 'scripts/snippets-seed.json'), 'utf8'));
    expect(seed.length).toBeGreaterThan(5);
    for (const s of seed) { expect(s.kind).toBe('measure'); expect(s.de.title && s.de.desc && s.en.title && s.en.desc).toBeTruthy(); }
    const text = JSON.stringify(seed);
    expect(text).not.toMatch(/insekt|insect|lack\b|lacquer|kratz|scratch|tropf|klebe|impasto|pastos|vergoldet/i);
    for (const t of terms) expect(text.toLowerCase()).not.toContain(t.toLowerCase());
  });
  it('documents every npm script a newcomer needs', () => {
    const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'));
    for (const s of ['dev', 'test', 'test:layout', 'typecheck', 'backup', 'restore', 'fonts', 'db:migrate', 'postinstall']) expect(pkg.scripts[s], s).toBeTruthy();
  });
});
