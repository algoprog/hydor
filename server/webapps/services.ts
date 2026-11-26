// The services a web app needs, from the catalog (services.json; its shapes in shared/services.ts): what is offered for
// each need, the card that offers them, and what a choice does. The chosen service's keys and their names go to the agent
// building the app, to write into hydor.json, and the keys card follows, in the catalog's words. What was chosen is kept with
// the app, and can be changed.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { KeyLooks, KeysCardView } from "../../shared/keys.ts";
import { priceStale, type AppServicesView, type Catalog, type ChosenService, type Need, type NeedView, type Service, type ServiceKey, type ServicesCardView, type ServiceView } from "../../shared/services.ts";
import type { AppKey } from "../../shared/webapps.ts";
import { HttpError } from "../auth.ts";
import { APP_ROOT } from "../config.ts";
import { kvGet, kvSet, type DB } from "../db.ts";
import { appKey } from "../connections/vault.ts";
import { looksHere, type AppKeys } from "./app-keys.ts";
import type { WebAppRow } from "./store.ts";

type Json = Record<string, any>;
const rec = (v: unknown): Json => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});

/** Read from Hydor's own folder as it runs (the desktop app carries it). */
export const CATALOG_FILE = path.join(APP_ROOT, "server/webapps/services.json");

let cached: { file: string; mtime: number; catalog: Catalog } | null = null;
export function readCatalog(file = CATALOG_FILE): Catalog {
  const mtime = fs.statSync(file).mtimeMs;
  if (cached?.file !== file || cached.mtime !== mtime) cached = { file, mtime, catalog: asOffered(JSON.parse(fs.readFileSync(file, "utf8")) as CatalogFile) };
  return cached.catalog;
}

/** A step as the file has it: its words, or what the provider's own pages did not confirm. */
type FileStep = string | { unconfirmed: string };
type FileService = Omit<Service, "keys" | "setup"> & { keys: (Omit<ServiceKey, "how"> & { how: FileStep[] })[]; setup?: FileStep[]; hold?: { name?: string; why: string; url: string } };
export type CatalogFile = Omit<Catalog, "needs"> & { needs: (Omit<Need, "services" | "also"> & { services: FileService[]; also?: FileService[] })[] };

/** What stands where a step could not be confirmed: nothing is told as fact, and the card's link is the way. */
export const unconfirmedStep = (provider: string, what: string) => `${provider}'s own pages did not confirm ${what}: find it on the page the link below opens.`;

/** The file as it is offered: a service on hold is listed as left out, with its reason and address, and no unconfirmed step is told. */
export function asOffered(file: CatalogFile): Catalog {
  const offered = ({ hold: _hold, ...s }: FileService): Service => {
    const said = (steps: FileStep[]) => steps.map((x) => (typeof x === "string" ? x : unconfirmedStep(s.name, x.unconfirmed)));
    return { ...s, keys: s.keys.map((k) => ({ ...k, how: said(k.how) })), ...(s.setup ? { setup: said(s.setup) } : {}) } as Service;
  };
  return {
    ...file,
    needs: file.needs.map(({ also, ...n }) => {
      const held = [...n.services, ...(also ?? [])].filter((s) => s.hold);
      return {
        ...n,
        services: n.services.filter((s) => !s.hold).map(offered),
        ...(also ? { also: also.filter((s) => !s.hold).map(offered) } : {}),
        leftOut: [...n.leftOut, ...held.map((s) => ({ name: s.hold!.name ?? s.name, why: s.hold!.why, url: s.hold!.url }))],
      };
    }),
  };
}

export const needOf = (catalog: Catalog, id: string): Need | undefined => catalog.needs.find((n) => n.id === id);
export const everyService = (n: Need): Service[] => [...n.services, ...(n.also ?? [])];

/** A service named by its id or its name, among those offered for a need. */
export function serviceOf(n: Need, said: string): Service | undefined {
  const want = said.trim().toLowerCase();
  return everyService(n).find((s) => s.id === want || s.name.toLowerCase() === want);
}

/** A service as a card or an agent is shown it: figures only while they are fresh. */
export function serviceView(s: Service, now: number): ServiceView {
  const fresh = (p: Service["free"]) => (p && !priceStale(p.read, now) ? p.text : undefined);
  const free = fresh(s.free);
  const paid = fresh(s.paid);
  const stale = [s.free, s.paid].some((p) => p && priceStale(p.read, now));
  return {
    id: s.id,
    name: s.name,
    recommended: !!s.default,
    why: s.why,
    ...(free && !stale ? { free } : {}),
    ...(paid && !stale ? { paid } : {}),
    checkPrice: stale || (!s.free && !s.paid),
    ...(s.catch ? { catch: s.catch } : {}),
    ...(s.notFor?.length ? { notFor: s.notFor } : {}),
    page: s.page,
    keys: s.keys.map((k) => k.name),
  };
}

