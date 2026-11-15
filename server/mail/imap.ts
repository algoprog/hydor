// Reading mail over IMAP (imapflow): one connection per account, kept for a minute after its last use and used by
// one call at a time; what went wrong said in plain words (a wrong or ordinary password where an app password is
// needed, a server that is not there or does not answer, a connection that cannot be encrypted).
import { ImapFlow, type FetchMessageObject, type ImapFlowOptions, type ListResponse, type MessageAddressObject, type MessageStructureObject } from 'imapflow';
import { isLoopback, MAIL_SECURITY_TEXT, type MailServer } from '../../shared/mail.ts';
import type { DB } from '../db.ts';
import { passwordOf, type MailAccount } from './accounts.ts';
import { providerById } from './providers.ts';

/** A failure to show as it is: already in plain words. */
export class MailError extends Error {
  constructor(
    message: string,
    /** The server did not take the user name and password. */
    readonly auth = false,
  ) {
    super(message);
  }
}

const where = (s: MailServer) => `${s.host} (port ${s.port}, ${MAIL_SECURITY_TEXT[s.security]})`;

/** What went wrong reaching or signing in to a mail server, in a sentence or two. */
export function explain(e: unknown, s: MailServer, kind: 'imap' | 'smtp', provider?: string): MailError {
  if (e instanceof MailError) return e;
  const err = e as { code?: string; message?: string; authenticationFailed?: boolean; responseText?: string; response?: string; responseCode?: number };
  const code = String(err?.code ?? '');
  const said = String(err?.responseText ?? err?.response ?? '').replace(/\s+/g, ' ').trim();
  const msg = String(err?.message ?? e ?? '');
  const p = providerById(provider);
  const side = kind === 'imap' ? 'incoming (IMAP)' : 'outgoing (SMTP)';
  if (err?.authenticationFailed || code === 'EAUTH' || (kind === 'smtp' && err?.responseCode === 535)) {
    const wantsApp = /application-specific|app(lication)? password|web ?login|log ?in via your web browser|please log in|ALERT/i.test(said);
    const tip = p ? ` ${p.hint}` : ' Many providers need an app password made for mail programs, not the password you sign in with on the web.';
    return new MailError(
      wantsApp
        ? `${p?.name ?? 'Your provider'} wants an app password here, not your usual password.${tip}`
        : `Wrong password or user name: the ${side} server ${s.host} did not accept them${said ? ` (it said: ${said.slice(0, 160)})` : ''}.${tip}`,
      true,
    );
  }
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN' || /getaddrinfo/.test(msg)) return new MailError(`There is no server called ${s.host}: check the ${side} server’s name, and that this computer is online.`);
  if (code === 'ECONNREFUSED')
    return new MailError(`${where(s)} refused the connection: check the port and the security setting${isLoopback(s.host) ? ', and that the program serving mail on this computer (such as Proton Mail Bridge) is running' : ''}.`);
  if (/ETIMEDOUT|ETIMEOUT|ECONNRESET|EHOSTUNREACH|ENETUNREACH|timeout|timed out/i.test(`${code} ${msg}`))
    return new MailError(`${where(s)} did not answer in time: check the ${side} server’s name and port, or your network.`);
  if (/wrong version number|WRONG_VERSION|EPROTO|packet length too long|unknown protocol/i.test(`${code} ${msg}`))
    return new MailError(`Could not start an encrypted connection to ${where(s)}: this port may want ${s.security === 'tls' ? 'STARTTLS' : 'SSL/TLS'} instead (usually ${kind === 'imap' ? (s.security === 'tls' ? '143' : '993') : s.security === 'tls' ? '587' : '465'}).`);
  if (/CERT|SELF_SIGNED|UNABLE_TO_VERIFY|certificate/i.test(`${code} ${msg}`)) return new MailError(`${s.host}’s security certificate is not valid (${(code || msg).slice(0, 80)}), so the app will not send your password to it.`);
  if (/STARTTLS/i.test(msg)) return new MailError(`${where(s)} does not offer STARTTLS: try SSL/TLS on port ${kind === 'imap' ? 993 : 465}.`);
  return new MailError(`${kind === 'imap' ? 'Reading' : 'Sending'} mail through ${s.host} failed: ${(said || msg || 'no reason given').slice(0, 240)}`);
}

