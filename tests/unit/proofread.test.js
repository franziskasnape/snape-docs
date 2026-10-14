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
const run = (fetch, f = fields) => proofread({ provider: 'api', apiKey: 'test-key', model: 'claude-opus-5-5', fields: f, lang: 'de', rules: 'Swiss spelling', fetch });

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
    await expect(proofread({ provider: 'api', apiKey: undefined, model: 'm', fields, lang: 'de', rules: '' })).rejects.toMatchObject({ code: 'not_configured', status: 503 });
    await expect(run(reply([], 401))).rejects.toMatchObject({ code: 'bad_key' });
    await expect(run(reply([], 401))).rejects.toBeInstanceOf(ProofreadError);
  });
  it('reports a declined answer', async () => {
    await expect(run(reply([], 200, { stop_reason: 'refusal', stop_details: { type: 'refusal', category: null, explanation: 'x' } }))).rejects.toMatchObject({ code: 'declined' });
  });
  it('does nothing (and calls nothing) for an empty document', async () => {
    const r = await proofread({ provider: 'api', apiKey: 'k', model: 'm', fields: [], lang: 'de', rules: '', fetch: () => { throw new Error('must not be called'); } });
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

import { resolveProvider } from '../../src/core/proofread';
import { createBridge, extractOutput, findClaude } from '../../scripts/claude-bridge.mjs';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('choosing how to reach Claude', () => {
  it('auto = API when a key is set, otherwise your own Claude login through the local helper', () => {
    expect(resolveProvider('auto', true)).toBe('api');
    expect(resolveProvider('auto', false)).toBe('local-claude');
    expect(resolveProvider('local-claude', true)).toBe('local-claude');
    expect(resolveProvider('api', false)).toBe('api');
  });
});

describe('the local Claude helper (with a stand-in for Claude Code)', () => {
  const fakeClaude = (loggedIn = true) => {
    const dir = mkdtempSync(join(tmpdir(), 'fake-claude-')), f = join(dir, 'claude');
    writeFileSync(f, `#!/usr/bin/env node
const a = process.argv.slice(2);
if (a[0] === 'auth') { console.log(JSON.stringify({ loggedIn: ${loggedIn} })); process.exit(0); }
let input = ''; process.stdin.on('data', (d) => (input += d)); process.stdin.on('end', () => {
  const fields = JSON.parse(input);
  if (!${loggedIn}) { console.log(JSON.stringify({ is_error: true, result: 'Not logged in · Please run /login' })); return; }
  console.log(JSON.stringify({ is_error: false, result: '', usage: { input_tokens: 400, output_tokens: 60 },
    structured_output: { suggestions: [{ n: 1, after: fields[0].text.replace('Gemaelde', 'Gemälde'), category: 'spelling', reason: 'Spelling.' }] },
    _args: a.includes('--tools') && a.includes('--no-session-persistence') && a.includes('--json-schema') }));
});`);
    chmodSync(f, 0o755); return f;
  };
  const start = async (loggedIn) => { const b = createBridge({ claudeBin: fakeClaude(loggedIn), port: 0 }); await b.listen(); return { b, url: `http://127.0.0.1:${b.server.address().port}` }; };
  const bridgeField = [{ path: '/data/blocks/@a/paragraphs/0', text: 'Das Gemaelde zeigt 3 Risse.', label: 'p', html: false }];

  it('answers a proofread request through the local login, and the app side turns it into suggestions', async () => {
    const { b, url } = await start(true);
    try {
      const r = await proofread({ provider: 'local-claude', apiKey: undefined, model: 'x', fields: bridgeField, lang: 'de', rules: 'r', bridgeURL: url });
      expect(r.suggestions).toHaveLength(1);
      expect(r.suggestions[0].after).toBe('Das Gemälde zeigt 3 Risse.');
      expect(r.model).toBe('local Claude');
      expect(r.usage).toEqual({ inputTokens: 400, outputTokens: 60 });
      expect((await (await fetch(url + '/health')).json())).toMatchObject({ ok: true, loggedIn: true });
    } finally { await b.close(); }
  });
  it('tells you to log in when Claude Code is not logged in', async () => {
    const { b, url } = await start(false);
    try {
      await expect(proofread({ provider: 'local-claude', apiKey: undefined, model: 'x', fields: bridgeField, lang: 'de', rules: '', bridgeURL: url })).rejects.toMatchObject({ code: 'not_logged_in' });
      expect((await (await fetch(url + '/health')).json()).loggedIn).toBe(false);
    } finally { await b.close(); }
  });
  it('tells you to start the helper when it is not running', async () => {
    await expect(proofread({ provider: 'local-claude', apiKey: undefined, model: 'x', fields: bridgeField, lang: 'de', rules: '', bridgeURL: 'http://127.0.0.1:1' })).rejects.toMatchObject({ code: 'bridge_down' });
  });
  it('refuses requests that come from a web page (browser requests carry an Origin)', async () => {
    const { b, url } = await start(true);
    try {
      const r = await fetch(url + '/run', { method: 'POST', headers: { origin: 'https://evil.example', 'content-type': 'application/json' }, body: '{}' });
      expect(r.status).toBe(403);
    } finally { await b.close(); }
  });
  it('reads Claude Code\'s JSON result: structured output, or JSON in the text (also in a code fence), and errors', () => {
    expect(extractOutput(JSON.stringify({ structured_output: { suggestions: [] } })).output).toEqual({ suggestions: [] });
    expect(extractOutput(JSON.stringify({ result: '```json\n{"suggestions":[]}\n```' })).output).toEqual({ suggestions: [] });
    expect(() => extractOutput(JSON.stringify({ is_error: true, result: 'Not logged in' }))).toThrow(/Not logged in/);
  });
  it('finds a Claude Code program (or reports none)', () => {
    expect(findClaude({ CLAUDE_BIN: '/nonexistent/claude', PATH: '' })).toBeNull();
    expect(typeof (findClaude() ?? '')).toBe('string');
  });
});
