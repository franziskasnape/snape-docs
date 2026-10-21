import app from '../../package.json';
import engine from '../../node_modules/@vivliostyle/core/package.json';
import type { DocType } from './types';
import type { Env } from './db';

/**
 * What a revision was sent WITH. The offer data is frozen in the revision itself; this records how it was laid out, so that a
 * "legacy rendering" can be reconstructed later:
 *  - `houseCss` / `engineJs` / `fonts` are git blob ids (what `git hash-object <file>` prints): find the exact file in the
 *    repository history with `git log --all --find-object=<id>` and check that version out.
 *  - `renderVersion` is bumped by hand whenever the printed output of a document type changes in a way old revisions should
 *    keep (see docs/DEVELOPMENT.md, "Legacy rendering").
 */
export interface RenderMeta {
  recordedAt: string;
  /** true when the revision was recorded after the fact (an offer sent before this existed): the values describe the app at recording time, not at sending time */
  recordedLate: boolean;
  app: { name: string; version: string; commit?: string };
  docType: string; schemaVersion: number; renderVersion: number;
  houseCss?: string; engineJs?: string; engine: { name: string; version: string };
  fonts: Record<string, string>;
}

/** The git blob id of some bytes: SHA-1 of "blob <length>\0" + the bytes, as `git hash-object` computes it. */
export async function gitBlobId(bytes: Uint8Array): Promise<string> {
  const head = new TextEncoder().encode(`blob ${bytes.length}\0`);
  const all = new Uint8Array(head.length + bytes.length);
  all.set(head, 0); all.set(bytes, head.length);
  return [...new Uint8Array(await crypto.subtle.digest('SHA-1', all))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function assetId(env: Env, path: string): Promise<string | undefined> {
  try {
    const r = await env.ASSETS.fetch(new Request(`https://assets.invalid${path}`));
    return r.ok ? await gitBlobId(new Uint8Array(await r.arrayBuffer())) : undefined;
  } catch { return undefined; }
}

const FONTS = ['Synonym-400.otf', 'Synonym-600.otf', 'Synonym-700.otf', 'Amulya-400.otf', 'Amulya-600.otf'];

export async function currentRenderMeta(env: Env, dt: Pick<DocType, 'id' | 'schemaVersion' | 'renderVersion'>, recordedLate = false): Promise<RenderMeta> {
  const fonts: Record<string, string> = {};
  for (const f of FONTS) { const id = await assetId(env, `/fonts/${f}`); if (id) fonts[f] = id; }
  return {
    recordedAt: new Date().toISOString(), recordedLate,
    app: { name: app.name, version: app.version, ...(env.APP_COMMIT ? { commit: env.APP_COMMIT } : {}) },
    docType: dt.id, schemaVersion: dt.schemaVersion, renderVersion: dt.renderVersion,
    houseCss: await assetId(env, '/house.css'), engineJs: await assetId(env, '/vivliostyle.js'),
    engine: { name: '@vivliostyle/core', version: engine.version },
    fonts,
  };
}
