// Tool calls written into a reply's text, for models (or servers) that return no OpenAI tool_calls:
// Hermes-style <tool_call>{json}</tool_call>, Qwen3-Coder and LFM3's <tool_call><function=…> XML, LFM2's
// <|tool_call_start|>[f(a=1)]<|tool_call_end|>, Mistral's [TOOL_CALLS][…], or a bare JSON call. Also a
// filter that keeps that markup and <think> blocks out of the text shown as it streams.

export interface ParsedCall {
  name: string;
  args: Record<string, unknown>;
}

/** JSON as models write it: in a code fence, with trailing commas, Python's True/False/None. */
export function looseJson(s: string): unknown {
  const t = s
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  for (const v of [t, t.replace(/,\s*([}\]])/g, '$1').replace(/\bTrue\b/g, 'true').replace(/\bFalse\b/g, 'false').replace(/\bNone\b/g, 'null')])
    try {
      return JSON.parse(v);
    } catch {}
  // A reply cut off inside the object: close what is open.
  let depth = 0;
  let str = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (str) {
      if (c === '\\') i++;
      else if (c === '"') str = false;
    } else if (c === '"') str = true;
    else if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') depth--;
  }
  if (depth > 0 && depth < 6)
    try {
      return JSON.parse(t + (str ? '"' : '') + '}'.repeat(depth));
    } catch {}
  return undefined;
}

function fromObject(o: any): ParsedCall | null {
  if (!o || typeof o !== 'object') return null;
  const f = o.function && typeof o.function === 'object' ? o.function : o;
  const name = f.name ?? f.tool ?? f.tool_name;
  if (typeof name !== 'string' || !name) return null;
  let args = f.arguments ?? f.parameters ?? f.args ?? f.input ?? {};
  if (typeof args === 'string') args = looseJson(args) ?? { input: args };
  return { name, args: args && typeof args === 'object' ? args : {} };
}

/** <function=name><parameter=key>value</parameter>…</function> */
function fromXml(s: string): ParsedCall | null {
  const fn = /<function=([^>\s]+)\s*>([\s\S]*?)(<\/function>|$)/.exec(s);
  if (!fn) return null;
  const args: Record<string, unknown> = {};
  for (const p of fn[2].matchAll(/<parameter=([^>\s]+)\s*>([\s\S]*?)(<\/parameter>|(?=<parameter=)|$)/g)) {
    const raw = p[2].replace(/^\n/, '').replace(/\n$/, '');
    const v = /^\s*[[{\d-]|^\s*(true|false|null)\s*$/.test(raw) ? looseJson(raw) : undefined;
    args[p[1]] = v === undefined ? raw : v;
  }
  return { name: fn[1], args };
}

/** Python call syntax: [read_file(path="a.txt", limit=20), list_dir()] */
function fromPython(src: string): ParsedCall[] {
  let i = 0;
  const ws = () => {
    while (i < src.length && /\s/.test(src[i])) i++;
  };
  const value = (): unknown => {
    ws();
    const c = src[i];
    if (c === '"' || c === "'") {
      const q = src.startsWith(c.repeat(3), i) ? c.repeat(3) : c;
      i += q.length;
      let out = '';
      while (i < src.length && !src.startsWith(q, i)) {
        if (src[i] === '\\' && i + 1 < src.length) {
          const n = src[i + 1];
          out += n === 'n' ? '\n' : n === 't' ? '\t' : n;
          i += 2;
        } else out += src[i++];
      }
      i += q.length;
      return out;
    }
    if (c === '[' || c === '(') {
      const close = c === '[' ? ']' : ')';
      i++;
      const arr: unknown[] = [];
      for (ws(); i < src.length && src[i] !== close; ws()) {
        arr.push(value());
        ws();
        if (src[i] === ',') i++;
      }
      i++;
      return arr;
    }
    if (c === '{') {
      i++;
      const obj: Record<string, unknown> = {};
      for (ws(); i < src.length && src[i] !== '}'; ws()) {
        const k = String(value());
        ws();
        if (src[i] === ':') i++;
        obj[k] = value();
        ws();
        if (src[i] === ',') i++;
      }
      i++;
      return obj;
    }
    const m = /^(-?\d+(\.\d+)?([eE][-+]?\d+)?|True|False|None|true|false|null)/.exec(src.slice(i));
    if (m) {
      i += m[0].length;
      return m[0] === 'True' || m[0] === 'true' ? true : m[0] === 'False' || m[0] === 'false' ? false : m[0] === 'None' || m[0] === 'null' ? null : Number(m[0]);
    }
    // A bare word: take it as text.
    const w = /^[^,)\]}\s]+/.exec(src.slice(i));
    i += w ? w[0].length : 1;
    return w?.[0] ?? '';
  };
  const calls: ParsedCall[] = [];
  ws();
  if (src[i] === '[') i++;
  while (i < src.length) {
    ws();
    const name = /^[A-Za-z_][\w.-]*/.exec(src.slice(i));
    if (!name) break;
    i += name[0].length;
    ws();
    if (src[i] !== '(') break;
    i++;
    const args: Record<string, unknown> = {};
    for (ws(); i < src.length && src[i] !== ')'; ws()) {
      const k = /^([A-Za-z_]\w*)\s*=/.exec(src.slice(i));
      if (!k) break;
      i += k[0].length;
      args[k[1]] = value();
      ws();
      if (src[i] === ',') i++;
    }
    i++;
    calls.push({ name: name[0], args });
    ws();
    if (src[i] === ',') i++;
    ws();
    if (src[i] === ']') break;
  }
  return calls;
}

