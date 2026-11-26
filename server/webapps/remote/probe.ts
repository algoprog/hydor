// Looking at a launched app from the computer that launched it, over its real https address: that the certificate is right
// (a public one for a real name; Caddy's own authority, read from the server, for a local name), that the ready address
// and the first page answer, and, while a new version replaces an old one, how long nobody was answered.
import { request } from "node:https";

export interface Target {
  /** The address people use, like https://notes.example.com or https://notes.localhost:4772. */
  address: string;
  /** Caddy's own root certificate (PEM), for a local name. */
  ca?: string;
  /** Where to connect when the name does not lead there by itself: `.localhost` is this computer, `.test` is the host. */
  connectTo?: string;
}

export interface Answer {
  status: number;
  headers: Record<string, string>;
  body: string;
}

/** The address to connect to for a name: this computer for .localhost (RFC 6761), the host's address for the other local names. */
export function connectFor(address: string, hostAddress: string): string | undefined {
  const name = new URL(address).hostname;
  if (/(^|\.)localhost$/i.test(name)) return "127.0.0.1";
  if (/(^|\.)(test|internal|local)$/i.test(name)) return hostAddress;
  return undefined;
}

export function get(target: Target, path: string, options: { timeoutMs?: number; method?: string; body?: string } = {}): Promise<Answer> {
  const url = new URL(path, target.address);
  return new Promise((resolve, reject) => {
    const req = request(
      {
        method: options.method ?? "GET",
        hostname: target.connectTo ?? url.hostname,
        port: url.port || 443,
        path: `${url.pathname}${url.search}`,
        servername: url.hostname,
        headers: {
          host: url.host,
          accept: "text/html,application/json",
          "user-agent": "hydor-launch",
          // As a page of the app's own would send it: an app that refuses changes from elsewhere takes it.
          ...(options.method && options.method !== "GET" ? { origin: url.origin, "sec-fetch-site": "same-origin" } : {}),
          ...(options.body !== undefined ? { "content-type": "application/json", "content-length": String(Buffer.byteLength(options.body)) } : {}),
        },
        ...(target.ca ? { ca: target.ca } : {}),
        timeout: options.timeoutMs ?? 10_000,
        agent: false,
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (d: string) => {
          if (body.length < 100_000) body += d;
        });
        res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: Object.fromEntries(Object.entries(res.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(", ") : String(v ?? "")])), body }));
        res.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(new Error("no answer in time")));
    req.on("error", reject);
    req.end(options.body);
  });
}

/** The app's own smoke request (hydor.json `smoke`), made to the live address with nobody signed in. */
export const requestTry = (target: Target, t: { method: string; path: string; body?: unknown }): Promise<Answer> =>
  get(target, t.path, { method: t.method, ...(t.body !== undefined ? { body: typeof t.body === "string" ? t.body : JSON.stringify(t.body) } : {}) });

const short = (text: string) => text.replace(/\s+/g, " ").trim().slice(0, 160);
const answers = (status: number) => status >= 200 && status < 400;

/** Waits for the ready address to answer 2xx or 3xx: the first launch of a real name waits for its certificate too. */
export async function waitReady(target: Target, ready: string, seconds: number): Promise<{ ok: boolean; seconds: number; last: string }> {
  const start = Date.now();
  let last = "no answer";
  do {
    try {
      const a = await get(target, ready, { timeoutMs: 4000 });
      if (answers(a.status)) return { ok: true, seconds: (Date.now() - start) / 1000, last: `it answered ${a.status}` };
      last = `it answered ${a.status}${short(a.body) ? `: ${short(a.body)}` : ""}`;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await new Promise((r) => setTimeout(r, 500));
  } while (Date.now() - start < seconds * 1000);
  return { ok: false, seconds: (Date.now() - start) / 1000, last };
}

export interface SmokeLine {
  id: "https" | "ready" | "page";
  ok: boolean;
  say: string;
}

/**
 * The look after a launch: the ready address, and the first page. The contract promises nothing of "/", so only a server
 * error, a loop or no answer there fails the launch. Nothing is written.
 */
export async function smoke(target: Target, ready: string): Promise<SmokeLine[]> {
  const lines: SmokeLine[] = [];
  const check = async (id: SmokeLine["id"], run: () => Promise<string>) => {
    try {
      lines.push({ id, ok: true, say: await run() });
    } catch (error) {
      lines.push({ id, ok: false, say: error instanceof Error ? error.message : String(error) });
    }
  };
  const host = new URL(target.address).host;
  await check("ready", async () => {
    const a = await get(target, ready);
    if (!answers(a.status)) throw new Error(`${ready} answered ${a.status} over https at ${target.address}`);
    return `${ready} answers ${a.status} over https at ${host}${target.ca ? " (Caddy's own certificate authority, trusted for this look only)" : " (a certificate browsers trust)"}.`;
  });
  await check("page", async () => {
    let path = "/";
    for (let hop = 0; hop < 5; hop++) {
      const a = await get(target, path);
      if (a.status >= 300 && a.status < 400 && a.headers.location) {
        const next = new URL(a.headers.location, new URL(path, target.address));
        // A redirect to another site (a sign-in elsewhere) is followed no further.
        if (next.host !== host) return `${path} sends visitors to ${next.origin}.`;
        path = `${next.pathname}${next.search}`;
        continue;
      }
      if (a.status >= 500) throw new Error(`${path} answered ${a.status}${short(a.body) ? ` (${short(a.body)})` : ""}`);
      return a.status === 404 && path === "/" ? "/ answers 404: the app has no first page." : `${path} answers ${a.status}.`;
    }
    throw new Error("the first page sends visitors round in a circle");
  });
  return lines;
}

/** Asks the ready address every 150 ms until stopped, and says for how long it was not answered. */
export function watchDowntime(target: Target, ready: string): { stop(): Promise<{ seconds: number; polls: number }> } {
  let stopped = false;
  let since: number | null = null;
  let total = 0;
  let polls = 0;
  const loop = (async () => {
    while (!stopped) {
      const t = Date.now();
      let up = false;
      try {
        up = answers((await get(target, ready, { timeoutMs: 1500 })).status);
      } catch {
        up = false;
      }
      polls++;
      if (!up && since === null) since = t;
      if (up && since !== null) {
        total += (t - since) / 1000;
        since = null;
      }
      await new Promise((r) => setTimeout(r, 150));
    }
  })();
  return {
    async stop() {
      stopped = true;
      await loop;
      if (since !== null) total += (Date.now() - since) / 1000;
      since = null;
      return { seconds: Math.round(total * 10) / 10, polls };
    },
  };
}

export interface Probes {
  waitReady: typeof waitReady;
  smoke: typeof smoke;
  watchDowntime: typeof watchDowntime;
  request: typeof requestTry;
}
export const PROBES: Probes = { waitReady, smoke, watchDowntime, request: requestTry };
