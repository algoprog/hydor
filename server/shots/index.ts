// Before and after: when an agent changes how a web app looks or works (a frontend with a dev server, or
// HTML files), it takes screenshots of the screens it changes before its first edit and again when it is
// done (ui_screenshot), and the user reviews each pair side by side in the conversation. The pictures are
// taken by the app's capture browser and kept in the data folder with the session, which they go with.
//
// Routes, signed in: GET /api/shots?key=, GET /api/shots/:id (the picture), GET /api/shots/:id/pair
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { UiShot } from '../../shared/shots.ts';
import { HttpError } from '../auth.ts';
import { canCapture, capture, setCaptureDb } from '../capture/index.ts';
import { config } from '../config.ts';
import type { DB } from '../db.ts';
import type { Feature, RunTool, ToolOutput } from '../features/types.ts';

const DIR = path.join(config.dataDir, 'shots');
/** All the pictures together stay under this; the oldest go first. */
const MAX_BYTES = 500 * 1024 * 1024;

export function initShots(db: DB) {
  db.exec(`
    create table if not exists ui_shots (
      id text primary key,
      key text not null,
      label text not null,
      phase text not null,
      viewport text not null,
      url text not null,
      title text not null default '',
      width integer not null,
      height integer not null,
      bytes integer not null,
      created_at integer not null
    );
    create index if not exists ui_shots_key on ui_shots(key, label, created_at);
  `);
}

interface Row {
  id: string;
  key: string;
  label: string;
  phase: UiShot['phase'];
  viewport: UiShot['viewport'];
  url: string;
  title: string;
  width: number;
  height: number;
  bytes: number;
  created_at: number;
}

const toShot = (r: Row): UiShot => ({ id: r.id, key: r.key, label: r.label, phase: r.phase, viewport: r.viewport, url: r.url, title: r.title, width: r.width, height: r.height, createdAt: r.created_at });
const fileOf = (id: string) => path.join(DIR, `${id}.webp`);

export function shotOf(db: DB, id: string): UiShot | null {
  const r = db.prepare('select * from ui_shots where id = ?').get(String(id)) as Row | undefined;
  return r ? toShot(r) : null;
}

/** The before picture an after one answers: the session's latest before of the same screen and size, taken earlier. */
export function pairOf(db: DB, after: UiShot): UiShot | null {
  const r = db
    .prepare("select * from ui_shots where key = ? and lower(label) = lower(?) and viewport = ? and phase = 'before' and created_at <= ? order by created_at desc limit 1")
    .get(after.key, after.label, after.viewport, after.createdAt) as Row | undefined;
  return r ? toShot(r) : null;
}

function keepWithin(db: DB) {
  const total = (db.prepare('select coalesce(sum(bytes), 0) as n from ui_shots').get() as { n: number }).n;
  if (total <= MAX_BYTES) return;
  let over = total - MAX_BYTES;
  for (const r of db.prepare('select id, bytes from ui_shots order by created_at').all() as { id: string; bytes: number }[]) {
    if (over <= 0) break;
    fs.rmSync(fileOf(r.id), { force: true });
    db.prepare('delete from ui_shots where id = ?').run(r.id);
    over -= r.bytes;
  }
}

function dropSession(db: DB, key: string) {
  for (const r of db.prepare('select id from ui_shots where key = ?').all(key) as { id: string }[]) fs.rmSync(fileOf(r.id), { force: true });
  db.prepare('delete from ui_shots where key = ?').run(key);
}

/** Where to look: an address, or an HTML file (from the session's folder, from home, or absolute). */
export function whereTo(raw: string, cwd: string): string {
  const s = raw.trim();
  if (!s) throw new Error('Give url: an address (http://localhost:5173/settings) or an HTML file.');
  if (/^https?:\/\//i.test(s)) {
    try {
      return new URL(s).href;
    } catch {
      throw new Error(`Not an address: ${s}`);
    }
  }
  // localhost:5173/x without a scheme.
  if (/^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(:\d+)?(\/|$)/i.test(s)) return new URL(`http://${s}`).href;
  if (/^[a-z][a-z0-9+.-]*:/i.test(s) && !/^file:/i.test(s)) throw new Error('Only http, https and HTML files can be pictured.');
  const p = s.startsWith('file://') ? new URL(s).pathname : s === '~' || s.startsWith('~/') ? path.join(os.homedir(), s.slice(1)) : path.resolve(cwd || config.defaultCwd, s);
  if (!/\.html?$/i.test(p)) throw new Error('A file to picture must be an HTML file (.html).');
  if (!fs.existsSync(p)) throw new Error(`There is no file at ${p}`);
  return `file://${p}`;
}

const VIEWPORTS = {
  desktop: { width: 1280, height: 800, scale: 1, mobile: false, max: 6000 },
  phone: { width: 390, height: 844, scale: 2, mobile: true, max: 4000 },
} as const;

