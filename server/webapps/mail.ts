// A web app's mail (an app that lists `mail` in its hydor.json): the host sends it from a mail account of the owner's, and the app carries no account and no password. It is for what an app sends beyond accounts (a form's
// notice and reply, a welcome, a reminder, a newsletter): inside Hydor the people are Hydor's, so an app has no sign-up, password or invitation mail of its own. The apps' server lets in only people Hydor signed
// in (proxy.ts), so a link in a mail opens for no one outside: the card says so.
//
//   POST /api/apps/:slug/mail   Idempotency-Key, { to: string[1..50], subject, text, html?, replyTo?, fromName?, unsubscribe? } → { id, status: "sent" | "queued" }
//
// The request is sent through Hydor's own mail (server/mail/send.ts: sendMail, the account's SMTP server, the password from the vault).
//
// Who may ask. The key Hydor made for that web app (webCaller in embed.ts), and only for an app that lists `mail` in its hydor.json. Mail goes out in the owner's name, to
// addresses the app chose, and the app is code an agent wrote: nothing is sent until the owner allows it for that app on the card on its page, where they pick the account and the most a day.
// The sender's address is always that account's: nothing in a request names one. An agent cannot allow it without the owner's card (server/guide/api.ts).
//
// What the answer is when there is none: 501 while this Hydor cannot send it (not allowed yet, no account that can send, the chosen one gone or refusing its sign-in):
// the app keeps the mail in its own outbox and says it was not delivered; 403 when the owner turned it off.
//
// An app still being made sends no real mail unless its owner says so: trying it out would reach real people. Which side is calling is Hydor's own knowledge, carried by the mark on the
// launched version's key (sides.ts), never anything the app says. A call without it (Preview, the development server, an app that is not launched) is answered 501, so the app keeps the mail,
// until the owner switches on "Also send while it is being made" on the same card (settings.mail.whileMaking, off by default, and off again when mail is turned off). Each side has its own
// Idempotency-Keys, day's count and minute: a test can neither use up nor replay what is the launched version's.
//
// Each person alone. A mail to several people is sent to each separately, so no one sees another's address. Each of them counts as one mail against the day (UTC, as the driver says) and the
// minute; a request that would pass the day's limit is refused whole.
//
// What is checked and what is not. Addresses, the subject, the name beside the sender and the unsubscribe address end up in the mail's headers: a line break or another control character in any
// of them is refused (400), so no header can be added. The text and the html are passed to the mail program as given: Hydor does not read, clean or rewrite them (no link is checked, no script
// removed: what a script in a mail may do is the reader's mail program's to decide), it attaches nothing, and nothing in them can make Hydor read a file or fetch an address (send.ts).
//
// No Sent copy is added to the account (the mail carries other people's one-time links, and agents with the email tools read that folder); a provider that keeps one by itself (Gmail) still does.
//
// What is kept (table web_app_mail, 30 days): when, which app, how many people, the length of the subject, how it ended, and a keyed fingerprint of the Idempotency-Key (a key may be made of an
// address, so it is never kept as it came). Never an address, a subject or a word of a mail, in the database or a log. A mail still waiting to be tried again is held in memory only: a restart
// of Hydor loses it, and its record says so.
import crypto from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { MAIL_ADDRESS } from "../../shared/mail.ts";
import { WEBAPP_MAIL_PER_DAY, type WebAppMail, type WebAppMailDay, type WebAppMailPage, type WebAppMailRecord } from "../../shared/webapps.ts";
import { HttpError } from "../auth.ts";
import type { DB } from "../db.ts";
import type { Deps } from "../features/types.ts";
import { Limiter } from "../apps/limits.ts";
import { listAccounts, passwordOf, type MailAccount } from "../mail/accounts.ts";
import { MailError } from "../mail/imap.ts";
import { providerById } from "../mail/providers.ts";
import { sendMail, type OutgoingMail } from "../mail/send.ts";
import { webCaller } from "./embed.ts";
import { isLaunchedKey } from "./sides.ts";
import { servicesOf } from "./shape.ts";
import { getWebApp, type WebAppRow } from "./store.ts";

