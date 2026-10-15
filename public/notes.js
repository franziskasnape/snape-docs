/**
 * Private notes: reduce HTML to a few harmless formatting tags. Used before notes are shown in the editor and before they are saved.
 * String based (no DOM), so it behaves the same in the browser and in the unit tests. Allowed: b, strong, i, em, u, ul, ol, li, br, p, div.
 * Every attribute is dropped; any other tag is dropped but its text is kept; script and style elements are dropped with their content;
 * comments are dropped; a stray "<" is escaped.
 */
(function (root) {
  const ALLOWED = new Set(['b', 'strong', 'i', 'em', 'u', 'ul', 'ol', 'li', 'br', 'p', 'div']);
  const DROP_WITH_CONTENT = new Set(['script', 'style', 'template', 'noscript', 'iframe', 'object', 'embed', 'textarea', 'title']);

  function clean(html) {
    const src = String(html ?? '');
    let out = '', i = 0, skipUntil = null;
    while (i < src.length) {
      const lt = src.indexOf('<', i);
      if (lt < 0) { if (!skipUntil) out += src.slice(i); break; }
      if (!skipUntil) out += src.slice(i, lt);
      if (src.startsWith('<!--', lt)) { const e = src.indexOf('-->', lt + 4); i = e < 0 ? src.length : e + 3; continue; }
      const m = /^<(\/?)([a-zA-Z][a-zA-Z0-9-]*)(?:[\s/][^>]*)?>/.exec(src.slice(lt, lt + 4000));
      if (!m) {                                                    // "<" that does not start a tag, or a tag that never closes
        if (!skipUntil) out += '&lt;';
        i = lt + 1; continue;
      }
      const closing = m[1] === '/', name = m[2].toLowerCase();
      i = lt + m[0].length;
      if (skipUntil) { if (closing && name === skipUntil) skipUntil = null; continue; }
      if (!closing && DROP_WITH_CONTENT.has(name)) { if (!/\/>$/.test(m[0])) skipUntil = name; continue; }
      if (ALLOWED.has(name)) out += name === 'br' ? '<br>' : closing ? `</${name}>` : `<${name}>`;
    }
    const text = out.replace(/<[^>]*>/g, '').replace(/&nbsp;|&#160;/g, ' ').trim();
    return text || /<li>/.test(out) ? out : '';
  }

  root.DocNotes = { clean };
  if (typeof module !== 'undefined') module.exports = root.DocNotes;
})(typeof window !== 'undefined' ? window : globalThis);
