// npm run i18n:extract: every piece of text the app shows, for translating it (web/src/i18n). The pages'
// components are compiled with esbuild first, which turns JSX text into plain strings (whitespace as React
// renders it), and their strings are kept when they read as words: not class lists, keys, paths or code.
// Strings with ${…} become patterns ("{0} waiting on you"). Also: the server's error messages (they show in
// toasts), the built-in assistants and templates, and the connections catalog's names and descriptions.
// Writes web/src/i18n/strings.json (sorted) and says how many each language still lacks.
import fs from 'node:fs';
import path from 'node:path';
import { buildSync, transformSync } from 'esbuild';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const files = (dir, re) => {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (re.test(e.name) && !/-test\.ts$|selftest\.ts$|\.test\.ts$/.test(e.name) && !p.includes(`${path.sep}tests${path.sep}`)) out.push(p);
    }
  };
  walk(dir);
  return out;
};

/** Where a slash starts a regular expression rather than a division: after these, or at the start. */
const REGEX_AFTER = new Set(['', '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^', 'return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete', 'void', 'throw', 'instanceof', 'yield', 'await']);

/**
 * The string literals of compiled JavaScript: quoted ones as they are, template literals with {0}, {1}… for their parts.
 * `shown` gets the strings a sentence shows as one of its values (`Memory: ${on ? 'on' : 'off'}`): words even when
 * they are single ones in lowercase, which elsewhere read as keys.
 */
