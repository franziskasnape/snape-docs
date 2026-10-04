// Lays out an offer with the REAL page-layout host (src/core/render/host.ts, Vivliostyle) in headless Chrome and returns a
// per-page report. What is tested here is exactly what the app ships: same document, same host page, same engine file.
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { renderOffer } from '../../src/doctypes/offer/render';
import { hostPage } from '../../src/core/render/host';
import { analyze } from './checks.js';
import { context } from './fixtures.js';

const ROOT = resolve(import.meta.dirname, '../..');
const PUBLIC = join(ROOT, 'public');
const MIME = { '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.otf': 'font/otf', '.html': 'text/html; charset=utf-8' };

export function findChrome() {
  const c = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  return c.find((p) => p && existsSync(p));
}
export const engineInstalled = () => existsSync(join(PUBLIC, 'vivliostyle.js'));
export const fontsInstalled = () => existsSync(join(PUBLIC, 'fonts/Synonym-400.otf'));

export async function startHarness() {
  const pages = new Map();                                   // id -> host page html
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const m = /^\/host\/(\d+)\.html$/.exec(url.pathname);
    if (m && pages.has(+m[1])) { res.writeHead(200, { 'content-type': MIME['.html'] }); return res.end(pages.get(+m[1])); }
    const file = join(PUBLIC, decodeURIComponent(url.pathname));
    if (file.startsWith(PUBLIC) && existsSync(file) && !file.endsWith('/')) { res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' }); return res.end(readFileSync(file)); }
    res.writeHead(404); res.end();
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--no-sandbox', '--font-render-hinting=none'] });
  let n = 0;

  async function open(data, lang, mode) {
    const documentHtml = renderOffer(JSON.parse(JSON.stringify(data)), context(lang), { cssHref: `${origin}/house.css`, sealSrc: `${origin}/seal.png` });
    const id = ++n; pages.set(id, hostPage({ documentHtml, mode, lang }));
    const page = await browser.newPage();
    await page.setViewport({ width: 900, height: 1200 });
    await page.goto(`${origin}/host/${id}.html`, { waitUntil: 'load' });
    await page.waitForFunction('window.__pagedDone === true || window.__error', { timeout: 60000 });
    const error = await page.evaluate('window.__error');
    if (error) { await page.close(); throw new Error('layout engine failed: ' + error); }
    await page.evaluate(() => document.fonts.ready);
    return { page, done: () => { pages.delete(id); return page.close(); } };
  }

  /** Lay out offer data; resolves to an array with one report per printed page. `screenshotDir` also saves page-N.png. */
  async function render(data, lang = 'de', { screenshotDir, beforeScreenshot } = {}) {
    const { page, done } = await open(data, lang, 'preview');
    try {
      const report = await page.evaluate(analyze);
      if (beforeScreenshot) await beforeScreenshot(page, report);      // e.g. draw annotations for a bug report
      if (screenshotDir) {
        mkdirSync(screenshotDir, { recursive: true });
        const els = await page.$$('[data-vivliostyle-page-container]');
        for (let i = 0; i < els.length; i++) await els[i].screenshot({ path: join(screenshotDir, `page-${i + 1}.png`) });
      }
      return report;
    } finally { await done(); }
  }

  /** The real print route: PDF bytes as the browser's "Save as PDF" produces them from the print view. */
  async function pdf(data, lang = 'de') {
    const { page, done } = await open(data, lang, 'view');
    try { return Buffer.from(await page.pdf({ preferCSSPageSize: true, printBackground: true })); } finally { await done(); }
  }

  return { render, pdf, close: async () => { await browser.close(); server.close(); } };
}
