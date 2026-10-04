import { esc } from '../../format';
import type { ImageRef, RenderContext } from '../../types';

/** key/value info lines under a heading (Objekt, Auftraggeber) */
export function kv(heading: string, lines: { k: string; v: string }[]): string {
  const rows = lines
    .filter((l) => l.v && l.v.trim())
    .map((l) => `<div class="info-line"><span class="k">${esc(l.k)}</span><span class="v">${l.v.split('\n').map(esc).join('<br>')}</span></div>`)
    .join('');
  return `<div class="info-col"><div class="info-heading">${esc(heading)}</div>${rows}</div>`;
}

/** heading plus paragraphs. Paragraph html is trusted editor content. */
export function prose(heading: string | undefined, paragraphs: string[]): string {
  const body = paragraphs.filter((p) => p.trim());
  if (!heading && !body.length) return '';
  return (heading ? `<div class="section-heading">${esc(heading)}</div>` : '')
    + body.map((p) => `<div class="section-body">${p}</div>`).join('');
}

/** labelled paragraph: <em>Hinweis:</em> … */
export function note(label: string, html: string): string {
  return `<div class="section-body"><em>${esc(label)}</em> ${html}</div>`;
}

export type OverviewLayout = 'auto' | 'landscape' | 'portrait';

/** Overview photo beside the Objekt/Auftraggeber block. Portrait photos get a narrower, height-capped frame. */
export function overviewFigure(ctx: RenderContext, img: ImageRef | undefined, note?: string, layout: OverviewLayout = 'auto'): string {
  if (!img) return '';
  const d = ctx.imageDims?.[img.imageId];
  const portrait = layout === 'portrait' || (layout === 'auto' && !!d && d.w / d.h < 0.95);
  return `<div class="overview-fig ${portrait ? 'portrait' : 'landscape'}"><img src="${esc(ctx.imageSrc(img.imageId))}" alt="${esc(img.caption)}">`
    + (img.caption ? `<div class="cap">${esc(img.caption)}</div>` : '')
    + (note ? `<div class="cap note">${esc(note)}</div>` : '')
    + `</div>`;
}

export function rowFigures(ctx: RenderContext, imgs: ImageRef[] = []): string {
  if (!imgs.length) return '';
  return `<div class="row-figs">` + imgs.map((i) =>
    `<div class="row-fig"><img src="${esc(ctx.imageSrc(i.imageId))}" alt="${esc(i.caption)}">${i.caption ? `<div class="cap">${esc(i.caption)}</div>` : ''}</div>`
  ).join('') + `</div>`;
}

export const pageBreak = () => `<div class="page-break"></div>`;
