// An agent's edit of a text file, shown while the tool call that makes it is still arriving. Claude Code's Edit tool
// takes {file_path, old_string, new_string} and MultiEdit a list of such edits; their JSON comes in pieces, and what has
// come so far is read with readPartial. Each edit is applied to the file's text as far as its new words have come, so
// the page can show the change as it is written. While an edit's old words are still coming, nothing is changed yet:
// the place it will change is marked instead, once enough of the old words are there to find it in the file.
import { readPartial, within, type JsonPath } from './partial-json.ts';

export interface LiveEdit {
  /** The file's text with the call's edits made, as far as they have come. */
  text: string;
  /** In `text`: the new words of the edit being written so far (from..to); while its old words are still coming, the old words found so far (nothing changed yet). */
  from: number;
  to: number;
  /** The edit's old words are still coming: from..to is where it will change, not what it changed. */
  placing: boolean;
}

/** Shortest start of an old string still being written that is looked for in the file. */
export const MIN_PLACE = 12;

interface Edit {
  e: Record<string, unknown>;
  /** Where this edit sits in the call's JSON (its key path). */
  P: JsonPath;
}

/** The file's text with the edits of one tool call made, as far as the call has come; null when none can be shown yet. */
export function liveFileEdit(base: string, call: string, o?: { html?: boolean }): LiveEdit | null {
  const p = readPartial(call);
  const v = p.value;
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const top = v as Record<string, unknown>;

  // MultiEdit keeps a list of edits; Edit has its one edit at the top of the call.
  const list: Edit[] = [];
  if (Array.isArray(top.edits)) {
    top.edits.forEach((e, i) => {
      if (e && typeof e === 'object' && !Array.isArray(e)) list.push({ e: e as Record<string, unknown>, P: ['edits', i] });
    });
  } else list.push({ e: top, P: [] });

  let text = base;
  let last: LiveEdit | null = null;
  for (const { e, P } of list) {
    const old = e.old_string;
    if (typeof old !== 'string' || old === '') break;

    // The old words are still coming: look for them as far as they have come, and mark the place.
    if (within(p.open, [...P, 'old_string'])) {
      if (old.length < MIN_PLACE) break;
      const at = text.indexOf(old);
      if (at < 0) break;
      last = { text, from: at, to: at + old.length, placing: true };
      break;
    }

    const at = text.indexOf(old);
    const nwRaw = e.new_string;
    if (typeof nwRaw !== 'string') {
      // The new words have not started: the place is known, nothing is changed yet.
      if (p.open !== null && at >= 0) last = { text, from: at, to: at + old.length, placing: true };
      break;
    }

    if (at < 0) {
      // The edit being written stops here (its old words are not in the file); a finished one is left out.
      if (within(p.open, P)) break;
      continue;
    }

    if (within(p.open, [...P, 'new_string'])) {
      // The new words are still coming: a tag cut short is left out of the shown text.
      let nw = nwRaw;
      if (o?.html) {
        const lt = nw.lastIndexOf('<');
        if (lt > nw.lastIndexOf('>')) nw = nw.slice(0, lt);
      }
      const rep = nw + restOf(old, nw);
      text = e.replace_all === true ? text.split(old).join(rep) : text.slice(0, at) + rep + text.slice(at + old.length);
      last = { text, from: at, to: at + nw.length, placing: false };
      break;
    }

    // The new words are complete: the edit is made, and the next one (MultiEdit) is made on the result.
    text = e.replace_all === true ? text.split(old).join(nwRaw) : text.slice(0, at) + nwRaw + text.slice(at + old.length);
    last = { text, from: at, to: at + nwRaw.length, placing: false };
  }
  return last;
}

/** The old words not written over yet, while `nw` (the new words so far) replaces `old`. */
export function restOf(old: string, nw: string): string {
  // The common start is written over already.
  let p = 0;
  while (p < old.length && p < nw.length && old[p] === nw[p]) p++;
  if (p === nw.length) return old.slice(p);
  // Otherwise find where the new words' end is in the old words, and continue after it.
  for (let L = Math.min(24, nw.length); L >= 6; L--) {
    const s = nw.slice(nw.length - L);
    const j = old.indexOf(s, Math.max(0, p - L + 1));
    if (j >= 0) return old.slice(j + L);
  }
  // Nothing matches: keep the old words from the next line break on.
  const k = old.indexOf('\n', Math.min(nw.length, old.length));
  return k < 0 ? '' : old.slice(k);
}
