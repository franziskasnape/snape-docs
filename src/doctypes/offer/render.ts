import type { DocType, RenderContext } from '../../core/types';
import { common } from '../../core/i18n';
import { fmtDate } from '../../core/format';
import { frame, type FrameOptions } from '../../core/render/frame';
import { kv, note, overviewFigure, pageBreak, prose } from '../../core/render/blocks/basic';
import { measures } from '../../core/render/blocks/measures';
import { esc } from '../../core/format';
import { costParagraph } from './cost';
import { offerLabels } from './i18n';
import type { OfferData } from './schema';

export type OfferRenderOptions = Pick<FrameOptions, 'cssHref' | 'inlineCss' | 'sealSrc' | 'paged' | 'pagedSrc'>;

export function renderOffer(d: OfferData, ctx: RenderContext, opts: OfferRenderOptions = {}): string {
  const L = offerLabels[ctx.lang], C = common[ctx.lang];
  const c = ctx.client;

  const clientLines = [
    { k: C.clientName, v: c.name ?? '' }, { k: C.clientAddress, v: c.address ?? '' }, { k: C.clientContact, v: c.contact ?? '' },
    { k: C.phone, v: c.phone ?? '' }, { k: C.email, v: c.email ?? '' },
  ];
  const info = `<div class="info-grid"><div class="info-stack">${kv(C.object, ctx.artwork)}${kv(C.client, clientLines)}</div>`
    + overviewFigure(ctx, d.overview, d.overview?.note) + `</div>`;

  const blocks = d.blocks.map((b) => {
    switch (b.type) {
      case 'prose': return prose(b.heading, b.paragraphs);
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

  const sign = `<div class="sign-group">
    <div class="sign-block"><div class="sign-box"><div class="sign-rule"></div><div class="sign-caption">${C.signPlace}</div></div>
      <div class="sign-box"><div class="sign-rule"></div><div class="sign-caption">${C.signMaker}</div></div></div>
    <div class="sign-block"><div class="sign-box"><div class="sign-rule"></div><div class="sign-caption">${C.signPlace}</div></div>
      <div class="sign-box"><div class="sign-rule"></div><div class="sign-caption">${C.signClient}</div></div></div></div>`;

  const body = `<div class="doc-title-row"><div class="doc-eyebrow">${esc(d.meta.eyebrow ?? L.eyebrow)}</div>
    <div class="doc-title">${esc(d.meta.title ?? L.title)}</div></div><div class="hr"></div>
    ${info}${blocks}
    <div class="section-heading">${esc(L.costHeading)}</div><div class="section-body">${costParagraph(d, ctx.lang)}</div>
    ${sign}`;

  return frame({
    lang: ctx.lang,
    title: `Snape-Conservation_${ctx.number}_${ctx.lang === 'de' ? 'Angebot' : 'Offer'}`,
    metaRows: [[L.number, ctx.number], [C.date, fmtDate(d.meta.date)], [L.validUntil, fmtDate(d.meta.validUntil)]],
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
  defaultData: (_lang, settings, today) => ({
    meta: { date: today, validUntil: addDays(today, settings.validityDays) },
    blocks: [{ type: 'measures', kind: 'main', rows: [] }],
    cost: { materials: true },
    rate: settings.hourlyRate,
  }),
  defaultArtwork: (lang) => (lang === 'de'
    ? ['Künstler/in', 'Titel', 'Technik / Material', 'Masse (H × B × T)']
    : ['Artist', 'Title', 'Technique / Material', 'Dimensions (H × W × D)']).map((k) => ({ k, v: '' })),
  render: (d, ctx) => renderOffer(d, ctx),
};
