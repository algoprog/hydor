// How a browser reaches a web app. An http server of its own (never Hydor's port) in front of the apps the host
// keeps running, built like Preview's (server/preview.ts): entry is a short-lived link Hydor signs, the browser
// keeps a signed session, and Hydor's own cookies never reach an app. Two ways in:
//
// 1. A hostname of its own: Host `<slug>.localhost[:port]`, or `<slug>.<domain>` for a domain given in the options.
//    The session cookie is the host's own, so several apps are open at once in one browser. (A port of its own is
//    not a way in: browsers share cookies across the ports of one host, so an app on one would read Hydor's.)
// 2. A path with a token, for a tunnel with a single hostname: /w/<session token>/… . The page runs in a sandbox
//    (Content-Security-Policy: sandbox, without allow-same-origin) so it has an origin of no one and can reach
//    nothing of Hydor's, and no Set-Cookie reaches the browser. A sandboxed page has no cookies, localStorage or sessionStorage
//    of its own (the browser throws), so on this way the proxy keeps them for it, in memory, one set for each app and person
//    (outliving the token): the app's Set-Cookie lines go into a jar (never to the browser) and its requests and sockets get the
//    jar's cookies for their path in place of the Cookie header the browser sent; and each page of HTML gets a small script
//    first in its head that, only where the browser's own throw, gives the page localStorage, sessionStorage and
//    document.cookie, sending changes to `<prefix>/__hydor/state` (which the proxy answers itself, never the app). See
//    "what a page keeps on the path way" below.
//
// In both: no valid session, a plain 403; the request goes to 127.0.0.1:<the app's port> with Host
// localhost:<port>; the cookies of Hydor and of this proxy are taken off (on the path way the app gets its jar's instead); any x-hydor-person the browser sent is
// taken off and a fresh one for the session's person is signed on every request (sign.ts); WebSocket upgrades
// follow the same rules; every request marks the app as used (and so does an open socket, until it closes).
import crypto from "node:crypto";
import http from "node:http";
import net from "node:net";
import { type Duplex, Transform } from "node:stream";
import { readLink, signLink } from "../links.ts";
import type { Host, HostedApp } from "./host.ts";
import {
  PERSON_HEADER,
  type Person,
  type PersonRole,
  signPerson,
} from "./sign.ts";

/** An address that is a file (a stylesheet, a script, a font, a picture): never a page the frame is at. */
const STATIC_FILE = /\.(css|js|mjs|map|json|png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf|txt|xml)$/i;

/** The cookie that holds the signed session. */
export const SESSION_COOKIE = "wa_app";
/** Cookies an app never receives (Hydor's own sign-in, Preview's, and this proxy's) and never sets. */
const RESERVED_COOKIES = new Set(["wa_session", "ac_preview", SESSION_COOKIE]);
const SESSION_MS = 12 * 3600_000;
const OPEN_MS = 120_000;
/** The page is given an origin of no one: scripts, forms and the like work, and it can reach nothing of Hydor's. */
export const SANDBOX_POLICY =
  "sandbox allow-scripts allow-forms allow-popups allow-modals allow-downloads";
const ROLES: readonly PersonRole[] = ["owner", "admin", "member", "guest"];

/** Where the proxy finds apps: by slug (a hostname) or by id (a session). */
export interface AppsDirectory {
  bySlug(slug: string): HostedApp | undefined;
  byId(id: string): HostedApp | undefined;
}

export interface AppsProxyOptions {
  host: Host;
  apps: AppsDirectory;
  port: number;
  /** Where it listens (127.0.0.1 unless Hydor is reached from other computers). */
  listen?: string;
  /** A domain whose subdomains lead here: `<slug>.<domain>` is the app's hostname (besides `<slug>.localhost`). */
  domain?: string;
}

export interface AppsProxyOptions {
  host: Host;
  apps: AppsDirectory;
  port: number;
  /** Where it listens (127.0.0.1 unless Hydor is reached from other computers). */
  listen?: string;
  /** A domain whose subdomains lead here: `<slug>.<domain>` is the app's hostname (besides `<slug>.localhost`). */
  domain?: string;
  /**
   * For apps built to live under a base path (Vite's `base`, which TanStack Start also uses as its router's basepath:
   * `/__hydor_base__`): the app is asked for its pages at that base, and wherever its answers name it (its links,
   * scripts, redirects, the router's basepath) the proxy puts the place the page really is at: nothing at a
   * hostname, `/w/<token>` on the path way. An app built for the root has no base: leave it out.
   */
  base?: string;
}

export interface AppsProxy {
  /** The page the app's frame in Hydor's page was last at (a page load, or the page a request of it came from), for an app: its path with its query. */
  lastPath(appId: string): string | undefined;
  server: http.Server;
  listen(): Promise<number>;
  close(): Promise<void>;
}

interface OpenToken {
  k: string;
  app: string;
  p: Person;
  e: number;
  /** The origin of the Hydor page that shows the app in a frame (its Preview), when the link is for that. */
  fa?: string;
  /** The pages get Hydor's pointing helper (the person taps a part of the app to point at it). */
  pt?: boolean;
}

/** What a link or a session may ask the app's pages to be shown with, besides the person. */
export interface ShowFlags {
  point?: boolean;
}

const flagsOf = (f?: ShowFlags): { pt?: true } => (f?.point ? { pt: true as const } : {});

const cleanPerson = (p: unknown): Person | null => {
  const v = p as Record<string, unknown> | null;
  if (!v || typeof v !== "object") return null;
  if (
    typeof v.id !== "string" ||
    !v.id ||
    typeof v.name !== "string" ||
    !ROLES.includes(v.role as PersonRole)
  )
    return null;
  const out: Person = { id: v.id, name: v.name, role: v.role as PersonRole };
  if (typeof v.email === "string") out.email = v.email;
  if (typeof v.teamId === "string") out.teamId = v.teamId;
  return out;
};

/** A link that opens the app for `person`: /__hydor/open?t=<this>&to=<path>. It works once, within two minutes. */
export function webappOpenToken(
  appId: string,
  person: Person,
  ttlMs = OPEN_MS,
  /** The origin of Hydor's page that will show the app in a frame (http or https), or none. */
  frame?: string,
  flags?: ShowFlags,
): string {
  // A nonce: two links made in the same millisecond for the same person are two links, each good once.
  return signLink(
    {
      k: "webapp-open",
      app: appId,
      p: person,
      ...(frame ? { fa: frame } : {}),
      ...flagsOf(flags),
      n: crypto.randomBytes(9).toString("base64url"),
    },
    ttlMs,
  );
}

/** A session for `person` in the app (12 hours): what the cookie holds, and the token in a /w/<token>/ address. */
export function webappSession(
  appId: string,
  person: Person,
  ttlMs = SESSION_MS,
  frame?: string,
  flags?: ShowFlags,
): string {
  return signLink(
    { k: "webapp-session", app: appId, p: person, ...(frame ? { fa: frame } : {}), ...flagsOf(flags) },
    ttlMs,
  );
}

/** An origin as a browser writes it (scheme://host[:port], http or https), or null. */
export function frameOrigin(v: unknown): string | null {
  if (typeof v !== "string" || v.length > 300) return null;
  try {
    const u = new URL(v);
    return (u.protocol === "http:" || u.protocol === "https:") && u.origin === v ? v : null;
  } catch {
    return null;
  }
}

/**
 * A content security policy that lets the page at `origin` show the app in a frame: its `frame-ancestors` gets the origin
 * (replacing none), and a policy without that directive is left as it is. Only for a session opened for Hydor's own Preview.
 */
