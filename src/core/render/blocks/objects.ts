import { esc, fmtHours } from '../../format';
import type { RenderContext } from '../../types';
import { sumHours } from './measures';
import { src } from '../source';

/** One object of a collection: photo, number, title, technique, size, assessment text and an hour estimate. */
export interface ObjectRow {
  id?: string;
  no: string;
  title: string;
  technique?: string;
  size?: string;
  /** Assessment text of this object. Missing = the block's `defaultText`. */
  text?: string;
  hoursMin: number; hoursMax?: number;
  imageId?: number;
}

export interface ObjectsBlock {
  id?: string;
  type: 'objects';
  /** Section heading; missing = the standard heading of the document language. */
  heading?: string;
  /** Assessment text shared by every row that has no text of its own. */
  defaultText?: string;
  rows: ObjectRow[];
}

export interface ObjectLabels {
  heading: string; rateNote: string; imageCol: string; noCol: string; descCol: string; sizeCol: string; hoursCol: string;
  totalLabel: string; hoursUnit: string; approx: string;
}

const lines = (s: string) => s.split('\n').map(esc).join('<br>');

/** The collection table: one house-style table (header repeats on every page, rows never split, last row and total stay together). */
export function objects(ctx: RenderContext, b: ObjectsBlock, L: ObjectLabels, at = ''): string {
  const rowHtml = (r: ObjectRow, i: number) => {
    const rp = `${at}.rows.${i}`, on = (path: string) => (at ? src(ctx, path) : '');
    const text = (r.text ?? b.defaultText ?? '').trim();
    const img = r.imageId != null ? `<img class="obj-img" src="${esc(ctx.imageSrc(r.imageId))}" alt="${esc(r.title)}">` : '';
    return `<tr><td class="obj-photo">${img}</td><td class="obj-no"${on(`${rp}.no`)}>${esc(r.no)}</td>`
      + `<td><span class="table-title"${on(`${rp}.title`)}>${esc(r.title)}</span>`
      + (r.technique?.trim() ? `<span class="table-desc"${on(`${rp}.technique`)}>${lines(r.technique.trim())}</span>` : '')
      + (text ? `<span class="table-desc obj-text"${on(r.text !== undefined && r.text.trim() ? `${rp}.text` : `${at}.defaultText`)}>${lines(text)}</span>` : '')
      + `</td><td class="obj-size"${on(`${rp}.size`)}>${esc(r.size?.trim() || '?')}</td>`
      + `<td class="num">${L.approx} ${fmtHours(r.hoursMin, r.hoursMax)} ${esc(L.hoursUnit)}</td></tr>`;
  };
  const cols = '<colgroup><col style="width:24mm"><col style="width:12mm"><col><col style="width:26mm"><col style="width:31mm"></colgroup>';
  const thead = `<thead><tr><th>${esc(L.imageCol)}</th><th>${esc(L.noCol)}</th><th>${esc(L.descCol)}</th><th>${esc(L.sizeCol)}</th><th class="num">${esc(L.hoursCol)}</th></tr></thead>`;
  const t = sumHours(b.rows);
  const heading = `<div class="section-heading-row"><div class="section-heading"${at ? src(ctx, b.heading?.trim() ? `${at}.heading` : at) : ''}>${esc(b.heading?.trim() || L.heading)}</div><div class="rate-note">${esc(L.rateNote)}</div></div>`;
  const totalRow = `<tr class="totals"><td></td><td></td><td class="tl">${esc(L.totalLabel)}</td><td></td><td class="num tv">${L.approx} ${fmtHours(t.min, t.max)} ${esc(L.hoursUnit)}</td></tr>`;
  const rows = b.rows.map(rowHtml);
  const body = rows.length > 1 ? `<tbody>${rows.slice(0, -1).join('')}</tbody>` : '';
  return `${heading}<table class="doc-table obj-table">${cols}${thead}${body}<tbody class="keep-last">${rows.length ? rows[rows.length - 1] : ''}${totalRow}</tbody></table>`;
}
