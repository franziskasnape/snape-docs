import { Hono } from 'hono';
import { getSettings, type Env } from '../core/db';

export const settings = new Hono<{ Bindings: Env }>();

settings.get('/', async (c) => c.json(await getSettings(c.env)));

settings.put('/', async (c) => {
  const b = await c.req.json<{ hourlyRate?: number; validityDays?: number; defaultLang?: string }>();
  const up = (k: string, v: unknown) => c.env.DB.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(k, JSON.stringify(v));
  const stmts = [];
  if (b.hourlyRate != null && b.hourlyRate > 0) stmts.push(up('hourly_rate', b.hourlyRate));
  if (b.validityDays != null && b.validityDays > 0) stmts.push(up('validity_days', b.validityDays));
  if (b.defaultLang === 'de' || b.defaultLang === 'en') stmts.push(up('default_lang', b.defaultLang));
  if (stmts.length) await c.env.DB.batch(stmts);
  return c.json(await getSettings(c.env));
});
