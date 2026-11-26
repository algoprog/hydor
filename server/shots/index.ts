// Screenshots shown to the user, in one card in the conversation, by two tools:
//  - ui_screenshot: when an agent changes how a web app looks or works (a frontend with a dev server, or HTML
//    files), it takes screenshots of the screens it changes before its first edit and again when it is done,
//    taken by the app's capture browser (needs a Chromium); the user reviews each pair side by side.
//  - show_screenshots: screenshots an agent already has as files (taken with a script, another browser, a phone,
//    or given to it) are copied in, grouped under headings, the sizes and themes of a screen as versions of one
//    label, an optional before for a slider. Works without a Chromium.
// Both keep the pictures in the data folder with the session, which they go with (<id>.webp, .png, .jpg or .gif).
//
// Routes, signed in: GET /api/shots?key= (a session's), GET /api/shots/pairs?ids=a,b,c ({ pairs: ShotPair[] } in
// the order asked), GET /api/shots/:id (the picture, with its own type), GET /api/shots/:id/pair
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ShotPair, UiShot } from '../../shared/shots.ts';
import { HttpError } from '../auth.ts';
import { canCapture, capture, setCaptureDb } from '../capture/index.ts';
import { config } from '../config.ts';
import type { DB } from '../db.ts';
import { imageSize } from '../pages/ooxml.ts';
import type { Feature, RunTool, ToolOutput } from '../features/types.ts';
import { isKitPage, KIT_CSS } from '../../shared/page-kit.ts';

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
  // Columns added since the table was first created.
  const have = new Set((db.prepare('pragma table_info(ui_shots)').all() as { name: string }[]).map((c) => c.name));
  for (const col of ["theme text not null default ''", "section text not null default ''", "note text not null default ''", "mime text not null default 'image/webp'", "source text not null default 'capture'"]) {
    if (have.has(col.split(' ')[0])) continue;
    try {
      db.exec(`alter table ui_shots add column ${col}`);
    } catch {} // another connection got there first
  }
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
  theme: string;
  section: string;
  note: string;
  mime: string;
  source: string;
}

