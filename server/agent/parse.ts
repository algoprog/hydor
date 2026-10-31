// Tool calls written into a reply's text, for models (or servers) that return no OpenAI tool_calls:
// Hermes-style <tool_call>{json}</tool_call>, Qwen3-Coder and LFM3's <tool_call><function=…> XML, GLM's
// <tool_call>name<arg_key>…, LFM2's <|tool_call_start|>[f(a=1)]<|tool_call_end|>, Mistral's [TOOL_CALLS]
// (a list, or name[ARGS]{…}), DeepSeek's and Kimi's own markers, gpt-oss's harmony channel, <invoke>
// XML, Llama's <|python_tag|>, a fenced or bare JSON call. Also a filter that keeps that markup and
// <think> blocks out of the text shown as it streams.
import { repairJson } from './repair.ts';

export interface ParsedCall {
  name: string;
  args: Record<string, unknown>;
}

/** JSON as models write it: in a code fence, with trailing commas, Python's True/False/None, cut off. */
export function looseJson(s: string): unknown {
  return repairJson(s).value;
}

function fromObject(o: any): ParsedCall | null {
  if (!o || typeof o !== 'object') return null;
  const f = o.function && typeof o.function === 'object' ? o.function : o;
  const name = f.name ?? f.tool ?? f.tool_name ?? f.function;
  if (typeof name !== 'string' || !name) return null;
  let args = f.arguments ?? f.parameters ?? f.args ?? f.input ?? f.tool_input ?? {};
  if (typeof args === 'string') args = looseJson(args) ?? { input: args };
  return { name, args: args && typeof args === 'object' ? args : {} };
}

