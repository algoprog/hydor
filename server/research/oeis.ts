// The oeis_lookup tool: which sequence these integers are, by the OEIS's own search (the On-Line Encyclopedia of
// Integer Sequences, oeis.org), so that a sequence someone computed is looked up before anyone calls it new (the
// explore-conjecture skill). What its search answers with &fmt=json: a bare list of at most ten entries, each with
// `number`, `data` (the terms, as one comma-separated string), `name`, `offset` ("0,3": the index of the first term,
// and which term is the first above 1), `keyword` (comma-separated) and `formula` (lines, not in every entry); `null`
// both when nothing matches and when too much does. How many matched in all, and which of the two a `null` is, only its
// text form says ("Showing 1-10 of 37", "No results.", "Too many results. Please narrow search."), so that is asked
// for a full list and for a `null`. Its search ignores signs. Calls go as prior_work's do (spacing, retries, a time
// limit: politeFetch), with the app's own user agent, which names no person. Terms stay exact: they are compared as
// text, and one too large for a number is given as text.
import type { RunCtx, RunTool } from '../features/types.ts';
import { politeFetch, type PriorDeps } from './prior-work.ts';

export const OEIS_LIMITS = { least: 4, most: 40, matches: 5, terms: 20, query: 200, time: 45_000 };

/** The most entries one answer of the OEIS's search holds. */
const PAGE = 10;

export interface OeisMatch {
  id: string;
  name: string;
  url: string;
  /** The index n of the first term the entry lists. */
  offset?: number;
  /** The first terms it lists; one too large to be exact as a number is text. */
  terms: (number | string)[];
  /** The place among the terms it lists (0 is its first) where the given ones begin. */
  matchedFrom?: number;
  /** The given terms agree with the entry's only when signs are left out. */
  signsDiffer?: true;
  formula?: string[];
  keywords: string[];
}

export interface OeisAnswer {
  matches: OeisMatch[];
  note: string;
}

interface Entry {
  number?: number;
  data?: string;
  name?: string;
  offset?: string;
  keyword?: string;
  formula?: string[];
}

const clip = (t: unknown, n: number) => {
  const s = String(t ?? '').replace(/\s+/g, ' ').trim();
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
};

/** The terms asked for, each as exact text; throws, in words, for what cannot be looked up. */
export function readTerms(v: unknown): string[] {
  // An app's step may give them as text: "1, 1, 2, 5".
  const list = typeof v === 'string' ? v.replace(/^\s*[[({]|[\])}]\s*$/g, '').split(/[\s,;]+/).filter(Boolean) : v;
  if (!Array.isArray(list)) throw new Error('terms: give a list of whole numbers');
  const terms = list.map((x) => {
    if (typeof x === 'number') {
      if (!Number.isInteger(x)) throw new Error(`terms: whole numbers only, not ${x}`);
      if (!Number.isSafeInteger(x)) throw new Error(`terms: ${x} is too large to be exact as a number: give it as text, in quotes`);
      return String(x);
    }
    const s = String(x).trim().replace(/^−/, '-');
    if (!/^[+-]?\d{1,1000}$/.test(s)) throw new Error(`terms: whole numbers only, not “${clip(x, 40)}”`);
    return BigInt(s).toString();
  });
  if (terms.length < OEIS_LIMITS.least) throw new Error(`terms: give at least ${OEIS_LIMITS.least} terms (more is better): fewer match far too much to tell anything`);
  if (terms.length > OEIS_LIMITS.most) throw new Error(`terms: give at most ${OEIS_LIMITS.most} terms`);
  return terms;
}

/** Where `given` first stands in `listed` as a run of terms, or -1. */
function runAt(listed: string[], given: string[]): number {
  for (let i = 0; i + given.length <= listed.length; i++) if (given.every((t, j) => listed[i + j] === t)) return i;
  return -1;
}
const unsigned = (list: string[]) => list.map((t) => t.replace(/^-/, ''));

