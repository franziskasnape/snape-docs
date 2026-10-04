#!/usr/bin/env node
// Load seed/seed.sql and seed/images into the LOCAL D1 + R2 (wrangler dev state).
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const run = (args) => execFileSync('npx', ['wrangler', ...args], { stdio: 'inherit' });
run(['d1', 'execute', 'DB', '--local', '--file', 'seed/seed.sql']);
for (const im of JSON.parse(readFileSync('seed/images.json', 'utf8'))) {
  run(['r2', 'object', 'put', `snape-docs-images/${im.key}`, '--local', '--file', im.file, '--content-type', im.mime]);
}
