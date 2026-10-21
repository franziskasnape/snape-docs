#!/usr/bin/env node
// One-off helper: record the revisions of offers that were sent BEFORE revisions existed, from their history.
//   node scripts/backfill-revisions.mjs            shows what it would do
//   node scripts/backfill-revisions.mjs --apply    does it
// For every offer whose status is not "draft" and that has no recorded revision it finds the history entry made when the
// offer was marked as sent (its content is the state at that moment) and records it as Revision A with that day.
// An answer (accepted / declined / withdrawn) is recorded with the day of that status change (when it was recorded in this tool,
// which may not be the day the client answered: correct it with "Edit dates" in Sent versions). Nothing is deleted.
const BASE = (process.env.SNAPE_URL ?? 'http://localhost:8787').replace(/\/$/, '');
const apply = process.argv.includes('--apply');
const api = async (path, method = 'GET', body) => {
  const r = await fetch(BASE + path, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body && JSON.stringify(body) });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${j?.error ?? ''}`);
  return j;
};
const day = (utc) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich' }).format(new Date(utc.replace(' ', 'T') + 'Z'));
const strip = (d) => { const { privateNotes, ...rest } = d ?? {}; return JSON.stringify(rest); };

for (const row of await api('/api/documents')) {
  if (row.status === 'draft' || row.revisions.length) continue;
  const doc = await api(`/api/documents/${row.id}`);
  const versions = await api(`/api/documents/${row.id}/versions`);                       // newest first
  const sentV = versions.find((v) => /draft → sent$/.test(v.note ?? ''));                 // the last time it went from draft to sent
  const answerV = ['accepted', 'declined', 'withdrawn'].includes(doc.status) ? versions.find((v) => new RegExp(`→ ${doc.status}$`).test(v.note ?? '')) : null;
  const sentAt = sentV ? day(sentV.created_at) : doc.data?.meta?.date ?? day(doc.updatedAt);       // no history entry: the date printed on the offer
  const frozen = sentV ? (await api(`/api/documents/${row.id}/versions/${sentV.id}`)).snapshot : null;
  const same = frozen ? strip(frozen.data) === strip(doc.data) : null;
  console.log(`${doc.number}  status ${doc.status}  ->  Revision A sent ${sentAt}${answerV ? `, ${doc.status} ${day(answerV.created_at)}` : ''}`
    + `  [${sentV ? `from history entry #${sentV.id} (${same ? 'identical to the current text' : 'DIFFERS from the current text: the offer was changed after it was marked as sent'})` : 'no "draft → sent" entry in the history: frozen from the current text, sent date = the date printed on the offer; check it'}]`);
  if (!apply) continue;
  let from = sentV?.id;
  if (!from) from = (await api(`/api/documents/${row.id}/versions`, 'POST', { note: 'State when Revision A was recorded' })) && (await api(`/api/documents/${row.id}/versions`))[0].id;
  await api(`/api/documents/${row.id}/revisions`, 'POST', { fromVersion: from, sentAt });
  if (answerV) await api(`/api/documents/${row.id}/revisions/1/decision`, 'POST', { status: doc.status, at: day(answerV.created_at) });
}
if (!apply) console.log('\n(dry run: add --apply to record these)');
