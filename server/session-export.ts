// A conversation taken out of the chat (the session menu's Export, `hydor sessions export`): as a Markdown file, or as
// a document in the Library to edit, print and share. What goes in: the title and date, then each of your messages and
// each of the agent's replies in order, a turn's steps as one line ("Worked for 2 min · 5 steps"), the files it handed
// over by name, pictures where the document can keep them, answer cards as readable Markdown (shared/answer-ui/text.ts:
// tables as tables), and Mermaid diagrams and maths as they were written. A confidential session's document stays on
// this computer like the rest of it: no picture of it is fetched from the web.
//
// The conversion (sessionMarkdown) is plain and kept apart from the routes, so tests and the `hydor` command share it:
//   GET  /api/sessions/:key/export?format=md   the Markdown, as a file to download
//   POST /api/sessions/:key/export/doc         a Library document of it
import path from 'node:path';
import os from 'node:os';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { answerUi } from '../shared/answer-ui/index.ts';
import { answerMarkdown } from '../shared/answer-ui/text.ts';
import { isConfidential } from '../shared/confidential.ts';
import { readPartial } from '../shared/partial-json.ts';
import type { Agent, TimelineItem, ToolItem, UserItem } from '../shared/types.ts';
import { HttpError } from './auth.ts';
import type { DB } from './db.ts';
import { imagesIn, readLineAt } from './retention.ts';
import type { SessionManager } from './sessions.ts';
import { userTimezone } from './userPrefs.ts';

/** What the export says of the session, beside its conversation. */
export interface ExportHead {
  title: string;
  /** Who answered: Claude Code, Codex, Custom, or an ACP agent's name. */
  agent: string;
  createdAt?: number;
  cwd?: string;
}

export interface ExportOptions {
  /** The pictures of each of your messages (by its item id), as addresses the result can keep; none: it says how many there were. */
  pictures?: Map<string, string[]>;
  /** The handed-over files that are pictures shown as pictures (a document takes them in), not only named. */
  showFiles?: boolean;
  /** Pictures on the web written as links instead (a confidential session's document: nothing is fetched). */
  noWebPictures?: boolean;
  /** The time zone dates are written in, and when the export is made. */
  timeZone?: string;
  now?: number;
  home?: string;
}

/** The tools that put something with the reply rather than being steps of the work (as the session's page shows them). */
const WITH_REPLY = new Set(['present_files', 'show_html', 'save_page', 'save_doc', 'save_sheet', 'save_slides', 'save_latex', 'save_notebook', 'save_diagram', 'save_board', 'use_app']);
/** The app's own tool's name without its server's prefix (mcp__hydor__present_files → present_files). */
const bare = (name: string) => /^mcp__(?:hydor|naget-agent|agent-console)__(.+)$/.exec(name)?.[1] ?? name;
const PICTURE = /\.(png|jpe?g|gif|webp|avif|svg)$/i;

/** The program's name, as the app shows it. */
export function agentName(agent: Agent, acpAgent?: string, acpName?: string): string {
  if (agent === 'claude') return 'Claude Code';
  if (agent === 'codex') return 'Codex';
  if (acpAgent === 'console') return 'Custom';
  return acpName || acpAgent || 'Agent';
}

/** How long, in a few words: "45 s", "2 min", "1 h 5 min". */
export function duration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${Math.max(1, s)} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;
}

const when = (ts: number, tz?: string, time = true) => {
  const o: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric', ...(time ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}) };
  try {
    return new Date(ts).toLocaleString('en-GB', { ...o, timeZone: tz || undefined });
  } catch {
    return new Date(ts).toLocaleString('en-GB', o);
  }
};

