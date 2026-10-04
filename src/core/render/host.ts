/**
 * The page-layout "host": a small HTML page that lays a finished document out into A4 pages with Vivliostyle
 * (https://vivliostyle.org, AGPL-3.0) and lets the browser print or save it as PDF.
 *
 * The document itself (core/render/frame.ts) is plain, engine-neutral HTML + CSS. The host embeds it, hands it to
 * Vivliostyle as a Blob URL, and shows the resulting pages. One host serves three uses:
 *   - 'view'     its own browser tab (Print / PDF button, standalone HTML export): pages on a grey desk, a toolbar
 *   - 'preview'  an <iframe> in the editor / History: no toolbar; tells the parent window when layout is finished
 * When printing, Vivliostyle fills <style id="vivliostyle-page-rules"> with the right @page rules, so the browser's
 * "Save as PDF" produces exactly the pages shown.
 */
import { esc } from '../format';

export interface HostOptions {
  /** the finished document (a complete HTML page) */
  documentHtml: string;
  mode: 'view' | 'preview';
  lang?: string;
  /** <script src> for the Vivliostyle bundle (served at /vivliostyle.js) */
  scriptSrc?: string;
  /** standalone export: the bundle's source, inlined */
  inlineScript?: string;
  /** adds metadata for importing the pages into Adobe Express (standalone export) */
  importHints?: boolean;
  labels?: { print: string; working: string; pages: string };      // pages: template with {n}
}

export const documentTitle = (html: string) => /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? 'Document';

const NOTICE = '<!-- Page layout by Vivliostyle Core, licensed under the GNU AGPL-3.0: https://vivliostyle.org  Source: https://github.com/vivliostyle/vivliostyle.js -->';

export function hostPage(o: HostOptions): string {
  const title = documentTitle(o.documentHtml);
  const L = o.labels ?? { print: 'Print / Save as PDF', working: 'Laying out pages…', pages: '{n} pages' };
  // The document travels as a JSON string; escape what could end the <script> element or break parsing.
  const json = JSON.stringify(o.documentHtml).replace(/</g, '\\u003c').split(String.fromCharCode(0x2028)).join('\\u2028').split(String.fromCharCode(0x2029)).join('\\u2029');
  const script = o.inlineScript ? `<script>${o.inlineScript.replace(/<\/script/gi, '<\\/script')}</script>` : `<script src="${esc(o.scriptSrc ?? '/vivliostyle.js')}"></script>`;
  const bar = o.mode === 'view' ? `<div class="bar"><span id="status">${esc(L.working)}</span><button type="button" id="printBtn" disabled>${esc(L.print)}</button></div>` : '';
  return `<!DOCTYPE html>
${NOTICE}
<html lang="${esc(o.lang ?? 'de')}" data-vivliostyle-paginated="true"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
${o.importHints ? '<meta name="hz:slide-selector" content="[data-vivliostyle-page-container]"><meta name="hz:canvas-width" content="794"><meta name="hz:canvas-height" content="1123">' : ''}
<style>
  html, body { margin: 0; padding: 0; }
  @media screen {
    html { background: #e9e6e1; }
    /* Vivliostyle shows one page at a time and lays pages out at a high internal resolution, shrunk by a transform.
       For screen we want sheets of paper stacked on a desk: show every page, and replace the transform by CSS zoom
       (--vs-scale is measured once layout is complete) so the pages take their true size in the normal flow. */
    #vs { display: block !important; width: auto !important; height: auto !important; overflow: visible !important; zoom: var(--vs-fit, 1); }
    [data-vivliostyle-outer-zoom-box] { width: auto !important; height: auto !important; overflow: visible !important; }
    [data-vivliostyle-spread-container] { display: block !important; width: auto !important; height: auto !important; transform: none !important; zoom: var(--vs-scale, 1) !important; }
    [data-vivliostyle-page-container] { display: block !important; position: relative !important; margin: 14px auto !important; background: #fff; box-shadow: 0 1px 6px rgba(0,0,0,.2); }
    .bar { position: sticky; top: 0; z-index: 10; display: flex; gap: 12px; align-items: center; justify-content: space-between; padding: 8px 16px; background: #fff; border-bottom: 1px solid #d8d2c6; font: 14px system-ui, sans-serif; color: #1a1613; }
    .bar button { font: inherit; padding: 6px 14px; border: 1px solid #1a1613; border-radius: 6px; background: #1a1613; color: #fff; cursor: pointer; }
    .bar button:disabled { opacity: .45; cursor: default; }
  }
  @media print {
    .bar { display: none; }
    html[data-vivliostyle-paginated], html[data-vivliostyle-paginated] body, html[data-vivliostyle-paginated] [data-vivliostyle-viewer-viewport] { width: 100% !important; height: 100% !important; }
  }
</style>
<style id="vivliostyle-page-rules"></style>
</head><body>
${bar}
<div id="vs"></div>
<script type="application/json" id="doc">${json}</script>
${script}
<script>
(function () {
  var statusEl = document.getElementById('status'), btn = document.getElementById('printBtn');
  function done(n) {
    var spread = document.querySelector('[data-vivliostyle-spread-container]');
    if (spread) { var tf = getComputedStyle(spread).transform; var k = tf && tf !== 'none' ? new DOMMatrixReadOnly(tf).a : 1; document.documentElement.style.setProperty('--vs-scale', k); }
    window.__pages = n; window.__pagedDone = true;
    if (statusEl) statusEl.textContent = ${JSON.stringify(L.pages)}.replace('{n}', n);
    if (btn) { btn.disabled = false; btn.onclick = function () { window.print(); }; }
    try { parent.postMessage({ pagedDone: true, pages: n }, '*'); } catch (e) {}
  }
  function fit() { document.documentElement.style.setProperty('--vs-fit', Math.min(1, window.innerWidth / 830)); }   // narrow window: shrink the sheets to fit
  fit(); window.addEventListener('resize', fit);
  try {
    var html = JSON.parse(document.getElementById('doc').textContent);
    var url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    var viewer = new vivliostyle.CoreViewer({ viewportElement: document.getElementById('vs'), window: window }, { renderAllPages: true, pageViewMode: 'singlePage' });
    viewer.addListener('readystatechange', function () {
      if (viewer.readyState === 'complete') done(document.querySelectorAll('[data-vivliostyle-page-container]').length);
    });
    viewer.addListener('error', function (e) { window.__error = String(e && e.content && (e.content.error || e.content.messages) || 'layout error'); if (statusEl) statusEl.textContent = 'Layout error: ' + window.__error; });
    viewer.loadDocument({ url: url });
  } catch (e) { window.__error = String(e); if (statusEl) statusEl.textContent = 'Layout error: ' + e; }
})();
</script>
</body></html>`;
}
