import { describe, expect, it } from 'vitest';
import { documentTitle, hostPage } from '../../src/core/render/host';
import { renderOffer } from '../../src/doctypes/offer/render';
import { context, makeOffer } from '../layout/fixtures.js';

const doc = (extra = '') => `<!DOCTYPE html><html><head><title>Snape-Conservation_ANG-2099-001_Angebot</title></head><body><main>Hallo ${extra}</main></body></html>`;
const embedded = (html) => JSON.parse(/<script type="application\/json" id="doc">([\s\S]*?)<\/script>/.exec(html)[1]);

describe('page-layout host', () => {
  it('embeds the document unchanged and uses its title as the browser tab / PDF file name', () => {
    const d = doc('Welt');
    const h = hostPage({ documentHtml: d, mode: 'view' });
    expect(embedded(h)).toBe(d);
    expect(h).toContain('<title>Snape-Conservation_ANG-2099-001_Angebot</title>');
    expect(documentTitle(d)).toBe('Snape-Conservation_ANG-2099-001_Angebot');
  });
  it('cannot be broken out of by document content (script end tags, line separators, comments)', () => {
    const nasty = `</script><script>window.pwned=1</script><!-- --> ${String.fromCharCode(0x2028)}${String.fromCharCode(0x2029)}`;
    const h = hostPage({ documentHtml: doc(nasty), mode: 'preview' });
    expect(h).not.toContain('<script>window.pwned=1');
    expect(embedded(h)).toContain('window.pwned=1');                       // it is data, not code
    expect(h).not.toContain(String.fromCharCode(0x2028));
  });
  it('view mode has a toolbar with a Print button; preview mode (editor iframe) has none', () => {
    expect(hostPage({ documentHtml: doc(), mode: 'view' })).toContain('id="printBtn"');
    expect(hostPage({ documentHtml: doc(), mode: 'preview' })).not.toContain('id="printBtn"');
  });
  it('loads the engine from /vivliostyle.js, or inlines it for the standalone file (without breaking the page)', () => {
    expect(hostPage({ documentHtml: doc(), mode: 'view' })).toContain('<script src="/vivliostyle.js"></script>');
    const inline = hostPage({ documentHtml: doc(), mode: 'view', inlineScript: 'var a="</script><b>";' });
    expect(inline).not.toContain('src="/vivliostyle.js"'); expect(inline).not.toContain('var a="</script>');
    expect(inline).toContain('<\\/script');
  });
  it('tells the parent window when layout is done, and credits the engine (AGPL notice)', () => {
    const h = hostPage({ documentHtml: doc(), mode: 'preview' });
    expect(h).toContain('parent.postMessage({ pagedDone: true'); expect(h).toContain('window.__pagedDone = true');
    expect(h).toContain('Vivliostyle'); expect(h).toContain('AGPL');
  });
  it('adds Adobe Express import hints only on request', () => {
    expect(hostPage({ documentHtml: doc(), mode: 'view' })).not.toContain('hz:slide-selector');
    expect(hostPage({ documentHtml: doc(), mode: 'view', importHints: true })).toContain('hz:slide-selector');
  });
  it('the document itself carries no scripts: it is plain, engine-neutral HTML + CSS', () => {
    const html = renderOffer(makeOffer({ seed: 1 }), context('de'));
    expect(/<script/i.test(html)).toBe(false);
    expect(/<link rel="stylesheet" href="[^"]*house\.css">/.test(html)).toBe(true);
  });
});
