import type { DocType } from './types';

/**
 * Document data carries a schema version in `data.v` (missing = 1). Each doc type lists migrations
 * [v1→v2, v2→v3, …]; data is upgraded whenever it is loaded (for display, rendering, diffing, restoring).
 * Stored history is never rewritten: old snapshots stay as they were saved and are upgraded on read.
 */
export function upgrade<D = any>(dt: Pick<DocType, 'schemaVersion' | 'migrations'>, data: any): D {
  let v: number = data?.v ?? 1;
  let d = data;
  while (v < dt.schemaVersion) {
    d = dt.migrations[v - 1](d) ?? d;
    v++;
    d.v = v;
  }
  return d;
}

export const needsUpgrade = (dt: Pick<DocType, 'schemaVersion'>, data: any) => (data?.v ?? 1) < dt.schemaVersion;

/** Short random id for blocks, rows and photos (stable across edits, used to match items in diffs). */
export const uid = () => crypto.randomUUID().replace(/-/g, '').slice(0, 8);
