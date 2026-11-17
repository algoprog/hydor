// Your own bookmarks (the Browser page's bookmarks bar and Other bookmarks), kept in the app's key-value store, and
// the ways in and out: the bookmarks of the other browsers on this computer (Chrome and the browsers built on it,
// Firefox, Safari), a bookmarks file any browser exports (the Netscape HTML format), and your own export of it.
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import type { FastifyRequest } from 'fastify';
import { BOOKMARK_ROOTS, type BookmarkNode, type BookmarkSource } from '../../shared/browser.ts';
import { HttpError } from '../auth.ts';
import { kvGet, kvSet, type DB } from '../db.ts';
import type { Deps } from '../features/types.ts';

const KEY = 'browser.bookmarks';
export const MAX_BOOKMARKS = 20_000;
const MAX_HTML = 20 * 1024 * 1024;
const TITLE_MAX = 300;
const URL_MAX = 4000;
const DEPTH_MAX = 40;
const SAFARI_DENIED = 'Hydor may not read Safari’s bookmarks: allow it in System Settings → Privacy & Security → Full Disk Access';

const B = (req: FastifyRequest) => (req.body ?? {}) as Record<string, unknown>;
const isRoot = (id: string) => (BOOKMARK_ROOTS as readonly string[]).includes(id);

// ---- the stored bookmarks ----------------------------------------------------------------------------

/** A bookmark or folder as another browser (or a file) has it, before it gets an id and a place. */
interface Imp {
  title: string;
  url?: string;
  children?: Imp[];
  /** When it was added, in milliseconds. */
  added?: number;
  /** In a file: the folder its browser marks as the bookmarks bar. */
  bar?: boolean;
}

export function loadBookmarks(db: DB): BookmarkNode[] {
  let raw: unknown;
  try {
    raw = JSON.parse(kvGet(db, KEY) ?? '[]');
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  return raw.filter((n) => n && typeof n.id === 'string' && typeof n.parent === 'string' && typeof n.title === 'string') as BookmarkNode[];
}

/** Puts every folder's items in order and numbers them from 0, then keeps them. Equal places keep the order they have. */
function save(db: DB, nodes: BookmarkNode[]): BookmarkNode[] {
  const order = new Map(nodes.map((n, i) => [n, i]));
  const by = new Map<string, BookmarkNode[]>();
  for (const n of nodes) by.set(n.parent, [...(by.get(n.parent) ?? []), n]);
  for (const list of by.values()) {
    list.sort((a, b) => (a.pos ?? 0) - (b.pos ?? 0) || order.get(a)! - order.get(b)!);
    list.forEach((n, i) => (n.pos = i));
  }
  kvSet(db, KEY, JSON.stringify(nodes));
  return nodes;
}

const newId = (nodes: BookmarkNode[]) => {
  const used = new Set(nodes.map((n) => n.id));
  for (;;) {
    const id = crypto.randomBytes(5).toString('hex');
    if (!used.has(id)) return id;
  }
};

/** An address a bookmark may have: a web page, a local file or a page of an extension. Anything else (javascript:, data:, about:…) is not. */
export function bookmarkUrl(v: unknown): string | null {
  const s = String(v ?? '').trim();
  if (!s) return null;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (!['http:', 'https:', 'file:', 'chrome-extension:'].includes(u.protocol)) return null;
  return s.slice(0, URL_MAX);
}

const cleanTitle = (v: unknown, fallback: string) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, TITLE_MAX) || fallback;

const siblings = (nodes: BookmarkNode[], parent: string, except?: BookmarkNode) =>
  nodes.filter((n) => n.parent === parent && n !== except).sort((a, b) => a.pos - b.pos);

/** Puts a node in a folder at a place (the end when none), then numbers that folder's items again; `save` does the old folder's. */
function place(nodes: BookmarkNode[], node: BookmarkNode, parent: string, pos: number | undefined) {
  const list = siblings(nodes, parent, node);
  const at = pos === undefined ? list.length : Math.max(0, Math.min(list.length, Math.floor(pos)));
  list.splice(at, 0, node);
  node.parent = parent;
  list.forEach((n, i) => (n.pos = i));
}

