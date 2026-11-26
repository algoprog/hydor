// Candidate-file discovery: ripgrep when there is one, else git grep inside a work tree, else plain grep.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { langForFile, family } from './grammar.mjs';
import { relOrDot, cleanFound, moduleStem } from './paths.mjs';

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

// The platform: SYM_FAKE_PLATFORM (darwin|win32) is a hidden test seam that makes the non-Linux rules apply on Linux.
const platform = () => process.env.SYM_FAKE_PLATFORM || process.platform;

// Locale for the search tools. Linux: UTF-8 as before. Elsewhere (macOS has no C.UTF-8) the plain C locale, which
// every system has and which treats text as bytes; this file decodes the output as UTF-8 itself.
export function searchLocale(plat = platform()) {
  return plat === 'linux' ? 'C.UTF-8' : 'C';
}

function run(cmd, args, cwd) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(cmd, args, { cwd, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', LC_ALL: searchLocale() }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
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
  return relOrDot(cwd, p);
}

// Python's `module.func` names a file by its stem (or an __init__.py by its folder), and that name need not occur
// in the file's text, so the search for all the words together would miss it: also take the files named so.
export function pyStemMatches(file, qualifier, pm = path) {
  return moduleStem(file, pm) === qualifier;
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

// ---- search backends: ripgrep, then git grep, then grep -r. Each returns [{file, n, text}] (whole-word, fixed-string
// matches of any word, in files that have all the words when there are several) or null when it cannot be used.

export const BACKENDS = ['rg', 'git', 'grep'];
export class SearchToolError extends Error {}

// The ripgrep to use: the file named by HYDOR_RG when it exists, else `rg` from PATH.
export function rgCommand(env = process.env) {
  const h = env.HYDOR_RG;
  if (h) { try { if (fs.statSync(h).isFile()) return h; } catch { /* not there: use PATH */ } }
  return 'rg';
}

// `path\0LINE:text` lines of `rg --null --line-number --no-heading`; lines that are not matches are skipped.
export function parseRg(out) {
  const lines = [];
  for (const l of out.split('\n')) {
    const a = l.indexOf('\0');
    if (a < 0) continue;
    const m = /^(\d+):(.*)$/s.exec(l.slice(a + 1));
    if (m) lines.push({ file: cleanFound(l.slice(0, a)), n: Number(m[1]), text: m[2] });
  }
  return lines;
}

// `path\0LINE\0text` lines of `git grep -n -z`.
export function parseGitGrep(out) {
  const lines = [];
  for (const l of out.split('\n')) {
    if (!l) continue;
    const a = l.indexOf('\0');
    const b = l.indexOf('\0', a + 1);
    if (a < 0 || b < 0) continue;
    lines.push({ file: cleanFound(l.slice(0, a)), n: Number(l.slice(a + 1, b)), text: l.slice(b + 1) });
  }
  return lines;
}

// `path:LINE:text` lines of `grep -rHn`.
export function parseGrep(out) {
  const lines = [];
  for (const l of out.split('\n')) {
    const m = /^(.*?):(\d+):(.*)$/s.exec(l); // `s`: the text of a CRLF line ends in \r
    if (m) lines.push({ file: cleanFound(m[1]), n: Number(m[2]), text: m[3] });
  }
  return lines;
}

// git grep --all-match semantics for tools that cannot do it: keep only the files in which every word occurs
// (as a whole word, Unicode-aware like ripgrep's -w) on some listed line.
export function keepFilesWithAllWords(lines, wordList) {
  if (wordList.length < 2) return lines;
  const L = '\\p{L}\\p{M}\\p{N}_';
  const res = wordList.map((w) => new RegExp(`(?<![${L}])${escapeRe(w)}(?![${L}])`, 'u'));
  const seen = new Map();
  for (const { file, text } of lines) {
    let set = seen.get(file);
    if (!set) { set = new Set(); seen.set(file, set); }
    res.forEach((re, i) => { if (!set.has(i) && re.test(text)) set.add(i); });
  }
  return lines.filter((l) => seen.get(l.file).size === wordList.length);
}

export function rgArgs(wordList, paths) {
  const a = ['--no-config', '--line-number', '--with-filename', '--no-heading', '--color', 'never', '--null',
    '--fixed-strings', '--word-regexp', '--hidden', '--no-messages', '--no-require-git'];
  // a file type, not -g: a --glob whitelist would override the ignore files, a type filter applies after them
  for (const g of GLOBS) a.push('--type-add', `sym:${g}`);
  a.push('--type', 'sym');
  for (const d of SKIP_DIRS) a.push('-g', `!${d}`);
  a.push('-g', '!*.min.js');
  for (const w of wordList) a.push('-e', w);
  a.push('--', ...(paths || ['.']));
  return a;
}

async function searchRg(wordList, paths, cwd) {
  const res = await run(rgCommand(), rgArgs(wordList, paths), cwd);
  // 0: matches, 1: none; 2 also happens when some file could not be read while others matched
  if (res.status === 0 || res.status === 1 || (res.status === 2 && res.out)) return keepFilesWithAllWords(parseRg(res.out), wordList);
  return null;
}

async function searchGit(wordList, paths, cwd) {
  const gitArgs = ['grep', '-n', '-I', '-w', '-F', '--untracked', '-z'];
  if (wordList.length > 1) gitArgs.push('--all-match');
  for (const w of wordList) gitArgs.push('-e', w);
  gitArgs.push('--', ...(paths || GLOBS));
  const res = await run('git', gitArgs, cwd);
  return res.status === 0 || res.status === 1 ? parseGitGrep(res.out) : null;
}

async function searchGrep(wordList, paths, cwd) {
  const gargs = ['-rHnwFI'];
  for (const g of GLOBS) gargs.push(`--include=${g}`);
  for (const d of SKIP_DIRS) gargs.push(`--exclude-dir=${d}`);
  gargs.push('--exclude=*.min.js');
  for (const w of wordList) gargs.push('-e', w);
  gargs.push('--', ...(paths || ['.']));
  const res = await run('grep', gargs, cwd);
  // grep has no --all-match: keep the files that have every word, as git grep and ripgrep do
  // 2 means some file could not be read; the matches in the others are still good
  return res.status === 0 || res.status === 1 || (res.status === 2 && res.out) ? keepFilesWithAllWords(parseGrep(res.out), wordList) : res.status === 2 ? [] : null;
}

const SEARCH = { rg: searchRg, git: searchGit, grep: searchGrep };

// SYM_BACKEND=rg|git|grep (hidden, for tests) uses that backend only and fails loudly when it cannot run.
async function candidateLines(wordList, paths, cwd) {
  const forced = process.env.SYM_BACKEND;
  if (forced) {
    if (!SEARCH[forced]) throw new Error(`unknown SYM_BACKEND ${forced}`);
    const lines = await SEARCH[forced](wordList, paths, cwd);
    if (!lines) throw new Error(`search backend ${forced} failed`);
    return lines;
  }
  for (const b of BACKENDS) {
    const lines = await SEARCH[b](wordList, paths, cwd);
    if (lines) return lines;
  }
  throw new SearchToolError('no search tool could be run (install ripgrep, or git, or grep)');
}

async function grepWords(words, { cwd, inPaths, langSet }) {
  const out = new Map();
  const wordList = Array.isArray(words) ? words : [words];
  const paths = (inPaths && inPaths.length ? inPaths.map((p) => toRel(p, cwd)) : null);
  const lines = await candidateLines(wordList, paths, cwd);
  for (const { file, n, text } of lines) {
    if (skipPath(file)) continue;
    const lang = langForFile(file);
    if (!lang) continue;
    if (langSet && !langSet.has(lang)) continue;
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
