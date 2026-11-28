// The machines that use this one and are connected to it now: each keeps a socket open to /ws?away=1 with an access token
// (machines.ts, Machine.follow, on its side). This server cannot reach such a machine by itself (it may be behind a router),
// but it can ask it things over that socket: a project sent to it is handed over, and the machine runs the sending as its
// own hub (spaces/transfer/hub.ts) and tells this one how it goes.
//
// Frames, as JSON text. Here to there: { t: 'call', id, op, args }. There to here: { t: 'reply', id, ok, value | status, error }
// and, unasked, { t: 'transfer', handoff, transfer }. Only the socket registered for a machine may send those two.
import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import type { ClientView } from '../shared/types.ts';
import type { Transfer } from '../shared/transfer.ts';
import { RemoteError, Unreachable } from './spaces/transfer/endpoints.ts';

/** What a connecting machine says about itself, as the socket's address gave it. */
export interface ClientHello {
  tokenId: string;
  tokenName: string;
  /** Its own machine id (GET /api/machine there). */
  id?: string;
  host?: string;
  version?: string;
  /** What it says it can do: 'send' takes projects handed to it. */
  can?: string[];
}

interface Pending {
  resolve(v: unknown): void;
  reject(e: Error): void;
  timer: NodeJS.Timeout;
}

interface Entry {
  ws: WebSocket;
  ref: string;
  name: string;
  view: ClientView;
  /** Calls waiting for an answer from this socket (they end with it). */
  pending: Map<number, Pending>;
}

const STATES = new Set(['sending', 'finishing', 'done', 'failed', 'cancelled']);

/** A transfer frame's body, when it has the shape of one. */
function transferOf(v: unknown): Transfer | null {
  const t = v as Transfer | null;
  if (!t || typeof t !== 'object' || typeof t.id !== 'string' || !STATES.has(t.state)) return null;
  if (!t.done || !t.total || typeof t.done.bytes !== 'number' || typeof t.total.bytes !== 'number') return null;
  return t;
}

export class MachineClients extends EventEmitter {
  private byRef = new Map<string, Entry>();
  private nextId = 1;

  /** Registers a socket (one that sent an access token and asked for ?away=1). */
  add(ws: WebSocket, o: ClientHello) {
    const id = o.id && /^[a-f0-9]{8,32}$/.test(o.id) ? o.id : undefined;
    const ref = id ? `c:${id}` : `c:token-${o.tokenId}`;
    const can = Array.isArray(o.can) ? o.can : [];
    const view: ClientView = {
      ref,
      name: o.tokenName,
      ...(o.host ? { host: String(o.host).slice(0, 80) } : {}),
      ...(o.version ? { version: String(o.version).slice(0, 20) } : {}),
      takes: !!id && can.includes('send'),
      since: Date.now(),
    };
    const entry: Entry = { ws, ref, name: o.tokenName, view, pending: new Map() };
    // A machine that connects again replaces its old socket's entry (that one may not have noticed it is gone yet).
    this.byRef.set(ref, entry);
    ws.on('message', (raw: unknown) => this.heard(entry, raw));
    ws.on('close', () => {
      const mine = this.byRef.get(ref) === entry;
      if (mine) this.byRef.delete(ref);
      for (const [n, p] of entry.pending) {
        clearTimeout(p.timer);
        p.reject(new Unreachable(`${entry.name} is not connected now`));
        entry.pending.delete(n);
      }
      if (mine) {
        this.emit('changed');
        this.emit('gone', ref);
      }
    });
    this.emit('changed');
    this.emit('back', ref);
  }

  list(): ClientView[] {
    return [...this.byRef.values()].map((e) => ({ ...e.view }));
  }

  get(ref: string): ClientView | undefined {
    const e = this.byRef.get(ref);
    return e ? { ...e.view } : undefined;
  }

  /** Asks a machine something over its socket; its answer's value, or the error it gave in words. */
  call(ref: string, op: string, args: unknown, timeoutMs: number): Promise<unknown> {
    const e = this.byRef.get(ref);
    if (!e || e.ws.readyState !== WebSocket.OPEN) return Promise.reject(new Unreachable(`${e?.name ?? 'That machine'} is not connected now`));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        e.pending.delete(id);
        reject(new Unreachable(`${e.name} did not answer in time`));
      }, timeoutMs);
      e.pending.set(id, { resolve, reject, timer });
      try {
        e.ws.send(JSON.stringify({ t: 'call', id, op, args }));
      } catch (err) {
        clearTimeout(timer);
        e.pending.delete(id);
        reject(new Unreachable(`${e.name} is not connected now: ${(err as Error).message}`));
      }
    });
  }

  private heard(e: Entry, raw: unknown) {
    let m: any;
    try {
      m = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (!m || typeof m !== 'object') return;
    if (m.t === 'reply' && typeof m.id === 'number') {
      const p = e.pending.get(m.id);
      if (!p) return;
      e.pending.delete(m.id);
      clearTimeout(p.timer);
      if (m.ok === true) p.resolve(m.value);
      else if (m.ok === false) p.reject(new RemoteError(typeof m.status === 'number' ? m.status : 502, typeof m.error === 'string' ? m.error : `${e.name} could not do that`));
      else p.reject(new Unreachable(`${e.name} did not answer as Hydor does`));
    } else if (m.t === 'transfer' && typeof m.handoff === 'string') {
      // Only the socket that is registered for the machine now is heard on this.
      const t = transferOf(m.transfer);
      if (t && this.byRef.get(e.ref) === e) this.emit('transfer', e.ref, m.handoff, t);
    }
  }
}
