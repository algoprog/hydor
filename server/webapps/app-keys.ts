// The keys a web app needs: who gives each, how to get it, and whether this app has a value for it (never the value). What is
// said of them comes from the app's own hydor.json (`keys`). What a wrong paste's condition says is settled here for the place
// (when.ts), so pages only get what holds.
//
// The values are the app's own, one per place (connections/vault.ts, conn_app_keys): inside this Hydor, which Preview and the
// launched version share, and one for each place on a server of your own. Elsewhere's values are
// offered, never taken. The keys marked `made` Hydor makes, one for the launched version and another for Preview. From here
// also come the card that asks (connections/cards.ts), the list on the app's page, what each process is given, what goes with
// an app that is removed, and the move of keys saved before under plain names.
import crypto from "node:crypto";
import { secretName, SECRET_LIKE, SECRET_NAME } from "../../shared/connections.ts";
import { isLiveKey, isPaymentsKey, offerable, stillMissing, type CardItem, type KeyLooks, type KeysCardView, type KeyUse, type ReuseSource } from "../../shared/keys.ts";
import type { AppKey, AppKeyPlace, KeyInfo, WebAppKeys } from "../../shared/webapps.ts";
import { HttpError } from "../auth.ts";
import { cardView, createCard, usesOf, type CardScope } from "../connections/cards.ts";
import { appKey, deleteAppKey, deleteAppKeys, deleteSecret, listAppKeys, readAppKey, readSecret, saveAppKey, secretView } from "../connections/vault.ts";
import { kvGet, kvSet, type DB } from "../db.ts";
import { listDeployments, liveOf } from "./launch-store.ts";
import { holds, type WhenContext } from "./when.ts";
import { listedKeys } from "./shape.ts";
import { getWebApp, listWebApps, type WebAppRow } from "./store.ts";

/** Names Hydor's launch makes, and names it says itself: never asked for. */
const MADE = ["APP_SECRET", "BETTER_AUTH_SECRET"];
const SAID = ["APP_URL", "BETTER_AUTH_URL", "PORT", "HOST", "NODE_ENV"];

const ENV_NAME = /^[a-z][a-z0-9-]{0,29}$/;

export function givenBy(info: KeyInfo): AppKey["givenBy"] {
  const f = info.from?.trim().toLowerCase();
  // The app's address and the like Hydor says itself, even where it is called the maker's to know.
  if (SAID.includes(info.name) && (!f || f === "you")) return "host";
  if (f === "host" || f === "made" || f === "you") return f;
  if (f) return "provider";
  if (/^HYDOR_/.test(info.name)) return "host";
  if (MADE.includes(info.name)) return "made";
  return "provider";
}

/** The place inside Hydor, and where Preview's own made keys are kept. */
export const INSIDE = "hydor";
export const PREVIEW_MADE = "hydor-preview";

/** Whether a person can be asked for it at all. */
export const askable = (k: AppKey) => k.givenBy === "provider" || k.givenBy === "you";

/** What a card shows of a key's looks here: a wrong paste's condition settled, and gone. */
export function looksHere(looks: KeyLooks | undefined, ctx: WhenContext): KeyLooks | undefined {
  if (!looks?.not) return looks;
  const not = looks.not.flatMap((w) => {
    if (!w.when) return [w];
    if (!holds(w.when, ctx)) return [];
    const { when: _, ...rest } = w;
    return [rest];
  });
  const { not: _, ...rest } = looks;
  return { ...rest, ...(not.length ? { not } : {}) };
}

const WORDS: Record<string, string> = { api: "API", id: "ID", url: "URL", ai: "AI", smtp: "SMTP", mcp: "MCP", s3: "S3", db: "database" };
const BRANDS: Record<string, string> = { google: "Google", github: "GitHub", stripe: "Stripe", resend: "Resend", postmark: "Postmark", anthropic: "Anthropic", openai: "OpenAI" };

