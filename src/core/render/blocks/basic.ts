import { esc } from '../../format';
import type { ImageRef, RenderContext } from '../../types';
import { src } from '../source';

/** key/value info lines under a heading (Objekt, Auftraggeber) */
export function kv(heading: string, lines: { k: string; v: string; kPath?: string; vPath?: string }[], ctx: Pick<RenderContext, 'sourceMap'> = {}): string {
  const rows = lines
    .filter((l) => l.v && l.v.trim())
    .map((l) => `<div class="info-line"><span class="k"${l.kPath ? src(ctx, l.kPath) : ''}>${esc(l.k)}</span><span class="v"${l.vPath ? src(ctx, l.vPath) : ''}>${l.v.split('\n').map(esc).join('<br>')}</span></div>`)
    .join('');
  return `<div class="info-col"><div class="info-heading">${esc(heading)}</div>${rows}</div>`;
}

/** heading plus paragraphs and bullet points. Paragraph html is trusted editor content. `at` = the block's editor path ("data.blocks.2"). */
export function prose(heading: string | undefined, paragraphs: string[], bullets: string[] = [], at?: { ctx: Pick<RenderContext, 'sourceMap'>; path: string; customHeading: boolean }): string {
  const ctx = at?.ctx ?? {}, base = at?.path ?? '';
  const body = paragraphs.map((p, i) => ({ p, i })).filter((x) => x.p.trim());                 // keep each paragraph's own index
  const points = bullets.map((p, i) => ({ p, i })).filter((x) => x.p.trim());
  if (!heading && !body.length && !points.length) return '';
  return (heading ? `<div class="section-heading"${at ? src(ctx, at.customHeading ? `${base}.heading` : base) : ''}>${esc(heading)}</div>` : '')
    + body.map((x) => `<div class="section-body"${at ? src(ctx, `${base}.paragraphs.${x.i}`, { html: true }) : ''}>${x.p}</div>`).join('')
    + (points.length ? `<ul class="section-list">${points.map((x) => `<li${at ? src(ctx, `${base}.bullets`, { html: true, line: x.i }) : ''}>${x.p}</li>`).join('')}</ul>` : '');
}

/** labelled paragraph: <em>Hinweis:</em> … */
export function note(label: string, html: string, at?: { ctx: Pick<RenderContext, 'sourceMap'>; path: string }): string {
  return `<div class="section-body"${at ? src(at.ctx, `${at.path}.html`, { html: true }) : ''}><em>${esc(label)}</em> ${html}</div>`;
}

export type OverviewLayout = 'auto' | 'landscape' | 'portrait';

/** Overview photo beside the Objekt/Auftraggeber block. Portrait photos get a narrower, height-capped frame. */
export function overviewFigure(ctx: RenderContext, img: ImageRef | undefined, note?: string, layout: OverviewLayout = 'auto'): string {
  if (!img) return '';
  const d = ctx.imageDims?.[img.imageId];
  const portrait = layout === 'portrait' || (layout === 'auto' && !!d && d.w / d.h < 0.95);
  return `<div class="overview-fig ${portrait ? 'portrait' : 'landscape'}"><img src="${esc(ctx.imageSrc(img.imageId))}" alt="${esc(img.caption)}">`
    + (img.caption ? `<div class="cap"${src(ctx, 'data.overview.caption')}>${esc(img.caption)}</div>` : '')
    + (note ? `<div class="cap note"${src(ctx, 'data.overview.note')}>${esc(note)}</div>` : '')
    + `</div>`;
}

export function rowFigures(ctx: RenderContext, imgs: ImageRef[] = []): string {
  if (!imgs.length) return '';
  return `<div class="row-figs">` + imgs.map((i) =>
    `<div class="row-fig"><img src="${esc(ctx.imageSrc(i.imageId))}" alt="${esc(i.caption)}">${i.caption ? `<div class="cap">${esc(i.caption)}</div>` : ''}</div>`
  ).join('') + `</div>`;
}

export const pageBreak = () => `<div class="page-break"></div>`;
