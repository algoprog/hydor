// Pinning an answer card to a board (shared/boards.ts says the format; boards.ts the kind), signed in:
//   POST /api/boards/pin {board?: a board's id, title?: a new board's name, space?, folder?, sessionKey?,
//                         card: {ui, data, title?, size?, from?}} → {page, card}
// The card goes at the end of the board, its data copied as it is now; with no board, a new one is made for it, in the
// project asked for (else the session's). Each pin is a new version of the board.
import type { FastifyRequest } from 'fastify';
import { BOARD_LIMITS, CardError, checkCard, type BoardCard } from '../../shared/boards.ts';
import { HttpError } from '../auth.ts';
import { confidentialKey } from '../confidential/index.ts';
import type { Deps } from '../features/types.ts';
import { sessionSpace, spaceChoice } from '../spaces/choice.ts';
import { readBoard } from './boards.ts';
import { placeFor } from './folders.ts';
import { addVersion, createPage, mustPage, pageSource } from './store.ts';

const str = (v: unknown) => (typeof v === 'string' ? v : '');

export function boardRoutes(d: Deps, changed: (id: string) => void) {
  const { app, db } = d;
  const B = (req: FastifyRequest) => (req.body ?? {}) as Record<string, unknown>;

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