function matchOf(e: Entry, given: string[]): OeisMatch {
  const id = `A${String(e.number).padStart(6, '0')}`;
  const listed = String(e.data ?? '').split(',').map((t) => t.trim()).filter(Boolean);
  const offset = Number(String(e.offset ?? '').split(',')[0]);
  let from = given.length ? runAt(listed, given) : -1;
  let signs = false;
  if (from < 0 && given.length) {
    from = runAt(unsigned(listed), unsigned(given));
    signs = from >= 0;
  }
  // A line that only says who wrote the lines after it ("From …: (Start)") is no formula.
  const formula = (Array.isArray(e.formula) ? e.formula : []).filter((f) => !/^From .*\(Start\)\s*$/.test(f)).slice(0, 2).map((f) => clip(f, 300));
  return {
    id,
    name: clip(e.name, 300),
    url: `https://oeis.org/${id}`,
    ...(e.offset && Number.isInteger(offset) ? { offset } : {}),
    terms: listed.slice(0, OEIS_LIMITS.terms).map((t) => (Number.isSafeInteger(Number(t)) ? Number(t) : t)),
    ...(from >= 0 ? { matchedFrom: from } : {}),
    ...(signs ? { signsDiffer: true as const } : {}),
    ...(formula.length ? { formula } : {}),
    keywords: String(e.keyword ?? '').split(',').filter(Boolean),
  };
}

/** The entries of a JSON answer: [] for `null`. Throws for anything that is not the OEIS's answer. */
function entriesOf(body: string): Entry[] {
  let o: unknown;
  try {
    o = JSON.parse(body);
  } catch {
    o = undefined;
  }
  // Kept as the older answer too ({ count, results }), should it come back.
  const list = o === null ? [] : Array.isArray(o) ? o : (o as { results?: unknown } | undefined)?.results === null ? [] : (o as { results?: unknown } | undefined)?.results;
  if (!Array.isArray(list)) throw new Error('The OEIS’s answer (oeis.org) could not be read. Nothing was looked up: try again later, and do not read this as no match.');
  return (list as Entry[]).filter((e) => e && Number.isInteger(e.number));
}

export interface OeisDeps {
  fetch: PriorDeps['fetch'];
  signal?: AbortSignal;
}

const LEAD = 'A match on few terms is only a lead, not a fact: compute more terms and compare them with the entry’s before you rely on it.';

