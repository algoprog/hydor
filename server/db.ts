import fs from 'node:fs';
import Database from 'better-sqlite3';
import { paths } from './config.ts';

export type DB = Database.Database;

const SCHEMA = `
create table if not exists kv (k text primary key, v text not null);

create table if not exists auth_sessions (
  token_hash text primary key,
  created_at integer not null,
  last_seen integer not null,
  expires_at integer not null,
  ip text,
  ua text
);

create table if not exists sessions (
  key text primary key,
  agent text not null,
  id text not null,
  path text not null,
  size integer not null default 0,
  mtime integer not null default 0,
  offset integer not null default 0,
  head text,
  parse_version integer not null default 0,
  state text,
  cwd text,
  git_branch text,
  title text,
  first_prompt text,
  last_prompt text,
  model text,
  source text,
  cli_version text,
  created_at integer,
  updated_at integer,
  user_msgs integer not null default 0,
  assistant_msgs integer not null default 0,
  tool_calls integer not null default 0,
  commands integer not null default 0,
  bg_commands integer not null default 0,
  files_changed integer not null default 0,
  lines_added integer not null default 0,
  lines_removed integer not null default 0,
  turns integer not null default 0,
  tokens_in integer not null default 0,
  tokens_out integer not null default 0,
  tokens_cached integer not null default 0,
  cost_usd real,
  gen_ms integer not null default 0,
  work_ms integer not null default 0,
  parent_key text,
  hidden integer not null default 0,
  bg_tasks text
);
create index if not exists sessions_updated on sessions(updated_at desc);
create index if not exists sessions_path on sessions(path);

create table if not exists app_sessions (
  key text primary key,
  agent text,
  cwd text,
  first_prompt text,
  title text,
  archived integer not null default 0,
  pinned integer not null default 0,
  created_by_app integer not null default 0,
  model text,
  effort text,
  mode text,
  created_at integer,
  updated_at integer,
  sort_order real
);

create table if not exists activity (
  key text not null,
  root text not null,
  agent text not null,
  hour integer not null,
  prompts integer not null default 0,
  turns integer not null default 0,
  messages integer not null default 0,
  tool_calls integer not null default 0,
  commands integer not null default 0,
  file_edits integer not null default 0,
  lines_added integer not null default 0,
  lines_removed integer not null default 0,
  tokens_in integer not null default 0,
  tokens_cached integer not null default 0,
  tokens_out integer not null default 0,
  gen_ms integer not null default 0,
  primary key (key, hour)
) without rowid;
create index if not exists activity_hour on activity(hour);
create index if not exists activity_root on activity(root);

-- Sessions whose transcript the agent deleted (Claude Code prunes them after about 30 days): their
-- activity stays for the stats, with the folder and model it needs.
create table if not exists retired (
  key text primary key,
  cwd text,
  model text
) without rowid;

create table if not exists chunk_text (
  id integer primary key,
  key text not null,
  kind text not null,
  ts integer,
  text text not null
);
create index if not exists chunk_text_key on chunk_text(key);
-- The two kinds read across every session: the files agents touched (the Git page's repositories) and what the user
-- wrote (memory's upkeep, past conversations by meaning). Without these, each such read went through every chunk,
-- seconds of the server doing nothing else once the database is no longer in memory.
create index if not exists chunk_text_file on chunk_text(text, key, ts) where kind = 'file';
create index if not exists chunk_text_user on chunk_text(ts, key) where kind = 'user';

create virtual table if not exists chunks using fts5(
  text,
  content = 'chunk_text',
  content_rowid = 'id',
  tokenize = 'unicode61 remove_diacritics 2'
);

create trigger if not exists chunk_ai after insert on chunk_text begin
  insert into chunks(rowid, text) values (new.id, new.text);
end;
create trigger if not exists chunk_ad after delete on chunk_text begin
  insert into chunks(chunks, rowid, text) values ('delete', old.id, old.text);
end;
`;

