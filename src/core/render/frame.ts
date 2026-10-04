import { common, studio } from '../i18n';
import { esc } from '../format';
import type { Lang } from '../types';

export interface FrameOptions {
  lang: Lang;
  title: string;                 // <title>, also the default PDF filename
  metaRows: [string, string][];  // label/value rows of the top-right box (number, dates…)
  body: string;
  /** href for the stylesheet; standalone export passes inline CSS instead */
  cssHref?: string;
  inlineCss?: string;
  sealSrc?: string;
  paged?: boolean;               // load Paged.js (print/preview) — false for raw HTML
  pagedSrc?: string;
}

export function frame(o: FrameOptions): string {
  const t = common[o.lang];
  const meta: [string, string][] = [...o.metaRows, [t.phone, studio.phone], [t.email, studio.email]];
  const head = `<div class="doc-header">
    <div class="brand-a"><div><span class="brand-word">SNAPE</span><span class="brand-sub">Art Conservation</span></div>
      <div class="brand-divider"></div><div class="brand-tagline">${t.tagline}</div></div>
    <div class="doc-meta">${meta.map(([k, v]) => `<div class="row"><span class="label">${esc(k)}</span><span>${esc(v)}</span></div>`).join('')}</div>
  </div>`;
  const header = `<div class="running-header">${head}<div class="hr"></div></div><div class="running-header-first">${head}</div>`;
  const footer = `<div class="running-footer"><div class="footer">
    <img class="footer-seal" src="${esc(o.sealSrc ?? '/seal.png')}" alt="Snape Art Conservation">
    <div class="footer-address">${esc(studio.address)} &middot; ${esc(studio.phone)} &middot; ${esc(studio.email)}</div>
    <div class="footer-page"></div></div></div>`;
  return `<!DOCTYPE html>
<html lang="${o.lang}"><head><meta charset="UTF-8">
<title>${esc(o.title)}</title>
<meta name="hz:slide-selector" content=".pagedjs_page"><meta name="hz:canvas-width" content="794"><meta name="hz:canvas-height" content="1123">
${o.inlineCss ? `<style>${o.inlineCss}</style>` : `<link rel="stylesheet" href="${esc(o.cssHref ?? '/house.css')}">`}
<style>:root{--page-label:"${t.page}"}</style>
</head><body>
${header}${footer}
<main>${o.body}</main>
${o.paged === false ? '' : `<script src="${esc(o.pagedSrc ?? '/paged.polyfill.js')}"></script>`}
</body></html>`;
}
