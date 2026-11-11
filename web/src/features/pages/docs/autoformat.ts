// What the documents editor changes by itself as words are typed, as Google Docs' Tools → Preferences do: a web address
// typed and followed by a space or Enter becomes a link; straight quotes become curly ones (“ ” ‘ ’, opening after a
// space or an opening bracket, else closing); "--" an en dash and "---" an em dash, (c) (r) (tm) their signs, -> and
// <- arrows, "..." an ellipsis, and 1/2, 1/4, 3/4 their fractions where a word ends. Pure functions of the words before
// the caret (the engine, engine.ts, applies what they say, as one change that undo takes back whole), so they can be
// checked without a page. Nothing here knows of code, links or equations: the engine leaves those words alone.

/** Characters before the caret to take out, and what goes in their place (the character typed included). */
export interface Typed {
  drop: number;
  put: string;
}

/** Whether a quote typed after these words opens (after nothing, a space, an opening bracket or a dash) rather than closes. */
const opens = (before: string) => before === '' || /[\s([{“‘—–/]$/.test(before);

/**
 * What typing `ch` after `before` (the words of the paragraph before the caret) turns into, if it is one of the
 * automatic changes; null leaves it to be typed as it is. `smart` is the Smart quotes and symbols preference.
 */
export function replaceTyped(before: string, ch: string, smart = true): Typed | null {
  if (!smart || ch.length !== 1) return null;
  switch (ch) {
    case '"':
      return { drop: 0, put: opens(before) ? '“' : '”' };
    case "'":
      return { drop: 0, put: opens(before) ? '‘' : '’' };
    case '-':
      if (before.endsWith('<')) return { drop: 1, put: '←' };
      // The en dash a second hyphen made becomes an em dash with a third.
      if (before.endsWith('–')) return { drop: 1, put: '—' };
      // Not at a line's start, where "---" and "- " are the shortcuts for a line across and a list.
      if (/[^-]-$/.test(before)) return { drop: 1, put: '–' };
      return null;
    case '>':
      return before.endsWith('-') && !before.endsWith('--') && before.length > 1 ? { drop: 1, put: '→' } : null;
    case ')': {
      const m = /\((c|r|tm)$/i.exec(before);
      if (!m) return null;
      return { drop: m[0].length, put: { c: '©', r: '®', tm: '™' }[m[1].toLowerCase() as 'c' | 'r' | 'tm'] };
    }
    case '.':
      return before.endsWith('..') ? { drop: 2, put: '…' } : null;
  }
  return null;
}

const FRACTIONS: Record<string, string> = { '1/2': '½', '1/4': '¼', '3/4': '¾' };

/** A fraction typed out ("1/2") as a word of its own before the caret, as its sign: what a space or Enter after it makes of it. */
export function fractionBefore(before: string): Typed | null {
  const m = /(?:^|[\s(])(1\/2|1\/4|3\/4)$/.exec(before);
  return m ? { drop: 3, put: FRACTIONS[m[1]] } : null;
}

/** A web address as a link target: with its scheme (https:// for one that starts with www.), or null when it is not one. */
export function urlHref(word: string): string | null {
  if (/^https?:\/\/[^\s/?#.]+(?:\.[^\s/?#]+)*/i.test(word) && !/\s/.test(word)) return word;
  if (/^www\.[^\s/?#.]+\.[^\s/?#]+/i.test(word)) return `https://${word}`;
  return null;
}

/**
 * A web address the words before the caret end with (a space or Enter was typed after it): where it starts and ends in
 * `before`, and where it points. Closing punctuation after it ("(see https://a.com).") stays out of the link.
 */
export function urlBefore(before: string): { from: number; to: number; url: string } | null {
  const m = /(^|[\s(])((?:https?:\/\/|www\.)[^\s<>"“”]+?)([.,;:!?)\]'’]*)$/i.exec(before);
  if (!m) return null;
  const url = urlHref(m[2]);
  if (!url) return null;
  const from = m.index + m[1].length;
  return { from, to: from + m[2].length, url };
}

/** A web address pasted over selected words, which it makes a link of: it, when the text is one address alone. */
export function lonelyUrl(text: string): string | null {
  const t = text.trim();
  return t && !/\s/.test(t) ? urlHref(t) : null;
}
