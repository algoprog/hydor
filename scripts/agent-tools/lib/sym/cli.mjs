// sym command-line driver.
import path from 'node:path';
import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { langFilter, langForFile, family, loadLanguage, preload } from './grammar.mjs';
import { grepWord, declLineRegex, isTestPath, escapeRe } from './search.mjs';
import { FileCache, findDeclsInFile, outlineOf } from './core.mjs';
import { selectDefs, sortDefs, normalizeKind, isTestDecl } from './select.mjs';
import { refsInFile } from './refs.mjs';
import { headerLine, renderBody, renderFitted, allocate, cutLine, displayName, attrText } from './format.mjs';

const HELP = `sym - symbol definitions with full bodies, references and outlines (no index; parses candidate files on demand)

Usage:
  sym NAME [NAME...]            definitions of NAME with their full bodies (exact line ranges)
  sym --refs NAME               references (calls/imports/types) outside comments and strings
  sym --outline FILE [FILE...]  declarations of a file, members indented
NAME is case-sensitive: plain (sessionPath), or qualified (Sessions.create, Foo::bar, module.func).
Options:
  --in PATH       restrict to a file or directory (repeatable)    --lang ts|js|py|rs
  --kind K        function|class|type|const|method|field|enum|interface|struct|trait|... (repeatable)
  --sig           signature and doc comment only                  --no-tests  skip test files
  --max-lines N   lines per body before eliding the middle (120; --refs: line cap, 60)
  --max-chars N   total character budget for bodies, shared by all NAMEs (6000)
  --all           bodies for every definition (default: first 3); with --refs lifts the 60-line cap
  --help          this text
Output: "path:START-END  kind name (flags)" then numbered lines. Exit 0 if any NAME was found, 1 if none, 2 on usage error.
A header marked "(heuristic extent)" or "(... extent unsure ...)" is a best guess: verify it before editing.
Examples:
  sym sessionPath                      # body of a function, with doc comment and export
  sym Sessions.create --sig            # just the signature of a method
  sym Popover IconButton --in web/src  # two names, shared output budget
  sym --refs HttpError --no-tests      # who uses it
  sym --outline server/sessions.ts     # table of contents with line ranges
  sym Config --lang rs --kind struct   # Rust struct plus its impl blocks
`;

let RT = { out: (s) => process.stdout.write(s), err: (s) => process.stderr.write(s), code: 0 };

function usage(msg) {
  RT.err(`sym: ${msg}\nTry: sym --help\n`);
  RT.code = 2;
}

function parseName(raw) {
  let parts = raw.split(/::|\./).filter((x) => x.length);
  if (parts.length > 1) parts = parts.filter((x) => x !== 'prototype');
  if (!parts.length || !parts.every((p) => /^[\p{L}_$][\p{L}\p{N}_$]*$/u.test(p))) return null;
  return parts;
}

function num(v, name, def) {
  if (v === undefined) return def;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) throw new Error(`${name} needs a positive integer`);
  return n;
}

const PREFILTER_FILES = 40;

async function collectCandidates(parts, opts) {
  const words = [...new Set(parts)];
  const name = parts[parts.length - 1];
  const hits = await grepWord(words.length > 1 ? [...words.slice(0, -1), name] : [name], opts);
  // keep only lines where the final component occurs as a whole word
  const wordRe = new RegExp(`(?<![\\w$])${escapeRe(name)}(?![\\w$])`);
  const files = new Map();
  for (const [f, ls] of hits) {
    const own = ls.filter((l) => wordRe.test(l.text));
    if (own.length) files.set(f, own);
  }
  const searched = files.size;
  let list = [...files.keys()].sort();
  let prefiltered = false;
  if (list.length > PREFILTER_FILES && !process.env.SYM_NO_PREFILTER) {
    prefiltered = true;
    list = list.filter((f) => {
      const re = declLineRegex(langForFile(f), name);
      if (!re) return true;
      return files.get(f).some((l) => re.test(l.text));
    });
  }
  return { list, searched, prefiltered, lines: files };
}

// Runs the CLI; returns the exit code. `io` ({out, err}) lets tests capture output.
export async function main(argv, cwd = process.cwd(), io = null) {
  RT = { out: io ? io.out : (s) => process.stdout.write(s), err: io ? io.err : (s) => process.stderr.write(s), code: 0 };
  await run(argv, cwd);
  return RT.code;
}

