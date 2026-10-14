import type { DocType } from './types';
import { uid } from './migrate';

export interface Issue { path: string; message: string }

/** Schema + type-specific checks of a document's `data`. Returns the problems (with paths like "data.blocks.2.rows.0.hoursMin"), or null if it is fine. */
export function checkData(dt: DocType<any>, data: unknown): Issue[] | null {
  const issues: Issue[] = [];
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