export const MAIL_LIMITS = {
  /** People in one request. */
  recipients: 50,
  /** Characters of a subject, of the text and of the html, of the name beside the sender, of an unsubscribe address and of an Idempotency-Key. */
  subject: 900,
  body: 200_000,
  fromName: 80,
  unsubscribe: 900,
  key: 256,
  /** A minute, for one app: requests (the refused ones too), and mails (one for each person). */
  callsPerMinute: 30,
  perMinute: 60,
  /** How long a request waits for the mail server before it is answered "queued" (the driver gives up after 20 seconds). */
  waitMs: 10_000,
  /** The waits before a mail that could not go is tried again, once it has been answered "queued". */
  retryMs: [30_000, 120_000, 600_000, 1_800_000],
  /** Mails being handed to one account's server at once. */
  atOnce: 3,
};

const KEEP_DAYS = 30;
const DAY = 24 * 3600_000;
/** The UTC day a moment is in, as the time it began. */
const utcDay = (now = Date.now()) => now - (now % DAY);

const limiter = new Limiter(Date.now, "web-mail");
/** Forgets the minute's requests (tests). */
export const forgetMailLimits = () => limiter.clear();

/** The launched version, or the app being made (anything that does not prove it is the launched one). */
export type MailSide = "launched" | "making";

// ---- whether an app sends mail ------------------------------------------------------------------------------------------------------

/** Whether a web app sends its mail through Hydor: its hydor.json lists `mail` (shape.ts). */
export function usesMail(web: Pick<WebAppRow, "folder">): boolean {
  return servicesOf(web).mail;
}

// ---- the accounts ---------------------------------------------------------------------------------------------------------------

/** The connected mail accounts that can send: those with a password saved. */
export function sendingAccounts(db: DB): MailAccount[] {
  try {
    return listAccounts(db).filter((a) => {
      try {
        return !!passwordOf(db, a.id);
      } catch {
        return false;
      }
    });
  } catch {
    // No mail tables: this Hydor has no mail.
    return [];
  }
}

/** The owner's choice of account has to be one that can send now (the PUT of the app's settings asks). */
export function checkMailChoice(db: DB, web: WebAppRow, given: unknown): void {
  const v = given && typeof given === "object" ? (given as { account?: unknown; on?: unknown }) : null;
  if (!v) return;
  const account = typeof v.account === "string" ? v.account : web.settings.mail?.account;
  const turningOn = v.on === true;
  if (!turningOn && (typeof v.account !== "string" || !v.account)) return;
  if (account && !sendingAccounts(db).some((a) => a.id === account)) throw new HttpError(400, "That mail account is not connected here, or has no password saved: connect it in Apps → Connected apps → Email.");
}

// ---- the records ----------------------------------------------------------------------------------------------------------------

const tables = new WeakSet<DB>();
function mailAppTables(db: DB) {
  if (tables.has(db)) return;
  db.exec(
    "create table if not exists web_app_mail (id text primary key, web_id text not null, side text not null default 'making', at integer not null, day integer not null, recipients integer not null, subject_chars integer not null, counted integer not null default 0, sent integer not null default 0, status text not null, reason text, answered integer not null default 0, key_hash text, done text not null default '');" +
      "create index if not exists web_app_mail_day on web_app_mail (web_id, day); create index if not exists web_app_mail_key on web_app_mail (web_id, key_hash);",
  );
  // What was on its way when Hydor stopped is gone: the mail itself was only in memory.
  db.prepare("update web_app_mail set status = 'lost', reason = 'restart' where status in ('sending', 'queued')").run();
  tables.add(db);
}

interface Row {
  id: string;
  web_id: string;
  side: MailSide;
  at: number;
  recipients: number;
  subject_chars: number;
  counted: number;
  sent: number;
  status: WebAppMailRecord["status"];
  reason: WebAppMailRecord["reason"] | null;
  answered: number;
  done: string;
}

const newId = () => `mail_${crypto.randomBytes(12).toString("hex")}`;

