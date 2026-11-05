// The characters the editors' picker offers (Insert → Special characters, an icon for a callout or a page): emoji in
// their usual groups and the symbols people look for and can't type (arrows, maths, currencies, Greek letters,
// punctuation, accented letters, shapes and signs, fractions and small numbers), each with the English words it is
// found by. The characters and their words are in chars-data.json, a string per group: entries split by "|", the
// character first and its words after a space (a JSON file, so the words, which stay English, are not taken for the
// app's own text to translate). The groups' names here are the app's own, and translated.

import DATA from './chars-data.json';

export interface CharGroup {
  id: keyof typeof DATA;
  label: string;
  kind: 'emoji' | 'symbols';
  /** A character that stands for the group on its tab. */
  icon: string;
}

export const CHAR_GROUPS: CharGroup[] = [
  { id: 'smileys', label: 'Smileys', kind: 'emoji', icon: '😀' },
  { id: 'people', label: 'People', kind: 'emoji', icon: '👋' },
  { id: 'nature', label: 'Animals and nature', kind: 'emoji', icon: '🌿' },
  { id: 'food', label: 'Food and drink', kind: 'emoji', icon: '🍎' },
  { id: 'activities', label: 'Activities', kind: 'emoji', icon: '⚽' },
  { id: 'travel', label: 'Travel and places', kind: 'emoji', icon: '✈️' },
  { id: 'objects', label: 'Objects', kind: 'emoji', icon: '💡' },
  { id: 'emoji-symbols', label: 'Symbols', kind: 'emoji', icon: '✅' },
  { id: 'arrows', label: 'Arrows', kind: 'symbols', icon: '→' },
  { id: 'maths', label: 'Maths', kind: 'symbols', icon: '±' },
  { id: 'currency', label: 'Currencies', kind: 'symbols', icon: '€' },
  { id: 'greek', label: 'Greek letters', kind: 'symbols', icon: 'α' },
  { id: 'punctuation', label: 'Punctuation', kind: 'symbols', icon: '—' },
  { id: 'letters', label: 'Accented letters', kind: 'symbols', icon: 'é' },
  { id: 'shapes', label: 'Shapes and signs', kind: 'symbols', icon: '★' },
  { id: 'numbers', label: 'Fractions and numbers', kind: 'symbols', icon: '½' },
];

export interface CharEntry {
  ch: string;
  words: string;
  group: string;
}

let parsed: CharEntry[] | null = null;

/** Every character with its words and group, read once. */
export function allChars(): CharEntry[] {
  if (parsed) return parsed;
  const out: CharEntry[] = [];
  for (const g of CHAR_GROUPS) {
    for (const item of DATA[g.id].split('|')) {
      const sp = item.indexOf(' ');
      const ch = sp < 0 ? item : item.slice(0, sp);
      if (ch) out.push({ ch, words: sp < 0 ? '' : item.slice(sp + 1), group: g.id });
    }
  }
  parsed = out;
  return out;
}