function literals(js, shown = []) {
  const out = [];
  let i = 0;
  const n = js.length;
  // Inside a value of one of the QUIET keys: what goes to an agent or a shell, never shown as it is.
  let quiet = 0;
  /** An escape at js[i] (its backslash): what it stands for, moving past it. */
  const escape = () => {
    const e = js[i + 1];
    if (e === 'u' && js[i + 2] === '{') {
      const end = js.indexOf('}', i);
      const cp = parseInt(js.slice(i + 3, end), 16);
      i = end + 1;
      return String.fromCodePoint(cp);
    }
    const out = e === 'n' ? '\n' : e === 't' ? '\t' : e === 'u' ? String.fromCharCode(parseInt(js.slice(i + 2, i + 6), 16)) : e === 'x' ? String.fromCharCode(parseInt(js.slice(i + 2, i + 4), 16)) : e;
    i += e === 'u' ? 6 : e === 'x' ? 4 : 2;
    return out;
  };
  /** Skips a quoted string at js[i] (its quote), returning its text. */
  const quoted = () => {
    const q = js[i++];
    let s = '';
    while (i < n && js[i] !== q) s += js[i] === '\\' ? escape() : js[i++];
    i++;
    return s;
  };
  /** Skips a template literal at js[i], returning its text with {0}, {1}… for its parts. */
  const template = () => {
    i++;
    let s = '';
    let k = 0;
    const values = [];
    while (i < n && js[i] !== '`') {
      if (js[i] === '\\') s += escape();
      else if (js[i] === '$' && js[i + 1] === '{') {
        i += 2;
        code(values);
        s += `{${k++}}`;
      } else s += js[i++];
    }
    i++;
    if (!quiet && isText(s, true)) shown.push(...values);
    return s;
  };
  /**
   * Reads code from js[i], keeping its strings. `values`: inside a template's ${…} part, read up to its closing
   * brace the same way as the rest (a regular expression in it holds no string; the strings in it are kept too);
   * the strings it can come to (`a ? 'x' : 'y'`, `a ?? 'x'`), not those it compares or passes on, go in `values`.
   */
  const code = (values) => {
    const inside = !!values;
    let prev = '';
    // The name before the last colon: an object's key, for the value after it.
    let key = '';
    let depth = 0;
    // Brackets and parentheses open in this part: a string in them is an argument or an element, not its value.
    let nest = 0;
    // Where a QUIET key's value in brackets (a prompt's lines) began, to speak again after it.
    const muted = [];
    while (i < n) {
      const c = js[i];
      if (/\s/.test(c)) {
        i++;
      } else if (c === '/' && js[i + 1] === '/') {
        while (i < n && js[i] !== '\n') i++;
      } else if (c === '/' && js[i + 1] === '*') {
        const e = js.indexOf('*/', i + 2);
        i = e < 0 ? n : e + 2;
      } else if (c === '"' || c === "'") {
        const s = quoted();
        if (!quiet && !(prev === ':' && QUIET.has(key))) {
          out.push(s);
          if (inside && !depth && !nest && ['', '?', ':', '|', '&'].includes(prev) && !/^\s*([=!]=|[.([])/.test(js.slice(i, i + 4))) values.push(s);
        }
        prev = 'str';
      } else if (c === '`') {
        const mute = prev === ':' && QUIET.has(key);
        quiet += mute;
        const s = template();
        quiet -= mute;
        if (!quiet && !mute) out.push(s);
        prev = 'str';
      } else if (c === '/' && REGEX_AFTER.has(prev)) {
        // A regular expression: up to its closing slash (not one in a [class]), then its flags.
        i++;
        let cls = false;
        while (i < n && (js[i] !== '/' || cls)) {
          if (js[i] === '\\') i++;
          else if (js[i] === '[') cls = true;
          else if (js[i] === ']') cls = false;
          i++;
        }
        i++;
        while (i < n && /[a-z]/.test(js[i])) i++;
        prev = 'regex';
      } else if (/[A-Za-z_$0-9]/.test(c)) {
        let j = i;
        while (j < n && /[A-Za-z_$0-9]/.test(js[j])) j++;
        prev = js.slice(i, j);
        i = j;
      } else {
        if (inside && c === '{') depth++;
        else if (inside && c === '}' && depth-- === 0) {
          i++;
          return;
        } else if (c === '(' || c === '[') {
          if (prev === ':' && QUIET.has(key)) muted.push(nest), quiet++;
          nest++;
        } else if (c === ')' || c === ']') {
          nest--;
          if (muted.at(-1) === nest) muted.pop(), quiet--;
        } else if (c === ':') key = prev;
        prev = c;
        i++;
      }
    }
  };
  code();
  return out;
}

/**
 * Keys whose values go to an agent (a scheduled task's prompt) or a shell (its command), not to the pages, and the
 * extra English words an editor's menu action is found by in Search the menus (`also`), which never show.
 */
const QUIET = new Set(['prompt', 'command', 'also']);

/** Utilities that are bare words. */
const UTILITIES = /^(flex|grid|block|inline|inline-flex|inline-block|hidden|contents|relative|absolute|fixed|sticky|static|truncate|italic|underline|uppercase|lowercase|capitalize|grow|shrink|border|rounded|shadow|ring|outline|transition|transform|group|peer|container|prose|tnum|ico|isolate|invisible|visible|antialiased|select-none|resize|break-words)$/;

/** A token of a class list: lowercase, with Tailwind's dashes, colons, brackets and the like. */
const CLASSY = /^[!-]?[a-z0-9@&\[\]:._\/()%#,'"=*+>~-]+$/;
/**
 * Whether a string reads as words someone is shown. `jsx`: a piece of JSX text, or a pattern around values,
 * where a single lowercase word is text too ("{0} prompts", " more files").
 */
const HTML_TAGS = new Set(
  'a abbr address article aside b blockquote body br caption center code dd details div dl dt em fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 head header hgroup hr html i img legend li main nav ol p pre s section span strong sub summary sup table tbody td tfoot th thead tr u ul'.split(' '),
);

function isText(s, jsx = false) {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length < 2 || t.length > 2000 || !/[A-Za-z]/.test(t)) return false;
  const bare = t.replace(/\{\d+\}/g, '');
  if (!/[A-Za-z]{2}/.test(bare)) return false;
  if (/^(https?:|\/|\.\/|#|data:|mailto:)/.test(t) || /:\/\//.test(t)) return false;
  // Markup and stylesheets (a page's HTML, a block the page editor adds) are no text the app shows.
  if ((/^(?:\{\d+\})*</.test(t) && /<\/?[a-z][\w-]*[\s>]/i.test(t)) || /^[.#]?[a-z][\w-]*\s*\{[^}]*:[^}]*\}/i.test(t)) return false;
  if (/=>|===|!==|&&|\|\||\$\(|\bfunction\b|\breturn\b|^\w+\(|\)\s*\{|@__PURE__|\bjsxs?\(|className:|children:|;\s*(const|let|var|if|for)\b/.test(t)) return false;
  // An SVG path has numbers in it: "All" and "Call" are made of its letters too.
  if (/^[MmLlHhVvCcSsQqTtAaZz0-9 .,-]+$/.test(t) && /\d/.test(t)) return false;
  if (/^(color-mix|translate|rgba?|hsla?|var|calc|url|linear-gradient|radial-gradient|conic-gradient|repeating-[a-z-]+|drop-shadow|blur)\(/.test(t)) return false;
  // An SVG path built from values ("M{0},{1}L{2}…"), and an id made of a few letters and a value ("gx{0}").
  if ((/^[MmLlHhVvCcSsQqTtAaZz0-9 .,{}-]+$/.test(t) && /\{\d+\}/.test(t) && /^[Mm]/.test(t)) || /^[a-z]{1,4}\{\d+\}$/.test(t)) return false;
  // CSS: a rule's declarations anywhere in it, values made of lengths and colours ("0 10px 28px rgba(0,0,0,.2)",
  // "{0}px {1}px"), and a list of fonts ending in a family ("Georgia, serif").
  if (/\{\s*[a-z-]+\s*:(?:[^{}]|\{\d+\})*\}/.test(t) || /^[a-z-]+\s*:\s*[^;]+;\s*[a-z-]+\s*:/.test(t)) return false;
  if (/^(?:(?:-?[\d.]+|\{\d+\})+(?:px|em|rem|%|deg|ms|s|vh|vw|fr|ch|ex|pt|mm|cm)?|rgba?\([^)]*\)|hsla?\([^)]*\)|var\([^)]*\)|calc\([^)]*\)|#[0-9a-f]{3,8}|solid|dashed|dotted|none|inset|auto)(?:[\s,]+(?:(?:-?[\d.]+|\{\d+\})+(?:px|em|rem|%|deg|ms|s|vh|vw|fr|ch|ex|pt|mm|cm)?|rgba?\([^)]*\)|hsla?\([^)]*\)|var\([^)]*\)|calc\([^)]*\)|#[0-9a-f]{3,8}|solid|dashed|dotted|none|inset|auto|\{\d+\}))*$/i.test(t) && /\d/.test(t)) return false;
  if (/,\s*(sans-serif|serif|monospace|system-ui|cursive)\s*$/.test(t)) return false;
  // LaTeX and BibTeX source an editor writes (\section{…}, a % comment, @book{…}), a code editor's keys ("Mod-b"),
  // markup and its attributes, and lists of HTML tags or selectors ("pre code", ".nd-table thead th").
  if (/^\\[a-zA-Z]|^%%|^% [A-Z]|^\$\d|^@[a-z]+\{|^Mod-[a-zA-Z]|^<[a-z{]/.test(t) || /^[a-z-]+="[^"]*"(?:\s+[a-z-]+="[^"]*")*$/.test(t)) return false;
  if (/^(?:\.?[a-z][\w-]*)(?:\s*,?\s+(?:\.?[a-z][\w-]*))+$/.test(t) && t.split(/[\s,]+/).every((w) => w.startsWith('.') || HTML_TAGS.has(w))) return false;
  // Commands, a browser's name for itself, CSS transitions, and ids made from a word and a value ("ac-{0}").
  if (/^(curl|df|npm|npx|node|git|sudo|pip|python3?|brew|apt|ssh|uv|docker)\s.*(\s--?[a-zA-Z]|\||\/)/.test(t) || /^Mozilla\/\d/.test(t)) return false;
  if (/\b(left|top|width|height|opacity|transform)\s+\d+m?s\b/.test(t)) return false;
  if ((/^[a-z0-9{}\-:._]+$/.test(t) && /[-:.]\{\d+\}|\{\d+\}[-:.]/.test(t)) || /^\{\d+\}[a-z]+\{\d+\}$/.test(t)) return false;
  // SQL, and a log's lines ("[restore] …").
  // SQL, in lower or upper case: a sentence that starts with a capital ("Delete the table") is words.
  if (/^(?:select|insert|update|delete|create|drop|alter|pragma|with|SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|PRAGMA|WITH)\b.*\b(?:from|into|set|table|index|where|values|FROM|INTO|SET|TABLE|INDEX|WHERE|VALUES)\b/.test(t) || /^\[[a-z-]+\] /.test(t)) return false;
  if (/^[a-z_.]+ (=|is|<|>|in) [?(\d]|^\{\d+\} (where|and|or) .*[=?]/.test(t)) return false;
  const tokens = bare.split(' ').filter(Boolean);
  // A list of classes (Tailwind's): lowercase tokens, most of them utilities (a dash, colon or bracket inside
  // them, a fraction or opacity after a slash, or a bare utility's name). A sentence ending in "read:" or holding
  // a "re-run" or a "tok/s" is not one.
  const utility = (k) => {
    const w = k.replace(/[.,;:!?)]+$/, '').replace(/^\(/, '');
    return /[-:\[](?!$)/.test(w) || /\/[\d[]/.test(w) || UTILITIES.test(k);
  };
  if (tokens.every((k) => CLASSY.test(k)) && tokens.filter(utility).length >= Math.ceil(tokens.length / 2) && tokens.some((k) => /[-:\[\/]/.test(k) || UTILITIES.test(k))) return false;
  if (tokens.length === 1) {
    const w = tokens[0];
    if ((jsx || /\{\d+\}/.test(t)) && /^[a-z]{2,}[a-z’'-]*[.,:;!?…)]*$/.test(w)) return true;
    // One word: a capitalised word ("Open"), or one with an ellipsis ("working…"); not keys, names in code or ALL CAPS.
    if (/…$/.test(w)) return true;
    return /^[A-Z][a-z]+[a-z.,!?:)]*$/.test(w) || /^[A-Z][a-z]+(?:[’'][a-z]+)?$/.test(w) || /^[A-Z][a-z]+(?:-[a-z]+)+[.,!?:)]*$/.test(w);
  }
  // Keys and identifiers joined by dots or underscores ("memory.meaning").
  if (/^[a-z0-9_.:-]+$/.test(t)) return false;
  return true;
}

/**
 * The sentences JSX builds from text and values ("Reading ", done, " of ", total, "…"): each element whose
 * children are text and values only, as a pattern ("Reading {0} of {1}…"). The pages translate such an
 * element as one sentence (web/src/i18n/runtime.ts), since its words may go in another order.
 */
function sentences(js) {
  const out = [];
  for (const m of js.matchAll(/children: \[/g)) {
    let i = m.index + m[0].length;
    const parts = [];
    let cur = '';
    let depth = 0;
    let ok = true;
    // The array's elements, split at its own commas.
    for (; i < js.length; i++) {
      const c = js[i];
      if (c === '"' || c === "'" || c === '`') {
        const q = c;
        let j = i + 1;
        while (j < js.length && js[j] !== q) j += js[j] === '\\' ? 2 : 1;
        cur += js.slice(i, j + 1);
        i = j;
        continue;
      }
      if (c === '(' || c === '[' || c === '{') depth++;
      if (c === ')' || c === ']' || c === '}') {
        if (depth === 0) break;
        depth--;
      }
      if (c === ',' && depth === 0) {
        parts.push(cur.trim());
        cur = '';
      } else cur += c;
    }
    if (cur.trim()) parts.push(cur.trim());
    if (parts.length < 2) continue;
    let text = '';
    let k = 0;
    let words = false;
    const pieces = [];
    for (const p of parts) {
      if (/^\/\* @__PURE__ \*\/ jsxs?\(|^jsxs?\(/.test(p) || /^\/\*/.test(p)) {
        ok = false;
        break;
      }
      const lit = /^(["'])((?:(?!\1)[^\\]|\\.)*)\1$/.exec(p);
      if (lit) {
        const [v] = literals(p);
        text += v;
        pieces.push(v);
        if (/[A-Za-z]{2}/.test(v)) words = true;
      } else text += `{${k++}}`;
    }
    if (ok && words && k > 0) out.push(text);
    // Each piece of JSX text beside values or elements, for when the element holds more than its sentence.
    for (const v of pieces) out.push({ jsx: v });
  }
  return out;
}

const found = new Map();
const add = (s, where, jsx = false) => {
  const t = s.replace(/\s+/g, ' ').trim();
  if (!isText(t, jsx)) return;
  if (!found.has(t)) found.set(t, where);
};

for (const f of [...files(path.join(ROOT, 'web/src'), /\.(tsx|ts)$/), ...files(path.join(ROOT, 'shared'), /\.ts$/)]) {
  if (f.includes(`${path.sep}i18n${path.sep}`)) continue;
  const src = fs.readFileSync(f, 'utf8');
  const js = transformSync(src, { loader: f.endsWith('x') ? 'tsx' : 'ts', jsx: 'automatic', minifyWhitespace: false, legalComments: 'none' }).code;
  const where = path.relative(ROOT, f);
  const shown = [];
  for (const s of literals(js, shown)) add(s, where);
  for (const s of shown) add(s, where, true);
  for (const s of sentences(js)) typeof s === 'string' ? add(s, where, true) : add(s.jsx, where, true);
  // Counts made with a page's plural(n, 'commit'[, 'commits']) helper: "{0} commit{1}", or each form as a pattern.
  for (const m of js.matchAll(/\bplural\([^;]*?,\s*(["'])([^"'\n]+)\1\s*(?:,\s*(["'])([^"'\n]+)\3\s*)?\)/g)) {
    if (m[4]) for (const w of [m[2], m[4]]) add(`{0} ${w}`, where, true);
    else add(`{0} ${m[2]}{1}`, where, true);
  }
  // An element's only text ("utilization", "now"), and words pushed onto a list the page joins: words even when single.
  for (const m of js.matchAll(/children: ((["'])(?:(?!\2)[^\\]|\\.)*\2)(?=\s*[,}])|\.push\(((["'])(?:(?!\4)[^\\]|\\.)*\4)\)/g)) add(literals(m[1] ?? m[3])[0], where, true);
}
// The server's messages that show in the pages: errors (in toasts), except those its tools give agents, and the
// names and lines of what ships.
for (const f of files(path.join(ROOT, 'server'), /\.ts$/)) {
  const src = fs.readFileSync(f, 'utf8');
  const where = path.relative(ROOT, f);
  for (const m of src.matchAll(/new HttpError\(\s*\d+\s*,\s*((['"`])(?:(?!\2)[^\\]|\\.)*\2)/g)) for (const s of literals(m[1])) add(s, where);
  if (!/(^|\/)(tools|mcp|cli)\.ts$/.test(where)) for (const m of src.matchAll(/new Error\(\s*((['"`])(?:(?!\2)[^\\]|\\.)*\2)/g)) for (const s of literals(m[1])) add(s, where);
}
// Whole files whose strings the pages show: the search providers, the helper model's choices, the agents' list, the
// sessions' notices (a session finished, needs you, failed) and messages, and the form an image or a video asks first.
for (const f of ['brave', 'duckduckgo', 'naget', 'searxng', 'service'].map((x) => `server/search/${x}.ts`).concat('server/helper.ts', 'server/agents/acp.ts', 'server/sessions.ts', 'server/images/settings.ts')) {
  const js = transformSync(fs.readFileSync(path.join(ROOT, f), 'utf8'), { loader: 'ts', legalComments: 'none' }).code;
  for (const s of literals(js)) add(s, f);
}
// The names and lines of what ships, and of the choices the server offers (permission modes, the buttons of an approval).
const NAMED = ['assistants/builtins', 'apps/templates', 'apps/templates-more', 'apps/explore', 'apps/draft', 'apps/screens', 'agents/claude', 'agents/codex', 'agents/elicit', 'agents/control', 'opinion/index', 'guide/form', 'guide/api'];
for (const f of NAMED.map((x) => `server/${x}.ts`)) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  for (const m of src.matchAll(/\b(name|label|description|detail|placeholder|help|title|category|note)\s*:\s*((['"`])(?:(?!\3)[^\\]|\\.)*\3)/g)) for (const s of literals(m[2])) add(s, f);
  // A ready-made app's choices, which its form shows as chips (the answer sent stays the option as written).
  if (/^server\/apps\/(templates(-more)?|explore)\.ts$/.test(f)) for (const m of src.matchAll(/\boptions\s*:\s*\[([^\]]*)\]/g)) for (const o of m[1].matchAll(/'([^'\\]+)'/g)) add(o[1], f, true);
}
// The ready-made apps' views: the words of their pages and elements, as the pages translate them (shared/app-ui.ts).
{
  const built = buildSync({
    stdin: { contents: "import { VIEWS } from './server/apps/views.ts'; import { MORE_VIEWS } from './server/apps/views-more.ts'; import { EXPLORE_UI } from './server/apps/explore.ts'; import { uiTexts } from './shared/app-ui.ts'; export default [...Object.values(VIEWS), ...Object.values(MORE_VIEWS), EXPLORE_UI].flatMap((v) => uiTexts(v));", resolveDir: ROOT, loader: 'ts' },
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
    logLevel: 'error',
  });
  const texts = (await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`)).default;
  for (const s of texts) add(s, 'server/apps/views.ts', true);
}
for (const f of fs.readdirSync(path.join(ROOT, 'catalog/connections')).filter((x) => x.endsWith('.json'))) {
  const e = JSON.parse(fs.readFileSync(path.join(ROOT, 'catalog/connections', f), 'utf8'));
  for (const s of [e.name, e.description, ...(e.fields ?? []).flatMap((x) => [x.label, x.help])]) if (typeof s === 'string') add(s, `catalog/connections/${f}`);
}
// The skills that come with the app: what each is for (Settings → Skill library).
for (const d of fs.readdirSync(path.join(ROOT, 'skills'))) {
  const md = path.join(ROOT, 'skills', d, 'SKILL.md');
  const description = fs.existsSync(md) && /^description:\s*(.+)$/m.exec(fs.readFileSync(md, 'utf8'))?.[1];
  if (description) add(description.replace(/^(["'])(.*)\1$/, '$2'), `skills/${d}/SKILL.md`);
}
// The guide's topics that are in English only (the API): their titles show among the translated ones.
for (const f of fs.readdirSync(path.join(ROOT, 'docs/guide')).filter((x) => x.endsWith('.md') && x !== 'README.md' && !fs.existsSync(path.join(ROOT, 'docs/guide/zh', x)))) {
  const title = /^# (.+)$/m.exec(fs.readFileSync(path.join(ROOT, 'docs/guide', f), 'utf8'))?.[1];
  if (title) add(title, `docs/guide/${f}`);
}

const out = Object.fromEntries([...found.entries()].sort((a, b) => a[0].localeCompare(b[0])));
fs.mkdirSync(path.join(ROOT, 'web/src/i18n'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'web/src/i18n/strings.json'), `${JSON.stringify(out, null, 0).replace(/^\{/, '{\n').replace(/","/g, '",\n"').replace(/\}$/, '\n}')}\n`);
console.log(`${found.size} strings`);
for (const lang of ['zh', 'el']) {
  const file = path.join(ROOT, `web/src/i18n/${lang}.json`);
  const have = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  const missing = Object.keys(out).filter((k) => !(k in have)).length;
  console.log(`${lang}: ${Object.keys(out).length - missing} translated, ${missing} to go`);
}