/** A file handed over by a present_files call: its path (absolute where it can be) and its caption. */
function handed(it: ToolItem, cwd?: string, home = os.homedir()): { path: string; caption?: string }[] {
  const input = (it.tool.input ?? {}) as { files?: unknown };
  const list = Array.isArray(input.files) ? input.files : [];
  const out: { path: string; caption?: string }[] = [];
  for (const f of list) {
    const p = typeof f === 'string' ? f : (f as { path?: unknown })?.path;
    if (typeof p !== 'string' || !p.trim()) continue;
    const caption = typeof f === 'object' && f && typeof (f as { caption?: unknown }).caption === 'string' ? (f as { caption: string }).caption.trim() : undefined;
    const abs = p === '~' || p.startsWith('~/') ? path.join(home, p.slice(1)) : cwd && !path.isAbsolute(p) ? path.resolve(cwd, p) : p;
    out.push({ path: abs, caption: caption || undefined });
  }
  return out;
}

/**
 * An agent's reply as Markdown for the export: its answer cards (```ui blocks) as readable Markdown, its headings two
 * levels down (under the message's own heading), web pictures as links when `noWebPictures`. Code, Mermaid diagrams
 * and maths stay as written.
 */
export function replyMarkdown(text: string, o: { noWebPictures?: boolean; shift?: number } = {}): string {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  const shift = o.shift ?? 2;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const open = /^(\s{0,3})(`{3,}|~{3,})\s*([^`\s]*)\s*(.*)$/.exec(line);
    if (open) {
      const [, , fence, lang, rest] = open;
      const close = new RegExp(`^\\s{0,3}${fence[0] === '`' ? '`' : '~'}{${fence.length},}\\s*$`);
      let j = i + 1;
      while (j < lines.length && !close.test(lines[j])) j++;
      const body = lines.slice(i + 1, j).join('\n');
      if (lang.toLowerCase() === 'ui') {
        out.push(cardMarkdown(rest.trim(), body) ?? [line, body, fence].join('\n'));
      } else out.push(...lines.slice(i, Math.min(j + 1, lines.length)));
      i = j;
      continue;
    }
    let l = line;
    // Headings under the message's own (### and below), as far as Markdown goes.
    const h = /^(#{1,6})(\s.*)$/.exec(l);
    if (h && shift) l = `${'#'.repeat(Math.min(6, h[1].length + shift))}${h[2]}`;
    if (o.noWebPictures) l = l.replace(/!\[([^\]]*)\]\((https?:\/\/[^)\s]+)(?:\s+"[^"]*")?\)/gi, (_, alt: string, url: string) => `[${alt || 'Picture'}](${url})`);
    out.push(l);
  }
  return out.join('\n');
}

/** A ```ui block as Markdown; null when its data cannot be read (it stays as the code it was). */
function cardMarkdown(name: string, code: string): string | null {
  let data: unknown;
  try {
    data = JSON.parse(code);
  } catch {
    data = readPartial(code.trim()).value;
  }
  if (!data || typeof data !== 'object') return null;
  const asked = name || (typeof (data as { ui?: unknown }).ui === 'string' ? String((data as { ui: string }).ui) : '');
  const spec = answerUi(asked);
  const md = answerMarkdown(spec?.id ?? asked, data, spec?.title);
  return md || null;
}

/** One exchange: your message, then the agent's work and reply until the turn ended. */
interface Exchange {
  prompt?: UserItem;
  work: TimelineItem[];
  end?: Extract<TimelineItem, { kind: 'turn' }>;
}

function exchanges(items: TimelineItem[]): Exchange[] {
  const out: Exchange[] = [];
  let cur: Exchange | null = null;
  for (const it of items) {
    if (it.kind === 'user') {
      // What the app or a harness put in (notes, a command's output, a slash command) is no message of yours.
      if (it.meta === 'note' || it.meta === 'command-output' || it.meta === 'slash') continue;
      cur = { prompt: it, work: [] };
      out.push(cur);
      continue;
    }
    if (it.kind === 'turn') {
      (cur ?? (out[out.length] = { work: [] })).end = it;
      cur = null;
      continue;
    }
    if (it.kind === 'system') continue;
    if (!cur) out.push((cur = { work: [] }));
    cur.work.push(it);
  }
  return out;
}

