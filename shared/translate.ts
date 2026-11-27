// Translating the app's own words with a dictionary (English → another language): a whole string, or one
// that matches a pattern with values in it ("{0} waiting on you"), whose values go where the translation
// puts them. A value that is only an English plural's ending ("file{1}" filled with "s") is left out of
// the translation. Spaces around the string are kept. Used by the pages (web/src/i18n/runtime.ts).
//
// What the dictionary has no entry for stays in English, whole: a pattern with little fixed text ("{0} and {1}",
// "Use {0}") does not take in a long sentence it was never written for (a note, a description from elsewhere),
// which would come out half translated. Also: a tooltip of several lines goes line by line, a line of facts
// joined by " · " part by part, a word matches whether its first letter is a capital or not, and a value
// with a number in it ("3m ago") or a list of the app's words ("Sun, Wed") is translated in its sentence. A value that
// looks technical (a mode, a file or field name, code), or is in small letters where the dictionary has the word only
// with a capital, stays as it is.

export type Dictionary = Record<string, string>;

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Words in a piece of text: runs of two letters or more. */
const words = (s: string) => s.match(/[A-Za-z]{2,}/g)?.length ?? 0;

/** Whether a letter has a capital and a small form (Latin, Greek), and the other one. */
const cased = (c: string) => c.toLowerCase() !== c.toUpperCase();
const flip = (c: string) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase());

/**
 * A translation for a source whose first letter has the other case than the dictionary's: its first letter follows
 * ("on" → "ενεργό" from "On" → "Ενεργό"), unless it starts with no word of capital and small letters ("PDF", "开启").
 */
function recase(to: string, from: string): string {
  const [a, b = ''] = to;
  if (!cased(a) || b !== b.toLowerCase() || !cased(from[0])) return to;
  return (from[0] === from[0].toUpperCase() ? a.toUpperCase() : a.toLowerCase()) + to.slice(1);
}

interface Pattern {
  re: RegExp;
  key: string;
  to: string;
  /** Its longest piece of fixed text: a string must hold it to be worth trying the pattern on (in small letters when it starts the pattern, whose first letter may be either). */
  needle: string;
  anyCase: boolean;
  /** How many letters, and words, its fixed text has. */
  fixed: number;
  words: number;
  /** It holds a time of day (CLOCK). */
  clock: boolean;
  /** Values that are an English plural's ending ("time{1}"): "s", "es" or nothing, or, when the translation keeps them, a value from a space or a mark on. */
  endings: Set<number>;
  /** Values with no word beside them on a side (at an end, or after a mere space or dot), which could take in anything. */
  loose: number[];
  /** Values in quotes ("Delete “{0}”?"): a name, as it is, never translated as one of the app's phrases. */
  quoted: Set<number>;
  /** Whether it starts with a value ("{0} files"): one that counts or names something, in a few words. */
  lead: boolean;
}

/** A translator for a dictionary: the string in the other language, or null when it has none. */
/** A lookup in one part of the app ("media::Speed"): see web/src/i18n/runtime.ts. */
const PART = /^[a-z]+::/;

/** The fixed letters (not counting spaces and marks) a pattern needs to take a value for one of the app's own phrases: about six words. */
const PHRASE_LETTERS = 30;

/** The fixed letters a pattern needs to be taken for a sentence of a text of several ("{0} stopped holding"): not "into your {0}". */
const SENTENCE_LETTERS = 12;

/** A day of a month ("{0} December"): its value is the day's number, so no sentence that ends in a month is taken for one. */
const DAY_OF_MONTH = /^\{0\} (?:January|February|March|April|May|June|July|August|September|October|November|December)$/;

/**
 * A time of day written as two values ("About {0}:{1}"): digits only, and a sentence of a text however few its words
 * (why a run waits ends with one).
 */
const CLOCK = /(?:^|\s)\{0\}:\{1\}(?=$|[\s,])/;

/** Letters and marks of Chinese and Japanese writing: a translation with them ends its sentences with "。". */
const WIDE = /[\u3000-\u30ff\u3400-\u9fff\uff00-\uffef]/;

