// The Jupyter kernel wire protocol over ZeroMQ: signed multipart messages on a kernel's shell,
// control, stdin and iopub sockets (jupyter-client.readthedocs.io/en/latest/messaging.html).
import crypto from 'node:crypto';
import type { Dealer, Subscriber } from 'zeromq';

type Zmq = typeof import('zeromq');
let zmq: Zmq | null = null;

/** The native ZeroMQ binding, loaded on first use: if it cannot load, only notebooks are affected. */
export async function loadZmq(): Promise<Zmq> {
  zmq ??= await import('zeromq');
  return zmq;
}

type Json = Record<string, any>;

export interface ConnectionInfo {
  ip: string;
  transport: string;
  key: string;
  signature_scheme: string;
  shell_port: number;
  iopub_port: number;
  stdin_port: number;
  control_port: number;
  hb_port: number;
}

export type Channel = 'shell' | 'control' | 'stdin' | 'iopub';

export interface KernelMessage {
  channel: Channel;
  header: Json;
  parent: Json;
  content: Json;
}

const DELIM = Buffer.from('<IDS|MSG>');

/** One client's connection to a running kernel. Messages that are not replies we wait for go to `onMessage`. */
export class KernelWire {
  private readonly session = crypto.randomUUID();
  private readonly socks: { shell: Dealer; control: Dealer; stdin: Dealer; iopub: Subscriber };
  // A ZeroMQ socket takes one send at a time; each channel queues its own.
  private readonly sending: Record<string, Promise<unknown>> = {};
  private readonly waits = new Map<string, (m: KernelMessage) => void>();
  private closed = false;

  constructor(
    z: Zmq,
    private readonly info: ConnectionInfo,
    private readonly onMessage: (m: KernelMessage) => void,
  ) {
    const url = (port: number) => `${info.transport}://${info.ip}:${port}`;
    // Shell and stdin share a routing id: the kernel sends input requests to whoever sent the execute request.
    this.socks = {
      shell: new z.Dealer({ routingId: this.session, linger: 0 }),
      control: new z.Dealer({ linger: 0 }),
      stdin: new z.Dealer({ routingId: this.session, linger: 0 }),
      iopub: new z.Subscriber({ linger: 0 }),
    };
    this.socks.shell.connect(url(info.shell_port));
    this.socks.control.connect(url(info.control_port));
    this.socks.stdin.connect(url(info.stdin_port));
    this.socks.iopub.connect(url(info.iopub_port));
    this.socks.iopub.subscribe();
    for (const ch of ['shell', 'control', 'stdin', 'iopub'] as const) this.pump(ch);
  }

  private sign(parts: Buffer[]): string {
    if (!this.info.key) return '';
    const h = crypto.createHmac(this.info.signature_scheme.replace(/^hmac-/, '') || 'sha256', this.info.key);
    for (const p of parts) h.update(p);
    return h.digest('hex');
  }

  private async pump(channel: Channel) {
    try {
      for await (const frames of this.socks[channel]) {
        const at = frames.findIndex((f) => f.equals(DELIM));
        if (at < 0 || frames.length < at + 6) continue;
        const [sig, h, p, m, c] = frames.slice(at + 1, at + 6);
        if (sig.toString() !== this.sign([h, p, m, c])) continue;
        let msg: KernelMessage;
        try {
          msg = { channel, header: JSON.parse(h.toString()), parent: JSON.parse(p.toString()), content: JSON.parse(c.toString()) };
        } catch {
          continue;
        }
        const wait = channel !== 'iopub' ? this.waits.get(msg.parent.msg_id) : undefined;
        if (wait) {
          this.waits.delete(msg.parent.msg_id);
          wait(msg);
        } else this.onMessage(msg);
      }
    } catch {
      // closed
    }
  }

  /** Sends a request; returns its msg_id, which replies and outputs carry as their parent. */
  send(channel: Exclude<Channel, 'iopub'>, msgType: string, content: Json, parent: Json = {}): string {
    const header = { msg_id: crypto.randomUUID(), username: 'web-agent', session: this.session, date: new Date().toISOString(), msg_type: msgType, version: '5.3' };
    const parts = [header, parent, {}, content].map((o) => Buffer.from(JSON.stringify(o)));
    const frames = [DELIM, Buffer.from(this.sign(parts)), ...parts];
    const sock = this.socks[channel];
    this.sending[channel] = (this.sending[channel] ?? Promise.resolve()).then(() => (this.closed ? undefined : sock.send(frames))).catch(() => {});
    return header.msg_id;
  }

  /** Sends a request and waits for its reply on the same channel. */
  request(channel: Exclude<Channel, 'iopub'>, msgType: string, content: Json, timeoutMs: number): Promise<KernelMessage> {
    return new Promise((resolve, reject) => {
      const id = this.send(channel, msgType, content);
      const timer = setTimeout(() => {
        this.waits.delete(id);
        reject(new Error(`No ${msgType.replace('_request', '')} reply from the kernel`));
      }, timeoutMs);
      this.waits.set(id, (m) => {
        clearTimeout(timer);
        resolve(m);
      });
    });
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    for (const s of Object.values(this.socks)) {
      try {
        s.close();
      } catch {}
    }
    this.waits.clear();
  }
}
