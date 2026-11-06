// My themes (Canva's brand kit): a deck's colours and fonts saved under a name of the user's, with its logo when it has
// one, kept in the app's settings, each logo's picture held as a deck's are (noted, so it is never swept). The slides'
// Theme tab saves, renames and deletes them and puts one on a deck; New page → Slides starts a deck in one; save_slides
// takes one by its name (theme: "Acme"), and agents are told the names there are when they start.
//
// Routes, signed in:
//   GET /api/slides/themes → { themes: MyTheme[] }
//   POST /api/slides/themes { name, theme, logo? } → { theme } (one of the same name is saved over)
//   PATCH /api/slides/themes/:id { name?, theme?, logo? (null: none) } → { theme }
//   DELETE /api/slides/themes/:id → { ok: true }
import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { MY_THEMES_LIMITS, type MyTheme } from '../../shared/my-themes.ts';
import { ASSET, normalizeDeck, THEMES, type Logo, type Theme } from '../../shared/slides.ts';
import { HttpError } from '../auth.ts';
import { kvGet, kvSet, type DB } from '../db.ts';
import type { Feature } from '../features/types.ts';
import { dropRefs, getAsset, noteRefs, putAsset, sweepAssets } from './assets.ts';

const KEY = 'slides.myThemes';
/** Where a theme's logo is noted as shown, so its picture stays while the theme does. */
const refOf = (id: string) => `my-theme:${id}`;

/** The user's themes, the latest changed first. */
export function myThemes(db: DB): MyTheme[] {
  try {
    const list = JSON.parse(kvGet(db, KEY) ?? '[]') as MyTheme[];
    return Array.isArray(list) ? list.filter((t) => t && typeof t.id === 'string' && typeof t.name === 'string' && t.theme).sort((a, b) => b.updatedAt - a.updatedAt) : [];
  } catch {
    return [];
  }
}

const keep = (db: DB, list: MyTheme[]) => kvSet(db, KEY, JSON.stringify(list));

/** One of the user's themes by its name (any case) or its id; null when none is so called, or it is a ready-made theme's name. */
export function myThemeByName(db: DB, name: unknown): MyTheme | null {
  if (typeof name !== 'string' || !name.trim()) return null;
  const n = name.trim().toLowerCase();
  if (THEMES.some((t) => t.id === n)) return null;
  return myThemes(db).find((t) => t.name.toLowerCase() === n || t.id === name.trim()) ?? null;
}

const cleanName = (v: unknown) =>
  typeof v === 'string'
    ? v
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, MY_THEMES_LIMITS.name)
    : '';

/** A theme and a logo as a deck keeps them (checked as normalizeDeck checks a deck's); a picture inside one kept apart. */
function cleanLook(db: DB, theme: unknown, logo: unknown): { theme: Theme; logo?: Logo } {
  const d = normalizeDeck({ slides: [{}], theme: theme ?? THEMES[0].id, logo: logo ?? undefined });
  const t: Theme = { ...d.theme };
  delete t.id;
  let lg = d.logo;
  if (lg?.src.startsWith('data:')) {
    const m = /^data:image\/[a-z0-9.+-]+;base64,([A-Za-z0-9+/=]+)$/i.exec(lg.src);
    lg = m ? { ...lg, src: ASSET + putAsset(db, Buffer.from(m[1], 'base64')) } : undefined;
  }
  if (lg?.src.startsWith(ASSET) && !getAsset(db, lg.src.slice(ASSET.length))) throw new HttpError(400, 'That logo’s picture is no longer kept: add it again');
  return { theme: t, ...(lg ? { logo: lg } : {}) };
}

/** Its logo's picture noted as shown by it (noted before any other is let go, so one it keeps is never swept between). */
function noteLogo(db: DB, t: MyTheme) {
  const sha = t.logo?.src.startsWith(ASSET) ? t.logo.src.slice(ASSET.length) : null;
  if (t.logo?.src) noteRefs(db, refOf(t.id), 1, [t.logo.src]);
  db.prepare('delete from page_asset_refs where page_id = ? and sha is not ?').run(refOf(t.id), sha);
  sweepAssets(db);
}

