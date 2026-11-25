// Fallback extents when no grammar is available: brace matching (TS/JS/Rust) and indentation (Python).
// Everything produced here is marked `heuristic: true`.
import { family } from './grammar.mjs';
import { declLineRegex, escapeRe } from './search.mjs';

// `<`, `>` and `}` are deliberately absent: `</span>` and `<br />` in JSX must not start a regex
const REGEX_PREV = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', ';', '+', '-', '*', '%', '~', '^']);
const REGEX_KW = /(?:^|[^\w$])(return|typeof|case|do|else|in|of|void|throw|delete|new|yield|await)$/;

// Returns the offset just after the declaration that starts at `start` (a TS/JS/Rust declaration).
export function braceEnd(src, lang, start) {
  const rust = family(lang) === 'rs';
  const n = src.length;
  let i = start;
  let paren = 0; let brace = 0; let seenBrace = false;
  let lastSig = ''; // last significant char
  let lastSigIdx = start;
  const peekLineEnd = (j) => {
    while (j < n && (src[j] === ' ' || src[j] === '\t' || src[j] === '\r')) j++;
    return j;
  };
  const skipString = (q) => {
    // i points at opening quote; a quote with no partner on its line is stray text (e.g. an apostrophe in JSX text)
    const open = i;
    i++;
    while (i < n && src[i] !== q) {
      if (src[i] === '\\') i++;
      else if (src[i] === '\n') { i = open + 1; return; }
      i++;
    }
    i++;
  };
  const skipTemplate = () => {
    i++;
    while (i < n && src[i] !== '`') {
      if (src[i] === '\\') { i += 2; continue; }
      if (src[i] === '$' && src[i + 1] === '{') {
        i += 2; let d = 1;
        while (i < n && d > 0) {
          const c = src[i];
          if (c === '{') d++; else if (c === '}') { d--; if (d === 0) break; }
          else if (c === '`') { skipTemplate(); continue; }
          else if (c === '"' || c === "'") { skipString(c); continue; }
          i++;
        }
        i++;
        continue;
      }
      i++;
    }
    i++;
  };
  const skipBlockComment = () => {
    if (rust) {
      let d = 0;
      while (i < n) {
        if (src[i] === '/' && src[i + 1] === '*') { d++; i += 2; } else if (src[i] === '*' && src[i + 1] === '/') { d--; i += 2; if (d === 0) return; } else i++;
      }
    } else {
      const e = src.indexOf('*/', i + 2); i = e < 0 ? n : e + 2;
    }
  };
  const skipRegex = () => {
    i++; let inClass = false;
    while (i < n && src[i] !== '\n') {
      const c = src[i];
      if (c === '\\') { i += 2; continue; }
      if (c === '[') inClass = true; else if (c === ']') inClass = false;
      else if (c === '/' && !inClass) { i++; while (i < n && /[a-z]/i.test(src[i])) i++; return; }
      i++;
    }
  };
  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { skipBlockComment(); continue; }
    if (c === '"') { skipString('"'); lastSig = '"'; continue; }
    if (rust && c === 'r' && (src[i + 1] === '"' || src[i + 1] === '#') && !/[\w$]/.test(src[i - 1] || ' ')) {
      const m = /^r(#*)"/.exec(src.slice(i, i + 80));
      if (m) {
        const close = '"' + m[1];
        const e = src.indexOf(close, i + m[0].length);
        i = e < 0 ? n : e + close.length; lastSig = '"'; continue;
      }
    }
    if (c === "'") {
      if (rust) {
        const m = /^'(?:\\[^']*|[^\\'])'/.exec(src.slice(i, i + 12));
        if (m) { i += m[0].length; lastSig = "'"; continue; }
        i++; continue; // lifetime
      }
      skipString("'"); lastSig = "'"; continue;
    }
    if (!rust && c === '`') { skipTemplate(); lastSig = '`'; continue; }
    if (!rust && c === '/') {
      const before = src.slice(Math.max(0, lastSigIdx - 12), lastSigIdx + 1);
      if (lastSig === '' || REGEX_PREV.has(lastSig) || REGEX_KW.test(before)) { skipRegex(); lastSig = '/'; lastSigIdx = i; continue; }
    }
    if (c === '(' || c === '[') { paren++; }
    else if (c === ')' || c === ']') { paren = Math.max(0, paren - 1); }
    else if (c === '{') { brace++; seenBrace = true; }
    else if (c === '}') {
      brace--;
      if (brace <= 0 && paren === 0) {
        if (brace < 0) return i; // closed an enclosing block: declaration ended before it
        let j = peekLineEnd(i + 1);
        const nc = src[j];
        if (nc === ';') return j + 1;
        if (j >= n || nc === '\n' || nc === ',' || (nc === '/' && (src[j + 1] === '/' || src[j + 1] === '*'))) return i + 1;
        if (nc === '{' || nc === ':' || nc === '.' || nc === '?' || nc === '|' || nc === '&' || nc === '=' || nc === 'a' || nc === ')' && false) { /* continue scanning */ }
        else return i + 1;
      }
    } else if (c === ';' && paren === 0 && brace === 0) return i + 1;
    else if (c === '\n' && paren === 0 && brace === 0 && !seenBrace && !rust) {
      // expression-bodied declaration without semicolon
      let j = i + 1;
      while (j < n && /\s/.test(src[j])) j++;
      const nxt = src[j];
      if (lastSig !== '' && !'=,(+-*/%&|?:.<>{['.includes(lastSig) && !(nxt && '.?:+-*/&|=)]>'.includes(nxt) && !(nxt === '=' || nxt === '?'))) return i;
    }
    if (!/\s/.test(c)) { lastSig = c; lastSigIdx = i; }
    i++;
  }
  return n;
}

