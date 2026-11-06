// The phone remote's slideshows: a window showing a slideshow says it has one (and the deck it shows, as it showed
// it: an editor's unsaved changes too), gets an id, and tells where it is as it moves; a phone signed in to the same app
// opens /remote/<id>, reads the deck and where the slideshow is, and sends commands (next, back, a slide, a black
// screen). Both hear of the other through the app's live updates: each page that shows the slideshow or its remote
// listens on its own channel (page:show:<id>, a page's channel), and nothing else hears of it. Kept in memory only:
// a slideshow is gone when its window ends it, after hours unheard of, or when the server restarts.
import crypto from 'node:crypto';
import { normalizeDeck, type Deck } from '../../shared/slides.ts';
import { cleanRemoteCmd, cleanRemoteState, type RemoteCmd, type RemoteState } from '../../shared/slides-show.ts';
import { HttpError } from '../auth.ts';
import type { Deps } from '../features/types.ts';

interface ShowRec {
  id: string;
  page: string;
  title: string;
  deck: Deck;
  state: RemoteState | null;
  /** When it was made, and when its window last said where it is (ms). */
  made: number;
  seen: number;
}

/** What the phone reads: the deck, where the slideshow is, and whether its window is still heard from. */
export interface RemoteShow {
  id: string;
  page: string;
  title: string;
  deck: Deck;
  state: RemoteState | null;
  live: boolean;
}

/** What a page hears on a slideshow's channel (feature "slides-show"). */
export type ShowNews = { show: string; state: RemoteState } | { show: string; cmd: RemoteCmd } | { show: string; ended: true } | { show: string; phone: true };

const shows = new Map<string, ShowRec>();
/** At most this many at once (the oldest goes); each goes after this long unheard of. */
const MAX_SHOWS = 8;
const IDLE_MS = 6 * 3600_000;
/** A window unheard of this long (it tells where it is every few seconds) is taken to be gone. */
const LIVE_MS = 20_000;
/** The largest deck a slideshow may carry (its pictures are kept apart, by reference). */
const MAX_DECK_JSON = 4 * 1024 * 1024;

export const showChannel = (id: string) => `page:show:${id}`;

const sweep = (now = Date.now()) => {
  for (const [id, s] of shows) if (now - s.seen > IDLE_MS) shows.delete(id);
  while (shows.size > MAX_SHOWS) shows.delete(shows.keys().next().value!);
};

const get = (id: string): ShowRec => {
  sweep();
  const s = /^[A-Za-z0-9_-]{8,40}$/.test(id) ? shows.get(id) : undefined;
  if (!s) throw new HttpError(404, 'This slideshow has ended (or was never started here): start the phone remote again from the slideshow');
  return s;
};

const tell = (d: Pick<Deps, 'toSubscribers'>, id: string, news: ShowNews) => d.toSubscribers(showChannel(id), { t: 'feature', id: 'slides-show', data: news });

/** A slideshow for a remote: the page it is of, its title, the deck as shown; its id. */
export function startShow(body: unknown): { id: string } {
  const b = (body && typeof body === 'object' ? body : {}) as { page?: unknown; title?: unknown; deck?: unknown };
  const page = typeof b.page === 'string' && /^[a-f0-9]{10}$/.test(b.page) ? b.page : '';
  if (!page) throw new HttpError(400, 'page: the id of the deck being shown');
  if (JSON.stringify(b.deck ?? null).length > MAX_DECK_JSON) throw new HttpError(413, 'That deck is too large to send to a phone');
  let deck: Deck;
  try {
    deck = normalizeDeck(b.deck);
  } catch (e) {
    throw new HttpError(400, `deck: the deck being shown (${(e as Error).message})`);
  }
  const id = crypto.randomBytes(12).toString('base64url');
  const now = Date.now();
  shows.set(id, { id, page, title: typeof b.title === 'string' ? b.title.trim().slice(0, 200) : '', deck, state: null, made: now, seen: now });
  sweep(now);
  return { id };
}

/** The slideshow, for its phone: the window hears that a phone opened it (its code's card then goes). */
export function readShow(d: Pick<Deps, 'toSubscribers'>, id: string): RemoteShow {
  const s = get(id);
  tell(d, id, { show: id, phone: true });
  return { id: s.id, page: s.page, title: s.title, deck: s.deck, state: s.state, live: Date.now() - s.seen < LIVE_MS };
}

/** Where the slideshow is now, from its window: kept, and told to the phone. */
export function moveShow(d: Pick<Deps, 'toSubscribers'>, id: string, body: unknown): { ok: true } {
  const s = get(id);
  const state = cleanRemoteState((body as { state?: unknown } | null)?.state);
  if (!state) throw new HttpError(400, 'state: where the slideshow is ({i, step, steps, pos, count, blank, started})');
  s.state = state;
  s.seen = Date.now();
  tell(d, id, { show: id, state });
  return { ok: true };
}

/** A command from the phone, sent on to the slideshow's window; `live` says whether that window was heard from lately. */
export function commandShow(d: Pick<Deps, 'toSubscribers'>, id: string, body: unknown): { ok: true; live: boolean } {
  const s = get(id);
  const cmd = cleanRemoteCmd(body);
  if (!cmd) throw new HttpError(400, 'do: next, prev, go (with n, a slide’s number), first, last, black or white');
  tell(d, id, { show: id, cmd });
  return { ok: true, live: Date.now() - s.seen < LIVE_MS };
}

/** The slideshow ended (its window closed it): the phone hears so. */
export function endShow(d: Pick<Deps, 'toSubscribers'>, id: string): { ok: true } {
  if (shows.delete(id)) tell(d, id, { show: id, ended: true });
  return { ok: true };
}

/** For tests: every slideshow forgotten. */
export const forgetShows = () => shows.clear();
