// Sending mail over SMTP (nodemailer) from a connected account, with a copy kept in its Sent folder (unless the
// provider keeps one itself), and drafts saved to its Drafts folder. Nothing here reads a file or an address by
// itself: attachments come as their content, read by the caller from where it may read.
import crypto from 'node:crypto';
import { createTransport } from 'nodemailer';
import MailComposer, { type MailComposerOptions } from 'nodemailer/lib/mail-composer';
import { isLoopback, MAIL_ADDRESS } from '../../shared/mail.ts';
import type { DB } from '../db.ts';
import { findAccount, mailDb, passwordOf, type MailAccount } from './accounts.ts';
import { explain, MailError, specialFolder, withImap } from './imap.ts';
import { domainOf, providerById } from './providers.ts';

export interface MailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

/** An email to send or keep as a draft. Addresses as "Name <a@b.com>" or "a@b.com", one or several (a list, or comma-separated). */
export interface OutgoingMail {
  to?: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject?: string;
  /** The plain text; with html, the text version of it. */
  text?: string;
  html?: string;
  attachments?: MailAttachment[];
  /** Threads it under an earlier message: that message's Message-ID, and the References it had plus it. */
  inReplyTo?: string;
  references?: string[];
  replyTo?: string;
}

export interface SentInfo {
  messageId: string;
  accepted: string[];
  rejected: string[];
  /** The folder a copy went to (Sent), when the app kept one. */
  savedTo?: string;
  /** Anything worth saying: the copy could not be kept. */
  note?: string;
}

/** The most an email may carry in attachments: what most providers accept. */
export const MAX_ATTACHMENTS_BYTES = 25 * 1024 * 1024;
const MAX_RECIPIENTS = 100;

/** The addresses in a list or a comma-separated string, each checked. */
export function addressList(v: unknown, field = 'to'): string[] {
  const parts = (Array.isArray(v) ? v.map(String) : typeof v === 'string' ? splitAddresses(v) : []).map((s) => s.trim()).filter(Boolean);
  for (const p of parts) {
    const bare = /<([^<>]+)>\s*$/.exec(p)?.[1] ?? p;
    if (!MAIL_ADDRESS.test(bare.trim()) || /[\r\n]/.test(p)) throw new MailError(`“${p.slice(0, 80)}” in ${field} is not an email address`);
  }
  return parts;
}

