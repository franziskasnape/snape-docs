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
  const t = sumHours(b.rows);
  const heading = `<div class="section-heading-row"><div class="section-heading">${esc(L.heading)}</div><div class="rate-note">${esc(L.rateNote)}</div></div>`;
  const totalRow = `<tr class="totals"><td></td><td class="tl">${esc(L.totalLabel)}</td><td class="num tv">${L.approx} ${fmtHours(t.min, t.max)} ${esc(L.hoursUnit)}</td></tr>`;
  const rows = b.rows.map(rowHtml);
  // ONE table, so the page-layout engine can repeat its header row on continuation pages.
  // The last row and the total line share a tbody with break-inside: avoid, so the total is never alone at the top of a page.
  const body = rows.length ? `<tbody>${rows.slice(0, -1).join('')}</tbody>` : '';
  return `${heading}<table class="doc-table">${cols}${thead}${body}<tbody class="keep-last">${rows.length ? rows[rows.length - 1] : ''}${totalRow}</tbody></table>`;
}
