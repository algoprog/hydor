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
        if (!quiet && !(prev === ':' && quietHere.has(key))) {
          out.push(s);
          if (inside && !depth && !nest && ['', '?', ':', '|', '&'].includes(prev) && !/^\s*([=!]=|[.([])/.test(js.slice(i, i + 4))) values.push(s);
        }
        prev = 'str';
      } else if (c === '`') {
        const mute = prev === ':' && quietHere.has(key);
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
        else if (inside && c === '}') {
          if (depth-- === 0) {
            i++;
            return;
          }
        } else if (c === '(' || c === '[' || (bracesQuiet && c === '{')) {
          // A QUIET key's value in brackets (a prompt's lines), or in braces where QUIET_UNDER says (an example's data), is quiet to its end.
          if (prev === ':' && quietHere.has(key)) muted.push(nest), quiet++;
          nest++;
        } else if (c === ')' || c === ']' || (bracesQuiet && c === '}')) {
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
/** Keys quiet in one file only: the requests the kinds an agent makes ask for (`ask`), which elsewhere is a question shown. */
const QUIET_IN = {
  'shared/content-types.ts': ['ask'],
  // A diagram's own words (what its shapes say), drawn where nothing is translated: the sample words of the panel's
  // shapes; their names are the app's.
  'shared/diagram-palette.ts': ['text', 'rows'],
  // The ad blocker's filter lists keep the names their makers give them ("EasyList Germany", "AdGuard Japanese").
  'shared/browser.ts': ['listName'],
};
/**
 * Keys quiet in every file of a folder: the answer UIs' catalog (shared/answer-ui), whose types, examples and search words
 * go to agents and search; the gallery shows only each UI's title and what it is for (`use`).
 */
const QUIET_UNDER = { 'shared/answer-ui/': ['shape', 'example', 'keywords'] };
/** The quiet keys of the file being read, and whether a quiet key's value in braces is quiet too (QUIET_UNDER's files). */
let quietHere = QUIET;
let bracesQuiet = false;

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
  if (/^(?:(?:-?[\d.]+|\{\d+\})+(?:px|em|rem|%|deg|ms|s|vh|vw|dvh|svh|lvh|cqw|cqh|cqi|fr|ch|ex|pt|mm|cm)?|rgba?\([^)]*\)|hsla?\([^)]*\)|var\([^)]*\)|calc\([^)]*\)|#[0-9a-f]{3,8}|solid|dashed|dotted|none|inset|auto)(?:[\s,]+(?:(?:-?[\d.]+|\{\d+\})+(?:px|em|rem|%|deg|ms|s|vh|vw|dvh|svh|lvh|cqw|cqh|cqi|fr|ch|ex|pt|mm|cm)?|rgba?\([^)]*\)|hsla?\([^)]*\)|var\([^)]*\)|calc\([^)]*\)|#[0-9a-f]{3,8}|solid|dashed|dotted|none|inset|auto|\{\d+\}))*$/i.test(t) && /\d/.test(t)) return false;
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
const allSources = new Map();
const add = (s, where, jsx = false) => {
  const t = s.replace(/\s+/g, ' ').trim();
  if (!isText(t, jsx)) return;
  // A word may have different meanings in different editors; retain every use for review.
  if (!allSources.has(t)) allSources.set(t, new Set());
  allSources.get(t).add(where);
  if (!found.has(t)) found.set(t, where);
};

// Files with no words the pages show: the code highlighter's keyword lists (its languages' names are the same in every
// language), which read as words, and the requests the kinds an agent makes, and Resolve with AI, send it.
const NO_WORDS = new Set([
  // Goal mode's made-up example (a shop's search) and the page that shows it: development only, never the app's words.
  'web/src/features/goal/samples.ts',
  'web/src/features/goal/Preview.tsx',
  'shared/code-colours.ts',
  'shared/content-asks.ts',
  'shared/comment-asks.ts',
  'shared/highlight-asks.ts',
  // The Slack app's manifest and the Discord invitation: what is pasted into those services, not the app's words.
  'shared/chat-apps.ts',
  // A diagram's shapes, routes, layouts and drawing: their notes go to agents, the rest is code (the model's names of
  // arrows, fonts and looks, in diagram.ts, are the app's words).
  'shared/diagram-shapes.ts',
  // The page a code playground runs its code in: a script, its words given by the view (uis/code.tsx) in the app's language.
  'web/src/components/answer/playground-doc.ts',
  'shared/diagram-route.ts',
  'shared/diagram-layout.ts',
  'shared/diagram-render.ts',
  'shared/diagram-spec.ts',
  'shared/diagram-edits.ts',
  'shared/diagram-ops.ts',
  'shared/draft-diagram.ts',
  // Which tools act outside (word lists), and what agents are told of Ask first: none of it is shown.
  'shared/outbox-words.ts',
  // An answer card as text and Markdown, for the clipboard and a conversation's export (files, not the pages' words).
  'shared/answer-ui/text.ts',
  // A message on its way, its files listed as the server lists them (split off again before it shows).
  'web/src/lib/outgoing.ts',
]);
for (const f of [...files(path.join(ROOT, 'web/src'), /\.(tsx|ts)$/), ...files(path.join(ROOT, 'shared'), /\.ts$/)]) {
  if (f.includes(`${path.sep}i18n${path.sep}`) || NO_WORDS.has(path.relative(ROOT, f).split(path.sep).join('/'))) continue;
  const src = fs.readFileSync(f, 'utf8');
  const js = transformSync(src, { loader: f.endsWith('x') ? 'tsx' : 'ts', jsx: 'automatic', minifyWhitespace: false, legalComments: 'none' }).code;
  const where = path.relative(ROOT, f);
  const rel = where.split(path.sep).join('/');
  quietHere = new Set([...QUIET, ...(QUIET_IN[rel] ?? []), ...Object.entries(QUIET_UNDER).flatMap(([dir, keys]) => (rel.startsWith(dir) ? keys : []))]);
  bracesQuiet = Object.keys(QUIET_UNDER).some((dir) => rel.startsWith(dir));
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
  quietHere = QUIET;
  bracesQuiet = false;
}
// The server's messages that show in the pages: errors (in toasts), except those its tools give agents (tools.ts,
// mcp.ts, and page_action's, server/pages/actions.ts), and the names and lines of what ships.
for (const f of files(path.join(ROOT, 'server'), /\.ts$/)) {
  const src = fs.readFileSync(f, 'utf8');
  const where = path.relative(ROOT, f);
  for (const m of src.matchAll(/new HttpError\(\s*\d+\s*,\s*((['"`])(?:(?!\2)[^\\]|\\.)*\2)/g)) for (const s of literals(m[1])) add(s, where);
  if (!/(^|\/)(tools|mcp|cli)\.ts$|^server\/pages\/actions\.ts$/.test(where.split(path.sep).join('/'))) for (const m of src.matchAll(/new Error\(\s*((['"`])(?:(?!\2)[^\\]|\\.)*\2)/g)) for (const s of literals(m[1])) add(s, where);
}
// Structured failures also reach the UI without a direct HttpError literal. Restrict extraction to their
// message statements and the phone-readiness helper, leaving the refresh agent's prompts out of the catalog.
// The existing literal scanner keeps nested template values and their visible conditional fragments intact.
for (const f of ['server/phone/index.ts', 'server/pages/board-refresh.ts']) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const record = (expression) => {
    const shown = [];
    for (const s of literals(expression, shown)) add(s, f);
    for (const s of shown) add(s, f, true);
  };
  if (f === 'server/phone/index.ts') {
    const start = src.indexOf('export function notReadyText(');
    const end = src.indexOf('export class Phone', start);
    if (start >= 0 && end > start) record(src.slice(start, end));
    // A problem call ends its statement on a source line, including calls formatted across several lines.
    for (const m of src.matchAll(/throw problem\(/g)) {
      const end = src.indexOf(';\n', m.index);
      if (end >= 0) record(src.slice(m.index, end));
    }
  } else {
    // These returned failure reasons and notification bodies are displayed by the board UI or push service.
    for (const line of src.split('\n')) if (/\bfail\(|return \{ error:|^\s*body:/.test(line)) record(line);
  }
}
// Whole files whose strings the pages show: the search providers, the helper model's choices, the agents' list, the
// sessions' notices (a session finished, needs you, failed) and messages, and the form an image or a video asks first.
for (const f of ['brave', 'duckduckgo', 'naget', 'searxng', 'service'].map((x) => `server/search/${x}.ts`).concat('server/helper.ts', 'server/agents/acp.ts', 'server/sessions.ts', 'server/images/settings.ts')) {
  const js = transformSync(fs.readFileSync(path.join(ROOT, f), 'utf8'), { loader: 'ts', legalComments: 'none' }).code;
  for (const s of literals(js)) add(s, f);
}
// The goal loop's own sentences that people read on a screen (a goal's reason, a limit, a round's why and the report's
// summary, the notices, and what a refused action says), from the files of server/goals. Not what goes to the agent (the
// round messages in brief.ts, the tools' answers and descriptions in tools.ts, the reviewers' instructions in review.ts, what
// the checks hand a reviewer) and not what a model wrote. A file is read line by line: `skip` drops a line (what it writes goes
// to an agent or a log), `only` keeps just the lines that match (a file that is mostly agent-facing), `skipFunctions` leaves out
// whole functions (to their closing brace at the line's start) whose sentence is built from clauses in an order only English has,
// with commands in it: it stays in English as a whole rather than half translated. A sentence with a value in it (a number, a
// name) comes out as a pattern with {0}, which the pages' translator matches (shared/translate.ts); a text of several
// sentences is translated sentence by sentence, or not at all.
/** The limit report's sentence for the subagents or a swarm's members still at work (TEAM_LATE in driver.ts), each reading whole. */
function teamLate() {
  const out = [];
  for (const who of ['The swarm’s', 'The']) {
    const [one, many] = who === 'The' ? ['subagent', 'subagents'] : ['member', 'members'];
    const tail = (was, it) => `${was} still at work when round {N}’s files were saved: what ${it} after that is in the folder but not in the round.`;
    out.push(`${who} ${one} “{0}” ${tail('was', 'it writes').replace('{N}', '{1}')}`);
    out.push(`${who} ${many} “{0}” and “{1}” ${tail('were', 'they write').replace('{N}', '{2}')}`);
    out.push(`${who} ${many} {0} and “{1}” ${tail('were', 'they write').replace('{N}', '{2}')}`);
  }
  return out;
}
const GOAL_LOOP = {
  'server/goals/driver.ts': {
    skip: /console\.|\.prepare\(|\bsendAsk\(|\bg\._\.note\b|\btext: ['`]|\{ ok: (true|false), text|\bconst (PAUSED|LEADS_GOAL|NO_GOAL) =|Fix these and call|\bconst about = |\bdropped\b/,
    // The say refused for files changed outside the goal, and the sentence of a reset that did not finish: clauses and git commands.
    skipFunctions: /^(function (editedText|unfinishedText)\(|const TEAM_LATE = )/,
    // TEAM_LATE names the subagents (a swarm's members) still at work with their titles as values: its readings written out, for one name, two, and more (the first names kept as one value).
    extra: teamLate(),
    // Why a goal cannot be set: said whole as a refusal, and with its first letter lower after "The goal was not set: " (goalNotSetText).
    lowered: /^(const (IN_PLAN|IN_SUBAGENT) =|export function (teamRefusal|refusal|goalStartRefusal)\()/,
  },
  'server/goals/verdict.ts': {},
  'server/goals/validate.ts': {},
  'server/goals/checks.ts': { only: /errorResult\(|\bSLOW_READ =|\br\.(failed|timedOut|code ===)/ },
  'server/goals/review.ts': { only: /NO_LOCAL_REVIEWER =|gave no answer|could not answer|'It holds\.'|meets the goal/ },
  // A score check: its refusals, why it got no score, and the way on its question offers. Not what only the agent is told,
  // nor the score's line of numbers (clauses in an order only English has).
  'server/goals/scores.ts': { skip: /console\.|\.prepare\(|ask them to|evaluation_get/, skipFunctions: /^export function scoreDetail\(/, extra: ['{0}: there is no evaluation “{1}”: pick one of this folder’s evaluations.'] },
  // Not the goal loop's, but read the same way: why an evolution paused, stopped or failed, and why a try did. "The start
  // could not be scored" is followed by the end of a log, which the page shows apart.
  'server/experiments/evolve.ts': { only: /const SEALED_AGAIN =|problem\.protected \?|\b(finish|endWith)\(.*'|\.evo\.why = [`']|why = 'Stopped by you'/, skip: /\} tried`|The start could not be scored: \$\{score|The end of its log/, extra: ['The start could not be scored: {0}'] },
};
for (const [f, { skip, only, skipFunctions, lowered, extra }] of Object.entries(GOAL_LOOP)) {
  for (const s of extra ?? []) add(s, f);
  let inSkipped = false;
  // Inside a function whose sentences also come lower-cased (to its closing brace at the line's start), or on a one-line constant.
  let inLowered = false;
  for (const line of fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n')) {
    if (inSkipped) {
      inSkipped = line !== '}' && line !== '};';
      continue;
    }
    if (skipFunctions?.test(line)) {
      inSkipped = true;
      continue;
    }
    const t = line.trim();
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || (skip && skip.test(line)) || (only && !only.test(line))) continue;
    const shown = [];
    if (lowered?.test(line)) inLowered = !/^const /.test(line) || false;
    const lowerNow = (lowered?.test(line) || inLowered) && !t.startsWith('export function');
    // A sentence with a choice of words in it (`The check ${past ? 'held' : 'holds'}`) also as each of its readings whole: the
    // pages' translator takes a value for a phrase only when the dictionary has it as one, so "The check held" and "The check
    // holds" are entries of their own, besides the pattern "The check {0}".
    const readings = [line];
    for (let k = 0; k < readings.length && readings.length < 5; k++) {
      const m = /\$\{[^{}?]*\?\s*'([^'\\]+)'\s*:\s*'([^'\\]+)'\s*\}/.exec(readings[k]);
      if (m && /[A-Za-z]{2}/.test(m[1] + m[2])) for (const w of [m[1], m[2]]) readings.push(readings[k].replace(m[0], w));
    }
    for (const r of readings.slice(1)) for (const s of literals(r)) add(s, f);
    for (const s of literals(line, shown)) {
      add(s, f);
      // As the server lowers it: the first letter only, unless the second is a capital too (an acronym).
      if (lowerNow && /^[A-Z](?![A-Z])/.test(s)) add(s[0].toLowerCase() + s.slice(1), f);
    }
    for (const s of shown) add(s, f, true);
    if (inLowered && line === '}') inLowered = false;
  }
}
// The line under a results table as the page shows it: what its daggers mean (describe in server/experiments/tables.ts), with
// each test as it was made. Built from values, so each reading is written out here.
for (const s of [
  '† Better than {0} at p < {1} ({2}).',
  '† Better than {0} at p < {1} ({2}). ‡ Worse than {3}, by the same test.',
  '{0}, Holm-corrected',
  'paired t-test over {0} seeds',
  'paired t-test over {0} examples',
  'paired bootstrap over {0} examples',
  "Welch's t-test over {0} seeds",
])
  add(s, 'server/experiments/tables.ts');
// Runs that wait for the night: why one waits, and why a cluster takes none, which the pages show as the run's reason or in a
// toast (the constants of server/experiments/night.ts), and the box a refused time names (queue.ts).
for (const m of fs.readFileSync(path.join(ROOT, 'server/experiments/night.ts'), 'utf8').matchAll(/^(?:export )?const NIGHT_\w+ = ('(?:[^'\\]|\\.)*');$/gm)) for (const s of literals(m[1])) add(s, 'server/experiments/night.ts');
add('Night to', 'server/experiments/queue.ts');
// The morning's notice (morningWords in night.ts): its counts joined by commas, the first saying "run" or "runs". The pages'
// translator takes it whole or not at all, so every reading is written out here.
{
  const parts = ['done', 'failed', 'stopped', 'still running', 'waits'];
  for (let set = 1; set < 1 << parts.length; set++) {
    const used = parts.filter((_, i) => set & (1 << i));
    for (const one of [true, false]) {
      let readings = [''];
      let k = one ? 0 : 1;
      used.forEach((p, i) => {
        const count = i ? `{${k++}}` : one ? '1 run' : '{0} runs';
        const said = p !== 'waits' ? [p] : (i ? [true, false] : [one]).map((single) => `still ${single ? 'waits' : 'wait'} for tonight`);
        readings = readings.flatMap((r) => said.map((w) => `${r}${i ? ', ' : ''}${count} ${w}`));
      });
      for (const r of readings) add(`Last night: ${r}`, 'server/experiments/night.ts');
    }
  }
}
// The names and lines of what ships, and of the choices the server offers (permission modes, the buttons of an approval).
const NAMED = ['assistants/builtins', 'apps/templates', 'apps/templates-more', 'apps/templates-research', 'apps/templates-papers', 'apps/templates-lab', 'apps/explore', 'apps/draft', 'apps/screens', 'pages/latex-check', 'agents/claude', 'agents/codex', 'agents/elicit', 'agents/control', 'opinion/index', 'guide/form', 'guide/api', 'automations/account-watch'];
for (const f of NAMED.map((x) => `server/${x}.ts`)) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  for (const m of src.matchAll(/\b(name|label|description|detail|placeholder|help|title|category|note)\s*:\s*((['"`])(?:(?!\3)[^\\]|\\.)*\3)/g)) for (const s of literals(m[2])) add(s, f);
  // The sentences the paper check puts together into one finding's text, one pushed at a time.
  if (f === 'server/pages/latex-check.ts') for (const m of src.matchAll(/\b(?:changed|said)\.push\(\s*((['"`])(?:(?!\2)[^\\]|\\.)*\2)/g)) for (const s of literals(m[1])) add(s, f);
  // A ready-made app's choices, which its form shows as chips (the answer sent stays the option as written).
  if (/^server\/apps\/(templates(-(more|research|papers|lab))?|explore)\.ts$/.test(f)) for (const m of src.matchAll(/\boptions\s*:\s*\[([^\]]*)\]/g)) for (const o of m[1].matchAll(/'([^'\\]+)'/g)) add(o[1], f, true);
}
// The ready-made apps' views: the words of their pages and elements, as the pages translate them (shared/app-ui.ts).
{
  const built = buildSync({
    stdin: { contents: "import { VIEWS } from './server/apps/views.ts'; import { MORE_VIEWS } from './server/apps/views-more.ts'; import { RESEARCH_VIEWS } from './server/apps/views-research.ts'; import { PAPER_VIEWS } from './server/apps/views-papers.ts'; import { LAB_VIEWS } from './server/apps/views-lab.ts'; import { EXPLORE_UI } from './server/apps/explore.ts'; import { uiTexts } from './shared/app-ui.ts'; export default [...Object.values(VIEWS), ...Object.values(MORE_VIEWS), ...Object.values(RESEARCH_VIEWS), ...Object.values(PAPER_VIEWS), ...Object.values(LAB_VIEWS), EXPLORE_UI].flatMap((v) => uiTexts(v));", resolveDir: ROOT, loader: 'ts' },
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
    logLevel: 'error',
  });
  const texts = (await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`)).default;
  for (const s of texts) add(s, 'server/apps/views.ts', true);
}
// The ideas of "What do you want to make?" (each one's name, who it is for and what such an app needs), and why an app cannot
// go to a server of your own, as the pages show them.
{
  const built = buildSync({
    stdin: { contents: "import { KINDS } from './server/webapps/ideas.ts'; import { SERVER_NEEDS_ACCOUNTS } from './shared/webapps.ts'; export default [...KINDS.flatMap((k) => [k.name, k.who, ...k.needs]), SERVER_NEEDS_ACCOUNTS];", resolveDir: ROOT, loader: 'ts' },
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
    logLevel: 'error',
  });
  const texts = (await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`)).default;
  for (const s of texts) add(s, 'server/webapps/ideas.ts', true);
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
// Guide titles also need dictionary entries when a language has no translated guide topic yet.
for (const f of fs.readdirSync(path.join(ROOT, 'docs/guide')).filter((x) => /^\d+-[a-z0-9-]+\.md$/.test(x))) {
  const title = /^# (.+)$/m.exec(fs.readFileSync(path.join(ROOT, 'docs/guide', f), 'utf8'))?.[1];
  if (title) add(title, `docs/guide/${f}`);
}

const out = Object.fromEntries([...found.entries()].sort((a, b) => a[0].localeCompare(b[0])));
fs.mkdirSync(path.join(ROOT, 'web/src/i18n'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'web/src/i18n/strings.json'), `${JSON.stringify(out, null, 0).replace(/^\{/, '{\n').replace(/","/g, '",\n"').replace(/\}$/, '\n}')}\n`);
console.log(`${found.size} strings`);
// Optional review evidence stays outside the shipped catalog and does not alter its format.
const inventoryFlag = process.argv.indexOf('--inventory');
if (inventoryFlag !== -1) {
  const target = process.argv[inventoryFlag + 1];
  if (!target || target.startsWith('--')) throw new Error('--inventory requires an output path');
  fs.writeFileSync(target, `${JSON.stringify(Object.fromEntries([...allSources].sort(([a], [b]) => a.localeCompare(b)).map(([key, paths]) => [key, [...paths].sort()])), null, 2)}\n`);
}
// Every language with a dictionary of its own (de.json, es.json…; supplements are named <lang>.<module>.json).
const LANGS = fs.readdirSync(path.join(ROOT, 'web/src/i18n')).flatMap((f) => (/^([a-z]{2,3})\.json$/.exec(f)?.[1] ? [f.slice(0, -5)] : [])).sort();
for (const lang of LANGS) {
  const file = path.join(ROOT, `web/src/i18n/${lang}.json`);
  const have = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  // Supplement catalogs contribute coverage without replacing existing base translations.
  const supplements = fs.readdirSync(path.dirname(file), { withFileTypes: true })
    .filter((entry) => entry.isFile() && new RegExp(`^${lang}\\.[a-z0-9_-]+\\.json$`).test(entry.name))
    .map((entry) => entry.name).sort();
  for (const name of supplements) {
    const entries = JSON.parse(fs.readFileSync(path.join(path.dirname(file), name), 'utf8'));
    for (const [key, value] of Object.entries(entries)) if (!Object.hasOwn(have, key)) have[key] = value;
  }
  const missing = Object.keys(out).filter((k) => !(k in have)).length;
  console.log(`${lang}: ${Object.keys(out).length - missing} translated, ${missing} to go`);
}
