// Handwriting for a typed signature: three styles from fonts the app ships (fonts/: Dancing Script, Mr Dafoe and Mr De
// Haviland, under the SIL Open Font License, each beside its licence), loaded the first time a name is typed, never
// from the web. Mynerve, a handwriting with Greek letters, writes the letters a style lacks; Chinese names fall back to
// a Kai (brush) font where the device has one.
import dancing from './fonts/DancingScript.woff?url';
import dafoe from './fonts/MrDafoe.woff?url';
import haviland from './fonts/MrDeHaviland.woff?url';
import mynerve from './fonts/Mynerve.woff?url';

export interface HandStyle {
  id: string;
  /** The font's family as the canvas names it, with what writes the letters it lacks. */
  family: string;
  /** How large to write, for the same height of letters in each. */
  scale: number;
  label: string;
}

const FALLBACK = "'Hydor Hand Greek', 'Kaiti SC', STKaiti, KaiTi, 'AR PL UKai CN', cursive";

export const HAND_STYLES: HandStyle[] = [
  { id: 'flowing', family: `'Hydor Hand Flowing', ${FALLBACK}`, scale: 1, label: 'Flowing handwriting' },
  { id: 'bold', family: `'Hydor Hand Bold', ${FALLBACK}`, scale: 1.05, label: 'Bold handwriting' },
  { id: 'fine', family: `'Hydor Hand Fine', ${FALLBACK}`, scale: 1.25, label: 'Fine handwriting' },
];

const FACES: [string, string][] = [
  ['Hydor Hand Flowing', dancing],
  ['Hydor Hand Bold', dafoe],
  ['Hydor Hand Fine', haviland],
  ['Hydor Hand Greek', mynerve],
];

let loading: Promise<void> | null = null;

/** The handwriting fonts, ready to draw with (each loaded once). */
export function loadHandwriting(): Promise<void> {
  loading ??= Promise.all(
    FACES.map(async ([name, url]) => {
      const f = new FontFace(name, `url(${url})`);
      await f.load();
      document.fonts.add(f);
    }),
  ).then(
    () => undefined,
    () => {
      // A font that did not load leaves its style to the device's own handwriting font; try again next time.
      loading = null;
    },
  );
  return loading;
}
