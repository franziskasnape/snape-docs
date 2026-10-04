#!/usr/bin/env node
/**
 * Install the studio's fonts (Synonym, Amulya) into public/fonts/.
 *
 *   npm run fonts -- "/path/to/folder/that/contains/the/downloaded/fonts"
 *
 * The fonts are NOT part of this repository: their licence (Fontshare EULA) forbids uploading them to a public
 * server. Download them free from https://www.fontshare.com (Synonym, Amulya) and point this script at the folder;
 * it searches it recursively for the .otf files it needs.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const WANT = {                      // file in the download            -> name used by public/house.css
  'Synonym-Regular.otf': 'Synonym-400.otf', 'Synonym-Semibold.otf': 'Synonym-600.otf', 'Synonym-Bold.otf': 'Synonym-700.otf',
  'Amulya-Regular.otf': 'Amulya-400.otf', 'Amulya-Bold.otf': 'Amulya-600.otf',
};
const src = process.argv[2];
if (!src) { console.error('usage: npm run fonts -- <folder containing the downloaded Synonym and Amulya fonts>'); process.exit(1); }

const found = {};
(function walk(dir, depth = 0) {
  if (depth > 6 || !existsSync(dir)) return;
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) { if (n !== 'node_modules' && !n.startsWith('.')) walk(p, depth + 1); }
    else if (WANT[n] && !found[n]) found[n] = p;
  }
})(resolve(src.replace(/^~/, homedir())));

mkdirSync(join(ROOT, 'public/fonts'), { recursive: true });
let missing = 0;
for (const [from, to] of Object.entries(WANT)) {
  if (found[from]) { copyFileSync(found[from], join(ROOT, 'public/fonts', to)); console.log(`ok       ${to}  (from ${found[from]})`); }
  else { console.log(`MISSING  ${from}`); missing++; }
}
if (missing) { console.error(`\n${missing} font file(s) not found under ${src}. Documents will fall back to a plain sans-serif until they are installed.`); process.exit(1); }
console.log('\nFonts installed. They stay on this computer (public/fonts/ is git-ignored).');