function wantedPos(v: unknown): number | undefined {
  if (v === undefined || v === null) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new HttpError(400, 'The place must be a number.');
  return n;
}

function folderOf(nodes: BookmarkNode[], id: string) {
  if (isRoot(id)) return;
  const f = nodes.find((n) => n.id === id);
  if (!f) throw new HttpError(404, 'That folder is not there.');
  if (f.url !== undefined) throw new HttpError(400, 'A bookmark cannot hold other bookmarks.');
}

function descendants(nodes: BookmarkNode[], id: string): Set<string> {
  const out = new Set<string>();
  const stack = [id];
  while (stack.length) {
    const p = stack.pop()!;
    for (const n of nodes) if (n.parent === p && !out.has(n.id)) (out.add(n.id), stack.push(n.id));
  }
  return out;
}

export function addBookmark(db: DB, b: { title?: unknown; url?: unknown; parent?: unknown; pos?: unknown }): { node: BookmarkNode; nodes: BookmarkNode[] } {
  const nodes = loadBookmarks(db);
  if (nodes.length >= MAX_BOOKMARKS) throw new HttpError(400, `You have as many bookmarks as fit (${MAX_BOOKMARKS.toLocaleString('en-US')}). Delete some first.`);
  const isLink = b.url !== undefined && b.url !== null && String(b.url).trim() !== '';
  const url = isLink ? bookmarkUrl(b.url) : undefined;
  if (isLink && !url) throw new HttpError(400, 'A bookmark’s address must start with http://, https://, file:// or chrome-extension://.');
  const parent = b.parent === undefined || b.parent === null || b.parent === '' ? 'bar' : String(b.parent);
  folderOf(nodes, parent);
  const node: BookmarkNode = { id: newId(nodes), title: cleanTitle(b.title, url ?? 'New folder'), parent, pos: 0, addedAt: Date.now() };
  if (url) node.url = url;
  nodes.push(node);
  place(nodes, node, parent, wantedPos(b.pos));
  return { node, nodes: save(db, nodes) };
}

export function changeBookmark(db: DB, id: string, b: { title?: unknown; url?: unknown; parent?: unknown; pos?: unknown }): BookmarkNode[] {
  const nodes = loadBookmarks(db);
  const node = nodes.find((n) => n.id === id);
  if (!node) throw new HttpError(404, 'That bookmark is not there.');
  const pos = wantedPos(b.pos);
  if (b.url !== undefined) {
    if (node.url === undefined) throw new HttpError(400, 'A folder has no address.');
    const url = bookmarkUrl(b.url);
    if (!url) throw new HttpError(400, 'A bookmark’s address must start with http://, https://, file:// or chrome-extension://.');
    node.url = url;
  }
  if (b.title !== undefined) node.title = cleanTitle(b.title, node.url ?? 'New folder');
  if (b.parent !== undefined || pos !== undefined) {
    const parent = b.parent === undefined || b.parent === null || b.parent === '' ? node.parent : String(b.parent);
    folderOf(nodes, parent);
    if (parent === node.id || descendants(nodes, node.id).has(parent)) throw new HttpError(400, 'A folder cannot go into itself.');
    place(nodes, node, parent, pos);
  }
  return save(db, nodes);
}

export function removeBookmark(db: DB, id: string): BookmarkNode[] {
  const nodes = loadBookmarks(db);
  if (!nodes.some((n) => n.id === id)) throw new HttpError(404, 'That bookmark is not there.');
  const gone = descendants(nodes, id);
  gone.add(id);
  return save(
    db,
    nodes.filter((n) => !gone.has(n.id)),
  );
}

// ---- importing -------------------------------------------------------------------------------------------

/** Drops what a bookmark list cannot hold (links that are not web pages, empty folders, nesting past what a person makes) and tidies titles. */
function tidy(items: Imp[], depth = 0): Imp[] {
  const out: Imp[] = [];
  for (const it of items) {
    if (it.children) {
      if (depth >= DEPTH_MAX) continue;
      const kids = tidy(it.children, depth + 1);
      if (kids.length) out.push({ title: cleanTitle(it.title, 'Folder'), children: kids, added: it.added });
    } else {
      const url = bookmarkUrl(it.url);
      if (url) out.push({ title: cleanTitle(it.title, url), url, added: it.added });
    }
  }
  return out;
}

