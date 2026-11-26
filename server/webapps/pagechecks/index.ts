// Checks of the pages any web app serves, whatever it is built with: a running app's address in, lines a person can read out (a
// phone, reading, weight, what a page shows that it should not, broken things). The caller starts the app; this starts only a
// browser, and ends it. docs of each line: lines.ts; what a script cannot judge: NOT_COVERED.
import type { CheckLine } from "../../../shared/webapps.ts";
import { CheckBrowser, findBrowser } from "./browser.ts";
import type { FormFact } from "./in-page.ts";
import { type FormResult, type Gathered, judge, type Item, line, LINE_IDS, type LineId, type PageLine, where } from "./lines.ts";
import { acts, type Budget, cookiePairs, isFile, isSignInPath, pageKind, PUBLIC_BUDGET, scrub, type Secret, SECRET_MIN, SIGNED_IN_BUDGET, type Weight, weigh } from "./measure.ts";
import { follow, getFormAddress, leftAlone, moreFiles, type ProbeCtx, tryForm } from "./probes.ts";
import { type Found, type PageSeen, shortUrl, visit, type VisitCtx } from "./visit.ts";

export { LINE_IDS, LINES, type LineId, type PageLine } from "./lines.ts";
export { type Budget, PUBLIC_BUDGET, type Secret, SIGNED_IN_BUDGET } from "./measure.ts";
export { findBrowser } from "./browser.ts";

export interface SignedIn {
  /** A Cookie header, as the app's sign-in gave it ("sid=…"). */
  cookie?: string;
  /** Headers that sign a request in, asked for afresh before each use (Hydor's signed header lasts a minute). */
  headers?: () => Record<string, string>;
  /** The Set-Cookie headers of the answer that signed in, to see how the cookie is protected. */
  setCookies?: string[];
  /** The first page of someone signed in (default "/"). */
  home?: string;
  /** The signed-in pages to look at; without them, links are followed from `home`. */
  pages?: string[];
}

export interface PageChecksInput {
  /** Where the app is running, for example http://localhost:4321. */
  address: string;
  /** The pages to look at without signing in; without them, links are followed from "/". */
  pages?: string[];
  /** False for an app nobody can see without signing in (Hydor's sign-in): only the signed-in pages are looked at. */
  signedOut?: boolean;
  signedIn?: SignedIn;
  /** The values of the app's environment that must never reach a browser. Never printed. */
  secrets?: Secret[];
  /** True when the running app is a copy with data nobody needs: forms are then posted to it (the cross-site line). */
  throwaway?: boolean;
  /** Lines to leave out, by id: reported as could not run, "left out on request". */
  skip?: LineId[];
  /** Pages looked at on each side (default 8). */
  limit?: number;
  budgets?: { public?: Partial<Budget>; signedIn?: Partial<Budget> };
  /** The browser chosen in Settings → Browser, if one is. */
  chosenBrowser?: string;
  /** The browser program itself; null for none (default: found as Hydor's own browser features find it). */
  browser?: string | null;
  /** Other host:port on this computer the pages may reach (nothing else here but the app is). */
  allowLocal?: string[];
  /** How long a page may take to load before it is left unjudged (default 20 s). */
  loadMs?: number;
  /** How long the whole run may take (default 6 minutes): what is not reached is "could not run". */
  totalMs?: number;
  signal?: AbortSignal;
  onStep?: (what: string) => void;
  onLine?: (line: PageLine) => void;
}

export interface PageSummary {
  path: string;
  signedIn: boolean;
  final: string;
  status: number | null;
  read: boolean;
  title: string;
  /** Bytes after compression of a first visit. */
  weight: number | null;
}

