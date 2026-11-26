// Declaration extraction for TypeScript / TSX / JavaScript trees.
import { sameNode, endRowOf, attachedStart } from './nodeutil.mjs';

export const IDENT_TYPES = new Set([
  'identifier', 'type_identifier', 'property_identifier', 'private_property_identifier',
  'shorthand_property_identifier', 'shorthand_property_identifier_pattern', 'jsx_identifier',
  'statement_identifier',
]);

const DECL_KIND = {
  function_declaration: 'function', generator_function_declaration: 'function', function_signature: 'function',
  class_declaration: 'class', abstract_class_declaration: 'class',
  interface_declaration: 'interface', type_alias_declaration: 'type', enum_declaration: 'enum',
  internal_module: 'namespace', module: 'namespace',
};
const FN_VALUE = new Set(['arrow_function', 'function_expression', 'function', 'generator_function']);
const SIG_TYPES = new Set(['function_signature', 'method_signature']);
const IMPL_TYPES = new Set(['function_declaration', 'generator_function_declaration', 'method_definition']);
const MEMBER_TYPES = new Set([
  'method_definition', 'method_signature', 'abstract_method_signature', 'public_field_definition',
  'field_definition', 'property_signature',
]);
const CONTAINER_NAMED = new Set([
  'class_declaration', 'abstract_class_declaration', 'interface_declaration', 'enum_declaration',
  'type_alias_declaration', 'internal_module', 'module',
]);

const isAttr = (n) => n.type === 'decorator';
const isComment = (n) => n.type === 'comment';
const isTrivia = (n) => n.type === 'comment' || n.type === ';' || n.type === ',' || n.type === 'decorator';

function fieldIs(parent, field, node) {
  const c = parent.childForFieldName(field);
  return !!c && sameNode(c, node);
}

function unwrapDecl(s) {
  let d = s;
  while (d && (d.type === 'export_statement' || d.type === 'ambient_declaration' || d.type === 'expression_statement')) {
    d = d.childForFieldName('declaration') || d.namedChildren.find((c) => c.type !== 'comment' && c.type !== 'decorator') || null;
  }
  return d;
}

function statementOf(node) {
  let s = node;
  for (;;) {
    const par = s.parent;
    if (!par) break;
    if (par.type === 'export_statement' || par.type === 'ambient_declaration') { s = par; continue; }
    if (par.type === 'expression_statement' && (s.type === 'internal_module' || s.type === 'module')) { s = par; continue; }
    break;
  }
  return s;
}

function nameOfDeclNode(n) {
  const nm = n.childForFieldName('name') || n.childForFieldName('property');
  return nm ? nm.text : null;
}

function nameParts(n) {
  const nm = n.childForFieldName('name');
  if (!nm) return [];
  if (nm.type === 'nested_identifier') return nm.text.split('.');
  if (nm.type === 'string') return [];
  return [nm.text];
}

function unwrapValue(v) {
  while (v && (v.type === 'parenthesized_expression' || v.type === 'as_expression' || v.type === 'satisfies_expression' || v.type === 'non_null_expression' || v.type === 'type_assertion')) {
    v = v.namedChild(0);
  }
  return v;
}

function scopeInfo(declNode) {
  const container = [];
  let inFunction = false;
  for (let a = declNode.parent; a; a = a.parent) {
    const t = a.type;
    if (CONTAINER_NAMED.has(t)) {
      container.unshift(...nameParts(a));
    } else if (t === 'variable_declarator') {
      const nm = a.childForFieldName('name');
      if (nm && nm.type === 'identifier') container.unshift(nm.text);
    } else if (t === 'pair') {
      const k = a.childForFieldName('key');
      if (k) container.unshift(k.text);
    } else if (t === 'function_declaration' || t === 'generator_function_declaration') {
      const nm = nameOfDeclNode(a);
      if (nm) container.unshift(nm);
      inFunction = true;
    } else if (t === 'method_definition') {
      const nm = nameOfDeclNode(a);
      if (nm) container.unshift(nm);
      inFunction = true;
    } else if (FN_VALUE.has(t)) {
      inFunction = true;
    } else if (t === 'class' ) {
      const nm = a.childForFieldName('name');
      if (nm) container.unshift(nm.text);
    }
  }
  return { container, inFunction };
}

