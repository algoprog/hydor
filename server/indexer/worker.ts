// Indexer worker: keeps the `sessions` table and the search index in step with the
// transcripts on disk. Runs in a worker thread so large first scans never block requests.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parentPort, workerData } from 'node:worker_threads';
import { openDb } from '../db.ts';
import { ClaudeParser } from '../history/claude.ts';
import { CodexParser } from '../history/codex.ts';
import { AcpParser } from '../history/acp.ts';
import { PARSE_VERSION } from '../history/common.ts';
import { LineSplitter } from '../runner/frames.ts';
import { keep, keptPath, restore } from './kept.ts';

interface Opts {
  dbPath: string;
  /** History folders: the default account's, then any others' (they can change while running). */
  claudeProjectsDirs: string[];
  codexHomes: string[];
  /** Transcripts the app writes for ACP agents' sessions. */
  acpDir: string;
  /** Where the app keeps its own link to every Claude Code and Codex transcript (kept.ts). */
  keptDir?: string;
}

const opts = workerData as Opts;
const db = openDb(opts.dbPath);
const port = parentPort!;

interface FileRef {
  path: string;
  agent: 'claude' | 'codex' | 'acp';
  size: number;
  mtime: number;
  /** Claude subagent transcript: the session that spawned it. */
  parent?: string;
}

const UUID_TAIL = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/;

function listFiles(): FileRef[] {
  const out: FileRef[] = [];
  const add = (p: string, agent: FileRef['agent'], parent?: string) => {
    try {
      const st = fs.statSync(p);
      if (st.isFile()) out.push({ path: p, agent, size: st.size, mtime: Math.floor(st.mtimeMs), parent });
    } catch {}
  };
  const UUID_DIR = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  for (const root of opts.claudeProjectsDirs)
  try {
    for (const dir of fs.readdirSync(root)) {
      const d = path.join(root, dir);
      let names: string[];
      try {
        names = fs.readdirSync(d);
      } catch {
        continue;
      }
      for (const n of names) {
        if (n.endsWith('.jsonl') && UUID_TAIL.test(n)) add(path.join(d, n), 'claude');
        else if (UUID_DIR.test(n)) {
          // <session>/subagents/agent-<id>.jsonl: work done by that session's subagents.
          const sub = path.join(d, n, 'subagents');
          let subs: string[] = [];
          try {
            subs = fs.readdirSync(sub);
          } catch {}
          for (const s of subs) if (s.startsWith('agent-') && s.endsWith('.jsonl')) add(path.join(sub, s), 'claude', `claude:${n}`);
        }
      }
    }
  } catch {}
  const walk = (d: string, depth: number) => {
    let ents: fs.Dirent[];
    try {
      ents = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      const p = path.join(d, e.name);
      if (e.isDirectory() && depth < 4) walk(p, depth + 1);
      else if (e.isFile() && e.name.startsWith('rollout-') && e.name.endsWith('.jsonl')) add(p, 'codex');
    }
  };
  for (const home of opts.codexHomes) {
    walk(path.join(home, 'sessions'), 0);
    walk(path.join(home, 'archived_sessions'), 3);
  }
  try {
    for (const n of fs.readdirSync(opts.acpDir)) if (n.endsWith('.jsonl')) add(path.join(opts.acpDir, n), 'acp');
  } catch {}
  return out;
}

function headHash(p: string): string {
  const fd = fs.openSync(p, 'r');
  try {
    const buf = Buffer.alloc(512);
    const n = fs.readSync(fd, buf, 0, 512, 0);
    return crypto.createHash('sha1').update(buf.subarray(0, n)).digest('hex');
  } finally {
    fs.closeSync(fd);
  }
}

// ---- Codex thread names (session_index.jsonl, latest entry wins) --------------

let codexNames = new Map<string, string>();
let namesStamp = '';
function refreshCodexNames(): boolean {
  // Every Codex home's index (each account keeps its own), read again when any of them changes.
  const files = opts.codexHomes.map((h) => path.join(h, 'session_index.jsonl'));
  const stamps: string[] = [];
  for (const p of files) {
    try {
      const st = fs.statSync(p);
      stamps.push(`${p}:${st.size}:${st.mtimeMs}`);
    } catch {}
  }
  const stamp = stamps.join('|');
  if (!stamps.length || stamp === namesStamp) return false;
  namesStamp = stamp;
  const names = new Map<string, string>();
  for (const p of files) {
    let text = '';
    try {
      text = fs.readFileSync(p, 'utf8');
    } catch {
      continue;
    }
    for (const line of text.split('\n')) {
      if (!line) continue;
      try {
        const j = JSON.parse(line);
        if (j.id && j.thread_name) names.set(j.id, j.thread_name);
      } catch {}
    }
  }
  codexNames = names;
  return true;
}

