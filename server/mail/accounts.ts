// Mail accounts: each one's address, servers and status in mail_accounts; their passwords sealed in the vault, in
// the "email" connection's sign-in (conn_apps.cred, one secret per account), so they are encrypted at rest, sealed
// again when the vault's key is replaced, and masked in whatever a tool returns. The connection exists while at
// least one account does; disconnecting it forgets them all.
import crypto from 'node:crypto';
import type { MailAccountStatus, MailAccountView, MailServer } from '../../shared/mail.ts';
import { HttpError } from '../auth.ts';
import type { DB } from '../db.ts';
import { connection, readCred, removeConnection, saveConnection, setCred } from '../connections/apps.ts';
import { catalogApp } from '../connections/catalog.ts';
import { maskHint } from '../connections/vault.ts';

/** The connection's id in the catalog (catalog/connections/email.json): the MCP server agents know it by. */
export const MAIL_APP = 'email';

export interface MailAccount {
  id: string;
  address: string;
  name?: string;
  username: string;
  smtpUsername?: string;
  imap: MailServer;
  smtp: MailServer;
  provider?: string;
  status: MailAccountStatus;
  error?: string;
  testedAt?: number;
  createdAt: number;
  updatedAt: number;
}

interface Row {
  id: string;
  address: string;
  name: string | null;
  username: string;
  smtp_username: string | null;
  imap: string;
  smtp: string;
  provider: string | null;
  status: MailAccountStatus;
  error: string | null;
  tested_at: number | null;
  created_at: number;
  updated_at: number;
}

let dbRef: DB | null = null;

/** The database the watcher and sendMail use when not given one (set when the server starts). */
export const useMailDb = (db: DB) => {
  mailTables(db);
  dbRef = db;
};
export function mailDb(): DB {
  if (!dbRef) throw new Error('Email is not set up on this server');
  return dbRef;
}
export const mailDbOrNull = () => dbRef;

export function mailTables(db: DB) {
  db.exec(`create table if not exists mail_accounts (
    id text primary key, address text not null unique collate nocase, name text, username text not null, smtp_username text,
    imap text not null, smtp text not null, provider text, status text not null default 'untested', error text, tested_at integer,
    created_at integer not null, updated_at integer not null
  )`);
}

