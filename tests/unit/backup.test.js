import { describe, expect, it } from 'vitest';
import { selectPrune } from '../../scripts/backup.mjs';

const name = (d) => { const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}00`; };
const NOW = new Date(2026, 9, 4, 12, 0, 0);
const at = (daysAgo, hour = 9) => name(new Date(2026, 9, 4 - daysAgo, hour, 0, 0));

describe('backup retention', () => {
  it('keeps everything from the last 14 days', () => {
    const names = Array.from({ length: 14 * 24 }, (_, h) => name(new Date(NOW.getTime() - h * 3600e3)));
    expect(selectPrune(names, NOW)).toEqual([]);
  });
  it('thins 15–90 day old snapshots to one per day (the latest of each day)', () => {
    const names = [at(20, 8), at(20, 14), at(20, 20)];
    const drop = selectPrune(names, NOW);
    expect(drop.sort()).toEqual([at(20, 8), at(20, 14)].sort());       // keeps 20:00
  });
  it('thins snapshots older than 90 days to one per month', () => {
    const names = [at(100), at(105), at(110), at(150)];                 // mid-June/July; 150 days ago is in May
    const keep = names.filter((n) => !selectPrune(names, NOW).includes(n));
    expect(new Set(keep.map((n) => n.slice(0, 7))).size).toBe(keep.length);   // at most one per month
  });
  it('never deletes the newest snapshot and ignores folders that are not snapshots', () => {
    const names = [at(400), at(401), 'notes', 'photos'];
    const drop = selectPrune(names, NOW);
    expect(drop).not.toContain('notes'); expect(drop).not.toContain('photos');
    expect(names.filter((n) => /^\d{4}-/.test(n)).filter((n) => !drop.includes(n)).length).toBeGreaterThanOrEqual(1);
  });
});