// ---- parsing ---------------------------------------------------------------

const getRow = db.prepare('select key, size, mtime, offset, head, parse_version, state from sessions where path = ?');
const upsert = db.prepare(`
  insert into sessions (key, agent, id, path, size, mtime, offset, head, parse_version, state, cwd, git_branch, title,
    first_prompt, last_prompt, model, source, cli_version, created_at, updated_at, user_msgs, assistant_msgs, tool_calls,
    commands, bg_commands, files_changed, lines_added, lines_removed, turns, tokens_in, tokens_out, tokens_cached,
    cost_usd, gen_ms, work_ms, parent_key, hidden, bg_tasks)
  values (@key, @agent, @id, @path, @size, @mtime, @offset, @head, @parse_version, @state, @cwd, @git_branch, @title,
    @first_prompt, @last_prompt, @model, @source, @cli_version, @created_at, @updated_at, @user_msgs, @assistant_msgs,
    @tool_calls, @commands, @bg_commands, @files_changed, @lines_added, @lines_removed, @turns, @tokens_in, @tokens_out,
    @tokens_cached, @cost_usd, @gen_ms, @work_ms, @parent_key, @hidden, @bg_tasks)
  on conflict(key) do update set
    agent = excluded.agent, id = excluded.id, path = excluded.path, size = excluded.size, mtime = excluded.mtime,
    offset = excluded.offset, head = excluded.head, parse_version = excluded.parse_version, state = excluded.state,
    cwd = excluded.cwd, git_branch = excluded.git_branch, title = excluded.title, first_prompt = excluded.first_prompt,
    last_prompt = excluded.last_prompt, model = excluded.model, source = excluded.source, cli_version = excluded.cli_version,
    created_at = excluded.created_at, updated_at = excluded.updated_at, user_msgs = excluded.user_msgs,
    assistant_msgs = excluded.assistant_msgs, tool_calls = excluded.tool_calls, commands = excluded.commands,
    bg_commands = excluded.bg_commands, files_changed = excluded.files_changed, lines_added = excluded.lines_added,
    lines_removed = excluded.lines_removed, turns = excluded.turns, tokens_in = excluded.tokens_in,
    tokens_out = excluded.tokens_out, tokens_cached = excluded.tokens_cached, cost_usd = excluded.cost_usd, gen_ms = excluded.gen_ms, work_ms = excluded.work_ms,
    parent_key = excluded.parent_key, hidden = excluded.hidden, bg_tasks = excluded.bg_tasks`);
const delChunks = db.prepare('delete from chunk_text where key = ?');
const addChunk = db.prepare('insert into chunk_text (key, kind, ts, text) values (?, ?, ?, ?)');
const delActivity = db.prepare('delete from activity where key = ?');
const unretire = db.prepare('delete from retired where key = ?');
const ACT_COLS = ['prompts', 'turns', 'messages', 'tool_calls', 'commands', 'file_edits', 'lines_added', 'lines_removed', 'tokens_in', 'tokens_cached', 'tokens_out', 'gen_ms'];
const addActivity = db.prepare(
  `insert into activity (key, root, agent, hour, ${ACT_COLS.join(', ')}) values (?, ?, ?, ?, ${ACT_COLS.map(() => '?').join(', ')})
   on conflict(key, hour) do update set ${ACT_COLS.map((c) => `${c} = ${c} + excluded.${c}`).join(', ')}`,
);
const setTitle = db.prepare('update sessions set title = ? where key = ? and (title is null or title != ?)');

