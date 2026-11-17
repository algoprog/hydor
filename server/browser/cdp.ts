// A raw Chrome DevTools Protocol client over one connection: commands and their replies, and events, for the browser
// itself and for every target attached with flatten (each with a session id). The connection is a WebSocket to a
// Chromium the server started, or the desktop app's message channel to its own browser (desktopEngine.ts).
import WebSocket from 'ws';

/** How CDP's messages travel: each one a JSON text, both ways. */
export interface CdpTransport {
  send(raw: string): void;
  onMessage(fn: (raw: string) => void): void;
  /** Called once, when the connection is gone (either side closed it). */
  onClose(fn: () => void): void;
  close(): void;
}

function socketTransport(ws: WebSocket): CdpTransport {
  return {
    send: (raw) => ws.send(raw),
    onMessage: (fn) => ws.on('message', (raw) => fn(String(raw))),
    onClose: (fn) => {
      ws.on('close', fn);
      ws.on('error', fn);
    },
    close: () => {
      try {
        ws.close();
      } catch {}
    },
  };
}

type Handler = (params: any, sessionId?: string) => void;

export class CdpError extends Error {}

interface Waiting {
  resolve: (v: any) => void;
  reject: (e: Error) => void;
  timer: NodeJS.Timeout;
  session?: string;
}

export class Cdp {
  private seq = 0;
  private waiting = new Map<number, Waiting>();
  private handlers = new Map<string, Set<Handler>>();
  closed = false;
  private closers = new Set<() => void>();

  private constructor(private t: CdpTransport) {
    t.onMessage((raw) => this.receive(raw));
    t.onClose(() => this.shut());
  }

  static connect(url: string, timeoutMs = 15_000): Promise<Cdp> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url, { perMessageDeflate: false, maxPayload: 512 * 1024 * 1024 });
      const t = setTimeout(() => (ws.terminate(), reject(new CdpError('The browser did not answer'))), timeoutMs);
      ws.once('open', () => (clearTimeout(t), resolve(new Cdp(socketTransport(ws)))));
      ws.once('error', (e) => (clearTimeout(t), reject(e)));
    });
  }

  /** A client over another way of carrying the messages (the desktop app's channel). */
  static over(t: CdpTransport): Cdp {
    return new Cdp(t);
  }

  send<T = any>(method: string, params: object = {}, session?: string, timeoutMs = 30_000): Promise<T> {
    if (this.closed) return Promise.reject(new CdpError('The browser has closed'));
    const id = ++this.seq;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiting.delete(id);
        reject(new CdpError(`The browser did not finish ${method} in time`));
      }, timeoutMs);
      this.waiting.set(id, { resolve, reject, timer, session });
      try {
        this.t.send(JSON.stringify(session ? { id, method, params, sessionId: session } : { id, method, params }));
      } catch (e) {
        clearTimeout(timer);
        this.waiting.delete(id);
        reject(new CdpError(`The browser could not be reached (${(e as Error).message})`));
      }
    });
  }

  /** Listens to an event of one session ('' for the browser's own), or of any ('*'). */
  on(method: string, fn: Handler, session = '*'): () => void {
    const k = `${session}|${method}`;
    let set = this.handlers.get(k);
    if (!set) this.handlers.set(k, (set = new Set()));
    set.add(fn);
    return () => {
      set.delete(fn);
    };
  }

  onClose(fn: () => void) {
    this.closers.add(fn);
  }

  /** A target went away: what was asked of it will not be answered. */
  dropSession(session: string) {
    for (const [id, w] of this.waiting)
      if (w.session === session) {
        clearTimeout(w.timer);
        this.waiting.delete(id);
        w.reject(new CdpError('The tab has closed'));
      }
    for (const k of [...this.handlers.keys()]) if (k.startsWith(`${session}|`)) this.handlers.delete(k);
  }

  close() {
    this.t.close();
    this.shut();
  }

  private receive(raw: string) {
    let m: any;
    try {
      m = JSON.parse(raw);
    } catch {
      return;
    }
    if (m.id !== undefined) {
      const w = this.waiting.get(m.id);
      if (!w) return;
      this.waiting.delete(m.id);
      clearTimeout(w.timer);
      if (m.error) w.reject(new CdpError(m.error.message ?? 'CDP error'));
      else w.resolve(m.result ?? {});
      return;
    }
    if (!m.method) return;
    const sid: string = m.sessionId ?? '';
    for (const k of [`${sid}|${m.method}`, `*|${m.method}`]) {
      const set = this.handlers.get(k);
      if (!set) continue;
      for (const fn of [...set]) {
        try {
          fn(m.params ?? {}, m.sessionId);
        } catch (e) {
          console.error(`[browser] ${m.method}: ${(e as Error).message}`);
        }
      }
    }
  }

  private shut() {
    if (this.closed) return;
    this.closed = true;
    for (const [, w] of this.waiting) {
      clearTimeout(w.timer);
      w.reject(new CdpError('The browser has closed'));
    }
    this.waiting.clear();
    for (const fn of this.closers) fn();
    this.closers.clear();
  }
}

/** One attached target (a tab, a frame in another process): its commands and events. */
export class CdpSession {
  constructor(
    readonly cdp: Cdp,
    readonly id: string,
  ) {}
  send<T = any>(method: string, params: object = {}, timeoutMs?: number): Promise<T> {
    return this.cdp.send<T>(method, params, this.id, timeoutMs);
  }
  on(method: string, fn: (params: any) => void): () => void {
    return this.cdp.on(method, fn, this.id);
  }
}
