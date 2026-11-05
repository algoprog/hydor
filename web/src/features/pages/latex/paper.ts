// The LaTeX editor's paper tools as the pages call them: the pre-submission check (started, followed as it goes,
// stopped), the arXiv package, the paper on disk for an app that takes one, the venue remembered for each document
// (on this device; else the one its class or style points to), what the last check found (to say what is left), and
// a check's fixes made in the text, each only where the text is still as the check saw it.
import type { TexDoc } from '@shared/latex';
import { detectVenue, VENUES, type ArxivOptions, type ArxivPackage, type CheckEdit, type CheckState, type OtherRules } from '@shared/latex-submit';
import { api, enc, post } from '../../../lib/api';
import { machineKey, mu } from '../../../lib/machine';

export const startCheck = (body: { model: TexDoc; venue: string; other?: OtherRules; page?: string; folder?: string; base?: string }) => post<CheckState>('/api/pages/tex/check', body);
export const checkState = (id: string) => api<CheckState>(`/api/pages/tex/check/${enc(id)}`);
export const stopCheck = (id: string) => post(`/api/pages/tex/check/${enc(id)}/stop`).catch(() => {});

export const makeArxiv = (body: { page: string; version?: number; options: ArxivOptions }) => post<ArxivPackage>('/api/pages/tex/arxiv', body);
export const arxivUrl = (token: string) => mu(`/api/pages/tex/arxiv/${enc(token)}`);

export const paperOnDisk = (body: { model: TexDoc; page?: string; folder?: string; base?: string }) => post<{ folder: string; pdf?: string }>('/api/pages/tex/paper', body);

const VENUE_KEY = 'wa.tex.venue';

/** The venue a document was last checked for here, else the one its class or style points to, else the last one picked. */
export function venueFor(doc: string, main: string): { venue: string; other?: OtherRules } {
  try {
    const kept = JSON.parse(localStorage.getItem(machineKey(`${VENUE_KEY}:${doc}`)) ?? 'null') as { venue?: string; other?: OtherRules } | null;
    if (kept?.venue && VENUES.some((v) => v.id === kept.venue)) return { venue: kept.venue, other: kept.other };
  } catch {}
  const found = detectVenue(main);
  if (found) return { venue: found };
  const last = localStorage.getItem(VENUE_KEY);
  return { venue: last && VENUES.some((v) => v.id === last) ? last : 'other' };
}

export function rememberVenue(doc: string, venue: string, other?: OtherRules) {
  try {
    localStorage.setItem(machineKey(`${VENUE_KEY}:${doc}`), JSON.stringify({ venue, other }));
    localStorage.setItem(VENUE_KEY, venue);
  } catch {}
}

const LAST_KEY = 'wa.tex.lastcheck';

/** What the last check of a document found (its findings' ids), to say what is fixed since. */
export function lastFound(doc: string): string[] | null {
  try {
    const v = JSON.parse(localStorage.getItem(machineKey(`${LAST_KEY}:${doc}`)) ?? 'null') as { ids?: string[] } | null;
    return Array.isArray(v?.ids) ? v.ids : null;
  } catch {
    return null;
  }
}

export function rememberFound(doc: string, ids: string[]) {
  try {
    localStorage.setItem(machineKey(`${LAST_KEY}:${doc}`), JSON.stringify({ ids: ids.slice(0, 500), at: Date.now() }));
  } catch {}
}

/** Where an edit's words are now: where they were, or the nearest place they are (the text may have moved since); -1 when gone. */
function placeOf(text: string, e: CheckEdit): number {
  if (text.slice(e.from, e.to) === e.was) return e.from;
  if (!e.was) return -1;
  let best = -1;
  for (let at = text.indexOf(e.was); at >= 0; at = text.indexOf(e.was, at + 1)) if (best < 0 || Math.abs(at - e.from) < Math.abs(best - e.from)) best = at;
  return best;
}

/** A file's text with a check's edits made (from the last, so the others keep their places); null when one's words are gone. */
export function applyEdits(text: string, edits: CheckEdit[]): string | null {
  const placed = edits.map((e) => ({ e, at: placeOf(text, e) }));
  if (placed.some((p) => p.at < 0)) return null;
  placed.sort((a, b) => b.at - a.at);
  let out = text;
  for (const { e, at } of placed) out = out.slice(0, at) + e.text + out.slice(at + e.was.length);
  return out;
}
