/** Status rules of an offer, kept pure so they can be tested. Statuses belong to a revision (see core/revisions.ts). */
export const STATUSES = ['draft', 'sent', 'accepted', 'declined', 'withdrawn'] as const;
export const DECISIONS = ['accepted', 'declined', 'withdrawn'] as const;
export type Decision = (typeof DECISIONS)[number];

export const isDecision = (s: string): s is Decision => (DECISIONS as readonly string[]).includes(s);
export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** 1 → A, 2 → B, … 26 → Z, 27 → AA */
export function revLabel(n: number): string {
  let s = '';
  for (let k = Math.max(1, Math.floor(n)); k > 0; k = Math.floor((k - 1) / 26)) s = String.fromCharCode(65 + ((k - 1) % 26)) + s;
  return s;
}

/** What setting a status means: send (freeze a revision), record the client's answer, or nothing allowed. */
export function moveFor(from: string, to: string): 'freeze' | 'decide' | null {
  if (from === 'draft' && to === 'sent') return 'freeze';
  if (from === 'sent' && isDecision(to)) return 'decide';
  return null;
}

/** What happens when someone changes the content of an offer in this status. */
export function editEffect(status: string): 'in-place' | 'new-revision' | 'locked' {
  if (status === 'draft') return 'in-place';
  if (status === 'accepted') return 'locked';
  return 'new-revision';                  // sent, declined, withdrawn: the sent revision stays as it was, the edit starts the next one
}

export function transitionHelp(from: string, to: string): string {
  if (from === to) return `already ${from}`;
  if (to === 'draft') return 'a sent offer becomes a draft again by editing it (new revision) or with "Create amendment"';
  if (to === 'sent') return from === 'draft' ? '' : `only a draft can be marked as sent (it is ${from})`;
  if (isDecision(to)) return from === 'sent' ? '' : from === 'draft' ? 'mark it as sent first' : `it is already ${from}: undo that decision first`;
  return `unknown status "${to}"`;
}
