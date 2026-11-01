// Pages as an agent writes them. Claude Code reports a tool call's input while the model writes it
// (input_json_delta, passed on by the session manager as 'toolstream'); for show_html, save_page and an
// HTML file written whole (Write), this reads the page's HTML out of that partial JSON as it grows and
// sends each new piece to the pages showing the session, which draw the page as it comes. Agents that
// hand over whole calls only (Codex, ACP) show the page once the call is there.
import type { PageDraft, PagesEvent } from '../../shared/pages.ts';
import type { Deps } from '../features/types.ts';

/** What an agent's driver reports of a tool call while the model writes it. */
export interface ToolStream {
  id: string;
  name: string;
  at: 'start' | 'delta' | 'end';
  delta?: string;
  /** At the end: the whole input. */
  input?: Record<string, unknown>;
}

const PAGE_TOOL = /^mcp__(?:naget-agent|agent-console)__(show_html|save_page)$/;
const HTML_FILE = /\.html?$/i;

type Kind = PageDraft['tool'];

/** Which calls draw a page as they come, and the fields that say what it is. */
function kindOf(name: string): Kind | null {
  const m = PAGE_TOOL.exec(name);
  if (m) return m[1] as Kind;
  return name === 'Write' ? 'file' : null;
}

/**
 * Reads the string fields of a flat JSON object from pieces of its text as they arrive: a piece may end
 * anywhere, in a key, an escape or a \u sequence. Other values (numbers, objects) are stepped over.
 */
export class JsonFields {
  private state: 'start' | 'key-start' | 'key' | 'key-esc' | 'colon' | 'value' | 'string' | 'esc' | 'hex' | 'nested' | 'scalar' | 'done' = 'start';
  private key = '';
  private hex = '';
  private depth = 0;
  private inStr = false;
  private strEsc = false;
  private cur: string | null = null;
  readonly fields = new Map<string, string>();

  constructor(private want: ReadonlySet<string>) {}

  /** Takes the next piece; returns the wanted fields it added to. */
  feed(s: string): Set<string> {
    const changed = new Set<string>();
    let run = '';
    // Plain characters of a wanted string go in as one run.
    const flush = () => {
      if (run && this.cur !== null) {
        this.fields.set(this.cur, (this.fields.get(this.cur) ?? '') + run);
        changed.add(this.cur);
      }
      run = '';
    };
    const put = (c: string) => {
      if (this.cur !== null) run += c;
    };
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      switch (this.state) {
        case 'start':
          if (c === '{') this.state = 'key-start';
          break;
        case 'key-start':
          if (c === '"') {
            this.state = 'key';
            this.key = '';
          } else if (c === '}') this.state = 'done';
          break;
        case 'key':
          if (c === '\\') this.state = 'key-esc';
          else if (c === '"') this.state = 'colon';
          else this.key += c;
          break;
        case 'key-esc':
          this.key += c;
          this.state = 'key';
          break;
        case 'colon':
          if (c === ':') this.state = 'value';
          break;
        case 'value':
          if (c === '"') {
            this.state = 'string';
            this.cur = this.want.has(this.key) ? this.key : null;
            if (this.cur !== null) {
              this.fields.set(this.cur, '');
              changed.add(this.cur);
            }
          } else if (c === '{' || c === '[') {
            this.state = 'nested';
            this.depth = 1;
            this.inStr = false;
          } else if (!/\s/.test(c)) this.state = 'scalar';
          break;
        case 'string':
          if (c === '\\') {
            flush();
            this.state = 'esc';
          } else if (c === '"') {
            flush();
            this.cur = null;
            this.state = 'key-start';
          } else put(c);
          break;
        case 'esc': {
          const map: Record<string, string> = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', '/': '/', '\\': '\\', '"': '"' };
          if (c === 'u') {
            this.state = 'hex';
            this.hex = '';
          } else {
            put(map[c] ?? c);
            this.state = 'string';
          }
          break;
        }
        case 'hex':
          this.hex += c;
          if (this.hex.length === 4) {
            const code = parseInt(this.hex, 16);
            if (Number.isFinite(code)) put(String.fromCharCode(code));
            this.state = 'string';
          }
          break;
        case 'nested':
          if (this.inStr) {
            if (this.strEsc) this.strEsc = false;
            else if (c === '\\') this.strEsc = true;
            else if (c === '"') this.inStr = false;
          } else if (c === '"') this.inStr = true;
          else if (c === '{' || c === '[') this.depth++;
          else if (c === '}' || c === ']') {
            if (--this.depth === 0) this.state = 'key-start';
          }
          break;
        case 'scalar':
          if (c === ',') this.state = 'key-start';
          else if (c === '}') this.state = 'done';
          break;
        case 'done':
          break;
      }
    }
    flush();
    return changed;
  }
}

