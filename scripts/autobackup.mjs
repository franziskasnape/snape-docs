#!/usr/bin/env node
/**
 * Schedule automatic backups on macOS (a launchd "LaunchAgent": runs while you are logged in).
 *
 *   node scripts/autobackup.mjs install [--dest <folder>]   switch on: backs up now, then every hour
 *   node scripts/autobackup.mjs set-dest <folder>           only remember where backups go (no schedule)
 *   node scripts/autobackup.mjs status                      is it on? last runs? latest snapshot?
 *   node scripts/autobackup.mjs uninstall                   switch off
 *   node scripts/autobackup.mjs print                       show the launchd file without installing anything
 *
 * Each run is skipped when nothing changed, so an hourly schedule costs next to nothing.
 * If the Mac was asleep, the missed run happens after it wakes up.
 * `--dest` is remembered in the git-ignored file `.backup-dir`, which `npm run backup` also uses.
 * Output goes to ~/Library/Logs/snape-docs-backup.log.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveDest } from './backup.mjs';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const LABEL = 'com.snape.docs.backup';
const PLIST = join(homedir(), 'Library/LaunchAgents', `${LABEL}.plist`);
const LOG = join(homedir(), 'Library/Logs/snape-docs-backup.log');
const uid = process.getuid?.() ?? 501;
const args = process.argv.slice(2);
const cmd = args[0];
const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const launchctl = (...a) => execFileSync('launchctl', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

function plist() {
  const node = process.execPath;
  const path = [dirname(node), '/usr/local/bin', '/opt/homebrew/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(':');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${esc(node)}</string>
    <string>${esc(join(ROOT, 'scripts/backup.mjs'))}</string>
    <string>--quiet</string>
  </array>
  <key>WorkingDirectory</key><string>${esc(ROOT)}</string>
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key><string>${esc(path)}</string><key>HOME</key><string>${esc(homedir())}</string></dict>
  <key>RunAtLoad</key><true/>
  <key>StartInterval</key><integer>3600</integer>
  <key>StandardOutPath</key><string>${esc(LOG)}</string>
  <key>StandardErrorPath</key><string>${esc(LOG)}</string>
  <key>ProcessType</key><string>Background</string>
</dict>
</plist>
`;
}

const isLoaded = () => { try { launchctl('print', `gui/${uid}/${LABEL}`); return true; } catch { return false; } };

if (cmd === 'print') {
  process.stdout.write(plist());
} else if (cmd === 'install') {
  const d = opt('--dest');
  if (d) writeFileSync(join(ROOT, '.backup-dir'), resolve(d.replace(/^~/, homedir())) + '\n');
  const dest = resolveDest(undefined);
  mkdirSync(dest, { recursive: true });
  mkdirSync(dirname(PLIST), { recursive: true });
  writeFileSync(PLIST, plist());
  if (isLoaded()) try { launchctl('bootout', `gui/${uid}/${LABEL}`); } catch { /* ignore */ }
  launchctl('bootstrap', `gui/${uid}`, PLIST);
  console.log(`Automatic backups are ON.\n  destination: ${dest}\n  schedule:    now, then every hour (skipped when nothing changed)\n  log:         ${LOG}\nCheck with: node scripts/autobackup.mjs status`);
} else if (cmd === 'set-dest') {
  if (!args[1]) { console.error('usage: node scripts/autobackup.mjs set-dest <folder>'); process.exit(1); }
  const d = resolve(args[1].replace(/^~/, homedir()));
  mkdirSync(d, { recursive: true });
  writeFileSync(join(ROOT, '.backup-dir'), d + '\n');
  console.log(`Backups will go to: ${d}\nRun one now with: npm run backup`);
} else if (cmd === 'uninstall') {
  if (isLoaded()) try { launchctl('bootout', `gui/${uid}/${LABEL}`); } catch { /* ignore */ }
  rmSync(PLIST, { force: true });
  console.log('Automatic backups are OFF. Existing backups were not touched.');
} else if (cmd === 'status') {
  const dest = resolveDest(undefined), snaps = join(dest, 'snapshots');
  console.log(`scheduler:   ${isLoaded() ? 'ON' : 'off'}${existsSync(PLIST) ? '' : ' (not installed)'}`);
  console.log(`destination: ${dest}`);
  if (existsSync(snaps)) {
    const names = readdirSync(snaps).filter((n) => /^\d{4}-/.test(n)).sort();
    console.log(`snapshots:   ${names.length}${names.length ? `, latest ${names.at(-1)}` : ''}`);
    if (names.length) { try { const m = JSON.parse(readFileSync(join(snaps, names.at(-1), 'manifest.json'), 'utf8')); console.log(`latest has:  ${m.documents} documents, ${m.photos} photos`); } catch { /* ignore */ } }
  } else console.log('snapshots:   none yet');
  if (existsSync(LOG)) console.log(`last log:\n${readFileSync(LOG, 'utf8').trim().split('\n').slice(-4).map((l) => '  ' + l).join('\n')}`);
} else {
  console.error('usage: node scripts/autobackup.mjs <install [--dest folder] | set-dest <folder> | status | uninstall | print>');
  process.exit(1);
}
