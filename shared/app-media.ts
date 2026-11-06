// Pictures, videos, sounds and other files in apps: the ones a run's answer shows (a media answer field, a picture
// column of a table, any value a view's image, video or audio element draws), the files that come with an app (its
// assets, packed in its .hydor-app), and the libraries a view's own scripts load. What the server and pages share.
//
// A file shows from one of these addresses:
//   https://…                  on the web, as it is
//   /app-media/<sha>/<name>    a copy the app keeps (a file on this computer an agent handed in, an app's asset),
//                              served to anyone with the address, which nobody can guess (server/apps/media.ts)
//   asset:<name>               one of the app's own files, by its name (shown from its /app-media/ address)
// An agent hands in a file on this computer by its path, or a picture it made as a data: address; the server keeps
// a copy and puts that address in its place. A public run's answer may only point at the web.

/** One picture, video, sound or other file in an answer. */
export interface MediaItem {
  /** Where it is (see above). */
  src: string;
  /** What it is; from its address when not given. */
  kind?: MediaKind;
  /** The file's name, for a download. */
  name?: string;
  caption?: string;
  /** A video's still, shown before it plays. */
  poster?: string;
}

export type MediaKind = 'image' | 'video' | 'audio' | 'file';

/** A file that comes with an app, by its name in the app: its copy's hash, its type and size. */
export interface AppAsset {
  sha: string;
  mime: string;
  bytes: number;
  caption?: string;
}

export const MEDIA_LIMITS = {
  /** One file an agent hands in from this computer. */
  file: 500 * 1024 * 1024,
  /** One of an app's own files. */
  asset: 100 * 1024 * 1024,
  /** An app's files together (they travel in its .hydor-app). */
  assets: 150 * 1024 * 1024,
  /** How many files an app may have. */
  count: 100,
  /** Items in one media answer field. */
  items: 60,
};