export function allowFrameBy(csp: string, origin: string): string {
  return csp
    .split(";")
    .map((d) => {
      const t = d.trim();
      if (!/^frame-ancestors(\s|$)/i.test(t)) return d;
      const sources = t.split(/\s+/).slice(1).filter((x) => x.toLowerCase() !== "'none'");
      return ` frame-ancestors ${[...sources, ...(sources.includes(origin) ? [] : [origin])].join(" ")}`;
    })
    .join(";")
    .trim();
}


// ---- pointing at a part of the app ---------------------------------------------------------------------------------------------
//
// A page of the app may be shown with **pointing**, asked for in the signed link or session that Hydor makes and nowhere else (a
// person who opens the app in a tab of their own does not get it): a small script that, in the frame of Hydor's own page, lets
// the person tap a part of the app and tells that page what they tapped (its visible words and what kind of thing it is) by
// postMessage, to that page's origin only.

/** The page the helper is read from, as the person tapped it: the kind of thing it was, from the element's own tag and role. */
const POINT_SCRIPT = (to: string) =>
  `<script data-hydor-point>(function(){if(window.parent===window)return;var P=window.parent,O=${JSON.stringify(to)};` +
  `function say(m){try{P.postMessage(m,O)}catch(e){}}` +
  `function where(){return location.pathname+location.search}` +
  `function path(){say({hydor:'hydor-webapp-path',path:where()})}` +
  `['pushState','replaceState'].forEach(function(k){var o=history[k];history[k]=function(){var r=o.apply(this,arguments);setTimeout(path,30);return r}});` +
  `addEventListener('popstate',path);addEventListener('load',path);` +
  `var box=null;function mk(){if(box)return box;box=document.createElement('div');box.setAttribute('aria-hidden','true');` +
  `box.style.cssText='position:fixed;z-index:2147483647;pointer-events:none;display:none;border:2px solid #6366f1;background:rgba(99,102,241,.14);border-radius:4px;box-sizing:border-box';` +
  `document.body.appendChild(box);return box}` +
  `function kind(el){var t=el.tagName.toLowerCase(),r=(el.getAttribute('role')||'').toLowerCase();` +
  `if(t==='a'||r==='link')return'link';if(t==='button'||r==='button'||(t==='input'&&/^(button|submit|reset)$/.test(el.type)))return'button';` +
  `if(t==='input'||t==='textarea'||t==='select'||r==='textbox')return'field';if(/^h[1-6]$/.test(t))return'heading';` +
  `if(t==='img'||t==='svg'||t==='picture'||t==='video')return'image';if(t==='table'||r==='table')return'table';if(t==='tr'||t==='li'||r==='row'||r==='listitem')return'list item';` +
  `if(t==='ul'||t==='ol')return'list';if(t==='form')return'form';if(t==='nav')return'menu';if(t==='header'||t==='footer')return t==='header'?'header':'footer';` +
  `if(t==='label')return'label';if(t==='section'||t==='main'||t==='aside'||t==='article')return'section';return'text'}` +
  `function words(el){var s=(el.getAttribute('aria-label')||el.alt||el.value||el.placeholder||el.innerText||el.textContent||'');return String(s).replace(/\\s+/g,' ').trim().slice(0,120)}` +
  `function pick(t){var el=t&&t.nodeType===1?t:t&&t.parentElement;if(!el||el===document.documentElement||el===document.body)return null;` +
  `var up=el.closest('a,button,input,select,textarea,label,h1,h2,h3,h4,h5,h6,img,tr,li,[role=button],[role=link]');return up||el}` +
  `function mark(el){if(!el){if(box)box.style.display='none';return}var b=mk(),r=el.getBoundingClientRect();` +
  `b.style.display='block';b.style.left=r.left+'px';b.style.top=r.top+'px';b.style.width=r.width+'px';b.style.height=r.height+'px'}` +
  `document.addEventListener('mousemove',function(e){mark(pick(e.target))},true);` +
  `document.addEventListener('mouseout',function(e){if(!e.relatedTarget)mark(null)},true);` +
  `function tap(e){var el=pick(e.target);if(!el)return;e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();mark(el);` +
  `say({hydor:'hydor-webapp-point',path:where(),text:words(el),kind:kind(el),tag:el.tagName.toLowerCase()})}` +
  `['click','auxclick'].forEach(function(n){document.addEventListener(n,tap,true)});` +
  `document.addEventListener('submit',function(e){e.preventDefault();e.stopPropagation()},true);` +
  `path()})();</script>`;

/** The page with `script` put first in its head (at the very start when it has none). */
function putFirst(html: string, script: string): string {
  const m = /<head[^>]*>/i.exec(html);
  return m ? html.slice(0, m.index + m[0].length) + script + html.slice(m.index + m[0].length) : script + html;
}

/** The page with the pointing helper put in; the page as it was when it does not ask for it. */
export function showPage(html: string, flags: ShowFlags, frame?: string): string {
  if (!flags.point || !frame) return html;
  return putFirst(html, POINT_SCRIPT(frame));
}

/** The text a script element holds, as a policy hashes it. */
const scriptHash = (script: string): string =>
  `'sha256-${crypto.createHash("sha256").update(script.replace(/^<script[^>]*>/, "").replace(/<\/script>$/, "")).digest("base64")}'`;

/**
 * A policy that restricts scripts also lets the scripts Hydor put in a page run (by their hashes, nothing wider), and one that
 * restricts connections lets the page reach its own state address `connect` (a host with its path, no scheme: the page's own).
 * Each policy of a header is looked at on its own (a page must pass all of them). The directive that governs a script element is
 * script-src-elem, else script-src, else default-src; one that already allows 'unsafe-inline' with no nonce, hash or
 * 'strict-dynamic' is left alone, since a hash beside it would turn 'unsafe-inline' off. The directive that governs connections is
 * connect-src, else default-src (which then gets a connect-src of its own, so that nothing else it covers is widened).
 */
export function allowInlineScripts(csp: string, hashes: string[], connect?: string): string {
  return csp
    .split(",")
    .map((policy) => {
      const ds = policy.split(";").map((d) => d.trim()).filter(Boolean);
      const find = (name: string) => ds.findIndex((d) => d.split(/\s+/)[0].toLowerCase() === name);
      const srcs = (i: number) => ds[i].split(/\s+/).slice(1);
      const lower = (a: string[]) => a.map((x) => x.toLowerCase());
      const dflt = find("default-src");
      // What default-src allows before any hash is put in it (a connect-src of its own starts from that).
      const dfltSources = dflt >= 0 ? srcs(dflt) : [];
      if (hashes.length) {
        const i = [find("script-src-elem"), find("script-src"), dflt].find((x) => x >= 0);
        if (i !== undefined) {
          const s = srcs(i);
          const l = lower(s);
          const keepsInline = l.includes("'unsafe-inline'") && !l.some((x) => /^'(nonce-|sha(256|384|512)-|strict-dynamic')/.test(x));
          if (!keepsInline) {
            const add = hashes.filter((h) => !s.includes(h));
            ds[i] = [ds[i].split(/\s+/)[0], ...s.filter((x) => x.toLowerCase() !== "'none'"), ...add].join(" ");
          }
        }
      }
      if (connect) {
        const c = find("connect-src");
        const i = c >= 0 ? c : dflt;
        if (i >= 0) {
          const s = c >= 0 ? srcs(c) : dfltSources;
          const l = lower(s);
          const open = l.some((x) => x === "'self'" || x === "*" || x === "http:" || x === "https:" || x === connect.toLowerCase());
          if (!open) {
            const next = [...s.filter((x) => x.toLowerCase() !== "'none'"), connect];
            if (c >= 0) ds[c] = ["connect-src", ...next].join(" ");
            else ds.push(["connect-src", ...next].join(" "));
          }
        }
      }
      return ds.join("; ");
    })
    .join(", ");
}

