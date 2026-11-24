// Which of a turn's documents opens beside the conversation by itself: its first one, while it is the only one. A turn
// that goes on to make or change a second document shows none of them there (each has its card in the conversation),
// and the panel goes back to what it showed before. A document is counted once however often the turn saves it and
// whatever it goes by: the call that made it, the page that call saved, a file (in each of its forms: "report.md" and
// the "report.pdf" made from it are one document), and a page of HTML's title (a mock-up written to an HTML file to
// check, then shown with the same title, is one page). This keeps the count and says what to do; Canvas.tsx does it.

/** A turn's documents so far. */
export interface TurnDocs {
  /** The turn, by what ended before it: the id of the end of the turn before it ('' for a session's first). */
  turn: string;
  /** Its documents, each by every name it goes by. */
  docs: string[][];
  /** The one that opened by itself, or was found open already (its place in `docs`). */
  opened?: number;
  /** Nothing more opens or closes by itself in this turn: the panel was closed by hand, or put back for a second document. */
  quiet?: boolean;
}

export type Step =
  /** The turn's only document, not shown yet: it may open. */
  | 'open'
  /** A second document came: what opened by itself gives way. */
  | 'put-back'
  | 'none';

const uniq = (list: string[]) => [...new Set(list.filter(Boolean))];

/**
 * A document the turn `turn` made or changed, by the names it goes by. `more` gives what else a name is known as by now
 * (the page a call saved, once it has): a document first seen by its call is found again by its page.
 */
export function noteDoc(was: TurnDocs | undefined, turn: string, names: string[], more?: (name: string) => string[]): { now: TurnDocs; at: number; step: Step } {
  const base: TurnDocs = was && was.turn === turn ? was : { turn, docs: [] };
  const wide = (list: string[]) => uniq(more ? [...list, ...list.flatMap(more)] : list);
  let opened = base.opened;
  // What was two documents may turn out to be one (a call and the page it saved, heard of apart): they become one.
  const docs: string[][] = [];
  base.docs.forEach((d, i) => {
    const all = wide(d);
    const j = docs.findIndex((x) => x.some((n) => all.includes(n)));
    if (j < 0) docs.push(all);
    else docs[j] = uniq([...docs[j], ...all]);
    if (base.opened === i) opened = j < 0 ? docs.length - 1 : j;
  });
  const all = wide(names);
  let at = docs.findIndex((d) => d.some((n) => all.includes(n)));
  const fresh = at < 0;
  if (fresh) at = docs.push(all) - 1;
  else docs[at] = uniq([...docs[at], ...all]);
  const now: TurnDocs = { turn, docs, ...(opened !== undefined ? { opened } : {}), ...(base.quiet ? { quiet: true } : {}) };
  let step: Step = 'none';
  if (!now.quiet) {
    if (docs.length === 1 && opened === undefined) step = 'open';
    else if (fresh && docs.length > 1 && opened !== undefined) step = 'put-back';
  }
  return { now, at, step };
}

/** Which of a turn's documents one going by `names` is, by now (`more` as for noteDoc); -1 when it is none of them. */
export function whichDoc(t: TurnDocs, names: string[], more?: (name: string) => string[]): number {
  const wide = (list: string[]) => uniq(more ? [...list, ...list.flatMap(more)] : list);
  const all = wide(names);
  return t.docs.findIndex((d) => wide(d).some((n) => all.includes(n)));
}

const ENTITIES = new Map(Object.entries({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', middot: '·', ndash: '–', mdash: '—', hellip: '…', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”' }));

const plainText = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e: string) => {
    if (e[0] !== '#') return ENTITIES.get(e.toLowerCase()) ?? all;
    const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : all;
  });

/** A page's title as a name it goes by: on one line, whatever its case. None for an empty one. */
export function titleName(title: string | undefined): string | undefined {
  const t = title?.replace(/\s+/g, ' ').trim().toLowerCase();
  return t ? `title:${t}` : undefined;
}

/** The title a page's HTML gives itself (its whole <title> element, so none while that is still being written), as a name. */
export function htmlTitle(html: string | undefined): string | undefined {
  const m = html ? /<title(?:\s[^>]*)?>([\s\S]*?)<\/title\s*>/i.exec(html.slice(0, 200_000)) : null;
  return m ? titleName(plainText(m[1])) : undefined;
}

/** The document at `at` shows beside the conversation now (it opened by itself, or was there already). */
export const opened = (t: TurnDocs, at: number): TurnDocs => ({ ...t, opened: at });

/** Nothing more happens by itself in this turn. */
export const quiet = (t: TurnDocs): TurnDocs => ({ ...t, quiet: true });
