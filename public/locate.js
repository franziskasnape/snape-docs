/**
 * "Double-click in the preview, land on the word in the editor field."
 * The preview marks text with the field it comes from; these helpers find the same word inside the field's source text
 * (which may contain HTML tags and entities that the preview does not show). Plain script, also loaded by the unit tests.
 */
(function (root) {
  const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', shy: '' };
  const isWord = (ch) => !!ch && /[\p{L}\p{N}_]/u.test(ch);

  /** The visible text of `src` and, for every visible character, where it starts and ends in `src`. */
  function plainMap(src, html) {
    let text = '', start = [], end = [];
    for (let i = 0; i < src.length;) {
      const c = src[i];
      if (html && c === '<') { const j = src.indexOf('>', i); if (j > 0) { i = j + 1; continue; } }
      if (html && c === '&') {
        const m = /^&(#x[0-9a-f]+|#\d+|[a-z]+);/i.exec(src.slice(i, i + 12));
        if (m) {
          const n = m[1], ch = n[0] === '#' ? String.fromCodePoint(n[1].toLowerCase() === 'x' ? parseInt(n.slice(2), 16) : parseInt(n.slice(1), 10)) : (ENT[n.toLowerCase()] ?? m[0]);
          for (const x of ch) { text += x; start.push(i); end.push(i + m[0].length); }
          i += m[0].length; continue;
        }
      }
      text += c; start.push(i); end.push(i + 1); i++;
    }
    return { text, start, end };
  }

  /** Index of the k-th (0-based) whole-word occurrence of `word` in `text`, or -1. */
  function nthWord(text, word, k) {
    if (!word) return -1;
    let from = 0, n = 0;
    for (;;) {
      const i = text.indexOf(word, from);
      if (i < 0) return -1;
      if (!isWord(text[i - 1]) && !isWord(text[i + word.length])) { if (n === k) return i; n++; }
      from = i + 1;
    }
  }

  /** How many whole-word occurrences of `word` are in `text`. */
  function countWord(text, word) { let n = 0; while (nthWord(text, word, n) >= 0) n++; return n; }

  /**
   * Where the k-th occurrence of `word` sits in a field's source `value`: [start, end) or null.
   * `line` (optional) limits the search to that line of a multi-line field (bullet points).
   */
  function locate(value, html, word, k, line) {
    let base = 0, text = value;
    if (line !== undefined && line !== null) {
      const lines = value.split('\n');
      base = lines.slice(0, line).reduce((a, l) => a + l.length + 1, 0);
      text = lines[line] ?? '';
    }
    const p = plainMap(text, html), i = nthWord(p.text, word, k);
    if (i < 0) return null;
    return [base + p.start[i], base + p.end[i + [...word].length - 1]];
  }

  root.DocLocate = { plainMap, nthWord, countWord, locate };
  if (typeof module !== 'undefined') module.exports = root.DocLocate;
})(typeof window !== 'undefined' ? window : globalThis);
