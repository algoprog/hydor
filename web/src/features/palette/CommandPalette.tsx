// Ctrl+K, or Search in the sidebar: one box to find anything, like Spotlight. As you type it shows at once, by
// their words, the app's places and actions, every setting, themes and the sessions you have, with apps, tasks,
// assistants, skills, pages and connections (fetched when it opens); then what the server adds: sessions about
// the same thing in other words, messages that hold the words, memory notes, and files. With search by meaning
// on (Settings → Memory) things also match what they mean. The best match comes first, and among what matches
// what you use comes up: what you picked here before (most for what you typed the same) and the places you
// visit (usage.ts). A preview beside the list says more about the one picked, and opening it goes there: a
// setting opens its section and points at it, a message opens its session where it was said. Search in, beside
// the field, looks only in the places picked (scope.ts, kept for every device); with nothing typed, it lists
// what those places hold.
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { create } from 'zustand';
import { ArrowRight, BookOpen, Bot, Boxes, Brain, Cable, CalendarClock, Check, ChevronDown, Compass, CornerDownLeft, FileText, LayoutGrid, Layers, Library, LibraryBig, ListFilter, MessageSquareText, MessagesSquare, Search, Settings, Sparkles, X } from 'lucide-react';
import { FIND_PLACES, matchItem, matchStrength, queryAffinity, queryWords, usageBoost, type FindPlace, type FindResponse, type FindUsage } from '@shared/find';
import type { SessionSummary } from '@shared/types';
import { api } from '../../lib/api';
import { MOD, markRuns, timeAgo } from '../../lib/format';
import { go, openFile, sessionPath } from '../../lib/nav';
import { useApp, useSessions, useUI } from '../../lib/store';
import { AgentIcon } from '../../components/AgentIcon';
import { Button, cx, Kbd, MenuLabel, MenuSep, Popover, SheetsOnPhone, Throbber, useIsMobile, useMediaQuery, useSheets } from '../../components/ui';
import { folderName } from '../sessions/SessionList';
import { liveEntries, staticEntries, type Entry, type Group } from './catalog';
import { loadScope, setScope, useFindScope } from './scope';
import { loadUsage, notePick, useFindUsage } from './usage';

export const usePalette = create<{ open: boolean }>(() => ({ open: false }));
export const openPalette = () => usePalette.setState({ open: true });

// Sessions opened used to be counted in this browser alone; the server counts every visit now (usage.ts).
try {
  localStorage.removeItem('wa.frecency');
} catch {}

// ---- ranking ------------------------------------------------------------------------------------

/** One thing found, as the list shows it. */
interface Hit {
  entry: Entry;
  score: number;
  /** How strongly it matches (0 to 1, matchStrength): what use adds counts as much. */
  strength?: number;
  /** Parts of the title to mark. */
  marks?: [number, number][];
  /** Instead of the title, for a message (its words marked). */
  label?: ReactNode;
  sub?: string;
}

/** How much each kind counts against the others, for the best match and the order of the groups. */
const WEIGHT: Record<Group, number> = {
  Settings: 1,
  'Go to': 1,
  Actions: 0.95,
  Sessions: 0.95,
  Projects: 0.9,
  Guide: 0.9,
  Apps: 0.9,
  'Scheduled tasks': 0.9,
  Assistants: 0.9,
  Skills: 0.85,
  Plugins: 0.85,
  Connections: 0.85,
  Pages: 0.85,
  'Images, videos and audio': 0.85,
  Themes: 0.8,
  Memory: 0.75,
  Files: 0.7,
  'In messages': 0.6,
};
/** Rows a group shows before "more". */
const SHOWN = 4;
/** With nothing typed and several places picked, rows each place lists before "more". */
const LISTED = 6;
/** Most rows a group shows. */
const MOST = 30;

