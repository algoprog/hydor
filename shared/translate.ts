// Translating the app's own words with a dictionary (English → another language): a whole string, or one
// that matches a pattern with values in it ("{0} waiting on you"), whose values go where the translation
// puts them. A value that is only an English plural's ending ("file{1}" filled with "s") is left out of
// the translation. Spaces around the string are kept. Used by the pages (web/src/i18n/runtime.ts).

export type Dictionary = Record<string, string>;

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A translator for a dictionary: the string in the other language, or null when it has none. */
export function translator(dict: Dictionary): (s: string) => string | null {
  const exact = new Map<string, string>();
  const patterns: { re: RegExp; to: string; needle: string; endings: Set<number> }[] = [];
  for (const [k, v] of Object.entries(dict)) {
    if (!v) continue;
    if (!/\{\d+\}/.test(k)) {
      exact.set(k, v);
      continue;
    }
    const parts = k.split(/(\{\d+\})/);
    // Values right after a word's letters ("time{1}"): an English plural's ending, when they are "s" or "es" (or nothing).
    const endings = new Set([...k.matchAll(/[A-Za-z]\{(\d+)\}(?![A-Za-z])/g)].map((m) => Number(m[1])));
    // An ending is "s", "es" or nothing; a value at the very end may be empty; any other has something in it.
    const last = parts.filter(Boolean).at(-1);
    const re = new RegExp(`^${parts.map((p) => (/^\{\d+\}$/.test(p) ? (endings.has(Number(p.slice(1, -1))) ? '((?:e?s)?)' : p === last ? '(.*?)' : '(.+?)') : esc(p))).join('')}$`, 's');
    // Its longest piece of fixed text: a string must hold it to be worth trying the pattern on.
    const needle = parts.filter((p) => !/^\{\d+\}$/.test(p)).sort((a, b) => b.length - a.length)[0]?.trim() ?? '';
    patterns.push({ re, to: v, needle, endings });
  }
  // The more fixed text a pattern has, the surer its match: those first.
  patterns.sort((a, b) => b.needle.length - a.needle.length);
  return (s) => {
    const t = s.replace(/\s+/g, ' ').trim();
    if (t.length < 2 || !/[A-Za-z]/.test(t)) return null;
    let out = exact.get(t);
    if (out == null)
      for (const p of patterns) {
        if (p.needle && !t.includes(p.needle)) continue;
        const m = p.re.exec(t);
        if (m) {
          out = p.to.replace(/\{(\d+)\}/g, (_, i) => {
            const v = m[Number(i) + 1] ?? '';
            if (p.endings.has(Number(i)) && /^(e?s)?$/i.test(v)) return '';
            // A value that is itself one of the app's phrases ("this machine") is translated too.
            const known = exact.get(v.trim());
            return known == null ? v : `${/^\s*/.exec(v)![0]}${known}${/\s*$/.exec(v)![0]}`;
          });
          break;
        }
      }
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
