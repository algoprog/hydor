// Ctrl+K: one box to reach anything. Sessions (the ones you open most and lately first), actions
// (start a ">" to see only those) and, as you type, messages that contain the words.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { create } from 'zustand';
import { Activity, CircleHelp, CornerDownLeft, FileSearch, FolderTree, Gauge, GitBranch, MessageSquareText, Moon, Palette, PanelLeft, Search, Settings, SquarePen, SquareTerminal, TrendingUp } from 'lucide-react';
import { startTour } from '../tour/Tour';
import type { SearchHit, SessionSummary } from '@shared/types';
import { api } from '../../lib/api';
import { markRuns, timeAgo } from '../../lib/format';
import { go, openSession } from '../../lib/nav';
import { useApp, useSessions, useUI } from '../../lib/store';
import { allThemes, applyTheme, pickTheme } from '../../lib/theme';
import { AgentIcon } from '../../components/AgentIcon';
import { cx, Dots } from '../../components/ui';
import { folderName } from '../sessions/SessionList';

export const usePalette = create<{ open: boolean }>(() => ({ open: false }));
export const openPalette = () => usePalette.setState({ open: true });

const FRECENCY = 'wa.frecency';

/** How often and how lately each session was opened, to rank sessions in the palette. */
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

interface Item {
  id: string;
  group: 'Sessions' | 'Actions' | 'In messages';
  icon: ReactNode;
  label: ReactNode;
  hint?: ReactNode;
  run: () => void;
}

function actions(): (Omit<Item, 'group'> & { words: string })[] {
  const ui = useUI.getState();
  return [
    { id: 'new', icon: <SquarePen size={15} />, label: 'New session', words: 'new session start claude codex', run: () => go('/') },
    { id: 'files', icon: <FolderTree size={15} />, label: 'Files', words: 'files explorer browse', run: () => go('/files') },
    { id: 'find-file', icon: <FileSearch size={15} />, label: 'Search in files', words: 'search grep find files text', run: () => go('/search') },
    { id: 'git', icon: <GitBranch size={15} />, label: 'Git', words: 'git repositories push pull', run: () => go('/git') },
    { id: 'terminal', icon: <SquareTerminal size={15} />, label: 'Terminal', words: 'terminal shell console', run: () => go('/terminal') },
    { id: 'usage', icon: <Gauge size={15} />, label: 'Usage and limits', words: 'usage limits plan reset', run: () => go('/usage') },
    { id: 'activity', icon: <TrendingUp size={15} />, label: 'Activity', words: 'activity stats tokens throughput', run: () => go('/stats') },
    { id: 'system', icon: <Activity size={15} />, label: 'System', words: 'system cpu gpu memory processes kernels', run: () => go('/system') },
    { id: 'settings', icon: <Settings size={15} />, label: 'Settings', words: 'settings preferences theme', run: () => go('/settings') },
    { id: 'tour', icon: <CircleHelp size={15} />, label: 'Take the tour', words: 'help tour guide welcome onboarding', run: () => startTour() },
    { id: 'notifications', icon: <Settings size={15} />, label: 'Settings: Notifications', words: 'notifications push sound', run: () => go('/settings?s=notifications') },
    { id: 'accounts', icon: <Settings size={15} />, label: 'Settings: Accounts', words: 'accounts sign in login claude codex', run: () => go('/settings?s=accounts') },
    { id: 'instructions', icon: <Settings size={15} />, label: 'Settings: Instructions (CLAUDE.md / AGENTS.md)', words: 'instructions claude.md agents.md', run: () => go('/settings?s=instructions') },
    { id: 'mcp', icon: <Settings size={15} />, label: 'Settings: MCP servers', words: 'mcp servers tools', run: () => go('/settings?s=mcp') },
    { id: 'skills', icon: <Settings size={15} />, label: 'Settings: Skills', words: 'skills', run: () => go('/settings?s=skills') },
    { id: 'plugins', icon: <Settings size={15} />, label: 'Settings: Plugins', words: 'plugins marketplace', run: () => go('/settings?s=plugins') },
    { id: 'password', icon: <Settings size={15} />, label: 'Settings: Password', words: 'password sign out logout security', run: () => go('/settings?s=security') },
    {
      id: 'theme',
      icon: <Moon size={15} />,
      label: `Switch to ${ui.theme === 'light' ? 'dark' : 'light'} theme`,
      words: 'theme dark light appearance',
      run: () => {
        const t = useUI.getState().theme === 'light' ? 'dark' : 'light';
        useUI.getState().set({ theme: t });
        applyTheme();
      },
    },
    ...allThemes().map((t) => ({ id: `theme:${t.id}`, icon: <Palette size={15} />, label: `Theme: ${t.name}`, words: `theme appearance colours colors ${t.base}`, run: () => pickTheme(t) })),
    { id: 'sidebar', icon: <PanelLeft size={15} />, label: 'Show or hide the sidebar', hint: 'Ctrl+B', words: 'sidebar toggle', run: () => useUI.getState().set({ sideOpen: !useUI.getState().sideOpen }) },
    { id: 'panel', icon: <SquareTerminal size={15} />, label: 'Show or hide the terminal panel', hint: 'Ctrl+`', words: 'terminal panel toggle', run: () => useUI.getState().set({ panelOpen: !useUI.getState().panelOpen }) },
  ];
}

const matches = (hay: string, words: string[]) => words.every((w) => hay.includes(w));

