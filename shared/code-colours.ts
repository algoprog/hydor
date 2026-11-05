// Colours for the code in a page's code blocks (the page editor's pre.n-code), a small highlighter of our own: it tells
// the words of about twenty languages apart (keywords, strings, numbers, comments, names of functions and types, tags
// and attributes, keys) and wraps them in spans the page kit colours (shared/page-kit.ts), light or dark as the page is.
// A block's language is its data-lang (python, js…); without one, the highlighter tells it from the code.
//
// The page keeps its code as plain text: the colours are put on as it shows, by the kit's script in Use (and in a page
// saved as a file), and by the page editor as the code is written, which takes them off again before the page is kept.
// Like the kit's scripts, codeColours runs in the browser: its source is sent as text, so it uses only the browser's
// globals.

/** The highlighter: its languages, what it tells from code, and painting a block. */
export interface CodeColours {
  /** The languages to choose from: id and name, in the order a picker shows them. */
  langs: [string, string][];
  /** A language's id from what a block says (an alias such as "py" or "sh" too), or '' when it knows none by that name. */
  langId(name: string): string;
  /** The language some code looks like, or '' when it can't tell. */
  detect(text: string): string;
  /** Code as runs of words, each with what it is ('k' keyword, 's' string, 'n' number, 'c' comment, 'f' function, 't' type, 'a' attribute or key, 'g' tag, 'v' constant; '' plain). */
  tokens(text: string, lang: string): [string, string][];
  /** The code of a block as text: its lines' breaks as new lines, a last one a browser keeps for the caret left out. */
  textOf(pre: Element): string;
  /** Colours a block's code (its language, else the one it looks like): its words in spans the kit colours. */
  paint(pre: Element): void;
  /** Takes the colours off again, the code as plain text. */
  unpaint(pre: Element): void;
  /** Colours every code block in the page once it is read, and those a page's own script adds later (a page in Use). */
  run(): void;
}