function modifiers(node) {
  const m = { access: null, static: false, abstract: false, async: false, get: false, set: false, readonly: false };
  for (let i = 0; i < node.childCount; i++) {
    const c = node.child(i);
    switch (c.type) {
      case 'accessibility_modifier': m.access = c.text; break;
      case 'static': m.static = true; break;
      case 'abstract': m.abstract = true; break;
      case 'async': m.async = true; break;
      case 'get': m.get = true; break;
      case 'set': m.set = true; break;
      case 'readonly': m.readonly = true; break;
      default: break;
    }
  }
  return m;
}

function declRowOf(stmt) {
  // row of the first token of the declaration proper (after decorators / comments)
  let n = stmt;
  for (let depth = 0; depth < 3 && n; depth++) {
    let next = null;
    for (let i = 0; i < n.childCount; i++) {
      const c = n.child(i);
      if (c.type === 'decorator' || c.type === 'comment') continue;
      next = c; break;
    }
    if (!next) break;
    if (next.childCount > 0 && next.namedChildren.some((c) => c.type === 'decorator') && /declaration|class/.test(next.type)) { n = next; continue; }
    return next.startPosition.row;
  }
  return stmt.startPosition.row;
}

function sigEndRow(declNode, endRow) {
  const bodyTypes = new Set(['statement_block', 'class_body', 'interface_body', 'enum_body']);
  let body = declNode.childForFieldName('body');
  let v = null;
  if (declNode.type === 'variable_declarator' || declNode.type === 'public_field_definition' || declNode.type === 'field_definition' || declNode.type === 'pair') {
    v = unwrapValue(declNode.childForFieldName('value'));
    if (v) {
      if (FN_VALUE.has(v.type) || v.type === 'class') body = v.childForFieldName('body');
      else if (v.type === 'call_expression') {
        const args = v.childForFieldName('arguments');
        let found = null;
        if (args) for (const a of args.namedChildren) {
          const u = unwrapValue(a);
          if (u && FN_VALUE.has(u.type)) { found = u.childForFieldName('body'); break; }
        }
        if (found) body = found; else return Math.min(endRow, v.startPosition.row);
      } else if (v.type === 'object') return Math.min(endRow, v.startPosition.row);
      else return null;
    }
  }
  if (body && bodyTypes.has(body.type)) return Math.min(endRow, body.startPosition.row);
  if (body) return Math.min(endRow, body.startPosition.row); // expression-bodied arrow
  return null;
}

// Find the run of overload signatures + implementation around a declaration statement.
function overloadRun(stmt, name) {
  const sameSig = (s) => {
    const d = unwrapDecl(s);
    return d && SIG_TYPES.has(d.type) && nameOfDeclNode(d) === name && !(d.parent && d.parent.type === 'interface_body' && false);
  };
  const sameImpl = (s) => {
    const d = unwrapDecl(s);
    return d && IMPL_TYPES.has(d.type) && nameOfDeclNode(d) === name;
  };
  const prevOf = (s) => { let p = s.previousSibling; while (p && isTrivia(p)) p = p.previousSibling; return p; };
  const nextOf = (s) => { let p = s.nextSibling; while (p && isTrivia(p)) p = p.nextSibling; return p; };
  let first = stmt; let last = stmt; let count = 1;
  const isSig = (s) => { const d = unwrapDecl(s); return !!d && SIG_TYPES.has(d.type); };
  let sigs = isSig(stmt) ? 1 : 0;
  for (let p = prevOf(first); p && sameSig(p); p = prevOf(first)) { first = p; count++; sigs++; }
  const lastD = unwrapDecl(last);
  if (lastD && SIG_TYPES.has(lastD.type)) {
    for (let n = nextOf(last); n && (sameSig(n) || sameImpl(n)); n = nextOf(last)) {
      last = n; count++;
      if (sameSig(n)) sigs++;
      if (sameImpl(n)) break;
    }
  }
  return { first, last, count, sigs };
}

