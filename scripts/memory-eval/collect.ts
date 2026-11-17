// Step 1 of the memory evaluation: the test collection, from a copy of the app's database and the agents' transcripts.
// A query is a message a user wrote (their own words) in a session inside a git repository. Its pool is the notes and
// topics of that repository and of "global" that existed when it was written. Its positives, by source:
//   a  notes the agent found with recall later in the same session (the transcript's recall results),
//   b  notes in the pool the agent (or the learning pass) changed or deleted later in that session (memory_history),
//   c  notes whose backticked spans or file paths appear in the session's later commands or files.
// Writes collection.json to OUT (it holds the texts: it stays on this machine, never in the repository).
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { splitRunMessage } from '../../shared/automations.ts';
import { ownWords } from '../../server/memory/learn.ts';
import { repoRoot, words } from '../../server/memory/store.ts';
import { assertCopy, DB_COPY, inPool, OUT, type Collection, type NoteRec, type QueryRec, type Version } from './common.ts';

assertCopy(DB_COPY);
const db = new Database(DB_COPY, { readonly: true });

// ---- notes with their texts over time ---------------------------------------------------------------

interface Row {
  id: number;
  scope: 'global' | 'repo';
  scope_key: string;
  kind: 'note' | 'topic';
  text: string;
  status: string;
  created_at: number;
  updated_at: number;
}
const rows = db.prepare("select id, scope, scope_key, kind, text, status, created_at, updated_at from memory_entries where scope in ('global','repo') and kind in ('note','topic')").all() as Row[];
const hist = db.prepare('select entry, at, action, before, after, session, source from memory_history order by at, id').all() as {
  entry: number;
  at: number;
  action: string;
  before: string | null;
  after: string | null;
  session: string | null;
  source: string;
}[];
const histOf = new Map<number, typeof hist>();
for (const h of hist) (histOf.get(h.entry) ?? histOf.set(h.entry, []).get(h.entry)!).push(h);
const links = db.prepare('select parent, child from memory_links').all() as { parent: number; child: number }[];
const kids = new Map<number, number[]>();
for (const l of links) (kids.get(l.parent) ?? kids.set(l.parent, []).get(l.parent)!).push(l.child);

const notes: Record<number, NoteRec> = {};
for (const r of rows) {
  const hs = histOf.get(r.id) ?? [];
  const ups = hs.filter((h) => h.action === 'updated' && h.after != null);
  const added = hs.find((h) => h.action === 'added');
  const versions: Version[] = [{ at: r.created_at, text: ups[0]?.before ?? added?.after ?? r.text }];
  for (const u of ups) if (u.after !== versions[versions.length - 1].text) versions.push({ at: u.at, text: u.after! });
  if (versions[versions.length - 1].text !== r.text) versions.push({ at: r.updated_at, text: r.text });
  const gone = r.status === 'deleted' ? ([...hs].reverse().find((h) => h.action === 'deleted')?.at ?? r.updated_at) : Infinity;
  notes[r.id] = { id: r.id, scope: r.scope, scopeKey: r.scope_key, kind: r.kind, created: r.created_at, deleted: gone, versions, children: (kids.get(r.id) ?? []).filter((c) => rows.some((x) => x.id === c)) };
}

// ---- spans a note names (for positives of kind c) ----------------------------------------------------

