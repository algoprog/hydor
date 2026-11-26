// A small HTTP client for the judge: it keeps what an app gives a person to prove who they are (cookies, or a token it hands back), and it never follows a redirect on its own.
// It knows nothing of any framework: an address, a method, a body sent as JSON, a form, a file or plain text.
import { request } from 'node:http';
import { visibleText } from './lib.ts';

export interface Reply {
  status: number;
  text: string;
  /** The body read as JSON when it is JSON (or looks like it), else null. */
  json: any;
  location: string | null;
}

export type Send = 'json' | 'form' | 'multipart' | 'text' | 'query';

export interface SessionStyle {
  /** A cookie: whatever the app sets is kept and sent back. */
  cookie?: true;
  /** A token the app answers with (the path of it in the JSON), sent in a header on every call after. */
  token?: string;
  header?: string;
  prefix?: string;
}

export interface Body {
  send: Send;
  /** Headers of this call only (a payment service's shared secret). */
  headers?: Record<string, string>;
  fields?: Record<string, unknown>;
  /** For multipart or text: the name of the part and the content of the file. */
  file?: { part: string; name: string; type: string; content: string };
}

/** The value at a dotted path of a JSON answer ("rows", "data.items", "tasks.0.date"); undefined when it is not there. */
export function at(json: unknown, path: string): unknown {
  if (path === '' || path === '$') return json;
  let value: any = json;
  for (const step of path.split('.')) {
    if (value === null || typeof value !== 'object') return undefined;
    value = value[step];
  }
  return value;
}

let counter = 0;
/** The next loopback address (127.0.x.y): an app that limits what one address may send counts the judge's people apart, as it would count real people apart. */
const nextAddress = (): string => `127.0.${1 + Math.floor(counter / 250) % 250}.${1 + (counter++ % 250)}`;

interface Sent {
  status: number;
  text: string;
  contentType: string;
  location: string | null;
  setCookie: string[];
}

async function transport(method: string, url: string, headers: Headers, payload: BodyInit | undefined, localAddress: string): Promise<Sent> {
  let body: Buffer | undefined;
  if (payload !== undefined) {
    const made = new Response(payload);
    body = Buffer.from(await made.arrayBuffer());
    const type = made.headers.get('content-type');
    if (type && !headers.has('content-type')) headers.set('content-type', type);
    headers.set('content-length', String(body.length));
  }
  const attempt = (address: string | undefined) =>
    new Promise<Sent>((resolve, reject) => {
      const req = request(url, { method, headers: Object.fromEntries(headers), ...(address ? { localAddress: address } : {}), timeout: 30_000 }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            text: Buffer.concat(chunks).toString('utf8'),
            contentType: String(res.headers['content-type'] ?? ''),
            location: typeof res.headers.location === 'string' ? res.headers.location : null,
            setCookie: res.headers['set-cookie'] ?? [],
          }),
        );
        res.on('error', reject);
      });
      req.on('timeout', () => req.destroy(new Error('timed out after 30 seconds')));
      req.on('error', reject);
      req.end(body);
    });
  try {
    return await attempt(localAddress);
  } catch (error) {
    // a computer with no such loopback address: the request is made from the usual one
    if ((error as NodeJS.ErrnoException).code === 'EADDRNOTAVAIL' || (error as NodeJS.ErrnoException).code === 'EINVAL') return attempt(undefined);
    throw error;
  }
}

export class Client {
  readonly origin: string;
  readonly label: string;
  private readonly jar = new Map<string, string>();
  private token: string | undefined;
  private style: SessionStyle = { cookie: true };
  private sent = 0;
  private current = nextAddress();

  constructor(origin: string, label: string) {
    this.origin = origin;
    this.label = label;
  }

  /** The address the next call comes from: a new one after every few calls. */
  private address(): string {
    if (this.sent++ % 3 === 2) this.current = nextAddress();
    return this.current;
  }

  useSession(style: SessionStyle): void {
    this.style = style;
  }

  get signedIn(): boolean {
    return this.jar.size > 0 || this.token !== undefined;
  }

  forget(): void {
    this.jar.clear();
    this.token = undefined;
  }

  async call(method: string, path: string, body?: Body): Promise<Reply> {
    const headers = new Headers();
    if (this.jar.size > 0) headers.set('cookie', [...this.jar].map(([k, v]) => `${k}=${v}`).join('; '));
    if (this.token && this.style.header) headers.set(this.style.header, `${this.style.prefix ?? ''}${this.token}`);
    if (method !== 'GET' && method !== 'HEAD') headers.set('origin', this.origin);
    if (body?.headers) for (const [k, v] of Object.entries(body.headers)) headers.set(k, v);
    let url = this.origin + path;
    let payload: BodyInit | undefined;
    if (body) {
      const fields = body.fields ?? {};
      if (body.send === 'json') {
        headers.set('content-type', 'application/json');
        payload = JSON.stringify(fields);
      } else if (body.send === 'form') {
        headers.set('content-type', 'application/x-www-form-urlencoded');
        payload = new URLSearchParams(Object.entries(fields).flatMap(([k, v]) => (Array.isArray(v) ? v.map((x) => [k, String(x)] as [string, string]) : [[k, String(v)] as [string, string]]))).toString();
      } else if (body.send === 'query') {
        const q = new URLSearchParams(Object.entries(fields).flatMap(([k, v]) => (Array.isArray(v) ? v.map((x) => [k, String(x)] as [string, string]) : [[k, String(v)] as [string, string]])));
        url += (url.includes('?') ? '&' : '?') + q.toString();
      } else if (body.send === 'multipart') {
        const form = new FormData();
        for (const [k, v] of Object.entries(fields)) form.append(k, String(v));
        if (body.file) form.append(body.file.part, new Blob([body.file.content], { type: body.file.type }), body.file.name);
        payload = form;
      } else if (body.send === 'text') {
        headers.set('content-type', body.file?.type ?? 'text/plain');
        payload = body.file?.content ?? '';
      }
    }
    const sent = await transport(method, url, headers, payload, this.address());
    for (const line of sent.setCookie) {
      const [pair] = line.split(';');
      const eq = pair!.indexOf('=');
      const name = pair!.slice(0, eq).trim();
      const value = pair!.slice(eq + 1);
      if (/max-age=0|expires=thu, 01 jan 1970/i.test(line) || value === '') this.jar.delete(name);
      else this.jar.set(name, value);
    }
    const text = sent.text;
    let json: any = null;
    if (/json/.test(sent.contentType) || /^\s*[[{]/.test(text)) {
      try {
        json = JSON.parse(text);
      } catch {}
    }
    if (this.style.token && json) {
      const t = at(json, this.style.token);
      if (typeof t === 'string' && t.length > 0) this.token = t;
    }
    return { status: sent.status, text, json, location: sent.location };
  }

  get = (path: string) => this.call('GET', path);

  /** A page as a person sees it: redirects to the same address are followed a few times. */
  async page(path: string): Promise<Reply> {
    let reply = await this.get(path);
    for (let i = 0; i < 4 && reply.status >= 300 && reply.status < 400 && reply.location; i++) {
      const next = new URL(reply.location, this.origin);
      if (next.origin !== this.origin) break;
      reply = await this.get(next.pathname + next.search);
    }
    return reply;
  }
}

/** The words a person reads on a page. */
export const wordsOf = (reply: Reply): string => visibleText(reply.text);

export const ok = (reply: Reply): boolean => reply.status >= 200 && reply.status < 300;
export const refused = (reply: Reply): boolean => reply.status >= 400 && reply.status < 500;
