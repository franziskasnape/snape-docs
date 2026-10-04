import type { Lang, Party, RenderContext } from './types';
import { imageSize } from './imageSize';

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
/** Dimensions of every image referenced in a document's data; missing ones are read from R2 once and stored. */
export async function loadImageDims(env: Env, dataJson: string): Promise<Record<number, { w: number; h: number }>> {
  const ids = [...new Set([...dataJson.matchAll(/"imageId":\s*(\d+)/g)].map((m) => Number(m[1])))];
  const dims: Record<number, { w: number; h: number }> = {};
  for (const id of ids) {
    const row = await env.DB.prepare('SELECT r2_key, width, height FROM images WHERE id = ?').bind(id).first<{ r2_key: string; width: number | null; height: number | null }>();
    if (!row) continue;
    if (row.width && row.height) { dims[id] = { w: row.width, h: row.height }; continue; }
    const obj = await env.IMAGES.get(row.r2_key);
    const size = obj ? imageSize(await obj.arrayBuffer()) : null;
    if (size) { dims[id] = size; await env.DB.prepare('UPDATE images SET width = ?, height = ? WHERE id = ?').bind(size.w, size.h, id).run(); }
  }
  return dims;
}

export async function buildContext(env: Env, doc: DocRow, imageSrc: RenderContext['imageSrc'], dataJson?: string): Promise<RenderContext> {
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
    imageDims: await loadImageDims(env, dataJson ?? doc.data ?? ''),
  };
}

import type { Settings } from './types';

export async function getSettings(env: Env): Promise<Settings> {
  const { results } = await env.DB.prepare('SELECT key, value FROM settings').all<{ key: string; value: string }>();
  const m = Object.fromEntries(results.map((r) => [r.key, JSON.parse(r.value)]));
  return { hourlyRate: m.hourly_rate ?? 100, validityDays: m.validity_days ?? 90, defaultLang: m.default_lang ?? 'de' };
}

/** Next number for a type prefix in the given year: ANG-2026-005 */
export async function nextNumber(env: Env, prefix: string, year: number): Promise<string> {
  const like = `${prefix}-${year}-%`;
  const { results } = await env.DB.prepare('SELECT number FROM documents WHERE number LIKE ?').bind(like).all<{ number: string }>();
  const max = results.reduce((a, r) => Math.max(a, Number(r.number.split('-')[2]) || 0), 0);
  return `${prefix}-${year}-${String(max + 1).padStart(3, '0')}`;
}
