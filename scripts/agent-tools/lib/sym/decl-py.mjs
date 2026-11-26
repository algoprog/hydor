// Declaration extraction for Python trees.
import { sameNode, attachedStart, trueEndRow } from './nodeutil.mjs';

export const IDENT_TYPES = new Set(['identifier']);

const isAttr = () => false; // decorators are children of decorated_definition
const isComment = (n) => n.type === 'comment';

const fieldIs = (p, f, n) => { const c = p.childForFieldName(f); return !!c && sameNode(c, n); };

function baseDecl(ctx, nameNode, kind, startRow, endRow, declRow) {
  return {
    lang: ctx.lang, name: nameNode.text, kind, kinds: [kind], container: [], sep: '.',
    startRow, endRow, declRow, sigEndRow: null, docEndRow: null,
    exported: null, access: null, attrs: [], group: 'main', loc: 'top', rank: 0, errors: false,
    nameIdx: nameNode.startIndex, nameRow: nameNode.startPosition.row, decoratorCount: 0, nOverloads: 0,
  };
}

function scopeInfo(node) {
  const container = [];
  let inFunction = false;
  let inClass = false;
  let nearest = null;
  for (let a = node.parent; a; a = a.parent) {
    if (a.type === 'class_definition') {
      const nm = a.childForFieldName('name');
      if (nm) container.unshift(nm.text);
      if (!nearest) { nearest = 'class'; inClass = true; }
    } else if (a.type === 'function_definition') {
      const nm = a.childForFieldName('name');
      if (nm) container.unshift(nm.text);
      inFunction = true;
      if (!nearest) nearest = 'function';
    }
  }
  return { container, inFunction, inClass };
}

const isOverloadDeco = (n) => n.type === 'decorated_definition' && n.namedChildren.some((c) => c.type === 'decorator' && /^@\s*(?:typing\.)?overload\b/.test(c.text));

function overloadRun(stmt, name) {
  const defName = (s) => {
    const d = s.type === 'decorated_definition' ? s.childForFieldName('definition') : s;
    return d && d.type === 'function_definition' ? d.childForFieldName('name').text : null;
  };
  const prevOf = (s) => { let p = s.previousSibling; while (p && p.type === 'comment') p = p.previousSibling; return p; };
  const nextOf = (s) => { let p = s.nextSibling; while (p && p.type === 'comment') p = p.nextSibling; return p; };
  let first = stmt; let last = stmt; let count = 1;
  let sigs = isOverloadDeco(stmt) ? 1 : 0;
  for (let p = prevOf(first); p && isOverloadDeco(p) && defName(p) === name; p = prevOf(first)) { first = p; count++; sigs++; }
  if (isOverloadDeco(last)) {
    for (let n = nextOf(last); n && defName(n) === name; n = nextOf(last)) {
      last = n; count++;
      if (!isOverloadDeco(n)) break;
      sigs++;
    }
  }
  return { first, last, count, sigs };
}

function privacy(name) {
  if (/^__.*__$/.test(name)) return null;
  if (name.startsWith('__')) return 'private';
  if (name.startsWith('_')) return 'protected';
  return null;
}

