/**
 * Document diff for the History panel.
 *
 *   DocDiff.diffDocs(current, version) -> [{ tag, where, html }]
 *
 * Perspective: "what would restoring `version` change in `current`?" so <del> is text that exists now and
 * would disappear, <ins> is text that would appear. Blocks, treatment rows and photos are matched by their
 * stable `id` (not by position), so reordering, adding or deleting items does not look like a pile of edits.
 * Plain string lists (paragraphs, object lines) are aligned with a longest-common-subsequence match.
 *
 * Tags: 'changed' | 'restored' (exists in version only) | 'removed' (exists now only) | 'moved'
 */
(function (root) {
  const LABELS = {
    sections: { artist: 'Artist & work', condition: 'Condition assessment' },
    notes: { hinweis: 'Note', fazit: 'Conclusion', empfehlung: 'Recommendation' },
    fields: { hoursMin: 'hours (min)', hoursMax: 'hours (max)', desc: 'description', validUntil: 'valid until', deliveryFrom: 'delivery from',
      pickupFrom: 'pickup from', optionalDetail: 'optional detail', overrideHtml: 'manual cost text', materials: 'materials billed separately',
      rate: 'hourly rate', date: 'date', title: 'title', status: 'status', caption: 'caption', note: 'note', layout: 'layout', kind: 'kind', label: 'label', html: 'text' },
  };

  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const isEmpty = (v) => v === undefined || v === null || v === '';
  const show = (v) => (isEmpty(v) ? '<em class="none">(empty)</em>' : typeof v === 'boolean' ? (v ? 'yes' : 'no') : esc(v));
  const clip = (s, n = 90) => { s = String(s ?? '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n) + '…' : s; };

  // ---------- generic helpers ----------
  /** Longest common subsequence of two arrays, returned as [i, j] index pairs. */
  function lcs(a, b, eq = (x, y) => x === y) {
    const n = a.length, m = b.length;
    const t = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) t[i][j] = eq(a[i], b[j]) ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
    const pairs = []; let i = 0, j = 0;
    while (i < n && j < m) { if (eq(a[i], b[j])) { pairs.push([i, j]); i++; j++; } else if (t[i + 1][j] >= t[i][j + 1]) i++; else j++; }
    return pairs;
  }

  const TOKEN = /\s+|[\p{L}\p{N}]+|[^\p{L}\p{N}\s]/gu;
  /** Inline word-level diff from `from` (current) to `to` (version). */
  function wordDiff(from, to) {
    const a = String(from ?? '').match(TOKEN) ?? [], b = String(to ?? '').match(TOKEN) ?? [];
    if (a.length * b.length > 4e6) return `<del>${esc(from)}</del> → <ins>${esc(to)}</ins>`;
    const pairs = lcs(a, b); const out = []; let i = 0, j = 0;
    const push = (t, s) => { if (!s) return; const last = out[out.length - 1]; if (last && last.t === t) last.s += s; else out.push({ t, s }); };
    for (const [pi, pj] of [...pairs, [a.length, b.length]]) {
      push('del', a.slice(i, pi).join('')); push('ins', b.slice(j, pj).join(''));
      if (pi < a.length) push('eq', a[pi]);
      i = pi + 1; j = pj + 1;
    }
    return out.map(({ t, s }) => (t === 'eq' ? esc(s) : `<${t}>${esc(s)}</${t}>`)).join('');
  }

  const textHtml = (a, b) => (typeof a === 'string' && typeof b === 'string' && a && b && (a.length > 30 || b.length > 30)
    ? wordDiff(a, b) : `${isEmpty(a) ? show(a) : `<del>${esc(a)}</del>`} → ${isEmpty(b) ? show(b) : `<ins>${esc(b)}</ins>`}`);

  /** Align two arrays of items by id. Returns common [ci, vi] pairs, ids only in current/version, and moved ids. */
  function alignById(cur, ver, idOf) {
    const cIds = cur.map(idOf), vIds = ver.map(idOf);
    const common = [];
    cIds.forEach((id, ci) => { const vi = vIds.indexOf(id); if (id != null && vi >= 0) common.push([ci, vi]); });
    const onlyCur = cur.map((_, ci) => ci).filter((ci) => !common.some(([c]) => c === ci));
    const onlyVer = ver.map((_, vi) => vi).filter((vi) => !common.some(([, v]) => v === vi));
    // moved = common items that fall outside the longest in-order run
    const seqC = common.map(([ci]) => cIds[ci]), seqV = common.slice().sort((x, y) => x[1] - y[1]).map(([ci]) => cIds[ci]);
    const keep = new Set(lcs(seqC, seqV).map(([i]) => seqC[i]));
    const moved = common.filter(([ci, vi]) => !keep.has(cIds[ci]) && ci !== vi);   // same position = not really a move
    return { common, onlyCur, onlyVer, moved };
  }

  const item = (tag, where, html) => ({ tag, where: where.filter(Boolean).join(' › '), html });

  // ---------- string lists (paragraphs, object lines) ----------
  function diffStrings(where, A, B, noun) {
    const out = [];
    const pairs = lcs(A, B);
    let i = 0, j = 0;
    for (const [pi, pj] of [...pairs, [A.length, B.length]]) {
      const ga = A.slice(i, pi), gb = B.slice(j, pj);
      const k = Math.min(ga.length, gb.length);
      for (let x = 0; x < k; x++) out.push(item('changed', [...where, `${noun} ${i + x + 1}`], textHtml(ga[x], gb[x])));
      for (let x = k; x < ga.length; x++) out.push(item('removed', [...where, `${noun} ${i + x + 1}`], `<del>${esc(clip(ga[x]))}</del>`));
      for (let x = k; x < gb.length; x++) out.push(item('restored', [...where, `${noun} (was ${j + x + 1})`], `<ins>${esc(clip(gb[x]))}</ins>`));
      i = pi + 1; j = pj + 1;
    }
    return out;
  }

  function diffObjectLines(cur, ver) {
    const out = [];
    const pairs = lcs(cur, ver, (x, y) => x.k === y.k && x.v === y.v);
    let i = 0, j = 0;
    for (const [pi, pj] of [...pairs, [cur.length, ver.length]]) {
      const ga = cur.slice(i, pi), gb = ver.slice(j, pj), k = Math.min(ga.length, gb.length);
      for (let x = 0; x < k; x++) {
        const a = ga[x], b = gb[x];
        if (a.k !== b.k) out.push(item('changed', ['Object', `line ${i + x + 1}`, 'label'], textHtml(a.k, b.k)));
        if (a.v !== b.v) out.push(item('changed', ['Object', a.k || b.k || `line ${i + x + 1}`], textHtml(a.v, b.v)));
      }
      for (let x = k; x < ga.length; x++) out.push(item('removed', ['Object', ga[x].k], `<del>${esc(ga[x].v)}</del>`));
      for (let x = k; x < gb.length; x++) out.push(item('restored', ['Object', gb[x].k], `<ins>${esc(gb[x].v)}</ins>`));
      i = pi + 1; j = pj + 1;
    }
    return out;
  }

  // ---------- blocks ----------
  const headingOf = (b) => (b.headingKey ? LABELS.sections[b.headingKey] : b.heading || 'untitled');
  function blockName(b) {
    if (b.type === 'prose') return `Text section – ${headingOf(b)}`;
    if (b.type === 'note') return `${LABELS.notes[b.label] ?? 'Note'} – “${clip(b.html, 28)}”`;
    if (b.type === 'measures') return `Treatment table (${b.kind})`;
    return 'Page break';
  }
  function blockSummary(b) {
    if (b.type === 'prose') return clip((b.paragraphs || []).find((p) => p && p.trim()) ?? '(empty)');
    if (b.type === 'note') return clip(b.html);
    if (b.type === 'measures') return `${b.rows.length} row${b.rows.length === 1 ? '' : 's'}: ${clip(b.rows.map((r) => r.title).join(', '), 100)}`;
    return '';
  }
  const hoursText = (r) => `${r.hoursMin ?? '?'}${r.hoursMax != null ? '–' + r.hoursMax : ''} h`;

  function diffRowFields(where, a, b) {
    const out = [];
    for (const f of ['title', 'desc', 'hoursMin', 'hoursMax']) {
      if (a[f] === b[f]) continue;
      out.push(item('changed', [...where, LABELS.fields[f] ?? f], f === 'hoursMin' || f === 'hoursMax' ? `${show(a[f])} → ${show(b[f])}` : textHtml(a[f], b[f])));
    }
    const ia = a.images ?? [], ib = b.images ?? [], al = alignById(ia, ib, (x) => x.id);
    for (const [ci, vi] of al.common) {
      const x = ia[ci], y = ib[vi];
      if (x.imageId !== y.imageId) out.push(item('changed', [...where, `photo “${clip(y.caption || x.caption, 40)}”`], 'photo replaced'));
      if (x.caption !== y.caption) out.push(item('changed', [...where, 'photo caption'], textHtml(x.caption, y.caption)));
    }
    for (const ci of al.onlyCur) out.push(item('removed', [...where, 'photo'], `<del>${esc(clip(ia[ci].caption || 'photo'))}</del>`));
    for (const vi of al.onlyVer) out.push(item('restored', [...where, 'photo'], `<ins>${esc(clip(ib[vi].caption || 'photo'))}</ins>`));
    return out;
  }

  function diffMeasures(where, a, b) {
    const out = [];
    if (a.kind !== b.kind) out.push(item('changed', [...where, 'kind'], `${show(a.kind)} → ${show(b.kind)}`));
    const al = alignById(a.rows, b.rows, (r) => r.id);
    for (const [ci, vi] of al.common) {
      const rw = [...where, `row ${ci + 1} “${clip(a.rows[ci].title, 36)}”`];
      out.push(...diffRowFields(rw, a.rows[ci], b.rows[vi]));
    }
    for (const [ci, vi] of al.moved) out.push(item('moved', [...where, `row “${clip(a.rows[ci].title, 36)}”`], `moves from row ${ci + 1} to row ${vi + 1}`));
    for (const ci of al.onlyCur) out.push(item('removed', [...where, `row ${ci + 1}`], `<del>${esc(clip(a.rows[ci].title))}</del> (${hoursText(a.rows[ci])}) — added since, would be removed`));
    for (const vi of al.onlyVer) out.push(item('restored', [...where, 'row'], `<ins>${esc(clip(b.rows[vi].title))}</ins> (${hoursText(b.rows[vi])}) — deleted since, would be restored`));
    return out;
  }

  function diffBlock(where, a, b) {
    if (a.type !== b.type) return [item('changed', where, `block type ${show(a.type)} → ${show(b.type)}`)];
    if (a.type === 'prose') {
      const out = [];
      if (headingOf(a) !== headingOf(b)) out.push(item('changed', [...where, 'heading'], textHtml(headingOf(a), headingOf(b))));
      return out.concat(diffStrings(where, a.paragraphs ?? [], b.paragraphs ?? [], 'paragraph'));
    }
    if (a.type === 'note') {
      const out = [];
      if (a.label !== b.label) out.push(item('changed', [...where, 'label'], `${show(LABELS.notes[a.label])} → ${show(LABELS.notes[b.label])}`));
      if (a.html !== b.html) out.push(item('changed', where, textHtml(a.html, b.html)));
      return out;
    }
    if (a.type === 'measures') return diffMeasures(where, a, b);
    return [];
  }

  function diffBlocks(cur, ver) {
    const out = [], al = alignById(cur, ver, (b) => b.id);
    for (const [ci, vi] of al.common) out.push(...diffBlock([`${ci + 1}. ${blockName(cur[ci])}`], cur[ci], ver[vi]));
    for (const [ci, vi] of al.moved) out.push(item('moved', [`${ci + 1}. ${blockName(cur[ci])}`], `moves from position ${ci + 1} to ${vi + 1}`));
    for (const ci of al.onlyCur) out.push(item('removed', [`${ci + 1}. ${blockName(cur[ci])}`], `<del>${esc(blockSummary(cur[ci]))}</del> — added since, would be removed`));
    for (const vi of al.onlyVer) out.push(item('restored', [blockName(ver[vi])], `<ins>${esc(blockSummary(ver[vi]))}</ins> — deleted since, would be restored`));
    return out;
  }

  // ---------- whole document ----------
  function scalar(out, where, a, b) {
    if (a === b || (isEmpty(a) && isEmpty(b))) return;
    out.push(item('changed', where, typeof a === 'string' || typeof b === 'string' ? textHtml(a, b) : `${show(a)} → ${show(b)}`));
  }

  function diffDocs(cur, ver) {
    const out = [], cd = cur.data ?? {}, vd = ver.data ?? {};
    // old snapshots may lack title/status/artwork: only compare what the version actually has
    if (ver.title !== undefined) scalar(out, ['Title'], cur.title, ver.title);
    if (ver.status !== undefined) scalar(out, ['Status'], cur.status, ver.status);
    for (const f of ['date', 'validUntil', 'title', 'eyebrow']) scalar(out, ['Document', LABELS.fields[f] ?? f], cd.meta?.[f], vd.meta?.[f]);
    scalar(out, ['Document', 'hourly rate'], cd.rate, vd.rate);
    if (ver.artwork) out.push(...diffObjectLines(cur.artwork ?? [], ver.artwork));
    const co = cd.overview, vo = vd.overview;
    if (!co && vo) out.push(item('restored', ['Overview photo'], '<ins>photo</ins> — would be restored'));
    else if (co && !vo) out.push(item('removed', ['Overview photo'], '<del>photo</del> — would be removed'));
    else if (co && vo) {
      if (co.imageId !== vo.imageId) out.push(item('changed', ['Overview photo'], 'photo replaced'));
      for (const f of ['caption', 'note', 'layout']) scalar(out, ['Overview photo', f], co[f] ?? (f === 'layout' ? 'auto' : undefined), vo[f] ?? (f === 'layout' ? 'auto' : undefined));
    }
    out.push(...diffBlocks(cd.blocks ?? [], vd.blocks ?? []));
    for (const f of ['deliveryFrom', 'pickupFrom', 'materials', 'optionalDetail', 'overrideHtml']) scalar(out, ['Cost summary', LABELS.fields[f] ?? f], cd.cost?.[f], vd.cost?.[f]);
    return out;
  }

  root.DocDiff = { diffDocs, wordDiff, lcs };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.DocDiff;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
