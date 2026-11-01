// Search on the Files page: one field finds files by their names and the text inside them, everywhere under a
// folder. Where to search is a chip: the folder open in Files, home, a space's folder, a pinned folder, one
// sessions worked in, or any folder found by name or typed as a path. Beside it, which kinds of files
// (code, notes, data… or names like *.md), and whether hidden files count. Everything is in the page's
// address, so Back and a reload keep the search.
import { useEffect, useMemo, useRef, useState } from 'react';
import { CaseSensitive, ChevronDown, Ellipsis, Eye, Folder, House, Regex, Search, X } from 'lucide-react';
import { FolderFinder } from '../../components/FolderPicker';
import { cx, IconButton, MenuItem, MenuSep, Popover, Throbber, useIsMobile } from '../../components/ui';
import { api } from '../../lib/api';
import { basename, dirname, tildify } from '../../lib/format';
import { go } from '../../lib/nav';
import { useApp } from '../../lib/store';
import { FileIcon } from '../documents/fileTypes';
import { itemOf, type Item } from './actions';
import { ItemMenu, useFolderLead } from './ItemMenu';

interface Match {
  path: string;
  line: number;
  text: string;
  ranges: [number, number][];
}

/** Kinds of files to search, as the names they have. */
const KINDS: [string, string, string][] = [
  ['', 'All kinds of files', ''],
  ['text', 'Text and notes', '*.md,*.markdown,*.mdx,*.txt,*.text,*.rst,*.org,*.tex,*.log'],
  [
    'code',
    'Code',
    '*.ts,*.tsx,*.js,*.jsx,*.mjs,*.cjs,*.py,*.rs,*.go,*.java,*.kt,*.swift,*.c,*.h,*.cc,*.cpp,*.hpp,*.cs,*.rb,*.php,*.sh,*.lua,*.r,*.jl,*.sql,*.css,*.scss,*.vue,*.svelte,*.dart,*.zig,*.ex,*.exs',
  ],
  ['data', 'Data and settings', '*.json,*.jsonl,*.csv,*.tsv,*.yaml,*.yml,*.toml,*.xml,*.ini,*.cfg,*.conf'],
  ['web', 'Web pages', '*.html,*.htm,*.css,*.svg'],
  ['notebooks', 'Notebooks', '*.ipynb'],
];

export interface SearchQuery {
  q: string;
  /** The folder searched. */
  in: string;
  kind: string;
  /** Names like these instead of a kind (*.md, !dist/**). */
  only: string;
  case: boolean;
  regex: boolean;
  hidden: boolean;
}

export function searchFromUrl(params: URLSearchParams, fallback: string): SearchQuery {
  return {
    q: params.get('q') ?? '',
    in: params.get('in') || fallback,
    kind: params.get('kind') ?? '',
    only: params.get('only') ?? '',
    case: params.get('case') === '1',
    regex: params.get('regex') === '1',
    hidden: params.get('hidden') === '1',
  };
}

export const searchUrl = (s: Partial<SearchQuery> & { in: string }) => {
  const p = new URLSearchParams({ q: s.q ?? '', in: s.in });
  if (s.kind) p.set('kind', s.kind);
  if (s.only) p.set('only', s.only);
  if (s.case) p.set('case', '1');
  if (s.regex) p.set('regex', '1');
  if (s.hidden) p.set('hidden', '1');
  return `/search?${p}`;
};

function Highlight({ text, ranges }: { text: string; ranges: [number, number][] }) {
  const parts: { t: string; hit: boolean }[] = [];
  let pos = 0;
  for (const [a, b] of ranges) {
    if (a > pos) parts.push({ t: text.slice(pos, a), hit: false });
    parts.push({ t: text.slice(a, b), hit: true });
    pos = b;
  }
  parts.push({ t: text.slice(pos), hit: false });
  // Long leading whitespace goes, so the match stays in sight.
  const lead = parts[0]?.t.match(/^\s+/)?.[0].length ?? 0;
  if (lead) parts[0] = { ...parts[0], t: parts[0].t.slice(lead) };
  return (
    <>
      {parts.map((p, i) =>
        p.hit ? (
          <mark key={i} className="rounded-sm bg-accent/30 text-fg">
            {p.t}
          </mark>
        ) : (
          <span key={i}>{p.t}</span>
        ),
      )}
    </>
  );
}

