import { parseData, type DocRow, type Env } from './db';

const AUTO_KEEP = 100;       // oldest automatic checkpoints are pruned; manual/status/restore versions are kept

/** Full restorable state of a document: everything the editor can change. */
export async function snapshotOf(env: Env, doc: DocRow) {
  const art = doc.artwork_id ? await env.DB.prepare('SELECT fields FROM artworks WHERE id = ?').bind(doc.artwork_id).first<{ fields: string }>() : null;
  return JSON.stringify({ title: doc.title, status: doc.status, clientId: doc.client_id, artwork: art ? JSON.parse(art.fields) : [], data: parseData(doc) });
}

export async function saveVersion(env: Env, doc: DocRow, kind: string, note?: string | null) {
  await env.DB.prepare('INSERT INTO document_versions (document_id, data, note, kind) VALUES (?,?,?,?)').bind(doc.id, await snapshotOf(env, doc), note || null, kind).run();
  if (kind === 'auto') await env.DB.prepare(`DELETE FROM document_versions WHERE document_id = ? AND kind = 'auto' AND id NOT IN (SELECT id FROM document_versions WHERE document_id = ? AND kind = 'auto' ORDER BY id DESC LIMIT ?)`).bind(doc.id, doc.id, AUTO_KEEP).run();
}
