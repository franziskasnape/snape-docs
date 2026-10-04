#!/usr/bin/env node
// Install the publish guard as this clone's pre-push hook, and create the private terms list if it does not exist.
//   node scripts/install-git-hook.mjs
// Then put client names, artist names, piece titles, addresses, ... (one per line) into .git/sensitive-terms.txt.
import { chmodSync, copyFileSync, existsSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const gitDir = resolve(ROOT, execFileSync('git', ['rev-parse', '--git-dir'], { cwd: ROOT, encoding: 'utf8' }).trim());
copyFileSync(join(ROOT, 'scripts/pre-push-guard.sh'), join(gitDir, 'hooks/pre-push'));
chmodSync(join(gitDir, 'hooks/pre-push'), 0o755);
const terms = join(gitDir, 'sensitive-terms.txt');
if (!existsSync(terms)) writeFileSync(terms, '# One private term per line (client names, artists, piece titles, street names, ...). Lines starting with # are ignored.\n# This file is inside .git/ and is never pushed.\n');
console.log(`Installed ${join(gitDir, 'hooks/pre-push')}\nPrivate terms list: ${terms}`);
