// The path to put an app online with Technical details off: which screen a person is at, worked out from what Hydor knows
// (the servers, the keys, the launch that is going) and the few things only they can say (kept on this device, so they
// can leave at any screen and come back to it). Pure, so a script tests it (plain-test.ts).
import { SERVER_NEEDS_ACCOUNTS, type AppKey, type LaunchHost, type LaunchHostOffer, type LaunchJob, type LaunchKey, type WebAppDetail, type WebAppLaunchView, type WebAppOnlineHelp } from '@shared/webapps';
import { tr } from '../../../i18n/runtime';
import type { OnlineData } from './OnlineView';
import { checkProblem, keyTitle, keyWhy, launchFailed, launchGroups } from './plain';

export interface OnlineSaved {
  where?: 'here' | 'internet';
  /** The provider picked (an id of the catalog), or "own": a server they have already. */
  provider?: string;
  /** The provider's new servers take Hydor's text (cloud-init): nothing is compared. */
  text?: boolean;
  /** The address of a server created with the text that is being waited for. */
  starting?: string;
  /** A server whose identity could not be replaced, so it was not taken: where that stopped. */
  unsafe?: { why: 'make' | 'swap' | 'again'; address: string };
  /** They said they made the server, and that they pasted the key. */
  created?: boolean;
  pasted?: boolean;
  /** The server added (its name in Hydor). */
  host?: string;
  /** They said the codes do not match. */
  mismatch?: boolean;
  web?: 'own' | 'get' | 'test';
  registrar?: string;
  domain?: string;
  /** The address chosen and ready to be used. */
  address?: string;
  /** The launch they started from this path. */
  job?: string;
}

export type ScreenId = 'blocked' | 'choose' | 'here' | 'provider' | 'create' | 'paste' | 'address' | 'starting' | 'unsafe' | 'compare' | 'mismatch' | 'setup' | 'web' | 'registrar' | 'domain' | 'record' | 'keys' | 'ready' | 'going' | 'ask' | 'failed' | 'done';

/** The screens of the internet path in order, for "Step 3 of 9", by what was chosen on the first: a server rented the
 * long way, one created with Hydor's text, or one the person has already (which needs no creating). */
export type PathKind = 'rent' | 'text' | 'own';
export const PATH_SCREENS: Record<PathKind, ScreenId[]> = {
  rent: ['provider', 'create', 'paste', 'address', 'compare', 'setup', 'web', 'keys', 'ready'],
  text: ['provider', 'create', 'address', 'web', 'keys', 'ready'],
  own: ['provider', 'paste', 'address', 'compare', 'setup', 'web', 'keys', 'ready'],
};

/** Which step a screen belongs to, and of how many (null: none; the first screen has none, as the count depends on what is chosen there). */
export function stepAt(at: ScreenId, kind: PathKind): { n: number; of: number } | null {
  if (at === 'provider') return null;
  const list = PATH_SCREENS[kind];
  const as: ScreenId = at === 'registrar' || at === 'domain' || at === 'record' ? 'web' : kind === 'text' && (at === 'starting' || at === 'unsafe' || at === 'mismatch' || at === 'setup') ? 'address' : at === 'mismatch' ? 'compare' : at;
  const n = list.indexOf(as);
  return n < 0 ? null : { n: n + 1, of: list.length };
}

export interface OnlineFacts {
  app: Pick<WebAppDetail, 'shape'>;
  view: Pick<WebAppLaunchView, 'job' | 'hosts' | 'envs' | 'hydor' | 'blocked'>;
  /** How many keys are still to be given for the place about to be launched to (null: not read yet). */
  missingKeys: number | null;
}

export const hostOf = (f: Pick<OnlineFacts, 'view'>, s: OnlineSaved): LaunchHost | undefined => f.view.hosts.find((h) => h.name === s.host);

/** The launch to follow: one that is going, or the one started from here. */
export function jobOf(f: Pick<OnlineFacts, 'view'>, s: OnlineSaved): LaunchJob | null {
  const j = f.view.job;
  if (!j) return null;
  if (j.state === 'running' || j.state === 'asking') return j;
  return j.id === s.job ? j : null;
}

