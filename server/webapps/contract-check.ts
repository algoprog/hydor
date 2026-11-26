// The checker of the contract: it reads an app's hydor.json, builds it, starts it as the file says on a port and a data folder of
// its own, and tries each thing the file claims, one line each, in plain words. Builders run it before they hand an app over (the
// single script skills/web-app-builder/references/hydor-check.mjs, made from this file by `npm run webapps:checker`), agents
// with webapp_contract_check, and Hydor before a launch. It starts the app the way the host does (run-app.ts), gives it made-up
// keys and a stand-in for Hydor's three services, and never a real one. Only Node: nothing of Hydor's own is needed to run it.
import { type ChildProcess, spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { HYDOR_FILE, HYDOR_FILE_MAX, type HydorFile, readHydorText, type TryRequest, usesServices } from "../../shared/hydor-file.ts";
import { appEnv, argvOf, buildEnv, contractRunShape, descendants, nodeBin, signalApp } from "./run-app.ts";
import { PERSON_HEADER, type Person, signPerson, verifyPerson } from "./sign.ts";

export type LineState = "passed" | "failed" | "note" | "notRun";

export interface ContractLine {
  /** file, build, ready, loopback, signin, secrets, ai, embed, mail, smoke, stop, data, writes. */
  id: string;
  title: string;
  state: LineState;
  /** What was tried and what came of it, in plain words. */
  text: string;
  /** What to do about it, when it failed. */
  hint?: string;
  details?: string[];
}

export interface CheckResult {
  ok: boolean;
  summary: string;
  lines: ContractLine[];
}

export interface CheckOptions {
  /** The app's folder. */
  dir: string;
  /** Run its build first (default true; false when it was built already). */
  build?: boolean;
  /** How long it may take to answer on its ready address (default 30 s). */
  readyMs?: number;
  buildMs?: number;
  /** A sandbox around the command, as the host runs it: gives the whole command line, or null for none. */
  box?: (o: { dir: string; data: string; home: string; argv: string[] }) => string[] | null;
  /** The same around the build (build-box.ts, as Hydor's own builds run): the command and environment to start, and what ends them. */
  buildBox?: (o: { dir: string; home: string; argv: string[]; env: Record<string, string> }) => Promise<{ argv: string[]; env: Record<string, string>; say?: string; close: () => Promise<void> }>;
  /** A folder the check may use for the app's data and home (default: one made in the system's temporary folder, removed after). */
  work?: string;
  /** Ports to take the app's and the stand-in's from (default: any the system gives). */
  ports?: [number, number];
  /** Each line as soon as it is known. */
  onLine?: (line: ContractLine) => void;
  /** What is being done now, for a progress display. */
  onStep?: (what: string) => void;
  /**
   * While the app still runs, after the contract's lines are tried: Hydor looks at its pages here (pagechecks/). A callback,
   * so that the script a builder runs carries no browser. The values it was given are made up; `person` signs a request in
   * as the checker's owner (signIn `hydor`).
   */
  running?: (o: { port: number; file: HydorFile; hidden: { name: string; value: string }[]; person: () => Record<string, string>; signal?: AbortSignal }) => Promise<void>;
  signal?: AbortSignal;
}

const TITLES: Record<string, string> = {
  file: "hydor.json says what is needed",
  build: "It builds",
  ready: "It starts and says it is ready",
  loopback: "It listens where it is told, and nowhere else",
  signin: "It lets in only the people Hydor says",
  secrets: "No key or secret reaches a browser",
  ai: "It asks for a model the way Hydor answers",
  embed: "It asks for vectors the way Hydor answers",
  mail: "It sends mail the way Hydor takes it",
  smoke: "It passes its own smoke test",
  stop: "It stops when asked",
  data: "It keeps its data across a restart",
  writes: "It writes only in its data folder",
};

/** The size of the vectors Hydor makes (server/memory/vectors.ts). */
export const VECTOR_SIZE = 768;
const SLUG = "hydor-check";
const STOP_MS = 5000;
const SMOKE_MS = 60_000;
/** Another of this computer's own addresses: an app told to listen there shows whether it reads the variable. */
const OTHER = "127.0.0.2";
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const one = (s: string, n = 300) => s.replace(/\s+/g, " ").trim().slice(0, n);
const person: Person = { id: "check-owner", name: "Check Owner", email: "owner@example.test", role: "owner" };

// ---- ports and processes ------------------------------------------------------------------------------------------------------------

function take(port: number, address = "127.0.0.1"): Promise<number | null> {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once("error", () => resolve(null));
    s.listen(port, address, () => {
      const got = (s.address() as net.AddressInfo).port;
      s.close(() => resolve(got));
    });
  });
}

async function freePort(range: [number, number] | undefined, taken: Set<number>): Promise<number> {
  if (range) {
    for (let p = range[0]; p <= range[1]; p++)
      if (!taken.has(p) && (await take(p)) !== null) {
        taken.add(p);
        return p;
      }
    throw new Error(`No free port from ${range[0]} to ${range[1]}.`);
  }
  for (let i = 0; i < 30; i++) {
    const p = await take(0);
    if (p !== null && !taken.has(p)) {
      taken.add(p);
      return p;
    }
  }
  throw new Error("No free port.");
}

interface Running {
  child: ChildProcess;
  boxed: boolean;
  port: number;
  log: string[];
  ended: () => boolean;
  how: () => string;
}

/** Asks it to stop and waits: true when it ended by itself within the time, false when it had to be killed. */
async function stopApp(r: Running): Promise<{ polite: boolean; ms: number }> {
  const t = Date.now();
  if (r.ended()) return { polite: true, ms: 0 };
  signalApp(r.child, r.boxed, "SIGTERM");
  while (!r.ended() && Date.now() - t < STOP_MS) await sleep(40);
  const polite = r.ended();
  // Whatever is left of its group goes (a program it started and did not end).
  signalApp(r.child, false, "SIGKILL");
  for (let i = 0; i < 100 && !r.ended(); i++) await sleep(30);
  // Done when its port is free again.
  for (let i = 0; i < 80 && (await take(r.port)) === null; i++) await sleep(40);
  return { polite, ms: Date.now() - t };
}

// ---- one request --------------------------------------------------------------------------------------------------------------------

interface Got {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
}

