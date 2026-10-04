/**
 * Runs INSIDE the browser page after the layout engine (Vivliostyle) has paginated a document, and returns one report object per page.
 * Must stay self-contained (no outer variables): Puppeteer serialises this function's source into the page.
 */
export function analyze() {
  const mm = (px) => (px * 25.4) / 96;
  const TOL = 4;   // px: sub-pixel rounding from the engine's high-resolution layout; a real overflow is at least one text line (~15px)
  const cls = (e) => (e && typeof e.className === 'string' ? e.className : e?.tagName || '');
  // Containers that only group content (we look inside them); everything else is a "block" we reason about.
  const TRANSPARENT = /(^|\s)(keep|final-page|info-stack|info-col)(\s|$)/;
  const BLOCK = /(^|\s)(section-heading-row|section-heading|section-body|totals|sign-group|overview-fig|info-grid|doc-title-row|page-break)(\s|$)/;
  const pages = [...document.querySelectorAll('[data-vivliostyle-page-container]')];
  return pages.map((pg, i) => {
    const area = pg.querySelector('[data-vivliostyle-page-area-container]');       // the text area of the page (inside the margins)
    const ar = area.getBoundingClientRect();
    const blocks = [];
    (function walk(el) {
      for (const c of el.children) {
        if (c.tagName === 'TABLE' || (BLOCK.test(cls(c)) && !TRANSPARENT.test(cls(c)))) blocks.push(c);
        else walk(c);
      }
    })(area);
    const rects = blocks.map((b) => b.getBoundingClientRect());
    const maxBottom = rects.length ? Math.max(...rects.map((r) => r.bottom)) : ar.top;
    const first = blocks[0], last = blocks[blocks.length - 1];
    const isHeading = (b) => b && /(^|\s)(section-heading|section-heading-row)(\s|$)/.test(cls(b));
    const overflow = [...area.querySelectorAll('*')].filter((e) => { if (e.hasAttribute('data-vivliostyle-page-area')) return false; /* engine wrapper, not content */ const r = e.getBoundingClientRect(); return r.height > 0 && r.bottom > ar.bottom + TOL; }).length;
    const rowEls = [...area.querySelectorAll('tbody tr:not(.totals)')];
    return {
      index: i + 1,
      areaMm: Math.round(mm(ar.height)),
      fillMm: Math.round(mm(maxBottom - ar.top)),
      firstClass: cls(first), lastClass: cls(last),
      firstText: (first?.innerText || '').trim().slice(0, 40), lastText: (last?.innerText || '').trim().slice(0, 40),
      empty: area.innerText.trim() === '',
      overflow,
      headingLast: isHeading(last),
      totalsFirst: /(^|\s)totals(\s|$)/.test(cls(first)) || (first?.tagName === 'TABLE' && !!first.querySelector('tbody tr')?.classList.contains('totals')),
      startsWithTable: first?.tagName === 'TABLE',
      hasHeaderRow: !!(first?.tagName === 'TABLE' && first.querySelector('thead')),
      rowTitles: rowEls.map((tr) => (tr.querySelector('.table-title')?.innerText || '').trim()),
      rowKeys: rowEls.filter((tr) => /^\d+$/.test((tr.cells[0]?.innerText || '').trim())).map((tr) => tr.cells[0].innerText.trim() + ':' + (tr.querySelector('.table-title')?.innerText || '').trim()),
      // x positions of the table columns (page-relative), to verify every table piece has identical columns
      titleLefts: [...new Set(rowEls.map((tr) => Math.round(tr.querySelector('.table-title').getBoundingClientRect().left - ar.left)))],
      hoursRights: [...new Set(rowEls.map((tr) => Math.round(tr.cells[tr.cells.length - 1].getBoundingClientRect().right - ar.left)))],
      floatOverlap: rowEls.filter((tr) => { const f = tr.querySelector('.row-figs'); return f && f.getBoundingClientRect().bottom > tr.getBoundingClientRect().bottom + TOL; }).length,
      hasCost: !!area.querySelector('.final-page'),
      hasSignatures: !!area.querySelector('.sign-group'),
      signatureCut: (() => { const g = area.querySelector('.sign-group'); return !!g && g.getBoundingClientRect().bottom > ar.bottom + TOL; })(),
      text: area.innerText,
    };
  });
}
