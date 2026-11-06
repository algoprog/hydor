// Google's fonts for slide decks shown inside the app: the app's own pages load fonts only from this server, so
// it fetches the stylesheet and the font files from Google once and keeps them (a deck's own page, in a frame or
// on its own, loads them from Google itself). Only the fonts decks offer, and only Google's two hosts.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { FONTS, googleFamilies } from '../../shared/slides.ts';
import { config } from '../config.ts';

const DIR = path.join(config.dataDir, 'pages', 'fonts');
// Google gives each browser the files it reads: this one, woff2.
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const hash = (s: string) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 24);

async function get(url: string, max: number): Promise<Buffer | null> {
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(15_000), redirect: 'error' });
    if (!r.ok) return null;
    const b = Buffer.from(await r.arrayBuffer());
    return b.length <= max ? b : null;
  } catch {
    return null;
  }
}

/** The stylesheet for fonts named in `list` ("Inter,Playfair Display"), its files served from here; empty when offline. */
export async function fontsCss(list: string): Promise<string> {
  const names = list
    .split(',')
    .map((x) => x.trim())
    .filter((x) => FONTS.some((f) => f.google && f.name === x))
    .slice(0, 12);
  const fams = googleFamilies([...new Set(names)].sort());
  if (!fams) return '';
  const file = path.join(DIR, `${hash(fams)}.css`);
  try {
    const st = fs.statSync(file);
    if (Date.now() - st.mtimeMs < 30 * 86_400_000) return fs.readFileSync(file, 'utf8');
  } catch {}
  const body = await get(`https://fonts.googleapis.com/css2?${fams}&display=swap`, 2_000_000);
  if (!body) return '';
  const css = body.toString('utf8').replace(/url\(https:\/\/fonts\.gstatic\.com\/([^)]+)\)/g, (_m, p: string) => `url(/api/pages/fonts/${p})`);
  fs.mkdirSync(DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, css);
  return css;
}

const TYPES: Record<string, string> = { woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf' };

/** One of Google's font files, by its path on fonts.gstatic.com. */
export async function fontFile(p: string): Promise<{ data: Buffer; type: string } | null> {
  const m = /^s\/[a-z0-9]+\/v\d+\/[A-Za-z0-9_\-.]+\.(woff2|woff|ttf)$/.exec(p);
  if (!m) return null;
  const file = path.join(DIR, 'files', `${hash(p)}.${m[1]}`);
  try {
    return { data: fs.readFileSync(file), type: TYPES[m[1]] };
  } catch {}
  const data = await get(`https://fonts.gstatic.com/${p}`, 8_000_000);
  if (!data) return null;
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, data);
  return { data, type: TYPES[m[1]] };
}

/** Whether a font file's unicode-range ("U+0000-00FF, U+0131, …") covers any of `chars`. */
function covers(range: string, chars: Set<number>): boolean {
  for (const part of range.split(',')) {
    const m = /U\+([0-9A-F?]+)(?:-([0-9A-F]+))?/i.exec(part.trim());
    if (!m) continue;
    const lo = parseInt(m[1].replace(/\?/g, '0'), 16);
    const hi = m[2] ? parseInt(m[2], 16) : m[1].includes('?') ? parseInt(m[1].replace(/\?/g, 'F'), 16) : lo;
    for (const c of chars) if (c >= lo && c <= hi) return true;
  }
  return false;
}

/**
 * The fonts named in `list` as a stylesheet with their files inside it (data: addresses), for a page that is a file of
 * its own and must show the same with no network: only the faces `faces` says it uses (weights, italics) and only the
 * files of the alphabets its words are written in (`text`). Fetched from Google once and kept (as fontsCss keeps
 * them); '' when none can be had (offline, never fetched).
 */
export async function fontsInside(list: string[], text: string, faces: { weights: number[]; italic: boolean }): Promise<string> {
  const css = await fontsCss(list.join(','));
  if (!css) return '';
  const chars = new Set<number>([0x20, 0x30, 0x41, 0x61]);
  for (const ch of text.slice(0, 400_000)) chars.add(ch.codePointAt(0)!);
  const out: string[] = [];
  let bytes = 0;
  for (const block of css.match(/@font-face\s*\{[^}]*\}/g) ?? []) {
    const weight = Number(/font-weight:\s*(\d+)/.exec(block)?.[1] ?? 400);
    const italic = /font-style:\s*italic/.test(block);
    if (!faces.weights.includes(weight) || (italic && !faces.italic)) continue;
    const range = /unicode-range:\s*([^;}]+)/.exec(block)?.[1];
    if (range && !covers(range, chars)) continue;
    const at = /url\(\/api\/pages\/fonts\/([^)]+)\)/.exec(block);
    const f = at ? await fontFile(at[1]) : null;
    if (!f) continue;
    // A page carries a few hundred kilobytes of fonts at most (past three megabytes the rest are left out).
    bytes += f.data.length;
    if (bytes > 3 * 1024 * 1024) break;
    out.push(block.replace(/url\([^)]+\)/, `url(data:${f.type};base64,${f.data.toString('base64')})`).replace(/\s+/g, ' '));
  }
  return out.join('');
}
