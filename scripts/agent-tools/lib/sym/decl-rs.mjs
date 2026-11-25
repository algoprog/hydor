// Declaration extraction for Rust trees.
import { sameNode, endRowOf, attachedStart } from './nodeutil.mjs';

export const IDENT_TYPES = new Set(['identifier', 'type_identifier', 'field_identifier', 'shorthand_field_identifier', 'metavariable']);

const isAttr = (n) => n.type === 'attribute_item';
const isComment = (n) => (n.type === 'line_comment' || n.type === 'block_comment') && !/^\/\/!|^\/\*!/.test(n.text);

const NAME_PARENTS = {
  function_item: 'function', function_signature_item: 'function', struct_item: 'struct', enum_item: 'enum',
  union_item: 'union', trait_item: 'trait', type_item: 'type', associated_type: 'type', const_item: 'const',
  static_item: 'static', mod_item: 'mod', macro_definition: 'macro', enum_variant: 'variant', field_declaration: 'field',
};
const fieldIs = (p, f, n) => { const c = p.childForFieldName(f); return !!c && sameNode(c, n); };

export function implTypeName(impl) {
  let t = impl.childForFieldName('type');
  for (let i = 0; t && i < 6; i++) {
    if (t.type === 'type_identifier' || t.type === 'primitive_type') return t.text;
    if (t.type === 'generic_type' || t.type === 'reference_type' || t.type === 'pointer_type') t = t.childForFieldName('type');
    else if (t.type === 'scoped_type_identifier') t = t.childForFieldName('name');
    else break;
  }
  return t ? t.text.replace(/<.*$/s, '') : null;
}
export function implTraitName(impl) {
  let t = impl.childForFieldName('trait');
  for (let i = 0; t && i < 4; i++) {
    if (t.type === 'type_identifier') return t.text;
    if (t.type === 'generic_type') t = t.childForFieldName('type');
    else if (t.type === 'scoped_type_identifier') t = t.childForFieldName('name');
    else break;
  }
  return t ? t.text : null;
}

export function implHeader(impl) {
  const body = impl.childForFieldName('body');
  const endIdx = body ? body.startIndex : impl.endIndex;
  return impl.text.slice(0, endIdx - impl.startIndex).replace(/\s+/g, ' ').replace(/\s+where\b.*$/, '').replace(/[,\s]+$/, '').trim();
}

