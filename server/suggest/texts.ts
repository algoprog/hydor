// The texts personalising learns from: what this person typed (their own words in messages, each with the reply it
// answered), what agents replied in those sessions, the notes they wrote and the documents they wrote, as JSON lines
// {kind, text, ts, session?, reply?}. Ported from the research's extractor (which read the same database): the
// person's messages come from sessions they typed in (not those other parts of the app started: subagents, apps,
// scheduled tasks), minus everything the app and other sessions put into a turn that was never typed.
import fs from 'node:fs';
import readline from 'node:readline';
import type { SuggestSettings } from '../../shared/suggest.ts';
import { splitRunMessage } from '../../shared/automations.ts';
import type { DB } from '../db.ts';
import { ownWords } from '../memory/learn.ts';
import { memoryOn } from '../memory/store.ts';
import { textOfDoc } from '../pages/doc-files.ts';
import { readDoc } from '../pages/docs.ts';
import { parseExtra } from '../sessionExtra.ts';

export interface TextLine {
  kind: 'user' | 'agent' | 'doc';
  text: string;
  ts: number;
  session?: string;
  reply?: string;
}

/** The index cuts every chunk at 4000 characters: a longer message is a paste or a brief, not typed words. */
const CHUNK_CAP = 4000;
const MAX_REPLY = 3000;
const MAX_DOC = 40_000;
const MIN_PROSE = 20;

// What the app, other sessions and the programs put into a user's turn (never typed).
const INJECTED = new RegExp(
  [
    String.raw`^\[Reply from the (?:Hydor subagent|child session)`,
    String.raw`^\[The (?:Hydor subagent|child session)`,
    String.raw`^\[Swarm board`,
    String.raw`^\[Coordination note`,
    String.raw`^\[Cross-session`,
    String.raw`^\[[A-Z][^\]\n]{0,60} (?:finished|failed|started)\b`,
    String.raw`^Message from the session that started you`,
    String.raw`^<agent-message\b`,
    String.raw`^<send_user_message_question_reply>`,
    String.raw`^<task-notification`,
    String.raw`^<local-command`,
    String.raw`^<cross-session-message`,
    String.raw`^Another Claude session sent`,
    String.raw`^Caveat: The messages below`,
    String.raw`^\[Request interrupted`,
    String.raw`^<conversation-handoff`,
    String.raw`^Work reached its usage limit`,
    String.raw`^Work \d+ reached its usage limit`,
    String.raw`^\S+@\S+ reached its usage limit`,
    String.raw`^Continue where you left off\.?$`,
    String.raw`^<codex_internal_context`,
    String.raw`^<environment_context`,
    String.raw`^<user_action`,
    String.raw`^<turn_aborted`,
  ].join('|'),
);
const WRAP = new RegExp(String.raw`<(system-reminder|ide_selection|ide_opened_file|ide_diagnostics|user-prompt-submit-hook|local-command-caveat|command-message|command-name|command-args|local-command-stdout)>[\s\S]*?</\1>`, 'g');
const EXTERNAL = /<(external_[a-z_]+)>[\s\S]*?<\/\1>/g;
const PASTED = /<pasted_content\b[^>]*>[\s\S]*?(?:<\/pasted_content[^>]*>|$)/g;
const IDE = /^# (?:Context from my IDE setup|Files mentioned by the user|Files pasted by the user):[\s\S]*?\n## My request(?: for Codex)?:[ \t]*\n/;
const IDE_ONLY = /^# (?:Context from my IDE setup|Files mentioned by the user|Files pasted by the user):/;

/** The typed part of an indexed user message ('' when nothing typed is left). */
export function cleanUser(text: string): string {
  let t = ownWords(text.trim())
    .replace(PASTED, '')
    .replace(WRAP, '')
    .replace(EXTERNAL, '')
    .trim();
  const m = IDE.exec(t);
  if (m) t = t.slice(m[0].length).trim();
  else if (IDE_ONLY.test(t)) return '';
  if (INJECTED.test(t)) return '';
  return t;
}