/** The conversation as Markdown: the title and date, then each message and reply in order. */
export function sessionMarkdown(head: ExportHead, items: TimelineItem[], o: ExportOptions = {}): string {
  const tz = o.timeZone;
  const out: string[] = [`# ${head.title.replace(/\s+/g, ' ').trim() || 'Conversation'}`, ''];
  const first = items.find((i) => i.ts)?.ts ?? head.createdAt;
  const meta = [first ? when(first, tz, false) : '', head.agent, head.cwd ? (o.home && head.cwd.startsWith(o.home) ? `~${head.cwd.slice(o.home.length)}` : head.cwd) : ''].filter(Boolean);
  out.push(`*${meta.join(' · ')}*`, '');
  for (const x of exchanges(items)) {
    const p = x.prompt;
    if (p && (p.text.trim() || p.images)) {
      const who = p.peer ? `Message from ${p.peer.name || 'another session'}` : 'You';
      out.push('---', '', `## ${who}${p.ts ? ` · ${when(p.ts, tz)}` : ''}`, '');
      if (p.handoff) out.push(`*Carried over from a ${agentName(p.handoff.agent)} session${p.handoff.title ? ` (“${p.handoff.title}”)` : ''}*`, '');
      if (p.text.trim()) out.push(p.text.trim(), '');
      const pics = o.pictures?.get(p.id);
      if (pics?.length) out.push(...pics.map((src, i) => `![Picture ${i + 1}](${src})`), '');
      else if (p.images) out.push(`*${p.images === 1 ? 'A picture' : `${p.images} pictures`} attached*`, '');
    }
    // The steps: every call that is not something put with the reply. The reply: what the agent wrote after the last step.
    const steps = x.work.filter((i) => i.kind === 'tool' && !WITH_REPLY.has(bare(i.tool.name)));
    let last = -1;
    x.work.forEach((it, i) => {
      if ((it.kind === 'tool' && !WITH_REPLY.has(bare(it.tool.name))) || (it.kind === 'thinking' && it.text.trim())) last = i;
    });
    const texts = x.work.filter((it, i): it is Extract<TimelineItem, { kind: 'assistant' }> => it.kind === 'assistant' && !!it.text.trim() && i > last);
    // A turn that ended on a step: its last words are its reply.
    const reply = texts.length ? texts : x.work.filter((it): it is Extract<TimelineItem, { kind: 'assistant' }> => it.kind === 'assistant' && !!it.text.trim()).slice(-1);
    const files = x.work.filter((it): it is ToolItem => it.kind === 'tool' && bare(it.tool.name) === 'present_files' && it.tool.status !== 'error').flatMap((it) => handed(it, head.cwd, o.home));
    if (!reply.length && !files.length && !steps.length) continue;
    const at = reply[0]?.ts ?? x.end?.ts;
    out.push('---', '', `## ${head.agent}${at ? ` · ${when(at, tz)}` : ''}`, '');
    const worked = [x.end?.durationMs ? `Worked for ${duration(x.end.durationMs)}` : '', steps.length ? `${steps.length} step${steps.length === 1 ? '' : 's'}` : '', x.end?.status === 'interrupted' ? 'stopped' : x.end?.status === 'failed' ? 'failed' : ''].filter(Boolean);
    if (steps.length && worked.length) out.push(`*${worked.join(' · ')}*`, '');
    for (const r of reply) out.push(replyMarkdown(r.text.trim(), { noWebPictures: o.noWebPictures }), '');
    if (files.length) {
      out.push(`**Files${files.length === 1 ? '' : ` (${files.length})`}**`, '');
      for (const f of files) out.push(`- ${path.basename(f.path)}${f.caption ? ` — ${f.caption.replace(/\s+/g, ' ')}` : ''}`);
      out.push('');
      if (o.showFiles) {
        const pics = files.filter((f) => PICTURE.test(f.path));
        for (const f of pics) out.push(`![${path.basename(f.path)}](${/\s/.test(f.path) ? `<${f.path}>` : f.path})`, '');
      }
    }
  }
  const done = when(o.now ?? Date.now(), tz);
  out.push('---', '', `*Exported from Hydor on ${done}*`, '');
  return out.join('\n').replace(/\n{3,}/g, '\n\n');
}

