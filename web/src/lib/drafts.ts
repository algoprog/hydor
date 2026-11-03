// What a message box holds until it is sent, so a box left for another page has it all again on the way
// back: the text in the browser's storage (it outlasts a reload too), the attached files in this page (a
// message carries up to 25 MB of them, more than that storage holds) until it reloads.
import type { SessionExtra } from '@shared/features';
import { releaseAttachments, type Attachment } from './attachments';
import { machineKey } from './machine';

const textKey = (key: string) => `wa.draft.${key}`;
const files = new Map<string, Attachment[]>();

/** What is written in session `key`'s box and not sent. */
export function draftText(key: string): string {
  try {
    return localStorage.getItem(textKey(key)) ?? '';
  } catch {
    return '';
  }
}

export function keepDraftText(key: string, text: string) {
  try {
    if (text) localStorage.setItem(textKey(key), text);
    else localStorage.removeItem(textKey(key));
  } catch {}
}

/** The files attached in session `key`'s box and not sent. */
export const draftFiles = (key: string): Attachment[] => files.get(key) ?? [];

export function keepDraftFiles(key: string, list: Attachment[]) {
  if (list.length) files.set(key, list);
  else files.delete(key);
}

/** Session `key`'s box was sent: nothing of it waits any more. */
export function clearDraft(key: string) {
  keepDraftText(key, '');
  files.delete(key);
}

/** The start page's box as it was left. Its picks (the agent, the folder, the assistant…) are kept on the server instead (lib/start.ts). */
export interface StartDraft {
  text: string;
  files: Attachment[];
  /** The options for this task alone: Swarm, Deep research, Arena, its own guidelines. */
  extra: SessionExtra;
  /** The folder a link opened the box in, and the folder picked last it stood over: it holds while that one does. */
  folder?: { cwd: string; over: string };
  /** The query of the page it was written on: a link's prompt gives way to the draft only there. */
  from: string;
}

const START = machineKey('wa.startDraft');
let start: StartDraft | null | undefined;

export function startDraft(): StartDraft | null {
  if (start === undefined) {
    try {
      const d = JSON.parse(localStorage.getItem(START) ?? 'null');
      start = d && typeof d.text === 'string' ? { text: d.text, files: [], extra: d.extra ?? {}, folder: d.folder, from: d.from ?? '' } : null;
    } catch {
      start = null;
    }
  }
  return start;
}

/**
 * Keeps the start page's box as it is now; null, or a box with nothing in it, clears it. `release`: false when the
 * files it no longer holds went somewhere that still shows them (a session starting with them).
 */
export function keepStartDraft(d: StartDraft | null, release = true) {
  const next = d && (d.text || d.files.length || Object.keys(d.extra).length || d.folder) ? d : null;
  // Files the box no longer holds have no thumbnail to show.
  if (start && release) releaseAttachments(start.files.filter((a) => !next?.files.includes(a)));
  start = next;
  try {
    if (next) localStorage.setItem(START, JSON.stringify({ text: next.text, extra: next.extra, folder: next.folder, from: next.from }));
    else localStorage.removeItem(START);
  } catch {}
}