/** The places Search in can look in (shared/find.ts), as its menu shows them, with the groups of results each holds. */
const PLACES: Record<FindPlace, { label: string; icon: ReactNode; groups: Group[] }> = {
  sessions: { label: 'Sessions', icon: <MessagesSquare size={15} />, groups: ['Sessions'] },
  messages: { label: 'Messages', icon: <MessageSquareText size={15} />, groups: ['In messages'] },
  spaces: { label: 'Projects', icon: <Boxes size={15} />, groups: ['Projects'] },
  pages: { label: 'Library', icon: <LibraryBig size={15} />, groups: ['Pages', 'Images, videos and audio'] },
  templates: { label: 'Apps', icon: <LayoutGrid size={15} />, groups: ['Apps'] },
  files: { label: 'Files', icon: <FileText size={15} />, groups: ['Files'] },
  memory: { label: 'Memory', icon: <Brain size={15} />, groups: ['Memory'] },
  tasks: { label: 'Scheduled tasks', icon: <CalendarClock size={15} />, groups: ['Scheduled tasks'] },
  assistants: { label: 'Assistants', icon: <Bot size={15} />, groups: ['Assistants'] },
  skills: { label: 'Skills', icon: <Library size={15} />, groups: ['Skills', 'Plugins'] },
  connections: { label: 'Connections', icon: <Cable size={15} />, groups: ['Connections'] },
  settings: { label: 'Settings', icon: <Settings size={15} />, groups: ['Settings', 'Themes'] },
  actions: { label: 'Go to and actions', icon: <Compass size={15} />, groups: ['Go to', 'Actions'] },
  guide: { label: 'Guide', icon: <BookOpen size={15} />, groups: ['Guide'] },
};
const PLACE_OF = Object.fromEntries(FIND_PLACES.flatMap((p) => PLACES[p].groups.map((g) => [g, p]))) as Record<Group, FindPlace>;

/** Whether results of a group show, with these places picked (none: everywhere). */
const shows = (places: FindPlace[], g: Group) => !places.length || places.includes(PLACE_OF[g]);

/** Rank fusion: a list's first counts 1/8, its tenth 1/17. */
const rrf = (rank: number) => 1 / (8 + rank);
/** Picked for what was typed at least this much before: it shows even before it matches otherwise. */
const RECALL = 1;

function marked(title: string, marks?: [number, number][]): ReactNode {
  if (!marks?.length) return title;
  const out: ReactNode[] = [];
  let at = 0;
  marks.forEach(([a, b], i) => {
    if (a > at) out.push(title.slice(at, a));
    out.push(
      <mark key={i} className="rounded-[3px] bg-accent/20 text-fg">
        {title.slice(a, b)}
      </mark>,
    );
    at = b;
  });
  if (at < title.length) out.push(title.slice(at));
  return out;
}

function snippet(s: string): ReactNode {
  return markRuns(s).map((r, i) =>
    r.hit ? (
      <mark key={i} className="rounded-[3px] bg-accent/20 text-fg">
        {r.text}
      </mark>
    ) : (
      <span key={i}>{r.text}</span>
    ),
  );
}

function sessionEntry(s: { key: string; agent: SessionSummary['agent']; acpName?: string; title: string; cwd?: string; updatedAt?: number; firstPrompt?: string }, home?: string, find?: string): Entry {
  return {
    id: `s:${s.key}${find ? `:${find}` : ''}`,
    group: 'Sessions',
    icon: <AgentIcon agent={s.agent} name={s.acpName} size={15} />,
    title: s.title || 'Untitled',
    where: folderName(s.cwd, home),
    hint: s.updatedAt ? timeAgo(s.updatedAt) : undefined,
    body: s.firstPrompt && s.firstPrompt !== s.title ? s.firstPrompt : undefined,
    facts: [
      ['Folder', s.cwd ?? ''],
      ['Last active', s.updatedAt ? timeAgo(s.updatedAt) : ''],
    ],
    opens: find ? 'Opens the session where it was said' : 'Opens the session',
    run: () => go(`${sessionPath(s.key)}${find ? `?find=${encodeURIComponent(find)}` : ''}`),
  };
}

interface Found {
  top: Hit | null;
  groups: { group: Group; hits: Hit[] }[];
}

