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

create table if not exists chunk_text (
  id integer primary key,
  key text not null,
  kind text not null,
  ts integer,
  text text not null
);
create index if not exists chunk_text_key on chunk_text(key);

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

export function openDb(file = paths.db): DB {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('busy_timeout = 10000');
  db.pragma('foreign_keys = ON');
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
  ]) {
    if (appCols.has(col)) continue;
    try {
      db.exec(`alter table app_sessions add column ${col} ${type}`);
    } catch {}
  }
  const actCols = new Set((db.prepare('pragma table_info(activity)').all() as { name: string }[]).map((c) => c.name));
  if (!actCols.has('gen_ms')) {
    try {
      db.exec('alter table activity add column gen_ms integer not null default 0');
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
