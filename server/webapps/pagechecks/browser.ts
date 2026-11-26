// The browser the page checks drive: the Chromium Hydor's own browser features use (server/browser/chrome.ts), headless, with a
// profile of its own that is gone afterwards, over the debugging pipe, so that it ends by itself if Hydor does. Its traffic goes
// through Hydor's browser proxy: the app being checked and public sites may be reached, nothing else on this computer or its network.
import { type ChildProcess, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Cdp, type CdpTransport } from "../../browser/cdp.ts";
import { pickRunnableChrome } from "../../browser/chrome.ts";
import { BrowserProxy, proxyArgs } from "../../browser/proxy.ts";
import { config } from "../../config.ts";

/** The program to run: the one chosen in Settings → Browser while it is there, else the best found; null when there is none. */
export const findBrowser = (chosen = ""): string | null => pickRunnableChrome(chosen)?.path ?? null;

const PREFIX = "hydor-pagecheck-";

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
};

/** Profile folders left by a Hydor that was killed outright (their browser ended with the pipe): their owner's number is in the name. */
export function sweepProfiles(dir = os.tmpdir()): string[] {
  const gone: string[] = [];
  let names: string[] = [];
  try {
    names = fs.readdirSync(dir);
  } catch {}
  for (const n of names) {
    const m = /^hydor-pagecheck-(\d+)-/.exec(n);
    if (!m || alive(Number(m[1]))) continue;
    try {
      fs.rmSync(path.join(dir, n), { recursive: true, force: true });
      gone.push(n);
    } catch {}
  }
  return gone;
}

// Whatever is still open when this program ends is ended with it.
const open = new Set<CheckBrowser>();
let hooked = false;
function hook() {
  if (hooked) return;
  hooked = true;
  process.on("exit", () => {
    for (const b of open) b.destroy();
  });
}

function pipeTransport(child: ChildProcess): CdpTransport {
  const to = child.stdio[3] as NodeJS.WritableStream;
  const from = child.stdio[4] as NodeJS.ReadableStream;
  let onMessage: (raw: string) => void = () => {};
  let onClose: () => void = () => {};
  let parts: Buffer[] = [];
  from.on("data", (chunk: Buffer) => {
    let start = 0;
    for (let end = chunk.indexOf(0); end >= 0; end = chunk.indexOf(0, start)) {
      parts.push(chunk.subarray(start, end));
      onMessage(Buffer.concat(parts).toString("utf8"));
      parts = [];
      start = end + 1;
    }
    if (start < chunk.length) parts.push(chunk.subarray(start));
  });
  from.on("close", () => onClose());
  from.on("error", () => onClose());
  to.on("error", () => onClose());
  child.on("exit", () => onClose());
  return {
    send: (raw) => void to.write(`${raw}\0`),
    onMessage: (fn) => (onMessage = fn),
    onClose: (fn) => (onClose = fn),
    close: () => {},
  };
}

export class CheckBrowser {
  private closing: Promise<string | null> | null = null;
  /** How many times removing the profile folder is tried before saying it could not be (a test makes it fewer). */
  cleanupAttempts = 10;
  private constructor(
    readonly cdp: Cdp,
    private child: ChildProcess,
    readonly profile: string,
    private proxy: BrowserProxy,
  ) {}

  get pid(): number {
    return this.child.pid!;
  }