async function run(argv, cwd) {
  let values; let positionals;
  try {
    ({ values, positionals } = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        refs: { type: 'boolean' }, outline: { type: 'boolean' }, in: { type: 'string', multiple: true },
        lang: { type: 'string' }, sig: { type: 'boolean' }, 'max-lines': { type: 'string' }, all: { type: 'boolean' },
        kind: { type: 'string', multiple: true }, 'no-tests': { type: 'boolean' }, 'max-chars': { type: 'string' },
        help: { type: 'boolean', short: 'h' },
      },
    }));
  } catch (e) { return usage(e.message.replace(/\. To specify.*$/, '')); }
  if (values.help) { RT.out(HELP); return; }
  let maxLines; let maxChars;
  try {
    maxLines = num(values['max-lines'], '--max-lines', undefined);
    maxChars = num(values['max-chars'], '--max-chars', 6000);
  } catch (e) { return usage(e.message); }
  const langSet = langFilter(values.lang);
  if (langSet === undefined) return usage(`unknown --lang ${values.lang} (use ts, js, py or rs)`);
  if (values.refs && values.outline) return usage('--refs and --outline cannot be combined');
  if (!positionals.length) return usage(values.outline ? '--outline needs at least one FILE' : 'missing NAME (see --help)');
  const inPaths = values.in || [];
  for (const p of inPaths) {
    if (!fs.existsSync(path.resolve(cwd, p))) return usage(`--in path does not exist: ${p}`);
  }
  const kinds = (values.kind || []).flatMap((k) => k.split(',')).map(normalizeKind);
  const cfg = { cwd, inPaths, langSet, kinds, noTests: !!values['no-tests'], sig: !!values.sig, all: !!values.all, maxLines, maxChars };
  const cache = new FileCache(cwd);
  try {
    if (values.outline) await outlineMode(positionals, cfg, cache);
    else if (values.refs) await refsMode(positionals, cfg, cache);
    else await defsMode(positionals, cfg, cache);
  } finally { cache.dispose(); }
}

// ------------------------------------------------------------------ definitions

async function lookup(raw, parts, cfg, cache, cand) {
  const { list, searched, prefiltered, lines } = cand;
  const decls = [];
  const impls = [];
  let parsed = 0;
  const heuristicFiles = new Set();
  for (const f of list) {
    const ctx = await cache.get(f);
    if (!ctx) continue;
    parsed++;
    if (!ctx.root) heuristicFiles.add(f);
    let r;
    try { r = findDeclsInFile(ctx, parts); } catch (e) { RT.err(`sym: warning: could not analyse ${f}: ${e.message}\n`); continue; }
    for (const d of r.decls) { d.isTestFile = isTestPath(d.file) || !!d.isTest; decls.push(d); }
    for (const i of r.impls) impls.push(i);
  }
  const qualified = parts.length > 1;
  let defs = selectDefs(decls, { qualified, kinds: cfg.kinds, noTests: cfg.noTests });
  defs = sortDefs(defs, cfg);
  let implList = [];
  const typeish = decls.some((d) => ['struct', 'enum', 'union', 'trait', 'type'].includes(d.kind) && d.lang === 'rust');
  if (typeish && !qualified) {
    implList = impls.filter((i) => !(cfg.noTests && isTestDecl(i)));
    implList.sort((a, b) => (a.file === b.file ? a.startRow - b.startRow : a.file < b.file ? -1 : 1));
  }
  if (process.env.SYM_DEBUG) RT.err(`[sym] ${raw}: ${searched} files with word, ${parsed} parsed${prefiltered ? ' (prefiltered)' : ''}, ${defs.length} defs\n`);
  return { raw, parts, defs, impls: implList, searched, lines, parsed };
}

function notFound(res) {
  const out = [`no definition of ${res.raw} found (searched ${res.searched} files with the word)`];
  let n = 0;
  outer: for (const f of [...res.lines.keys()].sort()) {
    for (const l of res.lines.get(f)) {
      out.push(`  ${f}:${l.n}: ${cutLine(l.text.trim()).slice(0, 160)}`);
      if (++n >= 5) break outer;
    }
  }
  return out.join('\n');
}