export function codeColours(): CodeColours {
  // ---- the languages --------------------------------------------------------------------------------------------------
  interface Spec {
    /** Keywords, types and constants (true, null…), space-separated. */
    kw?: string;
    ty?: string;
    k2?: string;
    /** What starts a comment to the end of the line, and comments between two marks. */
    line?: string[];
    block?: [string, string][];
    /** The quotes strings are written between; triple-quoted strings (Python's). */
    quotes?: string;
    triple?: boolean;
    /** Keywords in any case (SQL's). */
    ci?: boolean;
    /** $names (the shell's, PHP's), @decorators, #include lines, Capitalised names as types. */
    dollar?: boolean;
    at?: boolean;
    hash?: boolean;
    caps?: boolean;
  }
  const C_KW = 'auto break case char const continue default do double else enum extern float for goto if inline int long register restrict return short signed sizeof static struct switch typedef union unsigned void volatile while';
  const JS_KW =
    'as async await break case catch class const continue debugger default delete do else export extends finally for from function get if import in instanceof let new of return set static super switch this throw try typeof var void while with yield';
  const SPECS: Record<string, Spec> = {
    js: { kw: JS_KW, k2: 'true false null undefined NaN Infinity', ty: 'Array Object String Number Boolean Promise Map Set Date Math JSON RegExp Error console window document', line: ['//'], block: [['/*', '*/']], quotes: '"\'`', caps: true },
    ts: {
      kw: `${JS_KW} abstract declare implements interface keyof namespace private protected public readonly type satisfies is infer`,
      k2: 'true false null undefined NaN Infinity',
      ty: 'string number boolean any unknown never void object bigint symbol Array Record Partial Promise Map Set Date',
      line: ['//'],
      block: [['/*', '*/']],
      quotes: '"\'`',
      caps: true,
    },
    python: {
      kw: 'and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case',
      k2: 'True False None self cls',
      ty: 'int float str bool list dict set tuple bytes object type range len print open super isinstance enumerate zip map filter sorted',
      line: ['#'],
      quotes: '"\'',
      triple: true,
      at: true,
      caps: true,
    },
    java: {
      kw: 'abstract assert break case catch class const continue default do else enum extends final finally for goto if implements import instanceof interface native new package private protected public return static strictfp super switch synchronized this throw throws transient try volatile while var record yield',
      k2: 'true false null',
      ty: 'boolean byte char double float int long short void String Object Integer List Map',
      line: ['//'],
      block: [['/*', '*/']],
      quotes: '"\'',
      at: true,
      caps: true,
    },
    kotlin: {
      kw: 'as break class continue do else for fun if in interface is object package return super this throw try typealias val var when while by catch constructor data enum finally get import init internal lateinit open override private protected public sealed set suspend',
      k2: 'true false null',
      ty: 'Int Long Double Float Boolean String Char Unit Any List Map',
      line: ['//'],
      block: [['/*', '*/']],
      quotes: '"\'',
      at: true,
      caps: true,
    },
    c: { kw: C_KW, k2: 'NULL true false', ty: 'size_t uint8_t uint16_t uint32_t uint64_t int8_t int16_t int32_t int64_t bool FILE', line: ['//'], block: [['/*', '*/']], quotes: '"\'', hash: true },
    cpp: {
      kw: `${C_KW} alignas alignof and auto bool catch class constexpr const_cast decltype delete dynamic_cast explicit export friend mutable namespace new noexcept not operator or private protected public reinterpret_cast static_assert static_cast template this throw try typeid typename using virtual`,
      k2: 'true false nullptr NULL',
      ty: 'std string vector map set size_t unique_ptr shared_ptr cout cin endl',
      line: ['//'],
      block: [['/*', '*/']],
      quotes: '"\'',
      hash: true,
      caps: true,
    },
    csharp: {
      kw: 'abstract as base break case catch checked class const continue default delegate do else enum event explicit extern finally fixed for foreach goto if implicit in interface internal is lock namespace new operator out override params private protected public readonly ref return sealed sizeof stackalloc static struct switch this throw try typeof unchecked unsafe using virtual volatile while var async await get set record init',
      k2: 'true false null',
      ty: 'bool byte char decimal double float int long object sbyte short string uint ulong ushort void String List Dictionary Task',
      line: ['//'],
      block: [['/*', '*/']],
      quotes: '"\'',
      hash: true,
      caps: true,
    },
    go: {
      kw: 'break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var',
      k2: 'true false nil iota',
      ty: 'bool byte complex64 complex128 error float32 float64 int int8 int16 int32 int64 rune string uint uint8 uint16 uint32 uint64 uintptr any make len cap append new panic fmt',
      line: ['//'],
      block: [['/*', '*/']],
      quotes: '"\'`',
      caps: true,
    },
    rust: {
      kw: 'as async await break const continue crate dyn else enum extern fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait type unsafe use where while',
      k2: 'true false None Some Ok Err',
      ty: 'i8 i16 i32 i64 i128 isize u8 u16 u32 u64 u128 usize f32 f64 bool char str String Vec Option Result Box HashMap',
      line: ['//'],
      block: [['/*', '*/']],
      quotes: '"',
      hash: true,
      caps: true,
    },
    swift: {
      kw: 'associatedtype class deinit enum extension fileprivate func import init inout internal let open operator private protocol public static struct subscript typealias var break case continue default defer do else fallthrough for guard if in repeat return switch where while as catch is rethrows throw throws try async await some any',
      k2: 'true false nil self Self',
      ty: 'Int Double Float Bool String Character Array Dictionary Set Optional Void',
      line: ['//'],
      block: [['/*', '*/']],
      quotes: '"',
      at: true,
      caps: true,
    },
    ruby: {
      kw: 'alias and begin break case class def defined? do else elsif end ensure for if in module next not or redo rescue retry return self super then undef unless until when while yield require attr_accessor attr_reader puts',
      k2: 'true false nil',
      line: ['#'],
      quotes: '"\'',
      at: true,
      caps: true,
    },
    php: {
      kw: 'abstract and array as break callable case catch class clone const continue declare default do echo else elseif empty enddeclare endfor endforeach endif endswitch endwhile extends final finally fn for foreach function global goto if implements include include_once instanceof insteadof interface isset list match namespace new or print private protected public readonly require require_once return static switch throw trait try unset use var while yield',
      k2: 'true false null TRUE FALSE NULL',
      line: ['//', '#'],
      block: [['/*', '*/']],
      quotes: '"\'',
      dollar: true,
      caps: true,
    },
    bash: {
      kw: 'if then else elif fi case esac for while until do done in function select time return exit export local readonly declare unset shift source alias echo printf read cd set test',
      k2: 'true false',
      ty: 'ls cat grep sed awk find sudo apt brew npm npx node pip python git curl wget mkdir rm cp mv chmod chown tar ssh docker make',
      line: ['#'],
      quotes: '"\'',
      dollar: true,
    },
    sql: {
      kw: 'select from where and or not insert into values update set delete create table view index drop alter add column primary key foreign references join left right inner outer full on group by order having limit offset as distinct union all case when then else end exists in is like between asc desc with returning default unique check constraint if begin commit rollback transaction',
      k2: 'null true false',
      ty: 'int integer bigint smallint text varchar char boolean date timestamp numeric decimal real float serial json jsonb uuid count sum avg min max coalesce now',
      line: ['--'],
      block: [['/*', '*/']],
      quotes: '\'"',
      ci: true,
    },
    lua: { kw: 'and break do else elseif end for function goto if in local not or repeat return then until while', k2: 'true false nil', ty: 'print pairs ipairs table string math require', line: ['--'], quotes: '"\'' },
  };
  /** The languages a picker offers, by name. */
  const LANGS: [string, string][] = [
    ['plain', 'Plain text'],
    ['bash', 'Bash'],
    ['c', 'C'],
    ['cpp', 'C++'],
    ['csharp', 'C#'],
    ['css', 'CSS'],
    ['diff', 'Diff'],
    ['go', 'Go'],
    ['html', 'HTML'],
    ['java', 'Java'],
    ['js', 'JavaScript'],
    ['json', 'JSON'],
    ['kotlin', 'Kotlin'],
    ['lua', 'Lua'],
    ['markdown', 'Markdown'],
    ['php', 'PHP'],
    ['python', 'Python'],
    ['ruby', 'Ruby'],
    ['rust', 'Rust'],
    ['sql', 'SQL'],
    ['swift', 'Swift'],
    ['ts', 'TypeScript'],
    ['yaml', 'YAML'],
  ];
  const ALIAS: Record<string, string> = {
    javascript: 'js',
    jsx: 'js',
    mjs: 'js',
    node: 'js',
    typescript: 'ts',
    tsx: 'ts',
    py: 'python',
    python3: 'python',
    sh: 'bash',
    shell: 'bash',
    zsh: 'bash',
    console: 'bash',
    'c++': 'cpp',
    cc: 'cpp',
    hpp: 'cpp',
    'c#': 'csharp',
    cs: 'csharp',
    golang: 'go',
    rs: 'rust',
    rb: 'ruby',
    kt: 'kotlin',
    yml: 'yaml',
    md: 'markdown',
    xml: 'html',
    svg: 'html',
    htm: 'html',
    patch: 'diff',
    text: 'plain',
    txt: 'plain',
    none: 'plain',
    postgres: 'sql',
    postgresql: 'sql',
    mysql: 'sql',
    sqlite: 'sql',
  };
  const langId = (name: string): string => {
    const n = String(name ?? '')
      .trim()
      .toLowerCase();
    const id = ALIAS[n] ?? n;
    return LANGS.some(([x]) => x === id) ? id : '';
  };
  const words = (s?: string) => new Set((s ?? '').split(' ').filter(Boolean));
  const sets = new Map<string, { kw: Set<string>; ty: Set<string>; k2: Set<string> }>();
  const setsOf = (id: string, sp: Spec) => {
    let x = sets.get(id);
    if (!x) sets.set(id, (x = { kw: words(sp.kw), ty: words(sp.ty), k2: words(sp.k2) }));
    return x;
  };

  // ---- tokens: [class, text], '' for plain ------------------------------------------------------------------------------
  type Tok = [string, string];
  // Patterns read where the code is at (sticky: no copy of the rest of the code at every word).
  const NUM = /(?:0[xX][\da-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|(?:\d[\d_]*\.?[\d_]*|\.\d[\d_]*)(?:[eE][+-]?\d+)?)[a-zA-Z]*/y;
  const IDENT = /[A-Za-z_$À-￿][\w$À-￿]*/y;
  const DOLLAR = /\$(?:\{[^}\n]*\}|[A-Za-z_]\w*|[0-9@#?*!$-])/y;
  const AT = /@[A-Za-z_][\w.]*/y;
  const CALL = /\s*\(/y;
  /** What a sticky pattern finds where the code is at, or null. */
  const at = (re: RegExp, s: string, i: number): string | null => {
    re.lastIndex = i;
    const m = re.exec(s);
    return m ? m[0] : null;
  };
  /** A string from its opening quote: to its closing one (or the line's end, for quotes that can't hold a new line). */
  const stringAt = (s: string, i: number, q: string, multi: boolean): number => {
    let j = i + q.length;
    while (j < s.length) {
      if (s[j] === '\\') j += 2;
      else if (s.startsWith(q, j)) return j + q.length;
      else if (s[j] === '\n' && !multi) return j;
      else j++;
    }
    return s.length;
  };
  const generic = (s: string, id: string, sp: Spec): Tok[] => {
    const out: Tok[] = [];
    const { kw, ty, k2 } = setsOf(id, sp);
    const push = (c: string, t: string) => {
      const last = out[out.length - 1];
      if (last && last[0] === c) last[1] += t;
      else out.push([c, t]);
    };
    let i = 0;
    let lineStart = true;
    while (i < s.length) {
      const ch = s[i];
      if (ch === '\n') {
        push('', ch);
        i++;
        lineStart = true;
        continue;
      }
      if (ch === ' ' || ch === '\t') {
        push('', ch);
        i++;
        continue;
      }
      const rest = s.slice(i, i + 3);
      // a line of the preprocessor (#include, #define) or a Rust attribute (#[derive])
      if (sp.hash && ch === '#' && (lineStart || s[i + 1] === '[')) {
        const end = s.indexOf('\n', i);
        const j = end < 0 ? s.length : end;
        push('k', s.slice(i, j));
        i = j;
        continue;
      }
      lineStart = false;
      const lc = sp.line?.find((m) => s.startsWith(m, i));
      if (lc && !(lc === '#' && sp.hash)) {
        const end = s.indexOf('\n', i);
        const j = end < 0 ? s.length : end;
        push('c', s.slice(i, j));
        i = j;
        continue;
      }
      const bc = sp.block?.find(([a]) => s.startsWith(a, i));
      if (bc) {
        const end = s.indexOf(bc[1], i + bc[0].length);
        const j = end < 0 ? s.length : end + bc[1].length;
        push('c', s.slice(i, j));
        i = j;
        continue;
      }
      if (sp.quotes?.includes(ch)) {
        const triple = sp.triple && (rest === '"""' || rest === "'''");
        const q = triple ? rest : ch;
        const j = stringAt(s, i, q, triple || ch === '`');
        push('s', s.slice(i, j));
        i = j;
        continue;
      }
      const dv = sp.dollar && ch === '$' ? at(DOLLAR, s, i) : null;
      if (dv) {
        push('v', dv);
        i += dv.length;
        continue;
      }
      const deco = sp.at && ch === '@' ? at(AT, s, i) : null;
      if (deco) {
        push('a', deco);
        i += deco.length;
        continue;
      }
      if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(s[i + 1] ?? ''))) {
        const m = at(NUM, s, i);
        if (m && !/[\w$]/.test(s[i - 1] ?? '')) {
          push('n', m);
          i += m.length;
          continue;
        }
      }
      const w = at(IDENT, s, i);
      if (w) {
        const key = sp.ci ? w.toLowerCase() : w;
        let c = '';
        if (kw.has(key)) c = 'k';
        else if (k2.has(key)) c = 'v';
        else if (ty.has(key)) c = 't';
        else if (at(CALL, s, i + w.length) !== null) c = 'f';
        else if (sp.caps && /^[A-Z][a-z0-9]\w*$/.test(w)) c = 't';
        push(c, w);
        i += w.length;
        continue;
      }
      push('', ch);
      i++;
    }
    return out;
  };
  const TAG = /<\/?[A-Za-z!?][\w:.-]*/y;
  const ATTR = /(\s+)|([^\s=>/"']+)|(=)|("[^"]*"?|'[^']*'?)|(\/)/y;
  const markup = (s: string): Tok[] => {
    const out: Tok[] = [];
    const push = (c: string, t: string) => t && out.push([c, t]);
    let i = 0;
    while (i < s.length) {
      if (s.startsWith('<!--', i)) {
        const e = s.indexOf('-->', i + 4);
        const j = e < 0 ? s.length : e + 3;
        push('c', s.slice(i, j));
        i = j;
        continue;
      }
      const tag = s[i] === '<' ? at(TAG, s, i) : null;
      if (tag) {
        push('', tag.startsWith('</') ? '</' : '<');
        push('g', tag.replace(/^<\/?/, ''));
        i += tag.length;
        const name = tag.replace(/^<\/?/, '').toLowerCase();
        // its attributes, to the end of the tag
        while (i < s.length && s[i] !== '>') {
          ATTR.lastIndex = i;
          const a = ATTR.exec(s);
          if (!a) {
            push('', s[i]);
            i++;
            continue;
          }
          push(a[2] ? 'a' : a[4] ? 's' : '', a[0]);
          i += a[0].length;
        }
        if (s[i] === '>') {
          push('', '>');
          i++;
        }
        // what a <script> or a <style> holds is coloured as JavaScript or CSS
        if (!tag.startsWith('</') && (name === 'script' || name === 'style')) {
          const end = s.toLowerCase().indexOf(`</${name}`, i);
          const j = end < 0 ? s.length : end;
          out.push(...(name === 'style' ? css(s.slice(i, j)) : generic(s.slice(i, j), 'js', SPECS.js)));
          i = j;
        }
        continue;
      }
      const j = s.indexOf('<', i + 1);
      const k = j < 0 ? s.length : j;
      // words between tags, their entities (&amp;) apart
      for (const part of s.slice(i, k).split(/(&[#\w]+;)/)) push(part.startsWith('&') ? 'v' : '', part);
      i = k;
    }
    return out;
  };
  const AT_RULE = /@[\w-]+/y;
  const PROP = /(?:--)?[a-zA-Z-]+(?=\s*:)/y;
  const VALUE = /#[\da-fA-F]{3,8}\b|-?(?:\d+\.?\d*|\.\d+)(?:%|[a-zA-Z]+)?|!important/y;
  const FUNC = /[a-zA-Z-]+(?=\()/y;
  const WORD = /[a-zA-Z-]+/y;
  const SELECTOR = /[^{}/@"']+/y;
  const css = (s: string): Tok[] => {
    const out: Tok[] = [];
    const push = (c: string, t: string) => t && out.push([c, t]);
    let depth = 0;
    let i = 0;
    /** The last character before `i` that is not a space: a property name follows a brace or a semicolon. */
    const before = () => {
      let j = i - 1;
      while (j >= 0 && /\s/.test(s[j])) j--;
      return j < 0 ? '' : s[j];
    };
    while (i < s.length) {
      const ch = s[i];
      if (s.startsWith('/*', i)) {
        const e = s.indexOf('*/', i + 2);
        const j = e < 0 ? s.length : e + 2;
        push('c', s.slice(i, j));
        i = j;
        continue;
      }
      if (ch === '"' || ch === "'") {
        const j = stringAt(s, i, ch, false);
        push('s', s.slice(i, j));
        i = j;
        continue;
      }
      if (ch === '{' || ch === '}') {
        depth += ch === '{' ? 1 : -1;
        push('', ch);
        i++;
        continue;
      }
      const rule = ch === '@' ? at(AT_RULE, s, i) : null;
      if (rule) {
        push('k', rule);
        i += rule.length;
        continue;
      }
      if (depth > 0) {
        const prop = at(PROP, s, i);
        if (prop && /^[{;]?$/.test(before())) {
          push('a', prop);
          i += prop.length;
          continue;
        }
        const v = at(VALUE, s, i);
        if (v) {
          push(v === '!important' ? 'k' : 'n', v);
          i += v.length;
          continue;
        }
        const f = at(FUNC, s, i);
        if (f) {
          push('f', f);
          i += f.length;
          continue;
        }
        const w = at(WORD, s, i);
        if (w) {
          push('', w);
          i += w.length;
          continue;
        }
      } else {
        const sel = at(SELECTOR, s, i);
        if (sel) {
          for (const part of sel.split(/([.#][\w-]+|:{1,2}[\w-]+)/)) push(/^[.#]/.test(part) ? 't' : /^:/.test(part) ? 'k' : /\w/.test(part) ? 'g' : '', part);
          i += sel.length;
          continue;
        }
      }
      push('', ch);
      i++;
    }
    return out;
  };
  const JSON_WORD = /-?\d+\.?\d*(?:[eE][+-]?\d+)?|(?:true|false|null)\b/y;
  const json = (s: string): Tok[] => {
    const out: Tok[] = [];
    let i = 0;
    while (i < s.length) {
      const ch = s[i];
      if (ch === '"') {
        const j = stringAt(s, i, '"', false);
        out.push([/^\s*:/.test(s.slice(j, j + 20)) ? 'a' : 's', s.slice(i, j)]);
        i = j;
        continue;
      }
      const m = at(JSON_WORD, s, i);
      if (m) {
        out.push([/^[tfn]/.test(m) ? 'v' : 'n', m]);
        i += m.length;
        continue;
      }
      out.push(['', ch]);
      i++;
    }
    return out;
  };
  /** Line by line: YAML, Markdown, a diff. */
  const lines = (s: string, id: string): Tok[] => {
    const out: Tok[] = [];
    for (const [n, ln] of s.split('\n').entries()) {
      if (n) out.push(['', '\n']);
      if (id === 'diff') {
        out.push([/^\+(?!\+\+)/.test(ln) ? 'i' : /^-(?!--)/.test(ln) ? 'd' : /^@@/.test(ln) ? 'f' : /^(\+\+\+|---|diff |index )/.test(ln) ? 'k' : '', ln]);
        continue;
      }
      if (id === 'markdown') {
        const h = /^(#{1,6}\s.*|\s*>.*)$/.exec(ln);
        if (h) {
          out.push([ln.trim().startsWith('>') ? 'c' : 'k', ln]);
          continue;
        }
        let rest = ln;
        const mark = /^(\s*(?:[-*+]|\d+[.)])\s(?:\[[ xX]\]\s)?)/.exec(rest);
        if (mark) {
          out.push(['v', mark[0]]);
          rest = rest.slice(mark[0].length);
        }
        for (const part of rest.split(/(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]*\]\([^)]*\))/)) out.push([part.startsWith('`') ? 's' : part.startsWith('**') ? 'k' : part.startsWith('[') ? 'f' : '', part]);
        continue;
      }
      // YAML: a comment, a key, a value
      const c = /^(\s*(?:-\s+)?)([^\s#:][^#:]*?)(\s*:)(\s|$)/.exec(ln);
      let rest = ln;
      if (c) {
        out.push(['', c[1]], ['a', c[2]], ['', c[3]]);
        rest = ln.slice(c[1].length + c[2].length + c[3].length);
      }
      const dash = !c ? /^\s*-\s+/.exec(rest) : null;
      if (dash) {
        out.push(['', dash[0]]);
        rest = rest.slice(dash[0].length);
      }
      const hash = rest.search(/(^|\s)#/);
      const val = hash < 0 ? rest : rest.slice(0, hash);
      const v = val.trim();
      const lead = val.slice(0, val.length - val.trimStart().length);
      const tail = val.slice(lead.length + v.length);
      out.push(['', lead], [/^(["']).*\1$/.test(v) ? 's' : /^-?\d+(\.\d+)?$/.test(v) ? 'n' : /^(true|false|null|yes|no|~)$/i.test(v) ? 'v' : /^[&*]\w+/.test(v) ? 'v' : '', v], ['', tail]);
      if (hash >= 0) out.push(['c', rest.slice(hash)]);
    }
    return out.filter((t) => t[1]);
  };
  const tokens = (s: string, id: string): Tok[] => {
    if (id === 'html') return markup(s);
    if (id === 'css') return css(s);
    if (id === 'json') return json(s);
    if (id === 'yaml' || id === 'markdown' || id === 'diff') return lines(s, id);
    const sp = SPECS[id];
    return sp ? generic(s, id, sp) : [['', s]];
  };

  // ---- telling a language from its code ---------------------------------------------------------------------------------
  const SIGNS: [string, RegExp[]][] = [
    ['diff', [/^(\+\+\+ |--- |@@ .* @@)/m, /^diff --git/m]],
    ['html', [/^\s*<(!doctype|html|head|body|div|span|p|a|ul|ol|li|section|svg|template|\?xml)\b/i, /<\/(div|span|p|a|li|body|html|section)>/i]],
    ['php', [/<\?php/, /\$\w+\s*=/, /\bfunction \w+\s*\(.*\$\w+/]],
    ['python', [/^\s*def \w+\s*\(.*\)\s*(->.*)?:\s*$/m, /^\s*(from \w[\w.]* )?import \w+/m, /\bself\./, /^\s*(elif|except|class \w+(\(.*\))?:)/m, /\bprint\(/, /\b(None|True|False)\b/]],
    ['ts', [/:\s*(string|number|boolean|any|unknown|void)\b/, /\binterface \w+\s*\{/, /\btype \w+\s*=/, /\bas const\b/, /<\w+>\(/]],
    ['js', [/\b(const|let|var)\s+\w+\s*=/, /=>/, /\bfunction\s*\w*\s*\(/, /\bconsole\.\w+\(/, /\b(document|window)\./, /\brequire\(|\bimport .* from ['"]/]],
    ['rust', [/\bfn \w+\s*[<(]/, /\blet mut\b/, /\bimpl\b.*\{/, /\w+!\(/, /::\w+/]],
    ['go', [/^package \w+/m, /\bfunc (\(.*\) )?\w+\(/, /:=/, /\bfmt\.\w+/]],
    ['java', [/\bpublic (static )?(class|void|final)\b/, /\bSystem\.out\./, /@Override/, /\bnew \w+\(.*\);/]],
    ['csharp', [/\busing System/, /\bnamespace \w+/, /\bConsole\.Write/, /\bpublic (async )?\w+ \w+\(/]],
    ['cpp', [/#include\s*<(iostream|vector|string|map|memory)>/, /\bstd::/, /\bcout\s*<</, /\btemplate\s*</]],
    ['c', [/#include\s*[<"]\w+\.h[>"]/, /\bprintf\(/, /\bint main\s*\(/, /\bmalloc\(/]],
    ['kotlin', [/\bfun \w+\(/, /\bval \w+\s*[:=]/, /\bprintln\(/]],
    ['swift', [/\bfunc \w+\(/, /\b(let|var) \w+:\s*\w+/, /\bimport (SwiftUI|UIKit|Foundation)/, /\bguard let\b/]],
    ['ruby', [/^\s*def \w+[^:]*$/m, /^\s*end\s*$/m, /\bputs\b/, /\.each do\b|\|\w+\|/, /\brequire ['"]/]],
    ['bash', [/^#!.*\b(ba|z)?sh\b/, /^\s*(sudo|apt|brew|npm|npx|pip|git|cd|ls|echo|export|curl|docker|mkdir)\b/m, /\$\{?\w+\}?/, /\b(fi|done|esac)\b/]],
    ['sql', [/\bselect\b[\s\S]*\bfrom\b/i, /\b(insert into|create table|update \w+ set|delete from)\b/i, /\b(where|join|group by|order by)\b/i]],
    ['css', [/^\s*[.#]?[\w-]+(\s*[,>+~]\s*[.#]?[\w-]+)*\s*\{/m, /^\s*[\w-]+\s*:\s*[^;{]+;\s*$/m, /@media\b/]],
    ['lua', [/\blocal \w+\s*=/, /\bfunction \w+\(.*\)\s*$/m, /^\s*end\s*$/m, /~=/]],
    ['markdown', [/^#{1,6} \w/m, /^\s*[-*] \[[ xX]\] /m, /\*\*\w[^*]*\*\*/, /\[[^\]]+\]\(https?:/]],
    ['yaml', [/^[\w-]+:\s*$/m, /^\s+[\w-]+:\s+\S/m, /^\s*-\s+[\w-]+:\s/m]],
  ];
  const detect = (text: string): string => {
    const s = text.slice(0, 6000);
    if (!s.trim()) return '';
    if (/^\s*[[{]/.test(s) && /[}\]]\s*$/.test(s)) {
      try {
        JSON.parse(s);
        return 'json';
      } catch {}
    }
    let best = '';
    let score = 0;
    let ties = 0;
    for (const [id, signs] of SIGNS) {
      const n = signs.reduce((a, re) => a + (re.test(s) ? 1 : 0), 0);
      if (n > score) {
        best = id;
        score = n;
        ties = 0;
      } else if (n && n === score) ties++;
    }
    // Two signs of a language, or one where no other language shows any (a line of code may look like several).
    return score >= 2 || (score === 1 && !ties) ? best : '';
  };

  // ---- a block on the page ----------------------------------------------------------------------------------------------
  const textOf = (pre: Element): string => {
    let s = '';
    const walk = (n: Node) => {
      for (const c of n.childNodes) {
        if (c.nodeType === 3) s += (c as Text).data;
        else if (c.nodeName === 'BR') s += '\n';
        else if (c.nodeType === 1) walk(c);
      }
    };
    walk(pre);
    // The line break a browser keeps at the end for the caret is no line of code.
    return pre.lastChild?.nodeName === 'BR' ? s.replace(/\n$/, '') : s;
  };
  const CLS: Record<string, string> = { k: 'n-ck', s: 'n-cs', n: 'n-cn', c: 'n-cc', f: 'n-cf', t: 'n-ct', a: 'n-ca', g: 'n-cg', v: 'n-cv', i: 'n-ci', d: 'n-cd' };
  const langOf = (pre: Element, text: string) => {
    const said = langId(pre.getAttribute('data-lang') ?? '');
    return said === 'plain' ? '' : said || detect(text);
  };
  const paint = (pre: Element) => {
    const text = textOf(pre);
    const id = langOf(pre, text);
    const f = document.createDocumentFragment();
    // Runs of one colour together, so the code is a few spans and words, not a node a letter.
    const runs: Tok[] = [];
    for (const [c0, t] of id ? tokens(text, id) : [['', text] as Tok]) {
      const c = CLS[c0] ? c0 : '';
      const last = runs[runs.length - 1];
      if (!t) continue;
      if (last && last[0] === c) last[1] += t;
      else runs.push([c, t]);
    }
    for (const [c, t] of runs) {
      if (!c) f.append(t);
      else {
        const span = document.createElement('span');
        span.className = CLS[c];
        span.textContent = t;
        f.append(span);
      }
    }
    pre.replaceChildren(f);
    // An empty last line shows, and holds a caret, by a line break after it (as a browser writes one).
    if (!text || text.endsWith('\n')) pre.append(document.createElement('br'));
  };
  const unpaint = (pre: Element) => {
    const text = textOf(pre);
    pre.replaceChildren(text);
  };
  const run = () => {
    const all = () => {
      for (const pre of document.querySelectorAll('pre.n-code')) paint(pre);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', all);
    else all();
  };
  return { langs: LANGS, langId, detect, tokens, textOf, paint, unpaint, run };
}

/** Puts a function's source in a <script> safely: nothing in it may end the element or open an HTML comment there. */
const scriptSafe = (src: string) => src.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');

/** The highlighter's source, for a script in a page. */
export const CODE_COLOURS_SRC = scriptSafe(codeColours.toString());

/** The script that colours a page's code blocks once it is read (a page in Use, one saved as a file). */
export const codeColoursScript = () => `<script>(${CODE_COLOURS_SRC})().run()</script>`;