const toShot = (r: Row): UiShot => ({
  id: r.id,
  key: r.key,
  label: r.label,
  phase: r.phase,
  viewport: r.viewport,
  url: r.url,
  title: r.title,
  width: r.width,
  height: r.height,
  createdAt: r.created_at,
  ...(r.theme === 'dark' || r.theme === 'light' ? { theme: r.theme } : {}),
  ...(r.section ? { section: r.section } : {}),
  ...(r.note ? { note: r.note } : {}),
  source: r.source === 'file' ? 'file' : 'capture',
});
const EXT: Record<string, string> = { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif' };
const MIME: Record<string, string> = { webp: 'image/webp', png: 'image/png', jpeg: 'image/jpeg', gif: 'image/gif' };
const fileOf = (id: string, mime = 'image/webp') => path.join(DIR, `${id}.${EXT[mime] ?? 'webp'}`);
/** The picture's file of a stored row. */
const fileOfRow = (r: { id: string; mime?: string }) => fileOf(r.id, r.mime);

export function shotOf(db: DB, id: string): UiShot | null {
  const r = db.prepare('select * from ui_shots where id = ?').get(String(id)) as Row | undefined;
  return r ? toShot(r) : null;
}

/**
 * The before picture an after one answers: the session's latest before of the same screen (label in any case),
 * size and heading, in the same theme (or either with none known), taken earlier.
 */
export function pairOf(db: DB, after: UiShot): UiShot | null {
  const r = db
    .prepare(
      "select * from ui_shots where key = ? and lower(label) = lower(?) and viewport = ? and section = ? and phase = 'before' and (theme = ? or theme = '' or ? = '') and created_at <= ? order by created_at desc limit 1",
    )
    .get(after.key, after.label, after.viewport, after.section ?? '', after.theme ?? '', after.theme ?? '', after.createdAt) as Row | undefined;
  return r ? toShot(r) : null;
}

function keepWithin(db: DB) {
  const total = (db.prepare('select coalesce(sum(bytes), 0) as n from ui_shots').get() as { n: number }).n;
  if (total <= MAX_BYTES) return;
  let over = total - MAX_BYTES;
  for (const r of db.prepare('select id, bytes, mime from ui_shots order by created_at').all() as { id: string; bytes: number; mime: string }[]) {
    if (over <= 0) break;
    fs.rmSync(fileOfRow(r), { force: true });
    db.prepare('delete from ui_shots where id = ?').run(r.id);
    over -= r.bytes;
  }
}

function dropSession(db: DB, key: string) {
  for (const r of db.prepare('select id, mime from ui_shots where key = ?').all(key) as { id: string; mime: string }[]) fs.rmSync(fileOfRow(r), { force: true });
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

/** The file a file:// address from whereTo names (its path as given, or percent-encoded from a file:// address). */
export function pathOf(url: string): string {
  const raw = url.slice('file://'.length);
  if (fs.existsSync(raw)) return raw;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/**
 * An HTML file made with the page kit (its body is .n-page): a page for show_html or save_page, which the app
 * shows with the kit's stylesheet and in the app's light or dark, so its screenshot shows it so too.
 */
export function kitPage(file: string): boolean {
  try {
    if (fs.statSync(file).size > 20 * 1024 * 1024) return false;
    return isKitPage(fs.readFileSync(file, 'utf8'));
  } catch {
    return false;
  }
}

/**
 * What the app adds to a kit page before its own styles and scripts: the kit's stylesheet first (the page's own
 * rules come after it and win), and its light or dark. A page saved as a file that carries the kit already keeps
 * its own.
 */
export function kitScript(theme: 'light' | 'dark'): string {
  const css = JSON.stringify(KIT_CSS);
  return `(()=>{if(window.top!==window)return;const put=()=>{const r=document.documentElement;r.setAttribute('data-n-theme',${JSON.stringify(theme)});if(document.getElementById('n-kit'))return;const s=document.createElement('style');s.id='n-kit';s.textContent=${css};(document.head||r).prepend(s)};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',put,{once:true});else put()})()`;
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
    'theme: "dark" or "light", the colour scheme the page is told the device prefers (the browser’s light when not given).',
    'An HTML file made with the page kit (<body class="n-page">, a page for show_html or save_page) is shown as the app shows it, with the kit and in its dark theme unless theme is "light": look at a page you wrote before you show it.',
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
      theme: { type: 'string', enum: ['dark', 'light'], description: 'The colour scheme to show the page in. A page made with the page kit shows in the dark when not given.' },
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
    // A page made with the kit, as the app shows it: the kit's stylesheet and the app's dark (or light) theme.
    const asked = a.theme === 'dark' || a.theme === 'light' ? a.theme : undefined;
    const kit = url.startsWith('file://') && kitPage(pathOf(url));
    const theme = asked ?? (kit ? 'dark' : undefined);
    fs.mkdirSync(DIR, { recursive: true, mode: 0o700 });
    const made: UiShot[] = [];
    const images: { data: string; mimeType: string }[] = [];
    for (const v of which) {
      const vp = VIEWPORTS[v];
      const o = { url, width: vp.width, height: vp.height, scale: vp.scale, mobile: vp.mobile, fullPage: !!a.full_page, maxHeight: vp.max, settleMs: settle, colorScheme: theme, firstScript: kit ? kitScript(theme!) : undefined };
      // The agent's own copy, smaller and of the first screen: enough to check its work.
      const shot = await capture({ ...o, format: 'webp', quality: 82, alt: { format: 'jpeg', quality: 68, outWidth: v === 'phone' ? 390 : 1024 } });
      const id = crypto.randomBytes(6).toString('hex');
      fs.writeFileSync(fileOf(id), shot.data, { mode: 0o600 });
      const now = Date.now();
      db.prepare('insert into ui_shots (id, key, label, phase, viewport, url, title, width, height, bytes, created_at, theme, source) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
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
        theme ?? '',
        'capture',
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
    const look = kit
      ? ` It shows the page as the app does, with the page kit, in the ${theme} theme${asked ? '' : ' (theme "light" for the light one)'}.`
      : theme
        ? ` The page was told the device prefers ${theme}.`
        : '';
    return { text: `Took the ${phase} screenshot of "${label}" at ${url}${page}, ${which.join(' and ')} (shot ${ids}).${look}${note}`, images };
  },
};

const MAX_FILE = 25 * 1024 * 1024;

/** A picture's path as an agent gives it: absolute, ~ or ~/…, file://…, or relative to its folder. */
function pictureAt(raw: string, cwd: string): string {
  const s = raw.trim();
  if (/^file:/i.test(s)) {
    try {
      return fileURLToPath(s);
    } catch {
      return s.replace(/^file:\/\//i, '');
    }
  }
  if (s === '~' || s.startsWith('~/')) return path.join(os.homedir(), s.slice(1));
  return path.resolve(cwd || config.defaultCwd, s);
}

const themeOfName = (file: string): UiShot['theme'] | undefined => {
  const name = path.basename(file, path.extname(file));
  return /(^|[^a-z])dark([^a-z]|$)/i.test(name) ? 'dark' : /(^|[^a-z])light([^a-z]|$)/i.test(name) ? 'light' : undefined;
};

/** A picture file read and checked: its bytes, type and size, or why it cannot be shown. */
function readPicture(raw: string, cwd: string): { file: string; data: Buffer; mime: string; w: number; h: number } | { file: string; error: string } {
  const file = pictureAt(raw, cwd);
  let st: fs.Stats;
  try {
    st = fs.statSync(file);
  } catch {
    return { file, error: 'no such file' };
  }
  if (!st.isFile()) return { file, error: 'no such file' };
  if (st.size > MAX_FILE) return { file, error: 'larger than 25 MB' };
  let data: Buffer;
  try {
    data = fs.readFileSync(file);
  } catch (e) {
    return { file, error: `cannot be read (${(e as Error).message})` };
  }
  const size = imageSize(data);
  if (!size) return { file, error: 'not a PNG, JPEG, WebP or GIF picture' };
  return { file, data, mime: MIME[size.type], w: size.w, h: size.h };
}

const SHOW: RunTool = {
  name: 'show_screenshots',
  description:
    "Show the user screenshots you already have as files (taken with a script such as Playwright, another browser, a phone, or files you were given) as one card in the conversation, instead of pictures in your reply: a small picture per screen, under the headings you group them by, each opening a review beside the conversation with arrows to the others. The versions of one screen (the same label: its computer and phone sizes, its dark and light themes) show as one, with switches; give before (the path of the screen before your change) to show it beside the after one with a slider. Put all of a reply's screenshots in one call, in the order to show them. The pictures are copied and kept with the session, so they stay when you remove your copies. PNG, JPEG, WebP or GIF; up to 120 pictures.",
  annotations: { readOnlyHint: true },
  inputSchema: {
    type: 'object',
    properties: {
      shots: {
        type: 'array',
        minItems: 1,
        maxItems: 120,
        items: {
          type: 'object',
          properties: {
            file: { type: 'string', description: "The picture's path: absolute, ~/…, or in your folder." },
            label: { type: 'string', description: 'The screen it shows, the same for its versions: "Checkout page".' },
            group: { type: 'string', description: 'A heading the screen shows under; screens of the same group show together, in the order first given: "Adding a server".' },
            viewport: { type: 'string', enum: ['desktop', 'phone'], description: 'Guessed from its size when left out.' },
            theme: { type: 'string', enum: ['dark', 'light'], description: "Guessed from the file's name (…-dark-…) when left out." },
            before: { type: 'string', description: 'The path of the same screen before your change, to compare with this one.' },
            note: { type: 'string', description: 'One line about it, shown in its review.' },
          },
          required: ['file', 'label'],
        },
      },
    },
    required: ['shots'],
  },
  async run(a, ctx): Promise<ToolOutput> {
    const { db } = ctx.deps;
    const entries = Array.isArray(a.shots) ? (a.shots as Record<string, unknown>[]).slice(0, 120) : [];
    if (!entries.length) return { text: 'Give shots: a list of { file, label } to show.', isError: true };
    fs.mkdirSync(DIR, { recursive: true, mode: 0o700 });
    const insert = db.prepare(
      'insert into ui_shots (id, key, label, phase, viewport, url, title, width, height, bytes, created_at, theme, section, note, mime, source) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );
    type Pic = Exclude<ReturnType<typeof readPicture>, { error: string }>;
    const store = (p: Pic, o: { label: string; phase: UiShot['phase']; viewport: UiShot['viewport']; theme: string; section: string; note: string; at: number }) => {
      const id = crypto.randomBytes(6).toString('hex');
      fs.writeFileSync(fileOf(id, p.mime), p.data, { mode: 0o600 });
      insert.run(id, ctx.key, o.label, o.phase, o.viewport, `file://${p.file}`, '', p.w, p.h, p.data.length, o.at, o.theme, o.section, o.note, p.mime, 'file');
      return id;
    };
    const shown: string[] = [];
    const all: string[] = [];
    const screens = new Set<string>();
    const failed: string[] = [];
    let last = 0;
    for (const e of entries) {
      const raw = String(e?.file ?? '').trim();
      const pic = raw ? readPicture(raw, ctx.cwd) : ({ file: '', error: 'no file given' } as const);
      if ('error' in pic) {
        failed.push(`${raw || '(no path)'}: ${pic.error}`);
        continue;
      }
      const label = String(e.label ?? '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'The page';
      const section = String(e.group ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
      const note = String(e.note ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
      const viewport: UiShot['viewport'] = e.viewport === 'desktop' || e.viewport === 'phone' ? e.viewport : pic.w < 1000 && pic.h > pic.w ? 'phone' : 'desktop';
      const theme = e.theme === 'dark' || e.theme === 'light' ? e.theme : (themeOfName(pic.file) ?? '');
      const meta = { label, viewport, theme, section, note };
      let phase: UiShot['phase'] = 'check';
      let at = Math.max(Date.now(), last + 1);
      const beforeRaw = String(e.before ?? '').trim();
      if (beforeRaw) {
        const prev = readPicture(beforeRaw, ctx.cwd);
        if ('error' in prev) failed.push(`${beforeRaw} (the before picture of "${label}"): ${prev.error}`);
        else {
          all.push(store(prev, { ...meta, phase: 'before', at }));
          phase = 'after';
          at++;
        }
      }
      last = at;
      const id = store(pic, { ...meta, phase, at });
      shown.push(id);
      all.push(id);
      screens.add(`${section.toLowerCase()}\n${label.toLowerCase()}`);
    }
    const list = failed.length ? `\nNot shown:\n${failed.map((f) => `- ${f}`).join('\n')}` : '';
    if (!shown.length) return { text: `None of the pictures could be shown.${list}`, isError: true };
    keepWithin(db);
    ctx.deps.toSubscribers(ctx.key, { t: 'feature', id: 'shots', key: ctx.key, data: { what: 'shot', ids: all } });
    return {
      text: `Showed the user ${screens.size} screen${screens.size === 1 ? '' : 's'} (${shown.length} picture${shown.length === 1 ? '' : 's'}) in one card (shot ${shown.join(', ')}). They are kept with this session, so they stay after you remove your copies.${list}`,
    };
  },
};

const INSTRUCTIONS_SHOW =
  "Screenshots you already have as files (taken with a script, another browser or tool, or given to you): show them with show_screenshots, all of a reply's in one call, a label per screen, its sizes and themes as versions of the same label, and a group for each part, instead of pictures in your reply (![…](…)), which the user has to scroll through one by one.";

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
    app.get('/api/shots/pairs', async (req) => {
      const ids = String((req.query as { ids?: string }).ids ?? '')
        .split(',')
        .filter((x) => /^[a-f0-9]{12}$/.test(x))
        .slice(0, 300);
      const pairs: ShotPair[] = [];
      for (const id of ids) {
        const shot = shotOf(db, id);
        if (shot) pairs.push({ shot, before: shot.phase === 'after' ? pairOf(db, shot) : null });
      }
      return { pairs };
    });
    app.get('/api/shots/:id/pair', async (req) => {
      const s = shotOf(db, (req.params as { id: string }).id);
      if (!s) throw new HttpError(404, 'That screenshot is no longer kept');
      return { shot: s, before: s.phase === 'after' ? pairOf(db, s) : null };
    });
    app.get('/api/shots/:id', async (req, reply) => {
      const id = (req.params as { id: string }).id;
      const row = /^[a-f0-9]{12}$/.test(id) ? (db.prepare('select id, mime from ui_shots where id = ?').get(id) as { id: string; mime: string } | undefined) : undefined;
      if (!row || !fs.existsSync(fileOfRow(row))) return reply.code(404).send({ error: 'That screenshot is no longer kept' });
      return reply.header('Cache-Control', 'private, max-age=31536000, immutable').type(row.mime).send(fs.createReadStream(fileOfRow(row)));
    });
  },
  tools: () => [SHOT, SHOW],
  spawn: () => ({ instructions: canCapture() ? [INSTRUCTIONS, INSTRUCTIONS_SHOW] : [INSTRUCTIONS_SHOW] }),
  start(d) {
    setCaptureDb(d.db);
    d.sessions.on('sessions', (_upsert: unknown, removed: string[] = []) => {
      for (const key of removed ?? []) dropSession(d.db, key);
    });
  },
};