/** STRIPE_SECRET_KEY → "Stripe secret key". */
export function keyWords(name: string): string {
  const parts = name.toLowerCase().split(/_+/).filter(Boolean);
  const out = parts.map((p) => BRANDS[p] ?? WORDS[p] ?? p).join(" ");
  return out ? out[0].toUpperCase() + out.slice(1) : name;
}

const firstSentence = (s: string | undefined) => (s ? (/^.*?[.!?](?=\s|$)/.exec(s)?.[0] ?? s) : "");

export interface ItemsAsked {
  inside: boolean;
  /** "Skip for now" on needed ones too: the app goes on without them for now. */
  skippable?: boolean;
  /** Ask again for these even though they are saved. */
  replace?: boolean;
}

/** The card's items for these keys: keys of one group on one tab, needed ones first. */
export function keyItems(keys: AppKey[], o: ItemsAsked): CardItem[] {
  const groups = new Map<string, AppKey[]>();
  for (const k of keys.filter(askable)) {
    const at = k.group?.id ? `group:${k.group.id}` : `key:${k.name}`;
    groups.set(at, [...(groups.get(at) ?? []), k]);
  }
  const taken = new Set<string>();
  const items = [...groups.values()].map((list): CardItem => {
    const first = list[0];
    let id = first.group?.id ? secretName(first.group.id) : first.name;
    if (!SECRET_NAME.test(id) || taken.has(id)) id = first.name;
    taken.add(id);
    const needed = list.some((k) => k.needed);
    const from = first.from && !["host", "made", "you"].includes(first.from.toLowerCase()) ? first.from : undefined;
    // A tab is named after who gives it where that is said; a field's label ("API key") would not tell two apart.
    const title = first.group?.title ?? from ?? (list.length === 1 ? (first.label ?? keyWords(first.name)) : keyWords(secretName(first.group?.id ?? first.name)));
    // Every key's steps, in turn (a group of several can be long: storage's six have eighteen).
    const how = [...new Set(list.flatMap((k) => k.how ?? []))].slice(0, 24);
    const url = list.find((k) => k.url)?.url;
    const why = list.length === 1 ? (first.why ?? "") : [...new Set(list.map((k) => firstSentence(k.why)).filter(Boolean))].slice(0, 2).join(" ");
    return {
      id,
      title: title.slice(0, 60),
      ...(from ? { from } : {}),
      why: why.slice(0, 600),
      ...(how.length ? { how } : {}),
      ...(url ? { url } : {}),
      fields: list.map((k) => ({
        key: k.name,
        label: (k.label ?? keyWords(k.name)).slice(0, 60),
        // Kept in the vault whatever it is; typed in the open where it is not a secret (a client id, an address).
        secret: true,
        type: (k.secret ?? SECRET_LIKE.test(k.name)) ? ("password" as const) : ("text" as const),
        ...(k.looks ? { looks: k.looks } : {}),
        ...(!k.needed && needed ? { optional: true } : {}),
      })),
      ...(needed ? {} : { optional: true }),
      ...(!needed || o.skippable ? { skippable: true } : {}),
      domains: [],
      ...(o.replace ? { replace: true } : {}),
    };
  });
  // Keys any one of which will do (Resend or Postmark): saving one tab is enough for the others it names.
  for (const item of items) {
    const names = new Set(item.fields.flatMap((f) => keys.find((k) => k.name === f.key)?.or ?? []));
    const others = items.filter((x) => x !== item && x.fields.some((f) => names.has(f.key))).map((x) => x.id);
    if (others.length) item.or = others;
  }
  // Two tabs from one provider say which is which.
  const same = new Map<string, number>();
  for (const i of items) same.set(i.title, (same.get(i.title) ?? 0) + 1);
  for (const i of items) if (same.get(i.title)! > 1) i.title = `${i.title}: ${i.fields[0].label}`.slice(0, 60);
  return items.sort((a, b) => Number(!!a.optional) - Number(!!b.optional));
}

