// One text box's word suggestions: what shows now, and what it takes to keep it right as the person types. The box
// is reached through an adapter (a textarea, or Docs' editor), so the same rules serve both. `sync` is called after
// anything that may have changed the box (typing, a caret move, a focus); `key` offers a key press first. Nothing
// here reaches the network or the stores: the request and the switches are given (controller.ts), so a test can run it.
import type { SuggestCounts, SuggestRequest, SuggestResponse } from '@shared/suggest';
import { afterSpace, allowed, atWordEnd, backspaced, consume, greyOf, judgeTyped, requestOf, sameGrey, startsWord, takeAll, takeWord, takenCounts, typedBetween, typedChars, type Field, type Gate, type Grey, type Place } from './logic';

/** What the box is to the controller. */
export interface Adapter {
  place: Place;
  /** The box as it is now, or null when it has no caret (not focused, gone). */
  read(): Field | null;
  /** Put text at the caret, the way typing it would (so that undo works). */
  insert(text: string): void;
  /** What goes with the text before the caret: the reply being answered, the document before the paragraph, the session. */
  context(): { reply?: string; prev?: string; doc?: string; session?: string };
}

export const DEBOUNCE_MS = 30;

/** What the controller needs from outside: the request, the switches, and this tab's id. */
export interface Outside {
  send: (req: SuggestRequest, signal: AbortSignal) => Promise<SuggestResponse | null>;
  gate: () => Gate;
  client: string;
  /** Told what suggestions did, as counts only (batched and sent by usage.ts). */
  count?: (c: Partial<SuggestCounts>) => void;
}

const same = (a: Field | null, b: Field | null) => !!a && !!b && a.before === b.before && a.after === b.after && a.id === b.id && !!a.selected === !!b.selected && !!a.composing === !!b.composing;

export class Suggester {
  grey: Grey | null = null;
  /** Esc hid what shows: nothing shows until the next word begins. */
  private hidden = false;
  private last: Field | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private ctl: AbortController | null = null;
  private seq = 0;
  private inserting = false;
  /** The grey word showing is a suggestion that has been counted as shown and has no outcome yet. */
  private live = false;

  constructor(
    private ad: Adapter,
    private on: (g: Grey | null) => void,
    private out: Outside,
  ) {}

  private show(g: Grey | null) {
    if (g === this.grey || (g && this.grey && g.word === this.grey.word && g.next === this.grey.next)) return;
    // Hidden with no verdict (Esc, a blur, a caret move, sending): neither right nor wrong.
    if (!g) this.live = false;
    this.grey = g;
    this.on(g);
  }

  /** A new suggestion is showing: counted as shown, and waiting for what the person does with it. */
  private began() {
    this.live = true;
    this.out.count?.({ shown: 1 });
  }

  /** Stop what is under way and show nothing (a blur, a switch turned off, the box gone). */
  reset() {
    clearTimeout(this.timer);
    this.seq++;
    this.ctl?.abort();
    this.ctl = null;
    this.last = null;
    this.show(null);
  }

  /** The box may have changed: keep what shows if the person typed exactly its letters, else ask again. */
  sync() {
    if (this.inserting) return;
    const f = this.ad.read();
    if (!f || !allowed(this.out.gate(), this.ad.place)) return this.reset();
    const prev = this.last;
    if (same(prev, f)) return;
    this.last = f;
    if (this.hidden && startsWord(f)) this.hidden = false;
    const typed = typedBetween(prev, f);
    // What was typed here (not what Tab inserted, which `take` has already read; not a paste or dictation, nor an input method's text).
    const grown = prev?.composing || f.composing ? 0 : typedChars(typed);
    if (grown) this.out.count?.({ typedChars: grown });
    if (this.live && this.grey) {
      if (typed) {
        const v = judgeTyped(this.grey, typed);
        if (v.through || v.wrong || v.fresh) this.out.count?.({ typedThrough: v.through, wrong: v.wrong ? 1 : 0, shown: v.fresh ? 1 : 0 });
        if (v.wrong) this.live = false;
      } else if (backspaced(prev, f)) {
        this.out.count?.({ wrong: 1 });
        this.live = false;
      }
    }
    if (this.grey && typed) {
      const rest = consume(this.grey, typed);
      if (rest !== undefined) {
        // Typed what shows: the rest stays, and no new request, until all of it is typed.
        clearTimeout(this.timer);
        this.seq++;
        this.ctl?.abort();
        this.ctl = null;
        this.show(rest);
        if (rest) return;
      }
    }
    this.ask(f, false);
  }

  /** Ask for a suggestion at the caret (after a pause of 30 ms; the request before it is cancelled). `keep`: what shows stays until the answer. */
  private ask(f: Field, keep: boolean) {
    clearTimeout(this.timer);
    this.seq++;
    this.ctl?.abort();
    this.ctl = null;
    if (!keep) this.show(null);
    if (this.hidden || !atWordEnd(f)) return this.show(null);
    const mine = this.seq;
    this.timer = setTimeout(() => {
      const ctl = (this.ctl = new AbortController());
      const req = requestOf(this.ad.place, f, this.ad.context(), this.out.client);
      this.out.send(req, ctl.signal)
        .then((r) => afterSpace(greyOf(r), f.before))
        .catch(() => null)
        .then((g) => {
          if (mine !== this.seq || ctl.signal.aborted) return;
          // Only if the box is still as it was asked about.
          const now = this.ad.read();
          if (!same(now, f)) return;
          if (!g || !sameGrey(g, this.grey)) {
            if (g) this.began();
            this.show(g);
          }
        });
    }, DEBOUNCE_MS);
  }

  /** A key press, before the box's own handling: true when it was taken (Tab, → at the end, Esc). */
  key(e: { key: string; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean; isComposing?: boolean; preventDefault(): void; stopPropagation(): void }): boolean {
    const g = this.grey;
    if (!g || e.isComposing) return false;
    const plain = !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey;
    if (e.key === 'Escape' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      e.stopPropagation();
      this.hidden = true;
      this.seq++;
      this.ctl?.abort();
      clearTimeout(this.timer);
      this.show(null);
      return true;
    }
    if (!plain) return false;
    if (e.key === 'Tab') {
      e.preventDefault();
      const t = takeWord(g);
      this.take(t, takenCounts(g, t.insert, false));
      return true;
    }
    if (e.key === 'ArrowRight') {
      const f = this.ad.read();
      if (!f || f.after.length) return false;
      e.preventDefault();
      const insert = takeAll(g);
      this.take({ insert, grey: null }, takenCounts(g, insert, true));
      return true;
    }
    return false;
  }

  /** Put what was taken in the box, and show what follows it. */
  private take(t: { insert: string; grey: Grey | null }, counts: Partial<SuggestCounts>) {
    // Right, and the keystrokes it saved; what it inserts is read as the box's state now, so it is never counted as typed.
    this.out.count?.(counts);
    this.live = false;
    this.inserting = true;
    try {
      this.ad.insert(t.insert);
    } finally {
      this.inserting = false;
    }
    const f = this.ad.read();
    this.last = f;
    // The next word is now the grey word: a new suggestion.
    if (t.grey) this.began();
    this.show(t.grey);
    if (f) this.ask(f, !!t.grey);
  }
}