/** A policy that has a script-src also lets the pointing helper it was given run (by its hash, nothing wider). */
export function allowShownScripts(csp: string, flags: ShowFlags, frame?: string): string {
  if (!flags.point || !frame) return csp;
  return allowInlineScripts(csp, [scriptHash(POINT_SCRIPT(frame))]);
}

// ---- what a page keeps on the path way -------------------------------------------------------------------------------------------
//
// A page on the path way has an origin of no one (the sandbox): the browser keeps no cookie for it and gives it no localStorage,
// sessionStorage or document.cookie (they throw). So the proxy keeps them for it, in memory, one set for each app and person (so it
// outlives the 12-hour token and each new Preview address), never in the browser:
//  - the app's cookies: its Set-Cookie lines go into a jar (expiry, Max-Age, Path and HttpOnly kept; Domain, SameSite, Secure and
//    Partitioned ignored; never the reserved names), and each request and socket the page makes goes to the app with the jar's
//    cookies for its path in place of whatever Cookie header the browser sent (which can only be the host's, never the app's);
//  - localStorage, as the page last sent it;
//  - a small script put first in each page's head that, only where the browser's own throw, gives the page localStorage,
//    sessionStorage (in memory, for the page) and document.cookie, and sends their changes to `<prefix>/__hydor/state`,
//    which the proxy answers itself (never the app).

export interface StateCaps {
  /** Cookies in one jar. */
  cookies: number;
  /** Bytes (names, values and paths) in one jar. */
  bytes: number;
  /** One cookie, as browsers do. */
  cookieBytes: number;
  /** Jars, and sets of localStorage: the least recently used goes first. */
  jars: number;
  /** One set of localStorage (its keys and values), as the page sends it. */
  localBytes: number;
}
// A jar's cookies go to the app in one header: 8 KB keeps it, with the request's other headers, well under the 16 KB a Node server takes.
export const STATE_CAPS: StateCaps = { cookies: 50, bytes: 8 << 10, cookieBytes: 4096, jars: 500, localBytes: 1 << 20 };

interface JarCookie {
  name: string;
  value: string;
  path: string;
  /** When it ends (ms), or none (until the proxy stops). */
  exp: number | null;
  httpOnly: boolean;
  /** When it was last set: the oldest goes first when a jar is full. */
  seq: number;
}

