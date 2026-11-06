// The Apps page's find box: how well an app fits the words typed, as you type. Every word must be somewhere in its
// name, its kind or what it does (in English and in the app's language, accents aside); its name counts most, then
// its kind, then its description, and a word's start more than its middle.

/** Small letters without accents (Greek's too), so "καιρος" finds "Καιρός". */
const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/** The words typed, as they are compared. */
export const findWords = (q: string): string[] => fold(q).split(' ').filter(Boolean);

/** How well one word fits a text: at its start, at a word's start, inside a word (two letters or more), or not at all. */
function wordFit(text: string, w: string): number {
  if (!text) return 0;
  if (text.startsWith(w)) return 3;
  if (text.includes(` ${w}`)) return 2;
  // Inside a word: two letters or more, or one of a script written without spaces (Chinese).
  return (w.length >= 2 || /[\u3040-\u9fff\uac00-\ud7af]/.test(w)) && text.includes(w) ? 1 : 0;
}

/** An app's texts to look in, each as many times as it may be shown (its words in English and translated). */
export interface Findable {
  name: string[];
  kind: string[];
  about: string[];
}

/** How well an app fits the words (0: one of them is nowhere in it). */
export function fitOf(words: string[], a: Findable): number {
  if (!words.length) return 0;
  const name = a.name.map(fold);
  const kind = a.kind.map(fold);
  const about = a.about.map(fold);
  let total = 0;
  for (const word of words) {
    // A plural finds its singular too ("recipes" a recipe).
    const forms = word.length > 3 && word.endsWith('s') ? [word, word.slice(0, -1)] : [word];
    const fit = (t: string) => Math.max(...forms.map((w) => wordFit(t, w)));
    const best = Math.max(...name.map((t) => fit(t) * 3), ...kind.map((t) => fit(t) * 2), ...about.map((t) => fit(t)));
    if (!best) return 0;
    total += best;
  }
  return total;
}