const countLinks = (items: Imp[]): number => items.reduce((n, it) => n + (it.children ? countLinks(it.children) : 1), 0);

/** Adds what was read as one new folder at the end of the bookmarks bar, up to what the cap leaves room for. */
export function importInto(db: DB, name: string, items: Imp[]): { added: number; folder: BookmarkNode; nodes: BookmarkNode[] } {
  const tree = tidy(items);
  if (!tree.length) throw new HttpError(400, 'There are no bookmarks to import there.');
  const nodes = loadBookmarks(db);
  let room = MAX_BOOKMARKS - nodes.length - 1;
  if (room <= 0) throw new HttpError(400, `You have as many bookmarks as fit (${MAX_BOOKMARKS.toLocaleString('en-US')}). Delete some first.`);
  const folder: BookmarkNode = { id: newId(nodes), title: cleanTitle(name, 'Imported bookmarks'), parent: 'bar', pos: siblings(nodes, 'bar').length, addedAt: Date.now() };
  nodes.push(folder);
  const used = new Set(nodes.map((n) => n.id));
  let added = 0;
  const now = Date.now();
  const graft = (list: Imp[], parent: string) => {
    let pos = 0;
    for (const it of list) {
      if (room <= 0) return;
      let id: string;
      do id = crypto.randomBytes(5).toString('hex');
      while (used.has(id));
      used.add(id);
      const node: BookmarkNode = { id, title: it.title, parent, pos, addedAt: it.added && it.added > 0 && it.added <= now ? it.added : now };
      if (!it.children) {
        node.url = it.url;
        nodes.push(node);
        room--;
        added++;
        pos++;
        continue;
      }
      const at = nodes.length;
      nodes.push(node);
      room--;
      graft(it.children, id);
      if (nodes.length === at + 1) {
        nodes.pop();
        room++;
      } else pos++;
    }
  };
  graft(tree, folder.id);
  return { added, folder, nodes: save(db, nodes) };
}

// ---- the other browsers on this computer -----------------------------------------------------------

interface Candidate {
  info: Omit<BookmarkSource, 'count' | 'error'>;
  load: () => Promise<Imp[]> | Imp[];
}

interface ChromiumKind {
  key: string;
  name: string;
  /** Its user data folders on this system. */
  dirs: (h: Dirs) => string[];
}

interface Dirs {
  home: string;
  config: string;
  mac: string;
  local: string;
  roaming: string;
}

function dirsNow(): Dirs {
  const home = os.homedir();
  return {
    home,
    config: process.env.XDG_CONFIG_HOME || path.join(home, '.config'),
    mac: path.join(home, 'Library', 'Application Support'),
    local: process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'),
    roaming: process.env.APPDATA || path.join(home, 'AppData', 'Roaming'),
  };
}

const by = (linux: string[], mac: string[], win: (h: Dirs) => string[] = () => []) => (h: Dirs) =>
  process.platform === 'darwin' ? mac.map((p) => path.join(h.mac, p)) : process.platform === 'win32' ? win(h) : linux.map((p) => (p.startsWith('~/') ? path.join(h.home, p.slice(2)) : path.join(h.config, p)));

const flatpak = (app: string, rest: string) => `~/.var/app/${app}/config/${rest}`;