async function indexFile(f: FileRef): Promise<string | null> {
  const row = getRow.get(f.path) as
    | { key: string; size: number; mtime: number; offset: number; head: string; parse_version: number; state: string | null }
    | undefined;
  if (row && row.size === f.size && row.mtime === f.mtime && row.parse_version === PARSE_VERSION[f.agent]) return null;

  let head: string;
  try {
    head = headHash(f.path);
  } catch {
    return null;
  }
  // ACP transcripts are small and read whole each time they change.
  const incremental = f.agent !== 'acp' && !!row && row.parse_version === PARSE_VERSION[f.agent] && row.head === head && f.size >= row.offset && !!row.state;
  const parserOpts = { retain: false, collectChunks: true, collectActivity: true, sidechain: !!f.parent };
  let parser: ClaudeParser | CodexParser | AcpParser;
  if (incremental) {
    const state = JSON.parse(row!.state!);
    parser = f.agent === 'claude' ? ClaudeParser.fromState(state, parserOpts) : CodexParser.fromState(state, parserOpts);
  } else {
    parser = f.agent === 'claude' ? new ClaudeParser(parserOpts) : f.agent === 'codex' ? new CodexParser(parserOpts) : new AcpParser(parserOpts);
  }
  let offset = incremental ? row!.offset : 0;

  // Only complete lines are consumed; the offset stops at the last newline.
  const fd = fs.openSync(f.path, 'r');
  const splitter = new LineSplitter();
  try {
    const buf = Buffer.allocUnsafe(4 << 20);
    let pos = offset;
    let lastNl = offset;
    while (pos < f.size) {
      const n = fs.readSync(fd, buf, 0, Math.min(buf.length, f.size - pos), pos);
      if (n <= 0) break;
      const chunk = buf.subarray(0, n);
      const nl = chunk.lastIndexOf(10);
      if (nl >= 0) lastNl = pos + nl + 1;
      pos += n;
      splitter.push(Buffer.from(chunk), (line) => parser.feed(line));
      if (parser.chunks.length > 5000) await yieldTick();
    }
    offset = lastNl;
  } finally {
    fs.closeSync(fd);
  }

  const s = parser.summary;
  const idFromName = f.path.match(UUID_TAIL)?.[1];
  // The file name carries the session id; the content can repeat another session's (forks).
  const id = f.agent === 'claude' || f.agent === 'acp' ? path.basename(f.path, '.jsonl') : (idFromName ?? s.id ?? path.basename(f.path));
  const key = `${f.agent}:${id}`;
  const st = parser.stats;
  const codexParent = parser instanceof CodexParser ? parser.summary.parentId : undefined;
  const parentKey = f.parent ?? (codexParent ? `codex:${codexParent}` : undefined);
  const title = f.agent === 'codex' ? codexNames.get(id) ?? parser.title() : parser.title();

  db.transaction(() => {
    if (!incremental) {
      delChunks.run(key);
      delActivity.run(key);
      // Back again (the whole transcript is read): no longer a session without one.
      unretire.run(key);
    }
    for (const [hour, c] of parser.act?.hours ?? []) {
      addActivity.run(key, parentKey ?? key, f.agent, hour, c.prompts, c.turns, c.messages, c.toolCalls, c.commands, c.fileEdits, c.linesAdded, c.linesRemoved, c.tokensIn, c.tokensCached, c.tokensOut, c.genMs);
    }
    for (const c of parser.chunks) addChunk.run(key, c.kind, c.ts ?? null, c.text);
    upsert.run({
      key,
      agent: f.agent,
      id,
      path: f.path,
      size: f.size,
      mtime: f.mtime,
      offset,
      head,
      parse_version: PARSE_VERSION[f.agent],
      state: JSON.stringify(parser.toState()),
      cwd: s.cwd ?? null,
      git_branch: s.gitBranch ?? null,
      title: title ?? null,
      first_prompt: s.firstPrompt ?? null,
      last_prompt: s.lastPrompt ?? null,
      model: s.model ?? null,
      source: s.source ?? null,
      cli_version: s.version ?? null,
      created_at: s.createdAt ?? f.mtime,
      updated_at: s.updatedAt ?? f.mtime,
      user_msgs: st.userMessages,
      assistant_msgs: st.assistantMessages,
      tool_calls: st.toolCalls,
      commands: st.commands,
      bg_commands: st.backgroundCommands,
      files_changed: st.filesChanged,
      lines_added: st.linesAdded,
      lines_removed: st.linesRemoved,
      turns: st.turns,
      tokens_in: st.tokensIn,
      tokens_out: st.tokensOut,
      tokens_cached: st.tokensCached,
      cost_usd: st.costUsd ?? null,
      gen_ms: st.genMs ?? 0,
      work_ms: Math.round(st.workMs ?? 0),
      parent_key: parentKey ?? null,
      hidden: parentKey || st.userMessages === 0 ? 1 : 0,
      bg_tasks: parser instanceof ClaudeParser && parser.bg.size ? JSON.stringify([...parser.bg.values()]) : null,
    });
  })();
  return key;
}