export function screenOf(f: OnlineFacts, s: OnlineSaved): ScreenId {
  const job = jobOf(f, s);
  if (job) return job.state === 'asking' ? 'ask' : job.state === 'running' ? 'going' : job.state === 'failed' ? 'failed' : 'done';
  if (f.view.blocked) return 'blocked';
  if (!s.where) return f.view.envs.length ? 'done' : 'choose';
  if (s.where === 'here') return f.missingKeys ? 'keys' : 'here';
  const host = hostOf(f, s);
  if (s.unsafe) return 'unsafe';
  if (s.mismatch) return 'mismatch';
  if (!host) {
    if (!s.provider) return 'provider';
    if (s.starting) return 'starting';
    if (!s.created && s.provider !== 'own') return 'create';
    if (s.text) return 'address';
    return !s.pasted ? 'paste' : 'address';
  }
  if (host.state !== 'recorded') return 'compare';
  if (!host.checked?.ok) return 'setup';
  if (!s.address) {
    if (!s.web) return 'web';
    if (s.web === 'get' && !s.registrar) return 'registrar';
    return !s.domain ? 'domain' : 'record';
  }
  if (f.missingKeys) return 'keys';
  return 'ready';
}

/** What going back from a screen forgets, so the screen before it shows. */
export function back(at: ScreenId, s: OnlineSaved): OnlineSaved {
  const drop = (...keys: (keyof OnlineSaved)[]) => {
    const out = { ...s };
    for (const k of keys) delete out[k];
    return out;
  };
  switch (at) {
    case 'here':
    case 'provider':
      return drop('where');
    case 'create':
      return drop('provider', 'text');
    case 'paste':
      return s.provider === 'own' ? drop('provider') : drop('created');
    case 'address':
      return s.text ? drop('created') : drop('pasted');
    case 'starting':
      return drop('starting');
    case 'unsafe':
      return drop('unsafe');
    case 'compare':
    case 'mismatch':
      return drop('host', 'mismatch');
    case 'setup':
      return drop('host');
    case 'web':
      return drop('host', 'web');
    case 'registrar':
      return drop('web');
    case 'domain':
      return s.web === 'get' ? drop('registrar') : drop('web');
    case 'record':
      return drop('domain');
    case 'keys':
    case 'ready':
      return s.where === 'here' ? drop('where') : drop('address', 'web', 'domain', 'registrar');
    default:
      return drop('job', 'where');
  }
}

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/** A test address for a server known by its numbers: a name of the free service sslip.io that leads to them. */
export function testAddress(slug: string, server: string): string {
  if (!IPV4.test(server)) return `https://${server}`;
  const name = slug.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'app';
  return `https://${name}.${server.replace(/\./g, '-')}.sslip.io`;
}

/** What the name field of the one record takes for a web address: the part before the domain, or the registrar's sign for the domain itself. */
export function recordName(domain: string, apex: string): string {
  const parts = domain.toLowerCase().replace(/\.$/, '').split('.');
  // Domains such as example.co.uk keep three parts of their own.
  const own = parts.length > 2 && parts[parts.length - 1].length === 2 && parts[parts.length - 2].length <= 3 ? 3 : 2;
  return parts.length > own ? parts.slice(0, -own).join('.') : apex;
}

/** A web address as typed, without what people paste around it; "" when it is not one. */
export function cleanDomain(text: string): string {
  const d = text.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\.$/, '');
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(d) && !IPV4.test(d) ? d : '';
}

/** A server's address as typed ("203.0.113.7", "root@203.0.113.7"), as Hydor takes it; "" when it is not one. */
export function cleanServer(text: string, login: string): string {
  const t = text.trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
  const [user, address] = t.includes('@') ? [t.slice(0, t.indexOf('@')), t.slice(t.indexOf('@') + 1)] : [login.trim() || 'root', t];
  return /^[A-Za-z_][A-Za-z0-9_.-]{0,31}$/.test(user) && /^[A-Za-z0-9][A-Za-z0-9._-]{0,252}(:\d{1,5})?$/.test(address) && address.includes('.') ? `${user}@${address}` : '';
}

/** A name for a server Hydor adds: my-server, or the next free one. */
export function hostName(taken: string[]): string {
  if (!taken.includes('my-server')) return 'my-server';
  let n = 2;
  while (taken.includes(`my-server-${n}`)) n++;
  return `my-server-${n}`;
}