export interface AppKeysCtx {
  db: DB;
  /** Pages hear that a card was put up in a session. */
  asked: (key: string) => void;
  /** A key for inside Hydor changed: Preview is started again, to have it. */
  inside?: (app: string) => void;
}

export function createAppKeys(c: AppKeysCtx) {
  /** The app's places: inside Hydor, and the servers it is deployed to or has keys saved for. */
  function placesOf(a: WebAppRow, also?: string): string[] {
    const servers = new Set([...listDeployments(c.db, a.id).map((d) => d.env), ...listAppKeys(c.db, a.id).map((k) => k.env), ...(also ? [also] : [])]);
    servers.delete(INSIDE);
    servers.delete(PREVIEW_MADE);
    return [INSIDE, ...[...servers].sort()];
  }

  /** What the app says of each of its keys, by name. */
  function known(a: WebAppRow): Map<string, KeyInfo> {
    return new Map(listedKeys(a).map((k) => [k.name, k]));
  }

  /** The keys of a place, with what this app has there: the one function that says it. */
  async function list(a: WebAppRow, env: string): Promise<WebAppKeys> {
    if (!ENV_NAME.test(env) || env === PREVIEW_MADE || env === "all") throw new HttpError(400, "The place is hydor, or the name of a place on a server (like production).");
    const inside = env === INSIDE;
    const keys = [...known(a).values()].map((e): AppKey => {
      const s = appKey(c.db, a.id, env, e.name);
      // A live payments key is refused inside Hydor only: on a server of their own it is what they run on.
      const live = inside && !!s && isPaymentsKey(e, { key: e.name }) && isLiveKey(readAppKey(c.db, a.id, env, e.name) ?? "");
      const { looks, ...said } = e;
      const here = looksHere(looks, { place: inside ? INSIDE : "server" });
      return {
        ...said,
        ...(here ? { looks: here } : {}),
        needed: !e.optional,
        givenBy: givenBy(e),
        set: !!s,
        ...(s ? { savedAt: s.updatedAt } : {}),
        ...(live ? { refused: "live" as const } : {}),
      };
    });
    const envs = placesOf(a, env);
    return { env, envs, servers: envs.filter((x) => x !== INSIDE), inside, keys };
  }

  /** Every key of the app, with what is set in each place that has it. */
  async function overview(a: WebAppRow): Promise<WebAppKeys> {
    const one = await list(a, INSIDE);
    const all = [one, ...(await Promise.all(one.servers.map((env) => list(a, env))))];
    const keys = one.keys.map((k): AppKey => ({
      ...k,
      places: all.flatMap((v) => {
        const here = v.keys.find((x) => x.name === k.name);
        return here ? [{ env: v.env, set: here.set, needed: here.needed, ...(here.savedAt ? { savedAt: here.savedAt } : {}), ...(here.refused ? { refused: here.refused } : {}) }] : [];
      }),
    }));
    return { ...one, env: "all", inside: false, keys };
  }

  /** What the owner saved for a place, by name (a launch to a server is given these, and nothing else of the vault). */
  function savedValues(a: WebAppRow, env: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const k of listAppKeys(c.db, a.id)) {
      if (k.env !== env || k.made) continue;
      const v = readAppKey(c.db, a.id, env, k.name);
      if (v) out[k.name] = v;
    }
    return out;
  }

  /**
   * Puts the card up for an environment's keys, in a session or for the app's page (`webapp:<id>`): the card is for that
   * place. Its tabs are the groups holding `names`, else every one the environment has, with what this app has there
   * marked so. Nothing when there is nothing to ask. A card already waiting for the same is given back.
   */
  async function open(a: WebAppRow, env: string, o: { session?: string; names?: string[]; replace?: boolean; skippable?: boolean }): Promise<KeysCardView | null> {
    const view = await list(a, env);
    const asked = view.keys.filter(askable);
    let items = keyItems(asked, { inside: view.inside, skippable: o.skippable, replace: o.replace });
    // Named keys: the tabs that hold them. Else the whole environment's, when anything is missing, what is there marked so.
    const wanted = new Set(o.names ?? []);
    if (wanted.size) items = items.filter((i) => i.fields.some((f) => wanted.has(f.key)));
    else if (asked.every((k) => k.set && !k.refused)) return null;
    if (!items.length) return null;
    // Replacing one key of a group asks for that one.
    if (o.replace && wanted.size) items = items.map((i) => ({ ...i, fields: i.fields.filter((f) => wanted.has(f.key)) }));
    return put(a, env, items, view.inside, o);
  }

  /**
   * A card for keys the app does not list yet (a service just chosen, before its hydor.json says it): the same card, with
   * what is saved for the place marked so. A payments key inside Hydor is a test key here too.
   */
  async function openKeys(a: WebAppRow, env: string, keys: AppKey[], o: { session?: string; skippable?: boolean }): Promise<KeysCardView | null> {
    const items = keyItems(keys, { inside: true, skippable: o.skippable });
    return items.length ? put(a, env, items, true, o) : null;
  }

  /** Puts a card of these tabs up, in a session or on the app's page; a card waiting for the same is given back. */
  function put(a: WebAppRow, env: string, items: CardItem[], inside: boolean, o: { session?: string; replace?: boolean }): KeysCardView | null {
    const place = env;
    const key = o.session ?? `webapp:${a.id}`;
    const name = secretName(`APPKEYS_${place}_${a.id}`);
    const waiting = c.db.prepare("select id from conn_requests where key = ? and name = ? and state = 'pending' order by created_at desc, rowid desc limit 1").get(key, name) as { id: string } | undefined;
    const had = waiting ? cardView(c.db, waiting.id) : null;
    const same = (x: { id: string; skippable?: boolean; replace?: boolean; fields: { key: string }[] }) => `${x.id}:${!!x.skippable}:${!!x.replace}:${x.fields.map((f) => f.key).join(",")}`;
    if (had && had.items.map(same).join() === items.map(same).join()) return had;
    // A card that asks for all the one waiting did takes its place; otherwise both stay, each for its own.
    const covers = had?.items.every((h) => h.fields.every((f) => items.some((i) => i.fields.some((g) => g.key === f.key))));
    const scope: CardScope = { app: { id: a.id, name: a.name, env: place }, byName: true, ...(inside ? { inside: true } : {}) };
    const card = createCard(c.db, { key, name, items, scope, there: o.replace ? [] : items.map((i) => i.id) });
    // Everything named is there already: nothing to put up.
    if (card.items.every((i) => i.state !== "todo")) {
      c.db.prepare("delete from conn_requests where id = ?").run(card.id);
      return null;
    }
    if (had && covers) c.db.prepare("delete from conn_requests where id = ?").run(had.id);
    c.asked(key);
    return card;
  }

  /** Values of the same names elsewhere that may be offered to a card: only where a test and a live value look alike for sure. */
  function sources(scope: CardScope, item: CardItem): (ReuseSource & { values: () => Record<string, string> })[] {
    const here = scope.app;
    if (!here || !item.fields.every((f) => offerable(item, f))) return [];
    const names = item.fields.map((f) => f.key);
    const need = item.fields.filter((f) => !f.optional).map((f) => f.key);
    const at = new Map<string, { app: string; env: string; names: Set<string> }>();
    for (const r of listAppKeys(c.db)) {
      if (r.made || r.env === PREVIEW_MADE || !names.includes(r.name) || (r.app === here.id && r.env === here.env)) continue;
      const k = `${r.app}:${r.env}`;
      at.set(k, at.get(k) ?? { app: r.app, env: r.env, names: new Set() });
      at.get(k)!.names.add(r.name);
    }
    const out: (ReuseSource & { values: () => Record<string, string> })[] = [];
    const read = (from: (n: string) => string | null | undefined) => () => Object.fromEntries(names.flatMap((n) => (from(n) ? [[n, from(n)!]] : [])));
    for (const x of [...at.values()].sort((p, q) => Number(q.app === here.id) - Number(p.app === here.id))) {
      const a = getWebApp(c.db, x.app);
      if (!a || !need.every((n) => x.names.has(n))) continue;
      out.push({
        id: `app:${x.app}:${x.env}`,
        kind: x.app === here.id ? "place" : "app",
        env: x.env,
        // Its server place is the only one that app has: the card calls it "your server", as the Keys tab does.
        ...(x.env !== INSIDE && placesOf(a, x.app === here.id ? here.env : undefined).filter((e) => e !== INSIDE).length === 1 ? { only: true } : {}),
        ...(x.app === here.id ? {} : { app: a.name }),
        values: read((n) => readAppKey(c.db, x.app, x.env, n)),
      });
    }
    const list_ = out.slice(0, 3);
    if (need.every((n) => secretView(c.db, n))) list_.push({ id: "vault", kind: "vault", values: read((n) => readSecret(c.db, n)?.value) });
    return list_;
  }

  /** The person saved keys on a card: Preview starts again to have them. */
  function saved(scope: CardScope, _names: string[]) {
    const a = scope.app ? getWebApp(c.db, scope.app.id) : null;
    if (a && scope.app?.env === INSIDE) c.inside?.(a.id);
  }

  /** Takes a key of one place away. */
  function remove(a: WebAppRow, env: string, name: string) {
    if (!ENV_NAME.test(env) || !SECRET_NAME.test(name)) throw new HttpError(400, "Say which key, and for which place.");
    const had = appKey(c.db, a.id, env, name);
    if (!had || had.made) throw new HttpError(404, "There is no such key to remove.");
    deleteAppKey(c.db, a.id, env, name);
    if (env === INSIDE) c.inside?.(a.id);
  }

  /** The app is removed: its keys go with it, and its cards. */
  function forget(app: string): string[] {
    const names = [...new Set(listAppKeys(c.db, app).map((k) => k.name))];
    deleteAppKeys(c.db, app);
    c.db.prepare("delete from conn_requests where scope is not null and state = 'pending' and json_extract(scope, '$.app.id') = ?").run(app);
    return names;
  }

  // ---- what each process is given ---------------------------------------------------------------------------------------

  /** The names among these that Hydor makes: those the app says are `made`, else the two it makes by name. */
  function madeNames(a: WebAppRow, names: string[]): string[] {
    const said = known(a);
    return [...new Set(names)].filter((n) => SECRET_NAME.test(n) && givenBy(said.get(n) ?? { name: n, from: "" }) === "made");
  }

  const namedKeys = (a: WebAppRow): string[] => listedKeys(a).map((k) => k.name);

  /** A made key of a place: 32 random bytes, made the first time and kept with the app's keys. */
  function make(a: WebAppRow, place: string, name: string): string {
    const had = readAppKey(c.db, a.id, place, name);
    if (had) return had;
    const v = crypto.randomBytes(32).toString("base64url");
    saveAppKey(c.db, a.id, place, name, v, { made: true });
    return v;
  }

  /** What the person gave for inside Hydor. A live payments key is never one of them, whatever the store holds. */
  function given(a: WebAppRow, skip: string[]): Record<string, string> {
    const out: Record<string, string> = {};
    for (const k of listAppKeys(c.db, a.id)) {
      if (k.env !== INSIDE || k.made || skip.includes(k.name)) continue;
      const v = readAppKey(c.db, a.id, INSIDE, k.name);
      if (v && !(isPaymentsKey({}, { key: k.name }) && isLiveKey(v))) out[k.name] = v;
    }
    return out;
  }

  /** The launched version inside Hydor: the app's keys for inside Hydor, and the made ones its environment names. */
  function insideValues(a: WebAppRow): Record<string, string> {
    const made = madeNames(a, namedKeys(a));
    const out = given(a, made);
    for (const n of made) out[n] = make(a, INSIDE, n);
    return out;
  }

  /** The version being changed (Preview): the same keys the person gave for inside Hydor, and made ones of its own. */
  function previewValues(a: WebAppRow): Record<string, string> {
    const made = madeNames(a, namedKeys(a));
    const out = given(a, made);
    for (const n of made) out[n] = make(a, PREVIEW_MADE, n);
    return out;
  }

  /** The apps that keep a value of their own under a name of the vault: removing the vault's does not touch theirs. */
  function uses(name: string): KeyUse[] {
    return listWebApps(c.db).flatMap((a) => {
      const where = listAppKeys(c.db, a.id).filter((k) => k.name === name && !k.made && k.env !== PREVIEW_MADE).map((k) => k.env);
      return where.length ? [{ kind: "webapp" as const, id: a.id, name: a.name, where, own: true }] : [];
    });
  }

  // ---- keys saved before under plain names ------------------------------------------------------------------------------

  /**
   * Once: the keys a web app was saved before under plain names in the vault become its own. Those a card recorded as
   * saved or used for it and a place, and those a launched version was being given. A plain one the card alone had made
   * (no hosts, not for commands, no other app naming it) goes; any other stays in the vault too.
   */
  function migrate() {
    if (kvGet(c.db, "webapps.keys.scoped") === "1") return;
    const apps = new Map(listWebApps(c.db).map((a) => [a.id, a]));
    const wanted = new Map<string, { a: WebAppRow; place: string; name: string }>();
    const want = (a: WebAppRow, env: string, name: string) => {
      if (!SECRET_NAME.test(name) || /^HYDOR_/.test(name)) return;
      const place = env === PREVIEW_MADE ? INSIDE : env;
      wanted.set(`${a.id}/${place}/${name}`, { a, place, name });
    };
    const rows = c.db.prepare("select items, answers, scope from conn_requests where items is not null and scope is not null").all() as { items: string; answers: string | null; scope: string }[];
    for (const r of rows) {
      try {
        const scope = JSON.parse(r.scope) as CardScope;
        const a = scope.byName && scope.app ? apps.get(scope.app.id) : undefined;
        if (!a) continue;
        const answers = JSON.parse(r.answers ?? "{}") as Record<string, { state?: string }>;
        for (const it of JSON.parse(r.items) as CardItem[])
          if (answers[it.id]?.state === "saved" || answers[it.id]?.state === "used") for (const f of it.fields) want(a, scope.app!.env, f.key);
      } catch {}
    }
    for (const a of apps.values()) {
      if (liveOf(c.db, a.id).current) for (const n of namedKeys(a)) want(a, INSIDE, n);
    }
    const cardMade = new Set<string>();
    for (const { a, place, name } of wanted.values()) {
      const s = readSecret(c.db, name);
      if (!s || appKey(c.db, a.id, place, name)) continue;
      if (place === INSIDE && isPaymentsKey({}, { key: name }) && isLiveKey(s.value)) continue;
      saveAppKey(c.db, a.id, place, name, s.value, { made: madeNames(a, [name]).length > 0 });
      if (s.view.note.includes(` for ${a.name}: `) && !s.view.domains.length && !s.view.commands) cardMade.add(name);
    }
    for (const name of cardMade) if (!usesOf(name).some((u) => u.kind === "app")) deleteSecret(c.db, name);
    kvSet(c.db, "webapps.keys.scoped", "1");
  }

  return { list, overview, open, openKeys, uses, sources, saved, remove, forget, insideValues, previewValues, savedValues, migrate };
}

export type AppKeys = ReturnType<typeof createAppKeys>;
