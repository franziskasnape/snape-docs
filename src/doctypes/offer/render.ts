import type { DocType, RenderContext } from '../../core/types';
import { common } from '../../core/i18n';
import { fmtDate, fmtLongDate } from '../../core/format';
import { uid } from '../../core/migrate';
import { offerMigrations } from './migrations';
import { frame, type FrameOptions } from '../../core/render/frame';
import { kv, note, overviewFigure, pageBreak, prose } from '../../core/render/blocks/basic';
import { measures } from '../../core/render/blocks/measures';
import { esc } from '../../core/format';
import { costParagraph } from './cost';
import { offerLabels } from './i18n';
import type { OfferData } from './schema';

export type OfferRenderOptions = Pick<FrameOptions, 'cssHref' | 'inlineCss' | 'sealSrc'>;

export function renderOffer(d: OfferData, ctx: RenderContext, opts: OfferRenderOptions = {}): string {
  const L = offerLabels[ctx.lang], C = common[ctx.lang];
  const c = ctx.client;

  const clientLines = [
    { k: C.clientName, v: c.name ?? '' }, { k: C.clientAddress, v: c.address ?? '' }, { k: C.clientContact, v: c.contact ?? '' },
    { k: C.phone, v: c.phone ?? '' }, { k: C.email, v: c.email ?? '' },
  ];
  const info = `<div class="info-grid"><div class="info-stack">${kv(C.object, ctx.artwork)}${kv(C.client, clientLines)}</div>`
    + overviewFigure(ctx, d.overview, d.overview?.note, d.overview?.layout) + `</div>`;

  let content = d.blocks;
  while (content.length && content[content.length - 1].type === 'pagebreak') content = content.slice(0, -1);   // the final page starts on a new page anyway
  const blocks = content.map((b) => {
    switch (b.type) {
      case 'prose': return prose(b.headingKey ? L.sections[b.headingKey] : b.heading, b.paragraphs);
      case 'note': return note(L.notes[b.label], b.html);
      case 'pagebreak': return pageBreak();
      case 'measures': return measures(ctx, b, {
        heading: b.kind === 'main' ? L.measures : L.optional,
        rateNote: L.rate.replace('{rate}', String(d.rate)),
        descCol: L.descCol, hoursCol: L.hoursCol,
        totalLabel: b.kind === 'main' ? L.totalMain : L.totalOptional,
        hoursUnit: L.hoursUnit, approx: ctx.lang === 'de' ? 'ca.' : 'approx.',
      });
    }
  }).join('\n');

  // The contractor line (first row) comes pre-filled: "<place>, <offer date>" and the owner's signature image.
  const sg = d.sign ?? {}, signing = sg.enabled !== false;
  const place = (sg.place?.trim() || ctx.signature?.place || '').trim();
  const dateText = d.meta.date ? (ctx.lang === 'de' ? fmtDate(d.meta.date) : fmtLongDate(d.meta.date, 'en')) : '';
  const fillText = signing ? [place, dateText].filter(Boolean).join(', ') : '';
  // The picture's strokes reach `baseline` (a fraction of its height) below its own baseline: lower the image by that much,
  // so the signature stands ON the form's line, with the lower strokes crossing it.
  const SIG_H = 14;                                                      // mm
  const drop = ((ctx.signature?.baseline ?? 0.12) * SIG_H).toFixed(2);
  const sigImg = signing && ctx.signature?.src ? `<img class="sign-image" src="${esc(ctx.signature.src)}" alt="" style="height:${SIG_H}mm;margin-bottom:-${drop}mm">` : '';
  const sign = `<div class="sign-group">
    <div class="sign-block"><div class="sign-box"><div class="sign-rule${fillText ? ' filled' : ''}">${fillText ? `<span class="sign-text">${esc(fillText)}</span>` : ''}</div><div class="sign-caption">${C.signPlace}</div></div>
      <div class="sign-box"><div class="sign-rule${sigImg ? ' filled has-image' : ''}">${sigImg}</div><div class="sign-caption">${C.signMaker}</div></div></div>
    <div class="sign-block"><div class="sign-box"><div class="sign-rule"></div><div class="sign-caption">${C.signPlace}</div></div>
      <div class="sign-box"><div class="sign-rule"></div><div class="sign-caption">${C.signClient}</div></div></div></div>`;

  const body = `<div class="doc-title-row"><div class="doc-eyebrow">${esc(d.meta.eyebrow ?? L.eyebrow)}</div>
    <div class="doc-title">${esc(d.meta.title ?? L.title)}</div></div><div class="hr"></div>
    ${info}${blocks}
    <section class="final-page">
      <div class="section-heading">${esc(L.costHeading)}</div><div class="section-body">${costParagraph(d, ctx.lang)}</div>
      ${sign}
    </section>`;

  return frame({
    lang: ctx.lang,
    title: `Snape-Conservation_${ctx.number}_${ctx.lang === 'de' ? 'Angebot' : 'Offer'}`,
    metaRows: [[L.number, ctx.number], ...(d.meta.date ? [[C.date, fmtDate(d.meta.date)] as [string, string]] : []), ...(d.meta.validUntil ? [[L.validUntil, fmtDate(d.meta.validUntil)] as [string, string]] : [])],
    body, ...opts,
  });
}

const addDays = (iso: string, n: number) => {
  const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
};

export const offerType: DocType<OfferData> = {
  id: 'offer', prefix: 'ANG',
  labels: { de: 'Angebot', en: 'Offer' },
  statuses: ['draft', 'sent', 'accepted', 'declined'],
  schemaVersion: 2,
  migrations: offerMigrations,
  defaultData: (_lang, settings, today) => ({
    v: 2,
    meta: { date: today, validUntil: addDays(today, settings.validityDays) },
    blocks: [
      { id: uid(), type: 'prose', headingKey: 'artist', paragraphs: [''] },
      { id: uid(), type: 'prose', headingKey: 'condition', paragraphs: [''] },
      { id: uid(), type: 'measures', kind: 'main', rows: [] },
    ],
    cost: { materials: true },
    rate: settings.hourlyRate,
  }),
  defaultArtwork: (lang) => (lang === 'de'
    ? ['Künstler/in', 'Titel', 'Technik / Material', 'Masse (H × B × T)']
    : ['Artist', 'Title', 'Technique / Material', 'Dimensions (H × W × D)']).map((k) => ({ k, v: '' })),
  render: (d, ctx, opts) => renderOffer(d, ctx, opts),
  validate: (d) => {
    const iso = /^\d{4}-\d{2}-\d{2}$/;
    if (!iso.test(d.meta?.date ?? '')) return 'The offer date is missing or not a valid date';
    if (d.meta?.validUntil && !iso.test(d.meta.validUntil)) return '“Valid until” is not a valid date';
    return null;
  },
  costText: (d, lang) => costParagraph({ ...d, cost: { ...d.cost, overrideHtml: undefined } }, lang),
};
