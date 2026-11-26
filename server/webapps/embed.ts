// Vectors for a web app's search (an app that lists `embed` in its hydor.json): the host makes them, so the app carries no model.
//
//   POST /api/apps/:slug/embed   { texts: string[1..64], kind: "query" | "document" } → { model, dim, vectors: [base64 of dim little-endian float32, L2-normalised] }
//
// It is the request the driver writes at the top of its own file, answered with the model memory and the search box use (server/memory/embed.ts), on the CPU.
//
// Who may ask. The route is for a web app's search and for nothing else, so a key opens it only when it is the key Hydor made for that web app:
//   - a web app that has a flows half is started with the flows half's key (HYDOR_APP_SLUG is the agent app's address): only that key, not another one made on the agent app;
//   - any other web app is started with an address of its own (HYDOR_APP_SLUG is its slug) and a key that opens this route and nothing else, made from the app's secret
//     (embedKey): nothing is stored, and it is the app's own to hold, as it holds the secret.
// Both only for a web app whose hydor.json lists `embed`, and a key that is not either is refused (401), one that is Hydor's but not for this (403).
// The same key opens the model route (ai.ts) for a web app that has the ai block: a web app is given it when it has either block.
// The launched version of an app is given its key with a mark after it (sides.ts), which opens the same routes; only the mail route asks which side is calling.
// A web app that is not started by Hydor has neither key and so cannot ask.
//
// How much. At most 64 texts a call and 8,000 characters each (413 past that), 30 calls a minute for each web app (429), and a number of texts a day for each web app
// (EMBED_DAILY, 429, counted from midnight, shown on the Flows tab and in the web app's detail).
//
// What the answer is when there is none, which the driver takes as "carry on with words": 501 when search by meaning is turned off in this Hydor or its model is not set up (the
// person turns it on in Settings → Memory; an app never starts a download), 503 with Retry-After for what passes (the model is starting, memory is short, Hydor is busy with its own search).
//
// Hydor's own work first: the model takes its requests in turn, and a web app's texts go to it a few at a time (embedForApp), one piece in all at a time, each only when no
// request of Hydor's own (memory, the search box, knowledge bases, pages) is being answered. So Hydor's own search waits for one small piece at most, and an app that keeps
// asking is told to wait (503) rather than put Hydor's own behind it.
import crypto from "node:crypto";
import type { FastifyRequest } from "fastify";
import { embedForApp, MODEL_REVISION, type Kind } from "../memory/embed.ts";
import { MODEL, DIM } from "../memory/vectors.ts";
import { HttpError } from "../auth.ts";
import type { DB } from "../db.ts";
import type { Deps } from "../features/types.ts";
import { Limiter } from "../apps/limits.ts";
import { appOfKey, getApp, KEY_PREFIX, plainKey } from "../apps/store.ts";
import { linkOfApp } from "./flows.ts";
import { servicesOf } from "./shape.ts";
import { getWebApp, webAppBySlug, type WebAppRow } from "./store.ts";

export const EMBED_LIMITS = {
  /** Texts in one call. */
  texts: 64,
  /** Characters in one text. */
  chars: 8000,
  /** Calls a minute for one web app. */
  callsPerMinute: 30,
  /** Texts a day for one web app (a search block's first pass over a few thousand rows is a few thousand). */
  textsPerDay: 20_000,
};

/** The model's name as the app sees it: vectors made with another name are made again. */
export const EMBED_MODEL = `${MODEL}@${MODEL_REVISION.slice(0, 8)}`;

const limiter = new Limiter(Date.now, "web-embed");

/** The key of a web app that has no flows half: made from its secret, so nothing is kept. It starts with napp_ like every key an app is given. */
export const embedKey = (secret: string): string => `${KEY_PREFIX}w${crypto.createHmac("sha256", secret).update("hydor embed key 1").digest("base64url")}`;

const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

// ---- the daily count ------------------------------------------------------------------------------------------------------------------

const tables = new WeakSet<DB>();
function embedTables(db: DB) {
  if (tables.has(db)) return;
  db.exec("create table if not exists web_app_embed_use (web_id text not null, day integer not null, texts integer not null default 0, calls integer not null default 0, primary key (web_id, day))");
  tables.add(db);
}

