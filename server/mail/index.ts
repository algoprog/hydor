// Email: mail accounts connected with an address and an app password, for every agent (the connection "email" in
// Apps → Connected apps, whose tools Hydor answers itself: mcp.ts and tools.ts), for scheduled tasks (the New email
// watcher: watch.ts) and for the server itself (sendMail: send.ts).
//
//   GET    /api/mail/lookup?address=…      the servers for an address, and how to make an app password there
//   GET    /api/mail/accounts               the connected accounts
//   POST   /api/mail/accounts               connects one: signed in to (reading and sending) before it is saved
//   PATCH  /api/mail/accounts/:id           changes one (name, password, servers): signed in to again
//   POST   /api/mail/accounts/:id/test      signs in to one again
//   DELETE /api/mail/accounts/:id           forgets one (the last one takes the connection with it)
//   GET    /api/mail/accounts/:id/folders   its folders, for the watcher's form
import { MAIL_ADDRESS, type MailAccountView, type MailFolderView, type MailLookup } from '../../shared/mail.ts';
import { HttpError } from '../auth.ts';
import { setTested } from '../connections/apps.ts';
import type { DB } from '../db.ts';
import type { Deps, Feature } from '../features/types.ts';
import { accountView, accountViews, findAccount, listAccounts, MAIL_APP, passwordOf, removeAccount, saveAccount, setAccountStatus, useMailDb, type AccountInput, type MailAccount } from './accounts.ts';
import { MailError, testImap, withImap } from './imap.ts';
import { cleanServer, domainOf, knownProvider, lookupServers } from './providers.ts';
import { testSmtp } from './send.ts';
import { mailToolInfos } from './tools.ts';
import { callBuiltin } from './mcp.ts';
import { setBuiltinCaller } from '../outbox/call.ts';

const clip = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n);

/** A password as typed: Gmail shows its app passwords in groups of four, which it takes without the spaces. */
function cleanPassword(v: unknown, provider?: string): string {
  const p = String(v ?? '').replace(/^\s+|\s+$/g, '');
  if (p.length > 500 || /[\r\n]/.test(p)) throw new HttpError(400, 'A password is one line');
  return provider === 'gmail' && /^([a-z]{4}\s){3}[a-z]{4}$/i.test(p) ? p.replace(/\s/g, '') : p;
}

/** Signs in for reading and for sending at once; throws one message naming which failed. */
async function signIn(a: MailAccount, pass: string): Promise<void> {
  const [r, s] = await Promise.allSettled([testImap(a, pass), testSmtp(a, pass)]);
  const why = (x: PromiseSettledResult<unknown>) => (x.status === 'rejected' ? (x.reason as Error).message : '');
  if (r.status === 'rejected' && s.status === 'rejected' && why(r) === why(s)) throw new MailError(why(r));
  // Both refused the password: one message, the incoming server's (with the provider's tip).
  if (r.status === 'rejected' && s.status === 'rejected' && (r.reason as MailError).auth && (s.reason as MailError).auth) throw r.reason as MailError;
  const parts = [r.status === 'rejected' && `Reading mail: ${why(r)}`, s.status === 'rejected' && `Sending mail: ${why(s)}`].filter(Boolean);
  if (parts.length) throw new MailError(parts.join(' '));
}