/** The tool calls in a reply's text (only tools the agent has, so prose about tools is left alone). */
export function parseCalls(text: string, known: Set<string>): ParsedCall[] {
  const out: ParsedCall[] = [];
  for (const m of text.matchAll(/<tool_call>([\s\S]*?)(<\/tool_call>|$)/g)) {
    const body = m[1].trim();
    if (!body) continue;
    const c = body.startsWith('{') ? fromObject(looseJson(body)) : fromXml(body);
    if (c) out.push(c);
  }
  for (const m of text.matchAll(/<\|tool_call_start\|>([\s\S]*?)(<\|tool_call_end\|>|$)/g)) {
    const body = m[1].trim();
    const j = body.startsWith('[{') || body.startsWith('{') ? looseJson(body) : undefined;
    if (j) for (const o of Array.isArray(j) ? j : [j]) out.push(...[fromObject(o)].filter((x): x is ParsedCall => !!x));
    else out.push(...fromPython(body));
  }
  if (!out.length) {
    // A bare list of calls, [read_file(path="a")] (LFM2's format, its markers stripped by the server):
    // parsed from where it opens, so a ")]" inside an argument does not end it.
    const at = bareCallAt(text, known);
    if (at >= 0) out.push(...fromPython(text.slice(at)).filter((c) => known.has(c.name)));
  }
  const mistral = /\[TOOL_CALLS\]\s*(\[[\s\S]*\]|\{[\s\S]*\})/.exec(text);
  if (mistral) {
    const j = looseJson(mistral[1]);
    for (const o of Array.isArray(j) ? j : [j]) {
      const c = fromObject(o);
      if (c) out.push(c);
    }
  }
  if (!out.length && !/<function=/.test(text)) {
    // A reply that is only a JSON call (in a fence or not).
    const t = text.trim();
    if (/^(```(json)?\s*)?[[{]/.test(t)) {
      const j = looseJson(t);
      for (const o of Array.isArray(j) ? j : [j]) {
        const c = fromObject(o);
        if (c && known.has(c.name)) out.push(c);
      }
    }
  } else if (!out.length) {
    const c = fromXml(text);
    if (c) out.push(c);
  }
  return out.filter((c) => known.has(c.name) || known.has(c.name.replace(/^functions?\./, '')));
}

/** Where a bare call list to a known tool opens (at the start of a line), or -1. */
function bareCallAt(text: string, known: Set<string>): number {
  for (const m of text.matchAll(/(^|\n)\s*\[\s*([A-Za-z_][\w.]*)\s*\(/g)) if (known.has(m[2])) return m.index! + m[1].length;
  return -1;
}

/** The reply's text without tool-call markup and thoughts. */
export function stripMarkup(text: string): string {
  return text
    .replace(/<think>[\s\S]*?(<\/think>|$)/g, '')
    .replace(/<tool_call>[\s\S]*?(<\/tool_call>|$)/g, '')
    .replace(/<\|tool_call_start\|>[\s\S]*?(<\|tool_call_end\|>|$)/g, '')
    .replace(/\[TOOL_CALLS\][\s\S]*$/, '')
    .replace(/(^|\n)\s*\[\s*[A-Za-z_][\w.]*\s*\([\s\S]*$/, '$1')
    .trim();
}

const OPEN: [string, string, 'think' | 'call'][] = [
  ['<think>', '</think>', 'think'],
  ['<tool_call>', '</tool_call>', 'call'],
  ['<|tool_call_start|>', '<|tool_call_end|>', 'call'],
  ['[TOOL_CALLS]', '\u0000', 'call'],
];

/** Splits streamed text into what to show and thoughts, holding back what may be the start of a tag. */
export class StreamFilter {
  private buf = '';
  private mode: 'text' | 'think' | 'call' = 'text';
  private close = '';
  private start = true;
  private seen = 0;

  /** Openings of a bare call list, "[read_file(", for the tools the model has. */
  private calls: string[];

  constructor(
    private out: { text: (s: string) => void; thought: (s: string) => void },
    tools: string[] = [],
  ) {
    this.calls = tools.map((t) => `[${t}(`);
  }

  push(chunk: string) {
    this.buf += chunk;
    this.seen += chunk.length;
    this.drain(false);
  }

  end() {
    this.drain(true);
  }

  private emit(s: string) {
    if (!s) return;
    if (this.mode === 'think') this.out.thought(s);
    else if (this.mode === 'text') this.out.text(s);
  }

  private drain(final: boolean) {
    // Some models think first without an opening tag (the prompt held it): wait a little to see.
    if (this.start && this.mode === 'text') {
      const closeAt = this.buf.indexOf('</think>');
      const openAt = this.buf.indexOf('<think>');
      if (closeAt >= 0 && (openAt < 0 || closeAt < openAt)) {
        this.out.thought(this.buf.slice(0, closeAt));
        this.buf = this.buf.slice(closeAt + 8);
        this.start = false;
      } else if (openAt >= 0 || this.seen > 200 || final) this.start = false;
      else return;
    }
    for (;;) {
      if (this.mode === 'text') {
        let best: { at: number; o: (typeof OPEN)[number] } | null = null;
        for (const o of [...OPEN, ...this.calls.map((c): (typeof OPEN)[number] => [c, '\u0000', 'call'])]) {
          const at = this.buf.indexOf(o[0]);
          if (at >= 0 && (!best || at < best.at)) best = { at, o };
        }
        if (best) {
          this.emit(this.buf.slice(0, best.at));
          this.buf = this.buf.slice(best.at + best.o[0].length);
          this.mode = best.o[2];
          this.close = best.o[1];
          continue;
        }
        const hold = final ? 0 : holdBack(this.buf, [...OPEN.map((o) => o[0]), ...this.calls]);
        this.emit(this.buf.slice(0, this.buf.length - hold));
        this.buf = this.buf.slice(this.buf.length - hold);
        return;
      }
      const at = this.buf.indexOf(this.close);
      if (at >= 0) {
        this.emit(this.buf.slice(0, at));
        this.buf = this.buf.slice(at + this.close.length);
        this.mode = 'text';
        continue;
      }
      const hold = final ? 0 : holdBack(this.buf, [this.close]);
      this.emit(this.buf.slice(0, this.buf.length - hold));
      this.buf = this.buf.slice(this.buf.length - hold);
      return;
    }
  }
}

/** How much of the end of `s` could begin one of `tags`. */
function holdBack(s: string, tags: string[]): number {
  let n = 0;
  for (const t of tags) for (let k = Math.min(t.length - 1, s.length); k > n; k--) if (s.endsWith(t.slice(0, k))) n = k;
  return n;
}
