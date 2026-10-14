import { Hono } from 'hono';
import { getSettings, type Env } from '../core/db';

export const settings = new Hono<{ Bindings: Env }>();

settings.get('/', async (c) => c.json(await getSettings(c.env)));

settings.put('/', async (c) => {
  const b = await c.req.json<{ hourlyRate?: number; validityDays?: number; defaultLang?: string; signatureImageId?: number | null; signaturePlace?: string; signatureBaseline?: number | null; proofreadRules?: string; proofreadModel?: string; proofreadProvider?: string }>();
  const up = (k: string, v: unknown) => c.env.DB.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(k, JSON.stringify(v));
  const stmts = [];
  if (b.hourlyRate != null && b.hourlyRate > 0) stmts.push(up('hourly_rate', b.hourlyRate));
  if (b.validityDays != null && b.validityDays > 0) stmts.push(up('validity_days', b.validityDays));
  if (b.defaultLang === 'de' || b.defaultLang === 'en') stmts.push(up('default_lang', b.defaultLang));
  if (typeof b.signaturePlace === 'string' && b.signaturePlace.trim() && b.signaturePlace.trim().length <= 60) stmts.push(up('signature_place', b.signaturePlace.trim()));
  if (typeof b.signatureBaseline === 'number' && b.signatureBaseline >= 0 && b.signatureBaseline <= 0.4) stmts.push(up('signature_baseline', b.signatureBaseline));
  if (typeof b.proofreadRules === 'string' && b.proofreadRules.length <= 8000) stmts.push(up('proofread_rules', b.proofreadRules));
  if (typeof b.proofreadModel === 'string' && /^claude-[a-z0-9.-]{2,40}$/.test(b.proofreadModel.trim())) stmts.push(up('proofread_model', b.proofreadModel.trim()));
  if (b.proofreadProvider === 'auto' || b.proofreadProvider === 'api' || b.proofreadProvider === 'local-claude') stmts.push(up('proofread_provider', b.proofreadProvider));
  if (b.signatureImageId === null) stmts.push(up('signature_image_id', null));
  else if (typeof b.signatureImageId === 'number') {
    const img = await c.env.DB.prepare('SELECT id FROM images WHERE id = ?').bind(b.signatureImageId).first();
    if (!img) return c.json({ error: 'unknown image' }, 400);
    stmts.push(up('signature_image_id', b.signatureImageId));
  }
  if (stmts.length) await c.env.DB.batch(stmts);
  return c.json(await getSettings(c.env));
});
