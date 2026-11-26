// What a project's Memory tab lists, and how it loads: its notes and findings, its wiki's articles and its own documents as
// one kind of row, the rows of a search of them all, and the hooks that keep each current (notes and findings with the memory
// store, documents with their bases, a search with what is typed, the last answer of an earlier one dropped).
import { useCallback, useEffect, useRef, useState } from 'react';
import { FINDING_VERDICTS, type FindingVerdict } from '@shared/findings';
import { isUserProfile, type MemoryListEntry } from '@shared/memory';
import type { KnowledgeBase, KnowledgeDoc, KnowledgeHit, KnowledgeState } from '@shared/knowledge';
import type { ProjectMemorySearch } from '@shared/project-memory';
import type { ProjectWikiView, WikiArea, WikiItem, WikiUpdate } from '@shared/wiki';
import { api, enc } from '../../../lib/api';
import { ago, bytes } from '../../../lib/format';
import { toastError } from '../../../lib/store';
import { tr } from '../../../i18n/runtime';
import { BASIS, shortDay } from '../../memory/common';
import { verdictLabel } from '../../memory/Finding';

/** The kinds the chips narrow the list to (the same words as the address's `?part=`). */
export type Kind = 'all' | 'notes' | 'wiki' | 'documents' | 'findings';
export type RowKind = 'note' | 'topic' | 'profile' | 'finding' | 'article' | 'hub' | 'source' | 'plan' | 'document';
/** A second row of chips: what narrows a kind further (a note's basis, a wiki area, sources, plans, a verdict). */
export type Sub = string | null;

export interface DocRef {
  b: KnowledgeBase;
  d: KnowledgeDoc;
}

/** One row of the list. `key` says what opens in the reader ("n:12", "w:wiki/a.md", "d:<base>:<doc>"); a search can show one document twice, so `id` is for React. */
export interface Row {
  id: string;
  key: string;
  kind: RowKind;
  title: string;
  meta: string;
  /** When it last changed, for the newest first. */
  at: number;
  /** Shown first whatever the order (the project's profile, an area's hub). */
  pin?: boolean;
  /** Its meta is in the error colour (a document that could not be read). */
  bad?: boolean;
  /** A note's text found by a search, as its meta (two lines). */
  excerpt?: boolean;
  note?: MemoryListEntry;
  /** A finding's: shown as a pill before its age, and whether the code under it changed. */
  verdict?: FindingVerdict;
  changed?: boolean;
}

export const groupOf = (k: RowKind): Exclude<Kind, 'all'> => (k === 'note' || k === 'topic' || k === 'profile' ? 'notes' : k === 'finding' ? 'findings' : k === 'document' ? 'documents' : 'wiki');

const join = (parts: (string | false | undefined | null)[]) => parts.filter(Boolean).join(' · ');

/** Hydor's own index of a wiki folder is how agents search the wiki, not a document a person added. */
export const isWikiIndex = (b: KnowledgeBase) => b.wiki === true || (/^(Project|Shared) wiki$/.test(b.name) && b.description === 'Managed wiki memory');

/** The project's own bases of documents (not its wiki's index), once the bases are known. */
export const ownBases = (st: KnowledgeState | null, project: string): KnowledgeBase[] | null => (st ? st.bases.filter((b) => b.space === project && !isWikiIndex(b)) : null);

export const baseName = (p: string) => p.slice(p.lastIndexOf('/') + 1);

// ---- rows ---------------------------------------------------------------------------------------------------------

/** A finding's row: its statement, then its verdict and age. */
function findingRow(e: MemoryListEntry): Row {
  const f = e.finding!;
  return { id: `n:${e.id}`, key: `n:${e.id}`, kind: 'finding', title: f.statement, meta: ago(e.updatedAt), at: e.updatedAt, note: e, verdict: f.verdict, changed: !!e.drift };
}

