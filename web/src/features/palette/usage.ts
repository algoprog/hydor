// What the search box learns from use (kept by the server, for every device): what you pick from it, with
// what you typed, and the places you visit by any way there (a page, a Settings section, a session, a
// template…). Counted here at once and sent in small batches.
import { useEffect } from 'react';
import { useLocation, useSearch } from 'wouter';
import { create } from 'zustand';
import { placeOf, usageQuery, type FindUsage } from '@shared/find';
import { catalogItems } from '@shared/find-catalog';
import { api } from '../../lib/api';

export const useFindUsage = create<{ usage: FindUsage | null }>(() => ({ usage: null }));

let loading: Promise<void> | null = null;
/** Reads what the server learned (when the search box opens; at most every half minute). */
export function loadUsage() {
  if (loading) return loading;
  loading = api<FindUsage>('/api/find/usage')
    .then((u) => useFindUsage.setState({ usage: u }))
    .catch(() => {})
    .finally(() => setTimeout(() => (loading = null), 30_000));
  return loading;
}

const queue: { picks: { id: string; q: string }[]; visits: string[] } = { picks: [], visits: [] };
let timer: ReturnType<typeof setTimeout> | null = null;

function send() {
  if (timer) clearTimeout(timer);
  timer = null;
  if (!queue.picks.length && !queue.visits.length) return;
  const body = { picks: queue.picks.splice(0), visits: queue.visits.splice(0) };
  api('/api/find/usage', { method: 'POST', body }).catch(() => {});
}

const later = () => {
  if (!timer) timer = setTimeout(send, 3000);
};

/** The same, counted here at once, so the next search already knows. */
function count(u: FindUsage, f: (u: FindUsage) => void) {
  const next: FindUsage = { picks: { ...u.picks }, visits: { ...u.visits }, queries: [...u.queries] };
  f(next);
  useFindUsage.setState({ usage: next });
}

/** Something was picked from the search box, with what was typed. */
export function notePick(id: string, q: string) {
  queue.picks.push({ id, q });
  later();
  const u = useFindUsage.getState().usage;
  if (!u) return;
  const uq = usageQuery(q);
  count(u, (x) => {
    x.picks[id] = (x.picks[id] ?? 0) + 1;
    if (uq.length < 2) return;
    const i = x.queries.findIndex(([sq, sid]) => sq === uq && sid === id);
    if (i >= 0) x.queries[i] = [uq, id, x.queries[i][2] + 1];
    else x.queries.push([uq, id, 1]);
  });
}

function noteVisit(place: string) {
  queue.visits.push(place);
  later();
  const u = useFindUsage.getState().usage;
  if (u) count(u, (x) => (x.visits[place] = { n: (x.visits[place]?.n ?? 0) + 1, at: Date.now() }));
}

let pagePaths: Record<string, string> | null = null;
const pages = () => (pagePaths ??= Object.fromEntries(catalogItems().filter((it) => it.path).map((it) => [it.path!, it.id])));

/** The place counted last: staying there (a Settings option pointed at, a file's line) is not another visit. */
let last: string | null = null;

/**
 * Counts the places visited: one the page stays on for a moment, not one passed through on the way. A
 * component of its own, so following the address re-renders nothing else.
 */
export function CountVisits() {
  const [loc] = useLocation();
  const search = useSearch();
  useEffect(() => {
    const place = placeOf(loc, search, pages());
    if (!place || place === last) return;
    const t = setTimeout(() => {
      last = place;
      noteVisit(place);
    }, 1200);
    return () => clearTimeout(t);
  }, [loc, search]);
  // What is waiting goes before the page is put away (a phone switching apps, a tab closed).
  useEffect(() => {
    const away = () => document.visibilityState === 'hidden' && send();
    document.addEventListener('visibilitychange', away);
    return () => document.removeEventListener('visibilitychange', away);
  }, []);
  return null;
}
