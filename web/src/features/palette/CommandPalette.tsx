// Ctrl+K, or Search in the sidebar: one box to find anything, like Spotlight. As you type it shows at once, by
// their words, the app's places and actions, every setting, themes and the sessions you have, with apps, tasks,
// assistants, skills, pages and connections (fetched when it opens); then what the server adds: sessions about
// the same thing in other words, messages that hold the words, memory notes, and files. With search by meaning
// on (Settings → Memory) things also match what they mean. The best match comes first; a preview beside the
// list says more about the one picked, and opening it goes there: a setting opens its section and points at it,
// a message opens its session where it was said.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { create } from 'zustand';
import { ArrowRight, Brain, ChevronDown, CornerDownLeft, FileText, MessageSquareText, Search, Sparkles, X } from 'lucide-react';
import { matchItem, queryWords, type FindResponse } from '@shared/find';
import type { SessionSummary } from '@shared/types';
import { api } from '../../lib/api';
import { MOD, markRuns, timeAgo } from '../../lib/format';
import { go, openFile, sessionPath } from '../../lib/nav';
import { useApp, useSessions, useUI } from '../../lib/store';
import { AgentIcon } from '../../components/AgentIcon';
import { cx, Kbd, Throbber, useIsMobile, useMediaQuery } from '../../components/ui';
import { folderName } from '../sessions/SessionList';
import { liveEntries, staticEntries, type Entry, type Group } from './catalog';

export const usePalette = create<{ open: boolean }>(() => ({ open: false }));
export const openPalette = () => usePalette.setState({ open: true });

const FRECENCY = 'wa.frecency';

/** How often and how lately each session was opened, to rank sessions in the search box. */
export function noteOpened(key: string) {
  try {
    const m = JSON.parse(localStorage.getItem(FRECENCY) ?? '{}') as Record<string, { n: number; t: number }>;
    m[key] = { n: (m[key]?.n ?? 0) + 1, t: Date.now() };
    const keep = Object.entries(m)
      .sort((a, b) => b[1].t - a[1].t)
      .slice(0, 300);
    localStorage.setItem(FRECENCY, JSON.stringify(Object.fromEntries(keep)));
  } catch {}
}

function frecency(): Record<string, { n: number; t: number }> {
  try {
    return JSON.parse(localStorage.getItem(FRECENCY) ?? '{}');
  } catch {
    return {};
  }
}

// ---- ranking ------------------------------------------------------------------------------------

/** One thing found, as the list shows it. */
interface Hit {
  entry: Entry;
  score: number;
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
  Templates: 0.9,
  'Scheduled tasks': 0.9,
  Assistants: 0.9,
  Skills: 0.85,
  Connections: 0.85,
  Pages: 0.85,
  Themes: 0.8,
  Memory: 0.75,
  Files: 0.7,
  'In messages': 0.6,
};
/** Rows a group shows before "more". */
const SHOWN = 4;

/** Rank fusion: a list's first counts 1/8, its tenth 1/17. */
const rrf = (rank: number) => 1 / (8 + rank);

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

function rank(q: string, entries: Entry[], sessions: SessionSummary[], server: FindResponse | null, files: string[], home?: string): Found {
  const words = queryWords(q);
  const hits = new Map<string, Hit>();
  const add = (h: Hit) => {
    const was = hits.get(h.entry.id);
    if (was) was.score += h.score;
    else hits.set(h.entry.id, h);
  };
  // The page's own entries: by their words now, and by meaning once the server says.
  const byWords = entries
    .map((e) => ({ e, m: matchItem(e, words, q) }))
    .filter((x) => x.m.score > 0)
    .sort((a, b) => b.m.score - a.m.score);
  byWords.forEach(({ e, m }, i) => add({ entry: e, score: rrf(i) + (m.score >= 60 ? 0.15 : m.score >= 40 ? 0.07 : 0), marks: m.marks }));
  const known = new Map(entries.map((e) => [e.id, e]));
  server?.alike.forEach((c, i) => {
    const e = known.get(c.id);
    if (e) add({ entry: e, score: 0.8 * rrf(i) });
  });
  // Sessions: their titles and folders here, and what the server finds by title or meaning.
  const f = frecency();
  const now = Date.now();
  const used = (key: string) => (f[key] ? Math.log2(1 + f[key].n) * Math.exp(-(now - f[key].t) / (14 * 86400_000)) * 0.01 : 0);
  sessions
    .filter((s) => !s.archived)
    .map((s) => ({ s, m: matchItem({ title: s.title ?? '', keywords: `${folderName(s.cwd, home)} ${s.gitBranch ?? ''}`, text: s.firstPrompt }, words, q) }))
    .filter((x) => x.m.score > 0)
    .sort((a, b) => b.m.score - a.m.score)
    .slice(0, 30)
    .forEach(({ s, m }, i) => add({ entry: sessionEntry(s, home), score: rrf(i) + used(s.key), marks: m.marks }));
  server?.sessions.forEach((s, i) => add({ entry: sessionEntry(s, home), score: 0.8 * rrf(i) }));
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
  const all = [...hits.values()].map((h) => ({ ...h, score: h.score * WEIGHT[h.entry.group] })).sort((a, b) => b.score - a.score);
  const top = all[0] ?? null;
  const groups = new Map<Group, Hit[]>();
  for (const h of all.slice(1)) groups.set(h.entry.group, [...(groups.get(h.entry.group) ?? []), h]);
  return { top, groups: [...groups.entries()].map(([group, hits]) => ({ group, hits })) };
}