function reexportDecl(ctx, nameNode, p) {
  // p is export_specifier or namespace_export; returns Decl or null
  const stmt = p.type === 'namespace_export' ? p.parent : p.parent.parent; // export_specifier -> export_clause -> export_statement
  if (!stmt || stmt.type !== 'export_statement') return null;
  const source = stmt.childForFieldName('source');
  let orig = null;
  if (p.type === 'export_specifier') {
    const alias = p.childForFieldName('alias');
    const nm = p.childForFieldName('name');
    if (alias && sameNode(alias, nameNode)) orig = nm ? nm.text : null;
    else if (!alias && nm && sameNode(nm, nameNode) && source) orig = nameNode.text;
    else return null;
  } else {
    orig = '*';
    if (!source) return null;
  }
  const startRow = attachedStart(stmt, isAttr, isComment);
  const d = baseDecl(ctx, nameNode, 're-export', stmt, startRow, endRowOf(stmt), stmt.startPosition.row);
  d.group = 'main';
  d.reexport = { orig, from: source ? source.text.replace(/^['"`]|['"`]$/g, '') : null };
  d.container = [];
  d.loc = 'top';
  d.exported = 'exported';
  d.rank = 0.7;
  d.errors = stmt.hasError;
  return d;
}

function assignedMember(ctx, nameNode, me) {
  const asg = me.parent;
  const stmt = asg.parent;
  if (stmt.parent && stmt.parent.type !== 'program' && stmt.parent.type !== 'statement_block') return null;
  const v = unwrapValue(asg.childForFieldName('right'));
  const fnv = !!v && (FN_VALUE.has(v.type) || v.type === 'class');
  const d = baseDecl(ctx, nameNode, fnv ? (v.type === 'class' ? 'class' : 'function') : 'property', stmt,
    attachedStart(stmt, isAttr, isComment), endRowOf(stmt), stmt.startPosition.row);
  d.container = me.childForFieldName('object').text.split('.').filter((x) => x && x !== 'prototype');
  d.group = fnv ? 'objprop' : 'objprop-value';
  d.loc = scopeInfo(stmt).inFunction ? 'local' : 'member';
  d.errors = stmt.hasError;
  d.rank = d.loc === 'local' ? 3 : 2;
  d.sigEndRow = v && v.childForFieldName('body') ? Math.min(d.endRow, v.childForFieldName('body').startPosition.row) : null;
  return d;
}

function baseDecl(ctx, nameNode, kind, node, startRow, endRow, declRow) {
  return {
    lang: ctx.lang,
    name: nameNode.text,
    kind,
    kinds: [kind],
    container: [],
    sep: '.',
    startRow,
    endRow,
    declRow,
    sigEndRow: null,
    exported: null,
    access: null,
    attrs: [],
    group: 'main',
    loc: 'top',
    rank: 0,
    errors: false,
    nameIdx: nameNode.startIndex,
    nameRow: nameNode.startPosition.row,
    decoratorCount: 0,
    nOverloads: 0,
  };
}

function computeRank(d) {
  if (d.loc === 'local') return 3;
  if (d.loc === 'top') return d.exported ? 0 : 0.5;
  // member
  if (d.access === 'private' || d.access === 'protected') return 2;
  if (d.group !== 'main') return 2;
  return 1;
}

// Main entry: build the Decl for a name node, or null if the node is not a declaration name.
export function declFromName(ctx, nameNode) {
  const p = nameNode.parent;
  if (!p) return null;
  const t = p.type;

  let declNode = null; // node whose extent we use (or the container for runs)
  let kind = null;
  let extraKinds = [];
  let group = 'main';
  let namePrefix = [];
  let isMember = false;
  let singleStmt = null; // statement node for extent override

  if (t === 'export_specifier' || t === 'namespace_export') return reexportDecl(ctx, nameNode, p);

  if (t === 'nested_identifier') {
    let q = p;
    while (q.parent && q.parent.type === 'nested_identifier') q = q.parent;
    const m = q.parent;
    if (!m || (m.type !== 'internal_module' && m.type !== 'module') || !fieldIs(m, 'name', q)) return null;
    // parts to the left of nameNode
    const idxInChain = nameNode.startIndex - q.startIndex;
    const leftText = q.text.slice(0, idxInChain).replace(/\.$/, '');
    namePrefix = leftText ? leftText.split('.') : [];
    declNode = m; kind = 'namespace';
  } else if (DECL_KIND[t] && fieldIs(p, 'name', nameNode)) {
    declNode = p; kind = DECL_KIND[t];
    if (t === 'module' && nameNode.type === 'string') return null;
  } else if (t === 'variable_declarator' && fieldIs(p, 'name', nameNode)) {
    declNode = p;
  } else if (MEMBER_TYPES.has(t) && (fieldIs(p, 'name', nameNode) || fieldIs(p, 'property', nameNode))) {
    declNode = p; isMember = true;
  } else if (t === 'enum_assignment' && fieldIs(p, 'name', nameNode)) {
    declNode = p; kind = 'enum-member'; group = 'member-sig'; isMember = true;
  } else if (t === 'enum_body' && nameNode.type === 'property_identifier') {
    declNode = nameNode; kind = 'enum-member'; group = 'member-sig'; isMember = true;
  } else if (t === 'pair' && fieldIs(p, 'key', nameNode)) {
    declNode = p; isMember = true;
  } else if (t === 'member_expression' && fieldIs(p, 'property', nameNode) && p.parent && p.parent.type === 'assignment_expression'
    && fieldIs(p.parent, 'left', p) && p.parent.parent && p.parent.parent.type === 'expression_statement'
    && /^[\w$.]+$/.test(p.childForFieldName('object').text)) {
    // CommonJS / prototype style: Foo.prototype.bar = function () {}; exports.baz = ...
    return assignedMember(ctx, nameNode, p);
  } else {
    return null;
  }

  const lines = ctx.lines;
  let stmt;
  let startRow;
  let endRow;
  let nOverloads = 0;
  let localVar = false;
  let runLast = null; // last statement of an overload run (signatures + implementation)
  let rowStmt = null; // first statement of the run: carries the declaration row

  if (declNode.type === 'variable_declarator') {
    const list = declNode.parent;
    if (!list || (list.type !== 'lexical_declaration' && list.type !== 'variable_declaration')) return null;
    const lp = list.parent;
    if (lp && (lp.type === 'for_statement' || lp.type === 'for_in_statement')) return null;
    const v = unwrapValue(declNode.childForFieldName('value'));
    const kw = list.type === 'variable_declaration' ? 'var' : (list.childForFieldName('kind') || list.child(0)).text;
    if (v && FN_VALUE.has(v.type)) { kind = 'function'; extraKinds = ['const']; }
    else if (v && v.type === 'class') { kind = 'class'; extraKinds = ['const']; }
    else if (kw === 'const') { kind = 'const'; }
    else { kind = 'variable'; extraKinds = ['const']; }
    const nDecl = list.namedChildren.filter((c) => c.type === 'variable_declarator').length;
    stmt = statementOf(list);
    const first = list.namedChildren.find((c) => c.type === 'variable_declarator');
    if (nDecl === 1) {
      startRow = attachedStart(stmt, isAttr, isComment);
      endRow = endRowOf(stmt);
    } else {
      startRow = sameNode(first, declNode) ? attachedStart(stmt, isAttr, isComment) : declNode.startPosition.row;
      endRow = endRowOf(declNode);
    }
    // module-level?
    const sp = stmt.parent;
    const moduleLevel = !sp || sp.type === 'program' || (sp.type === 'statement_block' && sp.parent && (sp.parent.type === 'internal_module' || sp.parent.type === 'module' || sp.parent.type === 'ambient_declaration'));
    localVar = !moduleLevel;
  } else if (declNode.type === 'pair') {
    const v = unwrapValue(declNode.childForFieldName('value'));
    const fnv = v && FN_VALUE.has(v.type);
    kind = fnv ? 'function' : 'property';
    group = 'objprop';
    if (!fnv) group = 'objprop-value';
    stmt = declNode;
    startRow = attachedStart(stmt, isAttr, isComment);
    endRow = endRowOf(stmt);
  } else if (declNode.type === 'enum_assignment' || declNode.type === 'property_identifier' && t === 'enum_body') {
    stmt = declNode;
    startRow = attachedStart(stmt, isAttr, isComment);
    endRow = endRowOf(stmt);
  } else if (MEMBER_TYPES.has(declNode.type)) {
    stmt = declNode;
    const par = declNode.parent;
    const inInterface = par && (par.type === 'interface_body' || par.type === 'object_type');
    const inObject = par && par.type === 'object';
    const mods = modifiers(declNode);
    if (declNode.type === 'method_definition' || declNode.type === 'method_signature' || declNode.type === 'abstract_method_signature') {
      kind = mods.get ? 'getter' : mods.set ? 'setter' : 'method';
      extraKinds = kind === 'method' ? [] : ['method'];
      if (inObject) group = 'objprop';
      else if (inInterface) group = 'member-sig';
    } else if (declNode.type === 'property_signature') {
      kind = 'property'; group = 'member-sig';
    } else {
      const v = unwrapValue(declNode.childForFieldName('value'));
      if (v && FN_VALUE.has(v.type)) { kind = 'method'; extraKinds = ['field']; } else kind = 'field';
    }
    // overload runs (functions in classes / interfaces)
    if (SIG_TYPES.has(declNode.type) || declNode.type === 'method_definition') {
      const run = overloadRun(declNode, nameNode.text);
      startRow = attachedStart(run.first, isAttr, isComment);
      endRow = endRowOf(run.last);
      nOverloads = run.count > 1 ? run.sigs : 0;
      if (nOverloads) { /* stmt used for flags */ }
      runLast = run.last;
      rowStmt = run.first;
    } else {
      startRow = attachedStart(stmt, isAttr, isComment);
      endRow = endRowOf(stmt);
    }
  } else if (declNode.type === 'function_declaration' || declNode.type === 'generator_function_declaration' || declNode.type === 'function_signature') {
    stmt = statementOf(declNode);
    const run = overloadRun(stmt, nameNode.text);
    startRow = attachedStart(run.first, isAttr, isComment);
    endRow = endRowOf(run.last);
    nOverloads = run.count > 1 ? run.sigs : 0;
    runLast = run.last;
    rowStmt = run.first;
  } else {
    stmt = statementOf(declNode);
    startRow = attachedStart(stmt, isAttr, isComment);
    endRow = endRowOf(stmt);
  }

  const { container, inFunction } = scopeInfo(declNode);
  const d = baseDecl(ctx, nameNode, kind, declNode, startRow, endRow, declRowOf(rowStmt || stmt));
  d.kinds = [kind, ...extraKinds];
  d.container = [...container, ...namePrefix];
  if (declNode.type === 'internal_module' || declNode.type === 'module') {
    // container of the namespace itself excludes its own name; prefix handled above
  }
  d.group = group;
  d.errors = declNode.hasError || (stmt && stmt.hasError);
  d.nOverloads = nOverloads;
  d.sigEndRow = runLast ? sigEndRow(unwrapDecl(runLast) || declNode, endRow) : sigEndRow(declNode, endRow);
  if (d.sigEndRow !== null && d.sigEndRow < startRow) d.sigEndRow = null;

  // flags
  if (isMember && MEMBER_TYPES.has(declNode.type)) {
    const mods = modifiers(declNode);
    d.access = mods.access || (nameNode.type === 'private_property_identifier' ? 'private' : null);
    if (mods.static) d.attrs.push('static');
    if (mods.abstract) d.attrs.push('abstract');
    if (mods.async) d.attrs.push('async');
    if (mods.readonly) d.attrs.push('readonly');
  } else if (declNode.type === 'function_declaration' && declNode.firstChild && declNode.firstChild.type === 'async') {
    d.attrs.push('async');
  }
  if (declNode.type === 'abstract_class_declaration') d.attrs.push('abstract');
  if (stmt && (stmt.type === 'export_statement')) {
    d.exported = stmt.children.some((c) => c.type === 'default') ? 'default' : 'exported';
  } else if (stmt && stmt.type === 'ambient_declaration' && stmt.parent && stmt.parent.type === 'export_statement') {
    d.exported = 'exported';
  }
  if (nOverloads) d.attrs.push(`${nOverloads} overload${nOverloads > 1 ? 's' : ''}`);
  d.decoratorCount = 0;

  // location class
  if (inFunction) d.loc = 'local';
  else if (d.container.length > 0 || isMember) d.loc = 'member';
  else d.loc = 'top';
  if (declNode.type === 'variable_declarator') {
    if (inFunction || localVar) {
      d.loc = 'local';
      if (kind === 'const' || kind === 'variable') d.group = 'local';
    }
  }
  // object-literal method / property without a named holder
  if (declNode.type === 'method_definition' && declNode.parent && declNode.parent.type === 'object') d.group = 'objprop';
  d.rank = computeRank(d);
  return d;
}

// ---------------------------------------------------------------- outline

export function outline(ctx) {
  const out = []; // {decl, depth}
  const seen = new Set();
  const push = (d, depth) => {
    if (!d) return;
    const k = `${d.startRow}:${d.endRow}:${d.kind}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ decl: d, depth });
  };
  const nameNodesOfStatement = (decl) => {
    if (!decl) return [];
    switch (decl.type) {
      case 'lexical_declaration': case 'variable_declaration':
        return decl.namedChildren.filter((c) => c.type === 'variable_declarator').map((c) => c.childForFieldName('name')).filter((n) => n && n.type === 'identifier');
      case 'internal_module': case 'module': {
        const nm = decl.childForFieldName('name');
        if (!nm) return [];
        if (nm.type === 'nested_identifier') {
          let n = nm; while (n.type === 'nested_identifier') n = n.childForFieldName('property');
          return n ? [n] : [];
        }
        return nm.type === 'string' ? [] : [nm];
      }
      default: {
        if (DECL_KIND[decl.type]) { const nm = decl.childForFieldName('name'); return nm ? [nm] : []; }
        return [];
      }
    }
  };
  const members = (body, depth) => {
    for (const m of body.namedChildren) {
      if (!MEMBER_TYPES.has(m.type) && m.type !== 'enum_assignment') continue;
      if (m.type === 'enum_assignment') continue;
      const nm = m.childForFieldName('name') || m.childForFieldName('property');
      if (nm && (nm.type === 'property_identifier' || nm.type === 'private_property_identifier')) {
        const d = declFromName(ctx, nm);
        if (d) { d.group = 'main'; push(d, depth); }
      }
    }
  };
  const visitStatements = (parent, depth) => {
    for (const s of parent.namedChildren) {
      if (s.type === 'comment') continue;
      if (s.type === 'export_statement' && !s.childForFieldName('declaration') && !s.childForFieldName('value')) {
        // re-export forms: export { a } from 'x' / export * from 'x'
        const d = baseDecl(ctx, s.child(0), 're-export', s, attachedStart(s, isAttr, isComment), endRowOf(s), s.startPosition.row);
        d.name = (s.text.replace(/\s+/g, ' ').slice(0, 60));
        d.exported = 'exported'; d.errors = s.hasError;
        push(d, depth);
        continue;
      }
      const decl = unwrapDecl(s);
      if (!decl) continue;
      for (const nm of nameNodesOfStatement(decl)) {
        const d = declFromName(ctx, nm);
        if (!d) continue;
        d.group = 'main';
        push(d, depth);
        if (decl.type === 'class_declaration' || decl.type === 'abstract_class_declaration') {
          const b = decl.childForFieldName('body'); if (b) members(b, depth + 1);
        } else if (decl.type === 'interface_declaration') {
          const b = decl.childForFieldName('body'); if (b) members(b, depth + 1);
        } else if (decl.type === 'internal_module' || decl.type === 'module') {
          const b = decl.childForFieldName('body'); if (b) visitStatements(b, depth + 1);
        } else if (decl.type === 'lexical_declaration' || decl.type === 'variable_declaration') {
          const dn = nm.parent;
          const v = unwrapValue(dn.childForFieldName('value'));
          if (v && v.type === 'class') { const b = v.childForFieldName('body'); if (b) members(b, depth + 1); }
        }
      }
    }
  };
  visitStatements(ctx.root, 0);
  return out;
}
