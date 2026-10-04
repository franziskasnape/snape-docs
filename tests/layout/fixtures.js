/**
 * Invented offers for layout tests. NOTHING here comes from a real job: all names, texts and numbers are made up.
 * Deterministic (seeded) so a failing layout can be reproduced exactly.
 */
import { png, dataUri } from './png.js';

// seeded random numbers (mulberry32)
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const SENTENCES_DE = [
  'Die Oberfläche zeigt feine Verschmutzungen, die sich in den vertieften Partien angesammelt haben.',
  'Vor der Behandlung werden an unauffälligen Stellen Proben durchgeführt, um die Empfindlichkeit zu beurteilen.',
  'Die Ergebnisse werden dokumentiert und mit dem Auftraggeber besprochen, bevor weitere Schritte erfolgen.',
  'Bei Bedarf wird das Vorgehen angepasst, und einzelne Bereiche werden zurückgestellt.',
  'Lose aufliegende Ablagerungen werden vorsichtig mit weichen Pinseln und einem Staubsauger mit Filter entfernt.',
  'Anschliessend erfolgt eine schonende Reinigung mit geeigneten Medien unter laufender Kontrolle.',
  'Die Randbereiche werden separat beurteilt und, falls erforderlich, lokal gefestigt.',
  'Die Massnahme wird fotografisch dokumentiert und im Abschlussbericht festgehalten.',
];
const TITLES_DE = ['Untersuchung und Dokumentation', 'Oberflächenreinigung', 'Festigung gefährdeter Bereiche', 'Kittung und Retusche', 'Rückseitenschutz',
  'Reinigungsproben', 'Behandlung des Bildträgers', 'Randbereiche', 'Zwischendokumentation', 'Spannrahmen', 'Verglasung und Rahmung', 'Aufhängung',
  'Firnisprobe', 'Abschlussreinigung', 'Abschlussdokumentation', 'Lokale Anpassung', 'Kontrolle nach der Behandlung', 'Verpackung für den Rücktransport'];

export function words(r, nSentences) { return Array.from({ length: nSentences }, () => SENTENCES_DE[Math.floor(r() * SENTENCES_DE.length)]).join(' '); }

// photo library: ids 1..4 (square, wide, tall, square)
const PHOTO_SIZES = [[200, 200], [300, 200], [200, 300], [220, 220]];
export const photos = Object.fromEntries(PHOTO_SIZES.map(([w, h], i) => [i + 1, { w, h, uri: dataUri(png(w, h, i + 1)) }]));
export const imageSrc = (id) => photos[id]?.uri ?? photos[1].uri;
export const imageDims = Object.fromEntries(Object.entries(photos).map(([id, p]) => [id, { w: p.w, h: p.h }]));

const row = (r, i, { sentences, photoRate, hoursMax = true }) => {
  const n = r() < photoRate ? (r() < 0.4 ? 2 : 1) : 0, lo = 1 + Math.floor(r() * 4);
  return {
    id: `r${i}`, title: TITLES_DE[i % TITLES_DE.length] + (i >= TITLES_DE.length ? ` ${Math.floor(i / TITLES_DE.length) + 1}` : ''),
    desc: words(r, sentences(r)), hoursMin: lo, ...(hoursMax && r() < 0.7 ? { hoursMax: lo + 1 + Math.floor(r() * 3) } : {}),
    ...(n ? { images: Array.from({ length: n }, (_, k) => ({ id: `r${i}p${k}`, imageId: 1 + Math.floor(r() * 4), caption: `Detail ${i + 1}.${k + 1} (Beispiel)` })) } : {}),
  };
};

/**
 * An offer built from invented content.
 *  rows / optionalRows   number of treatment rows
 *  rowSentences          () => sentences per description (realistic: 1..4; extreme: 6..14)
 *  prose                 paragraphs [artist, condition, extra]
 */
export function makeOffer({ seed = 1, rows = 10, optionalRows = 2, rowSentences = (r) => 1 + Math.floor(r() * 4), photoRate = 0.35, prose = [2, 3, 1], proseSentences = 4, overviewPortrait = false, extraBefore = 0 } = {}) {
  const r = rng(seed);
  const paras = (n) => Array.from({ length: n }, () => words(r, 2 + Math.floor(r() * proseSentences)));
  const artist = paras(prose[0]), condition = paras(prose[1]);
  if (extraBefore) condition[0] += ' ' + words(r, extraBefore);
  const blocks = [
    { id: 'b1', type: 'prose', headingKey: 'artist', paragraphs: artist },
    { id: 'b2', type: 'prose', headingKey: 'condition', paragraphs: condition },
    { id: 'b3', type: 'measures', kind: 'main', rows: Array.from({ length: rows }, (_, i) => row(r, i, { sentences: rowSentences, photoRate })) },
  ];
  if (prose[2]) blocks.push({ id: 'b4', type: 'prose', paragraphs: paras(prose[2]) });
  if (optionalRows) blocks.push({ id: 'b5', type: 'measures', kind: 'optional', rows: Array.from({ length: optionalRows }, (_, i) => row(r, 100 + i, { sentences: rowSentences, photoRate })) });
  blocks.push({ id: 'b6', type: 'note', label: 'hinweis', html: words(r, 2) });
  return {
    v: 2, meta: { date: '2026-10-04', validUntil: '2027-01-02' }, rate: 100,
    overview: { imageId: overviewPortrait ? 3 : 2, caption: 'Gesamtansicht vor der Behandlung' },
    cost: { deliveryFrom: '2026-11-05', materials: true }, blocks,
  };
}

export const context = (lang = 'de') => ({
  number: 'ANG-2099-001', lang,
  client: { name: 'Beispiel AG', address: 'Musterstrasse 1, 8000 Musterstadt', contact: 'Erika Muster', phone: '+41 00 000 00 00', email: 'info@example.invalid' },
  artwork: [{ k: 'Künstler/in', v: 'Beispiel Künstler (erfunden)' }, { k: 'Titel', v: 'Teststudie' }, { k: 'Technik / Material', v: 'Öl auf Leinwand' }, { k: 'Masse (H × B × T)', v: '80 × 100 × 3 cm' }],
  imageSrc, imageDims,
});