const CHROMIUMS: ChromiumKind[] = [
  { key: 'chrome', name: 'Google Chrome', dirs: by(['google-chrome', flatpak('com.google.Chrome', 'google-chrome')], ['Google/Chrome'], (h) => [path.join(h.local, 'Google', 'Chrome', 'User Data')]) },
  { key: 'chrome-beta', name: 'Google Chrome Beta', dirs: by(['google-chrome-beta'], []) },
  { key: 'chromium', name: 'Chromium', dirs: by(['chromium', '~/snap/chromium/common/chromium', flatpak('org.chromium.Chromium', 'chromium')], ['Chromium'], (h) => [path.join(h.local, 'Chromium', 'User Data')]) },
  { key: 'edge', name: 'Microsoft Edge', dirs: by(['microsoft-edge', flatpak('com.microsoft.Edge', 'microsoft-edge')], ['Microsoft Edge'], (h) => [path.join(h.local, 'Microsoft', 'Edge', 'User Data')]) },
  { key: 'brave', name: 'Brave', dirs: by(['BraveSoftware/Brave-Browser', flatpak('com.brave.Browser', 'BraveSoftware/Brave-Browser')], ['BraveSoftware/Brave-Browser'], (h) => [path.join(h.local, 'BraveSoftware', 'Brave-Browser', 'User Data')]) },
  { key: 'vivaldi', name: 'Vivaldi', dirs: by(['vivaldi'], ['Vivaldi'], (h) => [path.join(h.local, 'Vivaldi', 'User Data')]) },
  { key: 'opera', name: 'Opera', dirs: by(['opera'], ['com.operasoftware.Opera'], (h) => [path.join(h.roaming, 'Opera Software', 'Opera Stable')]) },
  { key: 'arc', name: 'Arc', dirs: by([], ['Arc/User Data']) },
];

function readJson(file: string): any {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
  } catch {
    return undefined;
  }
}

/** Chrome keeps dates as microseconds since 1601. */
const chromeTime = (v: unknown) => {
  const ms = Number(v) / 1000 - 11_644_473_600_000;
  return Number.isFinite(ms) && ms > 0 ? ms : undefined;
};

function chromeNode(n: any): Imp | null {
  if (!n || typeof n !== 'object') return null;
  if (n.type === 'folder') return { title: String(n.name ?? ''), children: (Array.isArray(n.children) ? n.children : []).map(chromeNode).filter((x: Imp | null): x is Imp => !!x), added: chromeTime(n.date_added) };
  if (n.type === 'url') return { title: String(n.name ?? ''), url: String(n.url ?? ''), added: chromeTime(n.date_added) };
  return null;
}

/** Its bookmarks bar's items first as they are, then its other roots as folders under the names that browser gives them. */
function chromeFile(file: string): Imp[] {
  const j = readJson(file);
  if (!j?.roots) throw new Error('Its bookmarks file cannot be read.');
  const out: Imp[] = [...(chromeNode(j.roots.bookmark_bar)?.children ?? [])];
  const more: [string, string][] = [['other', 'Other bookmarks'], ['synced', 'Mobile bookmarks']];
  for (const [k, fallback] of more) {
    const f = chromeNode(j.roots[k]);
    if (f?.children?.length) out.push({ ...f, title: f.title || fallback });
  }
  return out;
}

function chromiumCandidates(h: Dirs): Candidate[] {
  const found: Candidate[] = [];
  for (const kind of CHROMIUMS) {
    for (const [di, dir] of kind.dirs(h).entries()) {
      if (!fs.existsSync(dir)) continue;
      // The variants of one browser (Snap, Flatpak) get their own ids.
      const key = di === 0 ? kind.key : `${kind.key}-${di + 1}`;
      const names = readJson(path.join(dir, 'Local State'))?.profile?.info_cache ?? {};
      const folders = new Set<string>(Object.keys(names));
      try {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) if (e.isDirectory() && /^(Default|Profile \d+)$/.test(e.name)) folders.add(e.name);
      } catch {}
      const mine: { folder: string; file: string }[] = [];
      // Opera keeps its bookmarks at the top, with no profile folders.
      if (fs.existsSync(path.join(dir, 'Bookmarks'))) mine.push({ folder: '', file: path.join(dir, 'Bookmarks') });
      for (const folder of [...folders].sort((a, b) => (a === 'Default' ? -1 : b === 'Default' ? 1 : a.localeCompare(b, 'en', { numeric: true })))) {
        const file = path.join(dir, folder, 'Bookmarks');
        if (fs.existsSync(file)) mine.push({ folder, file });
      }
      for (const m of mine) {
        found.push({
          info: { id: `${key}:${m.folder || 'Default'}`, browser: kind.name, profile: mine.length > 1 ? String(names[m.folder]?.name || m.folder || 'Default') : undefined },
          load: () => chromeFile(m.file),
        });
      }
    }
  }
  return found;
}

// Firefox

