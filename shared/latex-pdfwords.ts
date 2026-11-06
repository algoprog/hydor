// The words of a typeset PDF and where each is on its page, for the LaTeX editor's preview: Find in the pages
// (Ctrl+F over them, the matches marked) and text picked on a page (to go to its place in the source). The server reads
// them with poppler's pdftotext -bbox-layout (readBboxLayout); each page comes as its size and its words, a word as
// [text, x, y, w, h, line] in points from the page's top left, `line` counting the page's lines. pageText joins a page's
// words into one text to search (a word broken by a hyphen at a line's end joined again, ligatures as their letters),
// with where each word is in it, and findInPages finds words in it, each match as the boxes of its words, a box a line.

export type PdfWord = [text: string, x: number, y: number, w: number, h: number, line: number];

export interface PdfPageWords {
  w: number;
  h: number;
  words: PdfWord[];
}

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unxml = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, n: string) => (n[0] === '#' ? String.fromCodePoint(n[1] === 'x' || n[1] === 'X' ? parseInt(n.slice(2), 16) : Number(n.slice(1))) : (ENT[n] ?? m)));
const r1 = (v: number) => Math.round(v * 10) / 10;

/** pdftotext -bbox-layout's XHTML read into pages of words (at most `max` pages). */
export function readBboxLayout(xhtml: string, max = 400): PdfPageWords[] {
  const pages: PdfPageWords[] = [];
  const pageRe = /<page\s+width="([\d.]+)"\s+height="([\d.]+)"\s*>([\s\S]*?)<\/page>/g;
  for (let p = pageRe.exec(xhtml); p && pages.length < max; p = pageRe.exec(xhtml)) {
    const words: PdfWord[] = [];
    let line = 0;
    for (const l of p[3].matchAll(/<line\b[^>]*>([\s\S]*?)<\/line>/g)) {
      for (const w of l[1].matchAll(/<word\s+xMin="([\d.-]+)"\s+yMin="([\d.-]+)"\s+xMax="([\d.-]+)"\s+yMax="([\d.-]+)"\s*>([\s\S]*?)<\/word>/g)) {
        const t = unxml(w[5]);
        if (!t.trim()) continue;
        const [x0, y0, x1, y1] = [Number(w[1]), Number(w[2]), Number(w[3]), Number(w[4])];
        words.push([t, r1(x0), r1(y0), r1(Math.max(0, x1 - x0)), r1(Math.max(0, y1 - y0)), line]);
      }
      line++;
    }
    pages.push({ w: r1(Number(p[1])), h: r1(Number(p[2])), words });
  }
  return pages;
}

/** A page's words as one text to search: small letters, ligatures as letters; `at[i]`: where word i starts in it. */
export function pageText(words: PdfWord[]): { text: string; at: number[]; ends: number[] } {
  let text = '';
  const at: number[] = [];
  const ends: number[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const t = w[0].normalize('NFKC').toLowerCase();
    const prev = words[i - 1];
    // A word broken at a line's end by a hyphen: joined again with the next line's first word.
    const joined = prev && prev[5] !== w[5] && /\p{L}-$/u.test(prev[0]) && /^\p{Ll}/u.test(w[0]);
    if (joined) text = text.slice(0, -1);
    else if (i) text += ' ';
    at.push(text.length);
    text += t;
    ends.push(text.length);
  }
  return { text, at, ends };
}

/** A match of the words looked for: its page (from 1), the words it covers, and its boxes (one a line). */
export interface PdfMatch {
  page: number;
  words: [number, number];
  boxes: { x: number; y: number; w: number; h: number }[];
}

/** Where `query` is in the pages (any case; spaces as any spaces), in reading order; at most `max` matches. */
export function findInPages(pages: PdfPageWords[], query: string, max = 1000): PdfMatch[] {
  const q = query.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!q) return [];
  const out: PdfMatch[] = [];
  pages.forEach((p, pi) => {
    if (out.length >= max) return;
    const { text, at, ends } = pageText(p.words);
    for (let s = text.indexOf(q); s >= 0 && out.length < max; s = text.indexOf(q, s + Math.max(1, q.length))) {
      const e = s + q.length;
      let a = at.findIndex((x, i) => ends[i] > s);
      if (a < 0) continue;
      let b = a;
      while (b + 1 < at.length && at[b + 1] < e) b++;
      a = Math.max(0, a);
      // A box a line: the words of each line joined.
      const boxes: PdfMatch['boxes'] = [];
      for (let i = a; i <= b; i++) {
        const w = p.words[i];
        // Part of a word: its share of the box, by its letters.
        let x = w[1];
        let wd = w[3];
        const len = ends[i] - at[i];
        if (len > 0 && (i === a || i === b)) {
          const from = i === a ? Math.max(0, s - at[i]) : 0;
          const to = i === b ? Math.min(len, e - at[i]) : len;
          x = w[1] + (w[3] * from) / len;
          wd = (w[3] * (to - from)) / len;
        }
        const last = boxes[boxes.length - 1];
        if (last && i > a && p.words[i - 1][5] === w[5]) {
          const right = Math.max(last.x + last.w, x + wd);
          last.y = Math.min(last.y, w[2]);
          last.h = Math.max(last.h, w[4]);
          last.w = right - last.x;
        } else boxes.push({ x, y: w[2], w: wd, h: w[4] });
      }
      out.push({ page: pi + 1, words: [a, b], boxes });
    }
  });
  return out;
}
