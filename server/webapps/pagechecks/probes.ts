// What is asked of the app directly, with no browser: where its links lead, whether a form posted from another site gets through,
// and the files a browser could be given that no page loaded (source maps, parts loaded later).
import crypto from "node:crypto";
import http from "node:http";
import https from "node:https";
import type { FormFact } from "./in-page.ts";
import { type Answer, type CrossSite, acts, isSignInPath, isTokenField, judgeCrossSite, onApp, secretsIn, type Secret } from "./measure.ts";
import { type Found, noteKeysRead, shortUrl, TEXTUAL } from "./visit.ts";

export interface Got {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
}

/** One request with exactly the headers given (a browser's Origin and Sec-Fetch-Site too, which fetch() would not let be said). */
export function ask(url: URL, o: { method?: string; headers?: Record<string, string>; body?: Buffer | string; timeoutMs?: number; signal?: AbortSignal } = {}): Promise<Got> {
  return new Promise((resolve, reject) => {
    const lib = url.protocol === "https:" ? https : http;
    const req = lib.request(url, { method: o.method ?? "GET", headers: { connection: "close", ...(o.body !== undefined ? { "content-length": String(Buffer.byteLength(o.body)) } : {}), ...o.headers }, timeout: o.timeoutMs ?? 10_000, signal: o.signal }, (res) => {
      const chunks: Buffer[] = [];
      let size = 0;
      const done = () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) });
      res.on("data", (c: Buffer) => {
        size += c.length;
        if (size <= 4 << 20) chunks.push(c);
        if (size > 4 << 20 || /event-stream/.test(String(res.headers["content-type"]))) (done(), res.destroy());
      });
      res.on("end", done);
      res.on("close", done);
      res.on("error", done);
    });
    req.on("timeout", () => req.destroy(Object.assign(new Error("no answer in time"), { code: "ETIMEDOUT" })));
    req.on("error", reject);
    req.end(o.body);
  });
}

export interface ProbeCtx {
  base: URL;
  origins: string[];
  /** The headers that sign a request in, made now (a signed header lasts a minute). */
  auth: (signedIn: boolean) => Record<string, string>;
  signal?: AbortSignal;
}

/** An address of the app as a browser's address bar would end up: redirects followed while they stay in the app. */
export async function follow(ctx: ProbeCtx, path: string, signedIn: boolean): Promise<Got & { final: string }> {
  let url = onApp(ctx.base, path);
  for (let i = 0; ; i++) {
    const r = await ask(url, { headers: { accept: "text/html,*/*", ...ctx.auth(signedIn) }, signal: ctx.signal });
    const to = r.headers.location;
    if (r.status < 300 || r.status >= 400 || !to || i >= 6) return { ...r, final: url.pathname + url.search };
    const next = new URL(to, url);
    if (!ctx.origins.includes(next.origin)) return { ...r, status: 200, final: next.href };
    url = onApp(ctx.base, next.pathname + next.search);
  }
}

// ---- a form from another site ------------------------------------------------------------------------------------------------------------

const OTHER = "https://another-site.example";

/** The address a form that only reads (method get, no password) leads to when filled in, or null. */
export function getFormAddress(form: FormFact, origins: string[]): string | null {
  if (form.method !== "get" || form.password || !form.fields.length) return null;
  try {
    const url = new URL(form.action);
    const query = new URLSearchParams();
    for (const f of form.fields) {
      const v = f.type === "file" ? null : fill(f);
      if (v !== null) query.append(f.name, v);
    }
    const to = `${url.pathname}?${query}`;
    return origins.includes(url.origin) && query.size && !acts(to) ? to : null;
  } catch {
    return null;
  }
}

/** Made-up words that a form would likely take. */
function fill(f: FormFact["fields"][number]): string | null {
  switch (f.type) {
    case "hidden": return f.value;
    case "email": return "pagecheck@example.test";
    case "number": case "range": return f.value || f.min || "1";
    case "date": return f.value || f.min || "2027-01-15";
    case "datetime-local": return f.value || "2027-01-15T09:00";
    case "month": return f.value || "2027-01";
    case "week": return f.value || "2027-W03";
    case "time": return f.value || "09:00";
    case "url": return "https://example.test/";
    case "tel": return "0100 000000";
    case "color": return "#336699";
    case "password": return "pagecheck-Password-9";
    case "checkbox": return f.checked || f.required ? f.value || "on" : null;
    case "radio": return f.value || "on";
    case "select-one": case "select-multiple": return f.value || f.options?.find((o) => o !== "") || "";
    default: return f.value || (f.numeric ? f.min || "2" : "Page check");
  }
}

