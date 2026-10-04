// Renders an offer in headless Chrome (real Paged.js pagination) and returns a per-page report.
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { renderOffer } from '../../src/doctypes/offer/render';
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
export const pagedInstalled = () => existsSync(join(PUBLIC, 'paged.polyfill.js'));
export const fontsInstalled = () => existsSync(join(PUBLIC, 'fonts/Synonym-400.otf'));

const ENGINE = process.env.LAYOUT_ENGINE === 'vivliostyle' ? 'vivliostyle' : 'paged';
const VIVLIOSTYLE = join(ROOT, 'node_modules/@vivliostyle/core/lib/vivliostyle.js');
export const engine = ENGINE;

export async function startHarness() {
  const docs = new Map();
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const m = /^\/doc\/(\d+)\.html$/.exec(url.pathname);
    if (m && docs.has(+m[1])) { res.writeHead(200, { 'content-type': MIME['.html'] }); return res.end(docs.get(+m[1])); }
    if (url.pathname === '/vivliostyle.js') {        // the core is a CommonJS bundle: expose it as a browser global
      res.writeHead(200, { 'content-type': MIME['.js'] });
      return res.end('(function(){var module={exports:{}};var exports=module.exports;' + readFileSync(VIVLIOSTYLE, 'utf8') + '\n;window.vivliostyle=module.exports;})();');
    }
    const ph = /^\/printhost\/(\d+)\.html$/.exec(url.pathname);
    if (ph) {
      res.writeHead(200, { 'content-type': MIME['.html'] });
      return res.end(`<!DOCTYPE html><html data-vivliostyle-paginated="true"><head><meta charset="utf-8"><title>print</title>
        <style>html[data-vivliostyle-paginated]{width:100%;height:100%}html[data-vivliostyle-paginated] body,html[data-vivliostyle-paginated] [data-vivliostyle-viewer-viewport]{width:100% !important;height:100% !important}html[data-vivliostyle-paginated],html[data-vivliostyle-paginated] body{margin:0;padding:0}</style>
        <style id="vivliostyle-page-rules"></style></head><body><div id="vivliostyle-viewer-viewport"></div><script src="/vivliostyle.js"></script><script>
        const v = new vivliostyle.CoreViewer({ viewportElement: document.body.firstElementChild, window, debug: false });
        v.addListener('readystatechange', () => { if (v.readyState === 'complete') window.__pagedDone = true; });
        v.loadDocument({ url: '/doc/${ph[1]}.html' });</script></body></html>`);
    }
    const h = /^\/host\/(\d+)\.html$/.exec(url.pathname);
    if (h) {
      res.writeHead(200, { 'content-type': MIME['.html'] });
      return res.end(`<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#999}@page{size:210mm 297mm;margin:0}@media print{body{background:none}#vs,#vs *{transform:none !important}[data-vivliostyle-page-container]{display:block !important;position:relative !important;margin:0 !important;break-after:page;overflow:hidden;width:210mm;height:297mm}}</style><div id="vs"></div><script src="/vivliostyle.js"></script><script>
        const v = new vivliostyle.CoreViewer({ viewportElement: document.getElementById('vs') }, { renderAllPages: true, pageViewMode: 'singlePage' });
        v.addListener('readystatechange', () => { if (v.readyState === 'complete') window.__pagedDone = true; });
        v.loadDocument({ url: '/doc/${h[1]}.html' });</script>`);
    }
    const file = join(PUBLIC, decodeURIComponent(url.pathname));
    if (file.startsWith(PUBLIC) && existsSync(file) && !file.endsWith('/')) { res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' }); return res.end(readFileSync(file)); }
    res.writeHead(404); res.end();
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--no-sandbox', '--font-render-hinting=none'] });
  let n = 0;

  /** Render offer data; resolves to an array with one report per printed page. `screenshotDir` also saves page-N.png files. */
  async function render(data, lang = 'de', { screenshotDir, beforeScreenshot } = {}) {
    const html = renderOffer(JSON.parse(JSON.stringify(data)), context(lang), ENGINE === 'vivliostyle' ? { paged: false } : { embedded: true });
    const id = ++n; docs.set(id, html);
    const page = await browser.newPage();
    try {
      await page.setViewport({ width: 900, height: 1200 });
      await page.evaluateOnNewDocument(() => { window.addEventListener('message', (e) => { if (e.data && e.data.pagedDone) window.__pagedDone = true; }); });
      await page.goto(`http://127.0.0.1:${port}/${ENGINE === 'vivliostyle' ? 'host' : 'doc'}/${id}.html`, { waitUntil: 'load' });
      await page.waitForFunction('window.__pagedDone === true', { timeout: 60000 });
      await page.evaluate(() => document.fonts.ready);
      if (ENGINE === 'vivliostyle') await page.addStyleTag({ content: '[data-vivliostyle-page-container]{display:block !important;position:relative !important;margin:0 auto 12px !important;}' });   // show every page (single-page view hides all but one)
      await new Promise((r) => setTimeout(r, 150));
      const report = await page.evaluate(analyze);
      if (beforeScreenshot) await beforeScreenshot(page, report);      // e.g. draw annotations for a bug report
      if (screenshotDir) {                                     // debugging aid: one PNG per printed page
        mkdirSync(screenshotDir, { recursive: true });
        const els = await page.$$(ENGINE === 'vivliostyle' ? '[data-vivliostyle-page-container]' : '.pagedjs_page');
        for (let i = 0; i < els.length; i++) await els[i].screenshot({ path: join(screenshotDir, `page-${i + 1}.png`) });
      }
      return report;
    } finally { await page.close(); docs.delete(id); }
  }
  return { printProbe: async (data, lang, fn) => { const html = renderOffer(JSON.parse(JSON.stringify(data)), context(lang || 'de'), { paged: false }); const id = ++n; docs.set(id, html); const page = await browser.newPage(); await page.setViewport({ width: 900, height: 1200 }); await page.goto(`http://127.0.0.1:${port}/host/${id}.html`, { waitUntil: 'load' }); await page.waitForFunction('window.__pagedDone === true', { timeout: 60000 }); await page.emulateMediaType('print'); const r = await page.evaluate(fn); await page.screenshot({ path: process.env.PROBE_SHOT, fullPage: true }); await page.close(); return r; }, pdf: async (data, lang = 'de') => { const html = renderOffer(JSON.parse(JSON.stringify(data)), context(lang), { paged: false }); const id = ++n; docs.set(id, html); const page = await browser.newPage(); await page.goto(`http://127.0.0.1:${port}/printhost/${id}.html`, { waitUntil: 'load' }); await page.waitForFunction('window.__pagedDone === true', { timeout: 60000 }); await page.evaluate(() => document.fonts.ready); const buf = await page.pdf({ preferCSSPageSize: true, printBackground: true }); await page.close(); return buf; }, raw: async (data, lang, fn) => { const html = renderOffer(JSON.parse(JSON.stringify(data)), context(lang || 'de'), { paged: false }); const id = ++n; docs.set(id, html); const page = await browser.newPage(); await page.setViewport({ width: 900, height: 1200 }); await page.goto(`http://127.0.0.1:${port}/host/${id}.html`, { waitUntil: 'load' }); await page.waitForFunction('window.__pagedDone === true', { timeout: 60000 }); await page.addStyleTag({ content: '[data-vivliostyle-page-container]{display:block !important;position:relative !important;margin:0 auto 12px !important;}' }); const r = await page.evaluate(fn); await page.close(); return r; }, render, close: async () => { await browser.close(); server.close(); } };
}
