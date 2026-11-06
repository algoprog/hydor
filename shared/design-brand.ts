// A brand kit: the user's brand colours, a heading font and a body font, and their logos (pictures the app keeps:
// "naget-asset:<sha>"). Designs offer them first and put them on a whole design in one click; agents read them with
// how_to_make, to make designs in the brand. Checked here, as the server keeps it and the app sends it.
import { fontByName } from './design-fonts.ts';

export interface BrandLogo {
  /** The picture, kept by the app: "naget-asset:<sha>". */
  src: string;
  name: string;
}

export interface BrandKit {
  /** Its colours, the main one first: #rrggbb. */
  colours: string[];
  /** The heading font, then the body font (fonts of design-fonts.ts), either may be ''. */
  fonts: string[];
  logos: BrandLogo[];
  /** The brand's name, as a design may write it. */
  name?: string;
}

export const BRAND_LIMITS = { colours: 10, logos: 8, name: 80 };

/** A brand kit as it is kept: colours as #rrggbb, fonts the designs have, logos the app keeps. */
export function cleanBrand(v: unknown): BrandKit {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const colours = (Array.isArray(o.colours) ? o.colours : [])
    .filter((c): c is string => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c.trim()))
    .map((c) => c.trim().toLowerCase());
  const fonts = (Array.isArray(o.fonts) ? o.fonts : []).slice(0, 2).map((f) => (typeof f === 'string' && fontByName(f) ? fontByName(f)!.name : ''));
  const logos = (Array.isArray(o.logos) ? o.logos : [])
    .filter((l): l is { src: string; name?: unknown } => !!l && typeof l === 'object' && typeof (l as { src?: unknown }).src === 'string' && /^naget-asset:[a-f0-9]{16,64}$/.test((l as { src: string }).src))
    .map((l) => ({ src: l.src, name: typeof l.name === 'string' ? l.name.replace(/\s+/g, ' ').trim().slice(0, 80) : '' }));
  const name = typeof o.name === 'string' ? o.name.replace(/\s+/g, ' ').trim().slice(0, BRAND_LIMITS.name) : '';
  return { colours: [...new Set(colours)].slice(0, BRAND_LIMITS.colours), fonts: [fonts[0] ?? '', fonts[1] ?? ''], logos: logos.slice(0, BRAND_LIMITS.logos), ...(name ? { name } : {}) };
}

/** What an agent is told of a brand kit, when there is one. */
export function brandForAgent(k: BrandKit | null): string {
  if (!k || (!k.colours.length && !k.fonts.some(Boolean) && !k.logos.length && !k.name)) return '';
  const parts = [
    k.name ? `its name "${k.name}"` : '',
    k.colours.length ? `colours ${k.colours.join(', ')} (the main one first)` : '',
    k.fonts[0] ? `the heading font ${k.fonts[0]}` : '',
    k.fonts[1] ? `the body font ${k.fonts[1]}` : '',
    k.logos.length ? `${k.logos.length} logo${k.logos.length > 1 ? 's' : ''} (${k.logos.map((l) => `${l.name || 'logo'}: ${l.src}`).join('; ')}; put one in an img's src as it is named here)` : '',
  ].filter(Boolean);
  return `The user's brand kit: ${parts.join(', ')}. Use it for their designs unless they ask for another look.`;
}