// Python: end row (0-based, inclusive) of the statement beginning at row `r`.
export function indentEnd(lines, r) {
  const indentOf = (s) => { let k = 0; for (const ch of s) { if (ch === ' ') k++; else if (ch === '\t') k += 8; else break; } return k; };
  const base = indentOf(lines[r]);
  let triple = null; let depth = 0; let cont = false;
  let end = r; let first = true;
  for (let k = r; k < lines.length; k++) {
    const line = lines[k];
    const atStart = !triple && depth === 0 && !cont;
    const blank = /^\s*$/.test(line) || /^\s*#/.test(line);
    if (atStart && !first) {
      if (blank) continue;
      if (indentOf(line) <= base) break;
    }
    first = false;
    // scan the line for strings / brackets / comments
    cont = false;
    let i = 0;
    let codeSeen = false;
    while (i < line.length) {
      if (triple) {
        const e = line.indexOf(triple, i);
        if (e < 0) { i = line.length; break; }
        i = e + 3; triple = null; continue;
      }
      const c = line[i];
      if (c === '#') break;
      if (c === '"' || c === "'") {
        if (line.startsWith(c.repeat(3), i)) { triple = c.repeat(3); i += 3; codeSeen = true; continue; }
        let j = i + 1;
        while (j < line.length && line[j] !== c) { if (line[j] === '\\') j++; j++; }
        i = j + 1; codeSeen = true; continue;
      }
      if (c === '(' || c === '[' || c === '{') depth++;
      else if (c === ')' || c === ']' || c === '}') depth = Math.max(0, depth - 1);
      if (!/\s/.test(c)) codeSeen = true;
      i++;
    }
    if (!triple && depth === 0 && /\\\s*$/.test(line)) cont = true;
    if (codeSeen || triple) end = k;
  }
  return end;
}

