import { getDocument, parseData, type DocRow, type Env } from './db';
import { getDocType } from './registry';
import { todayInStudioZone } from './format';
import { checkData, type Issue } from './validate';
import { DECISIONS, ISO_DATE, isDecision, moveFor, revLabel, transitionHelp, type Decision } from './status';
import { saveVersion } from './versions';
import { currentRenderMeta } from './renderMeta';
import type { Lang, DocType } from './types';

/** Why a status change or revision action was refused (turned into a JSON error by the routes). */
export class RevisionError extends Error {
  constructor(public code: 'invalid_transition' | 'validation' | 'not_found' | 'locked' | 'bad_request', message: string, public status = 422, public issues?: Issue[]) { super(message); }
}

export interface RevisionSnapshot {
  number: string; lang: Lang; title: string | null; revision: number;
  clientId: number | null; client: Record<string, unknown>; artwork: { k: string; v: string }[]; data: any;
}
export interface RevisionRow {
  id: number; document_id: number; rev_no: number; status: string; snapshot: string; render_meta: string | null;
  sent_at: string; sent_note: string | null; decided_at: string | null; decided_note: string | null; created_at: string;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
/** Private notes are never printed, so editing them never counts as changing the offer. */
const withoutPrivate = (d: any) => { if (!d || typeof d !== 'object') return d; const { privateNotes, ...rest } = d; return rest; };
export const sameContent = (a: any, b: any) => same(withoutPrivate(a), withoutPrivate(b));

export async function artworkOf(env: Env, doc: Pick<DocRow, 'artwork_id'>): Promise<{ k: string; v: string }[]> {
  const art = doc.artwork_id ? await env.DB.prepare('SELECT fields FROM artworks WHERE id = ?').bind(doc.artwork_id).first<{ fields: string }>() : null;
  return art ? JSON.parse(art.fields) : [];
}
async function clientOf(env: Env, clientId: number | null) {
  return clientId ? (await env.DB.prepare('SELECT name,address,contact,phone,email FROM clients WHERE id = ?').bind(clientId).first<Record<string, unknown>>()) ?? {} : {};
}

export async function listRevisionRows(env: Env, documentId: number): Promise<RevisionRow[]> {
  return (await env.DB.prepare('SELECT * FROM revisions WHERE document_id = ? ORDER BY rev_no').bind(documentId).all<RevisionRow>()).results;
}
export async function getRevisionRow(env: Env, documentId: number, revNo: number): Promise<RevisionRow | null> {
  return env.DB.prepare('SELECT * FROM revisions WHERE document_id = ? AND rev_no = ?').bind(documentId, revNo).first<RevisionRow>();
}

/** The public shape of a revision (no snapshot): label, dates, notes, headline figures. */
export function publicRevision(row: RevisionRow, dt: DocType<any>) {
  const snap: RevisionSnapshot = JSON.parse(row.snapshot);
  return {
    revNo: row.rev_no, label: revLabel(row.rev_no), status: row.status,
    sentAt: row.sent_at, sentNote: row.sent_note, decidedAt: row.decided_at, decidedNote: row.decided_note,
    summary: dt.summary?.(snap.data) ?? null,
    renderMeta: row.render_meta ? JSON.parse(row.render_meta) : null,        // null = recorded before this was kept
  };
}

/** The date a revision replaces: the previous revision's sent date (for the printed "Replaces Rev. A of …"). */
export async function replacesOf(env: Env, documentId: number, revNo: number): Promise<{ label: string; date: string } | undefined> {
  if (revNo <= 1) return undefined;
  const prev = await getRevisionRow(env, documentId, revNo - 1);
  return prev ? { label: revLabel(prev.rev_no), date: prev.sent_at } : undefined;
}

async function freeze(env: Env, doc: DocRow, data: any, artwork: { k: string; v: string }[], clientId: number | null): Promise<RevisionSnapshot> {
  return { number: doc.number, lang: doc.lang, title: doc.title, revision: doc.revision, clientId, client: await clientOf(env, clientId), artwork, data: withoutPrivate(data) };
}

/**
 * Mark the current revision as sent: a permanent copy of the offer exactly as it is now.
 * `from` (optional) freezes an earlier state instead (an offer that was sent before revisions existed).
 */
export async function markSent(env: Env, doc: DocRow, opts: { sentAt?: string; note?: string; from?: { data: any; artwork: { k: string; v: string }[]; clientId: number | null; title?: string | null } } = {}): Promise<void> {
  const dt = getDocType(doc.type);
  const sentAt = opts.sentAt ?? todayInStudioZone();
  if (!ISO_DATE.test(sentAt)) throw new RevisionError('bad_request', 'the sent date must look like 2026-10-31', 422);
  if (!opts.from && doc.status !== 'draft') throw new RevisionError('invalid_transition', transitionHelp(doc.status, 'sent'));
  if (await getRevisionRow(env, doc.id, doc.revision)) throw new RevisionError('invalid_transition', `revision ${revLabel(doc.revision)} was already sent`);
  const data = opts.from?.data ?? parseData(doc);
  const issues = checkData(dt, data);
  if (issues) throw new RevisionError('validation', 'The offer is not valid yet, fix this before sending it', 422, issues);
  const artwork = opts.from?.artwork ?? await artworkOf(env, doc);
  const clientId = opts.from ? opts.from.clientId : doc.client_id;
  const snapshot = await freeze(env, { ...doc, title: opts.from?.title ?? doc.title } as DocRow, data, artwork, clientId);

  await saveVersion(env, doc, 'status', `Revision ${revLabel(doc.revision)} sent ${sentAt}`);
  const stmts = [
    env.DB.prepare('INSERT INTO revisions (document_id, rev_no, status, snapshot, sent_at, sent_note, render_meta) VALUES (?,?,?,?,?,?,?)').bind(doc.id, doc.revision, 'sent', JSON.stringify(snapshot), sentAt, opts.note || null, JSON.stringify(await currentRenderMeta(env, dt, !!opts.from))),
    env.DB.prepare("UPDATE revisions SET status = 'superseded' WHERE document_id = ? AND rev_no < ? AND status = 'sent'").bind(doc.id, doc.revision),
    opts.from
      ? env.DB.prepare("UPDATE documents SET status = 'sent', rev = rev + 1, updated_at = datetime('now') WHERE id = ?").bind(doc.id)
      : env.DB.prepare("UPDATE documents SET status = 'sent', data = ?, rev = rev + 1, updated_at = datetime('now') WHERE id = ?").bind(JSON.stringify(data), doc.id),
  ];
  await env.DB.batch(stmts);
}

/** Record the client's answer to a sent revision. */
export async function decide(env: Env, doc: DocRow, revNo: number, to: string, opts: { at?: string; note?: string } = {}): Promise<void> {
  if (!isDecision(to)) throw new RevisionError('invalid_transition', `status must be one of ${DECISIONS.join(', ')}`);
  const row = await getRevisionRow(env, doc.id, revNo);
  if (!row) throw new RevisionError('not_found', `revision ${revLabel(revNo)} was never sent`, 404);
  if (row.status !== 'sent') throw new RevisionError('invalid_transition', row.status === 'superseded' ? `revision ${revLabel(revNo)} was replaced by a newer one` : `revision ${revLabel(revNo)} is already ${row.status}: undo that decision first`);
  const at = opts.at ?? todayInStudioZone();
  if (!ISO_DATE.test(at)) throw new RevisionError('bad_request', 'the date must look like 2026-10-31', 422);
  await saveVersion(env, doc, 'status', `Revision ${revLabel(revNo)} ${to} ${at}`);
  const stmts = [env.DB.prepare('UPDATE revisions SET status = ?, decided_at = ?, decided_note = ? WHERE id = ?').bind(to, at, opts.note || null, row.id)];
  stmts.push(revNo === doc.revision
    ? env.DB.prepare("UPDATE documents SET status = ?, rev = rev + 1, updated_at = datetime('now') WHERE id = ?").bind(to, doc.id)
    : env.DB.prepare("UPDATE documents SET rev = rev + 1, updated_at = datetime('now') WHERE id = ?").bind(doc.id));
  await env.DB.batch(stmts);
}

/** Undo a recorded answer: the revision is "sent" again (or "superseded" if a newer revision was sent since). */
export async function undoDecision(env: Env, doc: DocRow, revNo: number): Promise<void> {
  const row = await getRevisionRow(env, doc.id, revNo);
  if (!row) throw new RevisionError('not_found', 'no such revision', 404);
  if (!isDecision(row.status)) throw new RevisionError('invalid_transition', `revision ${revLabel(revNo)} has no decision to undo (it is ${row.status})`);
  const newer = await env.DB.prepare("SELECT 1 AS x FROM revisions WHERE document_id = ? AND rev_no > ?").bind(doc.id, revNo).first();
  await saveVersion(env, doc, 'status', `Decision on revision ${revLabel(revNo)} undone`);
  const back = newer ? 'superseded' : 'sent';
  const stmts = [env.DB.prepare('UPDATE revisions SET status = ?, decided_at = NULL, decided_note = NULL WHERE id = ?').bind(back, row.id)];
  if (revNo === doc.revision) stmts.push(env.DB.prepare("UPDATE documents SET status = 'sent', rev = rev + 1, updated_at = datetime('now') WHERE id = ?").bind(doc.id));
  await env.DB.batch(stmts);
}

/** Correct the dates and notes of a revision (typos, a wrong day). */
export async function editRevisionMeta(env: Env, doc: DocRow, revNo: number, m: { sentAt?: string; sentNote?: string | null; decidedAt?: string; decidedNote?: string | null }): Promise<void> {
  const row = await getRevisionRow(env, doc.id, revNo);
  if (!row) throw new RevisionError('not_found', 'no such revision', 404);
  for (const d of [m.sentAt, m.decidedAt]) if (d !== undefined && !ISO_DATE.test(d)) throw new RevisionError('bad_request', 'dates must look like 2026-10-31', 422);
  if (m.decidedAt !== undefined && !isDecision(row.status)) throw new RevisionError('invalid_transition', 'this revision has no decision date');
  await env.DB.prepare('UPDATE revisions SET sent_at = ?, sent_note = ?, decided_at = ?, decided_note = ? WHERE id = ?').bind(
    m.sentAt ?? row.sent_at, m.sentNote === undefined ? row.sent_note : m.sentNote || null,
    m.decidedAt ?? row.decided_at, m.decidedNote === undefined ? row.decided_note : m.decidedNote || null, row.id).run();
  await env.DB.prepare("UPDATE documents SET rev = rev + 1, updated_at = datetime('now') WHERE id = ?").bind(doc.id).run();
}

/** Take back the latest "sent" record (marked by mistake): the revision is a draft again. Only while no answer is recorded. */
export async function unsend(env: Env, doc: DocRow): Promise<void> {
  const row = await getRevisionRow(env, doc.id, doc.revision);
  if (doc.status !== 'sent' || !row || row.status !== 'sent') throw new RevisionError('invalid_transition', 'only the latest revision can be taken back, and only while it is sent without an answer');
  await saveVersion(env, doc, 'status', `Revision ${revLabel(doc.revision)} taken back`);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM revisions WHERE id = ?').bind(row.id),
    env.DB.prepare("UPDATE revisions SET status = 'sent' WHERE document_id = ? AND rev_no = ? AND status = 'superseded'").bind(doc.id, doc.revision - 1),
    env.DB.prepare("UPDATE documents SET status = 'draft', rev = rev + 1, updated_at = datetime('now') WHERE id = ?").bind(doc.id),
  ]);
}