export function noteRow(e: MemoryListEntry, found?: boolean): Row {
  if (e.kind === 'finding' && e.finding) return findingRow(e);
  const kind: RowKind = e.kind === 'profile' ? 'profile' : e.kind === 'topic' ? 'topic' : 'note';
  const title = kind === 'profile' ? tr('Project profile') : e.title || e.text.slice(0, 90);
  // A search shows a note's text under its title; a note with no title yet already shows its text as one.
  const excerpt = !!found && (kind === 'profile' || !!e.title);
  let meta: string;
  if (excerpt) meta = e.text;
  else if (kind === 'profile') meta = tr('Every agent here reads it first');
  else if (kind === 'topic') meta = join([tr('Topic'), tr(e.covers === 1 ? 'sums up 1 note' : `sums up ${e.covers ?? 0} notes`), ago(e.updatedAt)]);
  else meta = join([tr('Note'), e.basis && tr(BASIS[e.basis]), e.uses > 0 && (e.uses === 1 ? tr('used once') : tr(`used ${e.uses} times`)), !!e.expiresAt && tr(`ends ${shortDay(e.expiresAt)}`), ago(e.updatedAt)]);
  return { id: `n:${e.id}`, key: `n:${e.id}`, kind, title, meta, at: e.updatedAt, pin: kind === 'profile', excerpt, note: e };
}

