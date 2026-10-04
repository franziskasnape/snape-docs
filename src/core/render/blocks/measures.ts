import { esc, fmtHours } from '../../format';
import type { ImageRef, RenderContext } from '../../types';
import { rowFigures } from './basic';

export interface MeasureRow {
  id?: string;
  title: string; desc: string;
  hoursMin: number; hoursMax?: number;
  images?: ImageRef[];
}

export interface MeasuresBlock {
  id?: string;
  type: 'measures';
  kind: 'main' | 'optional';
  rows: MeasureRow[];
}

export interface MeasureLabels {
  heading: string; rateNote: string; descCol: string; hoursCol: string; totalLabel: string; hoursUnit: string; approx: string;
}

export function sumHours(rows: MeasureRow[]): { min: number; max: number } {
  return rows.reduce((a, r) => ({ min: a.min + r.hoursMin, max: a.max + (r.hoursMax ?? r.hoursMin) }), { min: 0, max: 0 });
}

export function measures(ctx: RenderContext, b: MeasuresBlock, L: MeasureLabels): string {
  const numbered = b.kind === 'main';
  const rowHtml = (r: MeasureRow, i: number) => `<tr><td>${numbered ? i + 1 : '–'}</td><td>${rowFigures(ctx, r.images)}`
    + `<span class="table-title">${esc(r.title)}</span><span class="table-desc">${esc(r.desc)}</span></td>`
    + `<td class="num">${fmtHours(r.hoursMin, r.hoursMax)}</td></tr>`;
  const cols = '<colgroup><col style="width:9mm"><col><col style="width:36mm"></colgroup>';
  const thead = `<thead><tr><th></th><th>${esc(L.descCol)}</th><th class="num">${esc(L.hoursCol)}</th></tr></thead>`;
  const table = (rows: string, head = '', cont = false) => `<table class="doc-table${cont ? ' cont' : ''}">${cols}${head}<tbody>${rows}</tbody></table>`;
  const t = sumHours(b.rows);
  const heading = `<div class="section-heading-row"><div class="section-heading">${esc(L.heading)}</div><div class="rate-note">${esc(L.rateNote)}</div></div>`;
  const totals = `<div class="totals"><div class="trow grand"><span class="tl">${esc(L.totalLabel)}</span><span class="tv">${L.approx} ${fmtHours(t.min, t.max)} ${esc(L.hoursUnit)}</span></div></div>`;

  // The table is emitted in up to three pieces that look like one table (same column widths, no gaps):
  //   [heading + header + first row]   kept together, so a heading is never left alone at the bottom of a page
  //   [middle rows]                    free to flow across pages
  //   [last row + total line]          kept together, so the total is never alone at the top of a page
  // Paged.js cannot "keep with next" across table rows, but it does honour break-inside: avoid on a wrapper.
  const rows = b.rows.map(rowHtml);
  if (rows.length <= 1) return `<div class="keep">${heading}${table(rows.join(''), thead)}${totals}</div>`;
  const middle = rows.slice(1, -1);
  return `<div class="keep">${heading}${table(rows[0], thead)}</div>`
    + (middle.length ? table(middle.join(''), '', true) : '')
    + `<div class="keep">${table(rows[rows.length - 1], '', true)}${totals}</div>`;
}
