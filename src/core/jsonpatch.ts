/**
 * Small JSON Patch (RFC 6902: add, remove, replace, move, copy, test) with one extension that suits documents:
 * a path segment `@<id>` addresses the array item whose `id` equals <id>, so "/data/blocks/@c4f75ceb/rows/-" keeps working
 * when blocks are added or moved. `-` appends.
 */
export class PatchError extends Error {
  constructor(public index: number, message: string) { super(`op ${index}: ${message}`); }
}

export type PatchOp = { op: 'add' | 'replace' | 'test'; path: string; value: unknown } | { op: 'remove'; path: string } | { op: 'move' | 'copy'; from: string; path: string };

const unescape = (s: string) => s.replace(/~1/g, '/').replace(/~0/g, '~');
const parse = (p: string, i: number) => {
  if (p === '') return [];
  if (!p.startsWith('/')) throw new PatchError(i, `path "${p}" must start with "/"`);
  return p.slice(1).split('/').map(unescape);
};

function key(parent: any, seg: string, i: number, forAdd = false): string | number {
  if (Array.isArray(parent)) {
    if (seg === '-') { if (forAdd) return parent.length; throw new PatchError(i, '"-" can only be used to append'); }
    if (seg.startsWith('@')) {
      const at = parent.findIndex((x) => x && typeof x === 'object' && x.id === seg.slice(1));
      if (at < 0) throw new PatchError(i, `no item with id "${seg.slice(1)}"`);
      return at;
    }
    if (!/^\d+$/.test(seg)) throw new PatchError(i, `"${seg}" is not an array index`);
    const n = Number(seg);
    if (n > parent.length || (n === parent.length && !forAdd)) throw new PatchError(i, `index ${n} is out of range (length ${parent.length})`);
    return n;
  }
  if (parent && typeof parent === 'object') return seg;
  throw new PatchError(i, `cannot go into a ${parent === null ? 'null' : typeof parent} value`);
}

function walk(doc: any, segs: string[], i: number) {
  let cur = doc;
  for (const s of segs) {
    const k = key(cur, s, i);
    if (cur[k] === undefined) throw new PatchError(i, `path does not exist at "${s}"`);
    cur = cur[k];
  }
  return cur;
}

const clone = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Applies the operations to a copy of `doc` and returns it. Throws PatchError (with the index of the failing operation). */
export function applyPatch<T>(input: T, ops: PatchOp[]): T {
  if (!Array.isArray(ops)) throw new PatchError(0, 'a patch is an array of operations');
  let doc: any = clone(input);
  ops.forEach((o: any, i) => {
    if (!o || typeof o.op !== 'string' || typeof o.path !== 'string') throw new PatchError(i, 'each operation needs "op" and "path"');
    const segs = parse(o.path, i);
    const get = (s: string[]) => walk(doc, s, i);
    const put = (s: string[], value: unknown, mode: 'add' | 'replace') => {
      if (!s.length) { doc = value; return; }
      const parent = get(s.slice(0, -1)), k = key(parent, s[s.length - 1], i, mode === 'add');
      if (mode === 'replace' && Array.isArray(parent) && parent[k as number] === undefined) throw new PatchError(i, 'replace needs an existing array item (use add)');   // on an object, replacing a missing key just sets it
      if (Array.isArray(parent) && mode === 'add') parent.splice(k as number, 0, clone(value)); else parent[k] = clone(value);
    };
    const take = (s: string[]) => {
      if (!s.length) throw new PatchError(i, 'cannot remove the whole document');
      const parent = get(s.slice(0, -1)), k = key(parent, s[s.length - 1], i);
      if (parent[k] === undefined) throw new PatchError(i, 'path does not exist');
      return Array.isArray(parent) ? parent.splice(k as number, 1)[0] : (() => { const v = parent[k]; delete parent[k]; return v; })();
    };
    switch (o.op) {
      case 'add': case 'replace':
        if (!('value' in o)) throw new PatchError(i, `${o.op} needs "value"`);
        put(segs, o.value, o.op); break;
      case 'remove': take(segs); break;
      case 'test': if (!same(get(segs), o.value)) throw new PatchError(i, `test failed at ${o.path}`); break;
      case 'move': { const from = parse(o.from ?? '', i); const v = take(from); put(segs, v, 'add'); break; }
      case 'copy': { const from = parse(o.from ?? '', i); put(segs, get(from), 'add'); break; }
      default: throw new PatchError(i, `unknown op "${o.op}"`);
    }
  });
  return doc;
}
