// Filtering and ordering of definitions.
import path from 'node:path';
import { isTestPath } from './search.mjs';
import { isWithin, relSegments } from './paths.mjs';

const ALIASES = {
  fn: 'function', def: 'function', func: 'function', var: 'variable', let: 'variable', cls: 'class',
  iface: 'interface', alias: 'type', ns: 'namespace', module: 'namespace', mod: 'mod', prop: 'property',
  member: 'member', macro: 'macro', reexport: 're-export', 'enum-member': 'enum-member',
};
const EXPAND = {
  struct: ['type', 'class'], enum: ['type'], interface: ['type'], trait: ['type', 'interface'], union: ['type'],
  static: ['const'], getter: ['method'], setter: ['method'], property: ['field'], 'enum-member': ['member'],
  variant: ['member', 'enum-member'], mod: ['namespace', 'module'], namespace: ['module'],
  field: ['member'], method: ['function'],
};

export function normalizeKind(k) { const l = String(k).toLowerCase(); return ALIASES[l] || l; }

export function kindSet(d) {
  const s = new Set();
  for (const k of [d.kind, ...(d.kinds || [])]) {
    s.add(k);
    for (const e of EXPAND[k] || []) s.add(e);
  }
  // `method` should not match plain `function` filter in languages where the distinction matters
  if (d.kind === 'method') s.delete('function');
  if (d.kind === 'method' && d.lang === 'python') s.add('function');
  if (d.kind === 'method' && d.lang === 'rust') s.add('function');
  return s;
}

export function isTestDecl(d) { return !!d.isTest || isTestPath(d.file); }

export function selectDefs(decls, { qualified, kinds, noTests }) {
  let list = decls.filter((d) => d.kind !== 'impl');
  if (kinds && kinds.length) list = list.filter((d) => { const s = kindSet(d); return kinds.some((k) => s.has(k)); });
  if (noTests) list = list.filter((d) => !isTestDecl(d));
  if (qualified) return list;
  // plain lookup: members of interfaces / enums / structs only for qualified lookups
  let main = list.filter((d) => d.group === 'main' && d.kind !== 're-export');
  const reexports = list.filter((d) => d.kind === 're-export');
  if (main.length === 0) {
    main = list.filter((d) => d.group === 'objprop');
    if (main.length === 0) main = list.filter((d) => d.group === 'local');
  }
  return [...main, ...reexports];
}

export function sortDefs(defs, { cwd, inPaths }) {
  const inAbs = (inPaths || []).map((p) => path.resolve(cwd, p));
  const score = (d) => {
    const abs = path.resolve(cwd, d.file);
    for (let i = 0; i < inAbs.length; i++) if (isWithin(abs, inAbs[i])) return i;
    return inAbs.length;
  };
  const depth = (d) => {
    const rel = relSegments(cwd, d.file);
    const ups = rel.filter((x) => x === '..').length;
    return ups * 100 + rel.length;
  };
  const key = (d) => [d.kind === 're-export' ? 1 : 0, isTestDecl(d) ? 1 : 0, d.rank, score(d), depth(d)];
  return [...defs].sort((a, b) => {
    const ka = key(a); const kb = key(b);
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i];
    if (a.file !== b.file) return a.file < b.file ? -1 : 1;
    return a.startRow - b.startRow;
  });
}