function sessionItems(list: SessionSummary[], words: string[], home: string | undefined): Item[] {
  const f = frecency();
  const now = Date.now();
  const score = (s: SessionSummary) => {
    const fr = f[s.key];
    // Opened often and lately counts most; otherwise recent activity.
    const used = fr ? Math.log2(1 + fr.n) * Math.exp(-(now - fr.t) / (7 * 86400_000)) : 0;
    return used * 10 + Math.exp(-(now - (s.updatedAt ?? 0)) / (3 * 86400_000));
  };
  return list
    .filter((s) => !s.archived && (!words.length || matches(`${s.title} ${s.cwd ?? ''} ${s.gitBranch ?? ''} ${s.agent}`.toLowerCase(), words)))
    .sort((a, b) => score(b) - score(a))
    .slice(0, words.length ? 8 : 6)
    .map((s) => ({
      id: `s:${s.key}`,
      group: 'Sessions' as const,
      icon: <AgentIcon agent={s.agent} name={s.acpName} size={15} />,
      label: s.title,
      hint: `${folderName(s.cwd, home)} · ${timeAgo(s.updatedAt)}`,
      run: () => openSession(s.key),
    }));
}

export function CommandPalette() {
  const open = usePalette((s) => s.open);
  const sessions = useSessions((s) => s.byKey);
  const home = useApp((s) => s.boot?.home);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const close = () => usePalette.setState({ open: false });

  useEffect(() => {
    if (!open) return;
    setQ('');
    setSel(0);
    setHits(null);
  }, [open]);

  const onlyActions = q.startsWith('>');
  const words = (onlyActions ? q.slice(1) : q).toLowerCase().split(/\s+/).filter(Boolean);

  // Messages that contain the words, once there is something to look for.
  useEffect(() => {
    if (!open || onlyActions || q.trim().length < 3) return setHits(null);
    const ctl = new AbortController();
    const t = setTimeout(() => {
      api<{ hits: SearchHit[] }>(`/api/search?q=${encodeURIComponent(q.trim())}`, { signal: ctl.signal })
        .then((r) => setHits(r.hits.filter((h) => h.snippet).slice(0, 8)))
        .catch(() => {});
    }, 200);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q, open, onlyActions]);

  const items = useMemo<Item[]>(() => {
    if (!open) return [];
    const acts = actions()
      .filter((a) => !words.length || matches(`${a.words} ${typeof a.label === 'string' ? a.label.toLowerCase() : ''}`, words))
      .map((a) => ({ ...a, group: 'Actions' as const }));
    if (onlyActions) return acts;
    const ss = sessionItems(Object.values(sessions), words, home);
    const ms: Item[] = (hits ?? []).map((h) => ({
      id: `m:${h.key}:${h.ts ?? h.kind}`,
      group: 'In messages' as const,
      icon: <MessageSquareText size={15} />,
      label: (
        <span className="line-clamp-1">
          {markRuns(h.snippet).map((r, i) =>
            r.hit ? (
              <mark key={i} className="rounded bg-accent/20 px-0.5 text-fg">
                {r.text}
              </mark>
            ) : (
              <span key={i}>{r.text}</span>
            ),
          )}
        </span>
      ),
      hint: h.title,
      run: () => openSession(h.key),
    }));
    return [...ss, ...(words.length ? acts : acts.slice(0, 5)), ...ms];
  }, [open, q, sessions, hits, home]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => setSel((v) => Math.min(v, Math.max(0, items.length - 1))), [items.length]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-i="${sel}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  if (!open) return null;
  const pick = (i: number) => {
    const it = items[i];
    if (!it) return;
    close();
    it.run();
  };
  let lastGroup = '';
  return createPortal(
    <div className="anim-overlay fixed inset-0 z-[55] flex justify-center bg-black/35 px-3 pt-[12vh]" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div role="dialog" aria-label="Command palette" className="anim-pop flex h-fit max-h-[70vh] w-full max-w-[620px] flex-col overflow-hidden rounded-2xl border border-line bg-elevated shadow-lg">
        <div className="flex items-center gap-2.5 border-b border-line px-4">
          <Search size={16} className="shrink-0 text-fg-3" />
          <input
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setSel(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') close();
              else if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSel((v) => Math.min(v + 1, items.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSel((v) => Math.max(v - 1, 0));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                pick(sel);
              }
            }}
            placeholder="Sessions, actions and messages… (> for actions only)"
            className="h-12 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-fg-3"
          />
          {hits === null && q.trim().length >= 3 && !onlyActions && <Dots className="text-fg-3" />}
        </div>
        <div ref={listRef} className="min-h-0 overflow-y-auto p-1.5">
          {!items.length && <div className="px-3 py-6 text-center text-[13px] text-fg-3">Nothing matches.</div>}
          {items.map((it, i) => {
            const head = it.group !== lastGroup;
            lastGroup = it.group;
            return (
              <div key={it.id}>
                {head && <div className="px-2.5 pt-2 pb-1 text-[11.5px] font-medium text-fg-3">{!q && it.group === 'Sessions' ? 'Recent sessions' : it.group}</div>}
                <button
                  data-i={i}
                  onMouseMove={() => sel !== i && setSel(i)}
                  onClick={() => pick(i)}
                  className={cx('flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13.5px] transition-colors', i === sel ? 'bg-bg-2 text-fg' : 'text-fg-2')}
                >
                  <span className="flex w-4 shrink-0 justify-center text-fg-3">{it.icon}</span>
                  <span className="min-w-0 flex-1 truncate">{it.label}</span>
                  {it.hint && <span className="max-w-[45%] shrink-0 truncate text-[11.5px] text-fg-3">{it.hint}</span>}
                  {i === sel && <CornerDownLeft size={12} className="shrink-0 text-fg-3" />}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}