export interface PageChecks {
  /** No line failed. */
  ok: boolean;
  /** Whether a sign-in was given, and whether it took. */
  signIn: "none" | "given" | "failed";
  /** A page asks for a password: the app signs people in. */
  asksSignIn: boolean;
  summary: string;
  lines: PageLine[];
  pages: PageSummary[];
  counts: { passed: number; failed: number; notRun: number; note: number };
  notCovered: string[];
  /** What a first visit to the first page weighed, and what it was held to; null when it was not measured. */
  firstVisit: (Weight & { path: string }) | null;
  budgets: { public: Budget; signedIn: Budget };
  /** What could not be tidied up after the run (never a reason for a line to change). */
  notes: string[];
}

/** What a script cannot judge: said with the result, so nobody takes it for more than it is. */
export const NOT_COVERED = [
  "Whether the words are plain, the layout makes sense, and the words for each picture are true.",
  "Using it with a screen reader: what is announced, in what order, the right roles, and whether changes are said.",
  "Whether the keyboard's order is sensible, menus and boxes opened by a click or hover, and dragging.",
  "Large type, reduced motion and a high-contrast mode; captions and transcripts for sound and video; time limits.",
  "A form's error messages and whether they are clear.",
  "Whether a small control has another that does the same, or has to be small (a pin on a map).",
  "Pages and states reached only by pressing something (a dialog, an error message, what a form that sends something shows after), and text zoomed to 200%.",
  "How fast the app answers and how it feels on a slow phone or network, a second visit, and what a page fetches long after it loaded.",
  "Whether people can see or change only what is theirs, and changes sent by scripts from another site.",
];

class Stopped extends Error {}

