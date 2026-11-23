// Word suggestions, the rules without a screen: when to ask, what to send, what typing the grey letters does to what
// shows, what Tab and → take. No React and no DOM here, so each rule is a plain function a test can run
// (logic-test.ts); controller.ts keeps the state of one text box and calls them, and the textarea and Docs adapters
// only read and write their field.
import { SUGGEST_COUNT_KEYS, SUGGEST_USAGE_CAP, type SuggestCounts, type SuggestRequest, type SuggestResponse, type SuggestSettings, type SuggestState, type SuggestSurface } from '@shared/suggest';

/** Where a text box is, as Settings → Capabilities → Word suggestions names the places: message boxes, documents, notes, other boxes. */
export type Place = 'chat' | 'docs' | 'notes' | 'other';

/** What the server is asked for in each place. */
export const surfaceOf = (p: Place): SuggestSurface => (p === 'chat' ? 'chat' : p === 'docs' ? 'doc' : 'text');

/** How much of each text goes to the server (its last characters). */
export const MAX_CHARS = 2000;
export const tail = (s: string | undefined, n = MAX_CHARS) => (s && s.length > n ? s.slice(s.length - n) : s);

/** What the state of a text box is, as far as asking goes: the text before the caret and after it. */
export interface Field {
  before: string;
  after: string;
  /** Some text is selected (there is no caret to suggest at). */
  selected?: boolean;
  /** An input method (Japanese, Chinese, an accent key…) is composing. */
  composing?: boolean;
  /** Which box it is, where one editor holds many (Docs: a paragraph): another box is never "typing more". */
  id?: string;
}

/** The switches that decide whether to ask in a place. */
export interface Gate {
  enabled: boolean;
  state: SuggestState['status']['state'] | undefined;
  where: SuggestSettings['where'];
  /** Settings → Capabilities → Word suggestions → Show in this browser. */
  browser: boolean;
}

/** Whether suggestions show in `place` at all: on, set up (or loading), the place on in the settings, and this browser's switch on. */
export function allowed(g: Gate, place: Place): boolean {
  if (!g.enabled || !g.browser) return false;
  if (g.state !== 'ready' && g.state !== 'starting') return false;
  return g.where[place];
}