/** Where one sentence ends and the next begins: a full stop, "!" or "?", a space, and a capital (or an opening quote). */
const SENTENCE_END = /[.!?]\s+[A-Z“‘]/;
/** The same, to split at (the mark stays with its sentence). */
const SENTENCE_SPLIT = /(?<=[.!?])\s+(?=[A-Z“‘])/;

/** Marks of something technical rather than words: a path, a file or field name, code, an address, a flag. */
const TECHNICAL = /[_/\\@#=<>`|{}[\]~^$]|[A-Za-z]\.[A-Za-z]|^--?[A-Za-z]/;

export function translator(dict: Dictionary): (s: string, split?: boolean) => string | null {
  const exact = new Map<string, string>();
  const patterns: Pattern[] = [];
  for (const [k, v] of Object.entries(dict)) {
    if (!v) continue;
    if (!/\{\d+\}/.test(k)) {
      exact.set(k, v);
      continue;
    }
    const parts = k.split(/(\{\d+\})/);
    const isValue = (p: string) => /^\{\d+\}$/.test(p);
    const num = (p: string) => Number(p.slice(1, -1));
    // Values right after a word's letters ("time{1}"): an English plural's ending, when they are "s" or "es" (or nothing).
    // One the translation keeps is a value too, from a space or a mark on ("in {0} h{1}": " 28 min"; "Working{0}": ", checked 5m ago").
    const endings = new Set([...k.matchAll(/[A-Za-z]\{(\d+)\}(?![A-Za-z])/g)].map((m) => Number(m[1])));
    const kept = new Set([...endings].filter((i) => v.includes(`{${i}}`)));
    // An ending is "s", "es" or nothing; a value at the very end may be empty; any other has something in it. The
    // first letter matches in either case.
    const last = parts.filter(Boolean).at(-1);
    const ending = (p: string) => (kept.has(num(p)) ? '((?:e?s)?|[^A-Za-z].*?)' : '((?:e?s)?)');
    // A value glued to letters with no space ("{0}ms" for "12ms") is no piece of a word: it ends (or starts) with
    // something other than a letter, so "Forms" is not "For" + "ms".
    const glued = (i: number) => {
      const after = /^[A-Za-z]/.test(parts[i + 1] ?? '');
      const before = /[A-Za-z]$/.test(parts[i - 1] ?? '');
      return after && before ? '([^A-Za-z](?:.*?[^A-Za-z])?)' : after ? '(.*?[^A-Za-z])' : before ? '([^A-Za-z].*?)' : null;
    };
    const day = DAY_OF_MONTH.test(k);
    const clock = CLOCK.test(k);
    const body = parts.map((p, i) => (isValue(p) ? (day || (clock && num(p) === 0) ? '(\\d{1,2})' : clock && num(p) === 1 ? '(\\d{2})' : endings.has(num(p)) ? ending(p) : (glued(i) ?? (p === last ? '(.*?)' : '(.+?)'))) : esc(p))).join('');
    const re = new RegExp(`^${cased(k[0]) ? `[${k[0].toLowerCase()}${k[0].toUpperCase()}]${body.slice(1)}` : body}$`, 's');
    const text = parts.filter((p) => !isValue(p));
    const longest = [...text].sort((a, b) => b.length - a.length)[0]?.trim() ?? '';
    const anyCase = !!longest && k.startsWith(longest) && cased(k[0]);
    const quoted = new Set(parts.flatMap((p, i) => (isValue(p) && /[“"‘«']$/.test(parts[i - 1]) && /^[”"’»']/.test(parts[i + 1] ?? '') ? [num(p)] : [])));
    // A value after a label ("Goal: {0}") holds whatever the label names, however long, and one in quotes a name: never loose.
    const loose = parts.flatMap((p, i) =>
      isValue(p) && !quoted.has(num(p)) && !/[:：]\s*$/.test(parts[i - 1]) && (!endings.has(num(p)) || kept.has(num(p))) && (!/[A-Za-z]/.test(parts[i - 1]) || !/[A-Za-z]/.test(parts[i + 1])) ? [num(p)] : [],
    );
    patterns.push({
      re,
      key: k,
      to: v,
      needle: anyCase ? longest.toLowerCase() : longest,
      anyCase,
      fixed: text.join('').replace(/[^A-Za-z]/g, '').length,
      clock,
      words: words(text.join(' ')),
      endings,
      loose,
      quoted,
      lead: parts[0] === '',
    });
  }
  // The dictionary's own words, as it writes them (before the other-case aliases below).
  const own = new Set(exact.keys());
  // The other case of each word's first letter ("on" for "On"), where the dictionary has only one of them.
  for (const [k, v] of [...exact]) if (cased(k[0]) && !exact.has(flip(k[0]) + k.slice(1))) exact.set(flip(k[0]) + k.slice(1), recase(v, flip(k[0])));
  // The more fixed text a pattern has, the surer its match: those first.
  patterns.sort((a, b) => b.fixed - a.fixed || b.needle.length - a.needle.length);

  /**
   * Whether a match is the pattern's own: one with few fixed words ("{0} and {1}", "Use {0}") takes a few words
   * where its values are loose ("The garden and Taxes 2026"), not most of a sentence it happens to sit in.
   */
  const fits = (p: Pattern, m: RegExpExecArray) => {
    // A loose value never spans a " · " between facts ("On · 4 at once" is not "{0} at {1}").
    if (p.loose.some((i) => /(^|\s)·(\s|$)/.test(m[i + 1] ?? ''))) return false;
    if (p.words >= 3) return true;
    const n = p.loose.reduce((sum, i) => sum + words(m[i + 1] ?? ''), 0);
    return n <= (p.loose.length > 1 ? 3 : p.lead ? 4 : 6);
  };

  /**
   * The app's own phrase a value in a sentence is, translated, or undefined. A value that looks technical (a name with
   * _ / . or the like, camelCase, a flag, words-joined-by-dashes in small letters) is never one: a mode, a parameter, a
   * file or a project's name stays as it is. A value in small letters is one only when the dictionary has it so: the
   * other case of a capitalised entry is for a label written with a capital ("Ready" for "ready"), not for a word in
   * small letters that happens to be one of the app's labels ("hybrid", a search mode, is not the "Hybrid" of a job ad).
   */
  const appWord = (t: string): string | undefined => {
    if (!t || TECHNICAL.test(t) || /[a-z][A-Z]/.test(t) || /^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(t)) return undefined;
    if (own.has(t)) return exact.get(t);
    return cased(t[0]) && t[0] === t[0].toUpperCase() ? exact.get(t) : undefined;
  };

  /** A list of the app's own words ("Sun, Wed"), each translated. */
  const list = (v: string) => {
    const items = v.split(', ');
    if (items.length < 2) return null;
    const out = items.map((x) => appWord(x));
    return out.every((x) => x != null) ? out.join(', ') : null;
  };

  /**
   * Clauses a value joins with "; " ("the most free now is 11 GB, on GPU 0; your other runs hold GPU 1", why a run waits):
   * each translated by an entry or a sure pattern of its own, and only when every one is.
   */
  const clauses = (t: string, depth: number): string | null => {
    const items = t.split('; ');
    if (depth >= 2 || items.length < 2) return null;
    const out: string[] = [];
    for (const x of items) {
      const hit = scored(x, depth + 1);
      if (!hit || hit[1] < SENTENCE_LETTERS) return null;
      out.push(hit[0]);
    }
    return out.join(/[\u3000-\u9fff]/.test(out.join('')) ? '；' : '; ');
  };

  /** A value in a sentence: itself when it is one of the app's phrases or a list of them, or one with a number in it ("3m ago"). */
  const value = (v: string, depth: number) => {
    const t = v.trim();
    // Also a longer phrase of the app's own with a name or a number in it, as a pattern with plenty of fixed words has it
    // ("another session (“Fix the login”) was working in the folder"): too much fixed text for anything else to match it.
    const phrase = (): string | null => {
      if (depth >= 2 || t.length < 25 || TECHNICAL.test(t)) return null;
      const hit = scored(t, depth + 1);
      return hit && hit[1] >= PHRASE_LETTERS ? hit[0] : null;
    };
    const known = appWord(t) ?? list(t) ?? clauses(t, depth) ?? (depth < 2 && /\d/.test(t) && !TECHNICAL.test(t) ? match(t, depth + 1) : null) ?? phrase();
    return known == null ? v : `${/^\s*/.exec(v)![0]}${known}${/\s*$/.exec(v)![0]}`;
  };

  /** The string matched whole, or by a pattern with its values put in. */
  const match = (t: string, depth = 0): string | null => scored(t, depth)?.[0] ?? null;

  /**
   * As match, with how sure it is: the fixed letters of the pattern that matched (a whole string's are all its own).
   * Of patterns with as much fixed text, the one with fewer loose values ("Working, checked 5m ago" is "Working{0}",
   * not "{0}, checked {1}"), then the one whose loose values take the least of the string ("in 2 h 28 min" is
   * "in {0} h{1}", not "{0} min").
   */
  function scored(t: string, depth = 0): [string, number, boolean, boolean, boolean] | null {
    const hit = exact.get(t);
    if (hit != null) return [hit, Infinity, false, false, WIDE.test(hit)];
    let best: { p: Pattern; m: RegExpExecArray; slack: number } | null = null;
    const small = t.toLowerCase();
    for (const p of patterns) {
      if (best && p.fixed < best.p.fixed) break;
      if (p.needle && !(p.anyCase ? small : t).includes(p.needle)) continue;
      const m = p.re.exec(t);
      if (!m || !fits(p, m)) continue;
      const slack = p.loose.reduce((n, i) => n + (m[i + 1]?.length ?? 0), 0);
      // Of two as sure ("Round {0}" and "round {0}"), the one written with the string's own first letter: lowering a
      // translation for the other would lower a German noun ("runde").
      const tie = !!best && p.loose.length === best.p.loose.length;
      // As much fixed text and a time of day written as one (CLOCK) is the surer: it matched digits ("hacia las 14:20").
      const surer = !!best && (p.clock !== best.p.clock ? p.clock : p.loose.length < best.p.loose.length || (tie && slack < best.slack) || (tie && slack === best.slack && p.key[0] === t[0] && best.p.key[0] !== t[0]));
      if (!best || surer) best = { p, m, slack };
    }
    if (!best) return null;
    const { p, m } = best;
    const out = p.to.replace(/\{(\d+)\}/g, (_, i) => {
      const v = m[Number(i) + 1] ?? '';
      return p.endings.has(Number(i)) && /^(e?s)?$/i.test(v) ? '' : p.quoted.has(Number(i)) ? v : value(v, depth);
    });
    // Whether a value took in the end of a sentence and the next one: see `line`.
    const spans = [...m].slice(1).some((v) => SENTENCE_END.test(v ?? ''));
    // Whether a value at the pattern's end took in the full stop after it: see `sentences`.
    const tookStop = p.key.endsWith('}') && t.endsWith('.');
    const sureness = p.clock ? Math.max(p.fixed, SENTENCE_LETTERS) : p.fixed;
    return [cased(p.key[0]) && t[0] !== p.key[0] ? recase(out, t) : out, sureness, spans, tookStop, WIDE.test(p.to)];
  }

  /** Pieces translated one by one, joined again: lines, or facts joined by " · "; null when none is. */
  const pieces = (pcs: string[], join: string, one: (s: string, i: number) => string | null) => {
    const out = pcs.map((x, i) => (/[A-Za-z]{2}/.test(x) ? one(x, i) : null));
    return out.some((x) => x != null) ? out.map((x, i) => x ?? pcs[i]).join(join) : null;
  };

  /** A fact, or one after the first as the app writes it after a dot (" · next {0}", the dot left out again): the surer. */
  const fact = (x: string, i: number) => {
    const plain = scored(x);
    const dotted = i ? scored(`· ${x}`) : null;
    return dotted && (!plain || dotted[1] > plain[1]) ? dotted[0].replace(/^·\s*/, '') : (plain?.[0] ?? null);
  };

  /**
   * A text of several sentences ("It was not undone: … . Your rules could not be checked."): each sentence on its own, and
   * only when every one has a translation, so a text is never half in one language. A sentence the app writes without its
   * full stop (the parts of a round's reason are joined with ". ") is found without it, and its stop put back.
   */
  const sentences = (t: string): string | null => {
    // A quoted line (what a program said, kept as it wrote it) is one piece, whatever full stops it has.
    const parts: string[] = [];
    for (const x of t.split(SENTENCE_SPLIT)) {
      const last = parts.at(-1);
      if (last !== undefined && last.split('“').length > last.split('”').length) parts[parts.length - 1] = `${last} ${x}`;
      else parts.push(x);
    }
    if (parts.length < 2 && !t.endsWith('.')) return null;
    const out: string[] = [];
    // A sentence counts when it is a whole entry or a pattern with enough fixed words of its own: no weak pattern ("into
    // your {0}") takes a piece of a sentence, which would leave the rest of it in English.
    const sure = (r: ReturnType<typeof scored>) => (r && r[1] >= SENTENCE_LETTERS ? r[0] : null);
    // A sentence found without its full stop, which goes back at the end of the translation, after a closing bracket or
    // quote too, unless it has one inside it: CJK writes its own ("。", also after a name or a number), the others keep
    // the one the text had.
    const stopped = (x: string) => {
      const r = scored(x.slice(0, -1));
      const bare = sure(r);
      return bare == null ? null : /(?:[.。!！?？…:：]|[.。!！?？…][)）”“」』"»])$/.test(bare) ? bare : `${bare}${r![4] ? '。' : '.'}`;
    };
    for (const x of parts) {
      const whole = scored(x);
      const ends = x.endsWith('.');
      // A pattern that ends with a value would carry the full stop to wherever its translation puts that value
      // ("… waited 2 h." as "… schon 2 h. wartet"): without the stop first then, when that puts it back at the end.
      const early = ends && whole?.[3] ? stopped(x) : null;
      const hit = (early && /[.。]$/.test(early) ? early : null) ?? sure(whole) ?? (ends ? stopped(x) : null);
      if (hit == null) return null;
      out.push(hit);
    }
    return out.join(/[\u3000-\u9fff]$/.test(out[0]) ? '' : ' ');
  };

  // A pattern whose value took in the end of a sentence and the next one ("It broke a rule of yours: {0}", given two
  // sentences) is set aside when each of the sentences has a translation of its own: they are translated one by one.
  const line = (t: string, split: boolean): string | null => {
    const hit = scored(t);
    if (hit?.[2]) {
      const each = sentences(t);
      if (each != null) return each;
    }
    return hit?.[0] ?? (split && t.includes(' · ') ? pieces(t.split(' · '), ' · ', fact) : null) ?? sentences(t);
  };

  /** `split`: a line of facts may go part by part (not for a sentence the page built from pieces, which go one by one then). */
  return (s, split = true) => {
    const t = s.replace(/\s+/g, ' ').trim();
    if (t.length < 2 || !/[A-Za-z]/.test(t)) return null;
    // One part's own word ("diagram::Page", what it means in that editor) is its entry or nothing: no pattern takes the
    // part's name for a value ("{0} of {1}" would make "diagram::1 of 3" into "diagram::1 / 3").
    if (PART.test(t)) {
      const hit = exact.get(t);
      return hit == null ? null : `${/^\s*/.exec(s)![0]}${hit}${/\s*$/.exec(s)![0]}`;
    }
    const lines = s.trim().split(/\s*\n\s*/);
    const out = exact.get(t) ?? (lines.length > 1 ? pieces(lines, '\n', (x) => line(x.replace(/\s+/g, ' '), split)) : line(t, split));
    if (out == null) return null;
    return `${/^\s*/.exec(s)![0]}${out}${/\s*$/.exec(s)![0]}`;
  };
}

/** Whether a translation keeps every value of its source ({0}, {1}…), each once; an English plural's ending ("file{1}") may go. */
export function keepsValues(source: string, translation: string): boolean {
  const want: string[] = [...(source.match(/\{\d+\}/g) ?? [])].sort();
  const got: string[] = [...(translation.match(/\{\d+\}/g) ?? [])].sort();
  if (want.join() === got.join()) return true;
  const endings = new Set([...source.matchAll(/[A-Za-z]\{(\d+)\}(?![A-Za-z])/g)].map((m) => `{${m[1]}}`));
  return new Set(got).size === got.length && got.every((g) => want.includes(g)) && want.filter((w) => !got.includes(w)).every((w) => endings.has(w));
}