async function defsMode(names, cfg, cache) {
  const results = [];
  const parsedNames = [];
  for (const raw of names) {
    const parts = parseName(raw);
    if (!parts) { return usage(`invalid NAME: ${raw}`); }
    parsedNames.push([raw, parts, await collectCandidates(parts, cfg)]);
  }
  await preload(parsedNames.flatMap(([, , c]) => c.list.map(langForFile)));
  for (const [raw, parts, cand] of parsedNames) results.push(await lookup(raw, parts, cfg, cache, cand));
  const maxLines = cfg.maxLines ?? 120;
  // choose what to show per name
  const plans = results.map((res) => {
    const real = res.defs.filter((d) => d.kind !== 're-export');
    const re = res.defs.filter((d) => d.kind === 're-export');
    const shown = cfg.all ? real : real.slice(0, 3);
    const also = real.slice(shown.length);
    return { res, shown, also, re };
  });
  // fair share of the character budget
  const naturals = [];
  // natural size of every body that will be shown
  for (const p of plans) {
    p.sizes = [];
    for (let i = 0; i < p.shown.length; i++) {
      const d = p.shown[i];
      const ctx = await cache.get(d.file);
      d.__lines = ctx.lines;
      p.sizes.push(renderBody(d, ctx.lines, { maxLines, sig: cfg.sig }).length);
    }
    naturals.push(p.sizes.reduce((a, b) => a + b, 0));
  }
  const perName = allocate(naturals, cfg.maxChars);
  const multi = results.length > 1;
  const out = [];
  let found = 0;
  plans.forEach((p, ni) => {
    if (multi) out.push(`## ${p.res.raw}`);
    if (!p.res.defs.length) { out.push(notFound(p.res)); return; }
    found++;
    const budgets = allocate(p.sizes, perName[ni]);
    p.shown.forEach((d, i) => {
      out.push(headerLine(d));
      out.push(renderFitted(d, d.__lines, { maxLines, sig: cfg.sig, budget: Math.max(budgets[i], 400) }));
    });
    for (const d of p.also) out.push(`also: ${headerLine(d, ' ')}`);
    for (const d of p.re) {
      const ctx = cache.map.get(d.file);
      const text = ctx ? ctx.lines[d.startRow === d.endRow ? d.startRow : d.declRow].trim().slice(0, 140) : '';
      const from = d.reexport && d.reexport.from ? ` from '${d.reexport.from}'${d.reexport.orig && d.reexport.orig !== d.name ? ` (as ${d.reexport.orig})` : ''}` : '';
      out.push(`${d.file}:${d.startRow + 1}  re-export ${d.name}${from}${d.errors ? ' (parse errors: unsure)' : ''}   ${text}`);
    }
    if (p.res.impls.length) {
      out.push(`impl blocks for ${p.res.raw}:`);
      for (const im of p.res.impls.slice(0, 25)) out.push(`${im.file}:${im.startRow + 1}-${im.endRow + 1} ${im.name}`);
      if (p.res.impls.length > 25) out.push(`… and ${p.res.impls.length - 25} more impl blocks`);
    }
  });
  RT.out(out.join('\n') + '\n');
  if (!found) RT.code = 1;
}

// ------------------------------------------------------------------ references

