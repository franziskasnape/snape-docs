import { z } from 'zod';

/**
 * The offer data shape as a schema: used to validate every write (editor, scripts, agents) and to publish the JSON Schema
 * (GET /api/doctypes/offer/schema). Unknown extra keys are allowed (older data and future fields must not be rejected);
 * everything that is declared here is type-checked. Keep in step with schema.ts.
 */
const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a date like 2026-10-31');
const id = z.string().optional().describe('Stable id of this item (history uses it). Missing ids are filled in by the server.');
const hours = z.number().min(0);

const imageRef = z.looseObject({ id, imageId: z.number().int().describe('id returned by POST /api/images'), caption: z.string() });

const measureRow = z.looseObject({
  id, title: z.string(), desc: z.string().optional(),
  hoursMin: hours, hoursMax: hours.optional().describe('upper end of the estimate; omit for a fixed figure'),
  images: z.array(imageRef).optional(),
});

const objectRow = z.looseObject({
  id, no: z.string().describe('object number as printed, e.g. "001"'), title: z.string(),
  technique: z.string().optional(), size: z.string().optional().describe('empty prints "?"'),
  text: z.string().optional().describe('this object\'s own assessment text; missing = the block\'s defaultText'),
  hoursMin: hours, hoursMax: hours.optional(), imageId: z.number().int().optional(),
});

const block = z.discriminatedUnion('type', [
  z.looseObject({
    id, type: z.literal('prose'), heading: z.string().optional().describe('custom heading'),
    headingKey: z.enum(['artist', 'condition']).optional().describe('standard heading, translated per document language'),
    paragraphs: z.array(z.string()).describe('HTML paragraphs'), bullets: z.array(z.string()).optional(),
  }),
  z.looseObject({ id, type: z.literal('note'), label: z.enum(['hinweis', 'fazit', 'empfehlung']), html: z.string() }),
  z.looseObject({
    id, type: z.literal('measures'), kind: z.enum(['main', 'optional']).describe('main = proposed treatment (counted in the cost); optional = added separately'),
    option: z.string().optional().describe('label such as "Option A": tables with an option label are offered as alternatives instead of being added up'),
    common: z.boolean().optional().describe('with an option label: needed in every option, added to each option\'s total'),
    rows: z.array(measureRow),
  }),
  z.looseObject({
    id, type: z.literal('objects'), heading: z.string().optional(),
    defaultText: z.string().optional().describe('assessment text shared by all rows without their own'), rows: z.array(objectRow),
  }),
  z.looseObject({ id, type: z.literal('pagebreak') }),
]);

export const offerSchema = z.looseObject({
  v: z.number().int().optional().describe('schema version; older data is upgraded on read'),
  meta: z.looseObject({
    date: iso.describe('offer date'), validUntil: iso.or(z.literal('')).optional(),
    dateAuto: z.boolean().optional().describe('while the offer is a draft, the date follows today'),
    title: z.string().optional(), eyebrow: z.string().optional(),
  }),
  overview: z.looseObject({ imageId: z.number().int(), caption: z.string(), note: z.string().optional(), layout: z.enum(['auto', 'landscape', 'portrait']).optional() }).optional(),
  blocks: z.array(block),
  cost: z.looseObject({
    deliveryFrom: z.string().optional(), pickupFrom: z.string().optional(), materials: z.boolean(),
    optionalDetail: z.string().optional(), overrideHtml: z.string().optional().describe('hand-written cost text; figures in it are NOT recalculated'),
    style: z.enum(['text', 'lines']).optional().describe('lines = rate / effort / cost lines above the text'),
  }),
  rate: hours.describe('hourly rate in CHF'),
  sign: z.looseObject({ enabled: z.boolean().optional(), place: z.string().optional() }).optional(),
  privateNotes: z.string().optional().describe('owner\'s private notes (small HTML); never printed'),
});