/** An account from a form: the address checked, the servers as typed or looked up. */
async function accountFrom(db: DB, b: Record<string, unknown>, old?: MailAccount): Promise<{ input: AccountInput; lookup?: MailLookup }> {
  const address = clip(b.address ?? old?.address, 320).toLowerCase();
  if (!MAIL_ADDRESS.test(address)) throw new HttpError(400, 'Enter your email address, like alex@example.com');
  const typed = b.imap !== undefined || b.smtp !== undefined;
  let lookup: MailLookup | undefined;
  let imap = old && address === old.address ? old.imap : undefined;
  let smtp = old && address === old.address ? old.smtp : undefined;
  let provider = old && address === old.address ? old.provider : undefined;
  let username: string | undefined;
  let smtpUsername: string | undefined;
  if (typed) {
    try {
      imap = cleanServer(b.imap, 'imap');
      smtp = cleanServer(b.smtp, 'smtp');
    } catch (e) {
      throw new HttpError(400, (e as Error).message);
    }
    provider = knownProvider(domainOf(address))?.id;
  } else if (!imap || !smtp) {
    lookup = await lookupServers(address);
    if (lookup.blocked) throw new HttpError(400, lookup.blocked);
    if (!lookup.imap || !lookup.smtp) throw new HttpError(400, `Could not find the mail servers for ${lookup.domain}: enter them by hand (your provider’s help pages name them).`);
    imap = lookup.imap;
    smtp = lookup.smtp;
    provider = lookup.provider?.id;
    username = lookup.username;
    smtpUsername = lookup.smtpUsername;
  }
  const given = clip(b.username, 320);
  return {
    input: {
      address,
      name: b.name === undefined ? old?.name : clip(b.name, 100).replace(/[\r\n<>"]/g, '') || undefined,
      username: given || username || (old && address === old.address ? old.username : address),
      smtpUsername: given ? undefined : (smtpUsername ?? (old && address === old.address ? old.smtpUsername : undefined)),
      imap: imap!,
      smtp: smtp!,
      ...(provider ? { provider } : {}),
    },
    lookup,
  };
}

const asCandidate = (i: AccountInput, id = 'new'): MailAccount => ({ id, ...i, status: 'untested', createdAt: Date.now(), updatedAt: Date.now() });

function routes(d: Deps) {
  const { app, db } = d;
  useMailDb(db);
  // A held email (Ask first) is sent from the Outbox through the same tools agents use.
  setBuiltinCaller(callBuiltin);
  const changed = () => d.broadcast({ t: 'feature', id: 'connections', data: { changed: 'apps', app: MAIL_APP } });
  /** The connection's tool list follows the accounts (each tool names them). */
  const tested = () => {
    if (listAccounts(db).length) setTested(db, MAIL_APP, mailToolInfos(db));
  };
  const ok = (a: MailAccount) => ({ account: accountView(db, a), accounts: accountViews(db) });
  const byId = (id: string) => {
    const a = listAccounts(db).find((x) => x.id === id);
    if (!a) throw new HttpError(404, 'That mail account is not connected');
    return a;
  };
  const fail = (e: unknown): never => {
    if (e instanceof HttpError) throw e;
    throw new HttpError(400, (e as Error).message || 'It did not work');
  };

  app.get('/api/mail/lookup', async (req): Promise<MailLookup> => {
    const address = clip((req.query as { address?: string }).address, 320).toLowerCase();
    if (!MAIL_ADDRESS.test(address)) throw new HttpError(400, 'Enter an email address, like alex@example.com');
    return lookupServers(address);
  });

  app.get('/api/mail/accounts', async (): Promise<{ accounts: MailAccountView[] }> => ({ accounts: accountViews(db) }));

  app.post('/api/mail/accounts', async (req) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const { input } = await accountFrom(db, b);
    const pass = cleanPassword(b.password, input.provider);
    if (!pass) throw new HttpError(400, 'Enter the app password');
    if (listAccounts(db).some((a) => a.address === input.address)) throw new HttpError(409, `${input.address} is connected already: change it from its row`);
    await signIn(asCandidate(input), pass).catch(fail);
    const a = saveAccount(db, { ...input, status: 'ok', testedAt: Date.now() }, pass);
    tested();
    changed();
    return ok(a);
  });

  app.patch('/api/mail/accounts/:id', async (req) => {
    const old = byId((req.params as { id: string }).id);
    const b = (req.body ?? {}) as Record<string, unknown>;
    const { input } = await accountFrom(db, b, old);
    const given = cleanPassword(b.password, input.provider);
    const pass = given || passwordOf(db, old.id);
    // A new password or other servers are signed in to first; a new name alone is not.
    const reach = given || input.address !== old.address || JSON.stringify([input.imap, input.smtp, input.username, input.smtpUsername]) !== JSON.stringify([old.imap, old.smtp, old.username, old.smtpUsername]);
    if (reach) await signIn(asCandidate(input, old.id), pass).catch(fail);
    const a = saveAccount(db, { ...input, status: reach ? 'ok' : old.status, error: reach ? undefined : old.error, testedAt: reach ? Date.now() : old.testedAt }, given || undefined, old.id);
    tested();
    changed();
    return ok(a);
  });

  app.post('/api/mail/accounts/:id/test', async (req) => {
    const a = byId((req.params as { id: string }).id);
    try {
      await signIn(a, passwordOf(db, a.id));
      setAccountStatus(db, a.id, 'ok');
      return { ok: true, ...ok(byId(a.id)) };
    } catch (e) {
      setAccountStatus(db, a.id, 'error', (e as Error).message);
      return { ok: false, error: (e as Error).message, ...ok(byId(a.id)) };
    } finally {
      changed();
    }
  });

  app.delete('/api/mail/accounts/:id', async (req) => {
    const a = byId((req.params as { id: string }).id);
    removeAccount(db, a.id);
    tested();
    changed();
    return { ok: true, accounts: accountViews(db) };
  });

  app.get('/api/mail/accounts/:id/folders', async (req): Promise<{ folders: MailFolderView[] }> => {
    const id = (req.params as { id: string }).id;
    const a = listAccounts(db).find((x) => x.id === id) ?? findAccount(db, id);
    try {
      const list = await withImap(db, a, (c) => c.list());
      return {
        folders: list
          .filter((f) => !f.flags.has('\\Noselect'))
          .slice(0, 300)
          .map((f) => ({ path: f.path, name: f.name, ...(f.specialUse ? { specialUse: f.specialUse } : {}) })),
      };
    } catch (e) {
      return fail(e);
    }
  });
}

export const mail: Feature = { id: 'mail', routes };