async function refsMode(names, cfg, cache) {
  const out = [];
  let anyFound = false;
  const multi = names.length > 1;
  const prepared = [];
  for (const raw of names) {
    const parts = parseName(raw);
    if (!parts) return usage(`invalid NAME: ${raw}`);
    prepared.push([raw, parts, await collectCandidatesAll(parts, cfg)]);
  }
  await preload(prepared.flatMap(([, , c]) => c.list.map(langForFile)));
  for (const [raw, parts, { list, searched }] of prepared) {
    const name = parts[parts.length - 1];
    const perFile = [];
    let total = 0;
    const defsLoc = [];
    for (const f of list) {
      if (cfg.noTests && isTestPath(f)) continue;
      const ctx = await cache.get(f);
      if (!ctx) continue;
      let rows; let dec;
      try { ({ rows } = refsInFile(ctx, name)); dec = findDeclsInFile(ctx, parts).decls; } catch (e) { RT.err(`sym: warning: could not analyse ${f}: ${e.message}\n`); continue; }
      for (const d of selectDefs(dec, { qualified: parts.length > 1, kinds: cfg.kinds, noTests: cfg.noTests })) {
        if (d.kind !== 're-export' || true) defsLoc.push(`${f}:${d.startRow + 1}-${d.endRow + 1}`);
      }
      if (!rows.size) continue;
      const items = [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([row, label]) => ({
        row, label, text: ctx.lines[row].replace(/\r$/, '').trim(),
      }));
      total += items.length;
      perFile.push({ f, items });
    }
    if (multi) out.push(`## ${raw}`);
    if (parts.length > 1) out.push(`(qualified name: matching occurrences of ${name} only)`);
    const defTxt = defsLoc.length ? `, ${defsLoc.length} definitions: ${defsLoc.slice(0, 4).join(', ')}${defsLoc.length > 4 ? ', …' : ''}` : '';
    out.push(`${total} references in ${perFile.length} files${defTxt} (searched ${searched} files with the word)`);
    if (total) anyFound = true;
    perFile.sort((a, b) => b.items.length - a.items.length || (a.f < b.f ? -1 : 1));
    const cap = cfg.all ? Infinity : (cfg.maxLines ?? 60);
    let printed = 0;
    const rest = [];
    for (const pf of perFile) {
      if (printed >= cap) { rest.push([pf.f, pf.items.length]); continue; }
      out.push(pf.f);
      let k = 0;
      for (const it of pf.items) {
        if (printed >= cap) break;
        const w = String(pf.items[pf.items.length - 1].row + 1).length;
        out.push(`  ${String(it.row + 1).padStart(Math.max(w, 3))}  ${it.text.length > 160 ? it.text.slice(0, 160) + '…' : it.text}  [${it.label}]`);
        printed++; k++;
      }
      if (k < pf.items.length) rest.push([pf.f, pf.items.length - k]);
    }
    if (rest.length) {
      const n = rest.reduce((a, b) => a + b[1], 0);
      out.push(`… and ${n} more in ${rest.length} files:`);
      for (const [f, c] of rest) out.push(`  ${f} (${c})`);
    }
  }
  RT.out(out.join('\n') + '\n');
  if (!anyFound) {
    // nothing referenced anywhere (and possibly no definitions): signal like grep
    RT.code = 1;
  }
}

async function collectCandidatesAll(parts, cfg) {
  const name = parts[parts.length - 1];
  const hits = await grepWord(parts.length > 1 ? [...new Set(parts.slice(0, -1)), name] : [name], cfg);
  const wordRe = new RegExp(`(?<![\\w$])${escapeRe(name)}(?![\\w$])`);
  const list = [...hits.keys()].filter((f) => hits.get(f).some((l) => wordRe.test(l.text))).sort();
  return { list, searched: list.length };
}

// ------------------------------------------------------------------ outline

async function outlineMode(files, cfg, cache) {
  const out = [];
  let ok = 0;
  await preload(files.map(langForFile));
  for (const f of files) {
    const rel = path.relative(cfg.cwd, path.resolve(cfg.cwd, f)) || f;
    const abs = path.resolve(cfg.cwd, f);
    if (!fs.existsSync(abs) || fs.statSync(abs).isDirectory()) { out.push(`${f}: no such file`); continue; }
    if (!langForFile(f)) { out.push(`${f}: unsupported file type (supported: .ts .tsx .js .jsx .mjs .cjs .py .rs)`); continue; }
    const ctx = await cache.get(rel);
    if (!ctx) { out.push(`${f}: cannot read file`); continue; }
    ok++;
    let entries; let heuristic;
    try { ({ entries, heuristic } = outlineOf(ctx)); } catch (e) { out.push(`${f}: could not analyse (${e.message})`); continue; }
    let list = entries;
    let note = '';
    if (list.length > 400) {
      const top = list.filter((e) => e.depth === 0);
      note = ` — ${list.length} entries; showing top-level only`;
      list = top;
    }
    out.push(`${rel}${heuristic ? ' (heuristic extents: no grammar)' : ''}${note}`);
    for (const { decl: d, depth } of list) {
      const range = `${d.startRow + 1}-${d.endRow + 1}`;
      let text = (ctx.lines[d.declRow] ?? '').replace(/\r$/, '').trim();
      if (d.kind === 're-export') text = text || d.name;
      if (text.length > 140) text = text.slice(0, 139) + '…';
      const deco = d.decoratorCount && d.lang === 'python' ? `@${d.decoratorCount} ` : '';
      out.push(`  ${'  '.repeat(depth)}${range}  ${deco}${text}${d.errors ? '  (extent unsure: parse errors)' : ''}`);
    }
    if (!list.length) out.push('  (no declarations)');
  }
  RT.out(out.join('\n') + '\n');
  if (!ok) RT.code = 1;
}