  /** Starts one. `own` are the app's addresses (host:port), which are on this computer and may be reached. */
  static async launch(program: string, own: string[], startMs = 45_000): Promise<CheckBrowser> {
    hook();
    sweepProfiles();
    const proxy = await BrowserProxy.start({ policy: () => ({ blockPrivate: true, allow: [], block: [], local: own }), appPort: config.port });
    let why = "";
    for (const sandbox of [true, false]) {
      const profile = fs.mkdtempSync(path.join(os.tmpdir(), `${PREFIX}${process.pid}-`));
      for (const d of ["home", "tmp"]) fs.mkdirSync(path.join(profile, d));
      const args = [
        "--headless",
        "--remote-debugging-pipe",
        `--user-data-dir=${path.join(profile, "profile")}`,
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-background-networking",
        "--disable-component-update",
        "--disable-default-apps",
        "--disable-sync",
        "--disable-breakpad",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-features=Translate,MediaRouter,OptimizationHints,AutofillServerCommunication",
        "--metrics-recording-only",
        "--password-store=basic",
        "--use-mock-keychain",
        "--mute-audio",
        "--hide-scrollbars",
        "--force-color-profile=srgb",
        "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
        ...proxyArgs(proxy.port),
        ...(sandbox ? [] : ["--no-sandbox"]),
        "about:blank",
      ];
      // Nothing of Hydor's environment: the pages it opens are made by agents.
      const env: Record<string, string> = { PATH: process.env.PATH ?? "", HOME: path.join(profile, "home"), TMPDIR: path.join(profile, "tmp"), XDG_CONFIG_HOME: path.join(profile, "home", ".config"), XDG_CACHE_HOME: path.join(profile, "home", ".cache"), LANG: process.env.LANG ?? "C.UTF-8" };
      const child = spawn(program, args, { stdio: ["ignore", "ignore", "pipe", "pipe", "pipe"], env, detached: process.platform !== "win32" });
      let err = "";
      child.stderr!.on("data", (d) => (err = (err + String(d)).slice(-6000)));
      child.on("error", (e) => (err += e.message));
      const cdp = Cdp.over(pipeTransport(child));
      const b = new CheckBrowser(cdp, child, profile, proxy);
      open.add(b);
      try {
        await cdp.send("Browser.getVersion", {}, undefined, startMs);
        return b;
      } catch (e) {
        why = err.trim().split("\n").pop()?.slice(0, 300) || (e as Error).message;
        await b.end();
        if (!/sandbox|namespace|zygote/i.test(err)) break;
      }
    }
    proxy.close();
    throw new Error(`The browser did not start: ${why}`);
  }

  private group(signal: NodeJS.Signals | 0): boolean {
    const pid = this.child.pid;
    if (pid === undefined) return false;
    try {
      process.kill(process.platform === "win32" ? pid : -pid, signal);
      return true;
    } catch {
      return false;
    }
  }

  private async gone(ms: number): Promise<boolean> {
    for (let waited = 0; waited < ms; waited += 50) {
      if (!this.group(0)) return true;
      await new Promise((r) => setTimeout(r, 50));
    }
    return !this.group(0);
  }

