// `hydor api [METHOD] <path>`: any endpoint of the app's API (docs/guide/90-api.md), as the pages call them, its JSON
// printed. The routes Tab completes are read from that guide topic, which the app ships with.
import fs from 'node:fs';
import path from 'node:path';
import { UsageError, type Area } from './kit.ts';

export const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

export interface Route {
  method: string;
  path: string;
  desc: string;
}

/** The routes a guide topic names: each bullet's `METHOD /path` before its dash, with the first words after it. */
export function parseRoutes(md: string): Route[] {
  const out: Route[] = [];
  for (const line of md.split('\n')) {
    if (!line.startsWith('- `')) continue;
    const dash = line.indexOf(' — ');
    const head = dash > 0 ? line.slice(0, dash) : line;
    const desc = dash > 0 ? (line.slice(dash + 3).split(/(?<=[.:;])\s/)[0] ?? '').replace(/`/g, '').slice(0, 70) : '';
    for (const m of head.matchAll(/`(GET|POST|PUT|PATCH|DELETE) (\/[^`\s]*)`/g)) out.push({ method: m[1], path: m[2].split('?')[0], desc });
  }
  return out;
}

let cached: Route[] | null = null;

/** The routes of the API topic of the guide, from the app's own folder (the Mac app ships it too); none when it is not there. */
export async function apiRoutes(): Promise<Route[]> {
  if (cached) return cached;
  try {
    const { APP_ROOT } = await import('../../config.ts');
    cached = parseRoutes(fs.readFileSync(path.join(APP_ROOT, 'docs/guide/90-api.md'), 'utf8'));
  } catch {
    cached = [];
  }
  return cached;
}

/** The path as the server wants it: with a slash first, and /api when it starts with neither. */
export const normalizePath = (p: string) => (p.startsWith('/') ? p : p.startsWith('api/') ? `/${p}` : `/api/${p}`);

export const api: Area = {
  name: 'api',
  summary: 'Call any endpoint of the API and print its JSON',
  help: 'What the app’s pages call, for scripts: hydor api /api/projects, hydor api POST /api/projects -d \'{"name":"X"}\'. With no method it is GET, or POST when you give a body. A body is JSON text, @file (read from a file) or - (from stdin). Tab completes the routes; hydor guide api lists them.',
  group: 'this',
  bare: true,
  default: 'api',
  verbs: [
    {
      name: 'api',
      args: [
        { name: 'method', kind: 'route', optional: true },
        { name: 'path', kind: 'route', optional: true },
      ],
      options: { data: { type: 'string', short: 'd', value: '<json>', desc: 'The body: JSON text, @file or - (stdin)' } },
      summary: 'Call an endpoint and print its JSON',
      examples: ['hydor api /api/health', 'hydor api GET /api/projects', 'hydor api POST /api/projects -d \'{"name":"Thesis"}\'', 'hydor api PUT /api/guidelines -d @guidelines.json'],
      async run(ctx, [a, b], v) {
        let method = 'GET';
        let route = a;
        if (a && METHODS.includes(a.toUpperCase())) {
          method = a.toUpperCase();
          route = b;
        } else if (b) throw new UsageError(`${a} is no method (${METHODS.join(', ')}): ${ctx.usage}`);
        if (!route) throw new UsageError(`Say which endpoint: ${ctx.usage}`);
        let body: unknown;
        const data = typeof v.data === 'string' ? v.data : undefined;
        if (data !== undefined) {
          if (method === 'GET' && !a?.match(/^get$/i)) method = 'POST';
          if (method === 'GET') throw new UsageError('A GET call takes no body: use POST, PUT or PATCH');
          const text = data === '-' ? await ctx.readText({ file: '-' }) : data.startsWith('@') ? await ctx.readText({ file: data.slice(1) }) : data;
          try {
            body = JSON.parse(text ?? '');
          } catch {
            throw new UsageError('The body is not JSON: -d \'{"name": "x"}\', -d @file.json or -d - (stdin)');
          }
        }
        const r = await ctx.conn.api<unknown>(method, normalizePath(route), body);
        if (typeof r === 'string') return ctx.out(r);
        if (ctx.o.json || ctx.fit) return ctx.json(r);
        ctx.out(JSON.stringify(r));
      },
    },
  ],
};
