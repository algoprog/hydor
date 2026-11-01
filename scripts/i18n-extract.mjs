// npm run i18n:extract: every piece of text the app shows, for translating it (web/src/i18n). The pages'
// components are compiled with esbuild first, which turns JSX text into plain strings (whitespace as React
// renders it), and their strings are kept when they read as words: not class lists, keys, paths or code.
// Strings with ${…} become patterns ("{0} waiting on you"). Also: the server's error messages (they show in
// toasts), the built-in assistants and templates, and the connections catalog's names and descriptions.
// Writes web/src/i18n/strings.json (sorted) and says how many each language still lacks.
import fs from 'node:fs';
import path from 'node:path';
import { transformSync } from 'esbuild';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const files = (dir, re) => {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (re.test(e.name) && !/-test\.ts$|selftest\.ts$/.test(e.name)) out.push(p);
    }
  };
  walk(dir);
  return out;
};

/** Where a slash starts a regular expression rather than a division: after these, or at the start. */
const REGEX_AFTER = new Set(['', '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^', 'return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete', 'void', 'throw', 'instanceof', 'yield', 'await']);

/** The string literals of compiled JavaScript: quoted ones as they are, template literals with {0}, {1}… for their parts. */
function literals(js) {
  const out = [];
  let i = 0;
  let prev = '';
  const n = js.length;
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
    while (i < n && js[i] !== '`') {
      if (js[i] === '\\') s += escape();
      else if (js[i] === '$' && js[i + 1] === '{') {
        i += 2;
        expression();
        s += `{${k++}}`;
      } else s += js[i++];
    }
    i++;
    return s;
  };
  /** Skips a ${…} part up to its closing brace, with strings and templates inside it. */
  const expression = () => {
    let depth = 1;
    while (i < n && depth) {
      const c = js[i];
      if (c === '"' || c === "'") quoted();
      else if (c === '`') template();
      else {
        if (c === '{') depth++;
        else if (c === '}') depth--;
        i++;
      }
    }
  };
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
      out.push(quoted());
      prev = 'str';
    } else if (c === '`') {
      out.push(template());
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
      prev = c;
      i++;
    }
  }
  return out;
}

/** Utilities that are bare words. */
const UTILITIES = /^(flex|grid|block|inline|inline-flex|inline-block|hidden|contents|relative|absolute|fixed|sticky|static|truncate|italic|underline|uppercase|lowercase|capitalize|grow|shrink|border|rounded|shadow|ring|outline|transition|transform|group|peer|container|prose|tnum|ico|isolate|invisible|visible|antialiased|select-none|resize|break-words)$/;

/** A token of a class list: lowercase, with Tailwind's dashes, colons, brackets and the like. */
const CLASSY = /^[!-]?[a-z0-9@&\[\]:._\/()%#,'"=*+>~-]+$/;
/**
 * Whether a string reads as words someone is shown. `jsx`: a piece of JSX text, or a pattern around values,
 * where a single lowercase word is text too ("{0} prompts", " more files").
 */
function isText(s, jsx = false) {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length < 2 || t.length > 400 || !/[A-Za-z]/.test(t)) return false;
  const bare = t.replace(/\{\d+\}/g, '');
  if (!/[A-Za-z]{2}/.test(bare)) return false;
  if (/^(https?:|\/|\.\/|#|data:|mailto:)/.test(t) || /:\/\//.test(t)) return false;
  if (/=>|===|!==|&&|\|\||\$\(|\bfunction\b|\breturn\b|^\w+\(|\)\s*\{|@__PURE__|\bjsxs?\(|className:|children:|;\s*(const|let|var|if|for)\b/.test(t)) return false;
  if (/^[MmLlHhVvCcSsQqTtAaZz0-9 .,-]+$/.test(t)) return false;
  if (/^(color-mix|translate|rgba?|hsla?|var|calc|url|linear-gradient)\(/.test(t)) return false;
  const tokens = bare.split(' ').filter(Boolean);
  // A list of classes (Tailwind's): lowercase tokens, most of them utilities (a dash, colon or bracket inside
  // them, or a bare utility's name). A sentence ending in "read:" or holding a "re-run" is not one.
  const utility = (k) => /[-:\[\/](?!$)/.test(k.replace(/[.,;:!?)]+$/, '').replace(/^\(/, '')) || UTILITIES.test(k);
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
  for (const s of literals(js)) add(s, path.relative(ROOT, f));
  for (const s of sentences(js)) typeof s === 'string' ? add(s, path.relative(ROOT, f), true) : add(s.jsx, path.relative(ROOT, f), true);
}
// The server's messages that show in the pages: errors (HttpError) and the names and lines of what ships.
for (const f of files(path.join(ROOT, 'server'), /\.ts$/)) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/new HttpError\(\s*\d+\s*,\s*((['"`])(?:(?!\2)[^\\]|\\.)*\2)/g)) for (const s of literals(m[1])) add(s, path.relative(ROOT, f));
}
for (const f of ['server/assistants/builtins.ts', 'server/apps/templates.ts']) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  for (const m of src.matchAll(/\b(name|label|description|placeholder|help|title)\s*:\s*((['"`])(?:(?!\3)[^\\]|\\.)*\3)/g)) for (const s of literals(m[2])) add(s, f);
}
for (const f of fs.readdirSync(path.join(ROOT, 'catalog/connections')).filter((x) => x.endsWith('.json'))) {
  const e = JSON.parse(fs.readFileSync(path.join(ROOT, 'catalog/connections', f), 'utf8'));
  for (const s of [e.description, ...(e.fields ?? []).flatMap((x) => [x.label, x.help])]) if (typeof s === 'string') add(s, `catalog/connections/${f}`);
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