interface Draft extends PageDraft {
  key: string;
  json: JsonFields;
  /** How much of `text` the pages have. */
  sent: number;
  /** Nothing went out yet: the first send starts the draft over (from 0). */
  started: boolean;
  timer: NodeJS.Timeout | null;
}

/** A session's drafts, by tool call. */
const drafts = new Map<string, Map<string, Draft>>();
const SEND_MS = 140;
/** A finished draft stays this long, for pages that ask for it late. */
const KEEP_MS = 120_000;

const FIELDS: Record<Kind, Set<string>> = {
  show_html: new Set(['title', 'html']),
  save_page: new Set(['id', 'title', 'html']),
  file: new Set(['file_path', 'content']),
};

/** A file draft shows once its path says it is an HTML file. */
const showable = (d: Draft) => d.tool !== 'file' || (!!d.path && HTML_FILE.test(d.path));

const info = (d: Draft): Omit<PageDraft, 'text'> => ({ id: d.id, tool: d.tool, title: d.title, path: d.path, pageId: d.pageId, done: d.done, startedAt: d.startedAt });

function send(deps: Deps, d: Draft) {
  if (d.timer) clearTimeout(d.timer);
  d.timer = null;
  if (!showable(d)) return;
  const from = d.started ? d.sent : 0;
  const data: PagesEvent = { what: 'draft', draft: info(d), from, text: d.text.slice(from) };
  d.started = true;
  d.sent = d.text.length;
  deps.toSubscribers(d.key, { t: 'feature', id: 'pages', key: d.key, data });
}

function later(deps: Deps, d: Draft) {
  if (!d.timer) d.timer = setTimeout(() => send(deps, d), SEND_MS);
}

function read(d: Draft) {
  const f = d.json.fields;
  if (d.tool === 'file') {
    d.path = f.get('file_path') ?? d.path;
    d.text = f.get('content') ?? '';
  } else {
    d.title = f.get('title') ?? d.title;
    d.pageId = f.get('id') ?? d.pageId;
    d.text = f.get('html') ?? '';
  }
}

function forget(key: string, id: string) {
  const m = drafts.get(key);
  if (!m) return;
  m.delete(id);
  if (!m.size) drafts.delete(key);
}

/** A piece of a tool call's input, as the agent writes it. */
export function feedDraft(deps: Deps, key: string, e: ToolStream) {
  const kind = kindOf(e.name);
  if (!kind) return;
  let m = drafts.get(key);
  if (e.at === 'start') {
    if (!m) drafts.set(key, (m = new Map()));
    m.set(e.id, { id: e.id, key, tool: kind, text: '', done: false, startedAt: Date.now(), json: new JsonFields(FIELDS[kind]), sent: 0, started: false, timer: null });
    return;
  }
  const d = m?.get(e.id);
  if (!d || d.done) return;
  if (e.at === 'delta') {
    if (!e.delta || !d.json.feed(e.delta).size) return;
    const before = d.text.length;
    read(d);
    // Any other file is no page: it is not followed further.
    if (d.tool === 'file' && d.path && !HTML_FILE.test(d.path)) return forget(key, d.id);
    // A field read again from its start (a model that wrote it twice) starts the pages over too.
    if (d.text.length < before) d.started = false;
    later(deps, d);
    return;
  }
  // The call is complete: its own input is what the page is.
  const input = e.input ?? {};
  const str = (k: string) => (typeof input[k] === 'string' ? (input[k] as string) : undefined);
  const streamed = d.text.slice(0, d.sent);
  if (d.tool === 'file') {
    d.path = str('file_path') ?? d.path;
    if (str('content') !== undefined) d.text = str('content')!;
  } else {
    d.title = str('title') ?? d.title;
    d.pageId = str('id') ?? d.pageId;
    if (str('html') !== undefined) d.text = str('html')!;
  }
  // What the pages have must lead into the whole page; otherwise they get it again from the start.
  if (!d.text.startsWith(streamed)) d.started = false;
  d.done = true;
  send(deps, d);
  setTimeout(() => forget(key, d.id), KEEP_MS).unref();
}

/** The turn ended or the agent stopped: drafts still open stop where they are. */
export function endDrafts(deps: Deps, key: string) {
  const m = drafts.get(key);
  if (!m) return;
  for (const d of m.values()) {
    if (d.done) continue;
    d.done = true;
    send(deps, d);
    setTimeout(() => forget(key, d.id), KEEP_MS).unref();
  }
}

/** A session's drafts as they are now, whole (a page that opens mid-way, or missed a piece). */
export function draftsOf(key: string): PageDraft[] {
  return [...(drafts.get(key)?.values() ?? [])].filter(showable).map((d) => ({ ...info(d), text: d.text }));
}