function attrTexts(node) {
  const out = [];
  let cur = node;
  for (;;) {
    const prev = cur.previousSibling;
    if (!prev) break;
    if (prev.type === 'attribute_item') out.push(prev.text);
    else if (prev.type !== 'line_comment' && prev.type !== 'block_comment') break;
    cur = prev;
  }
  return out;
}
function isTestAttr(t) { return /#\[\s*(?:[\w:]*::)?test\b|#\[\s*cfg\s*\(\s*test\s*\)|#\[\s*cfg\(.*\btest\b/.test(t); }

function baseDecl(ctx, nameNode, kind, startRow, endRow, declRow) {
  return {
    lang: ctx.lang, name: nameNode.text, kind, kinds: [kind], container: [], sep: '::',
    startRow, endRow, declRow, sigEndRow: null, exported: null, access: null, attrs: [], group: 'main',
    loc: 'top', rank: 0, errors: false, nameIdx: nameNode.startIndex, nameRow: nameNode.startPosition.row,
    decoratorCount: 0, nOverloads: 0, isTest: false, implTrait: null,
  };
}

function scopeInfo(node) {
  const container = [];
  let inFunction = false;
  let implTrait = null;
  let inTraitLike = false;
  let isTest = false;
  for (let a = node.parent; a; a = a.parent) {
    switch (a.type) {
      case 'impl_item': {
        const n = implTypeName(a); if (n) container.unshift(n);
        const tr = implTraitName(a); if (tr && !implTrait) { implTrait = tr; }
        if (tr) inTraitLike = true;
        break;
      }
      case 'trait_item': { const n = a.childForFieldName('name'); if (n) container.unshift(n.text); inTraitLike = true; break; }
      case 'mod_item': case 'enum_item': case 'struct_item': case 'union_item': {
        const n = a.childForFieldName('name'); if (n) container.unshift(n.text);
        if (a.type === 'mod_item' && attrTexts(a).some(isTestAttr)) isTest = true;
        break;
      }
      case 'function_item': {
        const n = a.childForFieldName('name'); if (n) container.unshift(n.text);
        inFunction = true;
        if (attrTexts(a).some(isTestAttr)) isTest = true;
        break;
      }
      case 'impl_item_': break;
      default: break;
    }
  }
  return { container, inFunction, implTrait, inTraitLike, isTest };
}

export function declFromName(ctx, nameNode) {
  const p = nameNode.parent;
  if (!p) return null;
  const kind = NAME_PARENTS[p.type];
  if (!kind || !fieldIs(p, 'name', nameNode)) return null;
  const { container, inFunction, implTrait, inTraitLike, isTest } = scopeInfo(p);
  const startRow = attachedStart(p, isAttr, isComment);
  const endRow = endRowOf(p);
  const d = baseDecl(ctx, nameNode, kind, startRow, endRow, p.startPosition.row);
  d.container = container;
  d.errors = p.hasError;
  d.implTrait = implTrait;
  const vis = p.namedChildren.find((c) => c.type === 'visibility_modifier');
  d.exported = vis ? vis.text.replace(/\s+/g, '') : null;
  if (inFunction) d.loc = 'local';
  else if (container.length) d.loc = 'member';
  else d.loc = 'top';
  if (kind === 'function' && d.loc === 'member' && p.parent && p.parent.type === 'declaration_list' && p.parent.parent && (p.parent.parent.type === 'impl_item' || p.parent.parent.type === 'trait_item')) {
    d.kind = 'method'; d.kinds = ['method', 'function'];
  }
  if (kind === 'variant' || kind === 'field') d.group = 'member-sig';
  if (kind === 'function' && p.type === 'function_item' && p.children.some((c) => c.type === 'function_modifiers')) {
    const fm = p.children.find((c) => c.type === 'function_modifiers').text;
    if (/\basync\b/.test(fm)) d.attrs.push('async');
    if (/\bunsafe\b/.test(fm)) d.attrs.push('unsafe');
  }
  if (kind === 'struct') d.kinds = ['struct', 'class'];
  const body = p.childForFieldName('body');
  if (body) d.sigEndRow = Math.min(endRow, body.startPosition.row);
  const myAttrs = attrTexts(p);
  d.isTest = isTest || myAttrs.some(isTestAttr);
  d.decoratorCount = myAttrs.length;
  const pubLike = !!vis || inTraitLike;
  d.rank = d.loc === 'local' ? 3 : d.loc === 'top' ? (vis ? 0 : 0.5) : (pubLike && d.group === 'main' ? 1 : 2);
  if (inTraitLike && !vis) d.exported = null;
  return d;
}

// impl blocks that mention `name` as implemented type or trait; returns pseudo decls
export function implDeclFromLeaf(ctx, leaf, name) {
  if (leaf.type !== 'type_identifier') return null;
  let impl = null;
  for (let a = leaf.parent; a; a = a.parent) {
    if (a.type === 'impl_item') { impl = a; break; }
    if (a.type === 'declaration_list' || a.type === 'source_file') return null;
  }
  if (!impl) return null;
  const body = impl.childForFieldName('body');
  if (body && leaf.startIndex >= body.startIndex) return null;
  const tn = implTypeName(impl);
  const tr = implTraitName(impl);
  if (tn !== name && tr !== name) return null;
  const d = baseDecl(ctx, leaf, 'impl', attachedStart(impl, isAttr, isComment), endRowOf(impl), impl.startPosition.row);
  d.name = implHeader(impl);
  d.implFor = tn; d.implOf = tr;
  d.isTest = attrTexts(impl).some(isTestAttr) || scopeInfo(impl).isTest;
  d.errors = impl.hasError;
  d.group = 'impl';
  return d;
}

// ---------------------------------------------------------------- outline

export function outline(ctx) {
  const out = [];
  const push = (d, depth) => { if (d) out.push({ decl: d, depth }); };
  const visit = (parent, depth) => {
    for (const n of parent.namedChildren) {
      if (n.type === 'impl_item') {
        const body = n.childForFieldName('body');
        const d = baseDecl(ctx, n.child(0), 'impl', attachedStart(n, isAttr, isComment), endRowOf(n), n.startPosition.row);
        d.name = implHeader(n); d.errors = n.hasError;
        push(d, depth);
        if (body) visit(body, depth + 1);
      } else if (n.type === 'mod_item') {
        const nm = n.childForFieldName('name');
        push(declFromName(ctx, nm), depth);
        const body = n.childForFieldName('body');
        if (body) visit(body, depth + 1);
      } else if (n.type === 'trait_item') {
        const nm = n.childForFieldName('name');
        push(declFromName(ctx, nm), depth);
        const body = n.childForFieldName('body');
        if (body) visit(body, depth + 1);
      } else if (NAME_PARENTS[n.type] && n.type !== 'enum_variant' && n.type !== 'field_declaration') {
        const nm = n.childForFieldName('name');
        if (nm) push(declFromName(ctx, nm), depth);
      }
    }
  };
  visit(ctx.root, 0);
  return out;
}