function addRow(db: DB, o: { id: string; web: string; side: MailSide; recipients: number; subjectChars: number; counted: number; status: Row["status"]; reason?: Row["reason"]; keyHash?: string | null }) {
  const now = Date.now();
  db.prepare("insert into web_app_mail (id, web_id, side, at, day, recipients, subject_chars, counted, status, reason, key_hash) values (?,?,?,?,?,?,?,?,?,?,?)").run(
    o.id,
    o.web,
    o.side,
    now,
    utcDay(now),
    o.recipients,
    o.subjectChars,
    o.counted,
    o.status,
    o.reason ?? null,
    o.keyHash ?? null,
  );
  db.prepare("delete from web_app_mail where day < ?").run(utcDay(now) - KEEP_DAYS * DAY);
}

/** Mails accepted today from one side of an app. */
const countedToday = (db: DB, webId: string, side: MailSide, now = Date.now()) => (db.prepare("select coalesce(sum(counted), 0) as n from web_app_mail where web_id = ? and side = ? and day = ?").get(webId, side, utcDay(now)) as { n: number }).n;

function dayOfSide(db: DB, webId: string, side: MailSide, now: number): WebAppMailDay {
  return db
    .prepare(
      "select coalesce(sum(counted), 0) as counted, coalesce(sum(sent), 0) as sent, coalesce(sum(case when status in ('sending', 'queued') then max(counted - sent, 0) else 0 end), 0) as waiting, coalesce(sum(case when status in ('partial', 'failed', 'lost') then max(counted - sent, 0) else 0 end), 0) as failed, coalesce(sum(case when status = 'refused' then 1 else 0 end), 0) as refused from web_app_mail where web_id = ? and side = ? and day = ?",
    )
    .get(webId, side, utcDay(now)) as WebAppMailDay;
}

/** What a link in the app's mail points at, from the address the app is told as its own (APP_URL): a `.localhost` name is this computer alone. */
export function linksOf(address: string): WebAppMail["links"] {
  const u = new URL(address);
  return { host: u.host, local: u.hostname === "localhost" || u.hostname.endsWith(".localhost") };
}

/** The app's mail as its page and its JSON show it; null for an app that sends none through Hydor. */
export function mailView(db: DB, web: WebAppRow, launched: boolean, address: string, now = Date.now()): WebAppMail | null {
  if (!usesMail(web)) return null;
  mailAppTables(db);
  const s = web.settings.mail;
  const accounts = sendingAccounts(db);
  const chosen = s?.account ? accounts.find((a) => a.id === s.account) : undefined;
  const perDay = s?.perDay ?? WEBAPP_MAIL_PER_DAY;
  const t = dayOfSide(db, web.id, "launched", now);
  const making = dayOfSide(db, web.id, "making", now);
  return {
    state: s?.on === true ? "allowed" : s?.on === false ? "off" : "ask",
    canSend: accounts.length > 0,
    ...(chosen ? { account: { id: chosen.id, address: chosen.address } } : {}),
    ...(s?.account && !chosen ? { accountGone: true } : {}),
    perDay,
    launched,
    whileMaking: !!s?.whileMaking,
    today: t,
    atLimit: t.counted >= perDay,
    making: { today: making, atLimit: making.counted >= perDay },
    resetsAt: new Date(utcDay(now) + DAY).toISOString(),
    links: linksOf(address),
  };
}

function recentOf(db: DB, webId: string): WebAppMailRecord[] {
  mailAppTables(db);
  const rows = db.prepare("select side, at, recipients, subject_chars, sent, status, reason from web_app_mail where web_id = ? order by at desc, rowid desc limit 20").all(webId) as Row[];
  return rows.map((r) => ({ at: r.at, ...(r.side === "making" ? { making: true } : {}), recipients: r.recipients, subjectChars: r.subject_chars, sent: r.sent, status: r.status, ...(r.reason ? { reason: r.reason } : {}) }));
}

// ---- the request ----------------------------------------------------------------------------------------------------------------

interface Ask {
  to: string[];
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  fromName?: string;
  unsubscribe?: string;
}

/** Line breaks and other control characters (the two Unicode line separators too): what would end a header's line. */
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;
/** In a name, the characters that make one name look like another sender: an address, or text drawn right to left over what follows. */
const NAME_TRICKS = /[<>@\u202a-\u202e\u2066-\u2069]/;

const bad = (message: string) => new HttpError(400, message);
const tooLong = (message: string) => new HttpError(413, message);
const isAddress = (v: unknown): v is string => typeof v === "string" && v.length <= 254 && !CONTROL.test(v) && !/[[\]\\]/.test(v) && MAIL_ADDRESS.test(v);