/** Splits "A <a@x.com>, \"Kim, Lee\" <k@y.com>" at the commas between addresses (not inside quotes). */
function splitAddresses(s: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (const ch of s) {
    if (ch === '"') quoted = !quoted;
    if ((ch === ',' || ch === ';') && !quoted) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

const fromOf = (a: MailAccount) => (a.name ? { name: a.name, address: a.address } : a.address);

function smtpOptions(a: MailAccount, pass: string) {
  return {
    host: a.smtp.host,
    port: a.smtp.port,
    secure: a.smtp.security === 'tls',
    requireTLS: a.smtp.security === 'starttls',
    ignoreTLS: a.smtp.security === 'none',
    auth: { user: a.smtpUsername ?? a.username, pass },
    connectionTimeout: 20_000,
    greetingTimeout: 15_000,
    socketTimeout: 60_000,
    disableFileAccess: true,
    disableUrlAccess: true,
    // A local bridge (Proton Mail Bridge) has a certificate of its own; nothing leaves this computer.
    ...(isLoopback(a.smtp.host) ? { tls: { rejectUnauthorized: false } } : {}),
  };
}

/** Signs in to the SMTP server without sending anything: whether sending works. */
export async function testSmtp(a: MailAccount, pass: string): Promise<void> {
  const t = createTransport(smtpOptions(a, pass));
  try {
    await t.verify();
  } catch (e) {
    throw explain(e, a.smtp, 'smtp', a.provider);
  } finally {
    t.close();
  }
}

function composeOptions(a: MailAccount, m: OutgoingMail, messageId: string, date: Date): MailComposerOptions {
  const to = addressList(m.to, 'to');
  const cc = addressList(m.cc, 'cc');
  const bcc = addressList(m.bcc, 'bcc');
  const size = (m.attachments ?? []).reduce((n, x) => n + x.content.length, 0);
  if (size > MAX_ATTACHMENTS_BYTES) throw new MailError(`The attachments come to ${Math.round(size / 1024 / 1024)} MB: most mail servers take at most 25 MB. Send fewer, or share a link instead.`);
  if (to.length + cc.length + bcc.length > MAX_RECIPIENTS) throw new MailError(`At most ${MAX_RECIPIENTS} recipients in one email`);
  return {
    from: fromOf(a),
    ...(to.length ? { to } : {}),
    ...(cc.length ? { cc } : {}),
    ...(bcc.length ? { bcc } : {}),
    ...(m.replyTo ? { replyTo: addressList(m.replyTo, 'reply_to')[0] } : {}),
    subject: String(m.subject ?? '').replace(/[\r\n]+/g, ' ').slice(0, 998),
    ...(m.text !== undefined ? { text: String(m.text) } : {}),
    ...(m.html ? { html: String(m.html) } : {}),
    ...(m.attachments?.length ? { attachments: m.attachments.map((x) => ({ filename: x.filename, content: x.content, ...(x.contentType ? { contentType: x.contentType } : {}) })) } : {}),
    ...(m.inReplyTo ? { inReplyTo: m.inReplyTo } : {}),
    ...(m.references?.length ? { references: m.references } : {}),
    messageId,
    date,
    disableFileAccess: true,
    disableUrlAccess: true,
  };
}

/** The whole message as the mail server stores it (drafts, and the Sent copy, Bcc kept). */
export async function buildRaw(a: MailAccount, m: OutgoingMail, o: { messageId?: string; date?: Date } = {}): Promise<Buffer> {
  const opts = composeOptions(a, m, o.messageId ?? newMessageId(a), o.date ?? new Date());
  const node = new MailComposer(opts).compile();
  node.keepBcc = true;
  return node.build();
}

const newMessageId = (a: MailAccount) => `<${crypto.randomUUID()}@${domainOf(a.address) || 'hydor.local'}>`;

/**
 * Sends an email from a connected mail account (Apps → Connected apps → Email) and keeps a copy in its Sent folder.
 * For any part of the server that sends mail for the person (an agent's results to someone):
 *
 *   await sendMail('me@example.com', { to: 'anna@example.org', subject: 'This week', text: '…', attachments: [{ filename, content }] })
 *
 * `account` is the account's address (or id or name); undefined sends from the first one. Throws a MailError in plain
 * words (no account, a refused recipient, a wrong password). It sends at once: check with the person first.
 */
export async function sendMail(account: string | undefined, mail: OutgoingMail, o: { db?: DB } = {}): Promise<SentInfo> {
  const db = o.db ?? mailDb();
  const a = findAccount(db, account);
  const to = [...addressList(mail.to, 'to'), ...addressList(mail.cc, 'cc'), ...addressList(mail.bcc, 'bcc')];
  if (!to.length) throw new MailError('Say who the email is to');
  const messageId = newMessageId(a);
  const date = new Date();
  const opts = composeOptions(a, mail, messageId, date);
  const t = createTransport(smtpOptions(a, passwordOf(db, a.id)));
  let info: { accepted: unknown[]; rejected: unknown[] };
  try {
    info = await t.sendMail(opts);
  } catch (e) {
    const err = e as { code?: string; response?: string; rejected?: unknown[] };
    if (err.code === 'EENVELOPE') throw new MailError(`The mail server refused the recipients${err.rejected?.length ? ` ${err.rejected.map(String).join(', ')}` : ''}: ${String(err.response ?? '').slice(0, 200)}`);
    throw explain(e, a.smtp, 'smtp', a.provider);
  } finally {
    t.close();
  }
  const out: SentInfo = { messageId, accepted: info.accepted.map(String), rejected: info.rejected.map(String) };
  // Gmail keeps what goes through its SMTP server in Sent by itself; elsewhere a copy is added, as mail programs do.
  if (!providerById(a.provider)?.savesSent) {
    try {
      const raw = await buildRaw(a, mail, { messageId, date });
      out.savedTo = await withImap(db, a, async (c) => {
        const sent = await specialFolder(c, '\\Sent');
        if (!sent) return undefined;
        await c.append(sent, raw, ['\\Seen'], date);
        return sent;
      });
      if (!out.savedTo) out.note = 'There is no Sent folder, so no copy was kept.';
    } catch (e) {
      out.note = `Sent, but no copy could be kept in Sent: ${(e as Error).message}`;
    }
  }
  return out;
}
