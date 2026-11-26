// One text box's word suggestions: what shows now, and what it takes to keep it right as the person types. The box
// is reached through an adapter (a textarea, or Docs' editor), so the same rules serve both. `sync` is called after
// anything that may have changed the box (typing, a caret move, a focus); `key` offers a key press first. A box has at
// most one request under way: typing on does not stop it (its answer is used up by the letters typed since, as what
// shows is), and when it answers, the box as it is now is asked about. Every guess, shown or not, is judged against
// the word the person then types, as counts only. Nothing here reaches the network or the stores: the request and the switches are given (controller.ts), so a test can run it.
import type { SuggestCounts, SuggestPlan, SuggestRequest, SuggestResponse } from '@shared/suggest';
import { TYPED_MAX, afterSpace, allowed, atWordEnd, backspaced, charCount, consume, greyOf, guessOf, judgeTyped, requestOf, sameGrey, startsWord, takeAll, takeWord, takenCounts, typedBetween, typedChars, verdictOf, type Field, type Gate, type Grey, type Guess, type Place } from './logic';

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
/** A request out this long is given up on at the next keystroke (a connection that hangs must not hold the box). */
export const MAX_FLIGHT_MS = 3000;
/** The most guesses at one time waiting for the word to be finished. */
const GUESSES_MAX = 24;

/** What the controller needs from outside: the request, the switches, and this tab's id. */
export interface Outside {
  send: (req: SuggestRequest, signal: AbortSignal) => Promise<SuggestResponse | null>;
  gate: () => Gate;
  client: string;
  /** Told what suggestions did, as counts only (batched and sent by usage.ts). */
  count?: (c: Partial<SuggestCounts>) => void;
  /** Told whether a guess, shown or not, was right: how sure it was and which plan made it, never the word. */
  judge?: (plan: SuggestPlan, conf: number, right: boolean) => void;
}

const same = (a: Field | null, b: Field | null) => !!a && !!b && a.before === b.before && a.after === b.after && a.id === b.id && !!a.selected === !!b.selected && !!a.composing === !!b.composing;

export class Suggester {
  grey: Grey | null = null;
  /** Esc hid what shows: nothing shows until the next word begins. */
  private hidden = false;
  private last: Field | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  /** The request under way: what the box was when it was sent. */
  private flight: { field: Field; ctl: AbortController; at: number } | null = null;
  private inserting = false;
  /** The grey word showing is a suggestion that has been counted as shown and has no outcome yet. */
  private live = false;
  /** The person typed letters of what shows: an answer with nothing to show leaves it. */
  private confirmed = false;
  /** The guesses waiting for the word to be finished, and the one of them whose letters show. */
  private guesses: Guess[] = [];
  private shownGuess: Guess | null = null;

  constructor(
    private ad: Adapter,
    private on: (g: Grey | null) => void,
    private out: Outside,
  ) {}

  private show(g: Grey | null) {
    if (g === this.grey || (g && this.grey && g.word === this.grey.word && g.next === this.grey.next)) return;
    // Hidden with no verdict (Esc, a blur, a caret move, sending): neither right nor wrong.
    if (!g) (this.live = false), (this.shownGuess = null), (this.confirmed = false);
    this.grey = g;
    this.on(g);
  }

  /** A new suggestion is showing: counted as shown, and waiting for what the person does with it. */
  private began() {
    this.live = true;
    this.shownGuess = null;
    this.confirmed = false;
    this.out.count?.({ shown: 1 });
  }

  /** The suggestion showing has an outcome (taken, typed through, or something else typed): its guess is judged so. */
  private verdict(right: boolean) {
    const g = this.shownGuess;
    if (!g) return;
    this.shownGuess = null;
    this.guesses = this.guesses.filter((x) => x !== g);
    this.out.judge?.(g.plan, g.conf, right);
  }

  /** Keep the guess an answer about `asked` holds, to be judged (one per place in the word: a later one replaces it). */
  private note(asked: Field, r: SuggestResponse | null): Guess | null {
    const g = this.out.judge ? guessOf(asked, r) : null;
    if (!g) return null;
    this.guesses = this.guesses.filter((x) => x === this.shownGuess || x.base.before !== asked.before || x.base.after !== asked.after || x.base.id !== asked.id);
    this.guesses.push(g);
    while (this.guesses.length > GUESSES_MAX) this.guesses.shift();
    return g;
  }

  /** The letters showing are the rest of `g`'s word (`typed` of it typed already): their outcome judges it. */
  private link(g: Guess | null, typed: number) {
    if (g && this.grey?.word && g.word.slice(typed) === this.grey.word && this.guesses.includes(g)) this.shownGuess = g;
  }

  /** Judge the guesses whose word the person has finished by now. */
  private judgeGuesses(now: Field) {
    this.guesses = this.guesses.filter((g) => {
      // (What shows is judged by what is done with it.)
      if (g === this.shownGuess) return true;
      const typed = typedBetween(g.base, now);
      // A second space or a new line where the word would begin: no word was typed there.
      if (typed === null || (/\s$/.test(g.base.before) && /^\s/.test(typed))) return false;
      const right = verdictOf(g.word, typed);
      if (right === undefined) return true;
      this.out.judge?.(g.plan, g.conf, right);
      return false;
    });
  }