/** What the app sent, checked: the app is code an agent wrote, so every field is untrusted until it is. A refusal never repeats what was sent. */
function readAsk(body: unknown): Ask {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw bad("The request is one JSON object: { to, subject, text }.");
  const v = body as Record<string, unknown>;
  const given = (k: string) => v[k] !== undefined && v[k] !== null && v[k] !== "";
  if (!Array.isArray(v.to) || !v.to.length) throw bad("to is a list of 1 to 50 addresses.");
  if (v.to.length > MAIL_LIMITS.recipients) throw bad(`A mail goes to at most ${MAIL_LIMITS.recipients} addresses.`);
  const to: string[] = [];
  const seen = new Set<string>();
  v.to.forEach((a, i) => {
    if (!isAddress(a)) throw bad(`Address ${i + 1} in to is not one email address, like name@example.com.`);
    if (!seen.has(a.toLowerCase())) to.push(a);
    seen.add(a.toLowerCase());
  });
  if (typeof v.subject !== "string" || !v.subject.trim()) throw bad("A mail needs a subject.");
  if (CONTROL.test(v.subject)) throw bad("A subject is one line, with no control characters.");
  if (v.subject.length > MAIL_LIMITS.subject) throw bad(`A subject is at most ${MAIL_LIMITS.subject} characters.`);
  if (typeof v.text !== "string" || !v.text.trim()) throw bad("A mail needs its text.");
  if (v.html !== undefined && v.html !== null && typeof v.html !== "string") throw bad("html is text.");
  const html = (v.html as string | undefined | null) || undefined;
  if (v.text.length > MAIL_LIMITS.body) throw tooLong(`The text is longer than ${MAIL_LIMITS.body.toLocaleString("en")} characters.`);
  if (html && html.length > MAIL_LIMITS.body) throw tooLong(`The html is longer than ${MAIL_LIMITS.body.toLocaleString("en")} characters.`);
  const out: Ask = { to, subject: v.subject, text: v.text, ...(html ? { html } : {}) };
  if (given("replyTo")) {
    if (!isAddress(v.replyTo)) throw bad("replyTo is one email address, like help@example.com.");
    out.replyTo = v.replyTo;
  }
  if (given("fromName")) {
    if (typeof v.fromName !== "string" || CONTROL.test(v.fromName) || NAME_TRICKS.test(v.fromName.normalize("NFKC"))) throw bad("fromName is a name on one line, with no address in it (no <, > or @).");
    if (v.fromName.length > MAIL_LIMITS.fromName) throw bad(`fromName is at most ${MAIL_LIMITS.fromName} characters.`);
    if (v.fromName.trim()) out.fromName = v.fromName.trim();
  }
  if (given("unsubscribe")) {
    const u = v.unsubscribe;
    let url: URL | null = null;
    if (typeof u === "string" && !CONTROL.test(u) && !/[\s<>]/.test(u) && /^(https:\/\/|mailto:)/i.test(u)) {
      try {
        url = new URL(u);
      } catch {}
    }
    if (!url || url.href.length > MAIL_LIMITS.unsubscribe) throw bad("unsubscribe is an https:// or mailto: address on one line.");
    out.unsubscribe = url.href;
  }
  return out;
}

/** The name beside the sender when the request gives none: the web app's, without what a name may not hold. */
const appName = (web: WebAppRow) => web.name.normalize("NFKC").replace(new RegExp(CONTROL.source, "g"), " ").replace(new RegExp(NAME_TRICKS.source, "g"), "").replace(/\s+/g, " ").trim().slice(0, MAIL_LIMITS.fromName);

// ---- sending --------------------------------------------------------------------------------------------------------------------

type Why = NonNullable<WebAppMailRecord["reason"]>;