export function needView(n: Need, now: number): NeedView {
  const view = (s: Service) => serviceView(s, now);
  const read = everyService(n)
    .flatMap((s) => [s.free, s.paid])
    .filter((p): p is NonNullable<typeof p> => !!p && !priceStale(p.read, now))
    .map((p) => p.read)
    .sort()[0];
  return {
    id: n.id,
    name: n.name,
    what: n.what,
    ...(n.row ? { row: n.row } : {}),
    ...(n.builtIn ? { builtIn: n.builtIn } : {}),
    ...(n.note ? { note: n.note } : {}),
    services: n.services.map(view),
    also: (n.also ?? []).map(view),
    leftOut: n.leftOut,
    ...(read ? { readOn: read } : {}),
  };
}

export interface ServicesCtx {
  db: DB;
  keys: AppKeys;
  /** A message to the session a card was put up in. */
  tell: (session: string, text: string) => Promise<void> | void;
  changed: () => void;
  /** For tests: the day it is, and the catalog read. */
  now?: () => number;
  catalog?: () => Catalog;
}

interface Card {
  app: string;
  need: string;
  session?: string;
  keysCard?: string;
  chose?: boolean;
  createdAt: number;
}

export function createServices(c: ServicesCtx) {
  const now = () => c.now?.() ?? Date.now();
  const catalog = () => c.catalog?.() ?? readCatalog();
  const need = (id: string): Need => {
    const n = needOf(catalog(), id);
    if (!n) throw new HttpError(404, `The catalog has no need called ${id.slice(0, 40)}. They are: ${catalog().needs.map((x) => x.id).join(", ")}.`);
    return n;
  };

  const stateKey = (app: string) => `webapps.services.${app}`;
  const read = <T>(key: string, d: T): T => {
    try {
      return (JSON.parse(kvGet(c.db, key) ?? "null") as T) ?? d;
    } catch {
      return d;
    }
  };
  const chosenOf = (app: string) => read<Record<string, ChosenService>>(stateKey(app), {});

  function view(a: WebAppRow): AppServicesView {
    const all = catalog().needs;
    const chosen = chosenOf(a.id);
    return {
      chosen: all.flatMap((n) => {
        const x = chosen[n.id];
        if (!x) return [];
        const s = serviceOf(n, x.service);
        const missing = (s?.keys ?? []).filter((k) => !appKey(c.db, a.id, "hydor", k.name) && !appKey(c.db, a.id, "production", k.name)).map((k) => k.label ?? k.name);
        return [{ ...x, missing }];
      }),
      needs: all.filter((n) => n.id !== "run").map((n) => ({ id: n.id, name: n.name, what: n.what, services: n.services.length, builtIn: !!n.builtIn })),
    };
  }

  const cardKey = (id: string) => `webapps.services.card.${id}`;

  function cardView(id: string, a: (app: string) => WebAppRow | undefined): ServicesCardView | null {
    const card = read<Card | null>(cardKey(id), null);
    const app = card && a(card.app);
    const n = card && needOf(catalog(), card.need);
    if (!card || !app || !n) return null;
    const chosen = card.chose ? chosenOf(app.id)[n.id] : undefined;
    return {
      id,
      app: { id: app.id, name: app.name },
      need: needView(n, now()),
      ...(chosen ? { chosen } : {}),
      ...(card.keysCard && chosen ? { keysCard: card.keysCard } : {}),
      createdAt: card.createdAt,
    };
  }

  /** A card for a need of an app, in a session or on the app's page: the one waiting there for the same is given back. */
  function open(a: WebAppRow, needId: string, session?: string): ServicesCardView {
    const n = need(needId);
    if (n.id === "run") throw new HttpError(400, "Where an app runs is chosen on its Launch tab (the places card), not here.");
    const waiting = `webapps.services.waiting.${a.id}.${n.id}.${session ?? ""}`;
    const had = kvGet(c.db, waiting);
    const before = had ? read<Card | null>(cardKey(had), null) : null;
    const id = before && !before.chose ? had! : `sv_${crypto.randomBytes(9).toString("base64url")}`;
    if (id !== had) {
      kvSet(c.db, cardKey(id), JSON.stringify({ app: a.id, need: n.id, ...(session ? { session } : {}), createdAt: now() } satisfies Card));
      kvSet(c.db, waiting, id);
    }
    return cardView(id, () => a)!;
  }

  /** What is left to do for a choice, in words. */
  function apply(n: Need, s: Service): ChosenService["applied"] {
    // It watches the app from outside: nothing in the app changes.
    if (n.id === "uptime" && !s.keys.length) return { state: "outside", say: "Nothing in the app changes: add its address on the service's own site once it is live." };
    return { state: "agent", say: "Its keys go into the app's hydor.json, and the agent writes what uses them." };
  }

  /** The chosen service's keys on the keys card, in the catalog's words. */
  async function askKeys(a: WebAppRow, s: Service, session?: string): Promise<KeysCardView | null> {
    if (!s.keys.length) return null;
    const ctx = { place: "hydor" };
    const keys = s.keys.map((k): AppKey => {
      const looks: KeyLooks | undefined = k.looks ? looksHere({ ...(k.looks.starts ? { prefix: k.looks.starts } : k.looks.prefix ? { prefix: k.looks.prefix } : {}), ...(k.looks.pattern ? { pattern: k.looks.pattern } : {}), ...(k.looks.say ? { say: k.looks.say } : {}), ...(k.looks.not ? { not: k.looks.not } : {}), whole: true }, ctx) : undefined;
      return {
        name: k.name,
        label: k.label,
        why: k.why,
        how: k.how,
        url: k.url,
        from: s.name,
        group: { id: s.id.toUpperCase().replace(/[^A-Z0-9]+/g, "_"), title: s.name },
        secret: k.secret,
        ...(looks ? { looks } : {}),
        givenBy: "provider",
        needed: true,
        set: !!appKey(c.db, a.id, "hydor", k.name),
      };
    });
    return c.keys.openKeys(a, "hydor", keys, { session, skippable: true });
  }

  /** The lines of hydor.json's `keys` for a service: its keys as the contract takes them. */
  function hydorKeys(s: Service): Json[] {
    return s.keys.map((k) => ({
      name: k.name,
      from: s.name,
      why: k.why,
      how: k.how,
      url: k.url,
      label: k.label,
      ...(s.keys.length > 1 ? { group: { id: s.id, title: s.name } } : {}),
      ...(k.looks ? { looks: Object.fromEntries(Object.entries(k.looks).filter(([x]) => x === "starts" || x === "pattern" || x === "say" || x === "not")) } : {}),
    }));
  }

  /** What an agent is told of a choice. */
  function told(a: WebAppRow, n: Need, s: Service, chosen: ChosenService, card: KeysCardView | null): string {
    return [
      `${s.name} was chosen for ${n.name.toLowerCase()} of ${a.name}.`,
      chosen.applied.say,
      s.catch ? `Its catch: ${s.catch}` : "",
      chosen.keys.length ? `Its keys: ${chosen.keys.join(", ")}.${card && card.items.some((i) => i.state === "todo") ? " A keys card asks the person for them, with how to get each: you will get a message once they are saved." : ""}` : "It needs no key.",
      s.keys.length ? `Write these into hydor.json's "keys", as they are, and read each from the environment:\n${JSON.stringify(hydorKeys(s))}` : "",
      s.setup?.length ? `To get going: ${s.setup.join(" ")}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  /** A choice: kept with the app, and its keys asked for. */
  async function choose(a: WebAppRow, needId: string, serviceId: string, o: { card?: string; session?: string } = {}): Promise<{ chosen: ChosenService; keys: KeysCardView | null; say: string }> {
    const n = need(needId);
    if (n.id === "run") throw new HttpError(400, "Where an app runs is chosen on its Launch tab (the places card), not here.");
    const s = serviceOf(n, serviceId);
    if (!s) {
      const out = n.leftOut.find((x) => x.name.toLowerCase().includes(serviceId.trim().toLowerCase()));
      throw new HttpError(400, `The catalog does not offer ${serviceId.slice(0, 60)} for ${n.name.toLowerCase()}${out ? `: ${out.why}` : ""}. It offers ${everyService(n).map((x) => x.name).join(", ")}.`);
    }
    const card = o.card ? read<Card | null>(cardKey(o.card), null) : null;
    if (o.card && (!card || card.app !== a.id || card.need !== n.id)) throw new HttpError(404, "That card is not there any more.");
    const session = card?.session ?? o.session;
    const applied = apply(n, s);
    const chosen: ChosenService = { need: n.id, needName: n.name, service: s.id, name: s.name, keys: s.keys.map((k) => k.name), at: now(), applied };
    kvSet(c.db, stateKey(a.id), JSON.stringify({ ...chosenOf(a.id), [n.id]: chosen }));
    const keys = await askKeys(a, s, session).catch((e) => {
      console.warn("[webapps] the keys of a chosen service could not be asked for:", (e as Error).message);
      return null;
    });
    if (card && o.card) kvSet(c.db, cardKey(o.card), JSON.stringify({ ...card, chose: true, keysCard: keys?.id } satisfies Card));
    const say = told(a, n, s, chosen, keys);
    // Picked on a card: the session hears it as a message. (An agent that named it hears it as its tool's answer.)
    if (card?.session) await c.tell(card.session, say);
    c.changed();
    return { chosen, keys, say };
  }

  /** Forgets one choice (its keys stay on the app's Keys tab until they are removed there). */
  function remove(a: WebAppRow, needId: string) {
    const all = chosenOf(a.id);
    if (!all[needId]) throw new HttpError(404, "Nothing is chosen for that.");
    delete all[needId];
    kvSet(c.db, stateKey(a.id), JSON.stringify(all));
    c.changed();
  }

  /** The app is removed: what it chose goes with it. */
  function forget(app: string) {
    c.db.prepare("delete from kv where k = ? or k like ?").run(stateKey(app), `webapps.services.waiting.${app}.%`);
  }

  return { catalog, need, view, open, cardView, choose, remove, forget, hydorKeys, chosen: (a: WebAppRow) => chosenOf(a.id) };
}

export type Services = ReturnType<typeof createServices>;