/** An offer that has a non-draft status but no frozen record (sent before revisions existed): record it now from its current state. */
export async function ensureSentRecord(env: Env, doc: DocRow): Promise<void> {
  if (doc.status === 'draft' || await getRevisionRow(env, doc.id, doc.revision)) return;
  const dt = getDocType(doc.type);
  const data = parseData(doc);
  const snapshot = await freeze(env, doc, data, await artworkOf(env, doc), doc.client_id);
  const day = doc.updated_at.slice(0, 10);
  await env.DB.prepare('INSERT INTO revisions (document_id, rev_no, status, snapshot, sent_at, decided_at, render_meta) VALUES (?,?,?,?,?,?,?)')
    .bind(doc.id, doc.revision, doc.status === 'sent' ? 'sent' : doc.status, JSON.stringify(snapshot), day, isDecision(doc.status) ? day : null, JSON.stringify(await currentRenderMeta(env, dt, true))).run();
}

/** Start the next revision as a draft (first edit of a sent offer, or "Create amendment"). Returns the updated row. */
export async function startNextRevision(env: Env, doc: DocRow): Promise<DocRow> {
  if (doc.status === 'draft') return doc;
  await ensureSentRecord(env, doc);
  await saveVersion(env, doc, 'status', `Revision ${revLabel(doc.revision + 1)} started`);
  const dt = getDocType(doc.type);
  const data = dt.newRevision ? dt.newRevision(parseData(doc), todayInStudioZone()) : parseData(doc);
  await env.DB.prepare("UPDATE documents SET revision = revision + 1, status = 'draft', data = ?, rev = rev + 1, updated_at = datetime('now') WHERE id = ?").bind(JSON.stringify(data), doc.id).run();
  return (await getDocument(env, doc.id))!;
}

/** Apply a status change a client asked for (PUT/PATCH `status`). */
export async function applyStatus(env: Env, doc: DocRow, to: string, opts: { at?: string; note?: string }): Promise<void> {
  const move = moveFor(doc.status, to);
  if (!move) throw new RevisionError('invalid_transition', `cannot change ${doc.status} → ${to}: ${transitionHelp(doc.status, to)}`);
  if (move === 'freeze') return markSent(env, doc, { sentAt: opts.at, note: opts.note });
  await ensureSentRecord(env, doc);
  return decide(env, doc, doc.revision, to, opts);
}
