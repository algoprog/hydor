// Candidate-file discovery: git grep inside a work tree, plain grep otherwise.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { langForFile, family } from './grammar.mjs';

export const MAX_FILE_BYTES = 2 * 1024 * 1024;
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'target', '.git', 'venv', '.venv', '__pycache__', 'site-packages']);
export const GLOBS = ['*.ts', '*.tsx', '*.mts', '*.cts', '*.js', '*.jsx', '*.mjs', '*.cjs', '*.py', '*.pyi', '*.rs'];

export function isTestPath(p) {
  const s = p.replace(/\\/g, '/');
  return /(^|\/)(tests?|__tests__|specs?)(\/|$)/i.test(s)
    || /[-._](test|tests|spec)\.[^/]+$/i.test(s)
    || /(^|\/)test_[^/]*$/i.test(s)
    || /_test\.[^/]+$/i.test(s);
}

export function skipPath(p) {
  const segs = p.split('/');
  for (let i = 0; i < segs.length - 1; i++) if (SKIP_DIRS.has(segs[i])) return true;
  if (/\.min\.js$/.test(p)) return true;
  return false;
}

export function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function run(cmd, args, cwd) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(cmd, args, { cwd, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', LC_ALL: 'C.UTF-8' }, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) { resolve({ status: -1, out: '', err: String(e) }); return; }
    const chunks = [];
    let err = '';
    child.stdout.on('data', (c) => chunks.push(c));
    child.stderr.on('data', (c) => { err += c; });
    child.on('error', (e) => resolve({ status: -1, out: '', err: String(e) }));
    child.on('close', (status) => resolve({ status, out: Buffer.concat(chunks).toString('utf8'), err }));
  });
}

function toRel(p, cwd) {
  const abs = path.resolve(cwd, p);
  const rel = path.relative(cwd, abs);
  return rel === '' ? '.' : rel;
}

// Python's `module.func` names a file by its stem (or an __init__.py by its folder), and that name need not occur
// in the file's text, so the search for all the words together would miss it: also take the files named so.
function pyStemMatches(file, qualifier) {
  if (!/\.pyi?$/.test(file)) return false;
  const base = path.basename(file).replace(/\.pyi?$/, '');
  return (base === '__init__' ? path.basename(path.dirname(file)) : base) === qualifier;
}

// Returns Map<file, [{n, text}]>
export async function grepWord(words, opts) {
  const out = await grepWords(words, opts);
  const list = Array.isArray(words) ? words : [words];
  if (list.length === 2 && list[0] !== list[1]) {
    const named = await grepWords([list[1]], opts);
    for (const [file, ls] of named) if (!out.has(file) && pyStemMatches(file, list[0])) out.set(file, ls);
  }
  return out;
}

async function grepWords(words, { cwd, inPaths, langSet }) {
  const out = new Map();
  const wordList = Array.isArray(words) ? words : [words];
  const paths = (inPaths && inPaths.length ? inPaths.map((p) => toRel(p, cwd)) : null);
  const gitArgs = ['grep', '-n', '-I', '-w', '-F', '--untracked', '-z'];
  if (wordList.length > 1) gitArgs.push('--all-match');
  for (const w of wordList) gitArgs.push('-e', w);
  gitArgs.push('--', ...(paths || GLOBS));
  let res = await run('git', gitArgs, cwd);
  let lines = null;
  if (res.status === 0 || res.status === 1) {
    lines = [];
    for (const l of res.out.split('\n')) {
      if (!l) continue;
      const a = l.indexOf('\0');
      const b = l.indexOf('\0', a + 1);
      if (a < 0 || b < 0) continue;
      lines.push({ file: l.slice(0, a), n: Number(l.slice(a + 1, b)), text: l.slice(b + 1) });
    }
  } else {
    // not a git work tree (or git unavailable): plain grep
    const gargs = ['-rHnwFI'];
    for (const g of GLOBS) gargs.push(`--include=${g}`);
    for (const d of SKIP_DIRS) gargs.push(`--exclude-dir=${d}`);
    gargs.push('--exclude=*.min.js');
    gargs.push('-e', wordList[wordList.length - 1]);
    gargs.push('--', ...(paths || ['.']));
    res = await run('grep', gargs, cwd);
    lines = [];
    if (res.status === 0 || res.status === 1) {
      for (const l of res.out.split('\n')) {
        const m = /^(.*?):(\d+):(.*)$/.exec(l);
        if (!m) continue;
        lines.push({ file: m[1].replace(/^\.\//, ''), n: Number(m[2]), text: m[3] });
      }
    }
  }
  for (const { file, n, text } of lines) {
    if (skipPath(file)) continue;
    const lang = langForFile(file);
    if (!lang) continue;
    if (langSet && !langSet.has(lang)) continue;
    if (paths) {
      // when --in names files/dirs, git grep already restricted; nothing else to do
    }
    let arr = out.get(file);
    if (!arr) { arr = []; out.set(file, arr); }
    arr.push({ n, text });
  }
  // drop oversized files
  for (const f of [...out.keys()]) {
    try { if (fs.statSync(path.resolve(cwd, f)).size > MAX_FILE_BYTES) out.delete(f); } catch { out.delete(f); }
  }
  return out;
}

// ---- cheap per-language declaration regexes (pre-filter for very common names)

export function declLineRegex(lang, name) {
  const N = escapeRe(name);
  const fam = family(lang);
  const NB = '(?![\\w$])';
  if (fam === 'ts' || fam === 'js') {
    return new RegExp([
      `\\b(?:function\\s*\\*?|class|interface|type|enum|namespace|module|const|let|var)\\s*\\*?\\s*${N}${NB}`,
      `\\bas\\s+${N}${NB}`,
      // members / object properties: `name(...) {`, `name(...): T`, `name(` + params on following lines, `name: x`, `name = x`
      `^\\s*(?:(?:export|default|declare|public|private|protected|static|readonly|abstract|override|async|get|set|accessor)\\s+)*\\*?\\s*${N}\\s*\\??\\s*(?:<[^(]*>)?\\s*\\((?:.*\\)\\s*:\\s*\\S|.*(?<!=>\\s*)\\{\\s*$|\\s*$)`,
      `^\\s*(?:(?:export|default|declare|public|private|protected|static|readonly|abstract|override|async|get|set|accessor)\\s+)*${N}\\s*[?!]?\\s*[:=]`,
      `\\bexport\\s*\\{[^}]*(?<![\\w$])${N}${NB}`,
      `\\bexport\\s*\\*\\s*as\\s+${N}${NB}`,
    ].join('|'));
  }
  if (fam === 'py') {
    return new RegExp([
      `^\\s*(?:async\\s+def|def|class|type)\\s+${N}\\b`,
      `^\\s*[\\w\\s,()]*(?<![\\w])${N}\\b[\\w\\s,()]*(?::[^=]+)?=(?!=)`,
      `^\\s*${N}\\s*:\\s*\\S`,
    ].join('|'));
  }
  if (fam === 'rs') {
    return new RegExp([
      `\\b(?:fn|struct|enum|union|trait|type|const|static|mod)\\s+(?:mut\\s+)?${N}\\b`,
      `macro_rules!\\s*${N}\\b`,
      `^\\s*(?:pub(?:\\([^)]*\\))?\\s+)?${N}\\s*(?:[:,({=]|$)`,
      `\\bimpl\\b.*\\b${N}\\b`,
    ].join('|'));
  }
  return null;
}
