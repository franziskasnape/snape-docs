import type { Lang } from '../../core/types';
import { chf, fmtChfRange, fmtHours, fmtLongDate } from '../../core/format';
import { sumHours } from '../../core/render/blocks/measures';
import { costLineLabels, costTemplate } from './i18n';
import type { OfferData } from './schema';
import type { MeasuresBlock } from '../../core/render/blocks/measures';
import type { ObjectsBlock } from '../../core/render/blocks/objects';

const fill = (s: string, vars: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');

/** Object lists count as proposed (main) work. */
const objectLists = (d: OfferData) => d.blocks.filter((b): b is ObjectsBlock => b.type === 'objects');

/** The Kostenaufstellung as label/value lines (cost.style = 'lines'): rate, estimated effort and labour costs, computed from the tables. */
export function costLines(d: OfferData, lang: Lang): string {
  if (d.cost.style !== 'lines') return '';
  const T = costLineLabels[lang];
  const measureRows = d.blocks.filter((b): b is MeasuresBlock => b.type === 'measures' && b.kind === 'main').flatMap((t) => t.rows);
  const lists = objectLists(d);
  const sum = sumHours([...measureRows, ...lists.flatMap((l) => l.rows)]);
  const n = lists.reduce((a, l) => a + l.rows.length, 0);
  const r = d.rate;
  const cost = sum.min === sum.max ? `CHF ${chf(sum.min * r)}.–` : `CHF ${chf(sum.min * r)}.–${T.to}CHF ${chf(sum.max * r)}.–`;
  const line = (k: string, v: string) => `<div class="info-line"><span class="k">${k}</span><span class="v">${v}</span></div>`;
  return `<div class="cost-lines">${line(T.rate, fill(T.rateVal, { rate: String(r) }))}`
    + line(T.effort, fill(T.effortVal, { hours: fmtHours(sum.min, sum.max), objs: n ? fill(T.objs, { n: String(n) }) : '' }))
    + `${line(T.cost, cost)}</div>`;
}

/** Kostenaufstellung paragraph: template + toggles, numbers computed from the measures tables. */
export function costParagraph(d: OfferData, lang: Lang): string {
  if (d.cost.overrideHtml) return d.cost.overrideHtml;
  const T = costTemplate[lang];
  if (d.cost.style === 'lines') return (d.cost.materials ? T.materials.trimStart() + ' ' : '') + T.closing.trimStart();   // the figures are in the lines above
  const tables = [
    ...d.blocks.filter((b): b is MeasuresBlock => b.type === 'measures'),
    ...objectLists(d).map((l): MeasuresBlock => ({ type: 'measures', kind: 'main', rows: l.rows.map((r) => ({ ...r, desc: '' })) })),
  ];
  const mains = tables.filter((t) => t.kind === 'main');
  const options = mains.filter((t) => t.option && !t.common);  // alternatives (only when a table carries an option label)
  const commonTables = mains.filter((t) => !t.option || t.common);
  const common = commonTables.flatMap((t) => t.rows);
  const asOptions = options.length >= 2;
  const main = sumHours(asOptions ? common : mains.flatMap((t) => t.rows));
  const opt = sumHours(tables.filter((t) => t.kind === 'optional').flatMap((t) => t.rows));
  const hasOpt = opt.max > 0;
  const r = d.rate;

  let out = T.base;
  if (d.cost.deliveryFrom) {
    const pickup = d.cost.pickupFrom ? fill(T.pickup, { pickup: fmtLongDate(d.cost.pickupFrom, lang) }) : '';
    out += fill(T.delivery, { delivery: fmtLongDate(d.cost.deliveryFrom, lang), pickup });
  }
  if (asOptions) {
    const list = options.map((t) => {
      const s = sumHours([...common, ...t.rows]);
      return fill(T.optionItem, { label: [...commonTables.map((c) => c.option).filter(Boolean), t.option].join(' + '), hours: fmtHours(s.min, s.max), chf: fmtChfRange(s.min * r, s.max * r) });
    }).join('; ');
    out += fill(T.effortOptions, { rate: String(r), list });
  } else {
    out += fill(T.effort, { hours: fmtHours(main.min, main.max), rate: String(r) });
    out += fill(T.cost, { costWord: d.cost.materials ? T.costWordLabour : T.costWordPlain, chf: fmtChfRange(main.min * r, main.max * r) });
  }
  if (hasOpt) out += fill(T.optional, { detail: d.cost.optionalDetail ? ` (${d.cost.optionalDetail})` : '', hours: fmtHours(opt.min, opt.max), chf: fmtChfRange(opt.min * r, opt.max * r) });
  if (d.cost.materials) out += T.materials;
  out += T.closing;
  return out;
}