function rank(q: string, all: Entry[], sessions: SessionSummary[], server: FindResponse | null, files: string[], usage: FindUsage | null, places: FindPlace[], home?: string): Found {
  const words = queryWords(q);
  const affinity = queryAffinity(usage, q);
  // Only the places picked (the server looked only there too).
  const entries = all.filter((e) => shows(places, e.group));
  if (!shows(places, 'Sessions')) sessions = [];
  const hits = new Map<string, Hit>();
  const add = (h: Hit) => {
    const was = hits.get(h.entry.id);
    if (!was) return void hits.set(h.entry.id, h);
    was.score += h.score;
    was.strength = Math.max(was.strength ?? 0, h.strength ?? 0);
  };
  // The page's own entries: by their words now, and by meaning once the server says.
  const byWords = entries
    .map((e) => ({ e, m: matchItem(e, words, q) }))
    .filter((x) => x.m.score > 0)
    .sort((a, b) => b.m.score - a.m.score);
  byWords.forEach(({ e, m }, i) => add({ entry: e, score: rrf(i) + (m.score >= 60 ? 0.15 : m.score >= 40 ? 0.07 : 0), marks: m.marks, strength: matchStrength(m.score) }));
  const known = new Map(entries.map((e) => [e.id, e]));
  // Alike in meaning holds about as well as a good match by words.
  server?.alike.forEach((c, i) => {
    const e = known.get(c.id);
    if (e) add({ entry: e, score: 0.8 * rrf(i), strength: 0.6 });
  });
  // Sessions: their titles and folders here, and what the server finds by title or meaning.
  sessions
    .filter((s) => !s.archived)
    .map((s) => ({ s, m: matchItem({ title: s.title ?? '', keywords: `${folderName(s.cwd, home)} ${s.gitBranch ?? ''}`, text: s.firstPrompt }, words, q) }))
    .filter((x) => x.m.score > 0)
    .sort((a, b) => b.m.score - a.m.score)
    .slice(0, 30)
    .forEach(({ s, m }, i) => add({ entry: sessionEntry(s, home), score: rrf(i), marks: m.marks, strength: matchStrength(m.score) }));
  server?.sessions.forEach((s, i) => add({ entry: sessionEntry(s, home), score: 0.8 * rrf(i), strength: 0.6 }));
  server?.messages.forEach((m, i) => {
    const e = sessionEntry({ key: m.key, agent: m.agent, title: m.title, cwd: m.cwd, updatedAt: m.updatedAt }, home, q.trim());
    add({ entry: { ...e, id: `m:${m.key}:${m.ts ?? i}`, group: 'In messages', icon: <MessageSquareText size={15} />, body: m.snippet.replace(/[\u0001\u0002]/g, ''), hint: m.ts ? timeAgo(m.ts) : e.hint }, score: rrf(i), label: <span className="line-clamp-1">{snippet(m.snippet)}</span>, sub: m.title });
  });
  server?.notes.forEach((n, i) => {
    const where = n.scope === 'global' ? 'About you' : n.scope === 'repo' ? `Project · ${folderName(n.scopeKey, home)}` : 'A session';
    add({
      entry: {
        id: `note:${n.id}`,
        group: 'Memory',
        icon: <Brain size={15} />,
        title: n.text,
        where: `Memory › ${where}`,
        hint: timeAgo(n.updatedAt),
        body: n.text,
        facts: [['Kept', where]],
        opens: 'Opens Settings → Memory, at this note',
        run: () => go(`/settings?s=memory&find=${encodeURIComponent(n.text)}`),
      },
      score: rrf(i),
    });
  });
  files.forEach((p, i) =>
    add({
      entry: { id: `f:${p}`, group: 'Files', icon: <FileText size={15} />, title: p.split('/').pop() || p, where: p, opens: 'Opens the file', run: () => openFile(p) },
      score: rrf(i),
      marks: matchItem({ title: p.split('/').pop() || p }, words, q).marks,
    }),
  );
  // What was picked for this query before shows at once, even before it matches by words or meaning.
  const byKey = new Map(sessions.map((s) => [`s:${s.key}`, s]));
  for (const [id, a] of affinity) {
    if (a < RECALL || hits.has(id)) continue;
    const e = known.get(id);
    const s = byKey.get(id);
    if (e) add({ entry: e, score: rrf(10) });
    else if (s && !s.archived) add({ entry: sessionEntry(s, home), score: rrf(10) });
  }
  // Then what is used comes up among what matches.
  const ranked = [...hits.values()]
    .filter((h) => shows(places, h.entry.group))
    .map((h) => ({ ...h, score: (h.score + usageBoost(usage, affinity, h.entry.id, h.entry.within, h.strength ?? 0.5)) * WEIGHT[h.entry.group] }))
    .sort((a, b) => b.score - a.score);
  const top = ranked[0] ?? null;
  const groups = new Map<Group, Hit[]>();
  for (const h of ranked.slice(1)) groups.set(h.entry.group, [...(groups.get(h.entry.group) ?? []), h]);
  return { top, groups: [...groups.entries()].map(([group, hits]) => ({ group, hits })) };
}

