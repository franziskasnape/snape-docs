/** Turns the per-page reports into a list of human-readable layout defects (empty list = good). */
export function findDefects(pages, { expectFinalPage = true } = {}) {
  const out = [];
  const last = pages[pages.length - 1];
  pages.forEach((p) => {
    const at = `page ${p.index}/${pages.length}`;
    if (p.empty || p.fillMm < 4) out.push(`${at}: blank page`);
    if (p.overflow) out.push(`${at}: ${p.overflow} element(s) run past the bottom of the page`);
    if (p.floatOverlap) out.push(`${at}: a row photo hangs out of its row (overlaps the next row)`);
    if (p.headingLast) out.push(`${at}: a heading is the last thing on the page ("${p.lastText.replace(/\s+/g, ' ')}")`);
    if (p.totalsFirst) out.push(`${at}: the "Total" line is alone at the top of the page, separated from its table`);
    if (p.startsWithTable && !p.hasHeaderRow) out.push(`${at}: the table continues here without its column header row`);
    if (p.signatureCut) out.push(`${at}: the signature block is cut by the page edge`);
    if (expectFinalPage && p !== last && (p.hasCost || p.hasSignatures)) out.push(`${at}: cost summary / signatures appear before the final page`);
  });
  if (expectFinalPage) {
    if (pages.length < 2) out.push('document has fewer than 2 pages (the final page must be its own page)');
    if (!last.hasCost || !last.hasSignatures) out.push('the last page does not hold both the cost summary and the signatures');
    if (last.firstClass && !/section-heading/.test(last.firstClass)) out.push(`last page should start with the cost heading, starts with "${last.firstClass}"`);
  }
  // every table piece, on every page, must use the same columns (the table is emitted in several pieces that must look like one)
  const lefts = new Set(pages.flatMap((p) => p.titleLefts)), rights = new Set(pages.flatMap((p) => p.hoursRights));
  const spread = (set) => (set.size ? Math.max(...set) - Math.min(...set) : 0);
  if (spread(lefts) > 4) out.push(`table description column starts at different positions (${[...lefts].sort((a, b) => a - b).join(', ')} px): column widths differ between table pieces`);
  if (spread(rights) > 4) out.push(`table hours column ends at different positions (${[...rights].sort((a, b) => a - b).join(', ')} px)`);
  // a table row must never be split across two pages (it would appear on both)
  const seen = new Map();
  pages.forEach((p) => p.rowKeys.forEach((k) => { if (seen.has(k) && seen.get(k) !== p.index) out.push(`row "${k}" appears on pages ${seen.get(k)} and ${p.index} (split row)`); seen.set(k, p.index); }));
  return out;
}

/** Share of the page used by content, ignoring the first page, the last page and the page before the forced final page. */
export function lowFillPages(pages, minMm) {
  return pages.filter((p) => p.index > 1 && p.index < pages.length - 1 && p.fillMm < minMm).map((p) => `page ${p.index}: only ${p.fillMm}mm of ${p.areaMm}mm used`);
}