  /**
   * Ends every process of the browser (it is a group of them: its helpers write into the profile for a moment after the main one has
   * gone), waits for them, then takes the profile folder away, trying again while a file is still being written.
   */
  private async end(): Promise<string | null> {
    this.cdp.send("Browser.close", {}, undefined, 3000).catch(() => {});
    if (!(await this.gone(4000))) {
      this.group("SIGTERM");
      if (!(await this.gone(3000))) {
        this.group("SIGKILL");
        await this.gone(5000);
      }
    }
    this.cdp.close();
    for (const s of [this.child.stderr, this.child.stdio[3], this.child.stdio[4]]) (s as { destroy?: () => void } | null)?.destroy?.();
    open.delete(this);
    for (let attempt = 0; attempt < this.cleanupAttempts; attempt++) {
      try {
        fs.rmSync(this.profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
        return null;
      } catch (e) {
        if (attempt === this.cleanupAttempts - 1) return `The browser's temporary folder (${this.profile}) could not be removed (${(e as Error).message.split("\n")[0]}): it is safe to delete.`;
        this.group("SIGKILL");
        await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
      }
    }
    return null;
  }

  /** Ends it. Never throws: when its folder cannot be removed, a sentence that says so. */
  close(): Promise<string | null> {
    return (this.closing ??= this.end().finally(() => this.proxy.close()));
  }

  /** The same at once, for a program that is ending. */
  destroy(): void {
    this.group("SIGKILL");
    try {
      fs.rmSync(this.profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    } catch {}
  }
}

// ---- one page ------------------------------------------------------------------------------------------------------------------------

export interface Request {
  url: string;
  type: string;
  mime: string;
  /** 0 while there is no answer. */
  status: number;
  headers: Record<string, string>;
  /** Bytes over the wire, headers included. */
  wire: number;
  startedAt: number;
  endedAt: number | null;
  failed?: string;
  sent: string;
  body: Promise<Buffer | null>;
}

export interface TabOptions {
  width: number;
  height: number;
  /** A phone: touch and its viewport. */
  phone?: boolean;
  /** The app's origins, which get the sign-in's headers. */
  origins: string[];
  cookies?: { name: string; value: string; url: string }[];
  headers?: Record<string, string>;
}

/** A page in a browser context of its own: nothing cached and no cookie of any other visit. */
export class Tab {
  requests: Request[] = [];
  errors: string[] = [];
  setCookies: string[] = [];
  private byId = new Map<string, Request>();
  private inFlight = new Set<string>();
  private lastActivity = Date.now();
  private loaded: (() => void) | null = null;
  private frame = "";
  private session = "";
  private context = "";
  private target = "";
  private offs: (() => void)[] = [];

  private constructor(private browser: CheckBrowser) {}

  static async open(browser: CheckBrowser, o: TabOptions): Promise<Tab> {
    const t = new Tab(browser);
    const cdp = browser.cdp;
    t.context = (await cdp.send("Target.createBrowserContext", { disposeOnDetach: true })).browserContextId;
    await cdp.send("Browser.setDownloadBehavior", { behavior: "deny", browserContextId: t.context }).catch(() => {});
    t.target = (await cdp.send("Target.createTarget", { url: "about:blank", browserContextId: t.context })).targetId;
    t.session = (await cdp.send("Target.attachToTarget", { targetId: t.target, flatten: true })).sessionId;
    t.listen();
    await Promise.all([t.send("Page.enable"), t.send("Network.enable", { maxResourceBufferSize: 20_000_000, maxTotalBufferSize: 60_000_000 }), t.send("Runtime.enable"), t.send("Log.enable")]);
    t.frame = (await t.send("Page.getFrameTree")).frameTree.frame.id;
    await t.send("Emulation.setDeviceMetricsOverride", { width: o.width, height: o.height, deviceScaleFactor: 1, mobile: !!o.phone });
    if (o.phone) await t.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    await t.scheme("light");
    await t.send("Emulation.setFocusEmulationEnabled", { enabled: true });
    if (o.cookies?.length) await t.send("Network.setCookies", { cookies: o.cookies });
    if (o.headers && Object.keys(o.headers).length) {
      const extra = o.headers;
      // Only to the app: a signed header sent to another site's file would give the sign-in away.
      t.offs.push(
        cdp.on("Fetch.requestPaused", (p) => {
          const mine = new Set(Object.keys(extra).map((k) => k.toLowerCase()));
          const headers = [...Object.entries(p.request.headers as Record<string, string>).filter(([k]) => !mine.has(k.toLowerCase())), ...Object.entries(extra)].map(([name, value]) => ({ name, value }));
          t.send("Fetch.continueRequest", { requestId: p.requestId, headers }).catch(() => {});
        }, t.session),
      );
      await t.send("Fetch.enable", { patterns: o.origins.map((origin) => ({ urlPattern: `${origin}/*` })) });
    }
    return t;
  }

  send<T = any>(method: string, params: object = {}, timeoutMs = 20_000): Promise<T> {
    return this.browser.cdp.send<T>(method, params, this.session, timeoutMs);
  }

  private listen() {
    const on = (method: string, fn: (p: any) => void) => this.offs.push(this.browser.cdp.on(method, fn, this.session));
    const busy = () => (this.lastActivity = Date.now());
    on("Network.requestWillBeSent", (p) => {
      busy();
      const before = this.byId.get(p.requestId);
      if (before && p.redirectResponse) this.answered(before, p.redirectResponse, before.type);
      const r: Request = { url: p.request.url, type: p.type ?? "Other", mime: "", status: 0, headers: {}, wire: 0, startedAt: p.timestamp * 1000, endedAt: null, sent: `${p.request.url}\n${p.request.postData ?? ""}`, body: Promise.resolve(null) };
      this.byId.set(p.requestId, r);
      this.requests.push(r);
      if (!p.request.url.startsWith("data:")) this.inFlight.add(p.requestId);
    });
    on("Network.responseReceived", (p) => {
      const r = this.byId.get(p.requestId);
      if (r) this.answered(r, p.response, p.type);
    });
    on("Network.responseReceivedExtraInfo", (p) => {
      for (const [k, v] of Object.entries(p.headers as Record<string, string>)) if (k.toLowerCase() === "set-cookie") this.setCookies.push(...v.split("\n"));
    });
    on("Network.loadingFinished", (p) => {
      busy();
      this.inFlight.delete(p.requestId);
      const r = this.byId.get(p.requestId);
      if (!r) return;
      r.wire = p.encodedDataLength ?? 0;
      r.endedAt = p.timestamp * 1000;
      r.body = this.send("Network.getResponseBody", { requestId: p.requestId }).then(
        (b) => Buffer.from(b.body, b.base64Encoded ? "base64" : "utf8"),
        () => null,
      );
    });
    on("Network.loadingFailed", (p) => {
      busy();
      this.inFlight.delete(p.requestId);
      const r = this.byId.get(p.requestId);
      if (r) ((r.failed = p.blockedReason ?? p.errorText ?? "failed"), (r.endedAt = p.timestamp * 1000));
    });
    on("Page.loadEventFired", () => this.loaded?.());
    // A message box would hold the page still until someone answered it.
    on("Page.javascriptDialogOpening", () => void this.send("Page.handleJavaScriptDialog", { accept: false }).catch(() => {}));
    on("Runtime.exceptionThrown", (p) => this.errors.push(String(p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text ?? "an error in the page").split("\n")[0]));
    on("Runtime.consoleAPICalled", (p) => {
      if (p.type === "error" || p.type === "assert") this.errors.push(((p.args ?? []) as any[]).map((a) => String(a.value ?? a.description ?? a.type).split("\n")[0]).join(" "));
    });
    // What the browser itself refuses (a content security policy, say). Files that did not load are looked at as requests.
    on("Log.entryAdded", (p) => {
      if (p.entry.level === "error" && p.entry.source !== "network") this.errors.push(String(p.entry.text).split("\n")[0]);
    });
  }

  private answered(r: Request, response: any, type: string) {
    r.status = response.status;
    r.mime = response.mimeType ?? "";
    r.type = type ?? r.type;
    r.headers = Object.fromEntries(Object.entries((response.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]));
    if (!r.wire) r.wire = response.encodedDataLength ?? 0;
  }

  /** The page's own answer: the last document asked for by the main frame. */
  document(): Request | undefined {
    return [...this.byId.entries()].reverse().find(([, r]) => r.type === "Document" && r.status > 0)?.[1];
  }

  /**
   * Opens an address: waits for the page to have loaded and the network to be quiet for a moment (never more than a few seconds more,
   * for pages that keep a connection open). "slow" when it had not loaded in time: nothing is judged from it.
   */
  async goto(url: string, timeoutMs: number): Promise<"ok" | "slow" | { error: string }> {
    const loaded = new Promise<boolean>((resolve) => {
      const t = setTimeout(() => resolve(false), timeoutMs);
      this.loaded = () => (clearTimeout(t), resolve(true));
    });
    let nav: any;
    try {
      nav = await this.send("Page.navigate", { url, frameId: this.frame }, timeoutMs);
    } catch (e) {
      return /in time/.test((e as Error).message) ? "slow" : { error: (e as Error).message };
    }
    if (nav.errorText && nav.errorText !== "net::ERR_HTTP_RESPONSE_CODE_FAILURE") return { error: nav.errorText };
    if (!(await loaded)) return "slow";
    await this.quiet();
    await this.evaluate(() => document.fonts.ready.then(() => true)).catch(() => {});
    return "ok";
  }

  async quiet(ms = 500, most = 5000): Promise<void> {
    const from = Date.now();
    while (Date.now() - from < most && (this.inFlight.size > 0 || Date.now() - this.lastActivity < ms)) await new Promise((r) => setTimeout(r, 50));
  }

  /** Runs a function in the page (it can use nothing outside itself) and gives what it returns. */
  async evaluate<A extends unknown[], T>(fn: (...args: A) => T, ...args: A): Promise<Awaited<T>> {
    const r = await this.send("Runtime.evaluate", { expression: `(${fn.toString()})(...${JSON.stringify(args)})`, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(String(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text).split("\n")[0]);
    return r.result?.value as Awaited<T>;
  }

  scheme(scheme: "light" | "dark") {
    return this.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: scheme }, { name: "prefers-reduced-motion", value: "reduce" }] });
  }

  async screenshot(clip?: { x: number; y: number; width: number; height: number }): Promise<Buffer> {
    const { data } = await this.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false, ...(clip ? { clip: { ...clip, scale: 1 } } : {}) });
    return Buffer.from(data, "base64");
  }

  async key(key: string, code: number): Promise<void> {
    await this.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key, code: key, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code });
    await this.send("Input.dispatchKeyEvent", { type: "keyUp", key, code: key, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code });
  }

  async close(): Promise<void> {
    for (const off of this.offs) off();
    this.loaded = null;
    const cdp = this.browser.cdp;
    cdp.dropSession(this.session);
    await cdp.send("Target.closeTarget", { targetId: this.target }, undefined, 5000).catch(() => {});
    await cdp.send("Target.disposeBrowserContext", { browserContextId: this.context }, undefined, 5000).catch(() => {});
  }
}
