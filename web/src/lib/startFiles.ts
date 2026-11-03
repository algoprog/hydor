// Files and folders on this computer picked for the next new session ("Start a session with it" in Files,
// in a file's window, on an agent's file card): the start page puts them in its message box, among the
// attachments, and they go with the first message by their paths.
import { hostAttachment, type Attachment } from './attachments';
import { go } from './nav';

export interface StartFile {
  path: string;
  size?: number;
  dir?: boolean;
  /** What its chip shows, when not the file's own name (a Library item's title). */
  name?: string;
}

let waiting: StartFile[] = [];

/** Opens the start page with these in its box, after any picked before that it has not taken yet; `to` adds a prompt or a folder (/?prompt=…&cwd=…). */
export function startSessionWith(list: StartFile[], to = '/') {
  const have = new Set(waiting.map((f) => f.path));
  waiting = [...waiting, ...list.filter((f) => !have.has(f.path))].slice(0, 20);
  go(to);
}

/** What waits for the start page's box, as attachments (it calls doneStartFiles once it has them). */
export const waitingStartFiles = (): Attachment[] => waiting.map((f) => hostAttachment(f.path, f));

export function doneStartFiles() {
  waiting = [];
}
