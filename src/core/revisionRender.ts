import { getSettings, loadImageDims, type DocRow, type Env } from './db';
import { getDocType } from './registry';
import { upgrade } from './migrate';
import { replacesOf, type RevisionRow, type RevisionSnapshot } from './revisions';
import { revLabel } from './status';
import type { RenderContext } from './types';

/** Render context for a frozen revision: everything comes from its snapshot, nothing from the working copy. */
export async function revisionContext(env: Env, doc: DocRow, row: RevisionRow, imageSrc: RenderContext['imageSrc']): Promise<{ ctx: RenderContext; data: any }> {
  const snap: RevisionSnapshot = JSON.parse(row.snapshot);
  const st = await getSettings(env);
  const dt = getDocType(doc.type);
  const data = upgrade(dt, snap.data);
  return {
    data,
    ctx: {
      number: snap.number, lang: snap.lang, client: snap.client as any, artwork: snap.artwork, imageSrc,
      imageDims: await loadImageDims(env, JSON.stringify(data)),
      signature: { src: st.signatureImageId ? imageSrc(st.signatureImageId) : '', place: st.signaturePlace, baseline: st.signatureBaseline },
      revision: { no: row.rev_no, label: revLabel(row.rev_no), replaces: await replacesOf(env, doc.id, row.rev_no) },
    },
  };
}

export async function revisionHtml(env: Env, doc: DocRow, row: RevisionRow, origin: string): Promise<string> {
  const dt = getDocType(doc.type);
  const { ctx, data } = await revisionContext(env, doc, row, (id) => `${origin}/img/${id}`);
  return dt.render(data, ctx, { cssHref: `${origin}/house.css`, sealSrc: `${origin}/seal.png` });
}
