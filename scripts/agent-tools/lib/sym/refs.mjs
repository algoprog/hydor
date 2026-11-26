// Reference search: whole-word identifier occurrences outside comments and strings.
import { family } from './grammar.mjs';
import { occurrences, modFor, findDeclsInFile } from './core.mjs';

const TS_TYPE_CTX = new Set([
  'type_annotation', 'type_arguments', 'type_parameters', 'type_parameter', 'extends_type_clause', 'implements_clause',
  'class_heritage', 'generic_type', 'union_type', 'intersection_type', 'array_type', 'tuple_type', 'function_type',
  'object_type', 'type_predicate', 'type_query', 'lookup_type', 'conditional_type', 'mapped_type_clause', 'nested_type_identifier',
  'readonly_type', 'index_type_query', 'infer_type', 'constructor_type', 'type_predicate_annotation', 'asserts',
  'interface_declaration', 'type_alias_declaration', 'extends_clause',
]);
const TS_IMPORT_CTX = new Set(['import_specifier', 'import_clause', 'import_statement', 'namespace_import', 'import_require_clause', 'import_alias']);

function isFnOf(parent, leafOrMember, field = 'function') {
  const f = parent.childForFieldName(field);
  return !!f && f.id === leafOrMember.id;
}

export function labelTs(leaf) {
  const p = leaf.parent;
  if (!p) return 'other';
  for (let a = leaf, i = 0; a && i < 6; a = a.parent, i++) {
    if (TS_IMPORT_CTX.has(a.type)) return 'import';
    if (a.type === 'export_specifier' || a.type === 'namespace_export') return 'import';
    if (a.type === 'export_statement' && a.childForFieldName('source')) return 'import';
  }
  if (leaf.type === 'type_identifier') return 'type';
  if (p.type === 'call_expression' && isFnOf(p, leaf)) return 'call';
  if (p.type === 'new_expression' && isFnOf(p, leaf, 'constructor')) return 'call';
  if (p.type === 'member_expression' && p.childForFieldName('property') && p.childForFieldName('property').id === leaf.id) {
    const g = p.parent;
    if (g && g.type === 'call_expression' && isFnOf(g, p)) return 'call';
    if (g && g.type === 'new_expression' && isFnOf(g, p, 'constructor')) return 'call';
  }
  if (p.type === 'decorator') return 'call';
  for (let a = p, i = 0; a && i < 7; a = a.parent, i++) {
    if (TS_TYPE_CTX.has(a.type)) return 'type';
    if (/statement|declaration$|^program$|^arguments$|expression$/.test(a.type) && !/^generic_type$/.test(a.type)) break;
  }
  return 'other';
}

export function labelPy(leaf) {
  const p = leaf.parent;
  if (!p) return 'other';
  for (let a = leaf, i = 0; a && i < 5; a = a.parent, i++) {
    if (a.type === 'import_statement' || a.type === 'import_from_statement' || a.type === 'aliased_import' || a.type === 'future_import_statement') return 'import';
  }
  if (p.type === 'call' && isFnOf(p, leaf)) return 'call';
  if (p.type === 'attribute') {
    const at = p.childForFieldName('attribute');
    const g = p.parent;
    if (at && at.id === leaf.id && g && g.type === 'call' && isFnOf(g, p)) return 'call';
  }
  if (p.type === 'decorator') return 'call';
  for (let a = p, i = 0; a && i < 6; a = a.parent, i++) {
    if (a.type === 'type') return 'type';
    if (a.type === 'argument_list' && a.parent && a.parent.type === 'class_definition') return 'type';
    if (/statement$|^block$|^module$/.test(a.type)) break;
  }
  return 'other';
}

export function labelRs(leaf) {
  const p = leaf.parent;
  if (!p) return 'other';
  for (let a = leaf, i = 0; a && i < 7; a = a.parent, i++) {
    if (a.type === 'use_declaration') return 'import';
  }
  if (p.type === 'macro_invocation') return 'call';
  const callOf = (n) => n.parent && n.parent.type === 'call_expression' && isFnOf(n.parent, n);
  if (callOf(leaf)) return 'call';
  if (p.type === 'scoped_identifier' && p.childForFieldName('name') && p.childForFieldName('name').id === leaf.id && callOf(p)) return 'call';
  if (p.type === 'field_expression' && p.childForFieldName('field') && p.childForFieldName('field').id === leaf.id) {
    if (callOf(p)) return 'call';
  }
  if (p.type === 'generic_function' && isFnOf(p, leaf)) return 'call';
  if (leaf.type === 'type_identifier') return 'type';
  return 'other';
}

export function labelFor(ctx, leaf) {
  switch (family(ctx.lang)) {
    case 'ts': case 'js': return labelTs(leaf);
    case 'py': return labelPy(leaf);
    case 'rs': return labelRs(leaf);
    default: return 'other';
  }
}

const RANK = { call: 3, import: 2, type: 1, other: 0, '?': -1 };

function inErrorNode(n) {
  for (let a = n; a; a = a.parent) if (a.type === 'ERROR') return true;
  return false;
}

// Returns Map<row, {label, unsure}> of reference rows for one file (definition names excluded).
export function refsInFile(ctx, name) {
  const rows = new Map();
  const add = (row, label) => {
    const cur = rows.get(row);
    if (!cur || (RANK[label] ?? 0) > (RANK[cur] ?? 0)) rows.set(row, label);
  };
  const defRows = [];
  if (!ctx.root) {
    const re = new RegExp(`(?<![\\w$])${name.replace(/[$]/g, '\\$')}(?![\\w$])`, 'g');
    ctx.lines.forEach((l, r) => { if (re.test(l)) { add(r, '?'); } re.lastIndex = 0; });
    return { rows, defRows };
  }
  const mod = modFor(ctx.lang);
  for (const { leaf, other } of occurrences(ctx, name)) {
    if (!leaf) {
      if (other && inErrorNode(other) && !/comment|string/.test(other.type)) add(other.startPosition.row, '?');
      continue;
    }
    const d = mod.declFromName(ctx, leaf);
    if (d && (d.group === 'main' || d.group === 'local')) { defRows.push(leaf.startPosition.row); continue; }
    if (inErrorNode(leaf)) { add(leaf.startPosition.row, '?'); continue; }
    add(leaf.startPosition.row, labelFor(ctx, leaf));
  }
  return { rows, defRows };
}
export { findDeclsInFile };