/** What a wiki path is: sources are raw/…, plans and their evidence output/…, hubs wiki/areas/…. */
export const wikiKindOf = (path: string): RowKind => (path.startsWith('raw/') ? 'source' : path.startsWith('output/') ? 'plan' : /^wiki\/areas\//.test(path) ? 'hub' : 'article');

export function articleRow(item: WikiItem, areas: WikiArea[] | undefined, kind?: RowKind): Row {
  const k = kind ?? wikiKindOf(item.path);
  const area = areas?.find((a) => a.articles.includes(item.path));
  const label = k === 'source' ? tr('Source') : k === 'plan' ? tr('Plan') : area?.name;
  return {
    id: `w:${item.path}`,
    key: `w:${item.path}`,
    kind: k,
    title: item.title || baseName(item.path),
    meta: join([tr('Wiki'), label, ago(item.updated)]),
    at: item.updated ?? 0,
  };
}

export function hubRow(area: WikiArea): Row {
  return { id: `w:${area.hub}`, key: `w:${area.hub}`, kind: 'hub', title: area.name, meta: tr('Area · what it covers and its key facts'), at: 0, pin: true };
}

export function docRow({ b, d }: DocRef): Row {
  const read = d.status === 'indexed';
  const meta = join([tr('Document'), read ? (d.passages === 1 ? tr('1 passage') : tr(`${d.passages} passages`)) : d.status === 'empty' ? tr('no text') : tr('could not be read'), read && bytes(d.size), read && d.indexedAt ? tr(`read ${ago(d.indexedAt)}`) : '']);
  return { id: `d:${b.id}:${d.id}`, key: `d:${b.id}:${d.id}`, kind: 'document', title: d.title || baseName(d.path), meta, at: d.indexedAt, bad: d.status === 'error' };
}

/** The passage a document hit matched, without its heading line, cut short. */
const passage = (h: KnowledgeHit) => h.text.replace(/^#+\s.*\n+/, '').replace(/\s+/g, ' ').trim().slice(0, 220);

/** The rows a search found, notes then wiki then documents, each best first. */
export function searchRows(r: ProjectMemorySearch): Row[] {
  const rows: Row[] = r.notes.filter((e) => !(isUserProfile(e) && e.status === 'active')).map((e) => noteRow(e, true));
  for (const a of r.articles) {
    const kind = wikiKindOf(a.path);
    rows.push({ id: `w:${a.path}`, key: `w:${a.path}`, kind, title: a.title || baseName(a.path), meta: a.excerpt ?? '', at: 0, excerpt: true });
  }
  r.documents.forEach((h, i) =>
    rows.push({ id: `d:${h.base}:${h.docId}#${i}`, key: `d:${h.base}:${h.docId}`, kind: 'document', title: h.part && !h.title.includes(h.part) ? `${h.title} · ${h.part}` : h.title || baseName(h.path), meta: passage(h), at: 0, excerpt: true }),
  );
  return rows;
}

/** Newest first (what has no date last), or by title; pinned rows lead either way. */
export function sortRows(rows: Row[], by: 'new' | 'az'): Row[] {
  const out = [...rows];
  out.sort((a, b) => Number(!!b.pin) - Number(!!a.pin) || (by === 'az' ? a.title.localeCompare(b.title) : b.at - a.at || a.title.localeCompare(b.title)));
  return out;
}

/** Notes that end within this many days are "Ends soon". */
const SOON = 14 * 86400_000;
export const NOTE_SUBS: { id: string; label: () => string; test: (e: MemoryListEntry, now: number) => boolean }[] = [
  { id: 'user', label: () => tr('You said so'), test: (e) => e.kind === 'note' && e.basis === 'user' },
  { id: 'inferred', label: () => tr('Not checked yet'), test: (e) => e.kind === 'note' && e.basis === 'inferred' },
  { id: 'topics', label: () => tr('Topics'), test: (e) => e.kind === 'topic' },
  { id: 'soon', label: () => tr('Ends soon'), test: (e, now) => !!e.expiresAt && e.expiresAt - now <= SOON },
];

/** The second row under Findings: by verdict. */
export const FINDING_SUBS: { id: FindingVerdict; label: () => string; test: (e: MemoryListEntry) => boolean }[] = FINDING_VERDICTS.map((v) => ({ id: v, label: () => verdictLabel(v), test: (e) => e.finding?.verdict === v }));

/** The wiki's rows for a second-row choice: an area (its hub first, then its articles), the sources, the plans; none: every article. */
export function wikiRows(view: ProjectWikiView | undefined, sub: Sub): Row[] {
  if (!view || view.on === false || view.status === 'off') return [];
  const articles = view.articles ?? [];
  if (sub === 'sources') return (view.sources ?? []).map((i) => articleRow(i, view.areas, 'source'));
  if (sub === 'plans') return (view.plans ?? []).map((i) => articleRow(i, view.areas, 'plan'));
  const area = sub ? view.areas?.find((a) => a.id === sub) : undefined;
  if (area) {
    const by = new Map(articles.map((a) => [a.path, a]));
    const rows = area.articles.map((p) => articleRow(by.get(p) ?? { path: p, title: '' }, view.areas));
    return area.hub ? [hubRow(area), ...rows] : rows;
  }
  return articles.map((i) => articleRow(i, view.areas, 'article'));
}

// ---- loading ------------------------------------------------------------------------------------------------------

/** The documents of these bases (null until the bases are known and each has answered), loaded again when a base changes. */
export function useDocs(bases: KnowledgeBase[] | null): { docs: DocRef[] | null; reload: () => void } {
  const [by, setBy] = useState<{ sig: string; docs: DocRef[] } | null>(null);
  const [tick, setTick] = useState(0);
  const sig = bases ? bases.map((b) => `${b.id}:${b.docs}:${b.passages}:${b.indexing?.done ?? ''}`).join('|') : null;
  const kept = useRef(bases);
  kept.current = bases;
  useEffect(() => {
    const list = kept.current;
    if (!list || sig == null) return;
    let live = true;
    Promise.all(list.map((b) => api<{ docs: KnowledgeDoc[] }>(`/api/knowledge/${enc(b.id)}/docs`).then((r) => r.docs.map((d) => ({ b, d })), () => [] as DocRef[]))).then((all) => live && setBy({ sig, docs: all.flat() }));
    return () => {
      live = false;
    };
  }, [sig, tick]);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  // The last answer shows while a changed base is read again: the list does not blink.
  return { docs: bases && by ? by.docs : null, reload };
}

/** A search of the project's memory for what is typed (after a pause); only the latest answer shows, and one that failed says so quietly. */
export function useMemorySearch(project: string, text: string): { result: ProjectMemorySearch | null; busy: boolean } {
  const q = text.trim();
  const [got, setGot] = useState<{ q: string; r: ProjectMemorySearch | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const latest = useRef(0);
  useEffect(() => {
    const n = ++latest.current;
    if (!q) {
      setGot(null);
      setBusy(false);
      return;
    }
    setBusy(true);
    const t = setTimeout(() => {
      api<ProjectMemorySearch>(`/api/projects/${enc(project)}/memory/search?q=${enc(q)}`)
        .then(
          (r) => n === latest.current && setGot({ q, r }),
          (e) => {
            if (n !== latest.current) return;
            setGot({ q, r: null });
            toastError(e);
          },
        )
        .finally(() => n === latest.current && setBusy(false));
    }, 250);
    return () => clearTimeout(t);
  }, [project, q]);
  return { result: q ? (got?.r ?? null) : null, busy };
}

/** An update that did not fail: the wiki read it and found nothing to add. */
export const notAFailure = (u: WikiUpdate) => !u.error || /^Nothing in it/i.test(u.error);