/** A chip under the field: what it is set to, and a menu. */
function Chip({
  icon,
  label,
  on,
  open,
  onClick,
  chipRef,
  title,
  own,
}: {
  icon: React.ReactNode;
  label: string;
  /** A name of the user's (a folder's): left as it is in any language. */
  own?: boolean;
  on?: boolean;
  open?: boolean;
  onClick: () => void;
  chipRef?: React.Ref<HTMLButtonElement>;
  title?: string;
}) {
  return (
    <button
      ref={chipRef}
      type="button"
      title={title}
      onClick={onClick}
      aria-expanded={open}
      className={cx(
        'inline-flex h-8 max-w-[min(100%,20rem)] min-w-0 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-[13px] transition-colors max-md:h-9',
        on ? 'border-accent/40 bg-accent-soft text-fg' : 'border-line bg-bg-1 text-fg-2 hover:bg-bg-2 hover:text-fg',
        open && 'bg-bg-2',
      )}
    >
      <span className="flex shrink-0 text-fg-3">{icon}</span>
      <span translate={own ? 'no' : undefined} className="truncate">
        {label}
      </span>
      <ChevronDown size={12} className="shrink-0 text-fg-3" />
    </button>
  );
}

export function SearchView({ query, onFile }: { query: SearchQuery; onFile: (path: string, line?: number) => void }) {
  const home = useApp((s) => s.boot?.home) ?? '';
  const mobile = useIsMobile();
  const [text, setText] = useState(query.q);
  const [where, setWhere] = useState(false);
  const [kinds, setKinds] = useState(false);
  const [only, setOnly] = useState(query.only);
  const [names, setNames] = useState<string[] | null>(null);
  const [res, setRes] = useState<{ matches: Match[]; truncated: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState<{ item: Item; el: HTMLElement } | null>(null);
  const whereRef = useRef<HTMLButtonElement>(null);
  const kindRef = useRef<HTMLButtonElement>(null);
  const menuAnchor = useRef<HTMLElement | null>(null);
  const set = (p: Partial<SearchQuery>) => go(searchUrl({ ...query, ...p }), true);
  const lead = useFolderLead((p) => (setWhere(false), set({ in: p })), query.in);
  useEffect(() => setText(query.q), [query.q]);
  // Typing settles for a moment before the address (and so the search) follows.
  useEffect(() => {
    if (text === query.q) return;
    const t = setTimeout(() => set({ q: text }), 250);
    return () => clearTimeout(t);
  }, [text]);

  const glob = query.only || KINDS.find(([k]) => k === query.kind)?.[2] || '';
  useEffect(() => {
    const q = query.q.trim();
    setNames(null);
    setRes(null);
    if (!q) return;
    const ctl = new AbortController();
    setBusy(true);
    const p = new URLSearchParams({ root: query.in, q, regex: query.regex ? '1' : '0', case: query.case ? '1' : '0', glob, hidden: query.hidden ? '1' : '0' });
    const inside = api<{ matches: Match[]; truncated: boolean }>(`/api/fs/search?${p}`, { signal: ctl.signal }).then(setRes, () => {});
    // Names: those holding what is typed (the finder also matches letters spread through a path).
    const lower = q.toLowerCase();
    const named = query.regex
      ? Promise.resolve(setNames([]))
      : api<{ files: string[] }>(`/api/fs/find?root=${encodeURIComponent(query.in)}&q=${encodeURIComponent(q)}`, { signal: ctl.signal }).then(
          (r) =>
            setNames(
              r.files
                .filter(
                  (f) =>
                    basename(f).toLowerCase().includes(lower) &&
                    (query.hidden ||
                      !f
                        .slice(query.in.length)
                        .split('/')
                        .some((x) => x.startsWith('.'))),
                )
                .slice(0, 30),
            ),
          () => {},
        );
    void Promise.all([inside, named]).finally(() => !ctl.signal.aborted && setBusy(false));
    return () => ctl.abort();
  }, [query.q, query.in, query.regex, query.case, glob, query.hidden]);

  const groups = useMemo(() => {
    const m = new Map<string, Match[]>();
    for (const x of res?.matches ?? []) m.set(x.path, [...(m.get(x.path) ?? []), x]);
    return [...m.entries()];
  }, [res]);
  // How many lines matched: 1000+ when the search stopped there.
  const found = `${res?.matches.length ?? 0}${res?.truncated ? '+' : ''}`;
  const rel = (p: string) => (p.startsWith(`${query.in}/`) ? p.slice(query.in.length + 1) : tildify(p, home));
  const whereName = query.in === home ? 'Home folder' : basename(query.in) || query.in;
  const kindName = query.only ? `Names like ${query.only}` : (KINDS.find(([k]) => k === query.kind)?.[1] ?? 'All kinds of files');
  const showMenu = (path: string, el: HTMLElement) => {
    menuAnchor.current = el;
    setMenu({ item: itemOf(path), el });
  };
  const more = (path: string) => (
    <button
      type="button"
      aria-label={`More for ${basename(path)}`}
      onClick={(e) => {
        e.stopPropagation();
        showMenu(path, e.currentTarget);
      }}
      className="flex size-7 shrink-0 items-center justify-center rounded-md text-fg-3 opacity-0 group-hover:opacity-100 hover:bg-bg-3 hover:text-fg max-md:size-9 max-md:opacity-100"
    >
      <Ellipsis size={15} />
    </button>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 space-y-2 border-b border-line px-3 pt-3 pb-2.5 sm:px-4">
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-3" />
          <input
            autoFocus={!mobile || !query.q}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && set({ q: text })}
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
            enterKeyHint="search"
            placeholder="Search names and the text inside files"
            aria-label="Search names and the text inside files"
            className="h-10 w-full rounded-xl border border-line-2 bg-bg-1 pr-[5.5rem] pl-9 text-[14px] outline-none placeholder:text-fg-3 focus:border-accent/60 max-md:h-11 max-md:text-[15.5px]"
          />
          <div className="absolute top-1/2 right-1.5 flex -translate-y-1/2 items-center">
            {text && (
              <IconButton label="Clear" size="sm" onClick={() => setText('')}>
                <X size={14} />
              </IconButton>
            )}
            <IconButton label="Match case" size="sm" active={query.case} onClick={() => set({ case: !query.case })}>
              <CaseSensitive size={15} />
            </IconButton>
            <IconButton label="Regular expression" size="sm" active={query.regex} onClick={() => set({ regex: !query.regex })}>
              <Regex size={14} />
            </IconButton>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[12.5px] text-fg-3">In</span>
          <Chip
            chipRef={whereRef}
            icon={query.in === home ? <House size={14} /> : <Folder size={14} />}
            label={whereName}
            own={query.in !== home}
            title={`Where to search: ${tildify(query.in, home)}`}
            open={where}
            onClick={() => setWhere((o) => !o)}
          />
          <Chip chipRef={kindRef} icon={<Search size={13} />} label={kindName} on={!!(query.kind || query.only)} open={kinds} onClick={() => setKinds((o) => !o)} />
          <button
            type="button"
            aria-pressed={query.hidden}
            onClick={() => set({ hidden: !query.hidden })}
            className={cx(
              'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-[13px] transition-colors max-md:h-9',
              query.hidden ? 'border-accent/40 bg-accent-soft text-fg' : 'border-line bg-bg-1 text-fg-2 hover:bg-bg-2 hover:text-fg',
            )}
          >
            <Eye size={14} className="text-fg-3" />
            Hidden files too
          </button>
        </div>
        <Popover anchor={whereRef} open={where} onClose={() => setWhere(false)} width={340} title="Where to search">
          <FolderFinder
            value={query.in}
            onPick={(p) => (setWhere(false), set({ in: p }))}
            lead={lead}
            more={
              query.in !== home ? [{ key: 'home', icon: <House size={15} />, name: 'Home folder', where: 'everything of yours', pick: () => (setWhere(false), set({ in: home })), path: home }] : []
            }
            recent={4}
            autoFocus={!mobile}
            anchor={whereRef}
          />
        </Popover>
        <Popover anchor={kindRef} open={kinds} onClose={() => setKinds(false)} width={290} title="Which files">
          {KINDS.map(([k, label]) => (
            <MenuItem key={k} checked={!query.only && query.kind === k} onClick={() => (setKinds(false), setOnly(''), set({ kind: k, only: '' }))}>
              {label}
            </MenuItem>
          ))}
          <MenuSep />
          <div className="px-1.5 pt-0.5 pb-1">
            <div className="mb-1 px-1 text-[12px] text-fg-3">Or names like these (! leaves out)</div>
            <input
              value={only}
              onChange={(e) => setOnly(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (setKinds(false), set({ only: only.trim(), kind: '' }))}
              placeholder="*.md, *.py, !dist/**"
              aria-label="Names like these"
              spellCheck={false}
              autoCapitalize="none"
              className="h-8.5 w-full rounded-lg bg-bg-2 px-2.5 font-mono text-[12.5px] outline-none placeholder:text-fg-3 max-sm:h-11 max-sm:text-[15px]"
            />
          </div>
        </Popover>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pb-8">
        {!query.q.trim() ? (
          <div className="mx-auto max-w-md px-6 py-12 text-center text-[13.5px] leading-relaxed text-fg-3">
            <Search size={22} className="mx-auto mb-3 text-fg-3" />
            Type a word to find files by their names and by the text inside them, everywhere in{' '}
            <span translate={query.in === home ? undefined : 'no'} className="font-medium text-fg-2">
              {whereName}
            </span>
            . To search somewhere else, change{' '}
            <button type="button" onClick={() => setWhere(true)} className="font-medium text-accent hover:underline">
              where to search
            </button>
            .
          </div>
        ) : (
          <>
            {busy && !res && !names && (
              <div className="flex justify-center py-8 text-fg-3">
                <Throbber />
              </div>
            )}
            {!!names?.length && (
              <section className="pt-2">
                <div className="px-4 pb-1 text-[11.5px] font-medium text-fg-3">{names.length === 1 ? 'A file by that name' : `Files by that name · ${names.length}`}</div>
                {names.map((p) => (
                  <div key={p} onClick={() => onFile(p)} className="group flex h-9 cursor-pointer items-center gap-2.5 px-4 hover:bg-bg-2 max-md:h-12">
                    <FileIcon path={p} size={20} className="rounded-md" />
                    <span translate="no" className="min-w-0 shrink-0 truncate text-[13.5px] max-md:max-w-[55%]">
                      {basename(p)}
                    </span>
                    <span translate="no" className="min-w-0 flex-1 truncate text-[12px] text-fg-3">
                      {dirname(rel(p)) === '.' || !rel(p).includes('/') ? '' : dirname(rel(p))}
                    </span>
                    {more(p)}
                  </div>
                ))}
              </section>
            )}
            {res && (
              <section className="pt-2">
                <div className="px-4 pb-1 text-[11.5px] font-medium text-fg-3">
                  {!res.matches.length ? 'Inside files: nothing' : groups.length === 1 ? `Inside files · ${found} in 1 file` : `Inside files · ${found} in ${groups.length} files`}
                </div>
                {groups.map(([p, ms]) => (
                  <div key={p} className="mb-1">
                    <div onClick={() => onFile(p)} className="group flex h-8 cursor-pointer items-center gap-2.5 px-4 hover:bg-bg-2 max-md:h-11">
                      <FileIcon path={p} size={18} className="rounded-md" />
                      <span translate="no" className="shrink-0 truncate text-[13px] font-medium">
                        {basename(p)}
                      </span>
                      <span translate="no" className="min-w-0 flex-1 truncate text-[12px] text-fg-3">
                        {rel(p).includes('/') ? dirname(rel(p)) : ''}
                      </span>
                      <span className="tnum shrink-0 rounded bg-bg-3 px-1.5 text-[11px] text-fg-2">{ms.length}</span>
                      {more(p)}
                    </div>
                    {ms.slice(0, 30).map((m, i) => (
                      <button key={i} type="button" onClick={() => onFile(p, m.line)} className="flex w-full gap-2 py-0.5 pr-4 pl-11 text-left hover:bg-bg-2 max-md:py-1.5">
                        <span className="tnum w-9 shrink-0 text-right font-mono text-[11px] leading-5 text-fg-3">{m.line}</span>
                        <span translate="no" className="min-w-0 truncate font-mono text-[12px] leading-5 text-fg-2">
                          <Highlight text={m.text} ranges={m.ranges} />
                        </span>
                      </button>
                    ))}
                  </div>
                ))}
                {res.truncated && <div className="px-4 py-2 text-[12px] text-fg-3">Showing the first {res.matches.length} matches: add words, or search a smaller folder.</div>}
              </section>
            )}
            {res && names && (
              <div className="mx-4 mt-4 rounded-lg bg-bg-2 px-3 py-2 text-[12.5px] leading-relaxed text-fg-3">
                PDF, Word and other documents are found here by their names, not by the text inside them. For agents to search inside them, add them to{' '}
                <button type="button" onClick={() => go('/knowledge')} className="font-medium text-accent hover:underline">
                  knowledge
                </button>
                .
              </div>
            )}
          </>
        )}
      </div>
      <ItemMenu items={menu ? [menu.item] : []} anchor={menuAnchor} open={!!menu} onClose={() => setMenu(null)} onOpen={(it) => onFile(it.path)} showFolder />
    </div>
  );
}
