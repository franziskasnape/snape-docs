#!/usr/bin/env node
// Command line for the snape-docs HTTP API: for scripts and AI agents. Prints JSON; errors go to stderr with exit code 1.
//
//   node scripts/snape.mjs <command> [arguments]      (or: npm run snape -- <command> ...)
//   SNAPE_URL=http://localhost:8787   which server to talk to (default shown). Behind Cloudflare Access also set
//   SNAPE_CF_ID / SNAPE_CF_SECRET     to a Cloudflare Access service token.
//
// Run with no arguments for the list of commands. Full reference: docs/API.md, machine-readable: GET /api/openapi.json
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';

const BASE = (process.env.SNAPE_URL ?? 'http://localhost:8787').replace(/\/$/, '');
const AUTH = process.env.SNAPE_CF_ID ? { 'CF-Access-Client-Id': process.env.SNAPE_CF_ID, 'CF-Access-Client-Secret': process.env.SNAPE_CF_SECRET ?? '' } : {};

const HELP = `snape-docs command line (server: ${BASE})

documents
  list [--type offer]                      all documents (id, number, status, rev, ...)
  get <id>                                 one document: {id, number, lang, status, title, clientId, client, artwork, data, rev}
  create [file.json|-] [--lang de|en] [--client <id>] [--title "..."]
                                           new document; the JSON (file or stdin) may hold {type, lang, title, status, clientId, artwork, data}
  put <id> <file.json|-> [--rev n]         replace parts: any subset of {title,status,lang,clientId,artwork,data}
  patch <id> <ops.json|-> [--rev n]        JSON Patch operations (see docs/API.md); paths may use /data/blocks/@<blockId>/...
  status <id> <draft|sent|accepted|declined>
  duplicate <id>
  delete <id> --yes                        permanent (with its history): take a backup first
  html <id> [out.html]                     the document as script-free HTML
  standalone <id> [out.html]               self-contained HTML file
  pdf <id> [out.pdf]                       A4 PDF made by headless Chrome (needs Google Chrome; the app must be running)
history
  versions <id>                            list
  save-version <id> ["note"]               save a named version now
  version <id> <versionId>                 one snapshot
  restore <id> <versionId>                 (the current state is saved first)
types and checking
  types                                    document types and their statuses
  schema [type]                            JSON Schema of the document data (default type: offer)
  example [type] [--lang de|en]            a complete new document
  validate <file.json|-> [type]            dry run: would this data be accepted? ({data} or the data itself)
  openapi                                  the OpenAPI description
clients, photos, settings
  clients                                  list;  client <id>;  client-create <file.json|->;  client-delete <id>
  upload-image <file.jpg|png> [--document <id>] [--max 1600]
                                           uploads a photo (resized with macOS sips when --max is given) and prints {id}
  images [--document <id>]                 list uploaded images
  settings                                 current settings
`;

const argv = process.argv.slice(2);
const flag = (name, takesValue = true) => {
  const i = argv.indexOf(`--${name}`); if (i < 0) return undefined;
  const v = takesValue ? argv[i + 1] : true; argv.splice(i, takesValue ? 2 : 1); return v;
};
const fail = (msg) => { console.error(msg); process.exit(1); };

async function http(path, { method = 'GET', body, headers = {}, raw = false } = {}) {
  const isJson = body !== undefined && !(body instanceof Uint8Array);
  let res;
  try {
    res = await fetch(BASE + path, { method, headers: { ...AUTH, ...(isJson ? { 'content-type': 'application/json' } : {}), ...headers }, body: isJson ? JSON.stringify(body) : body });
  } catch (e) { fail(`Cannot reach ${BASE}: ${e.cause?.code ?? e.message}. Is the app running (npm run dev)?`); }
  if (raw && res.ok) return res;
  const text = await res.text(); let json; try { json = JSON.parse(text); } catch { /* not json */ }
  if (!res.ok) {
    console.error(`${method} ${path} -> ${res.status}${json?.code ? ` (${json.code})` : ''}: ${json?.error ?? text.slice(0, 300)}`);
    for (const i of json?.issues ?? []) console.error(`  ${i.path}: ${i.message}`);
    if (json?.opIndex !== undefined) console.error(`  failing operation: #${json.opIndex}`);
    if (json?.code === 'conflict') console.error(`  current revision is ${json.rev}: read the document again and redo the change`);
    process.exit(1);
  }
  return raw ? res : (json ?? text);
}
const out = (v) => console.log(typeof v === 'string' ? v : JSON.stringify(v, null, 2));
const readJson = (src) => { try { return JSON.parse(src === '-' ? readFileSync(0, 'utf8') : readFileSync(src, 'utf8')); } catch (e) { return fail(`cannot read JSON from ${src}: ${e.message}`); } };
const id = (s) => (/^\d+$/.test(s ?? '') ? Number(s) : fail('a numeric document id is needed'));

