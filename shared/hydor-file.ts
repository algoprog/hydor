// hydor.json: the one file at the root of a web app, which says what Hydor needs to know to run it (the
// contract: docs/plans/web-apps.md; the builders' page: skills/web-app-builder/references/hydor-contract.md). Written by whoever builds the app,
// in any stack. Here: its types, and the reader that says what is wrong in plain sentences. The reader takes text and gives either the file as
// Hydor reads it or every problem at once. It uses nothing but the language, so the checker a builder runs by itself carries it as it is
// (hydor.schema.json beside this file says the same for editors; server/webapps/contract-check-test.ts holds the two together).

export const HYDOR_FILE = 'hydor.json';
/** A hydor.json larger than this is not read. */
export const HYDOR_FILE_MAX = 64 * 1024;

export type SignIn = 'hydor' | 'own';
export type ServiceTier = 'quick' | 'standard' | 'best';

/** One request the checker makes to have the app call a service, so the call can be looked at. */
export interface TryRequest {
  method: 'GET' | 'POST';
  path: string;
  body?: unknown;
}

/** A key the app needs, as the keys card takes it (shared/webapps.ts KeyInfo). */
export interface HydorKey {
  /** The environment variable it is given in. */
  name: string;
  /** Who gives it: a provider's name, `you` (the owner chooses it) or `made` (Hydor makes a random one). */
  from: string;
  why: string;
  /** How to get it, a step a line (not needed for a made one). */
  how?: string[];
  url?: string;
  label?: string;
  optional?: boolean;
  group?: { id: string; title?: string };
  /** What a right value looks like (shared/keys.ts KeyLooks: `starts` is read as `prefix`). */
  looks?: { prefix?: string[]; pattern?: string; say?: string; not?: { starts?: string; pattern?: string; say: string; when?: string }[]; whole?: boolean };
}

export interface HydorServices {
  ai?: { tiers: ServiceTier[]; usdPerDay?: number; try?: TryRequest };
  embed?: { try?: TryRequest };
  mail?: { try?: TryRequest };
}

/** The names of the environment variables the app reads. */
export interface HydorVars {
  port: string;
  data: string;
  url?: string;
  secret?: string;
  /** The address it listens on (HOST when left out): inside Hydor 127.0.0.1, on a server 0.0.0.0. */
  host?: string;
}

/** A request that signs a test person up, or in: in `body`, {name}, {email} and {password} are that person's. */
export interface AccountRequest {
  method: 'POST' | 'PUT';
  path: string;
  send: 'json' | 'form';
  body: Record<string, string | number | boolean>;
}

/** hydor.json as Hydor reads it. */
export interface HydorFile {
  name?: string;
  build?: string;
  start: string;
  dev?: string;
  env: HydorVars;
  ready: string;
  signIn: SignIn;
  /** With signIn `hydor`: an address only a signed-in person is answered at (default /). */
  private: string;
  keys: HydorKey[];
  services: HydorServices;
  database?: { file: string; sqlite: boolean };
  /** With signIn `own`: how the checks make a test person in a throwaway copy, to look at the signed-in pages. */
  accounts?: { signUp: AccountRequest; signIn: AccountRequest };
  /** One command, or one request, that tries the app after a launch. */
  smoke?: string | TryRequest;
}

export type HydorRead = { ok: true; file: HydorFile } | { ok: false; problems: string[] };

/** Every field the file may have, and what each is for (the problems name them). */
export const HYDOR_FIELDS = ['$schema', 'name', 'build', 'start', 'dev', 'env', 'ready', 'signIn', 'private', 'keys', 'services', 'database', 'accounts', 'smoke'] as const;

/** Names Hydor sets itself, or that would change how a program is run: never a variable or a key of the file's. */
export const RESERVED_ENV = ['PATH', 'HOME', 'HOST', 'NODE_ENV', 'NODE_OPTIONS', 'SHELL', 'USER', 'PWD', 'TMPDIR', 'IFS', 'BASH_ENV', 'ENV', 'PYTHONPATH', 'PYTHONSTARTUP'];
const reserved = (name: string) => RESERVED_ENV.includes(name) || /^(HYDOR_|LD_|DYLD_)/.test(name);