/** Midnight (this computer's time) as the day's number. */
const dayOf = (now = Date.now()) => {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

/** What a web app has had made today, and what it may. */
export function embedUse(db: DB, webId: string, now = Date.now()): { texts: number; calls: number; limit: number } {
  embedTables(db);
  const r = db.prepare("select texts, calls from web_app_embed_use where web_id = ? and day = ?").get(webId, dayOf(now)) as { texts: number; calls: number } | undefined;
  return { texts: r?.texts ?? 0, calls: r?.calls ?? 0, limit: EMBED_LIMITS.textsPerDay };
}

function countUse(db: DB, webId: string, texts: number) {
  embedTables(db);
  db.prepare("insert into web_app_embed_use (web_id, day, texts, calls) values (?, ?, ?, 1) on conflict (web_id, day) do update set texts = texts + excluded.texts, calls = calls + 1").run(webId, dayOf(), texts);
  db.prepare("delete from web_app_embed_use where day < ?").run(dayOf() - 14 * 24 * 3600_000);
}

/** Forgets the minute's calls (tests). */
export const forgetEmbedLimits = () => limiter.clear();

// ---- who is asking ------------------------------------------------------------------------------------------------------------------

/** Whether a web app asks Hydor for vectors (the only web apps the route is for): those that list `embed` in their hydor.json. */
export const hasSearch = (web: Pick<WebAppRow, "folder">) => servicesOf(web).embed;

/** The web app a call is for, by the address and the key it came with (the key opens the routes a web app uses for what Hydor lends it: its vectors, its model); throws the answer when it is not one. */
export function webCaller(d: { db: DB; secret: (webId: string) => string }, req: FastifyRequest, what = "embeddings"): WebAppRow {
  const slug = (req.params as { slug: string }).slug;
  const bearer = /^Bearer\s+(\S+)$/i.exec(String(req.headers.authorization ?? ""))?.[1];
  if (!bearer?.startsWith(KEY_PREFIX)) throw new HttpError(401, "Send the app’s key as a bearer token (Authorization: Bearer napp_…): Hydor gives it to a web app it runs, as HYDOR_APP_KEY.");
  let web: WebAppRow | null = null;
  // A key Hydor made on an agent app: it opens this only for the web app that agent app is the flows half of, and only the key made for that web app.
  const k = appOfKey(d.db, bearer);
  if (k) {
    const agent = getApp(d.db, slug);
    if (!agent || agent.id !== k.app) throw new HttpError(401, "That key does not open this app");
    const link = linkOfApp(d.db, agent.id);
    if (!link) throw new HttpError(403, `This app is not the flows half of a web app, so it has no use for ${what}.`);
    if (link.key_id !== k.id) throw new HttpError(403, `This key was not made for the web app: only the key Hydor made for it may ask for ${what}.`);
    web = getWebApp(d.db, link.web_id);
  } else {
    const w = webAppBySlug(d.db, slug);
    if (w && same(plainKey(bearer), embedKey(d.secret(w.id)))) web = w;
  }
  if (!web) throw new HttpError(401, "That key is not valid (it may have been revoked, or it is for another app).");
  return web;
}

/** The web app an embeddings call is for: one that lists `embed`. */
export function embedCaller(d: { db: DB; secret: (webId: string) => string }, req: FastifyRequest): WebAppRow {
  const web = webCaller(d, req, "embeddings");
  if (!hasSearch(web)) throw new HttpError(403, "This web app does not list embed under services in its hydor.json, so Hydor does not make embeddings for it.");
  return web;
}

const retryAfter = (reply: { header: (k: string, v: string) => unknown }, seconds: number) => reply.header("retry-after", String(Math.max(1, Math.ceil(seconds))));

export function embedRoutes(d: Deps, ctx: { secret: (webId: string) => string; enabled: () => void }) {
  const { app, db } = d;
  embedTables(db);
  app.post("/api/apps/:slug/embed", { bodyLimit: 2 * 1024 * 1024 }, async (req, reply) => {
    ctx.enabled();
    const web = embedCaller({ db, secret: ctx.secret }, req);
    if (!limiter.take(`web:${web.id}`, EMBED_LIMITS.callsPerMinute, 60_000)) {
      retryAfter(reply, limiter.wait(`web:${web.id}`, EMBED_LIMITS.callsPerMinute, 60_000) / 1000);
      throw new HttpError(429, `Too many calls: a web app may make ${EMBED_LIMITS.callsPerMinute} a minute.`);
    }
    const b = (req.body ?? {}) as { texts?: unknown; kind?: unknown };
    if (!Array.isArray(b.texts) || !b.texts.length || !b.texts.every((t) => typeof t === "string")) throw new HttpError(400, "texts is a list of 1 to 64 texts.");
    if (b.kind !== "query" && b.kind !== "document") throw new HttpError(400, 'kind is "query" (what someone types) or "document" (a passage to be found).');
    if (b.texts.length > EMBED_LIMITS.texts) throw new HttpError(413, `At most ${EMBED_LIMITS.texts} texts in a call.`);
    if (b.texts.some((t: string) => t.length > EMBED_LIMITS.chars)) throw new HttpError(413, `At most ${EMBED_LIMITS.chars} characters in a text.`);
    const used = embedUse(db, web.id);
    if (used.texts + b.texts.length > EMBED_LIMITS.textsPerDay) {
      const midnight = dayOf() + 24 * 3600_000;
      retryAfter(reply, (midnight - Date.now()) / 1000);
      throw new HttpError(429, `This web app has had ${used.texts} texts embedded today, and may have ${EMBED_LIMITS.textsPerDay} a day. It carries on with words until tomorrow.`);
    }
    const out = await embedForApp(db, b.texts as string[], b.kind as Kind, { signal: AbortSignal.timeout(25_000) });
    if (!out.ok) {
      if (out.why === "off" || out.why === "not-set-up") throw new HttpError(501, out.detail ?? "Search by meaning is not available in this Hydor.", { reason: out.why });
      retryAfter(reply, out.why === "busy" ? 2 : 5);
      throw new HttpError(503, out.detail ?? "The model cannot answer now.", { reason: out.why });
    }
    countUse(db, web.id, b.texts.length);
    reply.header("cache-control", "no-store");
    return {
      model: EMBED_MODEL,
      dim: DIM,
      vectors: out.vectors.map((v) => Buffer.from(v.buffer, v.byteOffset, v.byteLength).toString("base64")),
    };
  });
}