export function imapOptions(a: MailAccount, pass: string): ImapFlowOptions {
  const local = isLoopback(a.imap.host);
  return {
    host: a.imap.host,
    port: a.imap.port,
    secure: a.imap.security === 'tls',
    // STARTTLS is required unless the server is this computer and asked for none.
    doSTARTTLS: a.imap.security === 'starttls' ? true : a.imap.security === 'none' ? false : undefined,
    auth: { user: a.username, pass },
    logger: false,
    clientInfo: { name: 'Hydor' },
    disableAutoIdle: true,
    connectionTimeout: 20_000,
    greetingTimeout: 15_000,
    socketTimeout: 120_000,
    // A local bridge (Proton Mail Bridge) has a certificate of its own; nothing leaves this computer.
    ...(local ? { tls: { rejectUnauthorized: false } } : {}),
  } as ImapFlowOptions;
}

/** A signed-in connection, or a MailError saying why not. */
export async function connectImap(a: MailAccount, pass: string): Promise<ImapFlow> {
  const c = new ImapFlow(imapOptions(a, pass));
  // A connection that drops later is noticed by the next call (usable is false), never by an unhandled error.
  c.on('error', () => {});
  try {
    await c.connect();
    return c;
  } catch (e) {
    c.close();
    throw explain(e, a.imap, 'imap', a.provider);
  }
}

/** Signs in and lists the folders: whether reading works. */
export async function testImap(a: MailAccount, pass: string): Promise<number> {
  const c = await connectImap(a, pass);
  try {
    return (await c.list()).length;
  } catch (e) {
    throw explain(e, a.imap, 'imap', a.provider);
  } finally {
    await c.logout().catch(() => c.close());
  }
}

// ---- the connections kept ------------------------------------------------------------------------------

interface Slot {
  client: ImapFlow;
  stamp: number;
  timer?: NodeJS.Timeout;
}
const slots = new Map<string, Slot>();
const queues = new Map<string, Promise<unknown>>();
const IDLE_MS = 60_000;

function drop(id: string) {
  const s = slots.get(id);
  if (!s) return;
  slots.delete(id);
  if (s.timer) clearTimeout(s.timer);
  void s.client.logout().catch(() => s.client.close());
}

/** Closes every kept connection (a test's end; the server's own shutdown closes sockets anyway). */
export function closeAll() {
  for (const id of [...slots.keys()]) drop(id);
}

/**
 * Runs `fn` with a signed-in connection to the account, one call at a time per account; the connection is kept a
 * minute for the next call. A failure the server reports is turned into plain words.
 */
export function withImap<T>(db: DB, a: MailAccount, fn: (c: ImapFlow) => Promise<T>): Promise<T> {
  const prev = queues.get(a.id) ?? Promise.resolve();
  const run = prev.then(
    () => use(db, a, fn),
    () => use(db, a, fn),
  );
  queues.set(
    a.id,
    run.catch(() => {}),
  );
  return run;
}

async function use<T>(db: DB, a: MailAccount, fn: (c: ImapFlow) => Promise<T>): Promise<T> {
  let s = slots.get(a.id);
  // Changed settings or a dropped connection: a new one.
  if (s && (s.stamp !== a.updatedAt || !s.client.usable)) {
    drop(a.id);
    s = undefined;
  }
  if (!s) {
    const client = await connectImap(a, passwordOf(db, a.id));
    s = { client, stamp: a.updatedAt };
    slots.set(a.id, s);
  }
  if (s.timer) clearTimeout(s.timer);
  try {
    return await fn(s.client);
  } catch (e) {
    if (!s.client.usable) drop(a.id);
    if (e instanceof MailError) throw e;
    const said = String((e as { responseText?: string }).responseText ?? '');
    throw new MailError(`${a.address}: ${(said || (e as Error).message || 'the mail server refused').slice(0, 300)}`);
  } finally {
    const cur = slots.get(a.id);
    if (cur === s) {
      cur.timer = setTimeout(() => drop(a.id), IDLE_MS);
      cur.timer.unref?.();
    }
  }
}

// ---- folders -------------------------------------------------------------------------------------------

export const SPECIAL = ['\\Inbox', '\\Sent', '\\Drafts', '\\Trash', '\\Junk', '\\Archive', '\\All', '\\Flagged'] as const;

/** A special folder's path (\Sent, \Drafts, \Trash…), by its mark or, failing that, its usual names. */
export async function specialFolder(c: ImapFlow, use: (typeof SPECIAL)[number]): Promise<string | null> {
  if (use === '\\Inbox') return 'INBOX';
  const list = await c.list();
  const marked = list.find((f) => f.specialUse === use);
  if (marked) return marked.path;
  const names: Record<string, RegExp> = {
    '\\Sent': /^(sent|sent items|sent messages|sent mail|gesendet|envoyés|enviados)$/i,
    '\\Drafts': /^(drafts|draft|entwürfe|brouillons|borradores)$/i,
    '\\Trash': /^(trash|bin|deleted|deleted items|deleted messages|papierkorb|corbeille|papelera)$/i,
    '\\Junk': /^(junk|spam|junk e-?mail|bulk mail)$/i,
    '\\Archive': /^(archive|archives|all mail)$/i,
  };
  const re = names[use];
  return re ? (list.find((f) => re.test(f.name))?.path ?? null) : null;
}

