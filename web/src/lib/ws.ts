import type { ServerEvent } from '@shared/types';
import { machineBase, machineId } from './machine';

type Handler = (e: ServerEvent) => void;

/** An event socket (the app has one per machine it hears from). Reconnects with backoff and re-subscribes. */
class LiveSocket {
  constructor(private path: string) {}

  private ws: WebSocket | null = null;
  private subs = new Map<string, number>();
  private handlers = new Set<Handler>();
  private statusHandlers = new Set<(up: boolean) => void>();
  private backoff = 500;
  private timer: number | null = null;
  private stopped = true;
  up = false;

  start() {
    if (!this.stopped) return;
    this.stopped = false;
    this.connect();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && !this.up && !this.stopped) this.reconnectNow();
    });
    window.addEventListener('online', () => !this.up && !this.stopped && this.reconnectNow());
  }

  stop() {
    this.stopped = true;
    this.ws?.close();
  }

  private reconnectNow() {
    if (this.timer) window.clearTimeout(this.timer);
    this.timer = null;
    this.backoff = 500;
    this.connect();
  }

  private connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${this.path}`;
    const ws = new WebSocket(url);
    this.ws = ws;
    let pinger: number | null = null;
    ws.onopen = () => {
      this.backoff = 500;
      this.setUp(true);
      for (const key of this.subs.keys()) ws.send(JSON.stringify({ t: 'sub', key }));
      pinger = window.setInterval(() => ws.readyState === WebSocket.OPEN && ws.send('{"t":"ping"}'), 25_000);
    };
    ws.onmessage = (m) => {
      let e: ServerEvent;
      try {
        e = JSON.parse(m.data);
      } catch {
        return;
      }
      for (const h of this.handlers) h(e);
    };
    ws.onclose = () => {
      if (pinger) window.clearInterval(pinger);
      this.setUp(false);
      if (this.stopped) return;
      this.timer = window.setTimeout(() => this.connect(), this.backoff);
      this.backoff = Math.min(this.backoff * 1.8, 10_000);
    };
  }

  private setUp(up: boolean) {
    if (this.up === up) return;
    this.up = up;
    for (const h of this.statusHandlers) h(up);
  }

  on(h: Handler) {
    this.handlers.add(h);
    return () => {
      this.handlers.delete(h);
    };
  }

  onStatus(h: (up: boolean) => void) {
    this.statusHandlers.add(h);
    return () => {
      this.statusHandlers.delete(h);
    };
  }

  /** Reference-counted subscription to a session (or '@system'). */
  sub(key: string) {
    const n = (this.subs.get(key) ?? 0) + 1;
    this.subs.set(key, n);
    if (n === 1 && this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ t: 'sub', key }));
    return () => {
      const left = (this.subs.get(key) ?? 1) - 1;
      if (left <= 0) {
        this.subs.delete(key);
        if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ t: 'unsub', key }));
      } else this.subs.set(key, left);
    };
  }
}

/** The socket of the machine this page shows. */
export const live = new LiveSocket(`${machineBase}/ws`);

/** On another machine's pages: this server's own socket too, for notices from every machine. */
export const ownLive = machineId ? new LiveSocket('/ws') : null;
