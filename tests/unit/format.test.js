import { describe, expect, it } from 'vitest';
import { chf, esc, fmtChfRange, fmtDate, fmtHours, fmtLongDate, todayInStudioZone } from '../../src/core/format';

describe('formatting', () => {
  it('formats hour ranges', () => {
    expect(fmtHours(1.5, 2)).toBe('1.5–2');
    expect(fmtHours(1)).toBe('1');
    expect(fmtHours(2, 2)).toBe('2');
    expect(fmtHours(0.1 + 0.2)).toBe('0.3');       // no floating point noise
  });
  it('uses the Swiss thousands separator', () => {
    expect(chf(1300)).toBe("1'300");
    expect(chf(999)).toBe('999');
    expect(chf(1234567)).toBe("1'234'567");
    expect(fmtChfRange(1300, 1800)).toBe("1'300–1'800");
    expect(fmtChfRange(700, 700)).toBe('700');
  });
  it('formats dates', () => {
    expect(fmtDate('2026-10-02')).toBe('02.10.2026');
    expect(fmtDate('Mitte November')).toBe('Mitte November');
    expect(fmtLongDate('2026-10-29', 'de')).toBe('29. Oktober 2026');
    expect(fmtLongDate('2026-10-29', 'en')).toBe('29 October 2026');
    expect(fmtLongDate('Mitte November 2026', 'de')).toBe('Mitte November 2026');   // free text passes through
  });
  it("takes 'today' in Swiss time, not UTC", () => {
    expect(todayInStudioZone(new Date('2026-10-07T23:30:00Z'))).toBe('2026-10-08');      // 01:30 on the 8th in Switzerland (summer time)
    expect(todayInStudioZone(new Date('2026-12-31T23:30:00Z'))).toBe('2027-01-01');      // winter time (UTC+1)
    expect(todayInStudioZone(new Date('2026-10-07T12:00:00Z'))).toBe('2026-10-07');
  });
  it('escapes HTML', () => {
    expect(esc('<b>"Tom & Jerry"</b>')).toBe('&lt;b&gt;&quot;Tom &amp; Jerry&quot;&lt;/b&gt;');
    expect(esc(undefined)).toBe('');
  });
});