export const MEDIA_PATH = /^\/app-media\/([a-f0-9]{40})\/([^/?#]{1,160})$/;
export const ASSET_NAME = /^[A-Za-z0-9][\w.\- ()]{0,99}$/;
export const isWeb = (s: string) => /^https?:\/\/[^\s]+$/i.test(s);
export const isAssetRef = (s: string) => s.startsWith('asset:') && ASSET_NAME.test(s.slice(6)) && !s.includes('..');
export const isDataMedia = (s: string) => /^data:(image|video|audio)\/[a-z0-9.+-]+;base64,/i.test(s);
/** A path on this computer, as an agent writes one: absolute, from home, from its folder, or a file's name. */
export const isLocalPath = (s: string) => !/[\n\r\0]/.test(s) && s.length < 1000 && (/^(~|\.{1,2})?\//.test(s) || /^[\w.\- ()]+\.[A-Za-z0-9]{1,8}$/.test(s));

const EXT: Record<MediaKind, string[]> = {
  image: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg', 'bmp', 'ico', 'heic'],
  video: ['mp4', 'm4v', 'webm', 'mov', 'ogv', 'mkv'],
  audio: ['mp3', 'm4a', 'aac', 'wav', 'ogg', 'oga', 'opus', 'flac', 'weba'],
  file: [],
};

/** A video on YouTube or Vimeo: the address of its player, or null. */
export function videoEmbed(src: string): string | null {
  let u: URL;
  try {
    u = new URL(src);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\.|^m\./, '');
  let id = '';
  if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') id = u.searchParams.get('v') ?? (/^\/(?:embed|shorts|live)\/([\w-]{6,20})/.exec(u.pathname)?.[1] ?? '');
  if (id && /^[\w-]{6,20}$/.test(id)) {
    const t = Number(u.searchParams.get('t')?.replace(/s$/, '') ?? u.searchParams.get('start') ?? 0);
    return `https://www.youtube-nocookie.com/embed/${id}${t > 0 ? `?start=${Math.floor(t)}` : ''}`;
  }
  const v = host === 'vimeo.com' ? /^\/(\d{4,12})/.exec(u.pathname)?.[1] : host === 'player.vimeo.com' ? /^\/video\/(\d{4,12})/.exec(u.pathname)?.[1] : undefined;
  return v ? `https://player.vimeo.com/video/${v}` : null;
}

/** What a file is, from its type, else its address or name. */
export function mediaKind(src: string, mime?: string): MediaKind {
  const m = String(mime ?? '').toLowerCase();
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('audio/')) return 'audio';
  if (m) return 'file';
  const s = String(src ?? '');
  const d = /^data:(image|video|audio)\//i.exec(s);
  if (d) return d[1].toLowerCase() as MediaKind;
  if (videoEmbed(s)) return 'video';
  const ext = /\.([A-Za-z0-9]{1,8})(?:[?#].*)?$/.exec(s.replace(/^asset:/, ''))?.[1]?.toLowerCase() ?? '';
  for (const k of ['image', 'video', 'audio'] as const) if (EXT[k].includes(ext)) return k;
  return 'file';
}

/** The type a file's name says it is, for a file kept without one. */
export function mimeOfName(name: string): string {
  const ext = /\.([A-Za-z0-9]{1,8})$/.exec(name)?.[1]?.toLowerCase() ?? '';
  const known: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', svg: 'image/svg+xml', bmp: 'image/bmp', ico: 'image/x-icon', heic: 'image/heic',
    mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', ogv: 'video/ogg', mkv: 'video/x-matroska',
    mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/opus', flac: 'audio/flac', weba: 'audio/webm',
    pdf: 'application/pdf', json: 'application/json', csv: 'text/csv', txt: 'text/plain', md: 'text/markdown', geojson: 'application/geo+json', gltf: 'model/gltf+json', glb: 'model/gltf-binary',
    zip: 'application/zip', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  };
  return known[ext] ?? 'application/octet-stream';
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/**
 * A media value as an agent hands it in: one address or several, or items with a caption; each checked for where
 * it may be (a web address, a file on this computer, a picture as a data: address, one the app keeps or one of its
 * own files). `local`: whether a path on this computer is taken (not for a public run's answer).
 */
export function cleanMedia(raw: unknown, o: { local?: boolean } = {}): { items: MediaItem[]; errors: string[] } {
  const errors: string[] = [];
  const list = Array.isArray(raw) ? raw : raw === undefined || raw === null || raw === '' ? [] : [raw];
  const items: MediaItem[] = [];
  for (const [i, x] of list.slice(0, MEDIA_LIMITS.items).entries()) {
    const it = (typeof x === 'string' ? { src: x } : x && typeof x === 'object' && !Array.isArray(x) ? x : {}) as Record<string, unknown>;
    const src = str(it.src ?? it.url ?? it.path ?? it.file, 20_000_000);
    const at = list.length > 1 ? `item ${i + 1}: ` : '';
    if (!src) {
      errors.push(`${at}give its address or path (src)`);
      continue;
    }
    const ok = isWeb(src) || MEDIA_PATH.test(src) || isAssetRef(src) || isDataMedia(src) || (o.local !== false && isLocalPath(src));
    if (!ok) {
      errors.push(o.local === false ? `${at}“${src.slice(0, 80)}” is not a web address` : `${at}“${src.slice(0, 80)}” is neither a web address nor the path of a file on this computer`);
      continue;
    }
    const item: MediaItem = { src };
    const kind = it.kind ?? it.type;
    if (kind === 'image' || kind === 'video' || kind === 'audio' || kind === 'file') item.kind = kind;
    const name = str(it.name, 160);
    if (name) item.name = name;
    const caption = str(it.caption ?? it.title ?? it.alt, 1000);
    if (caption) item.caption = caption;
    const poster = str(it.poster, 4000);
    if (poster && (isWeb(poster) || MEDIA_PATH.test(poster) || isAssetRef(poster))) item.poster = poster;
    items.push(item);
  }
  if (list.length > MEDIA_LIMITS.items) errors.push(`at most ${MEDIA_LIMITS.items} files in one field`);
  return { items, errors };
}

/** An app's files from a recipe as it travels or is saved: valid names, hashes and sizes only. */
export function cleanAssets(raw: unknown): Record<string, AppAsset> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out: Record<string, AppAsset> = {};
  for (const [name, v] of Object.entries(raw as Record<string, unknown>).slice(0, MEDIA_LIMITS.count)) {
    const a = v as Record<string, unknown> | null;
    if (!ASSET_NAME.test(name) || name.includes('..') || !a || typeof a !== 'object') continue;
    const sha = typeof a.sha === 'string' && /^[a-f0-9]{40}$/.test(a.sha) ? a.sha : '';
    const bytes = typeof a.bytes === 'number' && Number.isFinite(a.bytes) && a.bytes >= 0 ? Math.round(a.bytes) : -1;
    if (!sha || bytes < 0) continue;
    out[name] = { sha, mime: str(a.mime, 100) || mimeOfName(name), bytes, ...(str(a.caption, 300) ? { caption: str(a.caption, 300) } : {}) };
  }
  return Object.keys(out).length ? out : undefined;
}

/** Where an app's file shows from. */
export const assetPath = (name: string, a: Pick<AppAsset, 'sha'>) => `/app-media/${a.sha}/${encodeURIComponent(name)}`;

/** An address as a page shows it: an app's own file by its name, and everything else as it is. */
export function mediaSrc(src: string, assets?: Record<string, Pick<AppAsset, 'sha'>>): string {
  if (src.startsWith('asset:')) {
    const name = src.slice(6);
    const a = assets?.[name];
    return a ? assetPath(name, a) : '';
  }
  return src;
}

// ---- libraries a view's scripts load ----------------------------------------------------------------------------

/** Where a view's libraries come from: npm packages, at exact versions, from jsDelivr. */
export const LIB_CDN = 'https://cdn.jsdelivr.net/npm/';

/** The libraries the view's own elements use: maps (Leaflet) and plots (Plotly); and 3D (three.js) for slides' 3D parts. */
export const KIT_LIBS = {
  leaflet: { pkg: 'leaflet', version: '1.9.4', js: 'dist/leaflet.js', css: 'dist/leaflet.css' },
  plotly: { pkg: 'plotly.js-dist-min', version: '4.2.0', js: 'plotly.min.js' },
  three: { pkg: 'three', version: '0.187.0', js: 'build/three.module.min.js' },
} as const;

/** Where a slide's 3D part loads three.js from (its folder: its build, and its addons' loaders and controls). */
export const THREE_BASE = `${LIB_CDN}${KIT_LIBS.three.pkg}@${KIT_LIBS.three.version}/`;

const PKG = /^(@[a-z0-9][\w.-]{0,100}\/)?[a-z0-9][\w.-]{0,100}$/;
const SUB = /^[\w.@-]+(\/[\w.@-]+){0,8}$/;
const EXACT = /^\d{1,5}\.\d{1,5}\.\d{1,6}(-[0-9A-Za-z.-]{1,40})?$/;

/** "three/addons/controls/OrbitControls.js" → three and the path in it; "@scope/pkg/x" → @scope/pkg and x. */
export function splitSpec(spec: string): { pkg: string; sub: string } {
  const parts = spec.split('/');
  const n = spec.startsWith('@') ? 2 : 1;
  return { pkg: parts.slice(0, n).join('/'), sub: parts.slice(n).join('/') };
}

/** Where one of a view's libraries is loaded from: a module (its +esm build) or a stylesheet. */
export function libUrl(spec: string, version: string): string {
  const { pkg, sub } = splitSpec(spec);
  if (/\.css$/i.test(sub)) return `${LIB_CDN}${pkg}@${version}/${sub}`;
  return `${LIB_CDN}${pkg}@${version}${sub ? `/${sub}` : ''}/+esm`;
}

/**
 * The libraries a view's scripts import, from anything: what they import by ("three", "chart.js/auto",
 * "leaflet/dist/leaflet.css" for a stylesheet) → an exact version ("0.170.0"), as npm has it.
 */
export function cleanLibs(raw: unknown): { libs?: Record<string, string>; errors: string[] } {
  const errors: string[] = [];
  if (raw === undefined || raw === null) return { errors };
  if (typeof raw !== 'object' || Array.isArray(raw)) return { errors: ['Its view’s libraries (“libs”) are a map of what its scripts import to an exact version: { "three": "0.170.0", "chart.js/auto": "4.4.6" }'] };
  const out: Record<string, string> = {};
  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length > 16) errors.push('A view loads at most 16 libraries');
  for (const [spec, v] of entries.slice(0, 16)) {
    const { pkg, sub } = splitSpec(spec);
    const version = String(v ?? '').trim().replace(/^v/, '');
    if (!PKG.test(pkg) || (sub && !SUB.test(sub))) errors.push(`Library “${spec.slice(0, 80)}”: give an npm package (or a path in one), like "three" or "chart.js/auto"`);
    else if (!EXACT.test(version)) errors.push(`Library “${spec}”: give its exact version, like "1.2.3" (not a range or latest), so the view always loads the same code`);
    else out[spec] = version;
  }
  return { libs: Object.keys(out).length ? out : undefined, errors };
}

/** The import map a view's scripts load their libraries by, and the stylesheets among them. */
export function libsHead(libs: Record<string, string> | undefined): { imports: Record<string, string>; css: string[] } {
  const imports: Record<string, string> = {};
  const css: string[] = [];
  for (const [spec, version] of Object.entries(libs ?? {})) {
    const url = libUrl(spec, version);
    if (/\.css$/i.test(spec)) css.push(url);
    else {
      imports[spec] = url;
      // Its other modules by path ("three/addons/…") come from the same version.
      const { pkg, sub } = splitSpec(spec);
      if (!sub) imports[`${pkg}/`] = `${LIB_CDN}${pkg}@${version}/`;
    }
  }
  return { imports, css };
}
