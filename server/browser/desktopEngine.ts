// The desktop app's own browser as the engine the browser runs on: desktop/browser.cjs answers the same CDP a Chromium
// the server starts does, one connection for each profile, over the app's message channel (server/desktop.ts). Its tabs
// are views the app's window can show themselves, so you use the page directly rather than a picture of it.
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { askDesktop, onDesktop, tellDesktop } from '../desktop.ts';
import { Cdp, type CdpTransport } from './cdp.ts';

interface Conn {
  deliver(raw: string): void;
  gone(why?: string): void;
}

const conns = new Map<string, Conn>();
let listening = false;

function listen() {
  if (listening) return;
  listening = true;
  onDesktop('cdp', (m) => {
    if (m.type === 'cdp') conns.get(m.conn)?.deliver(m.data);
  });
  onDesktop('browser-gone', (m) => {
    if (m.type === 'browser-gone') conns.get(m.conn)?.gone(m.why);
  });
  // The app's channel closed (the app quit): its browsers went with it.
  process.on('disconnect', () => {
    for (const c of [...conns.values()]) c.gone('the desktop app closed');
  });
}

/** Stands in for a Chromium's process: kill() closes the app's browser for that profile, and 'exit' says it is gone. */
export class DesktopProc extends EventEmitter {
  readonly pid: number | undefined = undefined;
  constructor(private readonly end: () => void) {
    super();
  }
  kill(): boolean {
    this.end();
    return true;
  }
}

export interface DesktopLaunch {
  conn: string;
  proc: DesktopProc;
  cdp: Cdp;
}

/** Starts the app's browser for a profile ('' fresh, a profile's id, or 'browsing'), its connections through `proxy`. */
export async function launchDesktop(o: { profile: string; proxy: number; extensions: { id: string; path: string }[] }): Promise<DesktopLaunch> {
  listen();
  const conn = crypto.randomBytes(6).toString('hex');
  let receive: ((raw: string) => void) | null = null;
  const early: string[] = [];
  const closers = new Set<() => void>();
  let closed = false;
  const gone = (why = 'closed') => {
    if (closed) return;
    closed = true;
    conns.delete(conn);
    for (const fn of closers) fn();
    proc.emit('exit', null, why);
  };
  const end = () => {
    if (!closed) tellDesktop({ type: 'browser-close', conn });
    gone();
  };
  const proc = new DesktopProc(end);
  conns.set(conn, { deliver: (raw) => (receive ? receive(raw) : early.push(raw)), gone });
  const transport: CdpTransport = {
    send: (raw) => {
      if (closed || !tellDesktop({ type: 'cdp', conn, data: raw })) throw new Error('the desktop app is not there');
    },
    onMessage: (fn) => {
      receive = fn;
      for (const raw of early.splice(0)) fn(raw);
    },
    onClose: (fn) => void closers.add(fn),
    close: end,
  };
  try {
    await askDesktop({ what: 'browser-launch', conn, profile: o.profile, proxy: o.proxy, extensions: o.extensions }, 30_000);
  } catch (e) {
    gone();
    throw new Error(`The desktop app's browser did not start: ${(e as Error).message}`);
  }
  return { conn, proc, cdp: Cdp.over(transport) };
}

/** You clicked or typed in a page the app's window shows (connection, tab, whether you typed): you drive that tab from then on. */
export function onDesktopInput(fn: (conn: string, target: string, typed: boolean) => void) {
  listen();
  onDesktop('browser-input', (m) => {
    if (m.type === 'browser-input') fn(m.conn, m.target, !!m.typed);
  });
}

/** Tells a profile's running browser which extensions to load now. */
export function sendExtensions(profile: string, extensions: { id: string; path: string }[]) {
  tellDesktop({ type: 'browser-extensions', profile, extensions });
}
