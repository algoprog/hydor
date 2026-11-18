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

// ---- where a reply that writes its calls as text ends ----------------------------------------------------
//
// A model that writes its tool calls as text (Claude's through Claude Code, which has no stop sequence to end the
// reply there) may go on writing after them: the results it imagines (<tool_response> blocks, as the transcript shows
// them), more calls on top of those, or more calls while it waits for an answer that cannot come in the same reply.
// Seen 2026-11-18: a Custom subagent on Claude Opus wrote 100 calls with made-up results in one reply, and the app ran
// them all, Slurm submissions and a commit among them. So such a reply ends where its calls end.

/** Calls a reply may write in a row: more is a model waiting for results, not working. */
export const MAX_TEXT_CALLS = 6;

/** Where a call written as text opens, and what closes it. A group (<function_calls>) holds a step's calls and ends the reply. */
const CALL_OPENERS: { re: RegExp; close: string; group?: boolean }[] = [
  { re: /<tool_call>/g, close: '</tool_call>' },
  { re: /<function_calls>/g, close: '</function_calls>', group: true },
  { re: /<function_call>/g, close: '</function_call>' },
  { re: /<invoke\s+name=["'][^"'<>]*["']\s*>/g, close: '</invoke>' },
];
/** What only the app or the transcript writes, at the start of a line: the reply is over before it. */
const NOT_THE_MODELS = /(^|\n)[ \t]*(<(?:tool_response|tool_result|tool_output|function_results?|user)(?=[\s>/])|<\/assistant>)/g;
/** Tags a piece of text at the end may still be the start of: it waits for the next piece. */
const TAG_STARTS = ['<tool_call>', '<function_calls>', '<function_call>', '<invoke name=', '<tool_response', '<tool_result', '<tool_output', '<function_result', '<user>', '</assistant>'];

export interface CallCut {
  /** Where the reply ends (the text from here on goes), or null while it may go on. */
  stop: number | null;
  /** How much of the text is settled: kept whatever comes next. */
  safe: number;
}