/** A theme saved: a new one, or over the one of the same name. */
export function saveMyTheme(db: DB, input: { name?: unknown; theme?: unknown; logo?: unknown }): MyTheme {
  const name = cleanName(input.name);
  if (!name) throw new HttpError(400, 'Give the theme a name');
  if (THEMES.some((t) => t.id === name.toLowerCase())) throw new HttpError(400, `“${name}” is a ready-made theme’s name: give yours another`);
  const list = myThemes(db);
  const look = cleanLook(db, input.theme, input.logo);
  const now = Date.now();
  const same = list.find((t) => t.name.toLowerCase() === name.toLowerCase());
  if (!same && list.length >= MY_THEMES_LIMITS.count) throw new HttpError(409, `You have ${MY_THEMES_LIMITS.count} themes: delete one first`);
  const t: MyTheme = same ? { ...same, name, ...look, updatedAt: now } : { id: crypto.randomBytes(6).toString('hex'), name, ...look, createdAt: now, updatedAt: now };
  if (!look.logo) delete t.logo;
  keep(db, [t, ...list.filter((x) => x.id !== t.id)]);
  noteLogo(db, t);
  return t;
}

/** A theme renamed, its look or its logo changed (logo null: none). */
export function changeMyTheme(db: DB, id: string, input: { name?: unknown; theme?: unknown; logo?: unknown }): MyTheme {
  const list = myThemes(db);
  const was = list.find((t) => t.id === id);
  if (!was) throw new HttpError(404, 'No such theme of yours');
  const name = input.name === undefined ? was.name : cleanName(input.name);
  if (!name) throw new HttpError(400, 'Give the theme a name');
  if (list.some((t) => t.id !== id && t.name.toLowerCase() === name.toLowerCase())) throw new HttpError(409, `You have a theme called “${name}” already`);
  const look = cleanLook(db, input.theme === undefined ? was.theme : input.theme, input.logo === undefined ? was.logo : input.logo);
  const t: MyTheme = { ...was, name, ...look, updatedAt: Date.now() };
  if (!look.logo) delete t.logo;
  keep(db, [t, ...list.filter((x) => x.id !== id)]);
  noteLogo(db, t);
  return t;
}

export function deleteMyTheme(db: DB, id: string) {
  const list = myThemes(db);
  if (!list.some((t) => t.id === id)) throw new HttpError(404, 'No such theme of yours');
  keep(
    db,
    list.filter((t) => t.id !== id),
  );
  dropRefs(db, refOf(id));
}

function routes(app: FastifyInstance, db: DB) {
  const B = (req: { body: unknown }) => (req.body ?? {}) as Record<string, unknown>;
  const P = (req: { params: unknown }) => req.params as { id: string };
  app.get('/api/slides/themes', async () => ({ themes: myThemes(db) }));
  app.post('/api/slides/themes', async (req) => ({ theme: saveMyTheme(db, B(req)) }));
  app.patch('/api/slides/themes/:id', async (req) => ({ theme: changeMyTheme(db, P(req).id, B(req)) }));
  app.delete('/api/slides/themes/:id', async (req) => {
    deleteMyTheme(db, P(req).id);
    return { ok: true };
  });
}

/** What agents hear of the user's themes when they start: their names, for save_slides' theme. */
export function myThemesNote(db: DB): string | null {
  const list = myThemes(db).slice(0, 20);
  if (!list.length) return null;
  const each = list.map((t) => `“${t.name}” (${t.theme.headFont === t.theme.font ? t.theme.font : `${t.theme.headFont} and ${t.theme.font}`}, accent ${t.theme.accent}${t.logo ? ', with a logo on every slide' : ''})`);
  return `The user’s own slide themes, for save_slides’ theme by name (its colours, fonts and logo come with it): ${each.join('; ')}.`;
}

export const myThemesFeature: Feature = {
  id: 'my-themes',
  routes({ app, db }) {
    routes(app, db);
  },
  spawn(_s, d) {
    const note = myThemesNote(d.db);
    return note ? { instructions: [note] } : undefined;
  },
};