export function declFromName(ctx, nameNode) {
  if (nameNode.type !== 'identifier') return null;
  const p = nameNode.parent;
  if (!p) return null;
  let kind; let node; let stmt; let assignStmt = null;
  if ((p.type === 'function_definition' || p.type === 'class_definition') && fieldIs(p, 'name', nameNode)) {
    node = p; kind = p.type === 'class_definition' ? 'class' : 'function';
    stmt = p.parent && p.parent.type === 'decorated_definition' ? p.parent : p;
  } else {
    let asg = null;
    if (p.type === 'assignment' && fieldIs(p, 'left', nameNode)) asg = p;
    else if ((p.type === 'pattern_list' || p.type === 'tuple_pattern') && p.parent && p.parent.type === 'assignment' && fieldIs(p.parent, 'left', p)) asg = p.parent;
    if (asg) {
      node = asg; kind = 'variable';
      const es = asg.parent;
      if (!es || es.type !== 'expression_statement') return null;
      stmt = es; assignStmt = es;
    } else if (p.type === 'type' && p.parent && p.parent.type === 'type_alias_statement' && sameNode(p.parent.namedChild(0), p)) {
      node = p.parent; kind = 'type'; stmt = node;
    } else return null;
  }
  const { container, inFunction, inClass } = scopeInfo(stmt);
  if (assignStmt && inFunction) return null; // local variable, not a definition
  const startRow = attachedStart(stmt, isAttr, isComment, trueEndRow);
  let endRow = trueEndRow(stmt);
  let nOverloads = 0;
  let sr = startRow;
  if (kind === 'function') {
    const run = overloadRun(stmt, nameNode.text);
    if (run.count > 1) {
      nOverloads = run.sigs;
      sr = attachedStart(run.first, isAttr, isComment, trueEndRow);
      endRow = trueEndRow(run.last);
    }
  }
  const defNode = node.type === 'function_definition' || node.type === 'class_definition' ? node : null;
  const d = baseDecl(ctx, nameNode, kind, sr, endRow, defNode ? defNode.startPosition.row : stmt.startPosition.row);
  d.container = container;
  d.errors = stmt.hasError;
  d.nOverloads = nOverloads;
  if (nOverloads) d.attrs.push(`${nOverloads} overload${nOverloads > 1 ? 's' : ''}`);
  if (stmt.type === 'decorated_definition') d.decoratorCount = stmt.namedChildren.filter((c) => c.type === 'decorator').length;
  if (inFunction) d.loc = 'local';
  else if (container.length > 0) d.loc = 'member';
  else d.loc = 'top';
  const priv = privacy(nameNode.text);
  d.access = priv;
  if (defNode) {
    if (defNode.type === 'function_definition') {
      if (defNode.children.some((c) => c.type === 'async')) d.attrs.push('async');
      if (d.loc === 'member' && inClass) { d.kind = 'method'; d.kinds = ['method', 'function']; }
      const decos = stmt.type === 'decorated_definition' ? stmt.namedChildren.filter((c) => c.type === 'decorator').map((c) => c.text) : [];
      for (const dec of decos) {
        if (/^@\s*(staticmethod|classmethod)\b/.test(dec)) d.attrs.push(dec.replace(/^@\s*/, ''));
        if (/^@\s*property\b/.test(dec)) d.kind = 'property', d.kinds = ['property', 'method'];
      }
      if (nameNode.text === '__init__') d.kind = 'method';
    } else {
      d.kinds = ['class'];
    }
    const body = defNode.childForFieldName('body');
    if (body) {
      let colonRow = body.startPosition.row;
      for (let i = 0; i < defNode.childCount; i++) {
        const c = defNode.child(i);
        if (c.startIndex >= body.startIndex) break;
        if (c.type === ':') colonRow = c.startPosition.row;
      }
      d.sigEndRow = Math.min(endRow, colonRow);
      const fs = body.namedChildren.find((c) => c.type !== 'comment');
      if (fs && fs.type === 'expression_statement' && fs.namedChildCount === 1 && fs.namedChild(0).type === 'string') {
        d.docEndRow = trueEndRow(fs);
      }
    }
  } else if (kind === 'variable') {
    const asg = node;
    const right = asg.childForFieldName('right');
    if (inClass) { d.kind = 'field'; d.kinds = ['field', 'variable']; }
    else if (right && right.type === 'lambda') { d.kind = 'function'; d.kinds = ['function', 'const', 'variable']; }
    else if (/^[A-Z][A-Z0-9_]*$/.test(nameNode.text)) { d.kind = 'const'; d.kinds = ['const', 'variable']; }
    else { d.kind = 'variable'; d.kinds = ['variable', 'const']; }
  } else if (kind === 'type') {
    d.kinds = ['type'];
  }
  d.rank = d.loc === 'local' ? 3 : d.loc === 'top' ? (priv ? 0.5 : 0) : (priv ? 2 : 1);
  return d;
}

// ---------------------------------------------------------------- outline

export function outline(ctx) {
  const out = [];
  const seen = new Set();
  const push = (d, depth) => {
    if (!d) return;
    const k = `${d.startRow}:${d.endRow}:${d.declRow}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ decl: d, depth });
  };
  const nameOfAssign = (asg) => {
    const l = asg.childForFieldName('left');
    if (!l) return [];
    if (l.type === 'identifier') return [l];
    if (l.type === 'pattern_list' || l.type === 'tuple_pattern') return l.namedChildren.filter((c) => c.type === 'identifier');
    return [];
  };
  const visit = (parent, depth, inClassBody) => {
    for (const s of parent.namedChildren) {
      let n = s;
      if (n.type === 'decorated_definition') n = n.childForFieldName('definition');
      if (!n) continue;
      if (n.type === 'function_definition' || n.type === 'class_definition') {
        const nm = n.childForFieldName('name');
        const d = declFromName(ctx, nm);
        push(d, depth);
        if (n.type === 'class_definition') { const b = n.childForFieldName('body'); if (b) visit(b, depth + 1, true); }
      } else if (n.type === 'expression_statement') {
        const asg = n.namedChild(0);
        if (asg && asg.type === 'assignment') for (const nm of nameOfAssign(asg)) push(declFromName(ctx, nm), depth);
      } else if (n.type === 'type_alias_statement') {
        const t = n.namedChild(0); const id = t && t.namedChild(0);
        if (id) push(declFromName(ctx, id), depth);
      } else if (['if_statement', 'try_statement', 'with_statement', 'for_statement', 'while_statement', 'else_clause', 'elif_clause', 'except_clause', 'finally_clause', 'block'].includes(n.type)) {
        // descend into compound statements at the same level (conditional definitions)
        visit(n, depth, inClassBody);
      }
    }
  };
  visit(ctx.root, 0, false);
  return out;
}