export async function checkPages(input: PageChecksInput): Promise<PageChecks> {
  const unknown = (input.skip ?? []).find((id) => !LINE_IDS.includes(id));
  if (unknown) throw new Error(`"${unknown}" is not the id of a line. The ids: ${LINE_IDS.join(", ")}.`);
  const skip = new Set<LineId>(input.skip ?? []);
  const notes: string[] = [];
  const base = new URL(input.address);
  const port = base.port || (base.protocol === "https:" ? "443" : "80");
  const loop = ["localhost", "127.0.0.1", "[::1]"];
  const origins = [...new Set([base.origin, ...(loop.includes(base.hostname) ? loop.map((h) => `${base.protocol}//${h}:${port}`) : [])])];
  const secrets = (input.secrets ?? []).filter((s) => s.value);
  // The pages the caller names, as paths of the app.
  const paths = (list?: string[]) => list?.map((p) => (/^https?:/i.test(p) ? `${new URL(p).pathname}${new URL(p).search}` : p.startsWith("/") ? p : `/${p}`));
  input = { ...input, pages: paths(input.pages), ...(input.signedIn ? { signedIn: { ...input.signedIn, pages: paths(input.signedIn.pages), home: paths([input.signedIn.home ?? "/"])![0] } } : {}) };
  const cookies = cookiePairs(input.signedIn?.cookie ?? "");
  // What must not be in anything given back: the keys, and what signs in.
  const sent = Object.entries(input.signedIn?.headers?.() ?? {}).map(([name, value]) => ({ name: `header ${name}`, value }));
  const hidden: Secret[] = [...secrets, ...[...cookies.map((c) => ({ name: `cookie ${c.name}`, value: c.value })), ...sent].filter((c) => c.value.length >= SECRET_MIN)];
  const step = (what: string) => input.onStep?.(scrub(what, hidden));
  const budgets = { public: { ...PUBLIC_BUDGET, ...input.budgets?.public }, signedIn: { ...SIGNED_IN_BUDGET, ...input.budgets?.signedIn } };
  const limit = input.limit ?? 8;
  const deadline = Date.now() + (input.totalMs ?? 6 * 60_000);
  const check = () => {
    if (input.signal?.aborted) throw new Stopped("The check was stopped.");
    if (Date.now() > deadline) throw new Stopped("The check ran out of time on this computer.");
  };

  const g: Gathered = {
    pages: [],
    given: new Set([...(input.pages ?? []).map((p) => `false${p}`), ...(input.signedIn?.pages ?? []).map((p) => `true${p}`)]),
    budgets,
    signIn: input.signedIn ? "given" : "none",
    links: { checked: 0, broken: [], unanswered: 0, server: [] },
    found: [],
    secrets: { looked: secrets.filter((s) => s.value.length >= SECRET_MIN).length, tooShort: secrets.filter((s) => s.value.length < SECRET_MIN).map((s) => s.name), files: 0 },
    forms: { tried: [], why: null, anySignIn: !!input.signedIn, leftOut: 0 },
    cookies: { signedInWith: input.signedIn?.cookie ? [input.signedIn.cookie] : [], setCookies: [...(input.signedIn?.setCookies ?? [])], https: base.protocol === "https:", byHeader: !!input.signedIn?.headers },
    https: base.protocol === "https:",
  };
  const probe: ProbeCtx = {
    base,
    origins,
    signal: input.signal,
    auth: (signedIn): Record<string, string> => (signedIn ? { ...(input.signedIn?.cookie ? { cookie: input.signedIn.cookie } : {}), ...input.signedIn?.headers?.() } : {}),
  };

  let browser: CheckBrowser | null = null;
  let lines: PageLine[] | null = null;
  let stopped: string | null = null;
  const onAbort = () => void browser?.close();
  input.signal?.addEventListener("abort", onAbort, { once: true });
  const all = (state: "notRun", why: string, hint = "Run the checks again; if it says the same, look at the app's own log.") => LINE_IDS.map((id) => line(id, state, why, { hint }));

  try {
    // ---- is it there?
    step("Asking the app");
    let reached = "";
    for (let i = 0; i < 3 && !input.signal?.aborted; i++) {
      try {
        await follow(probe, input.pages?.[0] ?? "/", false);
        reached = "";
        break;
      } catch (e) {
        reached = (e as NodeJS.ErrnoException).code ?? (e as Error).message;
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    check();
    if (reached) lines = all("notRun", `The app did not answer at ${base.origin} (${reached}).`, "Start the app, and give the address it listens on.");

    const program = lines ? null : input.browser !== undefined ? input.browser : findBrowser(input.chosenBrowser);
    if (!lines && !program) lines = all("notRun", "Could not run: no browser here.", "Install Chromium or Chrome, or download one in Settings → Browser.");
    if (!lines) {
      try {
        browser = await CheckBrowser.launch(program!, [...new Set([...origins.map((o) => new URL(o).host), `localhost:${port}`, `127.0.0.1:${port}`, ...(input.allowLocal ?? [])])]);
      } catch (e) {
        check();
        lines = all("notRun", `Could not run: ${(e as Error).message.split("\n")[0]}`, "Try another browser in Settings → Browser.");
      }
    }

    if (!lines) {
      const texts = new Map<string, string>();
      const found: Found[] = g.found;
      const ctx: VisitCtx = {
        browser: browser!,
        base,
        origins,
        cookies: cookies.map((c) => ({ ...c, url: base.origin })),
        headers: () => input.signedIn?.headers?.() ?? {},
        secrets: secrets.filter((s) => s.value.length >= SECRET_MIN),
        names: secrets.map((s) => s.name),
        found,
        texts,
        loadMs: input.loadMs ?? 20_000,
        check,
      };

      /** The pages of one side: those named, else what the links of the first page lead to, one of each kind, up to the limit. */
      const side = async (signedIn: boolean) => {
        const named = signedIn ? input.signedIn!.pages : input.pages;
        const start = signedIn ? (input.signedIn!.home ?? "/") : "/";
        const queue = named?.length ? [...named] : [start];
        const kinds = new Set<string>();
        const paths = new Set<string>();
        const ended = new Set<string>();
        let count = 0;
        // A visitor is turned away from the signed-in home and the sign-in was answered the same: it did not take.
        if (signedIn) {
          const [anyone, mine] = await Promise.all([follow(probe, start, false).catch(() => null), follow(probe, start, true).catch(() => null)]);
          if (anyone && mine && (anyone.final !== start || anyone.status >= 400) && mine.final === anyone.final && mine.status === anyone.status) {
            g.signIn = "failed";
            return;
          }
        }
        while (queue.length && count < limit) {
          check();
          // another address before the same one filtered another way (/stock?show=low), which would use the places up
          const next = named?.length ? 0 : Math.max(0, queue.findIndex((q) => !paths.has(q.split("?")[0])));
          const [path] = queue.splice(next, 1);
          const kind = pageKind(path);
          if (kinds.has(kind)) continue;
          kinds.add(kind);
          paths.add(path.split("?")[0]);
          step(`Looking at ${where({ page: path, signedIn })}`);
          let seen: PageSeen;
          try {
            seen = await visit(ctx, path, signedIn);
          } catch (e) {
            check();
            if (browser!.cdp.closed) throw new Stopped("The browser stopped before this was done.");
            // one page the browser could not be driven through is left unjudged; the others are still looked at
            seen = { path, signedIn, final: path, status: null, html: true, headers: {}, fetched: [], setCookies: [], unread: [(e as Error).message.split("\n")[0]], problem: "slow" };
          }
          const reading = seen.desktop?.reading;
          if (signedIn && count === 0 && path === start && seen.status !== null && (seen.status === 401 || seen.status === 403 || isSignInPath(seen.final.split("?")[0]) || (reading?.hasPassword && reading.forms.some((f) => f.password && /sign[-_]?in|log[-_]?in/i.test(`${f.action} ${f.what}`))))) {
            g.signIn = "failed";
            return;
          }
          // sent on to a page already looked at (a visitor sent to sign in): one look is enough
          const final = seen.final.startsWith("/") ? pageKind(seen.final) : seen.final;
          if (!named && ended.has(final) && seen.status !== null && seen.status < 500) continue;
          ended.add(final);
          kinds.add(final);
          // what is not a page (a file, an API answer) that a link led to is the links line's matter
          if (!named && !seen.html && seen.status !== null && seen.status < 400 && !seen.problem) continue;
          if (!named && seen.status !== null && seen.status >= 400 && seen.status < 500) continue;
          g.pages.push(seen);
          count++;
          if (named?.length) continue;
          // what a form that only reads (a search, a calculator) shows is a page too: asked with made-up words, after the links
          for (const form of reading?.forms ?? []) {
            const to = getFormAddress(form, origins);
            if (to && !kinds.has(pageKind(to)) && queue.length < 200) queue.push(to);
          }
          for (const href of reading?.hrefs ?? []) {
            let u: URL;
            try {
              u = new URL(href);
            } catch {
              continue;
            }
            if (!origins.includes(u.origin)) continue;
            const next = u.pathname + u.search;
            if (acts(next) || isFile(u.pathname) || /^\/api(\/|$)/.test(u.pathname) || (signedIn && isSignInPath(u.pathname))) continue;
            if (!kinds.has(pageKind(next)) && queue.length < 200) queue.push(next);
          }
        }
      };

      try {
        if (input.signedOut !== false) await side(false);
        if (input.signedIn) await side(true);

        // ---- where the links lead
        step("Following the links");
        const links = new Map<string, { from: PageSeen; signedIn: boolean }>();
        for (const p of g.pages)
          for (const href of p.desktop?.reading.hrefs ?? []) {
            try {
              const u = new URL(href);
              const path = u.pathname + u.search;
              if (origins.includes(u.origin) && !acts(path) && !links.has(`${p.signedIn}${path}`)) links.set(`${p.signedIn}${path}`, { from: p, signedIn: p.signedIn });
            } catch {}
          }
        const visited = new Map(g.pages.map((p) => [`${p.signedIn}${p.path}`, p.status]));
        for (const [key, l] of [...links].slice(0, 250)) {
          check();
          const path = key.slice(String(l.signedIn).length);
          g.links.checked++;
          let status = visited.get(key) ?? null;
          if (status === null) {
            try {
              status = (await follow(probe, path, l.signedIn)).status;
            } catch (e) {
              if (/ETIMEDOUT|AbortError/.test((e as NodeJS.ErrnoException).code ?? (e as Error).name)) {
                g.links.unanswered++;
                continue;
              }
              status = 0;
            }
          }
          const item: Item = { page: l.from.path, signedIn: l.signedIn, thing: `the link to ${path} answers ${status || "nothing"}` };
          if (status >= 500) g.links.server.push(item);
          else if (status === 0 || (status >= 400 && status !== 429 && !((status === 401 || status === 403) && !l.signedIn))) g.links.broken.push(item);
        }

        // ---- keys in files no page loaded
        if (secrets.length) {
          step("Looking for keys in the app's files");
          await moreFiles(probe, texts, ctx.secrets, ctx.names, found);
        }
        g.secrets.files = texts.size;

        // ---- forms from another site: last, as one that gets through changes the data
        const forms = new Map<string, { form: FormFact; page: PageSeen }>();
        const accounts = !!input.signedIn;
        for (const p of g.pages) {
          if (accounts && !p.signedIn) continue;
          for (const form of p.desktop?.reading.forms ?? []) {
            let u: URL;
            try {
              u = new URL(form.action);
            } catch {
              continue;
            }
            if (form.method !== "post" || !origins.includes(u.origin)) continue;
            const key = `${pageKind(u.pathname + u.search)} ${form.fields.map((f) => f.name).sort().join(",")} ${form.submit?.value ?? ""}`;
            if (!forms.has(key)) forms.set(key, { form, page: p });
          }
        }
        if (!accounts && g.pages.some((p) => p.desktop?.reading.hasPassword)) {
          g.forms.anySignIn = true;
          g.cookies.unknown = true;
          g.forms.why = "The app asks people to sign in and no way to sign in was given, so no form was tried.";
        }
        if (accounts) {
          const usable = [...forms.values()].filter((f) => !leftAlone(f.form));
          g.forms.leftOut = forms.size - usable.length;
          if (g.signIn === "failed") g.forms.why = "The sign-in given did not take, so no form was tried.";
          else if (skip.has("cross-site-forms")) g.forms.why = "Left out on request.";
          else if (!input.throwaway && usable.length) g.forms.why = "Forms are only posted to a throwaway copy of the app, because one that gets through changes its data.";
          else
            for (const { form, page: p } of usable.slice(0, 8)) {
              check();
              step(`Posting ${form.what} as another site would`);
              try {
                const t = await tryForm(probe, form, p.path, true);
                g.forms.tried.push({ page: p.path, signedIn: true, what: form.what, action: shortUrl(form.action, origins), ...t } satisfies FormResult);
              } catch {}
            }
        }
        for (const p of g.pages) for (const c of p.setCookies) if (!g.cookies.setCookies.includes(c)) g.cookies.setCookies.push(c);
      } catch (e) {
        if (!(e instanceof Stopped) && !input.signal?.aborted && Date.now() <= deadline) throw e;
        stopped = input.signal?.aborted ? "The check was stopped before this was done." : Date.now() > deadline ? "The check ran out of time on this computer before this was done." : (e as Error).message;
      }
      lines = judge(g);
      // A run cut short has not seen everything: what failed stands, the rest is not claimed.
      if (stopped) lines = lines.map((l) => (l.state === "failed" ? l : line(l.id, "notRun", stopped!, { hint: "Run the checks again." })));
    }
  } catch (e) {
    const why = input.signal?.aborted ? "The check was stopped." : e instanceof Stopped ? e.message : `The check did not finish: ${(e as Error).message.split("\n")[0]}`;
    lines = all("notRun", why);
  } finally {
    input.signal?.removeEventListener("abort", onAbort);
    const left = await browser?.close();
    if (left) notes.push(left);
  }

  lines = lines!.map((l) => (skip.has(l.id) ? line(l.id, "notRun", "Left out on request.") : l));
  const counts = { passed: 0, failed: 0, notRun: 0, note: 0 };
  for (const l of lines!) counts[l.state]++;
  const pages: PageSummary[] = g.pages.map((p) => ({ path: p.path, signedIn: p.signedIn, final: p.final, status: p.status, read: !!(p.phone || p.desktop), title: p.desktop?.reading.title ?? "", weight: p.phone ? weigh(p.phone.downloads).total : null }));
  const front = g.pages.find((p) => !p.signedIn && p.phone) ?? g.pages.find((p) => p.phone);
  const result: PageChecks = {
    ok: counts.failed === 0,
    signIn: g.signIn,
    asksSignIn: g.pages.some((p) => p.desktop?.reading.hasPassword),
    summary: `${lines!.length} lines on ${pages.length} ${pages.length === 1 ? "page" : "pages"}: ${counts.passed} passed, ${counts.failed} failed${counts.notRun ? `, ${counts.notRun} could not run` : ""}${counts.note ? `, ${counts.note} to note` : ""}.${g.signIn === "failed" ? " The sign-in given did not take." : ""}`,
    lines: lines!,
    pages,
    counts,
    notCovered: NOT_COVERED,
    firstVisit: front ? { path: front.path, ...weigh(front.phone!.downloads) } : null,
    budgets,
    notes,
  };
  // Nothing given back may hold a key or what signs in, wherever it turned up (an address, an error in the console, a title).
  const clean = (v: unknown): any => (typeof v === "string" ? scrub(v, hidden) : Array.isArray(v) ? v.map(clean) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clean(x)])) : v);
  const out = clean(result) as PageChecks;
  for (const l of out.lines) input.onLine?.(l);
  return out;
}