/** A relative path with a file name, as learn.ts finds them. */
const PATH = /(?:^|[\s(`'"])((?:[\w.-]+\/)+[\w.-]+\.[a-z0-9]{1,6})(?=$|[\s)`'",;:]|\.(?:\s|$))/gi;
export function spansOf(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/`([^`\n]{4,80})`/g)) out.add(m[1].trim());
  for (const m of text.matchAll(PATH)) if (!m[1].includes('://')) out.add(m[1]);
  return [...out].filter((s) => s.length >= 4);
}
const spansByVersion = new Map<string, string[]>();
const allSpans = new Set<string>();
for (const n of Object.values(notes))
  n.versions.forEach((v, i) => {
    const s = spansOf(v.text);
    spansByVersion.set(`${n.id}:${i}`, s);
    for (const x of s) allSpans.add(x);
  });
const spanList = [...allSpans];

// ---- sessions, their messages and what came after ---------------------------------------------------

const firstNote = Math.min(...rows.map((r) => r.created_at));
const sessions = db
  .prepare("select key, agent, cwd, path, created_at from sessions where parent_key is null and hidden = 0 and cwd is not null and updated_at >= ? order by created_at")
  .all(firstNote) as { key: string; agent: string; cwd: string; path: string; created_at: number }[];

const chunksOf = db.prepare("select kind, ts, text from chunk_text where key = ? and kind in ('user','command','file') order by id");

/** The start of a text, as a key for matching a message of the transcript with its indexed text. */
const head = (t: string) => t.replace(/\s+/g, ' ').trim().slice(0, 80);

/**
 * What a transcript holds that this needs: the notes the agent found with recall (when, and which), and the beginnings of
 * the messages other agent sessions sent into it (they arrive as user messages but are not the user's words).
 */
function scan(file: string): { recalls: { ts: number; ids: number[] }[]; machine: Set<string> } | null {
  if (!fs.existsSync(file)) return null;
  const uses = new Map<string, number>();
  const out: { ts: number; ids: number[] }[] = [];
  const machine = new Set<string>();
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line) continue;
    if (line.includes('<cross-session-message')) {
      for (const m of line.matchAll(/<cross-session-message[^>]*>\\n([\s\S]*?)\\n<\/cross-session-message>/g))
        try {
          machine.add(head(JSON.parse(`"${m[1]}"`)));
        } catch {}
      continue;
    }
    const isUse = line.includes('"tool_use"') && line.includes('recall');
    const isRes = !isUse && uses.size > 0 && line.includes('"tool_result"') && [...uses.keys()].some((id) => line.includes(id));
    if (!isUse && !isRes) continue;
    let o: any;
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    const content = o?.message?.content;
    if (!Array.isArray(content)) continue;
    for (const b of content) {
      if (b?.type === 'tool_use' && typeof b.name === 'string' && /(^|__)recall$/.test(b.name)) uses.set(b.id, Date.parse(o.timestamp));
      else if (b?.type === 'tool_result' && uses.has(b.tool_use_id)) {
        const text = typeof b.content === 'string' ? b.content : Array.isArray(b.content) ? b.content.map((x: any) => x?.text ?? '').join('\n') : '';
        const ids = [...text.matchAll(/^#(\d+) · /gm)].map((m) => Number(m[1]));
        out.push({ ts: uses.get(b.tool_use_id)!, ids });
      }
    }
  }
  return { recalls: out, machine };
}

/** Messages that agents or the app wrote, not the user: tagged ones, and what a lead agent hands to a member ("You are …"). */
const MACHINE = /^(\[[^\]\n]{3,800}\]|Message from the session that started you|Another Claude session sent|<cross-session-message|Heads-up from the|Acknowledged:|Ack from the|FYI:|Continue where you left off\.?$|Work reached its usage limit|This is a quick check of how sessions start)|[A-Z_]+ is saved in the vault now/;

interface Sess {
  index: number;
  key: string;
  repo: string;
  turns: { ts: number; text: string }[];
  recalls: { ts: number; ids: number[] }[] | null;
  /** For each span, when it last appeared in a command or file of the session. */
  spanLast: Map<string, number>;
}
const sess: Sess[] = [];
const spanSessions = new Map<string, number>();
let withChunks = 0;
let dropped = 0;
let briefs = 0;
for (const s of sessions) {
  const repo = repoRoot(s.cwd);
  if (!repo || !fs.existsSync(path.join(repo, '.git'))) continue;
  const turns: Sess['turns'] = [];
  const spanLast = new Map<string, number>();
  const tr = s.agent === 'claude' ? scan(s.path) : null;
  for (const c of chunksOf.iterate(s.key) as Iterable<{ kind: string; ts: number; text: string }>) {
    if (c.kind === 'user') {
      if (splitRunMessage(c.text)) continue;
      const own = ownWords(c.text);
      if (own && words(own).length >= 2 && !MACHINE.test(own) && !tr?.machine.has(head(own))) turns.push({ ts: c.ts, text: own });
      else if (own) dropped++;
    } else {
      for (const sp of spanList) if (c.text.includes(sp)) spanLast.set(sp, Math.max(spanLast.get(sp) ?? 0, c.ts));
    }
  }
  // A session whose first message is a brief from a lead agent ("You are …") is not the user's.
  if (!turns.length || /^You are /.test(turns[0].text)) {
    briefs += turns.length ? 1 : 0;
    continue;
  }
  withChunks++;
  for (const sp of spanLast.keys()) spanSessions.set(sp, (spanSessions.get(sp) ?? 0) + 1);
  sess.push({ index: sess.length, key: s.key, repo, turns, recalls: tr?.recalls ?? null, spanLast });
}
/** A span in more than this share of the sessions says nothing about one note (npm run build, package.json). */
const COMMON = 0.15;
const common = new Set([...spanSessions].filter(([, n]) => n / withChunks > COMMON).map(([s]) => s));

// ---- queries ----------------------------------------------------------------------------------------

const changes = hist.filter((h) => ['updated', 'deleted', 'basis'].includes(h.action) && h.session);
const changesBySession = new Map<string, typeof hist>();
for (const h of changes) (changesBySession.get(h.session!) ?? changesBySession.set(h.session!, []).get(h.session!)!).push(h);

/** Of each recall result, the notes at its top that count as found on purpose (the tool lists 25 whatever they are). */
const TOP = 5;
/** A query's number: the same each time this runs (judgements are kept by it), from its session and time. */
const stable = (key: string, ts: number) => {
  let x = 2166136261;
  for (const c of `${key}|${ts}`) x = Math.imul(x ^ c.charCodeAt(0), 16777619) >>> 0;
  return x;
};
const queries: QueryRec[] = [];
for (const s of sess) {
  s.turns.forEach((t, i) => {
    const pool = Object.values(notes).filter((n) => (n.scope === 'global' || n.scopeKey === s.repo) && inPool(n, t.ts));
    if (!pool.length) return;
    const ids = new Set(pool.map((n) => n.id));
    const a = new Set<number>();
    const aTop = new Set<number>();
    let recallCalls = 0;
    for (const r of s.recalls ?? [])
      if (r.ts > t.ts) {
        recallCalls++;
        for (const id of r.ids) if (ids.has(id)) a.add(id);
        for (const id of r.ids.slice(0, TOP)) if (ids.has(id)) aTop.add(id);
      }
    const b = new Set<number>();
    const bAgent = new Set<number>();
    for (const h of changesBySession.get(s.key) ?? [])
      if (h.at > t.ts && ids.has(h.entry)) {
        b.add(h.entry);
        if (h.source === 'agent') bAgent.add(h.entry);
      }
    const c = new Set<number>();
    for (const n of pool) {
      const v = notes[n.id].versions;
      let k = 0;
      v.forEach((x, j) => {
        if (x.at <= t.ts) k = j;
      });
      for (const sp of spansByVersion.get(`${n.id}:${k}`) ?? []) if (!common.has(sp) && (s.spanLast.get(sp) ?? 0) > t.ts) c.add(n.id);
    }
    queries.push({ qid: stable(s.key, t.ts), session: s.index, turn: i, ts: t.ts, repo: s.repo, text: t.text, pool: pool.map((n) => n.id), pos: { a: [...a], b: [...b], c: [...c] }, bAgent: [...bAgent], aTop: [...aTop], recallCalls, hasTranscript: s.recalls != null });
  });
}

const collection: Collection = { notes, queries };
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'collection.json'), JSON.stringify(collection));
console.log(`left out: ${dropped} messages by agents or the app, ${briefs} sessions begun by a lead agent's brief`);
console.log(`notes ${Object.keys(notes).length}, sessions ${sess.length}, queries ${queries.length}`);
const any = (q: QueryRec) => q.pos.a.length + q.pos.b.length + q.pos.c.length > 0;
console.log(
  `queries with positives: any ${queries.filter(any).length}, a ${queries.filter((q) => q.pos.a.length).length}, b ${queries.filter((q) => q.pos.b.length).length}, c ${queries.filter((q) => q.pos.c.length).length}; first messages ${queries.filter((q) => q.turn === 0).length}`,
);
console.log(`common spans dropped: ${common.size} of ${spanList.length}`);
