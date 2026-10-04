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