/** The lines as the Checks tab shows a check's line (shared/webapps.ts), with the group names the launch's sentence knows. */
export function asCheckLines(r: PageChecks): CheckLine[] {
  const group = { phone: "pages", reading: "accessibility", weight: "pages", safety: "safety", broken: "pages" } as const;
  return r.lines.map((l) => ({ id: l.id, state: l.state, title: l.title, text: l.text, group: group[l.group], ...(l.hint ? { hint: l.hint } : {}), ...(l.details?.length ? { details: l.details.slice(0, 9) } : {}) }));
}

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** The result for the agent building the app, in at most `most` lines, failures first: every line an agent reads is paid for. */
export function summarize(r: PageChecks, most = 12): string {
  const out = [`Page checks: ${r.summary}`];
  // what can hurt someone first, then what is broken, then the rest in the lines' own order
  const first: LineId[] = ["browser-keys", "cross-site-forms", "cookie-flags", "pages-answer"];
  const rank = (l: PageLine) => (first.includes(l.id) ? first.indexOf(l.id) : l.group === "broken" ? first.length : first.length + 1);
  const failed = r.lines.filter((l) => l.state === "failed").sort((a, b) => rank(a) - rank(b));
  const tail: string[] = [];
  const notRun = r.lines.filter((l) => l.state === "notRun");
  if (notRun.length) tail.push(`Could not run: ${cut(notRun.length > 8 ? `${notRun.length} lines (${notRun[0].text})` : `${notRun.map((l) => l.id).join(", ")} (${notRun[0].text})`, 260)}`);
  const noted = r.lines.filter((l) => l.state === "note");
  if (noted.length) tail.push(`Note: ${noted.map((l) => `${l.id}: ${cut(l.text, noted.length > 1 ? 200 : 300)}`).join(" | ")}`);
  const room = most - out.length - tail.length;
  const shown = failed.length > room ? failed.slice(0, room - 1) : failed;
  for (const l of shown) {
    // up to two of the examples, and how many more things there are
    const named = (l.details ?? []).slice(0, 2);
    const rest = (l.count ?? named.length) - named.length;
    out.push(`✗ ${l.id}: ${named.length ? named.map((d) => cut(d, 130)).join("; ") : cut(l.text, 170)}${rest > 0 ? ` (+${rest} more)` : ""}${l.hint ? ` Fix: ${cut(l.hint, 220)}` : ""}`);
  }
  if (shown.length < failed.length) out.push(`✗ also failed: ${failed.slice(shown.length).map((l) => l.id).join(", ")}`);
  return [...out, ...tail].slice(0, most).join("\n");
}
