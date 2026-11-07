// What every editor of a kind of page in Pages takes (slides, documents, spreadsheets, LaTeX; a page of HTML has the
// Studio): the model to edit, where it shows, how it saves, and what it tells the page around it (whether it has
// unsaved changes, what an agent asked about it should be told it is about).
import type { MutableRefObject, ReactNode } from 'react';
import type { DraftMark } from '@shared/page-drafts';
import type { TexFileKind } from '@shared/latex-files';
import type { MadeRequest } from './types/requests';
import type { CommentAi } from './common/commentAi';
import { api } from '../../lib/api';

/** An older version's model, to look at in its editor (`id` already encoded for an address). */
export const loadModelVersion = <M,>(id: string, v: number) => api<{ title: string; model: M }>(`/api/pages/${id}/versions/${v}?model=1`);

/** Where a request to an agent is for: its label on a chip, and the words that start the message ("On slide 3: "). */
export interface AskScope {
  id: string;
  label: string;
  lead: string;
}

/** A new version an agent is writing, as far as its call has come (live.ts makes it), for the editor to show in its place. */
export interface LiveDraft<M> {
  /** The version being written: what the agent has written so far, then the rest as it was. */
  model: M;
  /** Where its words are arriving; null when none are (it is written whole, or the agent writes other parts of the call). */
  mark: DraftMark | null;
  /** The call is written whole: its version is being saved (a LaTeX document is typeset first). */
  done: boolean;
  /** Counts what was drawn of it. */
  n: number;
}

export interface ModelDoc<M> {
  /** Changes when it is another page, or another version of it. */
  key: string;
  title: string;
  model: M;
}

export interface ModelEditorProps<M> {
  doc: ModelDoc<M> | null;
  pageId: string;
  /** page: a page of its own in Pages; panel: beside a conversation; sheet: over everything on a phone. */
  layout: 'page' | 'panel' | 'sheet';
  /** An older version on view: nothing changes. */
  readOnly?: boolean;
  /** Saves the model as a new version; false when it did not. */
  onSave?: (model: M) => Promise<boolean>;
  /** The top bar's start (a way back, the title) and end (the container's own buttons), and what goes under it. */
  lead?: ReactNode;
  tail?: ReactNode;
  band?: ReactNode;
  /** Under the save bar: who hears of the change. */
  savedNote?: string;
  onDirty?: (dirty: boolean) => void;
  /** "Ask the agent about it" on what is picked: the words that say what it is ("In the section “Pricing”: "). */
  onAsk?: (text: string) => void;
  /**
   * A request about it made in the gallery (a slide made with AI): its short line, what to make, the whole of it. Pages
   * sends it through its Ask panel at once (the agent told what to make in full); beside a conversation the whole of it
   * goes in the message box. Left out, the editor offers none.
   */
  onRequest?: (r: MadeRequest) => void;
  /** What an agent asked now could be about, most specific last: told as what is in view or picked changes. */
  onScopes?: (scopes: AskScope[]) => void;
  /**
   * Resolve with AI on its comments (common/commentAi.tsx): the request goes at once to the agent of the place it is in,
   * and the comments an agent is at work on say so. Left out (an older version, a shared project's portal, a file an
   * agent cannot answer the comments of), the comments offer none.
   */
  commentAi?: CommentAi;
  /** Saves now, if there are changes (before an agent is asked about it): false when it did not. */
  saveNowRef?: MutableRefObject<(() => Promise<boolean>) | null>;
  /**
   * An agent writing a new version of it right now: shown in place of the version open, read-only, with where its words
   * are arriving kept in view, until the saved version takes its place (or, the call failed, the version open shows
   * again). Changes here not saved yet are left as they are: then it does not show.
   */
  live?: LiveDraft<M> | null;
  /**
   * A file of this computer's opened from Files rather than a page (the LaTeX editor uses it): the folder it is
   * typeset in, among its other files (none when TeX may not read it); its main file's own name, shown for main.tex;
   * the file to start on; and its comments as the app keeps them now, when they changed elsewhere (an agent answered
   * one), `n` counting each time they come. `dir`: its folder (whether or not TeX may read it), and `uses`: the files of
   * it the document uses that the editor does not hold (pictures, styles, data), for the files tree.
   */
  file?: { folder?: string; main: string; open?: string; comments?: { list: unknown[]; n: number }; dir?: string; uses?: { name: string; kind: TexFileKind; size: number }[] };
}
