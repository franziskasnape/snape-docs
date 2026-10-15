import { describe, expect, it } from 'vitest';
import L from '../../public/locate.js';

describe('finding the clicked word in the field source', () => {
  it('skips HTML tags and decodes entities, keeping source positions', () => {
    const { text, start, end } = L.plainMap('Das <strong>Gemälde</strong> &amp; mehr', true);
    expect(text).toBe('Das Gemälde & mehr');
    expect(start[text.indexOf('&')]).toBe('Das <strong>Gemälde</strong> '.length);
    expect(end[text.indexOf('&')]).toBe('Das <strong>Gemälde</strong> &amp;'.length);
  });
  it('selects exactly the word, also inside tags', () => {
    const v = 'Das <strong>Gemälde</strong> zeigt Risse.';
    const [a, b] = L.locate(v, true, 'Gemälde', 0);
    expect(v.slice(a, b)).toBe('Gemälde');
    const [c, d] = L.locate(v, true, 'Risse', 0);
    expect(v.slice(c, d)).toBe('Risse');
  });
  it('picks the right one of several equal words (k-th occurrence, whole words only)', () => {
    const v = 'die Leinwand, die Rückseite und die Kanten. Dieser Rahmen';
    const [a] = L.locate(v, false, 'die', 2);
    expect(a).toBe(v.indexOf('die Kanten'));
    expect(L.countWord('die Leinwand, die Rückseite', 'die')).toBe(2);
    expect(L.countWord('Dieser Rahmen', 'die')).toBe(0);                 // "Dieser" is a different word
  });
  it('works line by line for bullet points', () => {
    const v = 'Erster Punkt\nZweiter Punkt\nDritter Punkt';
    const [a, b] = L.locate(v, true, 'Punkt', 0, 1);
    expect(v.slice(a, b)).toBe('Punkt'); expect(a).toBe(v.indexOf('Zweiter') + 'Zweiter '.length);
  });
  it('handles umlauts and numbers; returns null when the word is not there', () => {
    expect(L.locate('ca. 12–18 Stunden', false, '12', 0)).toEqual([4, 6]);
    expect(L.locate('Übermalung', false, 'Übermalung', 0)).toEqual([0, 10]);
    expect(L.locate('abc', false, 'xyz', 0)).toBeNull();
  });
});
