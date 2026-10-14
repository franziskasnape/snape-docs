#!/usr/bin/env node
// Local helper that lets the app use YOUR Claude login (Claude Code on this Mac) for proofreading, instead of a paid API key.
//
//   npm run claude-bridge          (leave it running in a second terminal while you work)
//
// It listens on http://127.0.0.1:8790 (this computer only) and answers the app's proofread requests by running
// `claude -p` (Claude Code in non-interactive mode) with your logged-in account. Usage counts against your Claude plan's limits.
// One-time login (separate from the desktop app's): `<claude binary> auth login`, see docs/RUNNING.md, "Proofreading without an API key".
// This only works on your own computer: a hosted copy of the app cannot reach it.
import { execFile, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The Claude Code program: $CLAUDE_BIN, `claude` on the PATH, or the copy inside the Claude desktop app (newest version). */
export function findClaude(env = process.env) {
  if (env.CLAUDE_BIN) return existsSync(env.CLAUDE_BIN) ? env.CLAUDE_BIN : null;
  for (const dir of (env.PATH ?? '').split(':')) { const p = join(dir, 'claude'); if (dir && existsSync(p)) return p; }
  const root = join(homedir(), 'Library/Application Support/Claude/claude-code');
  if (existsSync(root)) {
    const versions = readdirSync(root).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    for (const v of versions) for (const h of existsSync(join(root, v)) ? readdirSync(join(root, v)) : []) {
      const p = join(root, v, h, 'claude.app/Contents/MacOS/claude'); if (existsSync(p)) return p;
    }
  }
  return null;
}

const run = (bin, args, { input, cwd, timeout = 240000 } = {}) => new Promise((resolve, reject) => {
  const child = spawn(bin, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
  let out = '', err = '';
  const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('timed out after ' + timeout / 1000 + ' s')); }, timeout);
  child.stdout.on('data', (d) => (out += d)); child.stderr.on('data', (d) => (err += d));
  child.on('error', (e) => { clearTimeout(timer); reject(e); });
  child.on('close', (code) => { clearTimeout(timer); resolve({ code, out, err }); });
  child.stdin.end(input ?? '');
});

/** Pull the structured answer out of Claude Code's JSON result. */
export function extractOutput(stdout) {
  const j = JSON.parse(stdout);
  if (j.is_error) { const e = new Error(String(j.result ?? 'Claude Code reported an error')); e.notLoggedIn = /not logged in|\/login/i.test(String(j.result)); throw e; }
  if (j.structured_output && typeof j.structured_output === 'object') return { output: j.structured_output, usage: j.usage };
  const text = String(j.result ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return { output: JSON.parse(text), usage: j.usage };
}

export function createBridge({ claudeBin = findClaude(), port = 8790 } = {}) {
  let queue = Promise.resolve();                                  // one request at a time
  let loginCache = { at: 0, value: null };
  const loggedIn = async () => {
    if (!claudeBin) return false;
    if (Date.now() - loginCache.at < 10000) return loginCache.value;
    let v = false;
    try { const r = await run(claudeBin, ['auth', 'status'], { timeout: 15000 }); v = !!JSON.parse(r.out).loggedIn; } catch { /* treat as not logged in */ }
    loginCache = { at: Date.now(), value: v };
    return v;
  };

  const server = createServer(async (req, res) => {
    const send = (code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (req.headers.origin) return send(403, { error: 'browser requests are not accepted' });      // only the app's server may call this
    if (req.method === 'GET' && req.url === '/health') return send(200, { ok: true, claude: !!claudeBin, loggedIn: await loggedIn() });
    if (req.method !== 'POST' || req.url !== '/run') return send(404, { error: 'not found' });
    let body = ''; for await (const c of req) { body += c; if (body.length > 4_000_000) return send(413, { error: 'too large' }); }
    let r; try { r = JSON.parse(body); } catch { return send(400, { error: 'bad JSON' }); }
    if (!r.system || !r.user || !r.schema) return send(400, { error: 'system, user and schema are required' });
    if (!claudeBin) return send(503, { code: 'no_claude', error: 'Claude Code was not found on this computer (set CLAUDE_BIN).' });
    queue = queue.then(async () => {
      const dir = mkdtempSync(join(tmpdir(), 'snape-claude-'));        // empty folder: no project files, no CLAUDE.md
      try {
        const args = ['-p', '--output-format', 'json', '--no-session-persistence', '--tools', '', '--disable-slash-commands',
          '--system-prompt', r.system, '--json-schema', JSON.stringify(r.schema), ...(r.model ? ['--model', r.model] : []), ...(['low', 'medium', 'high'].includes(r.effort) ? ['--effort', r.effort] : [])];
        const out = await run(claudeBin, args, { input: r.user, cwd: dir });
        if (!out.out.trim()) throw new Error(out.err.trim().slice(0, 300) || `claude exited with code ${out.code}`);
        send(200, extractOutput(out.out));
      } catch (e) {
        send(e.notLoggedIn ? 401 : 502, { code: e.notLoggedIn ? 'not_logged_in' : 'claude_failed', error: e.message });
      } finally { rmSync(dir, { recursive: true, force: true }); }
    });
  });
  return { server, listen: () => new Promise((r) => server.listen(port, '127.0.0.1', r)), close: () => new Promise((r) => server.close(r)), claudeBin, loggedIn };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const b = createBridge();
  await b.listen();
  console.log(`Claude helper listening on http://127.0.0.1:8790 (this computer only)\nClaude Code: ${b.claudeBin ?? 'NOT FOUND (set CLAUDE_BIN)'}\nLogged in: ${(await b.loggedIn()) ? 'yes' : 'NO. Run once:  "' + b.claudeBin + '" auth login'}\nLeave this window open while you use the Proofread button. Ctrl+C to stop.`);
}
