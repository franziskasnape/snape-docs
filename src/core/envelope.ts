import { z } from 'zod';
import type { DocType } from './types';
import type { Issue } from './validate';

/**
 * Everything about a document except its type-specific `data`: the part that is the same for offers, invoices and reports.
 * Used to check every create and save, and to generate the OpenAPI components.
 */
export const artworkLine = z.object({ k: z.string().describe('label, e.g. "Titel"'), v: z.string() });

const common = (dt: Pick<DocType, 'statuses'>) => ({
  title: z.string().nullable().describe('shown in the document list; empty = the first Objekt line'),
  status: z.enum(dt.statuses as [string, ...string[]]),
  lang: z.enum(['de', 'en']).describe('language of the printed document'),
  clientId: z.number().int().nullable(),
  artwork: z.array(artworkLine).describe('Objekt lines (key/value), printed under "Objekt"'),
});

/** Body of PUT /api/documents/:id (any subset). Unknown fields are refused so that a typo cannot silently do nothing. */
export const documentWrite = (dt: Pick<DocType, 'statuses'>) => z.strictObject({
  ...common(dt), data: z.unknown().describe('type specific, see /api/doctypes/{type}/schema'),
  baseRev: z.number().int().describe('revision you last read; the save is refused (409) if the document changed since'),
}).partial();

/** Body of POST /api/documents. */
export const documentCreate = (dt: Pick<DocType, 'statuses'>) => z.strictObject({
  ...common(dt), type: z.string().default('offer'), data: z.unknown().describe('type specific; may be partial, the rest comes from the defaults'),
  duplicateOf: z.number().int().describe('copy this document instead (other fields are ignored)'),
}).partial();

/** What GET /api/documents/:id returns. */
export const documentRead = (dt: Pick<DocType, 'statuses'>) => z.object({
  id: z.number().int(), type: z.string(), number: z.string(), ...common(dt),
  client: z.record(z.string(), z.unknown()).nullable(), data: z.unknown(),
  schemaVersion: z.number().int().describe('version of `data` as returned (always the current one: older data is upgraded on read)'),
  updatedAt: z.string(), rev: z.number().int().describe('send back as baseRev / If-Match when saving'),
});

export function checkEnvelope(schema: z.ZodType, body: unknown): Issue[] | null {
  const r = schema.safeParse(body);
  if (r.success) return null;
  return r.error.issues.map((i) => ({
    path: i.code === 'unrecognized_keys' ? i.keys.join(', ') : i.path.join('.') || '(body)',
    message: i.code === 'unrecognized_keys' ? `unknown field${i.keys.length > 1 ? 's' : ''}: use only title, status, lang, clientId, artwork, data, baseRev (create: type, duplicateOf)` : i.message,
  }));
}