const SERVER_PROBLEM: Record<string, string> = {
  system: 'Hydor can only set up servers with Ubuntu or Debian: make a new one with Ubuntu.',
  docker: 'The program that runs apps could not be set up there.',
  compose: 'The program that runs apps could not be set up there.',
  memory: 'This server has too little memory: choose one with at least 2 GB.',
  disk: 'This server has too little room left.',
  'port 80': 'Something else already runs on this server. One server holds one app.',
  'port 443': 'Something else already runs on this server. One server holds one app.',
};

/** What is wrong with a server, in plain sentences (each once). */
export const serverProblems = (looked: { what: string; ok: boolean | null }[]): string[] => [...new Set(looked.filter((l) => l.ok === false).map((l) => tr(SERVER_PROBLEM[l.what] ?? 'This server is missing something Hydor needs.')))];

// ---- what a screen is drawn from -------------------------------------------------------------------------------------------------

export interface OnlineInputs {
  app: Pick<WebAppDetail, 'name' | 'shape'>;
  view: WebAppLaunchView;
  help: WebAppOnlineHelp | null;
  saved: OnlineSaved;
  /** The keys still to be given, by what they are for. */
  missing: string[];
  offer: LaunchHostOffer | null;
  looked: { what: string; ok: boolean | null }[];
  points: boolean | null;
  line: string;
  /** The text to paste as a server is created. */
  block?: string;
  busy?: boolean;
  problem?: string;
}

/** A key as the path names it: who it is from, and what it is for; never its variable. */
export const keyLine = (k: Pick<AppKey, 'from' | 'givenBy' | 'why'>): string => [keyTitle(k), keyWhy(k.why)].filter(Boolean).join(': ');

/** The keys a server still lacks. `known`: the app's keys, which say who each is from. */
export const missingOnServer = (keys: LaunchKey[] | null, known: AppKey[] = []): string[] =>
  (keys ?? []).filter((k) => k.state === 'missing').map((k) => keyLine(known.find((x) => x.name === k.name) ?? { givenBy: 'provider', why: k.why }));

export function dataOf(i: OnlineInputs): OnlineData {
  const { app, view: v, saved } = i;
  const job = jobOf(i, saved);
  const host = hostOf(i, saved);
  const deployed = v.envs.find((e) => e.env === 'production') ?? v.envs[0];
  const providers = i.help?.providers ?? [];
  const here = job ? job.place === 'hydor' : !v.envs.length;
  return {
    appName: app.name,
    busy: i.busy,
    problem: i.problem || undefined,
    internetBlocked: app.shape.signIn === 'hydor' || v.places.find((p) => p.id === 'server')?.unavailable === SERVER_NEEDS_ACCOUNTS ? tr('To go on the internet, it first needs accounts of its own, so each person signs in.') : undefined,
    fromPrice: providers.find((p) => p.price)?.price,
    providers,
    registrars: i.help?.registrars ?? [],
    provider: providers.find((p) => p.id === saved.provider),
    registrar: i.help?.registrars.find((p) => p.id === saved.registrar),
    servers: v.hosts.filter((h) => h.state === 'recorded').map((h) => ({ name: h.name, address: h.address ?? h.ssh })),
    line: i.line,
    textPath: !!saved.text,
    ownServer: saved.provider === 'own',
    unsafe: saved.unsafe?.why,
    block: i.block,
    waitingFor: saved.starting?.replace(/^[^@]*@/, ''),
    code: i.offer?.offered[0]?.fingerprint,
    serverAddress: host?.address ?? (job?.host ? v.hosts.find((h) => h.name === job.host)?.address : undefined),
    serverProblems: serverProblems(i.looked.length ? i.looked : (host?.checked?.looked ?? [])),
    domain: saved.domain,
    points: i.points,
    keys: i.missing,
    address: saved.address ?? job?.address ?? deployed?.address,
    groups: job ? launchGroups(job.steps) : [],
    stops: job?.ask?.kind === 'override' ? [...new Set(job.ask.stops.map((s) => checkProblem(s.id)))] : [],
    failed: job?.state === 'failed' ? launchFailed(job) : undefined,
    here,
    ahead: here ? (v.hydor.ahead ?? 0) > 0 : false,
    canGoBack: here ? !!v.hydor.previous : v.history.filter((r) => r.place === 'server' && r.env === deployed?.env && (r.result === 'live' || r.result === 'back')).length > 1,
  };
}
