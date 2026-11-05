// Reading JSON while it is still being written. An agent's tool call arrives a piece at a time (Claude Code's
// input_json_delta), and what has come so far is the start of a JSON text whose strings, arrays and objects are still
// open. readPartial reads such a start as far as it can be read: whatever is open is closed where the text stops; a
// key still without its value, and a number or a word (true, null) that may yet go on, are left out; a string cut
// short keeps what it has (an escape cut short left out). It says where the text stopped: the path to the value still
// being written, and whether that is a string. What it reads is only ever data: nothing in it runs or becomes markup.

/** A place in a JSON value: object keys and array indexes, from the top. */
export type JsonPath = (string | number)[];

export interface PartialJson {
  /** What could be read (undefined when nothing could yet). */
  value: unknown;
  /** Where the text stopped: the path of the innermost value still open; null when the text is a whole JSON value. */
  open: JsonPath | null;
  /** The text stopped inside a string value (its words still coming). */
  inString: boolean;
}

const ESC: Record<string, string> = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', '/': '/', '\\': '\\', '"': '"' };
/** Left out: a value cut short (a number or a word that may yet go on), or nothing at all. */
const SKIP = Symbol('skip');

/** Reads the start of a JSON text (see above). Never throws: what it cannot read it leaves out, and stops there. */
export function readPartial(text: string): PartialJson {
  const n = text.length;
  let i = 0;
  let open: JsonPath | null = null;
  let inString = false;
  const path: JsonPath = [];
  // Where the text stopped, innermost first (the first to say it wins).
  const stop = (str = false) => {
    if (open) return;
    open = [...path];
    inString = str;
  };
  const ws = () => {
    while (i < n) {
      const c = text.charCodeAt(i);
      if (c === 32 || c === 10 || c === 13 || c === 9) i++;
      else break;
    }
  };

  /** A string at its opening quote: its text, and whether it was closed. */
  const str = (): { s: string; done: boolean } => {
    i++;
    let out = '';
    while (i < n) {
      const c = text[i];
      if (c === '"') {
        i++;
        return { s: out, done: true };
      }
      if (c === '\\') {
        if (i + 1 >= n) break;
        const e = text[i + 1];
        if (e === 'u') {
          if (i + 6 > n) break;
          const code = parseInt(text.slice(i + 2, i + 6), 16);
          if (!Number.isNaN(code)) out += String.fromCharCode(code);
          i += 6;
        } else {
          out += ESC[e] ?? e;
          i += 2;
        }
        continue;
      }
      // A run of plain characters at once.
      let j = i + 1;
      while (j < n && text[j] !== '"' && text[j] !== '\\') j++;
      out += text.slice(i, j);
      i = j;
    }
    i = n;
    // Half of a character written as two escapes (an emoji) waits for its other half.
    const last = out.charCodeAt(out.length - 1);
    if (last >= 0xd800 && last <= 0xdbff) out = out.slice(0, -1);
    return { s: out, done: false };
  };

  const value = (): unknown => {
    ws();
    if (i >= n) return SKIP;
    const c = text[i];
    if (c === '"') {
      const r = str();
      if (!r.done) stop(true);
      return r.s;
    }
    if (c === '{') return obj();
    if (c === '[') return arr();
    // A number or a word: left out while it may go on (the text ends right after it).
    const m = /^(?:-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/.exec(text.slice(i, i + 64));
    if (!m || i + m[0].length >= n) {
      i = n;
      stop();
      return SKIP;
    }
    i += m[0].length;
    return m[0] === 'true' ? true : m[0] === 'false' ? false : m[0] === 'null' ? null : Number(m[0]);
  };

  const obj = (): Record<string, unknown> => {
    i++;
    const o: Record<string, unknown> = {};
    for (;;) {
      ws();
      if (i >= n) {
        stop();
        return o;
      }
      const c = text[i];
      if (c === '}') {
        i++;
        return o;
      }
      if (c === ',') {
        i++;
        continue;
      }
      if (c !== '"') {
        // Not JSON from here on: read as far as it went.
        i = n;
        stop();
        return o;
      }
      const k = str();
      ws();
      if (!k.done || i >= n || text[i] !== ':') {
        i = n;
        stop();
        return o;
      }
      i++;
      ws();
      if (i >= n) {
        stop();
        return o;
      }
      path.push(k.s);
      const v = value();
      path.pop();
      // A key the agent wrote twice: the later value counts, as JSON.parse has it.
      if (v !== SKIP) o[k.s] = v;
      if (i >= n) {
        stop();
        return o;
      }
    }
  };

  const arr = (): unknown[] => {
    i++;
    const a: unknown[] = [];
    for (;;) {
      ws();
      if (i >= n) {
        stop();
        return a;
      }
      const c = text[i];
      if (c === ']') {
        i++;
        return a;
      }
      if (c === ',') {
        i++;
        continue;
      }
      path.push(a.length);
      const v = value();
      path.pop();
      if (v !== SKIP) a.push(v);
      if (i >= n) {
        stop();
        return a;
      }
    }
  };

  const v = value();
  if (v === SKIP) return { value: undefined, open: [], inString: false };
  ws();
  // Whole only when nothing was cut short and nothing is left open.
  return { value: v, open, inString };
}

/** Whether `p` is inside (or is) the place `at` names: ['slides', 3, 'title'] is inside ['slides', 3] and ['slides']. */
export const within = (p: JsonPath | null, at: JsonPath): boolean => !!p && p.length >= at.length && at.every((k, i) => p[i] === k);