/** A file name from a title: what a file system takes, not too long. */
export const fileNameOf = (title: string, ext: string) =>
  `${
    title
      .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80) || 'Conversation'
  }.${ext}`;

/** The pictures of your messages, kept as the Library's own pictures (`keep` stores one and gives its address). */
async function messagePictures(items: TimelineItem[], transcript: string | null, keep: (data: Buffer) => string | null): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (!transcript) return out;
  for (const it of items) {
    if (it.kind !== 'user' || !it.images || it.imageAt === undefined) continue;
    try {
      const line = await readLineAt(transcript, it.imageAt);
      const found = line ? imagesIn(JSON.parse(line)) : [];
      const srcs = found.flatMap((img) => (img.data && /^image\/(png|jpeg|gif|webp)$/.test(img.mime) ? [keep(img.data)] : [])).filter((s): s is string => !!s);
      if (srcs.length) out.set(it.id, srcs);
    } catch {}
  }
  return out;
}

export interface ExportDeps {
  db: DB;
  sessions: SessionManager;
  /** Makes a Library document of Markdown (pages' own way, as save_doc does), its pictures taken in. */
  saveDoc: (o: { title: string; markdown: string; cwd: string; sessionKey: string; folder?: unknown; space?: unknown }) => Promise<{ page: unknown; notes: string[] }>;
  /** Keeps a picture as the Library's own; its address (naget-asset:…). */
  keepPicture: (data: Buffer) => string | null;
}

/** The session's export, as the routes and the command make it. */
async function exportOf(d: ExportDeps, key: string, forDoc: boolean) {
  const s = d.sessions.summary(key);
  if (!s) throw new HttpError(404, 'Session not found');
  const tl = await d.sessions.timeline(key);
  const items = tl.parser.items;
  const closed = isConfidential(s.extra);
  const head: ExportHead = { title: s.title || s.firstPrompt || 'Conversation', agent: agentName(s.agent, s.acpAgent, s.acpName), createdAt: s.createdAt, cwd: s.cwd };
  const pictures = forDoc ? await messagePictures(items, d.sessions.transcriptOf(key), d.keepPicture) : undefined;
  const markdown = sessionMarkdown(head, items, { pictures, showFiles: forDoc, noWebPictures: forDoc && closed, timeZone: userTimezone(d.db), home: os.homedir() });
  return { s, head, markdown };
}

export function exportRoutes(app: FastifyInstance, d: ExportDeps, K: (req: FastifyRequest) => string) {
  /** The conversation as a Markdown file (`format=md`, the one there is), to download. */
  app.get('/api/sessions/:key/export', async (req, reply) => {
    const q = req.query as { format?: string; download?: string };
    const format = (q.format ?? 'md').toLowerCase();
    if (format !== 'md' && format !== 'markdown') throw new HttpError(400, 'A session exports as Markdown: format=md');
    const { head, markdown } = await exportOf(d, K(req), false);
    const name = fileNameOf(head.title, 'md');
    return reply
      .header('Content-Type', 'text/markdown; charset=utf-8')
      .header('Content-Disposition', `${q.download === '0' ? 'inline' : 'attachment'}; filename="${name.replace(/[^\x20-\x7e]|"/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`)
      .send(markdown);
  });
  /** The conversation as a document in the Library (in the session's project, or the folder or project asked for). */
  app.post('/api/sessions/:key/export/doc', async (req) => {
    const key = K(req);
    const b = (req.body ?? {}) as { folder?: unknown; space?: unknown; title?: unknown };
    const { s, head, markdown } = await exportOf(d, key, true);
    const title = typeof b.title === 'string' && b.title.trim() ? b.title.trim().slice(0, 200) : head.title;
    return d.saveDoc({ title, markdown, cwd: s.cwd ?? os.homedir(), sessionKey: key, folder: b.folder, space: b.space });
  });
}