const toAccount = (r: Row): MailAccount => ({
  id: r.id,
  address: r.address,
  ...(r.name ? { name: r.name } : {}),
  username: r.username,
  ...(r.smtp_username ? { smtpUsername: r.smtp_username } : {}),
  imap: JSON.parse(r.imap) as MailServer,
  smtp: JSON.parse(r.smtp) as MailServer,
  ...(r.provider ? { provider: r.provider } : {}),
  status: r.status,
  ...(r.error ? { error: r.error } : {}),
  ...(r.tested_at ? { testedAt: r.tested_at } : {}),
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

/** The accounts, oldest first (the first is the one tools use when none is named). */
export function listAccounts(db: DB): MailAccount[] {
  if (!connection(db, MAIL_APP)) return [];
  return (db.prepare('select * from mail_accounts order by created_at, rowid').all() as Row[]).map(toAccount);
}

function secrets(db: DB): Record<string, string> {
  try {
    return readCred(db, MAIL_APP).secrets ?? {};
  } catch {
    return {};
  }
}

export function accountView(db: DB, a: MailAccount, pw = secrets(db)[a.id]): MailAccountView {
  return {
    id: a.id,
    address: a.address,
    ...(a.name ? { name: a.name } : {}),
    username: a.username,
    ...(a.smtpUsername ? { smtpUsername: a.smtpUsername } : {}),
    imap: a.imap,
    smtp: a.smtp,
    ...(a.provider ? { provider: a.provider } : {}),
    status: a.status,
    ...(a.error ? { error: a.error } : {}),
    hint: pw ? maskHint(pw) : '',
    ...(a.testedAt ? { testedAt: a.testedAt } : {}),
    createdAt: a.createdAt,
  };
}

export const accountViews = (db: DB) => {
  const s = secrets(db);
  return listAccounts(db).map((a) => accountView(db, a, s[a.id]));
};

/**
 * An account by what an agent or a form calls it: its address, id or name (case does not matter); the first account
 * when none is named. Throws a plain message naming the accounts there are.
 */
export function findAccount(db: DB, ref?: string | null): MailAccount {
  const all = listAccounts(db);
  if (!all.length) throw new HttpError(404, 'No mail account is connected. Connect one in Apps → Connected apps → Email.');
  const r = String(ref ?? '').trim().toLowerCase();
  if (!r) return all[0];
  const hit = all.find((a) => a.address.toLowerCase() === r || a.id === r) ?? all.find((a) => a.name?.toLowerCase() === r) ?? all.find((a) => a.address.toLowerCase().startsWith(`${r}@`));
  if (!hit) throw new HttpError(404, `There is no connected mail account “${ref}”. The accounts: ${all.map((a) => a.address).join(', ')}.`);
  return hit;
}

export function passwordOf(db: DB, id: string): string {
  const pw = secrets(db)[id];
  if (!pw) throw new HttpError(409, 'This mail account has no password saved: connect it again in Apps → Connected apps → Email.');
  return pw;
}

export interface AccountInput {
  address: string;
  name?: string;
  username: string;
  smtpUsername?: string;
  imap: MailServer;
  smtp: MailServer;
  provider?: string;
  status?: MailAccountStatus;
  error?: string;
  testedAt?: number;
}

/** Keeps the connection's row and sign-in in step with the accounts: their passwords, and their addresses as its hint. */
function syncConnection(db: DB, pw: Record<string, string>) {
  const rows = db.prepare('select id, address from mail_accounts order by created_at, rowid').all() as { id: string; address: string }[];
  if (!rows.length) {
    if (connection(db, MAIL_APP)) removeConnection(db, MAIL_APP);
    return;
  }
  const kept = Object.fromEntries(rows.filter((r) => pw[r.id]).map((r) => [r.id, pw[r.id]]));
  const hint = rows.map((r) => r.address).join(', ').slice(0, 300);
  const c = connection(db, MAIL_APP);
  if (!c) {
    const entry = catalogApp(MAIL_APP);
    if (!entry) throw new HttpError(500, 'The Email connection is missing from the catalog');
    saveConnection(db, entry, { fields: {}, cred: { secrets: kept }, hint, status: 'ok' });
  } else {
    setCred(db, MAIL_APP, { ...readCred(db, MAIL_APP), secrets: kept });
    db.prepare('update conn_apps set hint = ? where id = ?').run(hint, MAIL_APP);
  }
}

/** Adds an account, or changes one (by id); the password is kept when none is given. */
export function saveAccount(db: DB, a: AccountInput, password: string | undefined, id?: string): MailAccount {
  const now = Date.now();
  const pw = secrets(db);
  const old = id ? (db.prepare('select * from mail_accounts where id = ?').get(id) as Row | undefined) : undefined;
  if (id && !old) throw new HttpError(404, 'That mail account is not connected');
  const clash = db.prepare('select id from mail_accounts where address = ? collate nocase').get(a.address) as { id: string } | undefined;
  if (clash && clash.id !== id) throw new HttpError(409, `${a.address} is connected already`);
  const key = old?.id ?? crypto.randomBytes(6).toString('hex');
  if (!password && !pw[key]) throw new HttpError(400, 'Enter the app password');
  db.transaction(() => {
    db.prepare(
      `insert into mail_accounts (id, address, name, username, smtp_username, imap, smtp, provider, status, error, tested_at, created_at, updated_at)
       values (@id, @address, @name, @username, @smtpUsername, @imap, @smtp, @provider, @status, @error, @testedAt, @now, @now)
       on conflict(id) do update set address = @address, name = @name, username = @username, smtp_username = @smtpUsername, imap = @imap, smtp = @smtp,
         provider = @provider, status = @status, error = @error, tested_at = @testedAt, updated_at = @now`,
    ).run({
      id: key,
      address: a.address,
      name: a.name || null,
      username: a.username,
      smtpUsername: a.smtpUsername && a.smtpUsername !== a.username ? a.smtpUsername : null,
      imap: JSON.stringify(a.imap),
      smtp: JSON.stringify(a.smtp),
      provider: a.provider ?? null,
      status: a.status ?? 'untested',
      error: a.error ? a.error.slice(0, 400) : null,
      testedAt: a.testedAt ?? null,
      now,
    });
    syncConnection(db, password ? { ...pw, [key]: password } : pw);
  })();
  return toAccount(db.prepare('select * from mail_accounts where id = ?').get(key) as Row);
}

export function setAccountStatus(db: DB, id: string, status: MailAccountStatus, error?: string) {
  db.prepare('update mail_accounts set status = ?, error = ?, tested_at = ? where id = ?').run(status, error ? error.slice(0, 400) : null, Date.now(), id);
}

export function removeAccount(db: DB, id: string) {
  const pw = secrets(db);
  db.transaction(() => {
    db.prepare('delete from mail_accounts where id = ?').run(id);
    delete pw[id];
    syncConnection(db, pw);
  })();
}

/** The connection was disconnected: every account goes with it. */
export function forgetAccounts(db: DB) {
  mailTables(db);
  db.prepare('delete from mail_accounts').run();
}