export function formBody(form: FormFact, honestTokens: boolean): { type: string; body: Buffer } {
  const values: [string, string, boolean][] = [];
  const radios = new Set<string>();
  for (const f of form.fields) {
    if (f.type === "radio") {
      if (radios.has(f.name)) continue;
      radios.add(f.name);
    }
    if (f.type === "file") {
      values.push([f.name, "", true]);
      continue;
    }
    let v = fill(f);
    if (v === null) continue;
    // another site cannot know a token the app put in its own page
    if (f.type === "hidden" && !honestTokens && isTokenField(f.name, f.value)) v = "x".repeat(Math.max(8, v.length));
    values.push([f.name, v, false]);
  }
  if (form.submit) values.push([form.submit.name, form.submit.value, false]);
  if (!form.multipart) return { type: "application/x-www-form-urlencoded", body: Buffer.from(new URLSearchParams(values.filter((v) => !v[2]).map(([k, v]) => [k, v])).toString()) };
  const edge = `----pagecheck${crypto.randomBytes(8).toString("hex")}`;
  const q = (s: string) => s.replace(/["\r\n]/g, "_");
  const parts = values.map(([k, v, file]) => `--${edge}\r\nContent-Disposition: form-data; name="${q(k)}"${file ? '; filename="page-check.csv"\r\nContent-Type: text/csv\r\n\r\ndate,name,amount\r\n2027-01-15,Page check,1' : `\r\n\r\n${v}`}\r\n`);
  return { type: `multipart/form-data; boundary=${edge}`, body: Buffer.from(`${parts.join("")}--${edge}--\r\n`) };
}

export interface FormTried {
  result: CrossSite;
  status: number;
}

/** Posts the form as another site's page would, with the person's cookie; and, only when the answer could mean something else, as its own page does. */
export async function tryForm(ctx: ProbeCtx, form: FormFact, pagePath: string, signedIn: boolean): Promise<FormTried> {
  const url = new URL(form.action);
  const target = onApp(ctx.base, url.pathname + url.search);
  const post = async (own: boolean): Promise<Answer> => {
    const { type, body } = formBody(form, own);
    const from = own ? ctx.base.origin : OTHER;
    const r = await ask(target, {
      method: "POST",
      headers: { ...ctx.auth(signedIn), "content-type": type, accept: "text/html,*/*", origin: from, referer: `${from}${own ? pagePath : "/page"}`, "sec-fetch-site": own ? "same-origin" : "cross-site", "sec-fetch-mode": "navigate", "sec-fetch-dest": "document", "sec-fetch-user": "?1" },
      body,
      signal: ctx.signal,
    });
    return { status: r.status, location: r.headers.location };
  };
  const cross = await post(false);
  let result = judgeCrossSite(cross);
  if (result === null) result = judgeCrossSite(cross, await post(true))!;
  return { result, status: cross.status };
}

/** A form whose trying would end the session or take the account away is left alone. */
export const leftAlone = (form: FormFact): boolean => /(sign|log)[-_ ]?(out|off|in|up)|delete|remove|destroy|password|close[-_ ]?account|leave|reset|revoke/i.test(`${new URL(form.action).pathname} ${form.what}`) || isSignInPath(new URL(form.action).pathname);

// ---- files no page loaded ------------------------------------------------------------------------------------------------------------------

function named(text: string, at: string): string[] {
  const out: string[] = [];
  const add = (raw: string) => {
    try {
      out.push(new URL(raw.replace(/&amp;/g, "&"), at).href);
    } catch {}
  };
  for (const m of text.matchAll(/[#@] sourceMappingURL=([^\s*"']+)/g)) add(m[1]);
  for (const m of text.matchAll(/\b(?:import|from)\s*\(?\s*["']((?:\.{1,2}\/|\/)[^"']+)["']/g)) add(m[1]);
  for (const m of text.matchAll(/["'`]((?:\.{0,2}\/)?[\w./-]+\.(?:m?js|json|map))["'`]/g)) add(m[1]);
  for (const m of text.matchAll(/<(?:script|link)\b[^>]*?\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) add(m[1]);
  return out;
}

/** Looks for the keys in the files the app's own files name, source maps among them. Gives how many files were looked at beyond those loaded. */
export async function moreFiles(ctx: ProbeCtx, texts: Map<string, string>, secrets: Secret[], names: string[], found: Found[]): Promise<number> {
  const queue: string[] = [];
  const seen = new Set(texts.keys());
  const add = (list: string[]) => {
    for (const u of list) if (!seen.has(u) && ctx.origins.some((o) => u.startsWith(`${o}/`))) (seen.add(u), queue.push(u));
  };
  const note = (text: string, url: string) => {
    for (const name of secretsIn(text, secrets)) {
      const file = shortUrl(url, ctx.origins);
      if (!found.some((f) => f.name === name && f.file === file)) found.push({ name, file });
    }
  };
  const inline = (text: string, url: string) => {
    for (const m of text.matchAll(/sourceMappingURL=data:[^,]*;base64,([A-Za-z0-9+/=]+)/g)) note(Buffer.from(m[1], "base64").toString("utf8"), `${url} (its source map)`);
  };
  for (const [url, text] of texts) (add(named(text, url)), inline(text, url));
  let looked = 0;
  while (queue.length && looked < 80 && !ctx.signal?.aborted) {
    const url = queue.shift()!;
    if (/(sign|log)[-_]?(out|off)|delete|remove|destroy|reset|revoke/i.test(url)) continue;
    try {
      const u = new URL(url);
      const r = await ask(onApp(ctx.base, u.pathname + u.search), { headers: ctx.auth(false), signal: ctx.signal });
      if (r.status !== 200 || !TEXTUAL.test(String(r.headers["content-type"] ?? ""))) continue;
      looked++;
      const text = r.body.toString("utf8");
      note(text, url);
      noteKeysRead(text, String(r.headers["content-type"] ?? ""), shortUrl(url, ctx.origins), names, found);
      inline(text, url);
      add(named(text, url));
    } catch {}
  }
  return looked;
}
