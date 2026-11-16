// Translating the app's own words with a dictionary (English → another language): a whole string, or one
// that matches a pattern with values in it ("{0} waiting on you"), whose values go where the translation
// puts them. A value that is only an English plural's ending ("file{1}" filled with "s") is left out of
// the translation. Spaces around the string are kept. Used by the pages (web/src/i18n/runtime.ts).
//
// What the dictionary has no entry for stays in English, whole: a pattern with little fixed text ("{0} and {1}",
// "Use {0}") does not take in a long sentence it was never written for (a note, a description from elsewhere),
// which would come out half translated. Also: a tooltip of several lines goes line by line, a line of facts
// joined by " · " part by part, a word matches whether its first letter is a capital or not, and a value
// with a number in it ("3m ago") or a list of the app's words ("Sun, Wed") is translated in its sentence.

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
    const body = parts.map((p, i) => (isValue(p) ? (endings.has(num(p)) ? ending(p) : (glued(i) ?? (p === last ? '(.*?)' : '(.+?)'))) : esc(p))).join('');
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
      words: words(text.join(' ')),
      endings,
      loose,
      quoted,
      lead: parts[0] === '',
    });
  }
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

  /** A list of the app's own words ("Sun, Wed"), each translated. */
  const list = (v: string) => {
    const items = v.split(', ');
    if (items.length < 2) return null;
    const out = items.map((x) => exact.get(x));
    return out.every((x) => x != null) ? out.join(', ') : null;
  };

  /** A value in a sentence: itself when it is one of the app's phrases or a list of them, or one with a number in it ("3m ago"). */
  const value = (v: string, depth: number) => {
    const t = v.trim();
    const known = exact.get(t) ?? list(t) ?? (depth < 2 && /\d/.test(t) ? match(t, depth + 1) : null);
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
  function scored(t: string, depth = 0): [string, number] | null {
    const hit = exact.get(t);
    if (hit != null) return [hit, Infinity];
    let best: { p: Pattern; m: RegExpExecArray; slack: number } | null = null;
    const small = t.toLowerCase();
    for (const p of patterns) {
      if (best && p.fixed < best.p.fixed) break;
      if (p.needle && !(p.anyCase ? small : t).includes(p.needle)) continue;
      const m = p.re.exec(t);
      if (!m || !fits(p, m)) continue;
      const slack = p.loose.reduce((n, i) => n + (m[i + 1]?.length ?? 0), 0);
      if (!best || p.loose.length < best.p.loose.length || (p.loose.length === best.p.loose.length && slack < best.slack)) best = { p, m, slack };
    }
    if (!best) return null;
    const { p, m } = best;
    const out = p.to.replace(/\{(\d+)\}/g, (_, i) => {
      const v = m[Number(i) + 1] ?? '';
      return p.endings.has(Number(i)) && /^(e?s)?$/i.test(v) ? '' : p.quoted.has(Number(i)) ? v : value(v, depth);
    });
    return [cased(p.key[0]) && t[0] !== p.key[0] ? recase(out, t) : out, p.fixed];
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

  const line = (t: string, split: boolean): string | null => match(t) ?? (split && t.includes(' · ') ? pieces(t.split(' · '), ' · ', fact) : null);

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