function pyDecoratorStart(lines, r) {
  // multi-line decorator: an '@' line above whose brackets stay open until the line directly above `r`
  for (let k = r - 2; k >= Math.max(0, r - 15); k--) {
    if (!/^\s*@/.test(lines[k])) continue;
    let depth = 0; let ok = true;
    for (let j = k; j < r && ok; j++) {
      for (const ch of lines[j].replace(/(["'])(?:\\.|(?!\1).)*\1/g, '')) { if ('([{'.includes(ch)) depth++; else if (')]}'.includes(ch)) depth--; }
      if (j < r - 1 && depth <= 0) ok = false;
    }
    if (ok && depth === 0) return k;
    return r;
  }
  return r;
}

// rows that begin inside a triple-quoted string
function pyStringRows(lines) {
  const inStr = new Array(lines.length).fill(false);
  let triple = null;
  for (let k = 0; k < lines.length; k++) {
    if (triple) inStr[k] = true;
    const line = lines[k];
    let i = 0;
    while (i < line.length) {
      if (triple) { const e = line.indexOf(triple, i); if (e < 0) break; i = e + 3; triple = null; continue; }
      const c = line[i];
      if (c === '#') break;
      if (c === '"' || c === "'") {
        if (line.startsWith(c.repeat(3), i)) { triple = c.repeat(3); i += 3; continue; }
        let j = i + 1;
        while (j < line.length && line[j] !== c) { if (line[j] === '\\') j++; j++; }
        i = j + 1; continue;
      }
      i++;
    }
  }
  return inStr;
}

function attachedAbove(lines, row, lang) {
  const fam = family(lang);
  let r = row;
  while (r > 0) {
    const t = lines[r - 1].trim();
    if (fam === 'py') {
      if (t.startsWith('@') || t.startsWith('#')) { r--; continue; }
      const k = pyDecoratorStart(lines, r);
      if (k < r) { r = k; continue; }
      break;
    }
    if (fam === 'rs') { if (t.startsWith('#[') || (t.startsWith('///') ) || t.startsWith('/**') || t.startsWith('*') || t.startsWith('//') && !t.startsWith('//!')) { r--; continue; } break; }
    if (t.startsWith('@') || t.startsWith('//') || t.startsWith('/*') || t.startsWith('*')) { r--; continue; }
    break;
  }
  return r;
}

function heurKind(line, fam) {
  if (fam === 'py') {
    if (/^\s*(?:async\s+)?def\b/.test(line)) return 'function';
    if (/^\s*class\b/.test(line)) return 'class';
    return 'variable';
  }
  if (fam === 'rs') {
    const m = /\b(fn|struct|enum|union|trait|type|const|static|mod|macro_rules!)\b/.exec(line);
    if (m) return m[1] === 'fn' ? 'function' : m[1] === 'macro_rules!' ? 'macro' : m[1];
    return 'item';
  }
  const m = /\b(function|class|interface|type|enum|namespace|module|const|let|var)\b/.exec(line);
  if (m) return m[1] === 'let' || m[1] === 'var' ? 'variable' : m[1] === 'module' ? 'namespace' : m[1];
  return 'method';
}

// Find declarations of `name` heuristically.
export function findDeclsHeuristic(ctx, name, { qualified }) {
  const { lines, src, lang } = ctx;
  const fam = family(lang);
  const re = declLineRegex(lang, name);
  const word = new RegExp(`(?<![\\w$])${escapeRe(name)}(?![\\w$])`);
  if (!re) return [];
  const offsets = [];
  let off = 0;
  for (const l of lines) { offsets.push(off); off += l.length + 1; }
  const out = [];
  const inStr = fam === 'py' ? pyStringRows(lines) : null;
  for (let r = 0; r < lines.length; r++) {
    const line = lines[r];
    if (inStr && inStr[r]) continue;
    if (!word.test(line) || !re.test(line)) continue;
    if (fam !== 'py') {
      const kw = /\b(function|class|interface|type|enum|namespace|module|const|let|var|fn|struct|union|trait|mod|static|macro_rules!)\b/.test(line);
      const asExport = /\bexport\b/.test(line) && new RegExp(`\\bas\\s+${escapeRe(name)}\\b`).test(line);
      if (!kw && !asExport && !/\{\s*$/.test(line)) continue; // method-like lines must open a block
      if (/^\s*(?:return|if|for|while|switch|else|await|throw|new)\b/.test(line)) continue;
    }
    let endRow;
    if (fam === 'py') {
      if (/^\s*(?:async\s+def|def|class)\b/.test(line) || true) endRow = indentEnd(lines, r);
    } else {
      const startOff = offsets[r];
      const e = braceEnd(src, lang, startOff);
      endRow = src.slice(0, Math.max(startOff, e - 1)).split('\n').length - 1;
      if (endRow < r) endRow = r;
    }
    const kind = heurKind(line, fam);
    const startRow = attachedAbove(lines, r, lang);
    const col = line.search(word);
    out.push({
      lang, name, kind, kinds: [kind], container: [], sep: fam === 'rs' ? '::' : '.',
      startRow, endRow, declRow: r, sigEndRow: null, exported: /^\s*(?:export|pub)\b/.test(line) ? (fam === 'rs' ? 'pub' : 'exported') : null,
      access: null, attrs: [], group: 'main', loc: /^\S/.test(line) || /^\s*(?:export|pub)/.test(line) ? 'top' : 'member',
      rank: 0, errors: false, nameIdx: offsets[r] + col, nameRow: r, decoratorCount: 0, nOverloads: 0,
      heuristic: true, qualifiedUnverified: !!qualified,
    });
    const d = out[out.length - 1];
    d.rank = d.loc === 'top' ? (d.exported ? 0 : 0.5) : 1.5;
  }
  return out;
}

export function outlineHeuristic(ctx) {
  const { lines, src, lang } = ctx;
  const fam = family(lang);
  const offsets = [];
  let off = 0;
  for (const l of lines) { offsets.push(off); off += l.length + 1; }
  const out = [];
  const push = (r, name, kind, depth, endRow) => {
    out.push({
      depth,
      decl: {
        lang, name, kind, kinds: [kind], container: [], sep: fam === 'rs' ? '::' : '.', startRow: attachedAbove(lines, r, lang), endRow,
        declRow: r, sigEndRow: null, exported: null, access: null, attrs: [], group: 'main', loc: 'top', rank: 0, errors: false,
        nameIdx: offsets[r], nameRow: r, decoratorCount: 0, nOverloads: 0, heuristic: true,
      },
    });
  };
  if (fam === 'py') {
    let classIndent = null;
    const inStr = pyStringRows(lines);
    for (let r = 0; r < lines.length; r++) {
      if (inStr[r]) continue;
      const m = /^(\s*)(?:async\s+)?(def|class)\s+([A-Za-z_]\w*)/.exec(lines[r]);
      if (!m) continue;
      const ind = m[1].length;
      if (ind === 0) { push(r, m[3], m[2] === 'def' ? 'function' : 'class', 0, indentEnd(lines, r)); classIndent = m[2] === 'class' ? 0 : null; }
      else if (classIndent !== null && ind > classIndent && m[2] === 'def') {
        // only direct members: indentation equals first member indentation
        push(r, m[3], 'method', 1, indentEnd(lines, r));
      }
    }
    return out;
  }
  const re = fam === 'rs'
    ? /^(?:pub(?:\([^)]*\))?\s+)?(?:(?:async|unsafe|const|extern(?:\s+"[^"]*")?)\s+)*(fn|struct|enum|union|trait|type|const|static|mod|macro_rules!)\s*([A-Za-z_]\w*)/
    : /^(?:export\s+)?(?:default\s+)?(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(function\*?|class|interface|type|enum|namespace|const|let|var)\s+([A-Za-z_$][\w$]*)/;
  for (let r = 0; r < lines.length; r++) {
    const m = re.exec(lines[r]);
    if (!m) continue;
    const e = braceEnd(src, lang, offsets[r]);
    let endRow = src.slice(0, Math.max(offsets[r], e - 1)).split('\n').length - 1;
    if (endRow < r) endRow = r;
    let kind = m[1].replace('*', '');
    if (kind === 'fn') kind = 'function'; if (kind === 'let' || kind === 'var') kind = 'variable';
    push(r, m[2], kind, 0, endRow);
    // skip over the body so nested items are not listed
    r = endRow;
  }
  return out;
}
