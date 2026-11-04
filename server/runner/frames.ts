// Wire format between the server and a runner: [type u8][length u32 BE][payload].
export const FRAME_STDOUT = 1;
export const FRAME_CONTROL = 2;
export const FRAME_STDERR = 3;

export function encodeFrame(type: number, payload: Buffer | string): Buffer {
  const body = typeof payload === 'string' ? Buffer.from(payload, 'utf8') : payload;
  const head = Buffer.allocUnsafe(5);
  head.writeUInt8(type, 0);
  head.writeUInt32BE(body.length, 1);
  return Buffer.concat([head, body]);
}

export class FrameDecoder {
  private buf: Buffer = Buffer.alloc(0);

  push(chunk: Buffer, onFrame: (type: number, payload: Buffer) => void) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk;
    while (this.buf.length >= 5) {
      const len = this.buf.readUInt32BE(1);
      if (this.buf.length < 5 + len) break;
      const type = this.buf.readUInt8(0);
      const payload = this.buf.subarray(5, 5 + len);
      this.buf = this.buf.subarray(5 + len);
      onFrame(type, payload);
    }
  }
}

/** Splits a byte stream into UTF-8 lines without breaking multi-byte characters. */
export class LineSplitter {
  private rest: Buffer | null = null;

  /** Like push, also giving each line's byte offset in the stream; `at` is where this chunk starts. */
  pushAt(chunk: Buffer, at: number, onLine: (line: string, offset: number) => void) {
    const base = at - (this.rest?.length ?? 0);
    const data = this.rest ? Buffer.concat([this.rest, chunk]) : chunk;
    let start = 0;
    for (;;) {
      const nl = data.indexOf(10, start);
      if (nl < 0) break;
      if (nl > start) onLine(data.toString('utf8', start, nl), base + start);
      start = nl + 1;
    }
    this.rest = start < data.length ? Buffer.from(data.subarray(start)) : null;
  }

  push(chunk: Buffer, onLine: (line: string) => void) {
    const data = this.rest ? Buffer.concat([this.rest, chunk]) : chunk;
    let start = 0;
    for (;;) {
      const nl = data.indexOf(10, start);
      if (nl < 0) break;
      if (nl > start) onLine(data.toString('utf8', start, nl));
      start = nl + 1;
    }
    // Copy the tail so a large chunk is not kept alive by a short remainder.
    this.rest = start < data.length ? Buffer.from(data.subarray(start)) : null;
  }
}

/**
 * Where a runner listens. On Linux and macOS: a Unix socket, `sock` in its folder, which only you may open. On
 * Windows: a named pipe with a random name; `sock` in its folder is then a file that holds that name and a key, which
 * a client sends first ({ op: 'auth' }) before it hears anything, since a pipe cannot be kept to its owner the way the
 * socket's file is (your data folder can).
 */
export interface RunnerAddress {
  path: string;
  key?: string;
}

/** The address a runner in `dir` listens at, once it does (null before). */
export function readAddress(dir: string, fs: typeof import('node:fs'), path: typeof import('node:path')): RunnerAddress | null {
  const file = path.join(dir, 'sock');
  if (process.platform !== 'win32') return fs.existsSync(file) ? { path: file } : null;
  try {
    const a = JSON.parse(fs.readFileSync(file, 'utf8')) as RunnerAddress;
    return typeof a?.path === 'string' && typeof a.key === 'string' ? a : null;
  } catch {
    return null;
  }
}