/** What a failure to send is, for what happens next. Nothing of the server's words goes anywhere: they repeat addresses. */
export function classify(e: unknown): "sign-in" | "server" | "recipient" | "content" {
  // The account went between the check and the sending, or has no password.
  if (e instanceof HttpError) return "sign-in";
  const m = e as MailError;
  if (m.auth) return "sign-in";
  const s = m.smtp;
  if (!s || s.status < 500) return "server";
  if ([530, 534, 535, 538].includes(s.status)) return "sign-in";
  // A provider's own limit on what an account sends is said with a 5xx too, and passes.
  if (/\b5\.4\.5\b|quota|limit exceeded|too many/i.test(s.said)) return "server";
  // The sender itself refused: this account cannot send.
  if (s.command === "MAIL FROM") return "sign-in";
  if (s.command.startsWith("RCPT")) return "recipient";
  if (s.command === "DATA") return "content";
  return "server";
}

interface Job {
  db: DB;
  id: string;
  web: string;
  side: MailSide;
  mail: Omit<OutgoingMail, "to">;
  to: string[];
  /** The people it was handed to the server for, and those the server refused for good (their places in `to`). */
  done: Set<number>;
  dead: Set<number>;
  tries: number;
  timer?: NodeJS.Timeout;
}

const waiting = new Map<string, Job>();
const busy = new Map<string, number>();
const queue = new Map<string, (() => void)[]>();

/** A place among the few that may talk to one account's server at once. */
async function slot<T>(account: string, run: () => Promise<T>): Promise<T> {
  while ((busy.get(account) ?? 0) >= MAIL_LIMITS.atOnce) await new Promise<void>((r) => queue.set(account, [...(queue.get(account) ?? []), r]));
  busy.set(account, (busy.get(account) ?? 0) + 1);
  try {
    return await run();
  } finally {
    busy.set(account, (busy.get(account) ?? 1) - 1);
    queue.get(account)?.shift()?.();
  }
}

/** The account the owner allows this side of the app to send from, now; or why there is none. */
function allowedNow(db: DB, webId: string, side: MailSide): { account: MailAccount } | { why: Why } {
  const s = getWebApp(db, webId)?.settings.mail;
  if (side === "making" && !s?.whileMaking) return { why: "making" };
  if (!s || s.on === undefined) return { why: "ask" };
  if (!s.on) return { why: "off" };
  const account = sendingAccounts(db).find((a) => a.id === s.account);
  return account ? { account } : { why: "no-account" };
}

/** A failure that may pass and is about this one person (greylisted, a full mailbox): the others are still sent to now. What is about the server or the account (421, a provider's sending limit) is not. */
function onlyThisOne(e: unknown): boolean {
  const s = (e as MailError).smtp;
  return !!s && s.status >= 400 && s.status !== 421 && /^(RCPT|DATA)/.test(s.command) && !/\b5\.4\.5\b|sending limit/i.test(s.said);
}

/** Sends to everyone not yet sent to, one at a time. `stopped`: why it ended with people left. `refused`: why the server would not take some of them. */
async function attempt(job: Job): Promise<{ stopped?: Why; refused?: Why }> {
  let refused: Why | undefined;
  let stopped: Why | undefined;
  for (let i = 0; i < job.to.length; i++) {
    if (job.done.has(i) || job.dead.has(i)) continue;
    // The owner may have turned it off, or changed the account, since the request came.
    const now = allowedNow(job.db, job.web, job.side);
    if (!("account" in now)) return { stopped: now.why, refused };
    try {
      await slot(now.account.id, () => sendMail(now.account.id, { ...job.mail, to: job.to[i] }, { db: job.db, keepCopy: false }));
      job.done.add(i);
      job.db.prepare("update web_app_mail set sent = ?, done = ? where id = ?").run(job.done.size, [...job.done].join(","), job.id);
    } catch (e) {
      const why = classify(e);
      if (why === "recipient" || why === "content") {
        job.dead.add(i);
        refused = why;
        continue;
      }
      stopped = why;
      if (why !== "server" || !onlyThisOne(e)) break;
    }
  }
  return { stopped, refused };
}

function finish(job: Job, status: Row["status"], reason?: Why) {
  clearTimeout(job.timer);
  waiting.delete(job.id);
  job.db.prepare("update web_app_mail set status = ?, reason = ?, sent = ? where id = ?").run(status, reason ?? null, job.done.size, job.id);
}

