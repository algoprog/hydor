// Signatures you draw (or type, or upload) once and keep: a picture of your signature or your initials, its
// background see-through and cropped to the ink, kept encrypted by the server (server/signatures/) and put into the
// documents and files you sign, or that an agent signs once you allow it on a card. It is a picture of a signature,
// as ink on paper is: not a cryptographic digital signature, which proves who signed and that nothing changed since.
//
// The pad's pixel work is here (the box around the ink, a photo's paper made see-through), so the server's tests
// check what the pad makes; and what a conversation's cards carry: one asking you to draw a signature for an agent,
// and one showing where an agent would place one, to allow or deny.

export type SignatureKind = 'signature' | 'initials';

/** A saved signature as the pages and agents see it: never its picture, which only the app's own pages load. */
export interface SignatureView {
  id: string;
  name: string;
  kind: SignatureKind;
  /** Its picture's size, in pixels. */
  width: number;
  height: number;
  createdAt: number;
  updatedAt: number;
  usedAt?: number;
  /** Kept only until then: one you gave an agent without keeping it for later. */
  until?: number;
}

export const SIGNATURE_LIMITS = {
  /** A name's characters. */
  name: 60,
  /** A picture's bytes, as a PNG. */
  bytes: 4 * 1024 * 1024,
  /** Its longer side, in pixels. */
  side: 4096,
  /** How many are kept. */
  count: 40,
};

/** How long one given to an agent without keeping it for later stays: a day. */
export const SIGNATURE_FOR_NOW_MS = 24 * 3600_000;

/** A signature's name as kept: one line, at most 60 characters. */
export function signatureName(v: unknown): string {
  if (typeof v !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return v
    .replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, SIGNATURE_LIMITS.name)
    .trim();
}

export const signatureKind = (v: unknown): SignatureKind => (v === 'initials' ? 'initials' : 'signature');

/** How wide one goes into a document unless told: a signature 50 mm, initials 20 mm. */
export const SIGNATURE_WIDTH_MM: Record<SignatureKind, number> = { signature: 50, initials: 20 };

/** The name a new one gets unless the user gives another. */
export const defaultSignatureName = (kind: SignatureKind) => (kind === 'initials' ? 'Initials' : 'Signature');

// ---- pixels -------------------------------------------------------------------------------------------------------

export interface PixelBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The box around every pixel with more ink than `min` (its alpha, 0–255) in RGBA pixels `px` of a `w`×`h` picture;
 * null when there is no ink at all.
 */
export function inkBox(px: ArrayLike<number>, w: number, h: number, min = 8): PixelBox | null {
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    let first = -1;
    let last = -1;
    for (let x = 0; x < w; x++)
      if (px[row + x * 4 + 3] > min) {
        first = x;
        break;
      }
    if (first < 0) continue;
    for (let x = w - 1; x >= first; x--)
      if (px[row + x * 4 + 3] > min) {
        last = x;
        break;
      }
    if (first < x0) x0 = first;
    if (last > x1) x1 = last;
    if (y < y0) y0 = y;
    y1 = y;
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** `b` with a margin of `m` pixels around it, kept inside a `w`×`h` picture. */
export function padBox(b: PixelBox, m: number, w: number, h: number): PixelBox {
  const x = Math.max(0, b.x - m);
  const y = Math.max(0, b.y - m);
  return { x, y, w: Math.min(w, b.x + b.w + m) - x, h: Math.min(h, b.y + b.h + m) - y };
}

/** The pixels of box `b` of a `w`-wide RGBA picture, as a picture of their own. */
export function cropPixels(px: ArrayLike<number>, w: number, b: PixelBox): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(b.w * b.h * 4);
  for (let y = 0; y < b.h; y++) {
    const from = ((b.y + y) * w + b.x) * 4;
    for (let i = 0; i < b.w * 4; i++) out[y * b.w * 4 + i] = px[from + i];
  }
  return out;
}

/** Whether a picture has see-through parts of its own already (a signature cut out before): its corners are clear. */
export function hasClearBackground(px: ArrayLike<number>, w: number, h: number): boolean {
  let clear = 0;
  let seen = 0;
  const look = (x: number, y: number) => {
    seen++;
    if (px[(y * w + x) * 4 + 3] < 24) clear++;
  };
  // The border, every few pixels.
  const step = Math.max(1, Math.floor(Math.min(w, h) / 40));
  for (let x = 0; x < w; x += step) (look(x, 0), look(x, h - 1));
  for (let y = 0; y < h; y += step) (look(0, y), look(w - 1, y));
  return seen > 0 && clear / seen > 0.6;
}

const lum = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

/**
 * A photo or scan of a signature on paper, in place: the paper made see-through and the ink kept, each pixel as much
 * ink as it is darker than the paper around it (so a shadow across the page or a grey photo of white paper goes too).
 * The paper's brightness is taken in blocks (the brightest of most of each block's pixels, as ink is thin), blended
 * between blocks; the ink keeps its own colour, made as dark as its darkest strokes.
 */
