import type { OfferData } from './zod';
import type { TextField } from '../../core/types';

/**
 * The wording of an offer that a proofreader may look at: every field a person typed that is printed.
 * Not included: private notes, hours, prices, dates, client data. Paths are JSON Pointers into the document view
 * ({title,status,…,data}) with "@id" for array items, the same paths PATCH accepts.
 */
export function offerTextFields(d: OfferData): TextField[] {
  const out: TextField[] = [];
  const add = (path: string, text: string | undefined, label: string, html = false) => { if (text && text.trim()) out.push({ path, text, label, html }); };
  add('/data/meta/title', d.meta?.title, 'Title');
  add('/data/meta/eyebrow', d.meta?.eyebrow, 'Eyebrow');
  if (d.overview) { add('/data/overview/caption', d.overview.caption, 'Overview photo caption'); add('/data/overview/note', d.overview.note, 'Overview photo note'); }
  d.blocks.forEach((b, i) => {
    const at = `/data/blocks/${b.id ? '@' + b.id : i}`;
    const where = (s: string) => `Block ${i + 1}: ${s}`;
    switch (b.type) {
      case 'prose':
        add(`${at}/heading`, b.heading, where('heading'));
        b.paragraphs.forEach((p, k) => add(`${at}/paragraphs/${k}`, p, where(`paragraph ${k + 1}`), true));
        (b.bullets ?? []).forEach((p, k) => add(`${at}/bullets/${k}`, p, where(`bullet ${k + 1}`), true));
        break;
      case 'note': add(`${at}/html`, b.html, where('note'), true); break;
      case 'measures':
        b.rows.forEach((r, k) => { const rp = `${at}/rows/${r.id ? '@' + r.id : k}`; add(`${rp}/title`, r.title, where(`row ${k + 1} title`)); add(`${rp}/desc`, r.desc, where(`row ${k + 1} description`)); });
        break;
      case 'objects':
        add(`${at}/heading`, b.heading, where('heading'));
        add(`${at}/defaultText`, b.defaultText, where('shared assessment text'));
        b.rows.forEach((r, k) => {
          const rp = `${at}/rows/${r.id ? '@' + r.id : k}`;
          add(`${rp}/title`, r.title, where(`object ${r.no} title`)); add(`${rp}/technique`, r.technique, where(`object ${r.no} technique`)); add(`${rp}/text`, r.text, where(`object ${r.no} text`));
        });
        break;
    }
  });
  add('/data/cost/optionalDetail', d.cost?.optionalDetail, 'Cost: optional treatment detail');
  add('/data/cost/overrideHtml', d.cost?.overrideHtml, 'Cost summary text (manual)', true);
  return out;
}
