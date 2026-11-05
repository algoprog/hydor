// What every editor of a kind of page in Pages takes (slides, documents, spreadsheets, LaTeX; a page of HTML has the
// Studio): the model to edit, where it shows, how it saves, and what it tells the page around it (whether it has
// unsaved changes, what an agent asked about it should be told it is about).
import type { MutableRefObject, ReactNode } from 'react';
import { api } from '../../lib/api';

/** An older version's model, to look at in its editor (`id` already encoded for an address). */
export const loadModelVersion = <M,>(id: string, v: number) => api<{ title: string; model: M }>(`/api/pages/${id}/versions/${v}?model=1`);

/** Where a request to an agent is for: its label on a chip, and the words that start the message ("On slide 3: "). */
export interface AskScope {
  id: string;
  label: string;
  lead: string;
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
  /** What an agent asked now could be about, most specific last: told as what is in view or picked changes. */
  onScopes?: (scopes: AskScope[]) => void;
  /** Saves now, if there are changes (before an agent is asked about it): false when it did not. */
  saveNowRef?: MutableRefObject<(() => Promise<boolean>) | null>;
  /**
   * A file of this computer's opened from Files rather than a page (the LaTeX editor uses it): the folder it is
   * typeset in, among its other files (none when TeX may not read it); its main file's own name, shown for main.tex;
   * the file to start on; and its comments as the app keeps them now, when they changed elsewhere (an agent answered
   * one), `n` counting each time they come.
   */
  file?: { folder?: string; main: string; open?: string; comments?: { list: unknown[]; n: number } };
}