const yieldTick = () => new Promise((r) => setImmediate(r));

// ---- loop --------------------------------------------------------------------

const urgent = new Set<string>();
let busy = false;

async function pass(initial: boolean) {
  if (busy) return;
  busy = true;
  try {
    const namesChanged = refreshCodexNames();
    const files = listFiles();
    const known = new Set(files.map((f) => f.path));
    // The app keeps its own link to every transcript, whatever the agent's program later deletes.
    const roots = [...opts.claudeProjectsDirs, ...opts.codexHomes];
    const keptOf = (p: string) => (opts.keptDir ? keptPath(p, roots, opts.keptDir) : null);
    for (const f of files) {
      const k = f.agent === 'acp' ? null : keptOf(f.path);
      if (k)
        try {
          keep(f.path, k);
        } catch {}
    }
    // Newest first, so a cold start shows recent sessions right away.
    files.sort((a, b) => (urgent.has(b.path) ? 1 : 0) - (urgent.has(a.path) ? 1 : 0) || b.mtime - a.mtime);
    urgent.clear();
    let changed: string[] = [];
    let done = 0;
    for (const f of files) {
      try {
        const key = await indexFile(f);
        if (key) changed.push(key);
      } catch (e) {
        port.postMessage({ type: 'error', path: f.path, message: (e as Error).message });
      }
      done++;
      if (changed.length >= 25 || (initial && done % 50 === 0)) {
        port.postMessage({ type: 'updated', keys: changed, done, total: files.length, running: true });
        changed = [];
      }
      if (urgent.size) break;
    }
    if (namesChanged) {
      const tx = db.transaction(() => {
        for (const [id, name] of codexNames) if (setTitle.run(name, `codex:${id}`, name).changes) changed.push(`codex:${id}`);
      });
      tx();
    }
    // Transcripts deleted outside the app (Claude Code prunes its own after 30 days unless told otherwise) come
    // back from the app's own link. One the app never kept: the session leaves the list, but its activity stays
    // for the stats, with its folder and model.
    const rows = db.prepare('select key, path from sessions').all() as { key: string; path: string }[];
    const gone = rows.filter((r) => {
      // Listed, or put there since the listing (a session moved to another account).
      if (known.has(r.path) || fs.existsSync(r.path)) return false;
      const k = keptOf(r.path);
      return !(k && restore(r.path, k));
    });
    if (gone.length && files.length) {
      const retire = db.prepare('insert or replace into retired (key, cwd, model, acp_agent) select s.key, s.cwd, s.model, a.acp_agent from sessions s left join app_sessions a on a.key = s.key where s.key = ?');
      db.transaction(() => {
        for (const r of gone) {
          retire.run(r.key);
          delChunks.run(r.key);
          db.prepare('delete from sessions where key = ?').run(r.key);
        }
      })();
    }
    port.postMessage({ type: 'updated', keys: changed, removed: gone.map((r) => r.key), done: files.length, total: files.length, running: false });
  } finally {
    busy = false;
    // A poke arrived mid-pass: serve it now rather than at the next tick.
    if (urgent.size) setImmediate(() => pass(false).catch(() => {}));
  }
}

port.on('message', (msg: { type: string; paths?: string[]; claudeProjectsDirs?: string[]; codexHomes?: string[] }) => {
  if (msg.type === 'roots' && msg.claudeProjectsDirs && msg.codexHomes) {
    opts.claudeProjectsDirs = msg.claudeProjectsDirs;
    opts.codexHomes = msg.codexHomes;
    pass(false).catch(() => {});
  }
  if (msg.type === 'poke') {
    for (const p of msg.paths ?? []) urgent.add(p);
    pass(false).catch(() => {});
  }
});

(async () => {
  await pass(true);
  setInterval(() => pass(false).catch(() => {}), 5000);
})();
