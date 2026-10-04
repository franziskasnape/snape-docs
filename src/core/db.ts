import type { Lang, Party, RenderContext } from './types';

export interface Env { DB: D1Database; IMAGES: R2Bucket; ASSETS: Fetcher }

export interface DocRow {
  id: number; type: string; number: string; lang: Lang; status: string;
  client_id: number | null; artwork_id: number | null; parent_id: number | null;
  title: string | null; data: string; created_at: string; updated_at: string;
}

export async function getDocument(env: Env, id: number): Promise<DocRow | null> {
  return env.DB.prepare('SELECT * FROM documents WHERE id = ?').bind(id).first<DocRow>();
}

/** Everything a renderer needs besides doc.data. */
export async function buildContext(env: Env, doc: DocRow, imageSrc: RenderContext['imageSrc']): Promise<RenderContext> {
  const client = doc.client_id
    ? await env.DB.prepare('SELECT name,address,contact,phone,email FROM clients WHERE id = ?').bind(doc.client_id).first<Party>()
    : null;
  const art = doc.artwork_id
    ? await env.DB.prepare('SELECT fields FROM artworks WHERE id = ?').bind(doc.artwork_id).first<{ fields: string }>()
    : null;
  return {
    number: doc.number, lang: doc.lang,
    client: client ?? {},
    artwork: art ? JSON.parse(art.fields) : [],
    imageSrc,
  };
}
