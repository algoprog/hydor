// The fonts designs offer (shared/design.ts): Google's, each with the weights it has, so the link a design loads them
// with asks only for weights that exist (Google refuses the whole link when one does not), grouped as the font picker
// shows them; and pairings of a heading font with a body font, for the text presets and the templates.

export type FontCat = 'sans' | 'display' | 'serif' | 'script' | 'mono';

export interface DesignFont {
  name: string;
  cat: FontCat;
  /** The weights it has (400 always). */
  w: number[];
}

export const FONT_CATS: { id: FontCat; label: string }[] = [
  { id: 'sans', label: 'Sans serif' },
  { id: 'display', label: 'Display' },
  { id: 'serif', label: 'Serif' },
  { id: 'script', label: 'Script and handwriting' },
  { id: 'mono', label: 'Monospace' },
];

const f = (name: string, cat: FontCat, w: number[] = [400]): DesignFont => ({ name, cat, w });

export const DESIGN_FONTS: DesignFont[] = [
  f('Inter', 'sans', [400, 500, 600, 700, 800, 900]),
  f('Montserrat', 'sans', [400, 500, 600, 700, 800, 900]),
  f('Poppins', 'sans', [400, 500, 600, 700, 800, 900]),
  f('DM Sans', 'sans', [400, 500, 700]),
  f('Work Sans', 'sans', [400, 500, 600, 700, 800]),
  f('Raleway', 'sans', [400, 500, 700, 800, 900]),
  f('Outfit', 'sans', [400, 500, 600, 700, 800]),
  f('Manrope', 'sans', [400, 500, 700, 800]),
  f('Space Grotesk', 'sans', [400, 500, 700]),
  f('Josefin Sans', 'sans', [400, 600, 700]),
  f('Archivo', 'sans', [400, 600, 700, 800, 900]),
  f('Lato', 'sans', [400, 700, 900]),
  f('Open Sans', 'sans', [400, 600, 700, 800]),
  f('Nunito', 'sans', [400, 600, 700, 800, 900]),
  f('Rubik', 'sans', [400, 500, 700, 800, 900]),
  f('Quicksand', 'sans', [400, 500, 700]),
  f('Fredoka', 'sans', [400, 500, 600, 700]),
  f('Syne', 'sans', [400, 600, 700, 800]),
  f('Bebas Neue', 'display'),
  f('Anton', 'display'),
  f('Oswald', 'display', [400, 500, 600, 700]),
  f('Archivo Black', 'display'),
  f('Abril Fatface', 'display'),
  f('Alfa Slab One', 'display'),
  f('Righteous', 'display'),
  f('Bungee', 'display'),
  f('Shrikhand', 'display'),
  f('Titan One', 'display'),
  f('Luckiest Guy', 'display'),
  f('Bowlby One', 'display'),
  f('Playfair Display', 'serif', [400, 500, 700, 800, 900]),
  f('DM Serif Display', 'serif'),
  f('Cormorant Garamond', 'serif', [400, 500, 600, 700]),
  f('Lora', 'serif', [400, 500, 700]),
  f('Merriweather', 'serif', [400, 700, 900]),
  f('Fraunces', 'serif', [400, 600, 700, 800, 900]),
  f('Libre Baskerville', 'serif', [400, 700]),
  f('EB Garamond', 'serif', [400, 500, 600, 700, 800]),
  f('Prata', 'serif'),
  f('Cinzel', 'serif', [400, 600, 700, 900]),
  f('Bodoni Moda', 'serif', [400, 600, 700, 800, 900]),
  f('Pacifico', 'script'),
  f('Dancing Script', 'script', [400, 600, 700]),
  f('Great Vibes', 'script'),
  f('Caveat', 'script', [400, 600, 700]),
  f('Lobster', 'script'),
  f('Satisfy', 'script'),
  f('Kaushan Script', 'script'),
  f('Sacramento', 'script'),
  f('Permanent Marker', 'script'),
  f('Allura', 'script'),
  f('Parisienne', 'script'),
  f('JetBrains Mono', 'mono', [400, 500, 700, 800]),
  f('Space Mono', 'mono', [400, 700]),
];

