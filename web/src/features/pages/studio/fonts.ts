// The fonts the visual editor offers: the device's own (nothing to load), and some of Google's, which a page
// loads from Google Fonts once one of them is picked (a link in its head the editor keeps).

export interface FontChoice {
  value: string;
  label: string;
  /** What font-family is set to. */
  css: string;
  /** Loaded from Google Fonts. */
  google?: boolean;
}

export const SYSTEM_FONTS: FontChoice[] = [
  { value: 'system', label: 'System', css: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
  { value: 'serif', label: 'Serif', css: 'Georgia, "Times New Roman", serif' },
  { value: 'round', label: 'Rounded', css: 'ui-rounded, "SF Pro Rounded", system-ui, sans-serif' },
  { value: 'mono', label: 'Mono', css: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' },
];

const g = (name: string, fallback: string): FontChoice => ({ value: name, label: name, css: `"${name}", ${fallback}`, google: true });
const SANS = 'system-ui, sans-serif';
const SERIF = 'Georgia, serif';

export const GOOGLE_FONTS: FontChoice[] = [
  g('Inter', SANS),
  g('Roboto', SANS),
  g('Open Sans', SANS),
  g('Lato', SANS),
  g('Montserrat', SANS),
  g('Poppins', SANS),
  g('Nunito', SANS),
  g('DM Sans', SANS),
  g('Work Sans', SANS),
  g('Space Grotesk', SANS),
  g('IBM Plex Sans', SANS),
  g('Playfair Display', SERIF),
  g('Merriweather', SERIF),
  g('Lora', SERIF),
  g('Fraunces', SERIF),
  g('Source Serif 4', SERIF),
  g('JetBrains Mono', 'ui-monospace, monospace'),
];

export const FONTS = [...SYSTEM_FONTS, ...GOOGLE_FONTS];

const FIRST: Record<string, string> = {
  'system-ui': 'system',
  '-apple-system': 'system',
  'segoe ui': 'system',
  roboto: 'Roboto',
  'helvetica neue': 'system',
  'sans-serif': 'system',
  georgia: 'serif',
  'times new roman': 'serif',
  serif: 'serif',
  'ui-rounded': 'round',
  'sf pro rounded': 'round',
  'ui-monospace': 'mono',
  'sfmono-regular': 'mono',
  menlo: 'mono',
  consolas: 'mono',
  monospace: 'mono',
};

/** Which of the list a font-family is, by its first font ('' when none of them). */
export function fontOf(css: string | undefined): string {
  const first =
    (css ?? '')
      .split(',')[0]
      ?.trim()
      .replace(/^["']|["']$/g, '')
      .toLowerCase() ?? '';
  return GOOGLE_FONTS.find((f) => f.value.toLowerCase() === first)?.value ?? FIRST[first] ?? '';
}

/** The fonts to pick from, for a Select: "As the page" first when `inherit`. */
export const fontOptions = (inherit?: string) => [...(inherit ? [{ value: '', label: inherit }] : []), ...FONTS.map((f) => ({ value: f.value, label: f.label }))];
