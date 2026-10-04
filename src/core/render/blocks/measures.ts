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
  const body = b.rows.map((r, i) => `<tr><td>${numbered ? i + 1 : '–'}</td><td>${rowFigures(ctx, r.images)}`
    + `<span class="table-title">${esc(r.title)}</span><span class="table-desc">${esc(r.desc)}</span></td>`
    + `<td class="num">${fmtHours(r.hoursMin, r.hoursMax)}</td></tr>`).join('');
  const t = sumHours(b.rows);
  return `<div class="section-heading-row"><div class="section-heading">${esc(L.heading)}</div><div class="rate-note">${esc(L.rateNote)}</div></div>`
    + `<table class="doc-table"><thead><tr><th style="width:9mm"></th><th>${esc(L.descCol)}</th><th class="num" style="width:36mm">${esc(L.hoursCol)}</th></tr></thead>`
    + `<tbody>${body}</tbody></table>`
    + `<div class="totals"><div class="trow grand"><span class="tl">${esc(L.totalLabel)}</span><span class="tv">${L.approx} ${fmtHours(t.min, t.max)} ${esc(L.hoursUnit)}</span></div></div>`;
}
