import type { DocType } from './types';
import { uid, upgrade } from './migrate';
import { checkEnvelope, documentWrite } from './envelope';

export interface Issue { path: string; message: string }

/** Schema + type-specific checks of a document's `data`. Returns the problems (with paths like "data.blocks.2.rows.0.hoursMin"), or null if it is fine. */
export function checkData(dt: DocType<any>, data: unknown): Issue[] | null {
  const issues: Issue[] = [];
  const v = (data as any)?.v;
  if (typeof v === 'number' && v > dt.schemaVersion) return [{ path: 'data.v', message: `data version ${v} is newer than this app understands (${dt.schemaVersion}): update the app` }];
  if (dt.schema) {
    const r = dt.schema.safeParse(data);
    if (!r.success) {
      for (const i of r.error.issues) issues.push({ path: ['data', ...i.path].join('.'), message: i.message });
    }
  }
  if (!issues.length) { const m = dt.validate?.(data); if (m) issues.push({ path: 'data', message: m }); }
  return issues.length ? issues : null;
}

/** Gives every block, row and photo an id if it has none (callers that build data by hand do not need to invent them). */
export function ensureIds(data: any): any {
  const fill = (a: any) => { if (a && typeof a === 'object' && !a.id) a.id = uid(); };
  for (const b of data?.blocks ?? []) {
    fill(b);
    for (const r of b.rows ?? []) { fill(r); for (const im of r.images ?? []) fill(im); }
  }
  return data;
}

/**
 * Can this history snapshot be restored? Old snapshots are upgraded to the current version first (they are never rewritten),
 * then checked like a normal save. Returns the problems, or null if it can be restored safely.
 */
export function snapshotProblems(dt: DocType<any>, snap: any): Issue[] | null {
  const { title, status, clientId, artwork } = snap ?? {};
  const env = checkEnvelope(documentWrite(dt), Object.fromEntries(Object.entries({ title, status, clientId, artwork }).filter(([, v]) => v !== undefined)));
  const data = checkData(dt, upgrade(dt, JSON.parse(JSON.stringify(snap?.data ?? {}))));
  const all = [...(env ?? []), ...(data ?? [])];
  return all.length ? all : null;
}