export function openDb(file = paths.db, o: { cacheMb?: number } = {}): DB {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('busy_timeout = 10000');
  db.pragma('foreign_keys = ON');
  // Pages kept by SQLite itself, 64 MB for the server (2 MB by default): on a computer short of memory the system drops
  // the files it read first, so the pages read most stay here rather than coming back from disk on each request.
  db.pragma(`cache_size = ${-1024 * (o.cacheMb ?? 64)}`);
  db.exec(SCHEMA);
  // Columns added since the table was first created.
  const cols = new Set((db.prepare('pragma table_info(sessions)').all() as { name: string }[]).map((c) => c.name));
  if (!cols.has('bg_tasks')) {
    try {
      db.exec('alter table sessions add column bg_tasks text');
    } catch {} // the indexer's connection got there first
  }
  if (!cols.has('gen_ms')) {
    try {
      db.exec('alter table sessions add column gen_ms integer not null default 0');
    } catch {} // the indexer's connection got there first
  }
  if (!cols.has('work_ms')) {
    try {
      db.exec('alter table sessions add column work_ms integer not null default 0');
    } catch {} // the indexer's connection got there first
  }
  const appCols = new Set((db.prepare('pragma table_info(app_sessions)').all() as { name: string }[]).map((c) => c.name));
  if (!appCols.has('sort_order')) {
    try {
      db.exec('alter table app_sessions add column sort_order real');
    } catch {}
  }
  db.exec(`create table if not exists queued (id text primary key, key text not null, text text not null, images text, files text, created_at integer not null);
    create index if not exists queued_key on queued (key, created_at);`);
  // The order you dragged queued messages into (unset: the order they were queued in).
  if (!(db.prepare('pragma table_info(queued)').all() as { name: string }[]).some((c) => c.name === 'pos')) {
    try {
      db.exec('alter table queued add column pos real');
    } catch {}
  }
  for (const [col, type] of [
    ['handoff_from', 'text'],
    ['handoff_to', 'text'],
    ['done_at', 'integer'],
    ['fork_from', 'text'],
    ['seen_at', 'integer'],
    ['snooze_until', 'integer'],
    ['worktree', 'text'],
    ['pr', 'text'],
    ['account', 'text'],
    ['acp_agent', 'text'],
    ['extra', 'text'],
    // The start the page sent that made it, so the same start sent again gets this session (SessionManager.startOnce).
    ['start_id', 'text'],
  ]) {
    if (appCols.has(col)) continue;
    try {
      db.exec(`alter table app_sessions add column ${col} ${type}`);
    } catch {}
  }
  try {
    db.exec('create index if not exists app_sessions_start_id on app_sessions (start_id) where start_id is not null');
  } catch {} // the indexer's connection got there first
  // Notes the app adds to conversations (server/notes.ts).
  db.exec(`create table if not exists session_notes (
    id text primary key, key text not null, kind text not null, at integer not null, anchor text, data text not null
  )`);
  db.exec('create index if not exists session_notes_key on session_notes(key, at)');
  // How long each approval, question or form waited for the user (server/sessions.ts), for a turn's breakdown.
  db.exec('create table if not exists approval_waits (key text not null, approval text not null, kind text not null, asked_at integer not null, answered_at integer not null)');
  db.exec('create index if not exists approval_waits_key on approval_waits(key, asked_at)');
  const actCols = new Set((db.prepare('pragma table_info(activity)').all() as { name: string }[]).map((c) => c.name));
  if (!actCols.has('gen_ms')) {
    try {
      db.exec('alter table activity add column gen_ms integer not null default 0');
    } catch {}
  }
  // A deleted session's ACP agent (Custom, Gemini CLI…), so Activity still names it.
  if (!(db.prepare('pragma table_info(retired)').all() as { name: string }[]).some((c) => c.name === 'acp_agent')) {
    try {
      db.exec('alter table retired add column acp_agent text');
    } catch {}
  }
  // Holds prompts and session text: owner-only, like the transcripts it indexes.
  for (const f of [file, `${file}-wal`, `${file}-shm`]) {
    try {
      fs.chmodSync(f, 0o600);
    } catch {}
  }
  return db;
}

export function kvGet(db: DB, k: string): string | undefined {
  const row = db.prepare('select v from kv where k = ?').get(k) as { v: string } | undefined;
  return row?.v;
}

export function kvSet(db: DB, k: string, v: string) {
  db.prepare('insert into kv(k, v) values (?, ?) on conflict(k) do update set v = excluded.v').run(k, v);
}