const SHOT: RunTool = {
  name: 'ui_screenshot',
  description: [
    'Take a screenshot of a web page or app as the user would see it, for them to review: a dev server on this machine (http://localhost:5173/settings), any https site, or an HTML file.',
    'When you change how a web app looks or works: before your first edit, take phase "before" of each screen you will change (a short label per screen: "Settings page");',
    'when you are done, take phase "after" of the same screens with the same labels. The user sees each pair side by side in the conversation. Start the dev server first if it is not running.',
    'phase "check" just looks (no pair). viewport: "desktop" (1280×800, the default), "phone" (390×844) or "both". full_page: the whole page instead of its first screen.',
    'You get the picture back to check your work.',
  ].join(' '),
  annotations: { readOnlyHint: true },
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'An address (http://localhost:5173/settings) or an HTML file’s path.' },
      phase: { type: 'string', enum: ['before', 'after', 'check'], description: 'before your change, after it, or just a look.' },
      label: { type: 'string', description: 'Which screen it is, the same for its before and after: "Checkout page".' },
      viewport: { type: 'string', enum: ['desktop', 'phone', 'both'] },
      full_page: { type: 'boolean' },
      wait_ms: { type: 'number', description: 'Extra time to let the page settle after it loaded (animations, data), up to 10000.' },
    },
    required: ['url', 'phase', 'label'],
  },
  async run(a, ctx): Promise<ToolOutput> {
    const { db } = ctx.deps;
    if (!canCapture()) return { text: 'There is no Chromium on this computer to take screenshots with: the user can download one in Settings → Browser.', isError: true };
    const url = whereTo(String(a.url ?? ''), ctx.cwd);
    const phase: UiShot['phase'] = a.phase === 'before' || a.phase === 'after' ? a.phase : 'check';
    const label = String(a.label ?? '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'The page';
    const which: UiShot['viewport'][] = a.viewport === 'both' ? ['desktop', 'phone'] : a.viewport === 'phone' ? ['phone'] : ['desktop'];
    const settle = Math.min(10_000, Math.max(300, Number(a.wait_ms) || 800));
    fs.mkdirSync(DIR, { recursive: true, mode: 0o700 });
    const made: UiShot[] = [];
    const images: { data: string; mimeType: string }[] = [];
    for (const v of which) {
      const vp = VIEWPORTS[v];
      const o = { url, width: vp.width, height: vp.height, scale: vp.scale, mobile: vp.mobile, fullPage: !!a.full_page, maxHeight: vp.max, settleMs: settle };
      // The agent's own copy, smaller and of the first screen: enough to check its work.
      const shot = await capture({ ...o, format: 'webp', quality: 82, alt: { format: 'jpeg', quality: 68, outWidth: v === 'phone' ? 390 : 1024 } });
      const id = crypto.randomBytes(6).toString('hex');
      fs.writeFileSync(fileOf(id), shot.data, { mode: 0o600 });
      const now = Date.now();
      db.prepare('insert into ui_shots (id, key, label, phase, viewport, url, title, width, height, bytes, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
        id,
        ctx.key,
        label,
        phase,
        v,
        shot.url || url,
        shot.title,
        shot.width,
        shot.height,
        shot.data.length,
        now,
      );
      made.push(shotOf(db, id)!);
      if (shot.alt) images.push({ data: shot.alt.toString('base64'), mimeType: 'image/jpeg' });
    }
    keepWithin(db);
    ctx.deps.toSubscribers(ctx.key, { t: 'feature', id: 'shots', key: ctx.key, data: { what: 'shot', ids: made.map((s) => s.id) } });
    const ids = made.map((s) => s.id).join(', ');
    let note = '';
    if (phase === 'after') {
      const missing = made.filter((s) => !pairOf(db, s));
      note = missing.length
        ? ` There is no "before" screenshot labelled "${label}" (${missing.map((s) => s.viewport).join(', ')}) in this session, so the user sees only the after one: next time take the before one ahead of your first edit.`
        : ' The user sees it beside the before one.';
    } else if (phase === 'before') note = ' Take the "after" one with the same label when you are done.';
    const page = made[0]?.title ? ` (the page's title: "${made[0].title}")` : '';
    return { text: `Took the ${phase} screenshot of "${label}" at ${url}${page}, ${which.join(' and ')} (shot ${ids}).${note}`, images };
  },
};

const INSTRUCTIONS =
  'Web app changes: when you change how a web app looks or works in a browser (a frontend with a dev server, or HTML files; not Pages, which the user sees themselves), always show the user before and after screenshots with ui_screenshot: before your first edit, phase "before" of each screen you will change; when you are done, phase "after" of the same screens with the same labels. Start the app’s dev server first if it is not running.';

export const shots: Feature = {
  id: 'shots',
  routes(d) {
    const { app, db } = d;
    initShots(db);
    app.get('/api/shots', async (req) => {
      const key = String((req.query as { key?: string }).key ?? '');
      const rows = db.prepare('select * from ui_shots where key = ? order by created_at').all(key) as Row[];
      return { shots: rows.map(toShot) };
    });
    /** A shot and, for an after one, the before one it answers. */
    app.get('/api/shots/:id/pair', async (req) => {
      const s = shotOf(db, (req.params as { id: string }).id);
      if (!s) throw new HttpError(404, 'That screenshot is no longer kept');
      return { shot: s, before: s.phase === 'after' ? pairOf(db, s) : null };
    });
    app.get('/api/shots/:id', async (req, reply) => {
      const id = (req.params as { id: string }).id;
      if (!/^[a-f0-9]{12}$/.test(id) || !shotOf(db, id) || !fs.existsSync(fileOf(id))) return reply.code(404).send({ error: 'That screenshot is no longer kept' });
      return reply.header('Cache-Control', 'private, max-age=31536000, immutable').type('image/webp').send(fs.createReadStream(fileOf(id)));
    });
  },
  tools: () => [SHOT],
  spawn: () => (canCapture() ? { instructions: [INSTRUCTIONS] } : undefined),
  start(d) {
    setCaptureDb(d.db);
    d.sessions.on('sessions', (_upsert: unknown, removed: string[] = []) => {
      for (const key of removed ?? []) dropSession(d.db, key);
    });
  },
};