const ENV_NAME = /^[A-Z_][A-Z0-9_]{0,63}$/;
/** As the vault names keys (shared/connections.ts SECRET_NAME). */
const KEY_NAME = /^[A-Z][A-Z0-9_]{1,63}$/;
const DB_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const TIERS = ['quick', 'standard', 'best'];

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The nearest of `known` to a word that is none of them (one or two letters off), for "did you mean". */
function near(word: string, known: readonly string[]): string | undefined {
  const distance = (a: string, b: string) => {
    const row = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      let before = row[0];
      row[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const keep = row[j];
        row[j] = Math.min(row[j] + 1, row[j - 1] + 1, before + (a[i - 1] === b[j - 1] ? 0 : 1));
        before = keep;
      }
    }
    return row[b.length];
  };
  return known.map((k) => ({ k, d: distance(word.toLowerCase(), k.toLowerCase()) })).filter((x) => x.d <= 2).sort((a, b) => a.d - b.d)[0]?.k;
}

/** What in a command a shell would read as more than one program, or as a redirect, outside quotes. */
export function shellExtra(command: string): string | null {
  let quote = '';
  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    if (quote) {
      if (c === '\\' && quote === '"') i++;
      else if (c === quote) quote = '';
      else if (quote === '"' && (c === '`' || (c === '$' && command[i + 1] === '('))) return c === '`' ? '`' : '$(';
      continue;
    }
    if (c === '\\') i++;
    else if (c === '"' || c === "'") quote = c;
    else if (';&|<>`\n'.includes(c)) return c === '\n' ? 'a new line' : c;
    else if (c === '$' && command[i + 1] === '(') return '$(';
  }
  return quote ? `an unclosed ${quote}` : null;
}

