// The "New email" watcher: a scheduled task's check that reads a folder of a connected mail account without a model
// and starts one run per new email (at most MAX_RUNS a check; older ones beyond that summed up in a line), each
// with the email as outside data and its attachments saved in the task's folder. It keeps the folder's UIDVALIDITY
// and the highest UID it has seen, so an email never starts two runs, across restarts too; its first look only
// takes note of where the folder is. A server that renumbers the folder (a new UIDVALIDITY) starts it afresh.
import path from 'node:path';
import fs from 'node:fs';
import { simpleParser, type AddressObject } from 'mailparser';
import type { ImapFlow } from 'imapflow';
import type { WatchSpec } from '../../shared/automations.ts';
import type { DB } from '../db.ts';
import { findAccount, passwordOf, type MailAccount } from './accounts.ts';
import { connectImap, explain, MailError, msgId, resolveFolder, summarize, SUMMARY_QUERY } from './imap.ts';
import { bodyText, safeName, size, summaryLine, when, writeAttachments } from './tools.ts';

/** The watcher as a task keeps it (shared/automations.ts). */
export type MailWatchSpec = Extract<WatchSpec, { kind: 'mail' }>;

/** What the watcher keeps between looks. */
export interface MailWatchState {
  /** The folder's UIDVALIDITY. */
  v: string;
  /** The highest UID it has seen. */
  last: number;
}

export interface MailRun {
  report: string;
  /** What to keep once this run has started (so a restart never starts it again). */
  state: MailWatchState;
}

export interface MailCheck {
  changed: boolean;
  runs: MailRun[];
  note: string;
  sample: string;
  state: MailWatchState;
}

/** At most this many runs per check; older new mail beyond it is summed up in a line. */
export const MAX_RUNS = 10;

export interface EmailData {
  from: string;
  to: string;
  cc?: string;
  date?: Date;
  subject: string;
  text: string;
  attachments: { filename: string; content: Buffer; size: number }[];
}