/** Suggested with nothing typed until use says otherwise. */
const SUGGEST = ['go:new', 'go:settings', 'sec:memory', 'go:usage', 'go:search-files'];

/** Listed with nothing typed when its place is picked: Settings' sections (not each option) and the guide's topics (not each section). */
const listed = (e: Entry) => (e.group === 'Settings' ? e.id.startsWith('sec:') : e.group === 'Guide' ? !e.id.includes('#') : true);

/**
 * With nothing typed: the sessions used last, and the places used most (a few suggestions before there are any).
 * With only some places picked: what each of them holds, the most used first (messages, memory and files wait for words).
 */
function start(sessions: SessionSummary[], entries: Entry[], usage: FindUsage | null, places: FindPlace[], home?: string): Found {
  const v = usage?.visits ?? {};
  const recent = sessions
    .filter((s) => !s.archived)
    .map((s) => {
      const u = v[`s:${s.key}`];
      return { s, t: Math.max(u?.at ?? 0, s.updatedAt ?? 0) + (u ? Math.log2(1 + u.n) * 3600_000 : 0) };
    })
    .sort((a, b) => b.t - a.t)
    .slice(0, places.length ? MOST : 5)
    .map(({ s }) => ({ entry: sessionEntry(s, home), score: 0 }));
  const use = (e: Entry) => (usage?.picks[e.id] ?? 0) + (v[e.id]?.n ?? 0);
  if (places.length) {
    const groups = new Map<Group, Hit[]>();
    if (places.includes('sessions') && recent.length) groups.set('Sessions', recent);
    const mine = entries
      .filter((e) => e.group !== 'Sessions' && shows(places, e.group) && listed(e))
      .map((entry, i) => ({ entry, i, n: use(entry) }))
      .sort((a, b) => b.n - a.n || a.i - b.i);
    for (const { entry } of mine) groups.set(entry.group, [...(groups.get(entry.group) ?? []), { entry, score: 0 }]);
    const order = (g: Group) => FIND_PLACES.indexOf(PLACE_OF[g]);
    return {
      top: null,
      groups: [...groups.entries()].sort((a, b) => order(a[0]) - order(b[0])).map(([group, hits]) => ({ group, hits: hits.slice(0, MOST) })),
    };
  }
  const used = entries
    .filter((e) => e.group !== 'Sessions' && use(e) >= 1)
    .sort((a, b) => use(b) - use(a))
    .slice(0, 5);
  const suggested = [...used, ...SUGGEST.map((id) => entries.find((e) => e.id === id)).filter((e): e is Entry => !!e && !used.includes(e))].slice(0, 5);
  return { top: null, groups: [...(recent.length ? [{ group: 'Sessions' as Group, hits: recent }] : []), { group: 'Go to' as Group, hits: suggested.map((entry) => ({ entry, score: 0 })) }] };
}

// ---- the box ------------------------------------------------------------------------------------

