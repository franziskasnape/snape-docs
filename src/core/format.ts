import type { Lang } from './types';

export const esc = (s: unknown): string =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Hours: 1.5, 2 -> "1.5–2"; equal or missing max -> "1" */
export function fmtHours(min: number, max?: number): string {
  const n = (x: number) => String(Math.round(x * 100) / 100);
  return max == null || max === min ? n(min) : `${n(min)}–${n(max)}`;
}

/** Swiss thousands separator: 1300 -> 1'300 */
export function chf(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, "'");
}

export function fmtChfRange(min: number, max: number): string {
  return min === max ? chf(min) : `${chf(min)}–${chf(max)}`;
}

const MONTHS: Record<Lang, string[]> = {
  de: ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'],
  en: ['January','February','March','April','May','June','July','August','September','October','November','December'],
};

/** ISO yyyy-mm-dd -> 02.10.2026 */
export function fmtDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}

/** ISO yyyy-mm-dd -> "29. Oktober 2026" / "29 October 2026"; non-ISO text passes through ("Mitte November 2026") */
export function fmtLongDate(iso: string, lang: Lang): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const d = Number(m[3]), mon = MONTHS[lang][Number(m[2]) - 1];
  return lang === 'de' ? `${d}. ${mon} ${m[1]}` : `${d} ${mon} ${m[1]}`;
}
