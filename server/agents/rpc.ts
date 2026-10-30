// Minimal JSON-RPC 2.0 peer for the Codex app server (one JSON object per line).
type Json = Record<string, any>;

export class RpcError extends Error {
  constructor(
    message: string,
    public code?: number,
    public data?: unknown,
  ) {
    super(message);
  }
}

export class RpcPeer {
  private seq = 0;
  private pending = new Map<string, { resolve: (v: any) => void; reject: (e: Error) => void; timer: NodeJS.Timeout; method: string }>();

  /** `prefix` keeps request ids unique across server restarts (replayed logs hold old ids). */
  constructor(
    private write: (obj: Json) => void,
    private prefix: string,
  ) {}

  call<T = any>(method: string, params: unknown, timeoutMs = 60_000): Promise<T> {
    const id = `${this.prefix}-${++this.seq}`;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new RpcError(`${method} timed out`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer, method });
      this.write({ jsonrpc: '2.0', id, method, params });
    });
  }

  notify(method: string, params?: unknown) {
    this.write({ jsonrpc: '2.0', method, params: params ?? {} });
  }

  respond(id: string | number, result: unknown) {
    this.write({ jsonrpc: '2.0', id, result });
  }

  respondError(id: string | number, code: number, message: string) {
    this.write({ jsonrpc: '2.0', id, error: { code, message } });
  }

  /** Returns true when the message answered one of our calls. */
  settle(msg: Json): boolean {
    if (msg.id == null || msg.method) return false;
    const p = this.pending.get(String(msg.id));
    if (!p) return false;
    clearTimeout(p.timer);
    this.pending.delete(String(msg.id));
    if (msg.error) p.reject(new RpcError(String(msg.error.message ?? `${p.method} failed`), msg.error.code, msg.error.data));
    else p.resolve(msg.result);
    return true;
  }

  failAll(reason: string) {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new RpcError(reason));
    }
    this.pending.clear();
  }
}