export function readHydorValue(value: unknown): HydorRead {
  const problems: string[] = [];
  const say = (text: string) => void problems.push(text);
  if (!isObject(value)) return { ok: false, problems: [`${HYDOR_FILE} should hold one object, in braces.`] };
  const unknown = (o: Json, known: readonly string[], where: string) => {
    for (const k of Object.keys(o)) {
      if (known.includes(k)) continue;
      const meant = near(k, known);
      say(`${where}“${k}” is not a field Hydor reads${meant ? ` (did you mean “${meant}”?)` : ''}: take it out.`);
    }
  };
  unknown(value, HYDOR_FIELDS, '');

  const line = (v: unknown, what: string, max: number): string | undefined => {
    if (typeof v !== 'string' || !v.trim()) return void say(`${what} should be text.`);
    if (v.length > max) return void say(`${what} is longer than ${max} characters.`);
    if (/[\u0000-\u001f\u007f]/.test(v)) return void say(`${what} should be one line.`);
    return v.trim();
  };
  const path = (v: unknown, what: string): string | undefined => {
    if (typeof v !== 'string' || !v.startsWith('/') || v.startsWith('//') || /[\s\\#]/.test(v) || v.length > 200) return void say(`${what} should be an address inside the app: it starts with one slash, like /health, with no spaces.`);
    return v;
  };
  /** One program and its arguments: Hydor stops it by telling that program, so nothing may stand between them. */
  const command = (v: unknown, what: string): string | undefined => {
    const c = line(v, what, 500);
    if (!c) return undefined;
    const extra = shellExtra(c);
    if (extra) return void say(`${what} should be one command, with no ${extra}: put build steps in “build”, and set what the program needs in the program.`);
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(c)) return void say(`${what} should start with the program, not with a variable (NAME=value): Hydor sets the environment.`);
    return c;
  };

  const name = value.name === undefined ? undefined : line(value.name, '“name”', 80);
  const build = value.build === undefined ? undefined : line(value.build, '“build”', 1000);
  const start = value.start === undefined ? void say('“start” is missing: the one command that starts the app in production, like "node server.js".') : command(value.start, '“start”');
  const dev = value.dev === undefined ? undefined : command(value.dev, '“dev”');

  const env: HydorVars = { port: '', data: '' };
  if (!isObject(value.env)) say('“env” is missing: the names of the variables the app reads its port and data folder from, like { "port": "PORT", "data": "DATA_DIR" }.');
  else {
    unknown(value.env, ['port', 'data', 'url', 'secret', 'host'], 'In “env”, ');
    const taken = new Map<string, string>();
    for (const k of ['port', 'data', 'url', 'secret', 'host'] as const) {
      const v = value.env[k];
      if (v === undefined) {
        if (k === 'port') say('“env.port” is missing: the variable the app reads its port from, usually "PORT".');
        if (k === 'data') say('“env.data” is missing: the variable the app reads its data folder from, such as "DATA_DIR". Everything the app keeps goes in that folder.');
        continue;
      }
      if (typeof v !== 'string' || !ENV_NAME.test(v)) say(`“env.${k}” should be a variable's name in capitals, such as ${k === 'port' ? 'PORT' : k === 'data' ? 'DATA_DIR' : k === 'url' ? 'APP_URL' : k === 'host' ? 'HOST' : 'APP_SECRET'}.`);
      else if (reserved(v) && !(k === 'host' && v === 'HOST')) say(`“env.${k}” cannot be ${v}: Hydor sets that one itself.`);
      else if (taken.has(v)) say(`“env.${k}” and “env.${taken.get(v)}” are both ${v}: each needs a variable of its own.`);
      else {
        taken.set(v, k);
        env[k] = v;
      }
    }
  }

  const ready = value.ready === undefined ? void say('“ready” is missing: an address that answers once the app is ready, like "/health". It has to answer without anyone signed in.') : path(value.ready, '“ready”');
  const signIn = value.signIn === 'hydor' || value.signIn === 'own' ? value.signIn : void say('“signIn” should be "hydor" (Hydor says who is there, in the x-hydor-person header) or "own" (the app has accounts of its own).');
  const privatePath = value.private === undefined ? '/' : path(value.private, '“private”');
  if (value.private !== undefined && value.signIn === 'own') say('“private” is only for "signIn": "hydor": take it out.');
  if (signIn === 'hydor' && isObject(value.env) && value.env.secret === undefined) say('With "signIn": "hydor", “env.secret” is needed: the app checks who is there with its secret.');

  const tryOf = (v: unknown, what: string): TryRequest | undefined => {
    if (v === undefined) return undefined;
    if (!isObject(v)) return void say(`${what} should be { "method": "POST", "path": "/…", "body": {…} }.`);
    unknown(v, ['method', 'path', 'body'], `In ${what}, `);
    if (v.method !== 'GET' && v.method !== 'POST') say(`${what}.method should be "GET" or "POST".`);
    const p = path(v.path, `${what}.path`);
    if (!p || (v.method !== 'GET' && v.method !== 'POST')) return undefined;
    return { method: v.method, path: p, ...(v.body !== undefined ? { body: v.body } : {}) };
  };

  const services: HydorServices = {};
  if (value.services !== undefined) {
    if (!isObject(value.services)) say('“services” should be an object: { "ai": {…}, "embed": true, "mail": true }, with only those the app calls.');
    else {
      unknown(value.services, ['ai', 'embed', 'mail'], 'In “services”, ');
      const ai = value.services.ai;
      if (ai !== undefined) {
        if (!isObject(ai)) say('“services.ai” should be { "tiers": ["quick"] }: the sizes of model the app asks for.');
        else {
          unknown(ai, ['tiers', 'usdPerDay', 'try'], 'In “services.ai”, ');
          const tiers = Array.isArray(ai.tiers) ? ai.tiers : [];
          if (!tiers.length || !tiers.every((t) => TIERS.includes(t as string)) || new Set(tiers).size !== tiers.length) say('“services.ai.tiers” should list what the app asks for, each once, of "quick", "standard" and "best".');
          const usd = ai.usdPerDay;
          if (usd !== undefined && !(typeof usd === 'number' && Number.isFinite(usd) && usd >= 0 && usd <= 10_000)) say('“services.ai.usdPerDay” should be what a day of it costs, in US dollars (0 to 10000).');
          const t = tryOf(ai.try, '“services.ai.try”');
          services.ai = { tiers: tiers.filter((x): x is ServiceTier => TIERS.includes(x as string)), ...(typeof usd === 'number' ? { usdPerDay: usd } : {}), ...(t ? { try: t } : {}) };
        }
      }
      for (const k of ['embed', 'mail'] as const) {
        const v = value.services[k];
        if (v === undefined || v === false) continue;
        if (v === true) services[k] = {};
        else if (isObject(v)) {
          unknown(v, ['try'], `In “services.${k}”, `);
          const t = tryOf(v.try, `“services.${k}.try”`);
          services[k] = t ? { try: t } : {};
        } else say(`“services.${k}” should be true, or { "try": {…} }.`);
      }
    }
  }

  const keys: HydorKey[] = [];
  if (value.keys !== undefined) {
    if (!Array.isArray(value.keys) || value.keys.length > 40) say('“keys” should be a list of at most 40 keys.');
    else
      value.keys.forEach((raw, i) => {
        if (!isObject(raw)) return say(`Key ${i + 1} should be an object with name, from, why and how.`);
        const at = typeof raw.name === 'string' && raw.name ? `The key ${raw.name.slice(0, 40)}` : `Key ${i + 1}`;
        unknown(raw, ['name', 'from', 'why', 'how', 'url', 'label', 'optional', 'group', 'looks'], `${at}: `);
        const before = problems.length;
        const k = raw.name;
        if (typeof k !== 'string' || !KEY_NAME.test(k)) say(`${at}: “name” should be the variable it is given in, in capitals, such as STRIPE_SECRET_KEY.`);
        else if (reserved(k)) say(`${at} cannot have that name: Hydor sets it itself.`);
        else if (Object.values(env).includes(k)) say(`${at} is also a name in “env”: each needs a variable of its own.`);
        else if (keys.some((x) => x.name === k)) say(`${at} is listed twice.`);
        const from = line(raw.from, `${at}: “from” (who gives it: a provider's name, "you" or "made")`, 60);
        const why = line(raw.why, `${at}: “why” (what the app does with it)`, 600);
        let how: string[] | undefined;
        if (raw.how !== undefined) {
          if (!Array.isArray(raw.how) || !raw.how.length || raw.how.length > 8 || !raw.how.every((s) => typeof s === 'string' && s.trim() && s.length <= 300)) say(`${at}: “how” should be one to eight steps, each a short line.`);
          else how = raw.how.map((s) => (s as string).trim());
        } else if (from && from.toLowerCase() !== 'made') say(`${at}: “how” is missing: the steps that get it, so the owner is not left looking.`);
        let url: string | undefined;
        if (raw.url !== undefined) {
          if (typeof raw.url !== 'string' || !/^https:\/\/[^\s]+$/.test(raw.url) || raw.url.length > 300) say(`${at}: “url” should be the provider's page, starting https://.`);
          else url = raw.url;
        }
        const label = raw.label === undefined ? undefined : line(raw.label, `${at}: “label”`, 60);
        if (raw.optional !== undefined && typeof raw.optional !== 'boolean') say(`${at}: “optional” is true or false.`);
        let group: HydorKey['group'];
        if (raw.group !== undefined) {
          if (!isObject(raw.group) || typeof raw.group.id !== 'string' || !/^[A-Za-z0-9_-]{1,40}$/.test(raw.group.id)) say(`${at}: “group” should be { "id": "…", "title": "…" }, the same id for keys got together.`);
          else group = { id: raw.group.id, ...(typeof raw.group.title === 'string' && raw.group.title ? { title: raw.group.title.slice(0, 80) } : {}) };
        }
        let looks: HydorKey['looks'];
        if (raw.looks !== undefined) {
          if (!isObject(raw.looks)) say(`${at}: “looks” should be { "starts": ["sk_"], "say": "starts with sk_" }.`);
          else {
            const l = raw.looks;
            unknown(l, ['starts', 'prefix', 'pattern', 'say', 'not'], `${at}, in “looks”: `);
            const starts = l.starts ?? l.prefix;
            const prefix = Array.isArray(starts) ? starts.filter((x): x is string => typeof x === 'string' && !!x).slice(0, 6) : [];
            if (starts !== undefined && !prefix.length) say(`${at}: “looks.starts” should be a list of how a right value starts, such as ["sk_"].`);
            const not: NonNullable<NonNullable<HydorKey['looks']>['not']> = [];
            if (l.not !== undefined) {
              const list = Array.isArray(l.not) ? l.not.slice(0, 8) : [];
              if (!list.length) say(`${at}: “looks.not” should be a list of { "starts": "pk_", "say": "…" }.`);
              for (const w of list) {
                if (!isObject(w) || typeof w.say !== 'string' || !w.say.trim() || !(typeof w.starts === 'string' || typeof w.pattern === 'string')) say(`${at}: each of “looks.not” should say what it is ("starts" or "pattern") and what to tell the owner ("say").`);
                else
                  not.push({
                    ...(typeof w.starts === 'string' && w.starts ? { starts: w.starts.slice(0, 40) } : {}),
                    ...(typeof w.pattern === 'string' && w.pattern.length <= 200 ? { pattern: w.pattern } : {}),
                    say: w.say.trim().slice(0, 200),
                    ...(typeof w.when === 'string' ? { when: w.when.slice(0, 200) } : {}),
                  });
              }
            }
            looks = { ...(prefix.length ? { prefix } : {}), ...(typeof l.pattern === 'string' && l.pattern.length <= 200 ? { pattern: l.pattern } : {}), ...(typeof l.say === 'string' ? { say: l.say.slice(0, 200) } : {}), ...(not.length ? { not } : {}), whole: true };
          }
        }
        if (problems.length === before && typeof k === 'string' && from && why)
          keys.push({ name: k, from, why, ...(how ? { how } : {}), ...(url ? { url } : {}), ...(label ? { label } : {}), ...(raw.optional === true ? { optional: true } : {}), ...(group ? { group } : {}), ...(looks && Object.keys(looks).length ? { looks } : {}) });
      });
  }

  let database: HydorFile['database'];
  if (value.database !== undefined) {
    if (!isObject(value.database)) say('“database” should be { "file": "app.db", "sqlite": true }.');
    else {
      unknown(value.database, ['file', 'sqlite'], 'In “database”, ');
      const f = value.database.file;
      const sqlite = value.database.sqlite;
      if (typeof sqlite !== 'boolean') say('“database.sqlite” should be true (a SQLite file, which Hydor backs up while the app runs) or false.');
      if (typeof f !== 'string' || !DB_NAME.test(f)) say('“database.file” should be the name of the file in the data folder, with no folder before it, such as app.db.');
      else if (sqlite === true && !/\.(db|sqlite|sqlite3)$/i.test(f)) say('A SQLite file’s name ends in .db, .sqlite or .sqlite3.');
      else if (typeof sqlite === 'boolean') database = { file: f, sqlite };
    }
  }

  let accounts: HydorFile['accounts'];
  const accountOf = (v: unknown, what: string): AccountRequest | undefined => {
    if (!isObject(v)) return void say(`${what} should be { "path": "/…", "body": { "email": "{email}", "password": "{password}" } }.`);
    unknown(v, ['method', 'path', 'send', 'body'], `In ${what}, `);
    const method = v.method === undefined ? 'POST' : v.method;
    if (method !== 'POST' && method !== 'PUT') say(`${what}.method should be "POST" or "PUT".`);
    const send = v.send === undefined ? 'json' : v.send;
    if (send !== 'json' && send !== 'form') say(`${what}.send should be "json" or "form".`);
    const p = path(v.path, `${what}.path`);
    const body = isObject(v.body) && Object.values(v.body).every((x) => typeof x === 'string' || typeof x === 'number' || typeof x === 'boolean') ? (v.body as AccountRequest['body']) : undefined;
    if (!body) say(`${what}.body should be the fields to send, such as { "email": "{email}", "password": "{password}" }.`);
    if (!p || !body || (method !== 'POST' && method !== 'PUT') || (send !== 'json' && send !== 'form')) return undefined;
    return { method, path: p, send, body };
  };
  if (value.accounts !== undefined) {
    if (!isObject(value.accounts)) say('“accounts” should be { "signUp": {…}, "signIn": {…} }.');
    else {
      unknown(value.accounts, ['signUp', 'signIn'], 'In “accounts”, ');
      const signUp = accountOf(value.accounts.signUp, '“accounts.signUp”');
      const signInTo = accountOf(value.accounts.signIn, '“accounts.signIn”');
      if (signUp && signInTo) accounts = { signUp, signIn: signInTo };
    }
    if (value.signIn === 'hydor') say('“accounts” is only for "signIn": "own": take it out.');
  }

  let smoke: HydorFile['smoke'];
  if (value.smoke !== undefined) {
    if (typeof value.smoke === 'string') smoke = command(value.smoke, '“smoke”');
    else if (isObject(value.smoke)) smoke = tryOf(value.smoke, '“smoke”');
    else say('“smoke” should be one command, like "node smoke.mjs", or one request, like { "method": "GET", "path": "/api/items" }.');
  }

  if (problems.length || !start || !ready || !signIn || !privatePath) return { ok: false, problems };
  return {
    ok: true,
    file: {
      ...(name ? { name } : {}),
      ...(build ? { build } : {}),
      start,
      ...(dev ? { dev } : {}),
      env,
      ready,
      signIn,
      private: privatePath,
      keys,
      services,
      ...(database ? { database } : {}),
      ...(accounts ? { accounts } : {}),
      ...(smoke ? { smoke } : {}),
    },
  };
}

export function readHydorText(text: string): HydorRead {
  if (text.length > HYDOR_FILE_MAX) return { ok: false, problems: [`${HYDOR_FILE} is too large to be one (over 64 KB).`] };
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (e) {
    return { ok: false, problems: [`${HYDOR_FILE} is not valid JSON (${(e as Error).message.replace(/^JSON\.parse: /, '')}).`] };
  }
  return readHydorValue(value);
}

/** Whether a call of a service is declared at all. */
export const usesServices = (s: HydorServices): boolean => !!(s.ai || s.embed || s.mail);
