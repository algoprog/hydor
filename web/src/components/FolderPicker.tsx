import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Folder, FolderOpen, History } from 'lucide-react';
import type { DirEntry } from '@shared/types';
import { api } from '../lib/api';
import { basename, dirname, tildify } from '../lib/format';
import { useApp } from '../lib/store';
import { cx, Popover } from './ui';

/** Path input with recent folders and subfolder suggestions as you type. */
export function FolderPicker({ value, onChange, onPick, autoFocus }: { value: string; onChange: (v: string) => void; onPick?: (path: string) => void; autoFocus?: boolean }) {
  const home = useApp((s) => s.boot?.home) ?? '';
  const ref = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [dirs, setDirs] = useState<DirEntry[]>([]);
  const [sel, setSel] = useState(0);
  // Enter uses the typed path unless the arrows picked a suggestion.
  const [moved, setMoved] = useState(false);
  useEffect(() => {
    api<{ dirs: string[] }>('/api/fs/recent')
      .then((r) => setRecent(r.dirs))
      .catch(() => {});
  }, []);
  const expanded = value.startsWith('~') ? home + value.slice(1) : value;
  const base = expanded.endsWith('/') ? expanded : dirname(expanded);
  const partial = expanded.endsWith('/') ? '' : expanded.slice(base.length + (base === '/' ? 0 : 1));
  useEffect(() => {
    if (!open || !base) return;
    const ctl = new AbortController();
    api<{ entries: { name: string; path: string; type: string; dirLink?: boolean }[] }>(`/api/fs/list?dirs=1&path=${encodeURIComponent(base)}`, { signal: ctl.signal })
      .then((r) => setDirs(r.entries.map((e) => ({ name: e.name, path: e.path }))))
      .catch(() => setDirs([]));
    return () => ctl.abort();
  }, [base, open]);
  const sub = dirs.filter((d) => !partial || d.name.toLowerCase().startsWith(partial.toLowerCase())).slice(0, 40);
  const rec = recent.filter((r) => !value || r.toLowerCase().includes(expanded.toLowerCase()) || r === expanded).slice(0, 8);
  const options = [...sub.map((d) => ({ path: d.path, kind: 'dir' as const })), ...rec.filter((r) => !sub.some((d) => d.path === r)).map((r) => ({ path: r, kind: 'recent' as const }))];
  const choose = (p: string, descend = false) => {
    onChange(tildify(p, home) + (descend ? '/' : ''));
    setSel(0);
    setMoved(false);
    ref.current?.focus();
  };
  return (
    <>
      <div className="relative">
        <Folder size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-3" />
        <input
          ref={ref}
          autoFocus={autoFocus}
          value={value}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
            setSel(0);
            setMoved(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setMoved(true);
              setSel((s) => Math.min(s + 1, options.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setMoved(true);
              setSel((s) => Math.max(s - 1, 0));
            } else if (e.key === 'Tab' && open && options[sel]) {
              e.preventDefault();
              choose(options[sel].path, true);
            } else if (e.key === 'Enter') {
              e.preventDefault();
              if (open && options[sel] && (moved || !onPick)) choose(options[sel].path);
              else onPick?.(expanded.replace(/\/+$/, '') || '/');
            } else if (e.key === 'Escape') setOpen(false);
          }}
          spellCheck={false}
          placeholder="~/project"
          className="h-9.5 w-full rounded-[10px] border border-line-2 bg-bg-1 pr-3 pl-9 font-mono text-[13px] outline-none focus:border-accent/60 focus:ring-3 focus:ring-accent/15"
        />
      </div>
      <Popover anchor={ref} open={open && options.length > 0} onClose={() => setOpen(false)} width={Math.max(ref.current?.offsetWidth ?? 0, 320)}>
        {options.map((o, i) => (
          <button
            key={o.kind + o.path}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => (onPick && o.kind === 'recent' ? onPick(o.path) : choose(o.path, o.kind === 'dir'))}
            className={cx('flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[13px]', i === sel ? 'bg-bg-2' : 'hover:bg-bg-2')}
          >
            {o.kind === 'recent' ? <History size={14} className="shrink-0 text-fg-3" /> : <Folder size={14} className="shrink-0 text-fg-3" />}
            <span className="min-w-0 flex-1 truncate font-mono text-[12.5px]">{tildify(o.path, home)}</span>
            {o.kind === 'recent' && <span className="text-[11px] text-fg-3">recent</span>}
          </button>
        ))}
      </Popover>
    </>
  );
}

/** "📁 naget-agent ▾": the folder a new session will work in; opens a picker. */
export function FolderChip({ value, onChange }: { value: string; onChange: (path: string) => void }) {
  const home = useApp((s) => s.boot?.home) ?? '';
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const name = value === home ? '~' : basename(value) || '/';
  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={() => {
          setDraft(tildify(value, home));
          setOpen((o) => !o);
        }}
        title={tildify(value, home)}
        className={cx('inline-flex h-8 max-w-[16rem] min-w-0 items-center gap-1.5 rounded-lg px-2.5 text-[13px] text-fg-2 transition-colors hover:bg-bg-2 hover:text-fg', open && 'bg-bg-2 text-fg')}
      >
        <FolderOpen size={15} className="shrink-0 text-fg-3" />
        <span className="truncate font-medium">{name}</span>
        <ChevronDown size={13} className="shrink-0 opacity-60" />
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={420}>
        <div className="p-2">
          <div className="mb-2 px-0.5 text-[12.5px] text-fg-3">Folder to work in</div>
          <FolderPicker
            value={draft}
            onChange={setDraft}
            onPick={(p) => {
              onChange(p);
              setOpen(false);
            }}
            autoFocus
          />
          <div className="mt-2 flex justify-end">
            <button
              className="h-8 rounded-lg bg-fg px-3 text-[13px] font-medium text-bg hover:opacity-90"
              onClick={() => {
                const v = draft.startsWith('~') ? home + draft.slice(1) : draft;
                onChange(v.replace(/\/+$/, '') || '/');
                setOpen(false);
              }}
            >
              Use this folder
            </button>
          </div>
        </div>
      </Popover>
    </>
  );
}