export function paperToClear(px: Uint8ClampedArray | Uint8Array, w: number, h: number): void {
  if (!w || !h) return;
  const n = w * h;
  const L = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = px[i * 4 + 3] / 255;
    // A see-through pixel of the picture is paper.
    L[i] = lum(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]) * a + 255 * (1 - a);
  }
  // The paper's level in blocks of about a twentieth of the picture.
  const bs = Math.max(8, Math.round(Math.max(w, h) / 20));
  const bw = Math.ceil(w / bs);
  const bh = Math.ceil(h / bs);
  const level = new Float32Array(bw * bh);
  const hist = new Uint32Array(256);
  for (let by = 0; by < bh; by++)
    for (let bx = 0; bx < bw; bx++) {
      hist.fill(0);
      let count = 0;
      for (let y = by * bs; y < Math.min(h, (by + 1) * bs); y++)
        for (let x = bx * bs; x < Math.min(w, (bx + 1) * bs); x++) {
          hist[Math.min(255, Math.max(0, Math.round(L[y * w + x])))]++;
          count++;
        }
      // The 90th brightest in a hundred: paper, even where a stroke crosses the block.
      let want = count * 0.1;
      let v = 255;
      for (; v > 0; v--) {
        want -= hist[v];
        if (want <= 0) break;
      }
      level[by * bw + bx] = v;
    }
  // A block that is all ink (a thick stroke) takes the paper around it.
  const smooth = level.slice();
  for (let by = 0; by < bh; by++)
    for (let bx = 0; bx < bw; bx++) {
      let best = level[by * bw + bx];
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const yy = by + dy;
          const xx = bx + dx;
          if (yy >= 0 && yy < bh && xx >= 0 && xx < bw) best = Math.max(best, level[yy * bw + xx] - 12);
        }
      smooth[by * bw + bx] = best;
    }
  const paperAt = (x: number, y: number) => {
    // Between the blocks' middles.
    const fx = Math.min(bw - 1, Math.max(0, (x + 0.5) / bs - 0.5));
    const fy = Math.min(bh - 1, Math.max(0, (y + 0.5) / bs - 0.5));
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const x1 = Math.min(bw - 1, x0 + 1);
    const y1 = Math.min(bh - 1, y0 + 1);
    const tx = fx - x0;
    const ty = fy - y0;
    const top = smooth[y0 * bw + x0] * (1 - tx) + smooth[y0 * bw + x1] * tx;
    const bottom = smooth[y1 * bw + x0] * (1 - tx) + smooth[y1 * bw + x1] * tx;
    return top * (1 - ty) + bottom * ty;
  };
  // How much ink each pixel is: nothing within a little of the paper (its grain), all of it well below.
  const ink = new Float32Array(n);
  let darkest = 255;
  const dark: number[] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const p = Math.max(40, paperAt(x, y));
      const t = (p - L[i] - p * 0.1) / (p * 0.38);
      const a = t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
      ink[i] = a;
      if (a > 0.6) {
        dark.push(L[i]);
        if (L[i] < darkest) darkest = L[i];
      }
    }
  // The ink's own darkness: the darkest tenth of its strokes.
  dark.sort((a, b) => a - b);
  const inkL = dark.length ? Math.max(0, dark[Math.floor(dark.length * 0.1)]) : darkest;
  for (let i = 0; i < n; i++) {
    const a = ink[i];
    const o = i * 4;
    if (a <= 0) {
      px[o] = px[o + 1] = px[o + 2] = px[o + 3] = 0;
      continue;
    }
    // Its own hue, as dark as the ink's strokes.
    const l = Math.max(1, lum(px[o], px[o + 1], px[o + 2]));
    const k = Math.min(1, inkL / l);
    px[o] = Math.round(px[o] * k);
    px[o + 1] = Math.round(px[o + 1] * k);
    px[o + 2] = Math.round(px[o + 2] * k);
    px[o + 3] = Math.round(a * 255);
  }
}

// ---- the conversation's cards -----------------------------------------------------------------------------------

/** A card asking the user to draw (or type, or upload) a signature an agent will place, and to keep it under a name. */
export interface SignatureAskCard {
  kind: SignatureKind;
  /** The name the agent suggests. */
  name: string;
  /** What it is for, in the agent's words. */
  why?: string;
}

/** Where a signature goes, for a card to say in the user's language: by words (in their place, right after them, or
 * beside them on a PDF's page), at a point (shares of the page or picture from its top-left), in a table's cell, or at
 * the end. `nth` of `of`: which of the places with those words. */
export type PlaceSpot =
  | { kind: 'words'; words: string; how: 'replace' | 'after' | 'right' | 'left' | 'above' | 'below'; nth?: number; of?: number; table?: boolean }
  | { kind: 'point'; x: number; y: number }
  | { kind: 'cell'; table: number; row: number; column: number }
  | { kind: 'end' };

/** Where an agent would place a signature, for the user to see before allowing it. */
export interface SignaturePlaceCard {
  signature: { id: string; name: string; kind: SignatureKind };
  /** What is signed: a file (its path) or a document of the Library. */
  target: { kind: 'docx' | 'pdf' | 'png' | 'doc'; path?: string; page?: { id: string; title: string } };
  /** Where it goes; on a PDF, the page and how many there are. */
  spot: PlaceSpot;
  page?: number;
  pages?: number;
  /** The file it writes: a signed copy beside the file, or the file itself (`replace`). */
  out?: string;
  replace?: boolean;
  /** Its width on paper, in millimetres. */
  widthMm?: number;
  /** A Word file or a document: the words just before and after the spot, and whether it floats in front of the text. */
  text?: { before: string; after: string; float?: boolean };
  /** A PDF or a picture: the page as it will be, signature and all (its address, for the app's own pages alone). */
  picture?: string;
}

/** A card of the conversation's that is about a signature: one or the other. */
export interface SignatureCard {
  ask?: SignatureAskCard;
  place?: SignaturePlaceCard;
}