const FALLBACK: Record<FontCat, string> = {
  sans: 'system-ui, sans-serif',
  display: 'Impact, system-ui, sans-serif',
  serif: 'Georgia, serif',
  script: 'cursive',
  mono: 'ui-monospace, monospace',
};

export const fontByName = (name: string): DesignFont | undefined => DESIGN_FONTS.find((x) => x.name.toLowerCase() === name.trim().toLowerCase());

/** What font-family is set to for a font of the list: its name, then something near it. */
export function fontStack(name: string): string {
  const d = fontByName(name);
  return d ? `"${d.name}", ${FALLBACK[d.cat]}` : `"${name.replace(/["\\;{}<>]/g, '')}", system-ui, sans-serif`;
}

/** The first font a font-family names (its quotes taken off): "Bebas Neue". */
export const firstFont = (css: string | undefined) =>
  (css ?? '')
    .split(',')[0]
    ?.trim()
    .replace(/^["']|["']$/g, '') ?? '';

/** The link that loads these fonts from Google Fonts, each with the weights it has; '' when none is one of Google's. */
export function fontsHref(names: Iterable<string>): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const n of names) {
    const d = fontByName(n);
    if (!d || seen.has(d.name)) continue;
    seen.add(d.name);
    const fam = d.name.replace(/ /g, '+');
    parts.push(d.w.length > 1 ? `family=${fam}:wght@${d.w.join(';')}` : `family=${fam}`);
  }
  return parts.length ? `https://fonts.googleapis.com/css2?${parts.sort().join('&')}&display=swap` : '';
}

/** The fonts a Google Fonts link loads, by name. */
export function fontsOfHref(href: string): string[] {
  try {
    return new URL(href)
      .searchParams.getAll('family')
      .map((x) => x.split(':')[0].replace(/\+/g, ' '))
      .filter(Boolean);
  } catch {
    return [];
  }
}

/** The weight nearest `want` that a font has (a heading asked for 800 in a font that stops at 700 gets 700). */
export function nearestWeight(name: string, want: number): number {
  const d = fontByName(name);
  if (!d) return want;
  return d.w.reduce((best, w) => (Math.abs(w - want) < Math.abs(best - want) ? w : best), d.w[0]);
}

/** A heading font with a body font, as the text presets offer them. */
export interface FontPair {
  id: string;
  label: string;
  head: string;
  body: string;
  /** How the heading is set: its weight, and whether in capitals. */
  weight: number;
  upper?: boolean;
}

export const FONT_PAIRS: FontPair[] = [
  { id: 'bold', label: 'Bold and modern', head: 'Bebas Neue', body: 'Montserrat', weight: 400, upper: true },
  { id: 'classic', label: 'Classic', head: 'Playfair Display', body: 'Lato', weight: 700 },
  { id: 'friendly', label: 'Friendly', head: 'Pacifico', body: 'Poppins', weight: 400 },
  { id: 'loud', label: 'Loud', head: 'Anton', body: 'Inter', weight: 400, upper: true },
  { id: 'elegant', label: 'Elegant', head: 'DM Serif Display', body: 'DM Sans', weight: 400 },
  { id: 'wedding', label: 'Romantic', head: 'Great Vibes', body: 'Cormorant Garamond', weight: 400 },
  { id: 'strong', label: 'Strong', head: 'Archivo Black', body: 'Work Sans', weight: 400 },
  { id: 'warm', label: 'Warm', head: 'Fraunces', body: 'Manrope', weight: 800 },
  { id: 'tech', label: 'Technical', head: 'Space Grotesk', body: 'Space Mono', weight: 700 },
  { id: 'hand', label: 'Handwritten', head: 'Caveat', body: 'Nunito', weight: 700 },
  { id: 'timeless', label: 'Timeless', head: 'Cinzel', body: 'EB Garamond', weight: 700 },
  { id: 'playful', label: 'Playful', head: 'Righteous', body: 'Quicksand', weight: 400 },
];