/** The directory of a path, as a browser takes a cookie's default Path. */
const defaultPathOf = (p: string): string => {
  const i = p.lastIndexOf("/");
  return p.startsWith("/") && i > 0 ? p.slice(0, i) : "/";
};
/** Whether a cookie of path `cp` goes with a request for path `rp`. */
const pathMatches = (cp: string, rp: string): boolean => rp === cp || (rp.startsWith(cp) && (cp.endsWith("/") || rp[cp.length] === "/"));
/** The path of an address (no query). */
const pathOnly = (u: string): string => {
  const p = u.split(/[?#]/, 1)[0];
  return p.startsWith("/") ? p : "/";
};

/** A cookie line (`name=value; Path=/; Max-Age=60`) as the jar keeps it (`gone`: it ends it), or null when there is nothing to keep. */
function parseCookie(line: string, requestPath: string, now: number): { name: string; value: string; path: string; exp: number | null; httpOnly: boolean; gone: boolean } | null {
  const parts = line.split(";");
  const first = parts[0];
  const eq = first.indexOf("=");
  if (eq <= 0) return null;
  const name = first.slice(0, eq).trim();
  const value = first.slice(eq + 1).trim();
  if (!name || /[\s\u0000-\u001f\u007f()<>@,;:\\"/[\]?={}]/.test(name) || /[\u0000-\u001f\u007f]/.test(value) || RESERVED_COOKIES.has(name)) return null;
  let path = defaultPathOf(requestPath);
  let maxAge: number | null = null;
  let expires: number | null = null;
  let httpOnly = false;
  for (const a of parts.slice(1)) {
    const i = a.indexOf("=");
    const k = (i < 0 ? a : a.slice(0, i)).trim().toLowerCase();
    const v = i < 0 ? "" : a.slice(i + 1).trim();
    if (k === "path" && v.startsWith("/")) path = v;
    else if (k === "max-age" && /^-?\d+$/.test(v)) maxAge = Number(v);
    else if (k === "expires") {
      const t = Date.parse(v);
      if (!Number.isNaN(t)) expires = t;
    } else if (k === "httponly") httpOnly = true;
  }
  const exp = maxAge !== null ? now + maxAge * 1000 : expires;
  return { name, value, path, exp, httpOnly, gone: maxAge !== null ? maxAge <= 0 : exp !== null && exp <= now };
}

/** A map that drops its least recently used entry beyond `max`. */
class Lru<V> {
  private m = new Map<string, V>();
  constructor(private max: number) {}
  get(k: string): V | undefined {
    const v = this.m.get(k);
    if (v !== undefined) {
      this.m.delete(k);
      this.m.set(k, v);
    }
    return v;
  }
  set(k: string, v: V): void {
    this.m.delete(k);
    this.m.set(k, v);
    while (this.m.size > this.max) this.m.delete(this.m.keys().next().value as string);
  }
  delete(k: string): void {
    this.m.delete(k);
  }
  get size(): number {
    return this.m.size;
  }
}

/** What the proxy keeps for pages on the path way: cookie jars and localStorage, one each per key (an app and a person). */
export function createPageState(caps: StateCaps = STATE_CAPS, clock: () => number = Date.now) {
  const jars = new Lru<Map<string, JarCookie>>(caps.jars);
  const locals = new Lru<Record<string, string>>(caps.jars);
  let seq = 0;
  const size = (c: JarCookie) => Buffer.byteLength(c.name) + Buffer.byteLength(c.value) + Buffer.byteLength(c.path);
  const live = (jar: Map<string, JarCookie>): JarCookie[] => {
    const now = clock();
    for (const [k, c] of jar) if (c.exp !== null && c.exp <= now) jar.delete(k);
    return [...jar.values()];
  };
  return {
    /**
     * Keeps cookie lines as a browser would. `requestPath` is the app-side path they came for (their default Path). From the page
     * itself (document.cookie) a cookie is never HttpOnly and never takes the place of one that is.
     */
    setCookies(key: string, lines: readonly string[] | undefined, requestPath: string, fromPage = false): void {
      if (!lines?.length) return;
      const now = clock();
      let jar = jars.get(key);
      for (const line of lines) {
        const c = parseCookie(line, requestPath, now);
        if (!c) continue;
        const id = `${c.name}\0${c.path}`;
        if (c.gone) {
          if (jar && !(fromPage && jar.get(id)?.httpOnly)) jar.delete(id);
          continue;
        }
        if (Buffer.byteLength(c.name) + Buffer.byteLength(c.value) > caps.cookieBytes) continue;
        if (!jar) jars.set(key, (jar = new Map()));
        if (fromPage && jar.get(id)?.httpOnly) continue;
        jar.delete(id);
        jar.set(id, { name: c.name, value: c.value, path: c.path, exp: c.exp, httpOnly: fromPage ? false : c.httpOnly, seq: ++seq });
        // Over the caps: the oldest go first.
        let all = live(jar);
        let bytes = all.reduce((n, x) => n + size(x), 0);
        while (all.length > caps.cookies || bytes > caps.bytes) {
          const oldest = all.reduce((a, b) => (a.seq <= b.seq ? a : b));
          jar.delete(`${oldest.name}\0${oldest.path}`);
          all = all.filter((x) => x !== oldest);
          bytes -= size(oldest);
        }
      }
      if (jar && !jar.size) jars.delete(key);
    },
    /** The Cookie header for a request to `requestPath` (longer paths first, then the older), or "". */
    cookieHeader(key: string, requestPath: string): string {
      const jar = jars.get(key);
      if (!jar) return "";
      return live(jar)
        .filter((c) => pathMatches(c.path, requestPath))
        .sort((a, b) => b.path.length - a.path.length || a.seq - b.seq)
        .map((c) => `${c.name}=${c.value}`)
        .join("; ");
    },
    /** What document.cookie shows a page at `requestPath`: the cookies it may read (not HttpOnly), as [name, value, end in ms or 0]. */
    pageCookies(key: string, requestPath: string): [string, string, number][] {
      const jar = jars.get(key);
      if (!jar) return [];
      return live(jar)
        .filter((c) => !c.httpOnly && pathMatches(c.path, requestPath))
        .sort((a, b) => b.path.length - a.path.length || a.seq - b.seq)
        .map((c) => [c.name, c.value, c.exp ?? 0]);
    },
    getLocal: (key: string): Record<string, string> => locals.get(key) ?? {},
    /** Replaces what the page keeps in localStorage; false when it is too big. */
    setLocal(key: string, items: Record<string, string>): boolean {
      let n = 0;
      for (const [k, v] of Object.entries(items)) n += Buffer.byteLength(k) + Buffer.byteLength(v);
      if (n > caps.localBytes) return false;
      if (Object.keys(items).length) locals.set(key, { ...items });
      else locals.delete(key);
      return true;
    },
    sizes: () => ({ jars: jars.size, locals: locals.size }),
  };
}
export type PageState = ReturnType<typeof createPageState>;

/** The state script's code: `C` is its config (below). It acts only where the browser's own storage and cookie throw. */
const STATE_CODE =
  `(function(){var W=window,D=document,U=C.p+"/__hydor/state",T=0,LS;` +
  `function bad(f){try{f();return 0}catch(e){return 1}}` +
  `function send(b){try{fetch(U,{method:"POST",keepalive:true,body:JSON.stringify(b)})}catch(e){}}` +
  `function mk(init,on){var d=Object.create(null),k;for(k in init)d[k]=String(init[k]);` +
  `var a={getItem:function(k){k=String(k);return k in d?d[k]:null},setItem:function(k,v){d[String(k)]=String(v);on()},` +
  `removeItem:function(k){delete d[String(k)];on()},clear:function(){for(var k in d)delete d[k];on()},` +
  `key:function(i){var s=Object.keys(d);return i>=0&&i<s.length?s[i]:null}};` +
  `return[new Proxy(a,{get:function(t,k){return k==="length"?Object.keys(d).length:k in a?a[k]:typeof k==="string"&&k in d?d[k]:undefined},` +
  `set:function(t,k,v){if(typeof k==="string"){d[k]=String(v);on()}return true},deleteProperty:function(t,k){delete d[k];on();return true},` +
  `has:function(t,k){return k in a||k in d},ownKeys:function(){return Object.keys(d)},` +
  `getOwnPropertyDescriptor:function(t,k){return k in d?{value:d[k],writable:true,enumerable:true,configurable:true}:undefined}}),d]}` +
  `function def(o,n,v){Object.defineProperty(o,n,{get:function(){return v},configurable:true})}` +
  `if(bad(function(){return W.localStorage})){var l=mk(C.l,function(){clearTimeout(T);T=setTimeout(flush,200)});LS=l[1];def(W,"localStorage",l[0])}` +
  `function flush(){if(T){clearTimeout(T);T=0;send({local:LS})}}` +
  `addEventListener("pagehide",flush);` +
  `if(bad(function(){return W.sessionStorage}))def(W,"sessionStorage",mk({},function(){})[0]);` +
  `if(bad(function(){return D.cookie})){var K={};C.c.forEach(function(c){K[c[0]]=[c[1],c[2]]});` +
  `Object.defineProperty(D,"cookie",{configurable:true,get:function(){var o=[],t=Date.now(),n;for(n in K)if(!K[n][1]||K[n][1]>t)o.push(n+"="+K[n][0]);return o.join("; ")},` +
  `set:function(s){s=String(s);var p=s.split(";"),i=p[0].indexOf("=");if(i<=0)return;var n=p[0].slice(0,i).trim(),v=p[0].slice(i+1).trim(),m=null,e=null,j,a,q;` +
  `for(j=1;j<p.length;j++){a=p[j].split("=");q=a[0].trim().toLowerCase();if(q==="max-age")m=parseInt(a[1],10);else if(q==="expires"&&!isNaN(Date.parse(a.slice(1).join("="))))e=Date.parse(a.slice(1).join("="))}` +
  `if(m!==null&&!isNaN(m))e=Date.now()+m*1000;if(m!==null&&m<=0||e!==null&&e<=Date.now())delete K[n];else K[n]=[v,e||0];send({cookie:s,path:C.d})}})}` +
  `})();`;

/** `json` for the inside of a script element: no `</script>`, `<!--` or line separator can end or break it. */
const jsonForScript = (v: unknown): string =>
  JSON.stringify(v).replace(/[<>&\u2028\u2029]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);

/** The state script for a page: what the proxy keeps for it, and where it sends changes (`prefix`/__hydor/state). */
export function stateScript(prefix: string, local: Record<string, string>, cookies: [string, string, number][], pagePath: string): string {
  const cfg = { p: prefix, l: local, c: cookies, d: defaultPathOf(pagePath) };
  return `<script data-hydor-state>var C=${jsonForScript(cfg)};${STATE_CODE}</script>`;
}

/** The address a page is allowed to send state to under a policy's connect-src: the host it is at and the path. */
const stateSource = (host: string, prefix: string) => `${host}${prefix}/__hydor/state`;

/** The most of a page the proxy reads to change it (8 MB). */
const PAGE_MAX = 8 << 20;
/** The most a page may send to be kept at once (1 MB, with room for its framing). */
const STATE_BODY_MAX = (1 << 20) + 4096;

/** A page read whole, or when it is bigger than `max`: what was read, and the rest still to come. */
async function readPage(stream: NodeJS.ReadableStream, max: number): Promise<{ chunks: Buffer[]; rest?: AsyncIterable<Buffer> }> {
  const it = (stream as AsyncIterable<Buffer>)[Symbol.asyncIterator]();
  const chunks: Buffer[] = [];
  let size = 0;
  for (;;) {
    const n = await it.next();
    if (n.done) return { chunks };
    chunks.push(n.value);
    size += n.value.length;
    if (size > max) return { chunks, rest: { [Symbol.asyncIterator]: () => it } };
  }
}

function readToken(
  raw: string,
  kind: "webapp-open" | "webapp-session",
): { app: string; person: Person; e: number; fa?: string; flags: ShowFlags } | null {
  const t = readLink<OpenToken & Record<string, unknown>>(raw);
  if (t?.k !== kind || typeof t.app !== "string") return null;
  const person = cleanPerson(t.p);
  const fa = frameOrigin(t.fa);
  // Pointing talks to the page that shows the app in a frame, and to nothing else: without that page's origin it is not on.
  const point = t.pt === true && !!fa;
  return person ? { app: t.app, person, e: t.e, ...(fa ? { fa } : {}), flags: point ? { point } : {} } : null;
}

/**
 * A stream that puts `to` where the base path `from` is named, also where it is split between two chunks (ASCII only).
 * An address names it with its slash (`/base/assets/x.js`); the router's own setting has it without (`basepath: "base"`):
 * the first becomes `to`, the second `to` without its slash.
 */
function replacing(from: string, to: string): Transform {
  const bare = from.replace(/^\/+/, "");
  const slashed = `/${bare}`;
  const forms = [Buffer.from(slashed, "latin1"), Buffer.from(bare, "latin1")];
  const bareTo = to.replace(/^\/+/, "");
  const re = new RegExp(
    `(/?)${bare.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
    "g",
  );
  let carry = Buffer.alloc(0);
  const swap = (b: Buffer) =>
    Buffer.from(
      b
        .toString("latin1")
        .replace(re, (_m, slash: string) => (slash ? to : bareTo)),
      "latin1",
    );
  return new Transform({
    transform(chunk: Buffer, _enc, done) {
      const b = Buffer.concat([carry, chunk]);
      // Keep back the end if it could be the start of the text sought.
      let keep = 0;
      for (let n = Math.min(slashed.length, b.length); n > 0 && !keep; n--) {
        const tail = b.subarray(b.length - n);
        if (forms.some((f) => n < f.length && tail.equals(f.subarray(0, n))))
          keep = n;
      }
      carry = Buffer.from(b.subarray(b.length - keep));
      done(null, swap(b.subarray(0, b.length - keep)));
    },
    flush(done) {
      done(null, swap(carry));
    },
  });
}

/** The kinds of answer that name the app's own addresses. */
const TEXTUAL =
  /^(text\/|application\/(javascript|x-javascript|ecmascript|json|manifest\+json|xml|xhtml\+xml|.+\+json|.+\+xml)|image\/svg\+xml)/i;

/** A path inside the app to open at (not another site). */
const safePath = (p: string | null) =>
  p && p.startsWith("/") && !p.startsWith("//") && !p.includes("\\") ? p : "/";

// Entry links work once: each is kept here until it would have expired anyway.
const used = new Map<string, number>();
setInterval(() => {
  for (const [k, e] of used) if (e < Date.now()) used.delete(k);
}, 60_000).unref();

const page = (res: http.ServerResponse, code: number, text: string) => {
  res.writeHead(code, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(text);
};
const NOT_FROM_HYDOR = "Open this app from Hydor.";

// When Hydor's page shows the app in a frame and the browser keeps the session cookie from it (Safari, Firefox with strict
// settings: a cookie of a site inside another site's frame), the app's first page answers "open this from Hydor" with no cookie to
// go by. A frame is told from a tab by the browser's own Sec-Fetch-Dest header, and its page then says so to the page around it
// with a message that carries nothing: the Preview shows "This browser does not allow the preview here" with a tab of its own.
// (Asking from outside the frame is not possible: a cookie the browser refuses leaves nothing to read, and the frame's own page
// is the one place that sees the refusal.) The page's one script is allowed by its hash and nothing else.
export const FRAME_MESSAGE = "hydor-webapp-needs-open";
const FRAME_SCRIPT = `try{parent.postMessage({hydor:${JSON.stringify(FRAME_MESSAGE)}},"*")}catch(e){}`;
const FRAME_PAGE = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${NOT_FROM_HYDOR}</title><body style="font:15px system-ui,sans-serif;margin:2rem;color:#777"><p>${NOT_FROM_HYDOR}</p><script>${FRAME_SCRIPT}</script>`;
// Both pages may be at an address of Hydor's own (the path way carried by Hydor's server): each has an origin of no one, as an app's has.
const FRAME_CSP = `default-src 'none'; style-src 'unsafe-inline'; script-src 'sha256-${crypto.createHash("sha256").update(FRAME_SCRIPT).digest("base64")}'; sandbox allow-scripts`;

// A person who opens the app's address by itself (a bookmark, a link someone sent) is told in a page that fits a phone, not in a line of
// plain text in the corner of an empty screen. Only a browser's own page load (Sec-Fetch-Dest: document) gets it; the rest get the plain words.
const NAV_PAGE = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark light"><title>${NOT_FROM_HYDOR}</title><body style="font:19px/1.5 system-ui,sans-serif;margin:0;min-height:100vh;display:grid;place-items:center;padding:2rem;text-align:center"><div><p style="margin:0 0 .5rem;font-size:22px">${NOT_FROM_HYDOR}</p><p style="margin:0;font-size:16px;opacity:.7">Find it on Hydor’s Apps page and tap Open.</p></div>`;
const NAV_CSP = "default-src 'none'; style-src 'unsafe-inline'; sandbox";

/** The answer for a request that has no way in: plain words, and for a frame (the browser says so) a page that tells the page around it. */
const noWayIn = (req: http.IncomingMessage, res: http.ServerResponse, code: number, text: string) => {
  if (text === NOT_FROM_HYDOR && code === 403 && req.headers["sec-fetch-dest"] === "document") {
    res.writeHead(code, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": NAV_CSP,
    });
    return res.end(NAV_PAGE);
  }
  if (text === NOT_FROM_HYDOR && code === 403 && req.headers["sec-fetch-dest"] === "iframe") {
    res.writeHead(code, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": FRAME_CSP,
    });
    return res.end(FRAME_PAGE);
  }
  return page(res, code, text);
};
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Expose-Headers": "*",
};

const isHttps = (req: http.IncomingMessage) =>
  req.headers["x-forwarded-proto"] === "https" ||
  String(req.headers["cf-visitor"] ?? "").includes("https");

/** Which way in a request is, and for whom: the app and the person, or why not. */
interface Resolved {
  app: HostedApp;
  person: Person;
  /** The path (with its query) the app is asked for. */
  url: string;
  /** For the token path way: where the app is kept, /w/<token>. */
  prefix?: string;
  /** The session was opened for Hydor's own page to show the app in a frame: that page's origin. */
  frame?: string;
  /** The look the pages are shown in, and whether they get the pointing helper. */
  flags: ShowFlags;
}

/** Whether a request is on the path way (`/w/<token>/…`). */
export const onPathWay = (url: string | undefined): boolean => typeof url === "string" && url.startsWith("/w/");

/**
 * Hydor's own server carries the path way to the apps' server: through a tunnel with one hostname, Hydor's own address is the only one
 * a browser has, so an app is at `<Hydor's address>/w/<token>/…` (its Preview frames it there). Its requests and sockets are handed over
 * as they come, before anything of Hydor's (its headers, its sign-in, its pages) sees them; the apps' server checks the token and keeps
 * every page in a sandbox, with an origin of no one, so an app there can reach nothing of Hydor's. With web apps off, nothing is.
 */
export function carryPathWay(server: http.Server, proxy: () => AppsProxy | null): void {
  const emit = server.emit.bind(server) as (event: string | symbol, ...args: unknown[]) => boolean;
  server.emit = ((event: string | symbol, ...args: unknown[]) => {
    if (event === "request" || event === "upgrade") {
      const p = onPathWay((args[0] as http.IncomingMessage).url) ? proxy() : null;
      if (p) return p.server.emit(event, ...args);
    }
    return emit(event, ...args);
  }) as typeof server.emit;
}

export function createAppsProxy(o: AppsProxyOptions): AppsProxy {
  const host = o.host;
  /** Where each app's frame was last (only frames of Hydor's page are watched). */
  const lastPaths = new Map<string, string>();
  const domain = (o.domain ?? "").toLowerCase().replace(/^\.+|\.+$/g, "");
  /** What pages on the path way keep (cookies, localStorage): one set for each app and person. */
  const pageState = createPageState();
  const stateKey = (r: Resolved) => `${r.app.id}\0${r.person.id}`;

  /** The slug a Host header names (`<slug>.localhost`, `<slug>.<domain>`), if it names one. */
  const slugOf = (req: http.IncomingMessage): string | null => {
    const h = String(req.headers.host ?? "")
      .toLowerCase()
      .replace(/:\d+$/, "");
    for (const suffix of [".localhost", ...(domain ? [`.${domain}`] : [])]) {
      if (h.endsWith(suffix)) {
        const s = h.slice(0, -suffix.length);
        return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(s) ? s : null;
      }
    }
    return null;
  };

  const cookieOf = (req: http.IncomingMessage) => {
    const m = new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`).exec(
      String(req.headers.cookie ?? ""),
    );
    try {
      return m ? decodeURIComponent(m[1]) : "";
    } catch {
      return "";
    }
  };

  /** The way in a request takes. `code` says what to answer when there is none. */
  function resolve(
    req: http.IncomingMessage,
  ): Resolved | { code: number; text: string } {
    const raw = req.url ?? "/";
    const url = new URL(raw, "http://apps");
    const slug = slugOf(req);
    // 3. A path with a token (on a host that names no app).
    if (!slug && url.pathname.startsWith("/w/")) {
      const rest = url.pathname.slice(3);
      const slash = rest.indexOf("/");
      const token = slash < 0 ? rest : rest.slice(0, slash);
      const s = readToken(token, "webapp-session");
      const app = s && o.apps.byId(s.app);
      if (!s) return { code: 403, text: NOT_FROM_HYDOR };
      if (!app) return { code: 404, text: "This app is not here any more." };
      const inner = (slash < 0 ? "/" : rest.slice(slash)) + url.search;
      return { app, person: s.person, url: inner, prefix: `/w/${token}`, ...(s.fa ? { frame: s.fa } : {}), flags: s.flags };
    }
    // 1. The session cookie, on the hostname of the app it is for. A host that names no app is no way in.
    if (!slug) return { code: 403, text: NOT_FROM_HYDOR };
    const s = readToken(cookieOf(req), "webapp-session");
    if (!s) return { code: 403, text: NOT_FROM_HYDOR };
    const named = o.apps.bySlug(slug);
    // A session for one app is no way into another, whatever host it is sent to.
    if (!named || named.id !== s.app) return { code: 403, text: NOT_FROM_HYDOR };
    return { app: named, person: s.person, url: raw, ...(s.fa ? { frame: s.fa } : {}), flags: s.flags };
  }

  /** The path an app built for a base lives under (`app.base`: Vite's `base`, which TanStack Start also uses as its router's basepath), or none. */
  const baseOf = (app: HostedApp) => (app.base ?? "").replace(/\/+$/, "");
  /** The path the app is asked for. */
  const upstreamPath = (r: Resolved) => baseOf(r.app) + r.url;
  /** An address the app gave (a Location) as the browser should have it. */
  const outside = (loc: string, r: Resolved, port: number): string => {
    const base = baseOf(r.app);
    let l = loc.startsWith(`http://localhost:${port}/`)
      ? loc.slice(`http://localhost:${port}`.length)
      : loc;
    if (!l.startsWith("/") || l.startsWith("//")) return loc;
    if (
      base &&
      (l === base || l.startsWith(`${base}/`) || l.startsWith(`${base}?`))
    )
      l = l.slice(base.length) || "/";
    return (r.prefix ?? "") + l;
  };

  /** Whether an Origin header names the very host the request came to (the app's own page). */
  const ownOrigin = (origin: string, req: http.IncomingMessage): boolean => {
    try {
      return new URL(origin).host.toLowerCase() === String(req.headers.host ?? "").toLowerCase();
    } catch {
      return false;
    }
  };

  /**
   * The cookies of an app that keeps accounts of its own, shown in a frame of Hydor's page (its Preview): to a browser that is a third party, which a
   * cookie reaches only as a partitioned one (kept for that page's site alone), as the proxy's own session cookie is.
   */
  const framed = (cookie: string): string => `${cookie.replace(/;\s*(samesite=[^;]*|secure|partitioned)(?=;|$)/gi, "")}; SameSite=None; Secure; Partitioned`;

  /** The request's headers as the app should see them. */
  function forwarded(
    req: http.IncomingMessage,
    r: Resolved,
    port: number,
  ): Record<string, string | string[]> {
    const out: Record<string, string | string[]> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (v === undefined) continue;
      // Whoever asks for the person's header, also as x_hydor_person (some servers read an underscore as a dash): never the browser's.
      if (k.replace(/_/g, "-") === PERSON_HEADER) continue;
      // What the browser says about where it is: the app is told where it is by Host, and the prefix below.
      if (
        k === "x-forwarded-host" ||
        k === "forwarded" ||
        k === "x-forwarded-prefix"
      )
        continue;
      // Nor who it says it is: an app that believes X-Forwarded-For would take a browser's word.
      if (k === "x-forwarded-for" || k === "x-real-ip") continue;
      out[k] = v;
    }
    // The one who connected to this server (a reverse proxy or tunnel in front of it, or the browser itself) is the only address known.
    if (req.socket.remoteAddress) out["x-forwarded-for"] = req.socket.remoteAddress.replace(/^::ffff:/, "");
    const here = `http://localhost:${port}`;
    out.host = `localhost:${port}`;
    // The app listens at localhost:<port> and is reached at an address of its own, so what a browser says of its own page
    // (Origin, Referer) is renamed to what the app sees itself as. Only of its own page: another site's stays as the
    // browser said it, so that the app's own check that a change came from its pages still holds. Its own page is the one
    // at the very host the request came to (its hostname); on the path way it is a sandboxed page, whose origin is
    // "null", and the token in the address is what shows it.
    const origin = typeof out.origin === "string" ? out.origin : undefined;
    const fromItself = origin !== undefined && (r.prefix ? origin === "null" : ownOrigin(origin, req));
    if (fromItself) out.origin = here;
    // Pages that are rewritten come as they are, not compressed (the path way's pages get the state script put in).
    if (baseOf(r.app) || r.flags.point || r.prefix) out["accept-encoding"] = "identity";
    // A page there carries what Hydor keeps for this person, so it is never "not modified" (the browser's copy would be stale).
    if (r.prefix && /text\/html/i.test(String(out.accept ?? ""))) {
      delete out["if-none-match"];
      delete out["if-modified-since"];
    }
    // A page on the path way has an origin of no one, so a browser calls everything it asks for cross-site, and an app
    // that guards against that (TanStack Start's server functions do: 403 for anything not same-origin) would refuse
    // its own page. Said same-origin only for that page: its "null" origin, or a plain read with no Origin at all.
    if (r.prefix && out["sec-fetch-site"] && (fromItself || (origin === undefined && (req.method === "GET" || req.method === "HEAD"))))
      out["sec-fetch-site"] = "same-origin";
    if (typeof out.referer === "string") {
      try {
        const u = new URL(out.referer);
        const onPath = !!r.prefix && u.pathname.startsWith(`${r.prefix}/`);
        if (onPath || ownOrigin(out.referer, req))
          out.referer = here + baseOf(r.app) + (onPath ? u.pathname.slice(r.prefix!.length) || "/" : u.pathname) + u.search;
      } catch {
        delete out.referer;
      }
    }
    // On the path way the browser keeps nothing of the app's (what it sends is the host's own, Hydor's or a tunnel's): the app gets
    // its jar's cookies for the path in their place.
    const jar = r.prefix
      ? pageState.cookieHeader(stateKey(r), pathOnly(upstreamPath(r)))
      : String(req.headers.cookie ?? "")
          .split(/;\s*/)
          .filter((c) => c && !RESERVED_COOKIES.has(c.split("=")[0].trim()))
          .join("; ");
    if (jar) out.cookie = jar;
    else delete out.cookie;
    // Fresh for this request, for this session's person.
    out[PERSON_HEADER] = signPerson(r.person, host.secret(r.app.id));
    if (r.prefix) out["x-forwarded-prefix"] = r.prefix;
    return out;
  }

  /** The app's Set-Cookie lines: not the reserved names, and kept to the host that set them (no Domain). */
  const cookiesFromApp = (set: string[] | undefined): string[] =>
    (set ?? [])
      .filter((c) => !RESERVED_COOKIES.has(c.split("=")[0].trim()))
      .map((c) => c.replace(/;\s*domain=[^;]*/gi, ""));

  /** `POST <prefix>/__hydor/state`: a page's localStorage (all of it) and cookie changes, from the state script. */
  const answerState = (req: http.IncomingMessage, res: http.ServerResponse, r: Resolved) => {
    const reply = (code: number, text?: string) => {
      res.writeHead(code, { ...CORS, "Cache-Control": "no-store", ...(text ? { "Content-Type": "text/plain; charset=utf-8" } : {}), ...(code === 413 ? { Connection: "close" } : {}) });
      res.end(text);
    };
    if (req.method !== "POST") return reply(405, "Send a POST.");
    const chunks: Buffer[] = [];
    let size = 0;
    let big = false;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > STATE_BODY_MAX) {
        if (!big) {
          big = true;
          res.once("finish", () => req.destroy());
          reply(413, "That is too much to keep.");
        }
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      if (big) return;
      let body: { local?: unknown; cookie?: unknown; path?: unknown } | null = null;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {}
      if (!body || typeof body !== "object" || Array.isArray(body)) return reply(400, "Send JSON.");
      const key = stateKey(r);
      const { local, cookie } = body;
      if (local === undefined && cookie === undefined) return reply(400, "Nothing to keep.");
      if (local !== undefined) {
        if (!local || typeof local !== "object" || Array.isArray(local) || !Object.values(local).every((v) => typeof v === "string")) return reply(400, "local is an object of strings.");
        if (!pageState.setLocal(key, local as Record<string, string>)) return reply(413, "That is too much to keep.");
      }
      if (cookie !== undefined) {
        if (typeof cookie !== "string" || cookie.length > 8192) return reply(400, "cookie is one cookie string.");
        const at = typeof body.path === "string" && body.path.startsWith("/") && body.path.length < 2000 ? body.path : "/";
        // Its default Path is the page's directory: asked for as a request to `at/x` would be.
        pageState.setCookies(key, [cookie], at.endsWith("/") ? `${at}x` : `${at}/x`, true);
      }
      reply(204);
    });
    req.on("error", () => res.destroy());
  };

  /** Upgraded connections: the server does not track them once they are upgraded. */
  const sockets = new Set<Duplex>();
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://apps");
    if (url.pathname === "/__hydor/ping") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store",
      });
      return res.end();
    }
    // Entry: a link Hydor signed names the app and the person; it works once and sets the session for this host.
    if (url.pathname === "/__hydor/open") {
      const raw = url.searchParams.get("t") ?? "";
      const t = readToken(raw, "webapp-open");
      if (!t || used.has(raw))
        return page(
          res,
          403,
          "This link has expired. Open the app again from Hydor.",
        );
      const app = o.apps.byId(t.app);
      if (!app) return page(res, 404, "This app is not here any more.");
      const slug = slugOf(req);
      // A link opens the app's own hostname and no other (a plain host has none: the path way needs no link).
      if (!slug || slug !== app.slug.toLowerCase())
        return page(res, 403, NOT_FROM_HYDOR);
      used.set(raw, t.e);
      const session = webappSession(app.id, t.person, SESSION_MS, t.fa, t.flags);
      // For a frame of Hydor's page (a site of its own, so this is a cookie of a third party): not sent with Lax, so it is a
      // partitioned one (kept for that page's site only), which needs Secure (browsers allow it on localhost).
      const attrs = t.fa
        ? "SameSite=None; Secure; Partitioned"
        : `SameSite=Lax${isHttps(req) ? "; Secure" : ""}`;
      res.writeHead(302, {
        "Set-Cookie": `${SESSION_COOKIE}=${encodeURIComponent(session)}; Path=/; HttpOnly; ${attrs}; Max-Age=${SESSION_MS / 1000}`,
        Location: safePath(url.searchParams.get("to")),
        "Cache-Control": "no-store",
      });
      return res.end();
    }
    const r = resolve(req);
    if ("code" in r) return noWayIn(req, res, r.code, r.text);
    // /w/<token> without the slash: the page's own relative links need it.
    if (r.prefix && !url.pathname.slice(r.prefix.length)) {
      res.writeHead(308, {
        Location: `${r.prefix}/${url.search}`,
        "Cache-Control": "no-store",
      });
      return res.end();
    }
    // A page on the path way has an origin of no one (the sandbox): everything it asks for, scripts and fetches, is a
    // request across origins, and is let through. It carries no cookie, so the token in its address is its only key.
    if (
      r.prefix &&
      req.method === "OPTIONS" &&
      req.headers["access-control-request-method"]
    ) {
      res.writeHead(204, {
        ...CORS,
        "Access-Control-Allow-Methods": String(
          req.headers["access-control-request-method"],
        ),
        "Access-Control-Allow-Headers": String(
          req.headers["access-control-request-headers"] ?? "*",
        ),
        "Access-Control-Max-Age": "600",
        "Cache-Control": "no-store",
      });
      return res.end();
    }
    host.touch(r.app.id);
    // What the page keeps (its localStorage and cookies) is the proxy's to answer, never the app's.
    if (r.prefix && pathOnly(r.url) === "/__hydor/state") return answerState(req, res, r);
    if (r.frame) {
      const dest = String(req.headers["sec-fetch-dest"] ?? "");
      let seen: string | null = null;
      // On the path way the page's own address is under its prefix, and a page in its sandbox names no referer: its loads are what counts.
      if (req.method === "GET" && (dest === "iframe" || dest === "document")) seen = r.url;
      // A request the page makes by itself (a fetch, a server function) carries the page's own address as its referer. A font or
      // an image asked for by a stylesheet carries the stylesheet's, so only these count, and never an address that is a file.
      else if (!r.prefix && typeof req.headers.referer === "string" && (dest === "empty" || dest === "")) {
        try {
          const u = new URL(req.headers.referer);
          if (u.host === String(req.headers.host ?? "") && !u.pathname.startsWith("/__hydor") && !STATIC_FILE.test(u.pathname)) seen = u.pathname + u.search;
        } catch {}
      }
      if (seen && seen.startsWith("/") && !seen.startsWith("//") && seen.length < 2000) lastPaths.set(r.app.id, seen);
    }
    void host.ensure(r.app).then(
      (port) => {
        const up = http.request(
          {
            host: "127.0.0.1",
            port,
            method: req.method,
            path: upstreamPath(r),
            headers: forwarded(req, r, port),
          },
          (a) => {
            const headers: Record<string, string | string[] | undefined> = {
              ...a.headers,
            };
            delete headers["set-cookie"];
            // On the path way the app's cookies stay here, in the jar for this app and person; the browser is given none.
            if (r.prefix) pageState.setCookies(stateKey(r), a.headers["set-cookie"], pathOnly(upstreamPath(r)));
            const cookies = r.prefix
              ? []
              : cookiesFromApp(a.headers["set-cookie"]);
            const base = baseOf(r.app);
            if (cookies.length)
              headers["set-cookie"] = base
                ? cookies.map((c) => c.split(base).join(r.prefix ?? ""))
                : r.frame
                  ? cookies.map(framed)
                  : cookies;
            const loc = headers.location;
            if (typeof loc === "string")
              headers.location = outside(loc, r, port);
            if (r.frame) {
              // Hydor's own page shows this app in a frame: its policy lets that page (and no other) do so.
              const csp = headers["content-security-policy"];
              if (csp)
                headers["content-security-policy"] = (Array.isArray(csp) ? csp : [csp]).map((c) => allowFrameBy(c, r.frame!));
              delete headers["x-frame-options"];
            }
            if (r.prefix) {
              Object.assign(headers, CORS);
              // The app's own policy as it stands (opened for a frame, it lets Hydor's page frame it), and the sandbox beside it.
              const csp = headers["content-security-policy"];
              // Shown in Hydor's page: that page, and no other, may frame it.
              const own = r.frame ? `${SANDBOX_POLICY}; frame-ancestors ${r.frame}` : SANDBOX_POLICY;
              headers["content-security-policy"] = csp
                ? [...(Array.isArray(csp) ? csp : [csp]), own]
                : own;
            }
            // An app built for a base names it in its pages, scripts and styles: it is put as it is here.
            const rewrite =
              base &&
              TEXTUAL.test(String(a.headers["content-type"] ?? "")) &&
              !a.headers["content-encoding"];
            // A page that is to get the pointing helper (the app's frame in Hydor's page) or the state script (the path way): read whole.
            const dest = String(req.headers["sec-fetch-dest"] ?? "");
            // The pointing helper is only for a frame of Hydor's page.
            const flags: ShowFlags = r.flags.point && dest === "iframe" ? { point: true } : {};
            const html =
              req.method === "GET" &&
              String(a.headers["content-type"] ?? "").includes("text/html") &&
              !a.headers["content-encoding"];
            const shown = html && !!flags.point;
            const stateful = html && !!r.prefix && a.statusCode === 200;
            if (shown || stateful) {
              const inner: NodeJS.ReadableStream = rewrite ? a.pipe(replacing(base, r.prefix ?? "")) : a;
              readPage(inner, PAGE_MAX)
                .then(async (got) => {
                  if (got.rest) {
                    // Too big to change: it goes on as it is (the pointing helper needs the page, so there it is an answer).
                    if (shown) return page(res, 502, "The page is too big to show here.");
                    if (rewrite) delete headers["content-length"];
                    res.writeHead(a.statusCode ?? 502, headers);
                    for (const c of got.chunks) if (!res.write(c)) await new Promise((ok) => res.once("drain", ok));
                    for await (const c of got.rest) if (!res.write(c)) await new Promise((ok) => res.once("drain", ok));
                    return void res.end();
                  }
                  let text = showPage(Buffer.concat(got.chunks).toString("utf8"), flags, r.frame);
                  const hashes = shown ? [scriptHash(POINT_SCRIPT(r.frame!))] : [];
                  let connect: string | undefined;
                  if (stateful) {
                    const key = stateKey(r);
                    const at = pathOnly(upstreamPath(r));
                    const script = stateScript(r.prefix!, pageState.getLocal(key), pageState.pageCookies(key, at), at);
                    text = putFirst(text, script);
                    hashes.push(scriptHash(script));
                    connect = stateSource(String(req.headers.host ?? ""), r.prefix!);
                    // Its inlined state is this person's own: no copy of it is kept or revalidated.
                    headers["cache-control"] = "no-store";
                    delete headers.etag;
                    delete headers["last-modified"];
                  }
                  const body = Buffer.from(text, "utf8");
                  headers["content-length"] = String(body.length);
                  delete headers["transfer-encoding"];
                  const csp = headers["content-security-policy"];
                  if (csp) headers["content-security-policy"] = (Array.isArray(csp) ? csp : [csp]).map((c) => allowInlineScripts(c, hashes, connect));
                  res.writeHead(a.statusCode ?? 502, headers);
                  res.end(body);
                })
                .catch(() => res.destroy());
              return;
            }
            if (rewrite) delete headers["content-length"];
            res.writeHead(a.statusCode ?? 502, headers);
            if (rewrite) a.pipe(replacing(base, r.prefix ?? "")).pipe(res);
            else a.pipe(res);
          },
        );
        up.on("error", () => {
          if (!res.headersSent) page(res, 502, "The app did not answer.");
          else res.destroy();
        });
        // A browser that goes away takes the request with it.
        res.on("close", () => {
          if (!res.writableEnded) up.destroy();
        });
        req.pipe(up);
      },
      (e: Error) =>
        page(
          res,
          502,
          `This app could not start. ${String(e.message).split("\n")[0]}`,
        ),
    );
  });

  // WebSockets (live updates): the handshake goes over with the same rewrites, then bytes flow both ways.
  server.on("upgrade", (req, socket, head) => {
    socket.on("error", () => socket.destroy());
    const r = resolve(req);
    if ("code" in r) {
      socket.end(
        `HTTP/1.1 ${r.code} ${r.code === 404 ? "Not Found" : "Forbidden"}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`,
      );
      return;
    }
    host.touch(r.app.id);
    void host.ensure(r.app).then(
      (port) => {
        if (socket.destroyed) return;
        const up = net.connect({ host: "127.0.0.1", port }, () => {
          const lines = [
            `${req.method} ${upstreamPath(r)} HTTP/${req.httpVersion}`,
          ];
          for (const [k, v] of Object.entries(forwarded(req, r, port)))
            for (const x of Array.isArray(v) ? v : [v])
              lines.push(`${k}: ${x}`);
          up.write(`${lines.join("\r\n")}\r\n\r\n`);
          if (head.length) up.write(head);
          socket.pipe(up).pipe(socket);
        });
        // An open socket is a use: the app is not stopped under it.
        const release = host.hold(r.app.id);
        sockets.add(socket);
        const done = () => {
          release();
          sockets.delete(socket);
          up.destroy();
          socket.destroy();
        };
        // Node keeps a socket half open when one side ends: a WebSocket that is over is over for both.
        socket.on("end", done);
        socket.on("close", done);
        up.on("end", () => socket.end());
        up.on("error", done);
        up.on("close", done);
      },
      () =>
        socket.end(
          "HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\nContent-Length: 0\r\n\r\n",
        ),
    );
  });

  return {
    lastPath: (appId) => lastPaths.get(appId),
    server,
    listen: () =>
      new Promise((resolveListen, reject) => {
        server.once("error", reject);
        server.listen(o.port, o.listen ?? "127.0.0.1", () => {
          server.off("error", reject);
          resolveListen((server.address() as net.AddressInfo).port);
        });
      }),
    close: () =>
      new Promise((resolveClose) => {
        server.closeAllConnections();
        for (const s of sockets) s.destroy();
        server.close(() => resolveClose());
      }),
  };
}
