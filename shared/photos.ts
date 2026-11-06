// Free photos (Insert → Picture → Free photos, find_photos): openly licensed pictures found with Openverse's search
// (Wikimedia Commons' when Openverse cannot answer), as the server gives them to the editors, and the credit each one
// asks for: its title, its author, its licence and where it is from, in words for the speaker notes and as a small
// caption with its links for the slide.

/** A photo found: who made it, its licence, where it is, its size, and a small picture of it through this server. */
export interface Photo {
  /** Its source and its id there: "ov:<id>" (Openverse) or "wm:<page id>" (Wikimedia Commons). */
  id: string;
  title: string;
  creator?: string;
  creatorUrl?: string;
  /** Its licence's short name: "CC BY 2.0", "CC BY-SA 4.0", "CC0 1.0", "Public domain". */
  license: string;
  licenseUrl?: string;
  /** Its licence asks for its author to be credited where it shows (every Creative Commons licence but CC0). */
  attribution: boolean;
  /** Its own page, where it is from. */
  page: string;
  /** Where it is kept: "Flickr", "Wikimedia Commons"… */
  from: string;
  w?: number;
  h?: number;
  /** A small picture of it: GET /api/photos/thumb/:id. */
  thumb: string;
}

/** GET /api/photos/search?q=&orientation=&page=&from= */
export interface PhotoSearch {
  photos: Photo[];
  /** Which search answered: Openverse, or Wikimedia Commons when Openverse could not (its "More" asks the same one). */
  from: 'openverse' | 'wikimedia';
  /** More pages of them. */
  more: boolean;
  /** Why the search found none, in words a person can act on. */
  note?: string;
}

export type PhotoOrientation = 'any' | 'wide' | 'tall' | 'square';
export const PHOTO_ORIENTATIONS: PhotoOrientation[] = ['any', 'wide', 'tall', 'square'];

/** POST /api/photos/use { id }: the photo kept with the deck, document or page, and its credit. */
export interface PhotoUse {
  /** The picture as the app keeps it: "naget-asset:<sha>". */
  src: string;
  w: number;
  h: number;
  photo: Photo;
  /** Its credit in words: for the speaker notes, a document's caption, a page's. */
  credit: string;
}

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** A photo's credit in a sentence: its title, its author, its licence and its page ("Photo: “Dawn” by Ann Lee, CC BY 2.0 …"). */
export function photoCredit(p: Photo): string {
  const by = p.creator ? ` by ${p.creator}` : '';
  const lic = p.attribution ? `${p.license}${p.licenseUrl ? ` (${p.licenseUrl})` : ''}` : `${p.license}, free to use without credit`;
  return `Photo: “${cut(p.title || 'Untitled', 160)}”${by}, ${lic}. From ${p.from}: ${p.page}`;
}

/** A photo's caption for a slide, as runs of words: its title linked to its page, its author, its licence linked to its text. */
export function photoCaption(p: Photo): { t: string; link?: string }[] {
  const out: { t: string; link?: string }[] = [{ t: 'Photo: ' }, { t: `“${cut(p.title || 'Untitled', 60)}”`, link: /^https?:\/\//.test(p.page) ? p.page : undefined }];
  if (p.creator) out.push({ t: ` by ${cut(p.creator, 40)}` });
  out.push({ t: ', ' }, { t: p.license, link: p.licenseUrl && /^https?:\/\//.test(p.licenseUrl) ? p.licenseUrl : undefined });
  return out.map((r) => (r.link ? r : { t: r.t }));
}