function findChrome() {
  return [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium', '/usr/bin/google-chrome', '/usr/bin/chromium']
    .find((p) => p && existsSync(p));
}

const rev = flag('rev');
const withRev = (extra = {}) => (rev !== undefined ? { baseRev: Number(rev), ...extra } : extra);
const [cmd, a, b] = argv;

switch (cmd) {
  case undefined: case 'help': case '--help': process.stdout.write(HELP); break;
  case 'list': { const t = flag('type'); out(await http('/api/documents' + (t ? `?type=${encodeURIComponent(t)}` : ''))); break; }
  case 'get': out(await http(`/api/documents/${id(a)}`)); break;
  case 'create': {
    const lang = flag('lang'), client = flag('client'), title = flag('title');
    const body = a ? readJson(a) : {};
    if (lang) body.lang = lang; if (client) body.clientId = Number(client); if (title) body.title = title;
    out(await http('/api/documents', { method: 'POST', body })); break;
  }
  case 'put': out(await http(`/api/documents/${id(a)}`, { method: 'PUT', body: { ...readJson(b ?? fail('put <id> <file.json|->')), ...withRev() } })); break;
  case 'patch': { const ops = readJson(b ?? fail('patch <id> <ops.json|->')); out(await http(`/api/documents/${id(a)}`, { method: 'PATCH', body: { ops: Array.isArray(ops) ? ops : ops.ops, ...withRev() } })); break; }
  case 'status': out(await http(`/api/documents/${id(a)}`, { method: 'PUT', body: { status: b ?? fail('status <id> <status>'), ...withRev() } })); break;
  case 'duplicate': out(await http('/api/documents', { method: 'POST', body: { duplicateOf: id(a) } })); break;
  case 'delete': if (!flag('yes', false)) fail('This permanently deletes the document and its history. Take a backup (npm run backup), then repeat with --yes.'); out(await http(`/api/documents/${id(a)}`, { method: 'DELETE' })); break;
  case 'html': case 'standalone': {
    const text = await http(cmd === 'html' ? `/api/documents/${id(a)}/html` : `/documents/${id(a)}/standalone.html`);
    if (b) { writeFileSync(b, text); out({ written: b, bytes: text.length }); } else process.stdout.write(text); break;
  }
  case 'pdf': {
    const chrome = findChrome(); if (!chrome) fail('Google Chrome was not found (set CHROME_PATH).');
    const doc = await http(`/api/documents/${id(a)}`);
    const file = b ?? `Snape-Conservation_${doc.number}_${doc.lang === 'de' ? 'Angebot' : 'Offer'}.pdf`;
    const puppeteer = (await import('puppeteer-core')).default;
    const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
    try {
      const page = await browser.newPage(); await page.setViewport({ width: 900, height: 1200 });
      if (AUTH['CF-Access-Client-Id']) await page.setExtraHTTPHeaders(AUTH);
      await page.goto(`${BASE}/documents/${doc.id}/print`, { waitUntil: 'load' });
      await page.waitForFunction('window.__pagedDone === true || window.__error', { timeout: 120000 });
      const error = await page.evaluate('window.__error'); if (error) fail(`layout failed: ${error}`);
      await page.evaluate(() => document.fonts.ready);
      const pages = await page.evaluate(() => document.querySelectorAll('[data-vivliostyle-page-container]').length);
      writeFileSync(file, await page.pdf({ preferCSSPageSize: true, printBackground: true }));
      out({ written: file, pages, number: doc.number });
    } finally { await browser.close(); }
    break;
  }
  case 'versions': out(await http(`/api/documents/${id(a)}/versions`)); break;
  case 'save-version': out(await http(`/api/documents/${id(a)}/versions`, { method: 'POST', body: { note: b } })); break;
  case 'version': out(await http(`/api/documents/${id(a)}/versions/${id(b)}`)); break;
  case 'restore': out(await http(`/api/documents/${id(a)}/versions/${id(b)}/restore`, { method: 'POST' })); break;
  case 'types': out(await http('/api/doctypes')); break;
  case 'schema': out(await http(`/api/doctypes/${a ?? 'offer'}/schema`)); break;
  case 'example': { const lang = flag('lang'); out(await http(`/api/doctypes/${a ?? 'offer'}/example${lang ? `?lang=${lang}` : ''}`)); break; }
  case 'validate': { const j = readJson(a ?? fail('validate <file.json|-> [type]')); const r = await http(`/api/doctypes/${b ?? 'offer'}/validate`, { method: 'POST', body: { data: j.data ?? j } }); out(r); if (!r.valid) process.exit(1); break; }
  case 'openapi': out(await http('/api/openapi.json')); break;
  case 'clients': out(await http('/api/clients')); break;
  case 'client': out(await http(`/api/clients/${id(a)}`)); break;
  case 'client-create': out(await http('/api/clients', { method: 'POST', body: readJson(a ?? fail('client-create <file.json|->')) })); break;
  case 'client-delete': out(await http(`/api/clients/${id(a)}`, { method: 'DELETE' })); break;
  case 'upload-image': {
    let file = a ?? fail('upload-image <file>'); const doc = flag('document'), max = flag('max');
    const type = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' }[extname(file).toLowerCase()] ?? fail('only .jpg and .png can be uploaded');
    let tmp, w, h;
    if (max) {                                       // macOS: resize (and measure) with sips
      tmp = mkdtempSync(join(tmpdir(), 'snape-')); const small = join(tmp, 'img' + extname(file));
      try { execFileSync('sips', ['-Z', String(max), file, '--out', small], { stdio: 'ignore' }); file = small; } catch { fail('--max needs macOS sips'); }
    }
    try { const o = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', file]).toString(); w = /pixelWidth: (\d+)/.exec(o)?.[1]; h = /pixelHeight: (\d+)/.exec(o)?.[1]; } catch { /* sips not available: the server measures the image itself */ }
    const q = new URLSearchParams({ ...(doc ? { documentId: doc } : {}), ...(w && h ? { w, h } : {}) }).toString();
    out(await http(`/api/images${q ? `?${q}` : ''}`, { method: 'POST', body: new Uint8Array(readFileSync(file)), headers: { 'content-type': type } }));
    if (tmp) rmSync(tmp, { recursive: true, force: true });
    break;
  }
  case 'images': { const d = flag('document'); out(await http('/api/images' + (d ? `?documentId=${d}` : ''))); break; }
  case 'settings': out(await http('/api/settings')); break;
  default: fail(`Unknown command "${cmd}". Run without arguments for the list.`);
}
