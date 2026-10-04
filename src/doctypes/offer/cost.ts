import type { Lang } from '../../core/types';
import { chf, fmtChfRange, fmtHours, fmtLongDate } from '../../core/format';
import { sumHours } from '../../core/render/blocks/measures';
import { costTemplate } from './i18n';
import type { OfferData } from './schema';
import type { MeasuresBlock } from '../../core/render/blocks/measures';

const fill = (s: string, vars: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');

/** Kostenaufstellung paragraph: template + toggles, numbers computed from the measures tables. */
export function costParagraph(d: OfferData, lang: Lang): string {
  if (d.cost.overrideHtml) return d.cost.overrideHtml;
  const T = costTemplate[lang];
  const tables = d.blocks.filter((b): b is MeasuresBlock => b.type === 'measures');
  const main = sumHours(tables.filter((t) => t.kind === 'main').flatMap((t) => t.rows));
  const opt = sumHours(tables.filter((t) => t.kind === 'optional').flatMap((t) => t.rows));
  const hasOpt = opt.max > 0;
  const r = d.rate;

  let out = T.base;
  if (d.cost.deliveryFrom) {
    const pickup = d.cost.pickupFrom ? fill(T.pickup, { pickup: fmtLongDate(d.cost.pickupFrom, lang) }) : '';
    out += fill(T.delivery, { delivery: fmtLongDate(d.cost.deliveryFrom, lang), pickup });
  }
  out += fill(T.effort, { hours: fmtHours(main.min, main.max), rate: String(r) });
  out += fill(T.cost, { costWord: d.cost.materials ? T.costWordLabour : T.costWordPlain, chf: fmtChfRange(main.min * r, main.max * r) });
  if (hasOpt) out += fill(T.optional, { hours: fmtHours(opt.min, opt.max), chf: fmtChfRange(opt.min * r, opt.max * r) });
  if (d.cost.materials) out += T.materials;
  out += T.closing;
  return out;
}
