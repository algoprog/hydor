// What makes the version an agent is writing out of its call so far, one builder for each kind (shared/draft-*.ts), and
// an empty one of each kind for a new one's editor to start from. Loaded the first time an agent saves a document, a
// deck, a spreadsheet or a LaTeX document while the app is open (live.ts), as the editors themselves are: they and the
// models they read stay out of what the app loads to start.
import { readPartial } from '@shared/partial-json';
import type { DraftKind, DraftMemo, Drafted } from '@shared/page-drafts';
import { draftDoc } from '@shared/draft-doc';
import { draftDeck } from '@shared/draft-deck';
import { draftBook } from '@shared/draft-book';
import { draftTex } from '@shared/draft-tex';
import { normalizeDoc } from '@shared/docs';
import { normalizeDeck } from '@shared/slides';
import { newBook } from '@shared/sheets';
import { normalizeTex } from '@shared/latex';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const BUILD: Record<DraftKind, (base: any, p: ReturnType<typeof readPartial>, memo: DraftMemo) => Drafted<any> | null> = {
  doc: draftDoc,
  slides: draftDeck,
  sheet: draftBook,
  tex: draftTex,
};

/** The version a call's text so far (`text`) writes over `base` (none for a new one). */
export const buildDraft = <M>(kind: DraftKind, base: M | null, text: string, memo: DraftMemo): Drafted<M> | null => BUILD[kind](base, readPartial(text), memo);

/** An empty one of a kind: the editor of a new one being written starts from it. */
export function emptyModel(kind: DraftKind): unknown {
  if (kind === 'doc') return normalizeDoc({ markdown: '' });
  if (kind === 'slides') return normalizeDeck({ slides: [{ layout: 'blank' }] });
  if (kind === 'sheet') return newBook();
  return normalizeTex({ main: '' });
}