function ask(port: number, method: string, at: string, o: { headers?: Record<string, string>; body?: string; timeoutMs?: number; address?: string } = {}): Promise<Got> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: o.address ?? "127.0.0.1", port, method, path: at, headers: { host: `localhost:${port}`, connection: "close", ...(o.body !== undefined ? { "content-length": String(Buffer.byteLength(o.body)) } : {}), ...o.headers }, timeout: o.timeoutMs ?? 10_000 },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (c: Buffer) => {
          size += c.length;
          if (size <= 4 << 20) chunks.push(c);
          else res.destroy();
        });
        const done = () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) });
        res.on("end", done);
        res.on("close", done);
        res.on("error", done);
      },
    );
    req.on("timeout", () => req.destroy(new Error("no answer in time")));
    req.on("error", reject);
    req.end(o.body);
  });
}

// ---- where it listens ----------------------------------------------------------------------------------------------------------------

/** The addresses of a /proc/net/tcp file that are listening: local address and port, with the socket's inode. */
function listening(file: string): { address: string; port: number; inode: string }[] {
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return [];
  }
  return text
    .split("\n")
    .slice(1)
    .map((l) => l.trim().split(/\s+/))
    .filter((f) => f[3] === "0A")
    .map((f) => ({ address: f[1].split(":")[0], port: parseInt(f[1].split(":")[1], 16), inode: f[9] }));
}

const local = (hex: string): boolean => (hex.length === 8 ? hex.endsWith("7F") : hex === "00000000000000000000000001000000" || (hex.startsWith("0000000000000000FFFF0000") && hex.endsWith("7F")));

/** An address of /proc/net as people write it. */
function words(hex: string): string {
  if (hex.length === 8) return [6, 4, 2, 0].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(".");
  if (/^0+$/.test(hex)) return "[::] (every address)";
  return `[IPv6 ${hex}]`;
}

/** The sockets the process and everything under it hold, by inode (Linux). */
function inodesOf(pid: number): Set<string> {
  const out = new Set<string>();
  for (const p of [pid, ...descendants(pid).map((d) => d.pid)]) {
    try {
      for (const fd of fs.readdirSync(`/proc/${p}/fd`)) {
        try {
          const m = /^socket:\[(\d+)\]$/.exec(fs.readlinkSync(`/proc/${p}/fd/${fd}`));
          if (m) out.add(m[1]);
        } catch {}
      }
    } catch {}
  }
  return out;
}

/** What it listens on that others could reach; null when this system gives no way to tell. */
async function open(r: Running): Promise<string[] | null> {
  if (fs.existsSync("/proc/net/tcp")) {
    const all = [...listening("/proc/net/tcp"), ...listening("/proc/net/tcp6")];
    const own = inodesOf(r.child.pid!);
    const mine = all.filter((x) => x.port === r.port || own.has(x.inode));
    return [...new Set(mine.filter((x) => !local(x.address)).map((x) => `${words(x.address)} port ${x.port}`))];
  }
  const others = Object.values(os.networkInterfaces()).flatMap((n) => n ?? []).filter((n) => n.family === "IPv4" && !n.internal);
  if (!others.length) return null;
  const out: string[] = [];
  for (const n of others) {
    const answered = await new Promise<boolean>((resolve) => {
      const s = net.connect({ host: n.address, port: r.port, timeout: 1000 }, () => (s.destroy(), resolve(true)));
      s.on("error", () => resolve(false));
      s.on("timeout", () => (s.destroy(), resolve(false)));
    });
    if (answered) out.push(`${n.address} port ${r.port}`);
  }
  return out;
}

// ---- the files of its folder -------------------------------------------------------------------------------------------------------------

const SKIP = new Set([".git"]);

/** Every file of the folder with its size and the time it was changed (links as themselves, never followed). */
async function snapshot(dir: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const walk = async (at: string) => {
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(at, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (SKIP.has(e.name)) continue;
      const full = path.join(at, e.name);
      if (e.isDirectory()) {
        out.set(path.relative(dir, full) + "/", "folder");
        await walk(full);
      } else {
        try {
          const s = await fs.promises.lstat(full);
          out.set(path.relative(dir, full), `${s.size}:${s.mtimeMs}`);
        } catch {}
      }
      if (out.size > 200_000) return;
    }
  };
  await walk(dir);
  return out;
}

function changed(before: Map<string, string>, after: Map<string, string>): string[] {
  const out: string[] = [];
  for (const [k, v] of after) if (!before.has(k)) out.push(`made ${k}`);
  else if (before.get(k) !== v) out.push(`changed ${k}`);
  for (const k of before.keys()) if (!after.has(k)) out.push(`removed ${k}`);
  return out.sort();
}

// ---- the database ------------------------------------------------------------------------------------------------------------------------

interface Sqlite {
  tables: Record<string, number>;
}

type Db = { exec(sql: string): void; prepare(sql: string): { all(...a: unknown[]): unknown[]; get(...a: unknown[]): unknown; run(...a: unknown[]): unknown }; close(): void };

/** Node's own SQLite (22.13 and newer), or null: the checker then looks at the files only. */
async function sqliteModule(): Promise<(new (file: string) => Db) | null> {
  const warn = process.emitWarning;
  try {
    process.emitWarning = () => {};
    const m = (await import("node:sqlite")) as unknown as { DatabaseSync: new (file: string) => Db };
    return m.DatabaseSync;
  } catch {
    return null;
  } finally {
    process.emitWarning = warn;
  }
}

const quote = (n: string) => `"${n.replace(/"/g, '""')}"`;

function rows(db: Db): Sqlite {
  const names = (db.prepare("select name from sqlite_master where type = 'table' and name not like 'sqlite\\_%' escape '\\' and sql not like 'CREATE VIRTUAL%' order by name").all() as { name: string }[]).map((r) => r.name);
  const tables: Record<string, number> = {};
  for (const n of names) {
    try {
      tables[n] = Number((db.prepare(`select count(*) as n from ${quote(n)}`).get() as { n: number | bigint }).n);
    } catch {}
  }
  return { tables };
}

// ---- the stand-in for Hydor's services ----------------------------------------------------------------------------------------------------