// Other parts of the app start sessions the person did not type in; app_sessions.extra says so.
const AGENT_EXTRA = ['parent', 'stepUp', 'stepJudged', 'reported', 'app', 'automations', 'research_child', 'help'];
const SCRIPTED_SOURCES = ['subagent', 'exec'];

interface Sess {
  key: string;
  agent: string;
  created: number;
  path: string | null;
  /** Typed in by the person, and its memory is on, and it is not confidential: its texts may be learned from. */
  usable: boolean;
  /** Memory is off for it (or for all), or it is confidential: nothing of it is read. */
  blocked: boolean;
}

const all = <T>(db: DB, sql: string): T[] => {
  try {
    return db.prepare(sql).all() as T[];
  } catch {
    return [];
  }
};

/** The sessions and whether the person typed in them (as the research's extractor decided). */
export function sessionsOf(db: DB): Sess[] {
  const other = new Set<string>();
  for (const r of all<{ key: string }>(db, 'select key from app_runs where key is not null')) other.add(r.key);
  for (const r of all<{ key: string }>(db, 'select key from task_runs where key is not null')) other.add(r.key);
  for (const r of all<{ key: string }>(db, 'select last_key as key from tasks where last_key is not null')) other.add(r.key);
  for (const r of all<{ data: string }>(db, "select data from session_notes where kind = 'child'")) {
    try {
      const c = (JSON.parse(r.data) as { child?: string }).child;
      if (c) other.add(c);
    } catch {}
  }
  const on = memoryOn(db);
  const rows = all<{ key: string; agent: string; source: string | null; parent_key: string | null; cwd: string | null; created_at: number | null; path: string | null; app_key: string | null; extra: string | null }>(
    db,
    'select s.key, s.agent, s.source, s.parent_key, s.cwd, s.created_at, s.path, a.key as app_key, a.extra from sessions s left join app_sessions a on a.key = s.key',
  );
  return rows.map((r) => {
    const ex = parseExtra(r.extra);
    const scratch = ((r.cwd ?? '').startsWith('/tmp/') || (r.cwd ?? '').startsWith('/dev/shm/')) && (r.source === 'sdk-cli' || r.source == null);
    const typed =
      !other.has(r.key) &&
      !r.parent_key &&
      !SCRIPTED_SOURCES.includes(r.source ?? '') &&
      !AGENT_EXTRA.some((k) => k in ex) &&
      !(r.source === 'sdk-cli' && !r.app_key) &&
      !(r.source == null && !r.app_key) &&
      !scratch;
    const blocked = !on || ex.memory === false || !!ex.confidential;
    return { key: r.key, agent: r.agent, created: r.created_at ?? 0, path: r.path, usable: typed && !blocked, blocked };
  });
}

/** The messages of a Claude Code transcript that other sessions sent (the index keeps them as plain user text). */
async function peerMessages(file: string): Promise<Set<string>> {
  const peers = new Set<string>();
  let stream: fs.ReadStream;
  try {
    stream = fs.createReadStream(file, { encoding: 'utf8' });
  } catch {
    return peers;
  }
  stream.on('error', () => {});
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  try {
    for await (const line of rl) {
      if (!line.includes('cross-session-message')) continue;
      let d: any;
      try {
        d = JSON.parse(line);
      } catch {
        continue;
      }
      let content = d?.message?.content;
      if (d?.type === 'attachment') content = d.attachment?.type === 'queued_command' ? d.attachment.prompt : null;
      else if (d?.type !== 'user') continue;
      const text = typeof content === 'string' ? content : Array.isArray(content) ? content.filter((b: any) => b && b.type === 'text').map((b: any) => b.text ?? '').join('\n') : '';
      if (!text.includes('<cross-session-message')) continue;
      const s = text.trim().replace(/^Another Claude session sent a message[^\n]*\n/, '').trim();
      const m = /^<cross-session-message\b[^>]*>([\s\S]*?)<\/cross-session-message>/.exec(s);
      if (m) peers.add(m[1].trim().slice(0, 300));
    }
  } catch {}
  return peers;
}