const FIREFOX_DIRS = (h: Dirs) =>
  process.platform === 'darwin'
    ? [path.join(h.mac, 'Firefox')]
    : process.platform === 'win32'
      ? [path.join(h.roaming, 'Mozilla', 'Firefox')]
      : [path.join(h.home, '.mozilla', 'firefox'), path.join(h.home, 'snap', 'firefox', 'common', '.mozilla', 'firefox'), path.join(h.home, '.var', 'app', 'org.mozilla.firefox', '.mozilla', 'firefox')];

/** The profiles profiles.ini lists: their names and folders. */
function firefoxProfiles(dir: string): { name: string; folder: string }[] {
  let ini: string;
  try {
    ini = fs.readFileSync(path.join(dir, 'profiles.ini'), 'utf8');
  } catch {
    return [];
  }
  const out: { name: string; folder: string }[] = [];
  let sec: Record<string, string> | null = null;
  const flush = () => {
    if (sec?.Path) out.push({ name: sec.Name || path.basename(sec.Path), folder: sec.IsRelative === '0' ? sec.Path : path.join(dir, sec.Path) });
    sec = null;
  };
  for (const raw of ini.split(/\r?\n/)) {
    const line = raw.trim();
    const m = /^\[(.*)\]$/.exec(line);
    if (m) {
      flush();
      sec = /^Profile\d+$/i.test(m[1]) ? {} : null;
    } else if (sec) {
      const i = line.indexOf('=');
      if (i > 0) sec[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
  }
  flush();
  return out;
}

function firefoxFile(profileDir: string): Imp[] {
  const src = path.join(profileDir, 'places.sqlite');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-places-'));
  try {
    // Firefox locks the file while it runs: read a copy, with the log it has not folded in yet.
    fs.copyFileSync(src, path.join(tmp, 'places.sqlite'));
    if (fs.existsSync(`${src}-wal`)) fs.copyFileSync(`${src}-wal`, path.join(tmp, 'places.sqlite-wal'));
    let db: Database.Database;
    try {
      db = new Database(path.join(tmp, 'places.sqlite'), { readonly: true, fileMustExist: true });
      db.prepare('select 1 from moz_bookmarks limit 1').get();
    } catch {
      db = new Database(path.join(tmp, 'places.sqlite'), { fileMustExist: true });
    }
    try {
      const rows = db
        .prepare('select b.id, b.type, b.parent, b.position, b.title, b.guid, b.dateAdded, p.url from moz_bookmarks b left join moz_places p on p.id = b.fk order by b.parent, b.position')
        .all() as { id: number; type: number; parent: number; position: number; title: string | null; guid: string; dateAdded: number | null; url: string | null }[];
      const kids = new Map<number, typeof rows>();
      for (const r of rows) kids.set(r.parent, [...(kids.get(r.parent) ?? []), r]);
      const build = (r: (typeof rows)[number], depth: number): Imp | null => {
        const added = r.dateAdded ? r.dateAdded / 1000 : undefined;
        if (r.type === 1) return r.url ? { title: r.title ?? '', url: r.url, added } : null;
        if (r.type !== 2 || depth > DEPTH_MAX) return null;
        return { title: r.title ?? '', added, children: (kids.get(r.id) ?? []).map((k) => build(k, depth + 1)).filter((x): x is Imp => !!x) };
      };
      const root = (guid: string, title: string): Imp => {
        const r = rows.find((x) => x.guid === guid);
        return r ? { ...(build(r, 0) as Imp), title } : { title, children: [] };
      };
      const out: Imp[] = [...(root('toolbar_____', 'Bookmarks Toolbar').children ?? [])];
      for (const [guid, title] of [['menu________', 'Bookmarks Menu'], ['unfiled_____', 'Other Bookmarks'], ['mobile______', 'Mobile Bookmarks']]) {
        const f = root(guid, title);
        if (f.children?.length) out.push(f);
      }
      return out;
    } finally {
      db.close();
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function firefoxCandidates(h: Dirs): Candidate[] {
  const found: Candidate[] = [];
  for (const dir of FIREFOX_DIRS(h)) {
    const ps = firefoxProfiles(dir).filter((p) => fs.existsSync(path.join(p.folder, 'places.sqlite')));
    for (const p of ps) {
      found.push({ info: { id: `firefox:${path.basename(p.folder)}`, browser: 'Firefox', profile: ps.length > 1 ? p.name : undefined }, load: () => firefoxFile(p.folder) });
    }
  }
  return found;
}

// Safari: a binary property list, turned into XML by plutil and read by a small parser of that XML.

const XML_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const c = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(c) && c > 0 && c <= 0x10ffff ? String.fromCodePoint(c) : m;
    }
    return XML_ENTITIES[e.toLowerCase()] ?? m;
  });

type Plist = string | number | boolean | Plist[] | { [k: string]: Plist } | null;

export function parsePlist(xml: string): Plist {
  const text = xml.replace(/<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<!--[\s\S]*?-->/g, '');
  const re = /<(\/?)([A-Za-z]+)(?:\s[^>]*?)?(\/?)>|([^<]+)/g;
  const tokens: { close: boolean; tag: string; self: boolean; text?: string }[] = [];
  for (let m: RegExpExecArray | null; (m = re.exec(text)); ) {
    if (m[2]) tokens.push({ close: !!m[1], tag: m[2], self: !!m[3] });
    else if (m[4]?.trim()) tokens.push({ close: false, tag: '', self: false, text: m[4] });
  }
  let i = 0;
  const textUntil = (tag: string) => {
    let s = '';
    while (i < tokens.length && !(tokens[i].close && tokens[i].tag === tag)) s += tokens[i++].text ?? '';
    i++;
    return decode(s);
  };
  const value = (depth: number): Plist => {
    const t = tokens[i++];
    if (!t || depth > 200) return null;
    if (t.close) return null;
    switch (t.tag) {
      case 'true':
        return true;
      case 'false':
        return false;
      case 'string':
      case 'date':
      case 'data':
        return t.self ? '' : textUntil(t.tag);
      case 'integer':
      case 'real':
        return Number(textUntil(t.tag));
      case 'array': {
        const a: Plist[] = [];
        if (t.self) return a;
        while (i < tokens.length && !(tokens[i].close && tokens[i].tag === 'array')) a.push(value(depth + 1));
        i++;
        return a;
      }
      case 'dict': {
        const d: { [k: string]: Plist } = {};
        if (t.self) return d;
        while (i < tokens.length && !(tokens[i].close && tokens[i].tag === 'dict')) {
          const k = tokens[i++];
          if (k.tag !== 'key' || k.close) continue;
          const name = k.self ? '' : textUntil('key');
          d[name] = value(depth + 1);
        }
        i++;
        return d;
      }
      default:
        return null;
    }
  };
  while (i < tokens.length && tokens[i].tag !== 'plist') i++;
  i++;
  return value(0);
}

const dict = (v: Plist | undefined): { [k: string]: Plist } | null => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);

function safariNode(n: Plist): Imp | null {
  const d = dict(n);
  if (!d) return null;
  if (d.WebBookmarkType === 'WebBookmarkTypeLeaf') {
    const title = dict(d.URIDictionary)?.title ?? d.Title;
    return { title: typeof title === 'string' ? title : '', url: String(d.URLString ?? '') };
  }
  if (d.WebBookmarkType === 'WebBookmarkTypeList') {
    return { title: String(d.Title ?? ''), children: (Array.isArray(d.Children) ? d.Children : []).map(safariNode).filter((x): x is Imp => !!x) };
  }
  return null;
}

export function safariTree(root: Plist): Imp[] {
  const top = dict(root);
  const out: Imp[] = [];
  const rest: Imp[] = [];
  for (const c of Array.isArray(top?.Children) ? top.Children : []) {
    const d = dict(c);
    if (!d || d.Title === 'com.apple.ReadingList') continue;
    const f = safariNode(c);
    if (!f?.children) continue;
    if (d.Title === 'BookmarksBar') out.unshift(...f.children);
    else rest.push({ ...f, title: d.Title === 'BookmarksMenu' ? 'Bookmarks Menu' : f.title });
  }
  return [...out, ...rest];
}

function safariCandidates(h: Dirs): Candidate[] {
  if (process.platform !== 'darwin') return [];
  const file = path.join(h.home, 'Library', 'Safari', 'Bookmarks.plist');
  try {
    fs.statSync(file);
  } catch (e) {
    // Not there at all: Safari is not used. Refused by the system: it is, and Hydor may not look.
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
  }
  return [
    {
      info: { id: 'safari', browser: 'Safari' },
      load: () =>
        new Promise<Imp[]>((resolve, reject) => {
          execFile('plutil', ['-convert', 'xml1', '-o', '-', file], { maxBuffer: 256 * 1024 * 1024 }, (err, out) => {
            if (err) return reject(new Error(SAFARI_DENIED));
            try {
              resolve(safariTree(parsePlist(out)));
            } catch {
              reject(new Error('Its bookmarks file cannot be read.'));
            }
          });
        }),
    },
  ];
}

const candidates = (): Candidate[] => {
  const h = dirsNow();
  return [...chromiumCandidates(h), ...firefoxCandidates(h), ...safariCandidates(h)];
};

/** The browsers on this computer and their profiles that have bookmarks (or that could not be read), each with its count. */
export async function bookmarkSources(): Promise<BookmarkSource[]> {
  const out: BookmarkSource[] = [];
  for (const c of candidates()) {
    try {
      const count = countLinks(tidy(await c.load()));
      if (count > 0) out.push({ ...c.info, count });
    } catch (e) {
      out.push({ ...c.info, count: 0, error: (e as Error).message });
    }
  }
  return out;
}

// ---- bookmarks files (the Netscape format) ------------------------------------------------------------

/** Reads a bookmarks file any browser exports, leniently: tags in any case, closing tags missing, entities. */
export function parseNetscape(html: string): Imp[] {
  const root: Imp = { title: '', children: [] };
  const stack: Imp[] = [root];
  let pending: Imp | null = null;
  let into: { node: Imp; text: string } | null = null;
  const attrs = (s: string) => {
    const a: Record<string, string> = {};
    for (const m of s.matchAll(/([A-Za-z_][\w:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) a[m[1].toLowerCase()] = decode(m[2] ?? m[3] ?? m[4] ?? '');
    return a;
  };
  const date = (v?: string) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? (n > 1e11 ? n : n * 1000) : undefined;
  };
  const re = /<(\/?)([A-Za-z][A-Za-z0-9]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>|([^<]+)|</g;
  // A title ends at its closing tag, or where the next list item or list starts when that tag is missing.
  const finish = () => {
    if (into) into.node.title = decode(into.text).replace(/\s+/g, ' ').trim();
    into = null;
  };
  for (let m: RegExpExecArray | null; (m = re.exec(html)); ) {
    if (m[4] !== undefined) {
      if (into) into.text += m[4];
      continue;
    }
    if (!m[2]) continue;
    const tag = m[2].toLowerCase();
    if (into && !['b', 'i', 'u', 'em', 'strong', 'span', 'img', 'font', 'br'].includes(tag) && !(m[1] && (tag === 'a' || tag === 'h3'))) finish();
    const top = stack[stack.length - 1];
    if (!m[1]) {
      if (tag === 'h3') {
        const a = attrs(m[3]);
        const f: Imp = { title: '', children: [], added: date(a.add_date), bar: a.personal_toolbar_folder === 'true' };
        (top.children ??= []).push(f);
        pending = f;
        into = { node: f, text: '' };
      } else if (tag === 'a') {
        const a = attrs(m[3]);
        const l: Imp = { title: '', url: a.href ?? '', added: date(a.add_date) };
        (top.children ??= []).push(l);
        pending = null;
        into = { node: l, text: '' };
      } else if (tag === 'dl') {
        // A folder's list follows its heading; the first list is the file's own.
        stack.push(pending ?? top);
        pending = null;
      }
    } else if ((tag === 'h3' || tag === 'a') && into) finish();
    else if (tag === 'dl' && stack.length > 1) stack.pop();
  }
  finish();
  // The browser's bookmarks bar first, as the browsers' own imports do.
  const top = root.children ?? [];
  const bars = top.filter((n) => n.bar);
  return [...bars.flatMap((n) => n.children ?? []), ...top.filter((n) => !n.bar)];
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Everything as a Netscape bookmarks file, which Chrome, Firefox and Safari import. */
export function exportNetscape(nodes: BookmarkNode[]): string {
  const kids = new Map<string, BookmarkNode[]>();
  for (const n of nodes) kids.set(n.parent, [...(kids.get(n.parent) ?? []), n]);
  for (const l of kids.values()) l.sort((a, b) => a.pos - b.pos);
  const secs = (ms: number) => Math.floor((ms > 0 ? ms : Date.now()) / 1000);
  const lines: string[] = [];
  const list = (parent: string, depth: number) => {
    const pad = '    '.repeat(depth);
    lines.push(`${pad}<DL><p>`);
    for (const n of kids.get(parent) ?? []) {
      if (n.url !== undefined) lines.push(`${pad}    <DT><A HREF="${esc(n.url)}" ADD_DATE="${secs(n.addedAt)}">${esc(n.title)}</A>`);
      else {
        lines.push(`${pad}    <DT><H3 ADD_DATE="${secs(n.addedAt)}">${esc(n.title)}</H3>`);
        list(n.id, depth + 2);
      }
    }
    lines.push(`${pad}</DL><p>`);
  };
  lines.push('<!DOCTYPE NETSCAPE-Bookmark-file-1>', '<!-- This is an automatically generated file. It will be read and overwritten. DO NOT EDIT! -->');
  lines.push('<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">', '<TITLE>Bookmarks</TITLE>', '<H1>Bookmarks</H1>', '<DL><p>');
  const now = secs(0);
  lines.push(`    <DT><H3 ADD_DATE="${now}" LAST_MODIFIED="${now}" PERSONAL_TOOLBAR_FOLDER="true">Bookmarks bar</H3>`);
  list('bar', 2);
  if (kids.get('other')?.length) {
    lines.push(`    <DT><H3 ADD_DATE="${now}" LAST_MODIFIED="${now}">Other bookmarks</H3>`);
    list('other', 2);
  }
  lines.push('</DL><p>', '');
  return lines.join('\n');
}

// ---- routes ------------------------------------------------------------------------------------------------

export function bookmarkRoutes(d: Deps) {
  const { app, db } = d;

  app.get('/api/browser/bookmarks', async () => ({ nodes: loadBookmarks(db) }));
  app.post('/api/browser/bookmarks', async (req) => addBookmark(db, B(req)));
  app.patch('/api/browser/bookmarks/:id', async (req) => ({ nodes: changeBookmark(db, (req.params as { id: string }).id, B(req)) }));
  app.delete('/api/browser/bookmarks/:id', async (req) => ({ nodes: removeBookmark(db, (req.params as { id: string }).id) }));

  app.get('/api/browser/bookmarks/sources', async () => ({ sources: await bookmarkSources() }));

  // A file comes inside the JSON (up to 20 MB of text, which JSON makes a little longer).
  app.post('/api/browser/bookmarks/import', { bodyLimit: MAX_HTML * 2 + 4096 }, async (req) => {
    const b = B(req);
    if (typeof b.html === 'string') {
      if (b.html.length > MAX_HTML) throw new HttpError(413, 'That file is too big (20 MB at most).');
      const items = parseNetscape(b.html);
      return importInto(db, 'Imported bookmarks', items);
    }
    if (typeof b.source !== 'string' || !b.source) throw new HttpError(400, 'Say which browser to import from, or send a bookmarks file.');
    const c = candidates().find((x) => x.info.id === b.source);
    if (!c) throw new HttpError(404, 'That browser’s bookmarks are not here any more.');
    let items: Imp[];
    try {
      items = await c.load();
    } catch (e) {
      throw new HttpError(400, (e as Error).message);
    }
    return importInto(db, `Imported from ${c.info.browser}${c.info.profile ? ` (${c.info.profile})` : ''}`, items);
  });

  app.get('/api/browser/bookmarks/export', async (_req, reply) => {
    reply.header('content-type', 'text/html; charset=utf-8').header('content-disposition', 'attachment; filename="bookmarks.html"');
    return exportNetscape(loadBookmarks(db));
  });
}