export interface Call {
  service: "ai" | "embed" | "mail" | "other";
  /** What is wrong with it, as the real route would refuse it; none when it would be answered. */
  wrong: string[];
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;
const ADDRESS = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/;

/** What the route would refuse in the body of a request for a model (server/webapps/ai.ts readAsk). */
export function wrongAi(body: unknown, tiers: readonly string[]): string[] {
  if (!isObject(body)) return ["the body is not one JSON object"];
  const out: string[] = [];
  if (body.tier !== "quick" && body.tier !== "standard" && body.tier !== "best") out.push('"tier" is not "quick", "standard" or "best"');
  else if (!tiers.includes(body.tier)) out.push(`the "${body.tier}" tier is not in services.ai.tiers`);
  const messages = Array.isArray(body.messages) ? body.messages : null;
  if (!messages || !messages.length || messages.length > 200) out.push('"messages" is not a list of 1 to 200 messages');
  else {
    for (const m of messages) {
      if (!isObject(m) || !["system", "user", "assistant", "tool"].includes(m.role as string)) out.push("a message has no role of system, user, assistant or tool");
      else if (typeof m.content !== "string" && !(m.role === "assistant" && m.content === undefined)) out.push("a message's content is not text");
      else if (m.role === "tool" && typeof m.toolCallId !== "string") out.push("a tool message does not say which call it answers (toolCallId)");
    }
    const last = messages[messages.length - 1];
    if (isObject(last) && last.role === "assistant" && !last.toolCalls) out.push("the last message is the model's own");
  }
  if (body.tools !== undefined) {
    if (!Array.isArray(body.tools) || body.tools.length > 40 || !body.tools.every((t) => isObject(t) && typeof t.name === "string" && /^[A-Za-z0-9_.-]{1,64}$/.test(t.name))) out.push('"tools" is not a list of tools, each with a name');
  }
  if (body.schema !== undefined && body.schema !== null && !isObject(body.schema)) out.push('"schema" is not a JSON Schema');
  if (body.schema && Array.isArray(body.tools) && body.tools.length) out.push("it asks for tools and a schema in one call");
  if (body.maxOutputTokens !== undefined && !(typeof body.maxOutputTokens === "number" && body.maxOutputTokens >= 1)) out.push('"maxOutputTokens" is not a number of tokens');
  if (body.stream !== undefined && typeof body.stream !== "boolean") out.push('"stream" is not true or false');
  return out;
}

/** The same for vectors (embed.ts). */
export function wrongEmbed(body: unknown): string[] {
  const b = isObject(body) ? body : {};
  const out: string[] = [];
  if (!Array.isArray(b.texts) || !b.texts.length || !b.texts.every((t) => typeof t === "string")) out.push('"texts" is not a list of 1 to 64 texts');
  else if (b.texts.length > 64) out.push("more than 64 texts in a call");
  else if (b.texts.some((t) => (t as string).length > 8000)) out.push("a text is longer than 8,000 characters");
  if (b.kind !== "query" && b.kind !== "document") out.push('"kind" is not "query" or "document"');
  return out;
}

/** The same for mail (mail.ts readAsk). */
export function wrongMail(body: unknown): string[] {
  if (!isObject(body)) return ["the body is not one JSON object"];
  const out: string[] = [];
  const address = (v: unknown) => typeof v === "string" && v.length <= 254 && !CONTROL.test(v) && !/[[\]\\]/.test(v) && ADDRESS.test(v);
  if (!Array.isArray(body.to) || !body.to.length || body.to.length > 50 || !body.to.every(address)) out.push('"to" is not a list of 1 to 50 email addresses');
  if (typeof body.subject !== "string" || !body.subject.trim() || CONTROL.test(body.subject) || body.subject.length > 900) out.push('"subject" is not one line of text');
  if (typeof body.text !== "string" || !body.text.trim() || body.text.length > 200_000) out.push('"text" is missing or too long');
  if (body.html !== undefined && body.html !== null && typeof body.html !== "string") out.push('"html" is not text');
  if (body.replyTo && !address(body.replyTo)) out.push('"replyTo" is not one email address');
  if (body.fromName && (typeof body.fromName !== "string" || CONTROL.test(body.fromName) || /[<>@]/.test(body.fromName) || body.fromName.length > 80)) out.push('"fromName" is not a plain name of at most 80 characters');
  if (body.unsubscribe && !(typeof body.unsubscribe === "string" && /^(https:\/\/|mailto:)\S+$/i.test(body.unsubscribe))) out.push('"unsubscribe" is not an https:// or mailto: address');
  return out;
}

/** A value that fits a schema, in the small, for the stand-in's answer. */
function sample(schema: unknown, depth = 0): unknown {
  if (!isObject(schema) || depth > 6) return "x";
  if (Array.isArray(schema.enum)) return schema.enum[0];
  const type = Array.isArray(schema.type) ? schema.type[0] : (schema.type ?? (schema.properties ? "object" : "string"));
  if (type === "object") return Object.fromEntries(Object.entries(isObject(schema.properties) ? schema.properties : {}).map(([k, s]) => [k, sample(s, depth + 1)]));
  if (type === "array") return Array.from({ length: Math.max(1, Number(schema.minItems) || 0) }, () => sample(schema.items, depth + 1));
  if (type === "number" || type === "integer") return Number(schema.minimum) || 0;
  if (type === "boolean") return true;
  if (type === "null") return null;
  return "x".repeat(Math.max(1, Number(schema.minLength) || 0));
}

function vector(text: string): string {
  const v = new Float32Array(VECTOR_SIZE);
  const seed = crypto.createHash("sha256").update(text).digest();
  let sum = 0;
  for (let i = 0; i < VECTOR_SIZE; i++) {
    v[i] = seed[i % seed.length] - 127.5;
    sum += v[i] * v[i];
  }
  for (let i = 0; i < VECTOR_SIZE; i++) v[i] /= Math.sqrt(sum);
  return Buffer.from(v.buffer).toString("base64");
}

interface StandIn {
  url: string;
  calls: Call[];
  close(): Promise<void>;
}

async function standIn(port: number, file: HydorFile, key: string, secret: string): Promise<StandIn> {
  const calls: Call[] = [];
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size <= 4 << 20) chunks.push(c);
    });
    req.on("end", () => {
      const say = (code: number, body: unknown) => {
        res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" });
        res.end(JSON.stringify(body));
      };
      const m = /^\/api\/apps\/([^/]+)\/(ai|embed|mail)$/.exec(new URL(req.url ?? "/", "http://x").pathname);
      if (!m) {
        calls.push({ service: "other", wrong: [`it asked for ${one(`${req.method} ${req.url}`, 80)}, which is none of Hydor's three requests`] });
        return say(404, { error: "There is nothing at this address." });
      }
      const service = m[2] as "ai" | "embed" | "mail";
      const wrong: string[] = [];
      if (req.method !== "POST") wrong.push(`it used ${req.method} where Hydor takes POST`);
      if (m[1] !== SLUG) wrong.push("the address is not the one in HYDOR_APP_SLUG");
      if (req.headers.authorization !== `Bearer ${key}`) wrong.push("Authorization is not “Bearer <HYDOR_APP_KEY>”");
      if (!/^application\/json/i.test(String(req.headers["content-type"] ?? ""))) wrong.push("Content-Type is not application/json");
      let body: unknown;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        wrong.push("the body is not JSON");
      }
      if (!file.services[service]) wrong.push(`“${service}” is not under services in hydor.json`);
      const passed = req.headers[PERSON_HEADER];
      if (service === "ai" && passed !== undefined && !verifyPerson(passed, secret, 120).ok) wrong.push(`the ${PERSON_HEADER} header passed on is not the one Hydor put on the person's request`);
      if (body !== undefined) wrong.push(...(service === "ai" ? wrongAi(body, file.services.ai?.tiers ?? []) : service === "embed" ? wrongEmbed(body) : wrongMail(body)));
      calls.push({ service, wrong });
      if (wrong.length) return say(400, { error: wrong.join("; "), kind: "failed" });
      const b = body as Record<string, unknown>;
      if (service === "embed") return say(200, { model: "hydor-check@0", dim: VECTOR_SIZE, vectors: (b.texts as string[]).map(vector) });
      if (service === "mail") return say(200, { id: `mail_${crypto.randomBytes(6).toString("hex")}`, status: "sent" });
      const data = b.schema ? sample(b.schema) : undefined;
      const answer = { text: data !== undefined ? JSON.stringify(data) : "This is the checker's stand-in for a model.", ...(data !== undefined ? { data } : {}), toolCalls: [], stop: "end", model: "hydor-check", usage: { inputTokens: 1, outputTokens: 1, usd: 0 }, cap: { usedUsd: 0, limitUsd: 1 } };
      if (b.stream !== true) return say(200, answer);
      res.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store" });
      res.write(`event: text\ndata: ${JSON.stringify({ text: answer.text })}\n\n`);
      res.end(`event: done\ndata: ${JSON.stringify(answer)}\n\n`);
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve());
  });
  return {
    url: `http://127.0.0.1:${port}`,
    calls,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

// ---- what a browser gets ---------------------------------------------------------------------------------------------------------------

/** Addresses of the app itself a page, a script or a style sheet names. */
function linksOf(type: string, text: string, at: string, port: number): string[] {
  const found: string[] = [];
  const add = (raw: string) => {
    try {
      const u = new URL(raw.replace(/&amp;/g, "&"), `http://localhost:${port}${at}`);
      if (u.hostname !== "localhost" && u.hostname !== "127.0.0.1") return;
      if (u.port !== String(port)) return;
      const p = u.pathname + u.search;
      // Only reading: an address that signs out or takes something away is not followed.
      if (/(sign|log)[-_]?(out|off)|delete|remove|destroy|reset|revoke/i.test(p)) return;
      found.push(p);
    } catch {}
  };
  if (/html/i.test(type)) for (const m of text.matchAll(/\b(?:href|src)\s*=\s*("([^"]*)"|'([^']*)')/gi)) add(m[2] ?? m[3] ?? "");
  if (/javascript|ecmascript/i.test(type)) for (const m of text.matchAll(/\b(?:import|from)\s*\(?\s*["']((?:\.{0,2}\/)[^"']+)["']/g)) add(m[1]);
  if (/css/i.test(type)) for (const m of text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) add(m[1]);
  if (/manifest|json/i.test(type) && /"icons"/.test(text)) for (const m of text.matchAll(/"src"\s*:\s*"([^"]+)"/g)) add(m[1]);
  return found.filter((p) => !p.startsWith("data:"));
}

/** The ways a value could be written where it should not be. */
const shapesOf = (value: string): string[] => [...new Set([value, encodeURIComponent(value), Buffer.from(value).toString("base64").replace(/=+$/, ""), Buffer.from(value).toString("base64url")])];

// ---- the check ---------------------------------------------------------------------------------------------------------------------------

function readFile(dir: string): { file?: HydorFile; problems: string[] } {
  const at = path.join(dir, HYDOR_FILE);
  let text: string;
  try {
    const st = fs.lstatSync(at);
    if (!st.isFile()) return { problems: [`${HYDOR_FILE} is not a plain file.`] };
    if (st.size > HYDOR_FILE_MAX) return { problems: [`${HYDOR_FILE} is too large to be one (over 64 KB).`] };
    text = fs.readFileSync(at, "utf8");
  } catch {
    return { problems: [`There is no ${HYDOR_FILE} at the root of the app (${dir}).`] };
  }
  const r = readHydorText(text);
  return r.ok ? { file: r.file, problems: [] } : { problems: r.problems };
}

/** The app's build, as Hydor runs it: a shell line in its folder, with nothing of this computer's environment. */
async function runBuild(line: string, dir: string, home: string, ms: number, signal?: AbortSignal, box?: CheckOptions["buildBox"]): Promise<{ code: number | null; tail: string[]; timedOut: boolean; say?: string }> {
  const windows = process.platform === "win32";
  // The packages' cache of whoever runs this is used when there is one: it holds no secrets and saves a download. A build
  // in Hydor's sandbox has a cache of its own instead.
  const cache = process.env.npm_config_cache ?? path.join(os.homedir(), ".npm");
  const plain = buildEnv(nodeBin(), home, !box && fs.existsSync(cache) ? { npm_config_cache: cache } : {});
  const argv = windows ? [process.env.ComSpec ?? "cmd.exe", "/d", "/s", "/c", line] : ["/bin/sh", "-c", line];
  const boxedAs = box ? await box({ dir, home, argv, env: plain }) : null;
  const all = boxedAs?.argv ?? argv;
  const result = await new Promise<{ code: number | null; tail: string[]; timedOut: boolean }>((resolve) => {
    const child = spawn(all[0], all.slice(1), { cwd: dir, env: boxedAs?.env ?? plain, stdio: ["ignore", "pipe", "pipe"], detached: !windows });
    const tail: string[] = [];
    const feed = (b: Buffer) => {
      for (const l of b.toString("utf8").split("\n")) if (l.trim()) tail.push(l.slice(0, 400));
      if (tail.length > 40) tail.splice(0, tail.length - 40);
    };
    child.stdout!.on("data", feed);
    child.stderr!.on("data", feed);
    let timedOut = false;
    const end = () => signalApp(child, false, "SIGKILL");
    const limit = setTimeout(() => ((timedOut = true), end()), ms);
    signal?.addEventListener("abort", end, { once: true });
    child.on("error", (e) => {
      clearTimeout(limit);
      tail.push(e.message);
      resolve({ code: null, tail, timedOut });
    });
    child.on("close", (code) => {
      clearTimeout(limit);
      resolve({ code, tail, timedOut });
    });
  });
  await boxedAs?.close();
  return { ...result, ...(boxedAs?.say ? { say: boxedAs.say } : {}) };
}

/** The app's smoke line, run by the shell with only what it is given (no key). `code` null: it did not finish in time. */
export function runSmoke(line: string, dir: string, env: Record<string, string>, box?: (argv: string[]) => string[] | null): Promise<{ code: number | null; tail: string[] }> {
  const windows = process.platform === "win32";
  const argv = windows ? [process.env.ComSpec ?? "cmd.exe", "/d", "/s", "/c", line] : ["/bin/sh", "-c", line];
  const all = box?.(argv) ?? argv;
  return new Promise((resolve) => {
    const child = spawn(all[0], all.slice(1), { cwd: dir, env, stdio: ["ignore", "pipe", "pipe"], detached: !windows });
    const tail: string[] = [];
    const feed = (b: Buffer) => {
      for (const l of b.toString("utf8").split("\n")) if (l.trim()) tail.push(l.slice(0, 400));
      if (tail.length > 40) tail.splice(0, tail.length - 40);
    };
    child.stdout!.on("data", feed);
    child.stderr!.on("data", feed);
    let late = false;
    const limit = setTimeout(() => ((late = true), signalApp(child, false, "SIGKILL")), SMOKE_MS);
    child.on("error", (e) => (clearTimeout(limit), resolve({ code: 1, tail: [...tail, e.message] })));
    child.on("close", (code) => (clearTimeout(limit), resolve({ code: late ? null : (code ?? 1), tail })));
  });
}

export async function checkContract(o: CheckOptions): Promise<CheckResult> {
  const dir = path.resolve(o.dir);
  const lines: ContractLine[] = [];
  const line = (id: string, state: LineState, text: string, extra: { hint?: string; details?: string[] } = {}) => {
    const l: ContractLine = { id, title: TITLES[id] ?? id, state, text, ...(extra.hint ? { hint: extra.hint } : {}), ...(extra.details?.length ? { details: extra.details.slice(0, 8) } : {}) };
    lines.push(l);
    o.onLine?.(l);
  };
  const result = (): CheckResult => {
    const of = (s: LineState) => lines.filter((l) => l.state === s).length;
    const failed = of("failed");
    const untried = of("notRun");
    const summary = `${lines.length} ${lines.length === 1 ? "line" : "lines"}: ${of("passed")} passed, ${failed} failed${untried ? `, ${untried} could not be tried` : ""}${of("note") ? `, ${of("note")} to note` : ""}.`;
    return { ok: failed === 0, summary, lines };
  };

  const read = readFile(dir);
  if (!read.file) {
    line("file", "failed", read.problems.join(" "), { hint: `Write ${HYDOR_FILE} as the builders' page shows it.`, details: read.problems });
    return result();
  }
  const file = read.file;
  line("file", "passed", `${HYDOR_FILE} reads: start “${one(file.start, 80)}”, ready at ${file.ready}, sign-in by ${file.signIn === "hydor" ? "Hydor" : "the app itself"}${file.database ? `, database ${file.database.file}` : ""}${file.keys.length ? `, ${file.keys.length} ${file.keys.length === 1 ? "key" : "keys"}` : ""}.`);

  const work = o.work ?? fs.mkdtempSync(path.join(os.tmpdir(), "hydor-check-"));
  const data = path.join(work, "data");
  const home = path.join(work, "home");
  fs.mkdirSync(data, { recursive: true });
  fs.mkdirSync(home, { recursive: true });
  const taken = new Set<number>();
  let stand: StandIn | null = null;
  let running: Running | null = null;
  try {
    // ---- the build
    if (!file.build) line("build", "passed", "It names no build: there is nothing to build.");
    else if (o.build === false) line("build", "passed", `It was built already (${one(file.build, 120)}).`);
    else {
      o.onStep?.(`Building: ${file.build}`);
      const t = Date.now();
      const b = await runBuild(file.build, dir, path.join(work, "build-home"), o.buildMs ?? 10 * 60_000, o.signal, o.buildBox);
      if (b.code !== 0) {
        line("build", "failed", b.timedOut ? `“${one(file.build, 120)}” did not finish in time.` : `“${one(file.build, 120)}” ended with code ${b.code}.`, { hint: `The build runs in the app's folder with nothing of your environment: no keys, no global tools but Node's.${b.say ? ` ${b.say}` : ""}`, details: b.tail.slice(-6) });
        return result();
      }
      line("build", "passed", `“${one(file.build, 120)}” ended well after ${Math.round((Date.now() - t) / 1000)} s.`);
    }

    // ---- what it is given: made-up values, each its own, so that one that turns up somewhere is known
    const secret = crypto.randomBytes(32).toString("hex");
    const given: Record<string, string> = {};
    for (const k of file.keys) given[k.name] = `${k.looks?.prefix?.[0] ?? ""}hydorcheck${crypto.randomBytes(18).toString("hex")}`;
    const hidden: [string, string][] = [...Object.entries(given), ...(file.env.secret ? [[file.env.secret, secret] as [string, string]] : [])];
    const extra: Record<string, string> = { ...given };
    if (usesServices(file.services)) {
      const key = `napp_wcheck${crypto.randomBytes(24).toString("hex")}`;
      stand = await standIn(await freePort(o.ports, taken), file, key, secret);
      Object.assign(extra, { HYDOR_URL: stand.url, HYDOR_APP_SLUG: SLUG, HYDOR_APP_KEY: key });
      hidden.push(["HYDOR_APP_KEY", key]);
    }

    const shape = contractRunShape(file);
    const node = nodeBin();
    const readyMs = o.readyMs ?? 30_000;

    /** Starts it told to listen on `host`; `elsewhere`: it answered on 127.0.0.1 instead of the address it was told. */
    const start = async (host = "127.0.0.1"): Promise<{ ok: boolean; ms: number; status?: number; said: string; app: Running; elsewhere?: boolean }> => {
      const port = await freePort(o.ports, taken);
      taken.delete(port);
      const env = appEnv(shape, { node, port, data, home, secret, address: `http://localhost:${port}`, dev: false, host, extra });
      // Only the variable the contract names says where: an app that reads HOST while the file says another is caught.
      if (shape.vars.host && shape.vars.host !== "HOST") delete env.HOST;
      const argv = argvOf(shape.start);
      const boxed = o.box?.({ dir, data, home, argv }) ?? null;
      const cmd = boxed ?? argv;
      const nice = process.platform !== "win32" && fs.existsSync("/usr/bin/nice") ? ["/usr/bin/nice", "-n", "10"] : [];
      const all = [...nice, ...cmd];
      const child = spawn(all[0], all.slice(1), { cwd: dir, env, stdio: ["ignore", "pipe", "pipe"], detached: process.platform !== "win32" });
      const log: string[] = [];
      const feed = (b: Buffer) => {
        for (let l of b.toString("utf8").split("\n")) {
          if (!l.trim()) continue;
          for (const [name, v] of hidden) l = l.split(v).join(`«${name}»`);
          log.push(l.slice(0, 300));
        }
        if (log.length > 60) log.splice(0, log.length - 60);
      };
      child.stdout!.on("data", feed);
      child.stderr!.on("data", feed);
      let ended = false;
      let how = "";
      child.on("error", (e) => {
        ended = true;
        how = `could not start: ${e.message}`;
      });
      child.on("exit", (code, signal) => {
        ended = true;
        how = signal ? `was ended by ${signal}` : `exited with code ${code}`;
      });
      const app: Running = { child, boxed: !!boxed, port, log, ended: () => ended, how: () => how };
      running = app;
      const t = Date.now();
      let said = "nothing answered";
      while (Date.now() - t < readyMs && !ended && !o.signal?.aborted) {
        try {
          const r = await ask(port, "GET", file.ready, { timeoutMs: 2000, address: host });
          if (r.status >= 200 && r.status < 400) return { ok: true, ms: Date.now() - t, status: r.status, said: "", app };
          said = `it answered ${r.status}`;
        } catch (e) {
          said = (e as NodeJS.ErrnoException).code === "ECONNREFUSED" ? "nothing listened on the port" : (e as Error).message;
          if (host !== "127.0.0.1") {
            const r = await ask(port, "GET", file.ready, { timeoutMs: 2000 }).catch(() => null);
            if (r && r.status >= 200 && r.status < 400) return { ok: true, elsewhere: true, ms: Date.now() - t, status: r.status, said: "", app };
          }
        }
        await sleep(120);
      }
      return { ok: false, ms: Date.now() - t, said: ended ? `the program ${how}` : said, app };
    };

    const before = await snapshot(dir);
    o.onStep?.(`Starting: ${file.start}`);
    const first = await start();
    if (!first.ok) {
      line("ready", "failed", `Started with “${one(file.start, 100)}” and asked ${file.ready} for ${Math.round(first.ms / 1000)} s: ${first.said}.`, {
        hint: `Listen on 127.0.0.1 and the port in ${file.env.port}; answer ${file.ready} with no sign-in; keep what you write in the folder in ${file.env.data}.`,
        details: first.app.log.slice(-8),
      });
      await stopApp(first.app);
      return result();
    }
    const app = first.app;
    line("ready", "passed", `Started with “${one(file.start, 100)}”; ${file.ready} answered ${first.status} after ${(first.ms / 1000).toFixed(1)} s.`);

    // ---- where it listens (said once the second start has shown whether it reads the variable)
    const hostVar = file.env.host ?? "HOST";
    const listenHint = `Listen on the address in ${hostVar} (Hydor sets 127.0.0.1 here and 0.0.0.0 on a server), never one written into the program, and on no other port.`;
    const reachable = await open(app);
    const loopbackAt = lines.length;
    /** The line goes where it was tried, after “ready”. */
    const loopback = (state: LineState, text: string, extra: { hint?: string; details?: string[] } = {}) => {
      line("loopback", state, text, extra);
      lines.splice(loopbackAt, 0, lines.pop()!);
    };
    if (reachable?.length) loopback("failed", `It listens where other computers could reach it, past Hydor and its sign-in: ${reachable.join(", ")}.`, { hint: listenHint, details: reachable });

    // ---- everything a browser got
    const seen: { at: string; headers: string; body: Buffer }[] = [];
    const browse = async (method: string, at: string, headers: Record<string, string> = {}, body?: string): Promise<Got> => {
      const r = await ask(app.port, method, at, { headers, body });
      seen.push({ at: `${method} ${at}`, headers: JSON.stringify(r.headers), body: r.body });
      return r;
    };
    const as = (ttl = 60, with_ = secret): Record<string, string> => ({ [PERSON_HEADER]: signPerson(person, with_, ttl) });
    const signed = () => (file.signIn === "hydor" ? as() : {});

    // ---- who is let in
    if (file.signIn === "own") line("signin", "note", "It has accounts of its own: Hydor's header is not tried. Make sure each person sees only what is theirs.");
    else {
      o.onStep?.("Trying who is let in");
      const tries: { what: string; headers: Record<string, string>; want: "in" | "out" }[] = [
        { what: "no header", headers: {}, want: "out" },
        { what: "a header signed with another secret", headers: as(60, crypto.randomBytes(32).toString("hex")), want: "out" },
        { what: "a header that ran out an hour ago", headers: as(-3600), want: "out" },
        { what: "a header Hydor signed", headers: as(), want: "in" },
      ];
      const said: string[] = [];
      const bad: string[] = [];
      for (const t of tries) {
        try {
          const r = await browse("GET", file.private, t.headers);
          said.push(`${t.what}: ${r.status}`);
          if (t.want === "out" && r.status !== 401 && r.status !== 403) bad.push(`${t.what} was answered ${r.status} where it has to be 401 or 403`);
          if (t.want === "in" && r.status >= 400) bad.push(`${t.what} was answered ${r.status} where it has to be let in`);
        } catch (e) {
          bad.push(`${t.what}: ${(e as Error).message}`);
        }
      }
      if (bad.length) line("signin", "failed", `Asked ${file.private}: ${bad.join("; ")}.`, { hint: `Check the ${PERSON_HEADER} header with your secret (${file.env.secret}) on every request but the ready address. If ${file.private} is meant to be public, name in “private” an address only a signed-in person gets.`, details: said });
      else line("signin", "passed", `Asked ${file.private}: ${said.join("; ")}.`);
    }

    // ---- the services, each as the app's own request makes it call
    const triedFrom = new Map<string, { status: number | null; error?: string }>();
    for (const service of ["ai", "embed", "mail"] as const) {
      const declared = file.services[service];
      const t: TryRequest | undefined = declared?.try;
      if (!declared || !t) continue;
      o.onStep?.(`Trying the ${service} service: ${t.method} ${t.path}`);
      const had = stand!.calls.filter((c) => c.service === service).length;
      try {
        const body = t.body === undefined ? undefined : typeof t.body === "string" ? t.body : JSON.stringify(t.body);
        const r = await browse(t.method, t.path, { ...signed(), ...(body !== undefined ? { "content-type": "application/json" } : {}), origin: `http://localhost:${app.port}`, "sec-fetch-site": "same-origin" }, body);
        triedFrom.set(service, { status: r.status });
      } catch (e) {
        triedFrom.set(service, { status: null, error: (e as Error).message });
      }
      for (let i = 0; i < 100 && stand!.calls.filter((c) => c.service === service).length === had; i++) await sleep(50);
    }

    // ---- keys and secrets in what a browser gets: its pages, and everything of its own they name
    o.onStep?.("Looking at what a browser gets");
    const queue = [...new Set(["/", file.ready, ...(file.signIn === "hydor" ? [file.private] : [])])];
    const asked = new Set<string>();
    while (queue.length && asked.size < 80 && !app.ended()) {
      const at = queue.shift()!;
      if (asked.has(at)) continue;
      asked.add(at);
      try {
        const r = await browse("GET", at, { ...signed(), accept: "text/html,*/*" });
        const type = String(r.headers["content-type"] ?? "");
        const loc = r.headers.location;
        if (loc) queue.push(...linksOf("text/html", `<a href="${loc}">`, at, app.port));
        queue.push(...linksOf(type, r.body.toString("utf8"), at, app.port));
      } catch {}
    }
    const found: string[] = [];
    for (const [name, value] of hidden) {
      const ways = shapesOf(value);
      const hit = seen.find((s) => ways.some((w) => s.headers.includes(w) || s.body.includes(w)));
      if (hit) found.push(`${name} is in the answer to ${hit.at}`);
    }
    const reached = file.signIn === "own" ? " Only what is reached without signing in was looked at." : "";
    if (!hidden.length) line("secrets", "passed", "It is given no key and no secret.");
    else if (found.length) line("secrets", "failed", `A value from its environment reaches the browser: ${found.join("; ")}.`, { hint: "Keys and the secret are for the server only: never put them in a page, a script or an answer.", details: found });
    else line("secrets", "passed", `Looked at ${seen.length} answers (${asked.size} addresses) for the ${hidden.length === 1 ? "one value" : `${hidden.length} values`} it was given: none is in any.${reached}`);

    // ---- what the stand-in got
    for (const service of ["ai", "embed", "mail"] as const) {
      const declared = file.services[service];
      const calls = stand?.calls.filter((c) => c.service === service) ?? [];
      if (!declared) {
        if (calls.length) line(service, "failed", `It called the ${service} service, which is not under services in ${HYDOR_FILE}.`);
        continue;
      }
      const wrong = [...new Set(calls.flatMap((c) => c.wrong))];
      const t = triedFrom.get(service);
      const how = declared.try ? `${declared.try.method} ${declared.try.path}` : "";
      if (wrong.length) line(service, "failed", `It asked a stand-in for Hydor and would have been refused: ${wrong.join("; ")}.`, { details: wrong });
      else if (calls.length) {
        if (t && t.status !== null && t.status >= 500) line(service, "failed", `The request reached the stand-in as Hydor takes it, but ${how} then answered ${t.status}.`);
        else line(service, "passed", `${declared.try ? `${how} made it ask` : "It asked"} a stand-in for Hydor ${calls.length === 1 ? "once" : `${calls.length} times`}, each as Hydor takes it${t?.status != null ? `, and answered ${t.status}` : ""}.`);
      } else if (!declared.try) line(service, "notRun", `${HYDOR_FILE} gives no “try” request under services.${service}, so nothing made the app call it.`, { hint: `Add "try": { "method": "POST", "path": "/…", "body": {…} }: a request that makes the app use it.` });
      else if (t && (t.status === 401 || t.status === 403)) line(service, "notRun", `${how} answered ${t.status}: it asks for a sign-in the check does not have, so the call was not seen.`);
      else line(service, "failed", `${how} ${t?.status != null ? `answered ${t.status}` : `failed (${t?.error ?? "no answer"})`} and nothing reached the stand-in. Use HYDOR_URL, HYDOR_APP_SLUG and HYDOR_APP_KEY from the environment.`);
    }
    const strays = [...new Set((stand?.calls ?? []).filter((c) => c.service === "other").flatMap((c) => c.wrong))];
    if (strays.length) line("ai", "failed", strays.join("; "), { details: strays });

    // ---- the app's own smoke test, as a launch runs it
    if (file.smoke && !app.ended()) {
      o.onStep?.("Running its smoke test");
      const hint = "“smoke” is what a launch runs to try the app: it has to pass with nobody's data, signed out (signed in by Hydor, with \"signIn\": \"hydor\").";
      if (typeof file.smoke === "string") {
        const smokeHome = path.join(work, "smoke-home");
        const address = `http://localhost:${app.port}`;
        const env = buildEnv(node, smokeHome, { SMOKE_URL: address, ...(file.env.url ? { [file.env.url]: address } : {}) });
        const ran = await runSmoke(file.smoke, dir, env, o.box ? (argv) => o.box!({ dir, data: smokeHome, home: smokeHome, argv }) : undefined);
        if (ran.code === 0) line("smoke", "passed", `“${one(file.smoke, 120)}” ended well.`);
        else line("smoke", "failed", `“${one(file.smoke, 120)}” ${ran.code === null ? "did not finish in time" : `ended with code ${ran.code}`}.`, { hint: `${hint} It is given the app's address in SMOKE_URL.`, details: ran.tail.slice(-6) });
      } else {
        const t = file.smoke;
        const what = `${t.method} ${t.path}`;
        try {
          const body = t.body === undefined ? undefined : typeof t.body === "string" ? t.body : JSON.stringify(t.body);
          const r = await browse(t.method, t.path, { ...signed(), ...(body !== undefined ? { "content-type": "application/json" } : {}), origin: `http://localhost:${app.port}`, "sec-fetch-site": "same-origin" }, body);
          if (r.status >= 200 && r.status < 400) line("smoke", "passed", `${what} answered ${r.status}.`);
          else line("smoke", "failed", `${what} answered ${r.status}.`, { hint });
        } catch (e) {
          line("smoke", "failed", `${what} failed (${(e as Error).message}).`, { hint });
        }
      }
    }

    if (o.running && !app.ended() && !o.signal?.aborted) await o.running({ port: app.port, file, hidden: hidden.map(([name, value]) => ({ name, value })), person: () => signed(), signal: o.signal });

    // ---- it stops when asked
    o.onStep?.("Asking it to stop");
    if (app.ended()) line("stop", "failed", `It stopped by itself during the check (it ${app.how()}).`, { details: app.log.slice(-8) });
    const stopped = await stopApp(app);
    if (!lines.some((l) => l.id === "stop")) {
      if (stopped.polite) line("stop", "passed", `Told to stop (SIGTERM), it ended after ${(stopped.ms / 1000).toFixed(1)} s.`);
      else line("stop", "failed", `Told to stop (SIGTERM), it was still running after ${STOP_MS / 1000} s and had to be killed.`, { hint: "On SIGTERM: stop taking requests, finish what is being answered, close the database, exit." });
    }

    // ---- it keeps its data across a restart
    o.onStep?.("Starting it again on the same data");
    const marker = path.join(data, "hydor-check.keep");
    fs.writeFileSync(marker, "kept");
    const db = file.database;
    const dbFile = db ? path.join(data, db.file) : null;
    const Sql = db?.sqlite ? await sqliteModule() : null;
    let was: Sqlite | null = null;
    let wrote = fs.readdirSync(data).filter((n) => n !== "hydor-check.keep");
    if (dbFile && Sql && fs.existsSync(dbFile)) {
      try {
        const h = new Sql(dbFile);
        h.exec("create table if not exists _hydor_check (id integer primary key, said text); insert into _hydor_check (said) values ('kept')");
        was = rows(h);
        h.close();
      } catch (e) {
        line("data", "failed", `${db!.file} could not be opened as SQLite (${one((e as Error).message, 160)}).`);
      }
    }
    // The second start is told another of this computer's addresses, where this computer has one to give.
    const other = (await take(0, OTHER)) === null ? "127.0.0.1" : OTHER;
    const second = await start(other);
    let kept = "";
    const lost: string[] = [];
    if (!second.ok) lost.push(`started again on the same data, it did not become ready: ${second.said}`);
    if (!reachable?.length) {
      const there = second.ok ? await open(second.app) : null;
      if (second.elsewhere) loopback("failed", `Told to listen on ${other} (in ${hostVar}), it listened on 127.0.0.1 instead: it does not read ${hostVar}. On a server it is told 0.0.0.0, and nobody would reach it.`, { hint: listenHint });
      else if (there?.length) loopback("failed", `Told to listen on ${other}, it also listened where other computers could reach it: ${there.join(", ")}.`, { hint: listenHint, details: there });
      else if (reachable === null) loopback("notRun", "This computer gives no way to tell what the app listens on.");
      else if (other === "127.0.0.1" || !second.ok) loopback("passed", `Port ${app.port} is open on 127.0.0.1 only. Whether it reads ${hostVar} could not be tried${second.ok ? " on this computer" : ""}.`);
      else loopback("passed", `Port ${app.port} was open on 127.0.0.1 only, and told ${other} in ${hostVar} it listened there.`);
    }
    await stopApp(second.app);
    if (!fs.existsSync(marker)) lost.push("a file put in the data folder was gone after the restart");
    if (dbFile && db) {
      if (wrote.includes(db.file) && !fs.existsSync(dbFile)) lost.push(`${db.file} was gone after the restart`);
      if (was && Sql) {
        try {
          const h = new Sql(dbFile);
          const now = rows(h);
          for (const [t, n] of Object.entries(was.tables)) if (now.tables[t] === undefined) lost.push(`the table ${t} was gone`);
          else if (now.tables[t] < n) lost.push(`the table ${t} had ${n} rows and has ${now.tables[t]}`);
          h.exec("drop table if exists _hydor_check");
          h.close();
          const own = Object.keys(was.tables).filter((t) => t !== "_hydor_check");
          kept = ` ${db.file} kept its ${own.length === 1 ? "table" : `${own.length} tables`} and every row.`;
        } catch (e) {
          lost.push(`${db.file} could not be read after the restart (${one((e as Error).message, 120)})`);
        }
      }
    }
    fs.rmSync(marker, { force: true });
    if (!lines.some((l) => l.id === "data")) {
      if (lost.length) line("data", "failed", `After a restart with the same data folder: ${lost.join("; ")}.`, { hint: `Keep everything in the folder in ${file.env.data}, and never empty or remake it as the app starts.`, details: lost });
      else if (db && !wrote.includes(db.file)) line("data", "note", `It answered again on the same data folder, but had not made ${db.file} there by then, so nothing of it could be looked at.`, { hint: `Make the database as the app starts, in the folder in ${file.env.data}.` });
      else if (!wrote.length) line("data", "note", "It answered again on the same data folder. It wrote nothing there while checked: make sure what people add goes in it.");
      else line("data", "passed", `Started again on the same data folder, it answered; a file the check put there was still there.${kept}`);
    }

    // ---- it wrote nowhere else under its folder
    const wroteIn = changed(before, await snapshot(dir));
    if (wroteIn.length) line("writes", "failed", `While running it changed its own folder: ${wroteIn.slice(0, 4).join(", ")}${wroteIn.length > 4 ? ` and ${wroteIn.length - 4} more` : ""}. Inside Hydor that folder is read-only, and a new version replaces it.`, { hint: `Write only in the folder in ${file.env.data} (logs go to the screen).`, details: wroteIn });
    else line("writes", "passed", "Over both runs nothing in its own folder was made, changed or removed.");
    return result();
  } finally {
    const left = running as Running | null;
    if (left && !left.ended()) await stopApp(left);
    await (stand as StandIn | null)?.close();
    if (!o.work) fs.rmSync(work, { recursive: true, force: true });
  }
}

const MARK: Record<LineState, string> = { passed: "ok  ", failed: "FAIL", note: "note", notRun: "??  " };

/** A line as the command prints it. */
export function printLine(l: ContractLine): string {
  const more = l.state === "passed" ? [] : [...(l.details ?? []).map((d) => `        · ${d}`), ...(l.hint ? [`        To do: ${l.hint}`] : [])];
  return [`${MARK[l.state]}  ${l.title}: ${l.text}`, ...more].join("\n");
}