/** A value written as text: JSON when it looks like JSON, else the text. */
const valueOf = (raw: string) => {
  const v = /^\s*[[{\d-]|^\s*(true|false|null)\s*$/.test(raw) ? looseJson(raw) : undefined;
  return v === undefined ? raw : v;
};

/** <function=name><parameter=key>value</parameter>…</function> */
function fromXml(s: string): ParsedCall | null {
  const fn = /<function=([^>\s]+)\s*>([\s\S]*?)(<\/function>|$)/.exec(s);
  if (!fn) return null;
  const args: Record<string, unknown> = {};
  for (const p of fn[2].matchAll(/<parameter=([^>\s]+)\s*>([\s\S]*?)(<\/parameter>|(?=<parameter=)|$)/g)) args[p[1]] = valueOf(p[2].replace(/^\n/, '').replace(/\n$/, ''));
  return { name: fn[1], args };
}

/** GLM's: name, then <arg_key>k</arg_key><arg_value>v</arg_value> pairs (or a JSON object). */
function fromGlm(body: string): ParsedCall | null {
  const name = /^\s*([A-Za-z_][\w.-]*)/.exec(body)?.[1];
  if (!name) return null;
  const rest = body.slice(body.indexOf(name) + name.length);
  if (/^\s*\{/.test(rest)) return { name, args: (looseJson(rest) as Record<string, unknown>) ?? {} };
  const args: Record<string, unknown> = {};
  for (const p of rest.matchAll(/<arg_key>([\s\S]*?)<\/arg_key>\s*<arg_value>([\s\S]*?)(<\/arg_value>|$)/g)) args[p[1].trim()] = valueOf(p[2]);
  return { name, args };
}

/** <invoke name="x"><parameter name="k">v</parameter></invoke> (MiniMax, and models taught Claude's XML). */
function fromInvoke(text: string): ParsedCall[] {
  const out: ParsedCall[] = [];
  for (const m of text.matchAll(/<invoke\s+name=["']([^"']+)["']\s*>([\s\S]*?)(<\/invoke>|$)/g)) {
    const args: Record<string, unknown> = {};
    for (const p of m[2].matchAll(/<parameter\s+name=["']([^"']+)["']\s*>([\s\S]*?)(<\/parameter>|$)/g)) args[p[1]] = valueOf(p[2].replace(/^\n/, '').replace(/\n$/, ''));
    out.push({ name: m[1], args });
  }
  return out;
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

/** JSON objects one after another, as in "{…}; {…}" or "[{…}, {…}]". */
function objects(s: string): ParsedCall[] {
  const j = looseJson(s);
  if (j !== undefined) return (Array.isArray(j) ? j : [j]).map(fromObject).filter((x): x is ParsedCall => !!x);
  return s
    .split(/(?<=\})\s*;\s*(?=\{)/)
    .map((x) => fromObject(looseJson(x)))
    .filter((x): x is ParsedCall => !!x);
}

/** The tool calls in a reply's text (only tools the agent has, so prose about tools is left alone). */
export function parseCalls(text: string, known: Set<string> | ((name: string) => boolean)): ParsedCall[] {
  const has = typeof known === 'function' ? known : (n: string) => known.has(n) || known.has(n.replace(/^functions?\./, ''));
  const out: ParsedCall[] = [];
  for (const m of text.matchAll(/<tool_call>([\s\S]*?)(<\/tool_call>|$)/g)) {
    const body = m[1].trim();
    if (!body) continue;
    const c = body.startsWith('{') ? fromObject(looseJson(body)) : /<function=/.test(body) ? fromXml(body) : fromGlm(body);
    if (c) out.push(c);
  }
  for (const m of text.matchAll(/<\|tool_call_start\|>([\s\S]*?)(<\|tool_call_end\|>|$)/g)) {
    const body = m[1].trim();
    if (body.startsWith('[{') || body.startsWith('{')) out.push(...objects(body));
    else out.push(...fromPython(body));
  }
  // DeepSeek: <｜tool▁call▁begin｜>function<｜tool▁sep｜>name\n```json\n{…}\n```<｜tool▁call▁end｜>, or name<｜tool▁sep｜>{…}.
  for (const m of text.matchAll(/<｜tool▁call▁begin｜>([\s\S]*?)(<｜tool▁call▁end｜>|$)/g)) {
    const [left, right = ''] = m[1].split('<｜tool▁sep｜>');
    if (left.trim() === 'function') {
      const name = /^\s*([^\s`]+)/.exec(right)?.[1];
      if (name) out.push({ name, args: (looseJson(right.slice(right.indexOf(name) + name.length)) as Record<string, unknown>) ?? {} });
    } else if (left.trim()) out.push({ name: left.trim(), args: (looseJson(right) as Record<string, unknown>) ?? {} });
  }
  // Kimi: <|tool_call_begin|>functions.name:0<|tool_call_argument_begin|>{…}<|tool_call_end|>
  for (const m of text.matchAll(/<\|tool_call_begin\|>\s*([^<\s]+?)(?::\d+)?\s*<\|tool_call_argument_begin\|>([\s\S]*?)(<\|tool_call_end\|>|$)/g))
    out.push({ name: m[1].replace(/^functions\./, ''), args: (looseJson(m[2]) as Record<string, unknown>) ?? {} });
  // gpt-oss's harmony format, when the server leaves it in the text: to=functions.name … <|message|>{…}<|call|>
  for (const m of text.matchAll(/to=functions\.([\w.-]+)[^<]*?(?:<\|constrain\|>\s*\w+\s*)?<\|message\|>([\s\S]*?)(<\|call\|>|<\|end\|>|$)/g))
    out.push({ name: m[1], args: (looseJson(m[2]) as Record<string, unknown>) ?? {} });
  out.push(...fromInvoke(text));
  for (const m of text.matchAll(/<(function_call|tool)>([\s\S]*?)(<\/\1>|$)/g)) out.push(...objects(m[2]));
  const tag = /<\|python_tag\|>([\s\S]*?)(<\|eom_id\|>|<\|eot_id\|>|$)/.exec(text);
  if (tag) out.push(...objects(tag[1].trim()));
  if (!out.length) {
    // A bare list of calls, [read_file(path="a")] (LFM2's format, its markers stripped by the server):
    // parsed from where it opens, so a ")]" inside an argument does not end it.
    const at = bareCallAt(text, has);
    if (at >= 0) out.push(...fromPython(text.slice(at)).filter((c) => has(c.name)));
    // Gemma's ```tool_code fence with a Python call.
    for (const m of text.matchAll(/```tool_code\s*\n([\s\S]*?)```/g)) out.push(...fromPython(m[1].trim()).filter((c) => has(c.name)));
  }
  const mistral = /\[TOOL_CALLS\]([\s\S]*)$/.exec(text);
  if (mistral) {
    const body = mistral[1].trim();
    // Newer Mistral models: name[ARGS]{…}, one after another; older ones: a JSON list.
    const named = [...body.matchAll(/([A-Za-z_][\w.-]*)(?:\[CALL_ID\][A-Za-z0-9]+)?\[ARGS\](\{[\s\S]*?\})(?=\s*(?:\[TOOL_CALLS\]|[A-Za-z_][\w.-]*(?:\[CALL_ID\][A-Za-z0-9]+)?\[ARGS\]|$))/g)];
    if (named.length) for (const n of named) out.push({ name: n[1], args: (looseJson(n[2]) as Record<string, unknown>) ?? {} });
    else out.push(...objects(body.replace(/\[TOOL_CALLS\]/g, '')));
  }
  if (!out.length && !/<function=/.test(text)) {
    // A reply that is only a JSON call (in a fence or not), or calls in ```json fences among prose.
    const t = text.trim();
    if (/^(```(json)?\s*)?[[{]/.test(t)) out.push(...objects(t).filter((c) => has(c.name)));
    if (!out.length) for (const m of t.matchAll(/```(?:json)?\s*\n(\{[\s\S]*?\}|\[[\s\S]*?\])\s*```/g)) out.push(...objects(m[1]).filter((c) => has(c.name)));
  } else if (!out.length) {
    const c = fromXml(text);
    if (c) out.push(c);
  }
  return out.filter((c) => has(c.name));
}

/** Where a bare call list to a known tool opens (at the start of a line), or -1. */
function bareCallAt(text: string, has: (n: string) => boolean): number {
  for (const m of text.matchAll(/(^|\n)\s*\[\s*([A-Za-z_][\w.]*)\s*\(/g)) if (has(m[2])) return m.index! + m[1].length;
  return -1;
}

/** The reply's text without tool-call markup and thoughts. */
export function stripMarkup(text: string): string {
  return text
    .replace(/<think>[\s\S]*?(<\/think>|$)/g, '')
    .replace(/<tool_call>[\s\S]*?(<\/tool_call>|$)/g, '')
    .replace(/<\|tool_call_start\|>[\s\S]*?(<\|tool_call_end\|>|$)/g, '')
    .replace(/<｜tool▁calls▁begin｜>[\s\S]*?(<｜tool▁calls▁end｜>|$)/g, '')
    .replace(/<\|tool_calls_section_begin\|>[\s\S]*?(<\|tool_calls_section_end\|>|$)/g, '')
    .replace(/<(minimax:tool_call|function_calls|function_call)>[\s\S]*?(<\/\1>|$)/g, '')
    .replace(/<invoke\s+name=[\s\S]*?(<\/invoke>|$)/g, '')
    .replace(/<\|channel\|>[\s\S]*?(<\|message\|>[\s\S]*?(<\|end\|>|<\|call\|>|$)|$)/g, '')
    .replace(/<\|python_tag\|>[\s\S]*$/, '')
    .replace(/\[TOOL_CALLS\][\s\S]*$/, '')
    .replace(/(^|\n)\s*\[\s*[A-Za-z_][\w.]*\s*\([\s\S]*$/, '$1')
    .trim();
}

const OPEN: [string, string, 'think' | 'call'][] = [
  ['<think>', '</think>', 'think'],
  ['<tool_call>', '</tool_call>', 'call'],
  ['<|tool_call_start|>', '<|tool_call_end|>', 'call'],
  ['<｜tool▁calls▁begin｜>', '<｜tool▁calls▁end｜>', 'call'],
  ['<|tool_calls_section_begin|>', '<|tool_calls_section_end|>', 'call'],
  ['<minimax:tool_call>', '</minimax:tool_call>', 'call'],
  ['<function_calls>', '</function_calls>', 'call'],
  ['<function_call>', '</function_call>', 'call'],
  ['<|channel|>analysis<|message|>', '<|end|>', 'think'],
  ['<|channel|>commentary', '\u0000', 'call'],
  ['<|python_tag|>', '\u0000', 'call'],
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