/** A letter, digit or mark of any script, or an apostrophe inside a word. */
const WORD = /[\p{L}\p{N}\p{M}'’]/u;
const lastChar = (s: string) => (s ? Array.from(s.slice(-2)).pop()! : '');

/**
 * Whether the caret is where a suggestion makes sense: collapsed, not mid-composition, nothing more on its line
 * (the grey text would sit on top of it), and right after a letter (the end of a word) or after whitespace (a new
 * word). After punctuation or nothing at all there is no word to suggest, nor in an @file, a /command or an address.
 */
export function atWordEnd(f: Field): boolean {
  if (f.selected || f.composing || !/\S/.test(f.before)) return false;
  if (f.after && !/^[ \t]*(\r?\n|$)/.test(f.after)) return false;
  const c = lastChar(f.before);
  // A file or command being picked from the box's @ and / menus, or an address, is not a word to complete.
  const token = /\S*$/.exec(f.before)![0];
  if (token && (/^[@/]/.test(token) || token.includes('://'))) return false;
  return /\s/.test(c) || WORD.test(c);
}

/** What goes to the server for a text box in `place` (chat: with the reply it answers and the earlier message). */
export function requestOf(place: Place, f: Field, ctx: { reply?: string; prev?: string; doc?: string; session?: string }, client: string): SuggestRequest {
  const r: SuggestRequest = { surface: surfaceOf(place), text: tail(f.before)!, client };
  if (place === 'chat') {
    if (ctx.reply) r.reply = tail(ctx.reply);
    if (ctx.prev) r.prev = tail(ctx.prev);
    if (ctx.session) r.session = ctx.session;
  } else if (place === 'docs' && ctx.doc) r.doc = tail(ctx.doc);
  return r;
}

/** What shows after the caret: the rest of the word being typed (or a whole next word), and the word after it, dimmer. */
export interface Grey {
  word: string;
  next: string;
}

/** What an answer shows: nothing when it says not to (or has nothing), `word` when `show`, `next` also when `showNext`. */
export function greyOf(r: SuggestResponse | null | undefined): Grey | null {
  if (!r || !r.show) return null;
  const word = r.word ?? '';
  const next = r.showNext ? (r.next ?? '') : '';
  return word || next ? { word, next } : null;
}

/**
 * What shows right after whitespace that was typed: never more whitespace (a second space). The grey text loses the
 * whitespace it begins with, and when the word itself is empty the next word becomes the word.
 */
export function afterSpace(g: Grey | null, before: string): Grey | null {
  if (!g || !/\s$/.test(before)) return g;
  let word = g.word.replace(/^\s+/, '');
  let next = g.next;
  if (!word) (word = next.replace(/^\s+/, '')), (next = '');
  return word || next ? { word, next } : null;
}

/** Whether two things to show read the same (an answer that only repeats what is on screen changes nothing). */
export const sameGrey = (a: Grey | null, b: Grey | null) => (a?.word ?? '') + (a?.next ?? '') === (b?.word ?? '') + (b?.next ?? '');

/**
 * What typing `typed` leaves of what shows: the letters it shows are used up, with no new request. undefined when
 * the letters differ (a new request, then); null when all of it has been typed. Once the rest of the word is typed
 * the next word shows as it is; once its first letters are typed it is the word being typed, in the word's grey.
 */
export function consume(g: Grey, typed: string): Grey | null | undefined {
  if (!typed) return g;
  const all = g.word + g.next;
  if (!all.startsWith(typed)) return undefined;
  const rest = all.slice(typed.length);
  if (!rest) return null;
  if (typed.length > g.word.length) return { word: rest, next: '' };
  const w = g.word.length - typed.length;
  return { word: rest.slice(0, w), next: rest.slice(w) };
}

/** What Tab takes: the word, and the next word becomes the one shown (the word's grey); with no word left, the next word. */
export function takeWord(g: Grey): { insert: string; grey: Grey | null } {
  if (g.word) return { insert: g.word, grey: g.next ? { word: g.next, next: '' } : null };
  return { insert: g.next, grey: null };
}

/** What → at the end of the text takes: the word and the next one. */
export const takeAll = (g: Grey): string => g.word + g.next;

/**
 * What was typed between two states of a box, when the text after the caret did not change and the text before it
 * only grew: that growth ('' when nothing changed). null when it is anything else (Backspace, a paste over a
 * selection, a caret move, a different text).
 */
export function typedBetween(prev: Field | null, cur: Field): string | null {
  if (!prev) return null;
  if (prev.after !== cur.after || prev.id !== cur.id) return null;
  if (!cur.before.startsWith(prev.before)) return null;
  return cur.before.slice(prev.before.length);
}

/** Whether the caret is just after whitespace: a new word begins here (Esc's hiding lasts until it does). */
export const startsWord = (f: Field) => /\s$/.test(f.before);

// ---- what suggestions did: counts only, never any text (shared/suggest.ts SuggestCounts)

/** No counts. */
export const noCounts = (): SuggestCounts => ({ shown: 0, taken: 0, typedThrough: 0, wrong: 0, saved: 0, typedChars: 0 });

/** `a` and `b` added up. */
export function addCounts(a: SuggestCounts, b: Partial<SuggestCounts>): SuggestCounts {
  const out = { ...a };
  for (const k of SUGGEST_COUNT_KEYS) out[k] += b[k] ?? 0;
  return out;
}

/** Whether any count is more than 0. */
export const hasCounts = (c: SuggestCounts) => SUGGEST_COUNT_KEYS.some((k) => c[k] > 0);

/**
 * `c` cut into pieces the server accepts: no count above `cap` in any one (the rest goes in the next piece). Nothing
 * for no counts.
 */
export function splitCounts(c: SuggestCounts, cap = SUGGEST_USAGE_CAP): SuggestCounts[] {
  const out: SuggestCounts[] = [];
  const left = { ...c };
  while (hasCounts(left)) {
    const piece = noCounts();
    for (const k of SUGGEST_COUNT_KEYS) {
      piece[k] = Math.min(left[k], cap);
      left[k] -= piece[k];
    }
    out.push(piece);
  }
  return out;
}

/** The characters of a text, as a person counts them (an emoji or a letter with its accents is one). */
export const charCount = (s: string) => Array.from(s).length;

/** The most characters one change of a box may add and still be counted as typing (more is a paste or dictation). */
export const TYPED_MAX = 4;

/** What a change that grew the text before the caret by `typed` ('' or null: not a growth) adds to the characters typed: 1 to 4, else 0. */
export function typedChars(typed: string | null): number {
  if (!typed) return 0;
  const n = charCount(typed);
  return n <= TYPED_MAX ? n : 0;
}

/** The keystrokes one Tab or → saved: the characters it inserted, minus the key pressed (never below 0). */
export const savedBy = (inserted: string) => Math.max(0, charCount(inserted) - 1);

/** What Tab or → did to the counts: the words taken (→ takes the word and the next: two), and the keystrokes saved by what it inserted. */
export function takenCounts(g: Grey, insert: string, all: boolean): SuggestCounts {
  const words = all && g.word && g.next ? 2 : 1;
  // A second word taken without ever being the grey word was shown too (dimmer), so right is never more than shown.
  return { ...noCounts(), taken: words, shown: words - 1, saved: savedBy(insert) };
}

/** What typing `typed` did to the suggestion showing: nothing, its words typed through, or something else typed. */
export interface Typed {
  /** The words of what showed that the typing completed (0 to 2: the word, and the next one). */
  through: number;
  /** The next word became the grey word because of it: a new suggestion (so `shown` goes up). */
  fresh: boolean;
  /** Something other than what showed was typed. */
  wrong: boolean;
}

/**
 * The verdict on typing `typed` (a growth of the text before the caret) while `g` showed: the letters it shows used up
 * are right once a whole word is typed (its last letter, or the space after it, typed in the same change); a letter
 * that differs is wrong. The unit is the word, or the next word when the word is empty (it is all that shows).
 */
export function judgeTyped(g: Grey, typed: string): Typed {
  const rest = consume(g, typed);
  if (rest === undefined) return { through: 0, fresh: false, wrong: true };
  const n = charCount(typed);
  const w = charCount(g.word);
  const all = w + charCount(g.next);
  if (!w) return { through: n >= all ? 1 : 0, fresh: false, wrong: false };
  if (n < w) return { through: 0, fresh: false, wrong: false };
  if (!g.next) return { through: 1, fresh: false, wrong: false };
  // The word is done and the next one is now the word being typed (or is typed too).
  return { through: n >= all ? 2 : 1, fresh: true, wrong: false };
}

/** Whether `cur` is `prev` with some characters just before the caret deleted (Backspace, or Ctrl+Backspace), nothing else changed. */
export function backspaced(prev: Field | null, cur: Field): boolean {
  return !!prev && prev.after === cur.after && prev.id === cur.id && cur.before.length < prev.before.length && prev.before.startsWith(cur.before);
}

/** A share as a whole percent (0 when there is nothing to divide by). */
const percent = (part: number, whole: number) => (whole > 0 ? Math.round((100 * part) / whole) : 0);

/** The numbers Settings shows for a set of counts: keystrokes saved and their share of the typing, suggestions right of those judged. */
export function summarise(c: SuggestCounts) {
  const right = c.taken + c.typedThrough;
  const judged = right + c.wrong;
  return { saved: c.saved, savedShare: percent(c.saved, c.typedChars + c.saved), right, judged, rightShare: percent(right, judged), taken: c.taken };
}