/** After a try of a mail that was answered "queued": done, or tried again later. */
function carryOn(job: Job, r: { stopped?: Why; refused?: Why }, log: (why: Why, tries: number) => void, changed: () => void) {
  const left = job.to.length - job.done.size - job.dead.size;
  if (!left) finish(job, job.dead.size ? (job.done.size ? "partial" : "failed") : "sent", r.refused);
  else if (r.stopped === "off" || r.stopped === "ask" || r.stopped === "making" || job.tries >= MAIL_LIMITS.retryMs.length) {
    log(r.stopped ?? "server", job.tries);
    finish(job, job.done.size ? "partial" : "failed", r.stopped);
  } else {
    job.db.prepare("update web_app_mail set status = 'queued', reason = ? where id = ?").run(r.stopped ?? null, job.id);
    waiting.set(job.id, job);
    job.timer = setTimeout(() => {
      job.tries++;
      attempt(job)
        .then((next) => carryOn(job, next, log, changed))
        .catch(() => finish(job, job.done.size ? "partial" : "failed", "server"));
    }, MAIL_LIMITS.retryMs[job.tries]);
    job.timer.unref?.();
  }
  changed();
}

/** Hydor is stopping: what waits to be tried again is lost, and its record says so. */
export function stopMail() {
  for (const job of waiting.values()) {
    clearTimeout(job.timer);
    try {
      job.db.prepare("update web_app_mail set status = 'lost', reason = 'restart' where id = ?").run(job.id);
    } catch {}
  }
  waiting.clear();
}

/** The owner changed an app's mail settings: what waits for it is dropped at once if it may not go any more. */
export function reviewMail(db: DB, webId: string) {
  for (const job of [...waiting.values()]) {
    if (job.db !== db || job.web !== webId) continue;
    const now = allowedNow(db, webId, job.side);
    if (!("account" in now)) finish(job, job.done.size ? "partial" : "failed", now.why);
  }
}

// ---- the route ------------------------------------------------------------------------------------------------------------------

export interface MailContext {
  enabled: () => void;
  /** The key's secret (embed.ts). */
  secret: (webId: string) => string;
  /** Whether the app has a launched version in this Hydor (for what the card says; never for who is calling). */
  launched: (web: WebAppRow) => boolean;
  /** The address the app is told as its own, which the links in its mail are made from. */
  address: (web: WebAppRow) => string;
  /** The web app of a route of the owner's (by its id). */
  own: (req: { params: unknown }) => WebAppRow;
  /** Tells the pages something about a web app changed. */
  changed: () => void;
}

interface Answer {
  id: string;
  status: "sent" | "queued";
}

const NOT_SENT: Record<"ask" | "making" | "no-account" | "gone", string> = {
  making: "This app is still being made, so Hydor does not send its mail and the app keeps it. The owner can switch on sending while it is being made on the app's page in Hydor.",
  ask: "The owner has not allowed this app to send mail yet: they can on the app's page in Hydor.",
  "no-account": "This Hydor has no mail account that can send. The owner can connect one in Apps → Connected apps → Email.",
  gone: "The mail account chosen for this app is not connected any more: the owner can pick another on the app's page in Hydor.",
};