/** Fenced code blocks (``` or ~~~ lines) before `at`: an odd count means `at` is inside one. */
const inFence = (text: string, at: number) => (text.slice(0, at).match(/(^|\n)[ \t]*(```|~~~)/g)?.length ?? 0) % 2 === 1;

/**
 * Where a reply that writes its calls as text ends, and how much of it is settled, from the text so far (`done`: all of
 * it). It ends before anything only the app writes (a <tool_response> block, the transcript's <user> tag) at the start
 * of a line outside a code fence; after its calls, at the first thing that is not another call (a group's closing
 * </function_calls> ends it at once); before a call it already wrote; and after MAX_TEXT_CALLS calls. What a call holds
 * (a file it writes, say) is never read for these, and a call still open when the reply ends is kept. A reply with
 * <think> blocks in its text is the caller's to strip first.
 */
export function cutAtCalls(text: string, done: boolean): CallCut {
  let at = 0;
  /** The end of the last whole call, once there is one. */
  let last = -1;
  let calls = 0;
  const seen = new Set<string>();
  /** The first thing only the app writes, at or after `from`, outside a fence: the start of its line. */
  const foreign = (from: number) => {
    NOT_THE_MODELS.lastIndex = from;
    for (let m = NOT_THE_MODELS.exec(text); m; m = NOT_THE_MODELS.exec(text)) {
      const tag = m.index + m[0].length - m[2].length;
      if (!inFence(text, tag)) return text.lastIndexOf('\n', tag) + 1;
    }
    return -1;
  };
  const opener = (from: number) => {
    let best: { start: number; end: number; o: (typeof CALL_OPENERS)[number] } | null = null;
    for (const o of CALL_OPENERS) {
      o.re.lastIndex = from;
      const m = o.re.exec(text);
      if (m && (!best || m.index < best.start)) best = { start: m.index, end: m.index + m[0].length, o };
    }
    return best;
  };
  /** Text at the end that may still become a tag: where it starts (its line's start, when only space comes before it). */
  const pending = (from: number) => {
    if (done) return -1;
    const lt = text.lastIndexOf('<');
    if (lt < from) return -1;
    const tail = text.slice(lt);
    if (tail.includes('>') && !tail.startsWith('<invoke name=')) return -1;
    if (!TAG_STARTS.some((s) => s.startsWith(tail) || tail.startsWith(s))) return -1;
    const line = text.lastIndexOf('\n', lt) + 1;
    return text.slice(Math.max(line, from), lt).trim() ? lt : Math.max(line, from);
  };
  for (;;) {
    const next = opener(at);
    if (last >= 0) {
      // After a call: only room between calls, then another call.
      const gap = text.slice(last, next ? next.start : text.length);
      if (gap.trim()) {
        // Unless all there is after them is what may still become another call's opening tag.
        const wait = next ? -1 : pending(last);
        return wait >= 0 && !text.slice(last, wait).trim() ? { stop: null, safe: last } : { stop: last, safe: last };
      }
      if (!next) return { stop: null, safe: done ? text.length : last };
    } else {
      const bad = foreign(at);
      if (bad >= 0 && (!next || bad < next.start)) return { stop: bad, safe: bad };
      if (!next) {
        const wait = pending(at);
        return { stop: null, safe: wait >= 0 ? wait : text.length };
      }
    }
    const close = text.indexOf(next.o.close, next.end);
    if (close < 0) return { stop: null, safe: last >= 0 ? last : next.start };
    const end = close + next.o.close.length;
    // The calls in it: a group's invokes one by one, or the block itself.
    const bodies = next.o.group ? [...text.slice(next.end, close).matchAll(/<invoke\s+name=["'][^"'<>]*["']\s*>[\s\S]*?(<\/invoke>|$)/g)].map((m) => m[0]) : [text.slice(next.start, end)];
    const before = last >= 0 ? last : next.start;
    for (const b of bodies) {
      const sig = b.replace(/\s+/g, ' ').trim();
      // The same call again: the model is waiting for the first one's result.
      if (seen.has(sig)) return { stop: before, safe: before };
      seen.add(sig);
    }
    calls += Math.max(1, bodies.length);
    last = end;
    if (next.o.group || calls >= MAX_TEXT_CALLS) return { stop: end, safe: end };
    at = end;
  }
}

/**
 * Lets the text of a reply that writes its calls as text through only as far as it is settled, and says when the reply
 * is over (its calls written and something else begun): the text after that is never shown, and the caller stops the
 * model. end() lets the rest through once the model has finished, and gives the reply as kept.
 */
export class CallGate {
  private text = '';
  private sent = 0;
  private cut: number | null = null;

  constructor(private emit: (t: string) => void) {}

  /** Takes a piece of the reply; true once the reply is over (later pieces are dropped). */
  push(t: string): boolean {
    if (this.cut === null) {
      this.text += t;
      this.settle(cutAtCalls(this.text, false));
    }
    return this.cut !== null;
  }

  private settle(c: CallCut) {
    const upTo = c.stop ?? c.safe;
    if (upTo > this.sent) {
      this.emit(this.text.slice(this.sent, upTo));
      this.sent = upTo;
    }
    if (c.stop !== null) this.cut = c.stop;
  }

  /** The reply was cut where its calls end. */
  get stopped(): boolean {
    return this.cut !== null;
  }

  /** Lets the rest through, and gives the reply as kept. */
  end(): string {
    if (this.cut === null) this.settle(cutAtCalls(this.text, true));
    const keep = this.cut ?? this.text.length;
    if (keep > this.sent) {
      this.emit(this.text.slice(this.sent, keep));
      this.sent = keep;
    }
    return this.text.slice(0, keep).trimEnd();
  }
}

const OPEN: [string, string, 'think' | 'call'][] = [
  ['<think>', '</think>', 'think'],
  ['<tool_call>', '</tool_call>', 'call'],
  // Claude's own form, written without its <function_calls> group.
  ['<invoke name=', '</invoke>', 'call'],
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