/** Whether a folder is the bin (by its mark or its usual names). */
export const isTrash = (f: Pick<ListResponse, 'specialUse' | 'name'>) => f.specialUse === '\\Trash' || /^(trash|bin|deleted|deleted items|deleted messages|papierkorb|corbeille|papelera)$/i.test(f.name);

/** The folder an agent named, as the server spells it: by its path, its name or its mark ("Sent", "\\Sent"). */
export async function resolveFolder(c: ImapFlow, asked: string | undefined): Promise<string> {
  const want = String(asked ?? '').trim();
  if (!want || /^inbox$/i.test(want)) return 'INBOX';
  const list = await c.list();
  const lower = want.toLowerCase();
  const hit =
    list.find((f) => f.path === want) ??
    list.find((f) => f.path.toLowerCase() === lower) ??
    list.find((f) => f.specialUse?.toLowerCase() === (lower.startsWith('\\') ? lower : `\\${lower}`)) ??
    list.find((f) => f.name.toLowerCase() === lower);
  if (hit) return hit.path;
  throw new MailError(`There is no folder “${want}”. The folders: ${list.slice(0, 40).map((f) => f.path).join(', ')}.`);
}

// ---- messages ------------------------------------------------------------------------------------------

/** An email's id as agents see it: its folder and its number there ("INBOX:4521"). */
export const msgId = (folder: string, uid: number) => `${folder}:${uid}`;

export function parseId(id: unknown): { folder: string; uid: number } {
  const s = String(id ?? '').trim();
  const i = s.lastIndexOf(':');
  const uid = Number(s.slice(i + 1));
  if (i <= 0 || !Number.isInteger(uid) || uid <= 0) throw new MailError(`“${s}” is not an email id: use one search_email gave, like INBOX:4521`);
  return { folder: s.slice(0, i), uid };
}

export const addr = (a?: MessageAddressObject) => (a ? (a.name && a.address ? `${a.name} <${a.address}>` : (a.address ?? a.name ?? '')) : '');
export const addrs = (l?: MessageAddressObject[]) => (l ?? []).map(addr).filter(Boolean).join(', ');

export interface PartInfo {
  part: string;
  filename: string;
  type: string;
  size: number;
}

/** The attachments in a message's structure: parts with a file name that are not shown inline in its text. */
export function attachmentsOf(s: MessageStructureObject | undefined): PartInfo[] {
  const out: PartInfo[] = [];
  const walk = (n: MessageStructureObject) => {
    if (n.childNodes?.length) return n.childNodes.forEach(walk);
    const filename = n.dispositionParameters?.filename ?? n.parameters?.name;
    const inline = n.disposition === 'inline' && n.id;
    if ((n.disposition === 'attachment' || filename) && !inline && !/^multipart\//.test(n.type)) out.push({ part: n.part ?? '1', filename: filename || 'attachment', type: n.type, size: n.size ?? 0 });
  };
  if (s) walk(s);
  return out;
}

export interface Summary {
  id: string;
  uid: number;
  date?: Date;
  from: string;
  to: string;
  subject: string;
  unread: boolean;
  flagged: boolean;
  answered: boolean;
  attachments: PartInfo[];
  size: number;
}

export function summarize(folder: string, m: FetchMessageObject): Summary {
  const d = m.envelope?.date ?? m.internalDate;
  const date = d ? new Date(d) : undefined;
  return {
    id: msgId(folder, m.uid),
    uid: m.uid,
    ...(date && !Number.isNaN(date.getTime()) ? { date } : {}),
    from: addrs(m.envelope?.from),
    to: addrs(m.envelope?.to),
    subject: (m.envelope?.subject ?? '').replace(/\s+/g, ' ').trim() || '(no subject)',
    unread: !m.flags?.has('\\Seen'),
    flagged: !!m.flags?.has('\\Flagged'),
    answered: !!m.flags?.has('\\Answered'),
    attachments: attachmentsOf(m.bodyStructure),
    size: m.size ?? 0,
  };
}

export const SUMMARY_QUERY = { uid: true, envelope: true, flags: true, bodyStructure: true, internalDate: true, size: true } as const;
