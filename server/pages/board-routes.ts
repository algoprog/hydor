// Pinning an answer card to a board (shared/boards.ts says the format; boards.ts the kind), signed in:
//   POST /api/boards/pin {board?: a board's id, title?: a new board's name, space?, folder?, sessionKey?,
//                         card: {ui, data, title?, size?, from?}} → {page, card}
// The card goes at the end of the board, its data copied as it is now; with no board, a new one is made for it, in the
// project asked for (else the session's). Each pin is a new version of the board.
//
// Cards that keep themselves up to date (board-refresh.ts): their settings are part of the board (each card's refresh,
// the board's cap), saved as any change to it is; these say what the refreshes are doing and start them:
//   GET  /api/boards/:id/refresh                       → BoardRefreshState: each card's schedule, the refresh going on,
//                                                        the last that ended, what they cost; the cap and this month's spending
//   GET  /api/boards/:id/cards/:card/question          → {question}: the question a card asks again (its own, or the
//                                                        request it was pinned from)
//   POST /api/boards/:id/cards/:card/refresh           → {runId, key}: refresh it now (Refresh now, Try again)
//   POST /api/boards/:id/refresh                       → {started, skipped}: every card of it that refreshes (Refresh all)
//   GET  /api/boards/refreshes                         → {boards, cards}: every board's cards that refresh, for `hydor library refreshes`
import type { FastifyRequest } from 'fastify';
import { BOARD_LIMITS, CardError, checkCard, type BoardCard } from '../../shared/boards.ts';
import { HttpError } from '../auth.ts';
import { confidentialKey } from '../confidential/index.ts';
import type { Deps } from '../features/types.ts';
import { sessionSpace, spaceChoice } from '../spaces/choice.ts';
import { readBoard } from './boards.ts';
import { refreshAll, refreshNow, refreshState, sourceQuestion } from './board-refresh.ts';
import { refreshText, refreshTier, perRefresh } from '../../shared/board-refresh.ts';
import { cardTitle } from '../../shared/boards.ts';
import { listPages } from './store.ts';
import { placeFor } from './folders.ts';
import { addVersion, createPage, mustPage, pageSource } from './store.ts';

const str = (v: unknown) => (typeof v === 'string' ? v : '');

export function boardRoutes(d: Deps, changed: (id: string) => void) {
  const { app, db } = d;
  const B = (req: FastifyRequest) => (req.body ?? {}) as Record<string, unknown>;
  const P = (req: FastifyRequest) => req.params as { id: string; card?: string };
  const board = (id: string) => {
    const p = mustPage(db, id);
    if (p.kind !== 'board') throw new HttpError(400, `“${p.title}” is not a board.`);
    return p;
  };

  app.get('/api/boards/:id/refresh', async (req) => refreshState(d, board(P(req).id).id));
  // Every board's cards that keep themselves up to date, newest board first: when, on which tier, what a refresh costs.
  app.get('/api/boards/refreshes', async () => {
    const boards: { id: string; title: string; cap: number | null; spentUsd: number; reached: boolean }[] = [];
    const cards: Record<string, unknown>[] = [];
    for (const p of listPages(db).filter((x) => x.kind === 'board' && !x.app)) {
      const src = pageSource(db, p.id);
      if (!src) continue;
      const b = readBoard(src.text);
      if (!b.cards.some((c) => c.refresh)) continue;
      const st = refreshState(d, p.id);
      boards.push({ id: p.id, title: p.title, cap: st.cap, spentUsd: st.spentUsd, reached: st.reached });
      for (const c of b.cards) {
        if (!c.refresh) continue;
        const s = st.cards[c.id];
        const tier = refreshTier(c.refresh);
        const per = perRefresh(st, s, tier, tier);
        cards.push({
          board: p.id,
          boardTitle: p.title,
          card: c.id,
          title: cardTitle(c),
          ui: c.ui,
          when: refreshText(c.refresh.schedule),
          tier,
          ...(per !== undefined ? { perRefreshUsd: per } : {}),
          ...(c.refreshedAt ? { refreshedAt: c.refreshedAt } : {}),
          ...(s?.nextAt ? { nextAt: s.nextAt } : {}),
          ...(s?.running ? { running: true } : {}),
          ...(s?.pausedReason ? { paused: s.pausedReason } : s?.task && s.enabled === false ? { paused: 'Paused' } : {}),
          ...(s?.last && s.last.status !== 'done' ? { lastError: s.last.error ?? 'It failed' } : {}),
        });
      }
    }
    return { boards, cards };
  });
  app.get('/api/boards/:id/cards/:card/question', async (req) => {
    const b = readBoard(pageSource(db, board(P(req).id).id)!.text);
    const card = b.cards.find((c) => c.id === P(req).card);
    if (!card) throw new HttpError(404, 'The board has no such card');
    return { question: await sourceQuestion(d, card) };
  });
  app.post('/api/boards/:id/cards/:card/refresh', async (req) => refreshNow(d, board(P(req).id).id, String(P(req).card)));
  app.post('/api/boards/:id/refresh', async (req) => refreshAll(d, board(P(req).id).id));

  app.post('/api/boards/pin', { bodyLimit: 2 * 1024 * 1024 }, async (req) => {
    const b = B(req);
    let card: BoardCard;
    try {
      card = checkCard(b.card, { label: 'The card' });
    } catch (e) {
      if (e instanceof CardError) throw new HttpError(400, e.message);
      throw e;
    }
    // What a confidential session says stays in it: none of its cards goes to the Library, where other agents read.
    if (card.from?.session && confidentialKey(db, card.from.session)) throw new HttpError(403, 'A confidential session’s cards stay in it: they cannot be pinned to a board.');
    card.by = 'user';
    card.pinnedAt = Date.now();
    const id = str(b.board).trim();
    if (id) {
      const cur = mustPage(db, id);
      if (cur.kind !== 'board') throw new HttpError(400, `“${cur.title}” is not a board.`);
      const board = readBoard(pageSource(db, id)!.text);
      if (board.cards.length >= BOARD_LIMITS.cards) throw new HttpError(400, `“${cur.title}” holds ${BOARD_LIMITS.cards} cards already: take some off, or pin this one to another board.`);
      while (board.cards.some((c) => c.id === card.id)) card.id = `${card.id}x`;
      const page = addVersion(db, id, { model: { format: 1, cards: [...board.cards, card] }, by: 'edit' });
      changed(page.id);
      return { page, card };
    }
    const title = str(b.title).trim();
    if (!title) throw new HttpError(400, 'Name the new board (title), or give the board to pin it to (board: its id).');
    // In the project picked, else the one of the session it was pinned from.
    const sessionKey = str(b.sessionKey) || card.from?.session || undefined;
    const place = placeFor(db, b.folder, spaceChoice(db, b.space, sessionSpace(db, sessionKey)));
    const page = createPage(db, { title, kind: 'board', model: { format: 1, cards: [card] }, by: 'made', ...place });
    changed(page.id);
    return { page, card };
  });
}
