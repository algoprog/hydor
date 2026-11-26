// File contexts (source + tree) and the per-file declaration finders.
import fs from 'node:fs';
import path from 'node:path';
import { langForFile, family, loadLanguage, parse } from './grammar.mjs';
import * as ts from './decl-ts.mjs';
import * as py from './decl-py.mjs';
import * as rs from './decl-rs.mjs';
import { findDeclsHeuristic, outlineHeuristic, braceEnd, indentEnd } from './heuristic.mjs';
import { escapeRe } from './search.mjs';
import { moduleStem } from './paths.mjs';

const MODS = { ts, js: ts, py, rs };
export const modFor = (lang) => MODS[family(lang)];

export class FileCache {
  constructor(cwd, max = 48) { this.cwd = cwd; this.max = max; this.map = new Map(); this.parsed = 0; }
  async get(rel) {
    const hit = this.map.get(rel);
    if (hit) { this.map.delete(rel); this.map.set(rel, hit); return hit; }
    const lang = langForFile(rel);
    let src;
    try { src = fs.readFileSync(path.resolve(this.cwd, rel), 'utf8'); } catch { return null; }
    if (src.charCodeAt(0) === 0xFEFF) src = src.slice(1);
    const tree = lang ? await parse(lang, src) : null;
    this.parsed++;
    const ctx = { path: rel, lang, src, lines: src.split('\n'), tree, root: tree ? tree.rootNode : null, grammar: !!tree };
    this.map.set(rel, ctx);
    if (this.map.size > this.max) {
      const k = this.map.keys().next().value;
      const old = this.map.get(k);
      try { old.tree && old.tree.delete(); } catch { /* ignore */ }
      this.map.delete(k);
    }
    return ctx;
  }
  dispose() {
    for (const c of this.map.values()) { try { c.tree && c.tree.delete(); } catch { /* ignore */ } }
    this.map.clear();
  }
}

export function occurrenceRegex(name) {
  return new RegExp(`(?<![\\w$])${escapeRe(name)}(?![\\w$])`, 'g');
}

// Leaf identifier-like nodes for each occurrence of `name` in the source.
export function* occurrences(ctx, name) {
  const re = occurrenceRegex(name);
  const { IDENT_TYPES } = modFor(ctx.lang);
  let m;
  while ((m = re.exec(ctx.src))) {
    if (!ctx.root) { yield { idx: m.index, leaf: null }; continue; }
    let leaf = ctx.root.descendantForIndex(m.index, m.index + 1);
    if (leaf && leaf.childCount > 0) leaf = ctx.root.descendantForIndex(m.index);
    if (!leaf || leaf.startIndex !== m.index || leaf.text !== name) { yield { idx: m.index, leaf: null, other: leaf }; continue; }
    yield { idx: m.index, leaf: IDENT_TYPES.has(leaf.type) ? leaf : null, other: leaf };
  }
}

// In a file that has parse errors, tree-sitter's recovery can move declaration boundaries without
// putting an ERROR node inside the declaration. Cross-check such extents with the brace/indent scanner.
function crossCheck(ctx, d) {
  if (!ctx.root || !ctx.root.hasError || d.errors || d.heuristic) return;
  if (!ctx.offsets) { ctx.offsets = []; let o = 0; for (const l of ctx.lines) { ctx.offsets.push(o); o += l.length + 1; } }
  let endRow;
  if (family(ctx.lang) === 'py') endRow = indentEnd(ctx.lines, d.declRow);
  else {
    const e = braceEnd(ctx.src, ctx.lang, ctx.offsets[d.declRow]);
    endRow = ctx.src.slice(0, Math.max(ctx.offsets[d.declRow], e - 1)).split('\n').length - 1;
  }
  if (endRow !== d.endRow) d.errors = 'file has parse errors and a brace scan disagrees';
}

// Declarations (and Rust impl blocks) of the last component of `parts` in one file.
export function findDeclsInFile(ctx, parts) {
  const name = parts[parts.length - 1];
  const qualifier = parts.slice(0, -1);
  const decls = [];
  const impls = [];
  const defIdx = new Set();
  if (!ctx.root) {
    for (const d of findDeclsHeuristic(ctx, name, { qualified: qualifier.length > 0 })) { d.file = ctx.path; decls.push(d); defIdx.add(d.nameIdx); }
    return { decls, impls, defIdx };
  }
  const mod = modFor(ctx.lang);
  const seen = new Set();
  for (const { leaf, idx } of occurrences(ctx, name)) {
    if (!leaf) continue;
    const d = mod.declFromName(ctx, leaf);
    if (d) {
      defIdx.add(idx);
      const key = `${d.startRow}-${d.endRow}-${d.kind}-${d.group}`;
      if (seen.has(key)) continue;
      seen.add(key);
      d.file = ctx.path;
      if (qualifier.length && !containerMatches(d, qualifier, ctx)) continue;
      crossCheck(ctx, d);
      decls.push(d);
    } else if (mod.implDeclFromLeaf && !qualifier.length) {
      const im = mod.implDeclFromLeaf(ctx, leaf, name);
      if (im) { im.file = ctx.path; impls.push(im); }
    }
  }
  return { decls, impls, defIdx };
}

function containerMatches(d, qualifier, ctx) {
  let q = qualifier;
  if (family(ctx.lang) === 'rs') q = q.filter((x, i) => !(i === 0 && (x === 'crate' || x === 'self' || x === 'super')) || false);
  if (!q.length) return true;
  const c = d.container;
  if (c.length >= q.length) {
    let ok = true;
    for (let i = 0; i < q.length; i++) if (c[c.length - q.length + i] !== q[i]) { ok = false; break; }
    if (ok) return true;
  }
  if (family(ctx.lang) === 'py' && d.loc === 'top' && q.length === 1) {
    // module.func: file stem (or package directory for __init__.py)
    if (moduleStem(ctx.path) === q[0]) return true;
  }
  return false;
}

export function outlineOf(ctx) {
  if (!ctx.root) return { entries: outlineHeuristic(ctx), heuristic: true };
  const entries = modFor(ctx.lang).outline(ctx);
  for (const e of entries) crossCheck(ctx, e.decl);
  return { entries, heuristic: false };
}
export { loadLanguage };