/** What the watcher needs of a folder: a fake one stands in for it in the tests. */
export interface WatchBox {
  /** The folder as the server has it now: its UIDVALIDITY, the next UID, how many emails. */
  status(): Promise<{ uidValidity: string; uidNext: number; exists: number }>;
  /** The UIDs above `after` that match, in any order. */
  newUids(after: number, w: MailWatchSpec): Promise<number[]>;
  /** One email, read whole. */
  email(uid: number): Promise<EmailData | null>;
  /** The latest emails that match, as lines (the Test shows them). */
  latest(n: number, w: MailWatchSpec): Promise<string[]>;
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}\n[… ${s.length - n} more characters: read_email gives the rest]` : s);

/** The text a run starts with for one email. */
export function emailReport(account: string, folder: string, uid: number, e: EmailData, saved: string[]): string {
  return [
    `A new email in ${account}, ${folder} (its id for the email tools: ${msgId(folder, uid)}).`,
    `From: ${e.from || '(no sender)'}`,
    `To: ${e.to || '(none)'}`,
    ...(e.cc ? [`Cc: ${e.cc}`] : []),
    `Date: ${when(e.date)}`,
    `Subject: ${e.subject}`,
    e.attachments.length
      ? `Attachments: ${e.attachments.map((a, i) => `${a.filename} (${size(a.size)})${saved[i] ? `, saved as ${saved[i]}` : ''}`).join('; ')}`
      : 'Attachments: none',
    '',
    clip(e.text || '(no text)', 8000),
  ].join('\n');
}

/** Where a new email's attachments go: email-attachments/<day> <subject> (<uid>)/ in the task's folder. */
export function attachmentDir(cwd: string, e: EmailData, uid: number): string {
  const d = e.date ?? new Date();
  const dayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return path.join(cwd, 'email-attachments', safeName(`${dayStr} ${e.subject.slice(0, 60).replace(/[\\/]/g, '_')} (${uid})`));
}

/**
 * One look at a folder. `prev` is what the last look kept (undefined: the first look, which only takes note).
 * `cwd`: the task's folder, where attachments are saved; left out (the Test), nothing is saved.
 */
export async function checkBox(box: WatchBox, w: MailWatchSpec, prev: MailWatchState | undefined, o: { cwd?: string; folder: string } = { folder: 'INBOX' }): Promise<MailCheck> {
  const st = await box.status();
  const top = Math.max(0, st.uidNext - 1);
  const sample = async () => {
    const lines = await box.latest(5, w);
    return lines.length ? `The latest emails here that it would wake for:\n${lines.join('\n')}` : 'No email here matches it yet.';
  };
  if (!prev || typeof prev.v !== 'string' || !Number.isFinite(prev.last)) {
    return { changed: false, runs: [], note: `${plural(st.exists, 'email')} in ${o.folder} (first look: new mail from now on starts a run)`, sample: await sample(), state: { v: st.uidValidity, last: top } };
  }
  if (prev.v !== st.uidValidity) {
    // The server numbered the folder afresh: what is new cannot be told, so it starts again from here.
    return { changed: false, runs: [], note: `${o.folder} was renumbered by the mail server: watching for new mail from now`, sample: await sample(), state: { v: st.uidValidity, last: top } };
  }
  const found = (await box.newUids(prev.last, w)).filter((u) => u > prev.last).sort((a, b) => a - b);
  const last = Math.max(prev.last, top, ...found);
  if (!found.length) return { changed: false, runs: [], note: `${plural(st.exists, 'email')} in ${o.folder}, nothing new`, sample: await sample(), state: { v: st.uidValidity, last } };
  const take = found.slice(-MAX_RUNS);
  const rest = found.slice(0, found.length - take.length);
  const runs: MailRun[] = [];
  let restLine = '';
  if (rest.length) {
    const lines: string[] = [];
    for (const u of rest.slice(-20)) {
      const e = await box.email(u).catch(() => null);
      if (e) lines.push(`${msgId(o.folder, u)} from ${e.from || '(no sender)'}, “${e.subject}”`);
    }
    restLine = `${plural(rest.length, 'older new email')} came in too and start${rest.length === 1 ? 's' : ''} no run of ${rest.length === 1 ? 'its' : 'their'} own${lines.length ? `: ${lines.join('; ')}${rest.length > lines.length ? '; …' : ''}` : ''}.`;
  }
  for (const uid of take) {
    const e = await box.email(uid);
    if (!e) continue;
    let saved: string[] = [];
    if (o.cwd && e.attachments.length && fs.existsSync(o.cwd)) {
      try {
        saved = writeAttachments(attachmentDir(o.cwd, e, uid), e.attachments);
      } catch {
        saved = [];
      }
    }
    const report = emailReport(w.account, o.folder, uid, e, saved);
    runs.push({ report: runs.length === 0 && restLine ? `${report}\n\n(${restLine})` : report, state: { v: st.uidValidity, last: uid } });
  }
  return {
    changed: runs.length > 0,
    runs,
    note: `${plural(found.length, 'new email')}${rest.length ? `: a run for each of the newest ${take.length}, the ${rest.length} older summed up` : ''}`,
    sample: runs.map((r) => r.report.split('\n').slice(0, 6).join('\n')).join('\n\n'),
    state: { v: st.uidValidity, last },
  };
}

// ---- over IMAP -----------------------------------------------------------------------------------------

const text = (v: AddressObject | AddressObject[] | undefined) => (Array.isArray(v) ? v.map((x) => x.text).join(', ') : (v?.text ?? ''));

function criteria(w: MailWatchSpec) {
  return { ...(w.from ? { from: w.from } : {}), ...(w.subject ? { subject: w.subject } : {}), ...(w.unread ? { seen: false } : {}) };
}

/** A folder over a signed-in connection, opened read-only (nothing is marked read). */
function imapBox(c: ImapFlow, folder: string): WatchBox {
  return {
    async status() {
      const m = c.mailbox;
      if (!m || m.path !== folder) throw new Error(`${folder} is not open`);
      return { uidValidity: String(m.uidValidity), uidNext: m.uidNext, exists: m.exists };
    },
    async newUids(after, w) {
      const r = await c.search({ uid: `${after + 1}:*`, ...criteria(w) }, { uid: true });
      return r || [];
    },
    async email(uid) {
      const m = await c.fetchOne(String(uid), { uid: true, source: true }, { uid: true });
      if (!m || !m.source) return null;
      const p = await simpleParser(m.source);
      return {
        from: text(p.from),
        to: text(p.to),
        ...(p.cc ? { cc: text(p.cc) } : {}),
        ...(p.date ? { date: p.date } : {}),
        subject: (p.subject ?? '').trim() || '(no subject)',
        text: bodyText(p),
        attachments: p.attachments.filter((x) => !x.related || x.contentDisposition === 'attachment').map((x) => ({ filename: x.filename ?? 'attachment', content: x.content, size: x.size })),
      };
    },
    async latest(n, w) {
      const q = criteria(w);
      const uids = ((await c.search(Object.keys(q).length ? q : { all: true }, { uid: true })) || []).sort((a, b) => b - a).slice(0, n);
      if (!uids.length) return [];
      return (await c.fetchAll(uids.join(','), SUMMARY_QUERY, { uid: true })).map((m) => summarize(folder, m)).sort((a, b) => b.uid - a.uid).map(summaryLine);
    },
  };
}

/** The watcher's look over IMAP: a connection of its own, the folder opened afresh (so its numbers are current). */
export async function checkMail(db: DB, w: MailWatchSpec, prev: MailWatchState | undefined, o: { cwd?: string }): Promise<MailCheck> {
  let acc: MailAccount;
  try {
    acc = findAccount(db, w.account);
  } catch {
    throw new Error(`The mail account ${w.account} is not connected any more (Apps → Connected apps → Email)`);
  }
  const c = await connectImap(acc, passwordOf(db, acc.id));
  try {
    const folder = await resolveFolder(c, w.folder);
    const lock = await c.getMailboxLock(folder, { readOnly: true });
    try {
      return await checkBox(imapBox(c, folder), { ...w, account: acc.address }, prev, { cwd: o.cwd, folder });
    } finally {
      lock.release();
    }
  } catch (e) {
    throw e instanceof MailError ? e : explain(e, acc.imap, 'imap', acc.provider);
  } finally {
    await c.logout().catch(() => c.close());
  }
}