export function CommandPalette() {
  const open = usePalette((s) => s.open);
  const mobile = useIsMobile();
  const sessions = useSessions((s) => s.byKey);
  const home = useApp((s) => s.boot?.home);
  const root = useUI((s) => s.explorerRoot);
  const defaultCwd = useApp((s) => s.boot?.defaultCwd);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const [live, setLive] = useState<Entry[]>([]);
  const [server, setServer] = useState<FindResponse | null>(null);
  const [files, setFiles] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState<Set<Group>>(new Set());
  const usage = useFindUsage((s) => s.usage);
  const places = useFindScope((s) => s.places);
  const scope = places.join(',');
  const [picking, setPicking] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Beside the list, a preview of the one picked, where there is room.
  const wide = useMediaQuery('(min-width: 900px)') && !mobile;
  const close = () => usePalette.setState({ open: false });
  // Where it looks, as kept on the server, from the start (the box opens that way at once).
  useEffect(() => loadScope(), []);
  // Another place picked: the list starts again from its top.
  useEffect(() => {
    setSel(0);
    setMore(new Set());
  }, [scope]);
  const donePicking = useCallback(() => {
    setPicking(false);
    if (!mobile) inputRef.current?.focus();
  }, [mobile]);

  // Opening starts afresh, and fetches what changes.
  const base = useMemo(() => (open ? staticEntries() : []), [open]);
  useEffect(() => {
    if (!open) return;
    setQ('');
    setSel(0);
    setServer(null);
    setFiles([]);
    setMore(new Set());
    setPicking(false);
    let alive = true;
    liveEntries().then((l) => alive && setLive(l));
    void loadUsage();
    return () => {
      alive = false;
    };
  }, [open, base]);
  const entries = useMemo(() => [...base, ...live], [base, live]);

  // What the server adds, a moment after typing stops.
  useEffect(() => {
    const term = q.trim();
    if (!open || !term) {
      setServer(null);
      setFiles([]);
      setBusy(false);
      return;
    }
    const ctl = new AbortController();
    setBusy(true);
    const t = setTimeout(() => {
      const dir = root || defaultCwd;
      Promise.all([
        api<FindResponse>(`/api/find?q=${encodeURIComponent(term)}${scope ? `&in=${scope}` : ''}`, { signal: ctl.signal }).catch(() => null),
        term.length >= 2 && dir && shows(places, 'Files')
          ? api<{ files: string[] }>(`/api/fs/find?root=${encodeURIComponent(dir)}&q=${encodeURIComponent(term)}`, { signal: ctl.signal }).catch(() => null)
          : Promise.resolve(null),
      ]).then(([r, f]) => {
        if (ctl.signal.aborted) return;
        setServer(r);
        setFiles((f?.files ?? []).slice(0, 5));
        setBusy(false);
      });
    }, 140);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q, open, scope]); // eslint-disable-line react-hooks/exhaustive-deps

  const found = useMemo<Found>(() => {
    if (!open) return { top: null, groups: [] };
    const list = Object.values(sessions);
    return q.trim() ? rank(q, entries, list, server, files, usage, places, home) : start(list, entries, usage, places, home);
  }, [open, q, entries, sessions, server, files, usage, places, home]);

  // The rows, in order, for the keys: the best match, then each group's (and its "more"). With nothing typed a
  // group lists everything, or with several places picked, a few of each.
  type Row = { kind: 'hit'; hit: Hit; group?: Group; first?: boolean } | { kind: 'more'; group: Group; n: number };
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    if (found.top) out.push({ kind: 'hit', hit: found.top });
    const limit = q.trim() ? SHOWN : places.length > 1 ? LISTED : MOST;
    for (const g of found.groups) {
      const all = more.has(g.group);
      const shown = g.hits.slice(0, all ? MOST : limit);
      shown.forEach((hit, i) => out.push({ kind: 'hit', hit, group: g.group, first: i === 0 }));
      if (!all && g.hits.length > limit) out.push({ kind: 'more', group: g.group, n: g.hits.length - limit });
    }
    return out;
  }, [found, more, q, places]);

  useEffect(() => setSel((v) => Math.min(v, Math.max(0, rows.length - 1))), [rows.length]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-i="${sel}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  if (!open) return null;
  const pick = (i: number) => {
    const r = rows[i];
    if (!r) return;
    if (r.kind === 'more') return setMore((m) => new Set(m).add(r.group));
    close();
    notePick(r.hit.entry.id, q);
    r.hit.entry.run();
  };
  const current = rows[sel]?.kind === 'hit' ? (rows[sel] as { hit: Hit }).hit : null;

  return createPortal(
    <div
      className={cx('scrim fixed inset-0 z-[55] flex justify-center [--scrim:0.3]', mobile ? '' : 'px-3 pt-[11vh]')}
      onPointerDown={(e) => e.target === e.currentTarget && close()}
    >
      <div
        role="dialog"
        aria-label="Search"
        className={cx(
          'flex flex-col overflow-hidden bg-elevated shadow-lg',
          mobile ? 'h-full w-full pt-[var(--safe-top)]' : cx('h-fit max-h-[72vh] w-full rounded-2xl border border-line', wide ? 'max-w-[860px]' : 'max-w-[640px]'),
        )}
      >
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search size={19} className="shrink-0 text-fg-3" />
          <input
            ref={inputRef}
            autoFocus
            role="combobox"
            aria-expanded
            aria-controls="find-list"
            aria-activedescendant={`find-${sel}`}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setSel(0);
              setMore(new Set());
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                // The Search in menu closes first (it closes itself on Escape too).
                if (picking) setPicking(false);
                else if (q) setQ('');
                else close();
              } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSel((v) => Math.min(v + 1, rows.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSel((v) => Math.max(v - 1, 0));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                pick(sel);
              }
            }}
            placeholder={places.length ? 'Search…' : 'Search settings, sessions, apps, notes, files…'}
            enterKeyHint="go"
            className="h-14 min-w-0 flex-1 bg-transparent text-[17px] outline-none placeholder:text-fg-3"
          />
          {busy && <Throbber className="text-fg-3" />}
          <SearchIn places={places} open={picking} onOpen={() => setPicking((o) => !o)} onClose={donePicking} mobile={mobile} />
          {mobile ? (
            <button onClick={close} className="shrink-0 text-[15px] text-accent">
              Cancel
            </button>
          ) : (
            q && (
              <button onClick={() => setQ('')} aria-label="Clear" className="shrink-0 rounded-full p-1 text-fg-3 hover:bg-bg-2 hover:text-fg">
                <X size={15} />
              </button>
            )
          )}
        </div>
        <div className="flex min-h-0 flex-1">
          <div ref={listRef} id="find-list" role="listbox" className={cx('min-h-0 overflow-y-auto p-1.5', wide ? 'w-[55%] border-r border-line' : 'w-full')}>
            {!rows.length && (
              <div className="px-3 py-10 text-center text-[13.5px] text-fg-3">
                <div>{busy ? 'Looking…' : q.trim() ? `Nothing found for “${q.trim()}”` : places.length ? 'Type to search' : 'Type to search everything'}</div>
                {!busy && q.trim() && places.length > 0 && (
                  <Button size="sm" variant="secondary" icon={<Layers size={14} />} onClick={() => setScope([])} className="mt-3">
                    Search everywhere
                  </Button>
                )}
              </div>
            )}
            {rows.map((r, i) => {
              const head =
                r.kind === 'hit' &&
                (i === 0 && !r.group ? 'Best match' : r.first ? (!q.trim() && r.group === 'Sessions' ? 'Recent sessions' : !q.trim() && !places.length && r.group === 'Go to' ? 'Suggestions' : r.group) : null);
              return (
                <div key={r.kind === 'hit' ? `${r.group ?? 'top'}:${r.hit.entry.id}` : `more:${r.group}`}>
                  {head && <div className="px-2.5 pt-2.5 pb-1 text-[11.5px] font-medium tracking-wide text-fg-3">{head}</div>}
                  {r.kind === 'hit' ? (
                    <button
                      id={`find-${i}`}
                      role="option"
                      aria-selected={i === sel}
                      data-i={i}
                      onMouseMove={() => sel !== i && setSel(i)}
                      onClick={() => pick(i)}
                      className={cx('flex w-full items-center gap-2.5 rounded-lg px-2.5 text-left transition-colors', !r.group ? 'h-12' : 'h-9', i === sel ? 'bg-accent-soft text-fg' : 'text-fg-2')}
                    >
                      <span className={cx('flex shrink-0 items-center justify-center rounded-md', !r.group ? 'h-8 w-8 bg-bg-2 text-fg-2' : 'w-4 text-fg-3')}>{r.hit.entry.icon}</span>
                      <span className="min-w-0 flex-1">
                        <span className={cx('block truncate', !r.group ? 'text-[14.5px] font-medium text-fg' : 'text-[13.5px]')}>{r.hit.label ?? marked(r.hit.entry.title, r.hit.marks)}</span>
                        {!r.group && (r.hit.sub ?? r.hit.entry.where) && <span className="block truncate text-[12px] text-fg-3">{r.hit.sub ?? r.hit.entry.where}</span>}
                      </span>
                      {r.group && (r.hit.sub ?? r.hit.entry.where) && <span className="max-w-[38%] shrink-0 truncate text-[11.5px] text-fg-3">{r.hit.sub ?? r.hit.entry.where}</span>}
                      {r.hit.entry.hint && !(r.group && (r.hit.sub ?? r.hit.entry.where)) && <span className="shrink-0 text-[11.5px] text-fg-3">{r.hit.entry.hint}</span>}
                      {i === sel && <CornerDownLeft size={12} className="shrink-0 text-fg-3" />}
                    </button>
                  ) : (
                    <button id={`find-${i}`} data-i={i} onMouseMove={() => sel !== i && setSel(i)} onClick={() => pick(i)} className={cx('flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[12.5px]', i === sel ? 'bg-accent-soft text-fg' : 'text-fg-3')}>
                      <ChevronDown size={13} className="w-4 shrink-0" />
                      {r.n} more in {r.group}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {wide && <Preview hit={current} q={q} />}
        </div>
        {!mobile && (
          <div className="flex items-center gap-3 border-t border-line px-4 py-2 text-[11.5px] text-fg-3">
            <span className="flex items-center gap-1">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd> to move
            </span>
            <span className="flex items-center gap-1">
              <Kbd>↵</Kbd> to open
            </span>
            <span className="flex items-center gap-1">
              <Kbd>esc</Kbd> to close
            </span>
            <span className="flex-1" />
            <span
              className="flex items-center gap-1"
              title={server?.meaning ? 'Things also match what they mean, in other words' : 'Turn on search by meaning in Settings → Memory to also find things by what they mean'}
            >
              <Sparkles size={12} className={server?.meaning ? 'text-accent' : undefined} />
              {server?.meaning ? 'Words and meaning' : 'Words'}
            </span>
            <span className="flex items-center gap-1">
              <Kbd>{MOD}K</Kbd>
            </span>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** Search in, beside the field: everywhere, or only the places picked, and the menu to pick them. */
function SearchIn({ places, open, onOpen, onClose, mobile }: { places: FindPlace[]; open: boolean; onOpen: () => void; onClose: () => void; mobile: boolean }) {
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={onOpen}
        // A click here leaves the typing where it was.
        onMouseDown={(e) => e.preventDefault()}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={places.length ? `Search in: ${places.map((p) => PLACES[p].label).join(', ')}` : 'Search in: everywhere'}
        className={cx(
          'flex h-8 max-w-[45%] min-w-0 shrink-0 items-center gap-1.5 rounded-lg px-2 text-[12.5px] transition-colors hover:bg-bg-2',
          places.length ? 'text-accent' : 'text-fg-3 hover:text-fg',
          open && 'bg-bg-2',
        )}
      >
        <ListFilter size={15} className="shrink-0" />
        <span className="sr-only">Search in</span>
        {(places.length > 0 || !mobile) && <ScopeName places={places} />}
        {!mobile && <ChevronDown size={12} className={cx('shrink-0 opacity-60 transition-transform duration-200', open && 'rotate-180')} />}
      </button>
      <SheetsOnPhone.Provider value>
        {/* As wide as its longest name needs (a language's names may be longer), two by two. */}
        <Popover anchor={ref} open={open} onClose={onClose} align="end" z={56} title="Search in" className="sm:min-w-96">
          <ScopeMenu places={places} />
        </Popover>
      </SheetsOnPhone.Provider>
    </>
  );
}

/** What Search in is set to: Everywhere, a place or two by name, or how many. */
function ScopeName({ places }: { places: FindPlace[] }) {
  if (!places.length) return <span className="truncate">Everywhere</span>;
  if (places.length > 2) return <span className="truncate">{`${places.length} places`}</span>;
  return (
    <span className="flex min-w-0 items-center">
      {places.map((p, i) => (
        <Fragment key={p}>
          {i > 0 && <span className="shrink-0">,&nbsp;</span>}
          <span className="truncate">{PLACES[p].label}</span>
        </Fragment>
      ))}
    </span>
  );
}

/** The places, two by two: tick some to look only there, none (Everywhere) to look in all of them. */
function ScopeMenu({ places }: { places: FindPlace[] }) {
  const sheet = useSheets();
  const flip = (p: FindPlace) => setScope(places.includes(p) ? places.filter((x) => x !== p) : [...places, p]);
  return (
    // A click here leaves the typing where it was.
    <div onMouseDown={(e) => e.preventDefault()}>
      {!sheet && <MenuLabel>Search in</MenuLabel>}
      <PlaceRow icon={<Layers size={15} />} label="Everywhere" on={!places.length} onClick={() => setScope([])} />
      <MenuSep />
      <div className="grid grid-cols-2 gap-x-1">
        {FIND_PLACES.map((p) => (
          <PlaceRow key={p} icon={PLACES[p].icon} label={PLACES[p].label} on={places.includes(p)} onClick={() => flip(p)} />
        ))}
      </div>
      <div className="px-2.5 pt-1.5 pb-1 text-[11.5px] text-fg-3">{places.length ? 'Kept for your next searches, on every device' : 'Pick places to search only those'}</div>
    </div>
  );
}

/**
 * A place in the menu, ticked when it is looked in: its tick keeps its room either way, so ticking moves nothing,
 * and a long name takes a second line where the menu is narrow (a phone) rather than being cut.
 */
function PlaceRow({ icon, label, on, onClick }: { icon: ReactNode; label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className="flex min-h-8.5 w-full items-center gap-2.5 rounded-lg px-2.5 py-1 text-left text-[13.5px] text-fg transition-colors hover:bg-bg-2 max-sm:min-h-11"
    >
      <span className="flex w-4 shrink-0 items-center justify-center text-fg-3">{icon}</span>
      <span className="min-w-0 flex-1 leading-tight">{label}</span>
      <Check size={14} strokeWidth={2.5} className={cx('shrink-0', !on && 'invisible')} />
    </button>
  );
}

/** More about the one picked: where it is, what it says, and where opening it goes. */
function Preview({ hit, q }: { hit: Hit | null; q: string }) {
  if (!hit) return <div className="hidden w-[45%] items-center justify-center p-6 text-center text-[13px] text-fg-3 md:flex">{q.trim() ? '' : 'Settings, sessions, apps, notes and files, all in one place'}</div>;
  const e = hit.entry;
  const facts = (e.facts ?? []).filter(([, v]) => v);
  return (
    <div className="flex w-[45%] min-w-0 flex-col gap-3 overflow-y-auto p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-bg-2 text-fg-2 [&_svg]:h-5 [&_svg]:w-5">{e.mark ?? e.icon}</span>
        <div className="min-w-0 pt-0.5">
          <div className="text-[15px] leading-snug font-medium break-words text-fg">{e.group === 'In messages' ? hit.sub : e.title}</div>
          {e.where && <div className="mt-0.5 text-[12px] break-words text-fg-3">{e.where}</div>}
        </div>
      </div>
      {e.group === 'In messages' ? (
        <div className="rounded-xl bg-bg-2 px-3 py-2.5 text-[13px] leading-relaxed text-fg-2">{hit.label}</div>
      ) : (
        e.body && <div className="line-clamp-[12] text-[13px] leading-relaxed whitespace-pre-wrap text-fg-2">{e.body}</div>
      )}
      {facts.length > 0 && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px]">
          {facts.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-fg-3">{k}</dt>
              <dd className="min-w-0 truncate text-fg-2">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="mt-auto flex items-center gap-1.5 pt-2 text-[12px] text-fg-3">
        <ArrowRight size={13} />
        {e.opens ?? 'Opens it'}
        <span className="flex-1" />
        <Kbd>↵</Kbd>
      </div>
    </div>
  );
}