  /** No verdict for the guesses waiting (a deletion, a caret move, a paste, the box gone). */
  private forget() {
    this.guesses = [];
    this.shownGuess = null;
  }

  /** The request under way is no longer wanted: its answer is not waited for, and the server stops working on it. */
  private cancel() {
    this.flight?.ctl.abort();
    this.flight = null;
  }

  /** Stop what is under way and show nothing (a blur, a switch turned off, the box gone). */
  reset() {
    clearTimeout(this.timer);
    this.cancel();
    this.last = null;
    this.forget();
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
    // The request under way stays while the box only grows from what it was asked about.
    if (this.flight && (f.selected || typedBetween(this.flight.field, f) === null || Date.now() - this.flight.at > MAX_FLIGHT_MS)) this.cancel();
    const typed = typedBetween(prev, f);
    // What was typed here (not what Tab inserted, which `take` has already read; not a paste or dictation, nor an input method's text).
    const grown = prev?.composing || f.composing ? 0 : typedChars(typed);
    if (grown) this.out.count?.({ typedChars: grown });
    if (this.live && this.grey) {
      if (typed) {
        const v = judgeTyped(this.grey, typed);
        if (v.through || v.wrong || v.fresh) this.out.count?.({ typedThrough: v.through, wrong: v.wrong ? 1 : 0, shown: v.fresh ? 1 : 0 });
        if (v.wrong) this.live = false;
        // Judged as a hidden guess is (the whole word, then what ends it), so both count alike: a word typed through and
        // then made longer was not the word. Another letter is wrong at once.
        if (v.wrong) this.verdict(false);
        else if (v.through && this.grey.word) this.shownGuess = null;
      } else if (backspaced(prev, f)) {
        this.out.count?.({ wrong: 1 });
        this.live = false;
        // No verdict, as for a hidden guess: Backspace often mends a typo, not the guess (the deletion forgets the guesses below).
      }
    }
    // A deletion, a caret move, a paste or dictation: what the word was meant to be is no longer clear.
    if (prev && (typed === null || charCount(typed) > TYPED_MAX)) this.forget();
    this.judgeGuesses(f);
    if (this.grey && typed) {
      const rest = consume(this.grey, typed);
      if (rest !== undefined) {
        // Typed what shows: the rest stays, and no new request, until all of it is typed.
        clearTimeout(this.timer);
        this.show(rest);
        if (rest) {
          this.confirmed = true;
          return;
        }
      }
    }
    this.ask(f, false);
  }

  /**
   * Ask for a suggestion at the caret, after a pause of 30 ms. `keep`: what shows stays until the answer. While a
   * request is under way none is sent: its answer asks about the box as it is then.
   */
  private ask(f: Field, keep: boolean) {
    clearTimeout(this.timer);
    if (!keep) this.show(null);
    if (this.hidden || !atWordEnd(f)) return this.show(null);
    if (this.flight) return;
    this.timer = setTimeout(() => this.send(f), DEBOUNCE_MS);
  }

  private send(f: Field) {
    const flight = (this.flight = { field: f, ctl: new AbortController(), at: Date.now() });
    new Promise<SuggestResponse | null>((res) => res(this.out.send(requestOf(this.ad.place, f, this.ad.context(), this.out.client), flight.ctl.signal)))
      .catch(() => null)
      .then((r) => {
        if (this.flight !== flight) return;
        this.flight = null;
        this.answered(flight.field, r);
      });
  }

  /**
   * An answer about the box as it was (`asked`): shown if the box is still so; what is left of it if the person has
   * since typed letters of its grey word; else dropped. A box that has moved on is asked about again.
   */
  private answered(asked: Field, r: SuggestResponse | null) {
    // A change not read yet (its event is still to be handled) is read first, so no letter is used up twice.
    if (!same(this.last, this.ad.read())) this.sync();
    const now = this.ad.read();
    if (!now || !allowed(this.out.gate(), this.ad.place)) return;
    const typed = typedBetween(asked, now);
    if (typed !== null && !now.selected && !now.composing) {
      const guess = this.note(asked, r);
      const g = afterSpace(greyOf(r), asked.before);
      if (!typed) this.apply(g, guess);
      else if (g && !this.grey && !this.hidden) {
        const rest = consume(g, typed);
        const left = rest ? afterSpace(rest, now.before) : null;
        if (left) {
          this.began();
          this.show(left);
          this.confirmed = true;
          this.link(guess, typed.length);
        }
      }
      this.judgeGuesses(now);
    }
    if (!same(now, asked)) this.ask(now, !!this.grey);
  }

  /** An answer for the box as it is now. */
  private apply(g: Grey | null, guess: Guess | null) {
    if (!g) {
      if (!this.confirmed) this.show(null);
      return;
    }
    if (sameGrey(g, this.grey)) return;
    // The same grey word with another next word is the same suggestion.
    if (this.live && g.word && g.word === this.grey?.word) return this.show(g);
    this.began();
    this.show(g);
    this.link(guess, 0);
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
      this.cancel();
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
    if (this.grey?.word) this.verdict(true);
    this.live = false;
    this.shownGuess = null;
    this.confirmed = false;
    this.cancel();
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