/** What the OEIS has for these terms, these words or this A-number. */
export async function oeisLookup(input: { terms?: unknown; query?: unknown }, deps: OeisDeps): Promise<OeisAnswer> {
  const words = String(input.query ?? '').replace(/\s+/g, ' ').trim().slice(0, OEIS_LIMITS.query);
  const hasTerms = Array.isArray(input.terms) ? input.terms.length > 0 : !!String(input.terms ?? '').trim();
  if (hasTerms && words) throw new Error('Give terms or query, not both');
  if (!hasTerms && !words) throw new Error(`Give terms (${OEIS_LIMITS.least} to ${OEIS_LIMITS.most} whole numbers, in order) or query (words, or an A-number)`);
  const given = hasTerms ? readTerms(input.terms) : [];
  const number = /^A\d{6,7}$/i.test(words) ? words.toUpperCase() : '';
  const q = given.length ? given.join(',') : encodeURIComponent(number ? `id:${number}` : words);

  const signal = AbortSignal.any([AbortSignal.timeout(OEIS_LIMITS.time), ...(deps.signal ? [deps.signal] : [])]);
  const read = async (fmt: 'json' | 'text') => deps.fetch(`https://oeis.org/search?q=${q}&fmt=${fmt}`, { signal });
  let body: string;
  try {
    body = await read('json');
  } catch (e) {
    if (deps.signal?.aborted) throw e;
    const why = signal.aborted ? 'no answer in time' : clip((e as Error).message, 120);
    throw new Error(`The OEIS (oeis.org) did not answer (${why}). Nothing was looked up: try again later, and do not read this as no match.`);
  }
  const entries = entriesOf(body);

  // What only the text form says: how many in all, and why there is nothing.
  const said = async () => {
    try {
      return await read('text');
    } catch (e) {
      if (deps.signal?.aborted) throw e;
      return '';
    }
  };

  if (!entries.length) {
    const text = await said();
    const note = /^Too many results/m.test(text)
      ? 'Too many sequences match to be listed: give more terms, or narrower words.'
      : !/^No results/m.test(text)
        ? 'The OEIS listed nothing, and did not say whether nothing matches or too much does: try again, or narrow the search.'
        : number
          ? `The OEIS has no sequence ${number}.`
          : given.length
            ? 'Nothing in the OEIS matches these terms. Try them without the first one or two (where a sequence starts is often a matter of convention), or with a common factor taken out. Not being there does not make a sequence new.'
            : 'Nothing in the OEIS matches these words. Try other words, or the first terms of the sequence.';
    return { matches: [], note };
  }

  let total: number | null = entries.length;
  if (entries.length >= PAGE) {
    const n = Number(/^Showing \d+-\d+ of (\d+)/m.exec(await said())?.[1]);
    total = n >= entries.length ? n : null;
  }
  const matches = entries.slice(0, OEIS_LIMITS.matches).map((e) => matchOf(e, given));
  const count = total === null ? `At least ${entries.length} sequences match` : total === 1 ? 'One sequence matches' : `${total} sequences match`;
  const note = [
    `${count} in the OEIS${total === null || total > matches.length ? `; the first ${matches.length} are given` : ''}.`,
    number ? '' : given.length ? LEAD : 'A match by words is only a lead: read the entry before you rely on it.',
    matches.some((m) => m.signsDiffer) ? 'Where signsDiffer is true, only the absolute values agree with your terms.' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return { matches, note };
}

// ---- the tool ----------------------------------------------------------------------------------------------------

export const OEIS_GUIDE =
  'Before you call a sequence of integers new, and when numbers you computed may be a known sequence, look them up with oeis_lookup and name the matches with their A-numbers and links. A match on a few terms is only a lead: compute the next terms and compare them.';

let forTests: PriorDeps['fetch'] | null = null;
/** Tests stand in for the OEIS; null: the real one. */
export const setOeisFetchForTests = (f: PriorDeps['fetch'] | null) => void (forTests = f);

export const oeisDeps = (ctx: RunCtx): OeisDeps => ({ fetch: forTests ?? politeFetch(ctx, 'oeis_lookup'), signal: ctx.signal });

export function oeisTool(): RunTool {
  return {
    name: 'oeis_lookup',
    annotations: { readOnlyHint: true, openWorldHint: true },
    description: [
      'Looks up integers in the OEIS (the On-Line Encyclopedia of Integer Sequences). Use it when numbers you computed or were given may be a known sequence, before calling a sequence new, and to read an entry by its A-number.',
      `Give terms (${OEIS_LIMITS.least} to ${OEIS_LIMITS.most} whole numbers, consecutive and in order; more is better) or query (words, or an A-number such as A000108), not both.`,
      `Gives JSON: { matches: [{ id, name, url, offset (the index n of the first term the entry lists), terms (the first ${OEIS_LIMITS.terms} it lists; one too large for a number is text), matchedFrom (the place among the terms it lists where yours begin, 0 for its first: your first term is then at index offset + matchedFrom, except in a table, keyword tabl, read row by row), signsDiffer (only the absolute values agree), formula (its first two formula lines), keywords }] (at most ${OEIS_LIMITS.matches}), note (how many matched in all) }.`,
      'A match on few terms is only a lead, not a fact: compute more terms and compare. No match does not make a sequence new.',
    ].join(' '),
    inputSchema: {
      type: 'object',
      properties: {
        terms: { type: 'array', items: { type: ['integer', 'string'] }, description: 'Consecutive terms, in order. One too large to be exact as a number: as text.' },
        query: { type: 'string', description: 'Words, or an A-number, in place of terms.' },
      },
    },
    async run(a, ctx) {
      return JSON.stringify(await oeisLookup({ terms: a.terms, query: a.query }, oeisDeps(ctx)));
    },
  };
}
