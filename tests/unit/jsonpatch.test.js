import { describe, expect, it } from 'vitest';
import { applyPatch, PatchError } from '../../src/core/jsonpatch';

const doc = () => ({ title: 'T', data: { blocks: [{ id: 'a1', type: 'measures', rows: [{ id: 'r1', title: 'x', hoursMin: 1 }] }, { id: 'b2', type: 'note', html: 'n' }] } });

describe('JSON Patch', () => {
  it('replaces, adds, removes and appends', () => {
    const r = applyPatch(doc(), [
      { op: 'replace', path: '/title', value: 'New' },
      { op: 'add', path: '/data/blocks/0/rows/-', value: { id: 'r2', title: 'y', hoursMin: 2 } },
      { op: 'remove', path: '/data/blocks/1' },
    ]);
    expect(r.title).toBe('New');
    expect(r.data.blocks).toHaveLength(1);
    expect(r.data.blocks[0].rows.map((x) => x.id)).toEqual(['r1', 'r2']);
  });
  it('inserts at an index and moves items', () => {
    const r = applyPatch(doc(), [{ op: 'add', path: '/data/blocks/0', value: { id: 'z', type: 'pagebreak' } }, { op: 'move', from: '/data/blocks/0', path: '/data/blocks/2' }]);
    expect(r.data.blocks.map((b) => b.id)).toEqual(['a1', 'b2', 'z']);
  });
  it('addresses items by id with @id, which survives reordering', () => {
    const r = applyPatch(doc(), [{ op: 'replace', path: '/data/blocks/@a1/rows/@r1/hoursMin', value: 5 }]);
    expect(r.data.blocks[0].rows[0].hoursMin).toBe(5);
  });
  it('does not change the input, and applies all operations or none', () => {
    const d = doc();
    expect(() => applyPatch(d, [{ op: 'replace', path: '/title', value: 'X' }, { op: 'remove', path: '/data/nope' }])).toThrow(PatchError);
    expect(d.title).toBe('T');
  });
  it('test fails with the operation index', () => {
    try { applyPatch(doc(), [{ op: 'test', path: '/title', value: 'other' }]); throw new Error('should fail'); } catch (e) { expect(e).toBeInstanceOf(PatchError); expect(e.index).toBe(0); }
  });
  it('reports clear errors', () => {
    expect(() => applyPatch(doc(), [{ op: 'replace', path: '/data/blocks/@missing/html', value: 1 }])).toThrow(/no item with id "missing"/);
    expect(() => applyPatch(doc(), [{ op: 'add', path: '/data/blocks/9', value: 1 }])).toThrow(/out of range/);
    expect(() => applyPatch(doc(), [{ op: 'frobnicate', path: '/title' }])).toThrow(/unknown op/);
    expect(() => applyPatch(doc(), [{ op: 'replace', path: 'title', value: 1 }])).toThrow(/must start with/);
  });
  it('replace on a missing object key sets it; on a missing array item it fails', () => {
    expect(applyPatch({ a: {} }, [{ op: 'replace', path: '/a/new', value: 1 }]).a.new).toBe(1);
    expect(() => applyPatch({ a: [] }, [{ op: 'replace', path: '/a/0', value: 1 }])).toThrow(PatchError);
  });
  it('handles ~ and / in keys', () => {
    const r = applyPatch({ a: { 'b/c': 1, 'd~e': 2 } }, [{ op: 'replace', path: '/a/b~1c', value: 9 }, { op: 'replace', path: '/a/d~0e', value: 8 }]);
    expect(r.a).toEqual({ 'b/c': 9, 'd~e': 8 });
  });
});