export function mailRoutes(d: Deps, ctx: MailContext) {
  const { app, db } = d;
  mailAppTables(db);
  /** Requests being sent now, by app and key: a repeat that comes while the first is going is given the first's answer. */
  const going = new Map<string, Promise<Answer>>();

  app.post("/api/apps/:slug/mail", { bodyLimit: 3 * 1024 * 1024 }, async (req: FastifyRequest, reply: FastifyReply) => {
    ctx.enabled();
    const secret = (id: string) => ctx.secret(id);
    const web = webCaller({ db, secret }, req, "mail");
    if (!usesMail(web)) throw new HttpError(403, "This web app does not send mail through Hydor: its hydor.json does not list mail under services.");
    const limited = (limit: number, resetsAt: number, message: string) => {
      reply.header("retry-after", String(Math.max(1, Math.ceil((resetsAt - Date.now()) / 1000))));
      return new HttpError(429, message, { limit, resetsAt: new Date(resetsAt).toISOString() });
    };
    // Which side: only a key with the launched version's mark is the launched version.
    const side: MailSide = isLaunchedKey(db, web.id, /^Bearer\s+(\S+)$/i.exec(String(req.headers.authorization ?? ""))?.[1] ?? "") ? "launched" : "making";
    const minute = `web:${web.id}:${side}`;
    if (!limiter.take(minute, MAIL_LIMITS.callsPerMinute, 60_000)) throw limited(MAIL_LIMITS.callsPerMinute, Date.now() + limiter.wait(minute, MAIL_LIMITS.callsPerMinute, 60_000), `Too many requests: a web app may ask Hydor to send ${MAIL_LIMITS.callsPerMinute} times a minute.`);
    const ask = readAsk(req.body);
    const key = req.headers["idempotency-key"];
    if (key !== undefined && (typeof key !== "string" || !key || key.length > MAIL_LIMITS.key)) throw bad(`Idempotency-Key is at most ${MAIL_LIMITS.key} characters.`);
    const keyHash = typeof key === "string" ? crypto.createHmac("sha256", ctx.secret(web.id)).update(`hydor mail key 1\0${key}`).digest("hex") : null;
    reply.header("cache-control", "no-store");

    // The same key within a day: the same answer, and nothing sent.
    let again: Row | undefined;
    if (keyHash) {
      const now = going.get(`${web.id}:${side}:${keyHash}`);
      if (now) return await now;
      again = db.prepare("select * from web_app_mail where web_id = ? and side = ? and key_hash = ? and at > ? and status <> 'refused' order by at desc, rowid desc limit 1").get(web.id, side, keyHash, Date.now() - DAY) as Row | undefined;
      if (again?.answered) return { id: again.id, status: again.sent >= again.recipients || again.status === "partial" ? "sent" : "queued" } satisfies Answer;
      // One that Hydor stopped before answering: only those it had not reached are sent to now.
      if (again && !(again.status === "lost" && again.recipients === ask.to.length)) again = undefined;
    }

    const record = (status: "refused", reason: Why) => {
      addRow(db, { id: newId(), web: web.id, side, recipients: ask.to.length, subjectChars: ask.subject.length, counted: 0, status, reason, keyHash });
      ctx.changed();
    };
    const now = allowedNow(db, web.id, side);
    if (!("account" in now)) {
      if (now.why === "off") {
        record("refused", "off");
        throw new HttpError(403, "The owner has turned mail off for this app.");
      }
      const none = !sendingAccounts(db).length;
      const why = now.why === "making" ? "making" : none ? "no-account" : now.why;
      record("refused", why);
      throw new HttpError(501, NOT_SENT[now.why === "making" ? "making" : none ? "no-account" : now.why === "ask" ? "ask" : "gone"]);
    }

    // The limits, then the mail is counted at once (nothing awaits between the two, so two requests cannot both take the last of the day).
    const settings = getWebApp(db, web.id)!.settings.mail!;
    const n = ask.to.length;
    const done = new Set((again?.done ?? "").split(",").filter(Boolean).map(Number));
    if (!again) {
      if (n > settings.perDay) throw bad(`This mail is for ${n} people, and the app may send ${settings.perDay} mail${settings.perDay === 1 ? "" : "s"} a day: send it to fewer, or the owner raises the limit.`);
      const today = countedToday(db, web.id, side);
      if (today + n > settings.perDay) {
        record("refused", "limit");
        throw limited(settings.perDay, utcDay() + DAY, `This app has sent ${today} of the ${settings.perDay} mails it may send today. It starts again at midnight UTC.`);
      }
      const recent = db.prepare("select at, recipients from web_app_mail where web_id = ? and side = ? and at > ? and status <> 'refused' order by at").all(web.id, side, Date.now() - 60_000) as { at: number; recipients: number }[];
      let inMinute = recent.reduce((s, r) => s + r.recipients, 0);
      if (inMinute + n > MAIL_LIMITS.perMinute) {
        let free = Date.now() + 60_000;
        for (const r of recent) {
          inMinute -= r.recipients;
          if (inMinute + n <= MAIL_LIMITS.perMinute) {
            free = r.at + 60_000;
            break;
          }
        }
        record("refused", "limit");
        throw limited(MAIL_LIMITS.perMinute, free, `Too many mails at once: a web app may send ${MAIL_LIMITS.perMinute} a minute.`);
      }
    }
    const id = again?.id ?? newId();
    if (again) db.prepare("update web_app_mail set status = 'sending', reason = null where id = ?").run(id);
    else addRow(db, { id, web: web.id, side, recipients: n, subjectChars: ask.subject.length, counted: n, status: "sending", keyHash });

    const job: Job = {
      db,
      id,
      web: web.id,
      side,
      to: ask.to,
      mail: { subject: ask.subject, text: ask.text, ...(ask.html ? { html: ask.html } : {}), ...(ask.replyTo ? { replyTo: ask.replyTo } : {}), fromName: ask.fromName ?? appName(web), ...(ask.unsubscribe ? { listUnsubscribe: ask.unsubscribe } : {}) },
      done,
      dead: new Set(),
      tries: 0,
    };
    // The reason is a word of Hydor's own: never what the server said, which repeats addresses.
    const log = (why: Why, tries: number) => app.log.warn({ app: web.id, mail: id, why, tries }, "a web app's mail was not sent");
    const answered = () => db.prepare("update web_app_mail set answered = 1 where id = ?").run(id);
    /** Not accepted: it counts nothing against the day, and the same key may be sent again. */
    const drop = (why: Why) => {
      db.prepare("update web_app_mail set counted = 0 where id = ?").run(id);
      finish(job, "failed", why);
      log(why, 0);
    };

    const send = async (): Promise<Answer> => {
      const first = attempt(job).catch((): { stopped?: Why; refused?: Why } => ({ stopped: "server" }));
      let timer: NodeJS.Timeout | undefined;
      const r = await Promise.race([first, new Promise<null>((res) => (timer = setTimeout(res, MAIL_LIMITS.waitMs, null)))]);
      clearTimeout(timer);
      if (!r) {
        // Slow: taken to be sent, and carried on with.
        answered();
        db.prepare("update web_app_mail set status = 'queued' where id = ?").run(id);
        void first.then((later) => carryOn(job, later, log, ctx.changed)).catch(() => {});
        return { id, status: "queued" };
      }
      const left = job.to.length - job.done.size - job.dead.size;
      if (!job.done.size && !left) {
        drop(r.refused!);
        throw bad(r.refused === "recipient" ? "The mail server would not take the address." : "The mail server would not take this mail.");
      }
      if (!job.done.size && r.stopped) {
        drop(r.stopped);
        if (r.stopped === "sign-in") throw new HttpError(501, "The mail account chosen for this app did not accept the sending: the owner can test it in Apps → Connected apps → Email.");
        if (r.stopped === "off") throw new HttpError(403, "The owner has turned mail off for this app.");
        if (r.stopped === "making") throw new HttpError(501, NOT_SENT.making);
        if (r.stopped === "ask" || r.stopped === "no-account") throw new HttpError(501, NOT_SENT.gone);
        reply.header("retry-after", "60");
        throw new HttpError(503, "The mail server could not take the mail now. Try again later.");
      }
      // Accepted: once one person has it, a repeat of the request would send it to them again, so the rest is Hydor's to try.
      answered();
      if (left && r.stopped) {
        carryOn(job, r, log, ctx.changed);
        return { id, status: "queued" };
      }
      finish(job, job.dead.size ? "partial" : "sent", r.refused);
      return { id, status: "sent" };
    };

    const run = send();
    if (keyHash) going.set(`${web.id}:${side}:${keyHash}`, run);
    try {
      return await run;
    } finally {
      if (keyHash) going.delete(`${web.id}:${side}:${keyHash}`);
      ctx.changed();
    }
  });

  /** What the owner sees of an app's mail: the card's state, the accounts to choose from, and the last requests (no address, no word of any). */
  app.get("/api/webapps/:id/mail", async (req): Promise<WebAppMailPage> => {
    ctx.enabled();
    const web = ctx.own(req);
    const mail = mailView(db, web, ctx.launched(web), ctx.address(web));
    if (!mail) throw new HttpError(404, "This web app sends no mail through Hydor.");
    return {
      mail,
      accounts: sendingAccounts(db).map((a) => ({ id: a.id, address: a.address, keepsCopy: !!providerById(a.provider)?.savesSent })),
      recent: recentOf(db, web.id),
    };
  });
}