/** The text of a page's HTML: what a reader sees, in paragraphs. */
export function htmlText(h: string): string {
  const t = h
    .replace(/<(script|style|head|svg|noscript)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/?(p|div|br|li|h[1-6]|tr|section|article|ul|ol|table|blockquote)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  return paragraphs(t);
}

function paragraphs(t: string): string {
  return t
    .split('\n')
    .map((l) => l.replace(/[ \t ]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n');
}

/** The prose of a LaTeX source: its body without the commands, maths, figures and tables. */
export function texText(src: string): string {
  const m = /\\begin\{document\}([\s\S]*?)(?:\\end\{document\}|$)/.exec(src);
  let b = m ? m[1] : src;
  b = b.replace(/%.*/g, '');
  b = b.replace(/\\begin\{(tikzpicture|figure|table|tabular|equation|align|lstlisting|verbatim)\*?\}[\s\S]*?\\end\{\1\*?\}/g, ' ');
  b = b.replace(/\$[^$]*\$/g, ' ');
  b = b.replace(/\\(?:section|subsection|subsubsection|paragraph|textbf|textit|emph|texttt|textsc|item)\*?\s*(?:\[[^\]]*\])?\{?/g, '\n');
  b = b.replace(/\\[a-zA-Z]+\*?(?:\[[^\]]*\])?(?:\{[^{}]*\})?/g, ' ');
  b = b.replace(/[{}\\]/g, '');
  return paragraphs(b.replace(/\n\s*\n/g, '\n'));
}

/** The words of a page of a kind a person writes in, or '' for one that is not prose (a spreadsheet, slides, a diagram). */
export function pageText(kind: string | null, body: string): string {
  try {
    if (kind === 'doc') return textOfDoc(readDoc(body));
    if (kind === 'tex') return texText(body);
    if (kind === 'notebook') {
      const nb = JSON.parse(body) as { cells?: { cell_type?: string; source?: string | string[] }[] };
      return paragraphs((nb.cells ?? []).filter((c) => c.cell_type === 'markdown').map((c) => (Array.isArray(c.source) ? c.source.join('') : String(c.source ?? ''))).join('\n\n'));
    }
    if (kind == null) return htmlText(body);
  } catch {}
  return '';
}

/** The newest typing of the person in a session the app runs (0: none), for a pause before personalising. */
export function lastTyped(db: DB): number {
  const r = all<{ t: number | null }>(db, "select max(c.ts) as t from chunk_text c join app_sessions a on a.key = c.key where c.kind = 'user'")[0];
  return r?.t ?? 0;
}

/** The texts since `since` (a time in ms; 0: all) from the sources switched on. */
export async function extractTexts(db: DB, o: { since: number; sources: SuggestSettings['sources'] }): Promise<TextLine[]> {
  const out: TextLine[] = [];
  const { since, sources } = o;
  const seenUser = new Set<string>();
  const seenAgent = new Set<string>();
  if (sources.messages || sources.replies) {
    // The earliest session first, so the original keeps a message and a fork's copy of it goes.
    const sessions = sessionsOf(db)
      .filter((s) => s.usable)
      .sort((a, b) => a.created - b.created || (a.key < b.key ? -1 : 1));
    const chunks = db.prepare("select id, kind, coalesce(ts, 0) as ts, text from chunk_text where key = ? and kind in ('user', 'assistant') order by id");
    for (const s of sessions) {
      const rows = chunks.all(s.key) as { id: number; kind: 'user' | 'assistant'; ts: number; text: string }[];
      if (!rows.some((r) => r.ts > since)) continue;
      // An ACP agent streams a reply in pieces that the index keeps one by one: one reply again.
      const seq: { kind: 'user' | 'assistant'; ts: number; text: string }[] = [];
      for (const r of rows) {
        const last = seq[seq.length - 1];
        if (s.agent === 'acp' && r.kind === 'assistant' && last?.kind === 'assistant') last.text = `${last.text} ${r.text}`.replace(/ ,/g, ',').replace(/ \./g, '.');
        else seq.push({ kind: r.kind, ts: r.ts, text: r.text });
      }
      const peers = sources.messages && s.agent === 'claude' && s.path && seq.some((r) => r.kind === 'user' && r.ts > since) ? await peerMessages(s.path) : new Set<string>();
      let block: string[] = [];
      let prevReply = '';
      for (const r of seq) {
        if (r.kind === 'assistant') {
          block.push(r.text);
          if (sources.replies && r.ts > since && r.text.trim().length >= MIN_PROSE) {
            const k = `${r.ts}\u0000${r.text.slice(0, 200)}\u0000${r.text.length}`;
            if (!seenAgent.has(k)) {
              seenAgent.add(k);
              out.push({ kind: 'agent', text: r.text.trim(), ts: r.ts, session: s.key });
            }
          }
          continue;
        }
        if (block.length) {
          prevReply = block.join('\n\n').trim();
          block = [];
        }
        if (!sources.messages || r.ts <= since) continue;
        if (splitRunMessage(r.text) || peers.has(r.text.trim().slice(0, 300))) continue;
        const typed = cleanUser(r.text);
        if (!typed || r.text.length >= CHUNK_CAP - 5) continue;
        const k = `${r.ts}\u0000${typed}`;
        if (seenUser.has(k)) continue;
        seenUser.add(k);
        out.push({ kind: 'user', text: typed, ts: r.ts, session: s.key, ...(prevReply ? { reply: prevReply.slice(-MAX_REPLY) } : {}) });
      }
    }
  }
  if (sources.notes) {
    // Notes the person wrote themselves (not those an agent or the tidy-up made).
    for (const r of all<{ text: string; updated_at: number }>(db, `select text, updated_at from memory_entries where status = 'active' and source = 'user' and updated_at > ${Number(since) || 0}`)) {
      const t = r.text.trim();
      if (t.length >= MIN_PROSE) out.push({ kind: 'doc', text: t.slice(0, MAX_DOC), ts: r.updated_at });
    }
  }
  if (sources.docs) {
    // The newest version of each page, when the person saved it (typed in its editor), in a session that may be learned from.
    const blocked = new Set(sessionsOf(db).filter((s) => s.blocked).map((s) => s.key));
    for (const r of all<{ kind: string | null; html: string; created_at: number; session_key: string | null }>(
      db,
      `select p.kind, pv.html, pv.created_at, p.session_key from pages p join page_versions pv on pv.page_id = p.id and pv.version = p.version where pv.by in ('user', 'edit') and pv.created_at > ${Number(since) || 0}`,
    )) {
      if (r.session_key && blocked.has(r.session_key)) continue;
      const t = pageText(r.kind, r.html).trim();
      if (t.length >= MIN_PROSE) out.push({ kind: 'doc', text: t.slice(0, MAX_DOC), ts: r.created_at });
    }
  }
  return out;
}

/** Writes the texts as JSON lines, readable by the owner alone; returns how many of each kind. */
export async function writeTexts(db: DB, file: string, o: { since: number; sources: SuggestSettings['sources'] }): Promise<{ user: number; agent: number; doc: number }> {
  const lines = await extractTexts(db, o);
  const fd = fs.openSync(file, 'w', 0o600);
  const n = { user: 0, agent: 0, doc: 0 };
  try {
    for (const l of lines) {
      n[l.kind]++;
      fs.writeSync(fd, JSON.stringify(l) + '\n');
    }
  } finally {
    fs.closeSync(fd);
  }
  return n;
}
