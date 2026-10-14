// Proofreading with a FAKE Anthropic server (nothing is sent anywhere, no key needed).
import { describe, expect, it } from 'vitest';
import { acceptable, proofread, ProofreadError, systemPrompt } from '../../src/core/proofread';
import { offerTextFields } from '../../src/doctypes/offer/text';
import { ensureIds } from '../../src/core/validate';
import { makeCollectionOffer, makeOffer } from '../layout/fixtures.js';

const reply = (suggestions, status = 200, extra = {}) => async (_url, init) => {
  reply.last = JSON.parse(init.body);
  return new Response(JSON.stringify(status === 200
    ? { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'text', text: JSON.stringify({ suggestions }) }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1200, output_tokens: 300 }, ...extra }
    : { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }), { status, headers: { 'content-type': 'application/json' } });
};
const fields = [
  { path: '/data/blocks/@a/paragraphs/0', text: 'Das Gemälde zeigt eine Landschaft mit <strong>3</strong> Bäumen.', label: 'p', html: true },
  { path: '/data/blocks/@a/paragraphs/1', text: 'Alles in Ordnung.', label: 'p2', html: true },
];
const run = (fetch, f = fields) => proofread({ apiKey: 'test-key', model: 'claude-opus-5-5', fields: f, lang: 'de', rules: 'Swiss spelling', fetch });

describe('proofreading', () => {
  it('returns the suggestions with the original, the correction and the reason', async () => {
    const r = await run(reply([{ n: 1, after: 'Das Gemälde zeigt eine Landschaft mit <strong>3</strong> Bäumen und einem See.', category: 'style', reason: 'x' }, { n: 1, after: 'dup', category: 'style', reason: 'x' }]));
    expect(r.suggestions).toHaveLength(1);
    expect(r.suggestions[0]).toMatchObject({ path: '/data/blocks/@a/paragraphs/0', before: fields[0].text, category: 'style' });
    expect(r.checked).toBe(2); expect(r.skipped).toBe(1);          // the duplicate answer for field 1 is ignored
    expect(r.usage).toEqual({ inputTokens: 1200, outputTokens: 300 });
  });
  it('sends the house rules, the field texts and the key, and nothing else', async () => {
    await run(reply([]));
    const body = reply.last;
    expect(body.model).toBe('claude-opus-5-5');
    expect(JSON.stringify(body.system)).toContain('Swiss spelling');
    expect(body.messages[0].content).toContain('Landschaft');
    expect(body.output_config.format.type).toBe('json_schema');
  });
  it('drops suggestions that change numbers, HTML tags or nothing', async () => {
    const r = await run(reply([
      { n: 1, after: 'Das Gemälde zeigt eine Landschaft mit <strong>4</strong> Bäumen.', category: 'grammar', reason: 'changed a number' },
      { n: 1, after: 'Das Gemälde zeigt eine Landschaft mit 3 Bäumen.', category: 'grammar', reason: 'removed a tag' },
      { n: 2, after: 'Alles in Ordnung.', category: 'style', reason: 'no change' },
      { n: 9, after: 'x', category: 'style', reason: 'no such field' },
    ]));
    expect(r.suggestions).toEqual([]); expect(r.skipped).toBe(4);
  });
  it('acceptable(): keeps tags and numbers, allows wording changes', () => {
    expect(acceptable('Preis CHF 1\'300.–', 'Preis CHF 1\'300.–')).toBe(false);
    expect(acceptable('<b>a</b> 12', '<b>b</b> 12')).toBe(true);
    expect(acceptable('<b>a</b> 12', '<i>a</i> 12')).toBe(false);
    expect(acceptable('ca. 2–3 Stunden', 'ca. 2–4 Stunden')).toBe(false);
    expect(acceptable('abc', '  ')).toBe(false);
  });
  it('explains a missing or wrong key, and does not call the API without a key', async () => {
    await expect(proofread({ apiKey: undefined, model: 'm', fields, lang: 'de', rules: '' })).rejects.toMatchObject({ code: 'not_configured', status: 503 });
    await expect(run(reply([], 401))).rejects.toMatchObject({ code: 'bad_key' });
    await expect(run(reply([], 401))).rejects.toBeInstanceOf(ProofreadError);
  });
  it('reports a declined answer', async () => {
    await expect(run(reply([], 200, { stop_reason: 'refusal', stop_details: { type: 'refusal', category: null, explanation: 'x' } }))).rejects.toMatchObject({ code: 'declined' });
  });
  it('does nothing (and calls nothing) for an empty document', async () => {
    const r = await proofread({ apiKey: 'k', model: 'm', fields: [], lang: 'de', rules: '', fetch: () => { throw new Error('must not be called'); } });
    expect(r.suggestions).toEqual([]);
  });
  it('the system prompt names the language and carries the rules', () => {
    expect(systemPrompt('en', 'Rule X')).toMatch(/English[\s\S]*Rule X/);
    expect(systemPrompt('de', '')).toContain('German');
  });
});

describe('which wording is checked', () => {
  it('includes the printed text and excludes private notes, client data, hours and prices', () => {
    const d = ensureIds(makeOffer({ seed: 1, rows: 2 }));
    d.privateNotes = '<ul><li>GEHEIM</li></ul>';
    const all = JSON.stringify(offerTextFields(d));
    expect(all).not.toContain('GEHEIM');
    expect(offerTextFields(d).some((f) => f.path.includes('/desc'))).toBe(true);
    expect(offerTextFields(d).every((f) => !/hours|rate|cost\/(deliveryFrom|materials)/.test(f.path))).toBe(true);
  });
  it('uses PATCH paths with @id, so a suggestion can be applied exactly where it came from', () => {
    const d = ensureIds(makeCollectionOffer({ seed: 1, objects: 3 }));
    const f = offerTextFields(d);
    expect(f.some((x) => /^\/data\/blocks\/@[0-9a-z]+\/rows\/@[0-9a-z]+\/title$/.test(x.path))).toBe(true);
    expect(f.some((x) => x.path.endsWith('/defaultText'))).toBe(true);
    expect(new Set(f.map((x) => x.path)).size).toBe(f.length);
  });
});