/** With nothing typed: recent sessions, and a few places. */
function start(sessions: SessionSummary[], entries: Entry[], home?: string): Found {
  const f = frecency();
  const recent = sessions
    .filter((s) => !s.archived)
    .map((s) => ({ s, t: Math.max(f[s.key]?.t ?? 0, s.updatedAt ?? 0) + (f[s.key] ? Math.log2(1 + f[s.key].n) * 3600_000 : 0) }))
    .sort((a, b) => b.t - a.t)
    .slice(0, 5)
    .map(({ s }) => ({ entry: sessionEntry(s, home), score: 0 }));
  const pick = ['go:new', 'go:settings', 'sec:memory', 'go:usage', 'go:search-files'];
  const places = pick.map((id) => entries.find((e) => e.id === id)).filter((e): e is Entry => !!e);
  return { top: null, groups: [...(recent.length ? [{ group: 'Sessions' as Group, hits: recent }] : []), { group: 'Go to' as Group, hits: places.map((entry) => ({ entry, score: 0 })) }] };
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
  const listRef = useRef<HTMLDivElement>(null);
  // Beside the list, a preview of the one picked, where there is room.
  const wide = useMediaQuery('(min-width: 900px)') && !mobile;
  const close = () => usePalette.setState({ open: false });

  // Opening starts afresh, and fetches what changes.
  const base = useMemo(() => (open ? staticEntries() : []), [open]);
  useEffect(() => {
    if (!open) return;
    setQ('');
    setSel(0);
    setServer(null);
    setFiles([]);
    setMore(new Set());
    let alive = true;
    liveEntries().then((l) => alive && setLive(l));
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
        api<FindResponse>(`/api/find?q=${encodeURIComponent(term)}`, { signal: ctl.signal }).catch(() => null),
        term.length >= 2 && dir ? api<{ files: string[] }>(`/api/fs/find?root=${encodeURIComponent(dir)}&q=${encodeURIComponent(term)}`, { signal: ctl.signal }).catch(() => null) : Promise.resolve(null),
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
  }, [q, open]); // eslint-disable-line react-hooks/exhaustive-deps

  const found = useMemo<Found>(() => {
    if (!open) return { top: null, groups: [] };
    const list = Object.values(sessions);
    return q.trim() ? rank(q, entries, list, server, files, home) : start(list, entries, home);
  }, [open, q, entries, sessions, server, files, home]);

  // The rows, in order, for the keys: the best match, then each group's (and its "more").
  type Row = { kind: 'hit'; hit: Hit; group?: Group; first?: boolean } | { kind: 'more'; group: Group; n: number };
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    if (found.top) out.push({ kind: 'hit', hit: found.top });
    for (const g of found.groups) {
      const all = more.has(g.group) || !q.trim();
      const shown = all ? g.hits.slice(0, 30) : g.hits.slice(0, SHOWN);
      shown.forEach((hit, i) => out.push({ kind: 'hit', hit, group: g.group, first: i === 0 }));
      if (!all && g.hits.length > SHOWN) out.push({ kind: 'more', group: g.group, n: g.hits.length - SHOWN });
    }
    return out;
  }, [found, more, q]);

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
    r.hit.entry.run();
  };
  const current = rows[sel]?.kind === 'hit' ? (rows[sel] as { hit: Hit }).hit : null;

  return createPortal(
    <div
      className={cx('anim-overlay scrim fixed inset-0 z-[55] flex justify-center [--scrim:0.3]', mobile ? '' : 'px-3 pt-[11vh]')}
      onPointerDown={(e) => e.target === e.currentTarget && close()}
    >
      <div
        role="dialog"
        aria-label="Search"
        className={cx(
          'anim-pop flex flex-col overflow-hidden bg-elevated shadow-lg',
          mobile ? 'h-full w-full pt-[var(--safe-top)]' : cx('h-fit max-h-[72vh] w-full rounded-2xl border border-line', wide ? 'max-w-[860px]' : 'max-w-[640px]'),
        )}
      >
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search size={19} className="shrink-0 text-fg-3" />
          <input
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
                if (q) setQ('');
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
            placeholder="Search settings, sessions, templates, notes, files…"
            enterKeyHint="go"
            className="h-14 min-w-0 flex-1 bg-transparent text-[17px] outline-none placeholder:text-fg-3"
          />
          {busy && <Throbber className="text-fg-3" />}
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
              <div className="px-3 py-10 text-center text-[13.5px] text-fg-3">{busy ? 'Looking…' : q.trim() ? `Nothing found for “${q.trim()}”` : 'Type to search everything'}</div>
            )}
            {rows.map((r, i) => {
              const head = r.kind === 'hit' && (i === 0 && !r.group ? 'Best match' : r.first ? (!q.trim() && r.group === 'Sessions' ? 'Recent sessions' : !q.trim() && r.group === 'Go to' ? 'Suggestions' : r.group) : null);
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

/** More about the one picked: where it is, what it says, and where opening it goes. */
function Preview({ hit, q }: { hit: Hit | null; q: string }) {
  if (!hit) return <div className="hidden w-[45%] items-center justify-center p-6 text-center text-[13px] text-fg-3 md:flex">{q.trim() ? '' : 'Settings, sessions, templates, notes and files, all in one place'}</div>;
  const e = hit.entry;
  const facts = (e.facts ?? []).filter(([, v]) => v);
  return (
    <div className="flex w-[45%] min-w-0 flex-col gap-3 overflow-y-auto p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-bg-2 text-fg-2 [&_svg]:h-5 [&_svg]:w-5">{e.icon}</span>
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
