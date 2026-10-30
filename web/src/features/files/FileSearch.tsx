import { useEffect, useMemo, useRef, useState } from 'react';
import { CaseSensitive, File, Regex, Search } from 'lucide-react';
import { api } from '../../lib/api';
import { basename, dirname, tildify } from '../../lib/format';
import { openFile } from '../../lib/nav';
import { useApp, useUI } from '../../lib/store';
import { cx, Dialog, Dots, IconButton } from '../../components/ui';

interface Match {
  path: string;
  line: number;
  text: string;
  ranges: [number, number][];
}

function Highlight({ text, ranges }: { text: string; ranges: [number, number][] }) {
  const parts: { t: string; hit: boolean }[] = [];
  let pos = 0;
  for (const [a, b] of ranges) {
    if (a > pos) parts.push({ t: text.slice(pos, a), hit: false });
    parts.push({ t: text.slice(a, b), hit: true });
    pos = b;
  }
  parts.push({ t: text.slice(pos), hit: false });
  // Trim long leading whitespace so the match stays visible.
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

export function FileSearchPanel() {
  const boot = useApp((s) => s.boot);
  const root = useUI((s) => s.explorerRoot) ?? boot?.defaultCwd ?? '/';
  const [q, setQ] = useState('');
  const [regex, setRegex] = useState(false);
  const [cs, setCs] = useState(false);
  const [glob, setGlob] = useState('');
  const [res, setRes] = useState<{ matches: Match[]; truncated: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!q.trim()) return setRes(null);
    const ctl = new AbortController();
    const t = setTimeout(() => {
      setBusy(true);
      const p = new URLSearchParams({ root, q, regex: regex ? '1' : '0', case: cs ? '1' : '0', glob });
      api<{ matches: Match[]; truncated: boolean }>(`/api/fs/search?${p}`, { signal: ctl.signal })
        .then(setRes)
        .catch(() => {})
        .finally(() => setBusy(false));
    }, 250);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q, regex, cs, glob, root]);
  const groups = useMemo(() => {
    const m = new Map<string, Match[]>();
    for (const x of res?.matches ?? []) {
      const l = m.get(x.path) ?? [];
      l.push(x);
      m.set(x.path, l);
    }
    return [...m.entries()];
  }, [res]);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-1.5 px-3 pt-3 pb-2">
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-fg-3" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search in files"
            className="h-8 w-full rounded-lg border border-line bg-bg-1 pr-16 pl-8 text-[13px] outline-none focus:border-accent/60"
          />
          <div className="absolute top-1/2 right-1 flex -translate-y-1/2">
            <IconButton label="Match case" size="sm" active={cs} onClick={() => setCs((v) => !v)}>
              <CaseSensitive size={14} />
            </IconButton>
            <IconButton label="Regular expression" size="sm" active={regex} onClick={() => setRegex((v) => !v)}>
              <Regex size={13} />
            </IconButton>
          </div>
        </div>
        <input
          value={glob}
          onChange={(e) => setGlob(e.target.value)}
          placeholder="Files to include, e.g. *.ts, !dist/**"
          className="h-7 w-full rounded-md border border-line bg-bg-1 px-2.5 text-[12px] outline-none focus:border-accent/60"
        />
        <div className="truncate text-[11px] text-fg-3">in {tildify(root, boot?.home)}</div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pb-4">
        {busy && !res && (
          <div className="flex justify-center py-6 text-fg-3">
            <Dots />
          </div>
        )}
        {res && !res.matches.length && <div className="px-4 py-6 text-center text-[12.5px] text-fg-3">No results</div>}
        {groups.map(([p, ms]) => (
          <div key={p} className="mb-1">
            <button onClick={() => openFile(p)} className="flex w-full items-center gap-1.5 px-3 py-1 text-left hover:bg-bg-2">
              <File size={13} className="shrink-0 text-fg-3" />
              <span className="truncate text-[12.5px] font-medium">{basename(p)}</span>
              <span className="min-w-0 truncate text-[11px] text-fg-3">{tildify(dirname(p), boot?.home)}</span>
              <span className="ml-auto shrink-0 rounded bg-bg-3 px-1 text-[10.5px] text-fg-2">{ms.length}</span>
            </button>
            {ms.slice(0, 30).map((m, i) => (
              <button key={i} onClick={() => openFile(p, m.line)} className="flex w-full gap-2 py-0.5 pr-3 pl-7 text-left hover:bg-bg-2">
                <span className="tnum w-8 shrink-0 text-right font-mono text-[11px] text-fg-3">{m.line}</span>
                <span className="min-w-0 truncate font-mono text-[11.5px] text-fg-2">
                  <Highlight text={m.text} ranges={m.ranges} />
                </span>
              </button>
            ))}
          </div>
        ))}
        {res?.truncated && <div className="px-3 py-2 text-[11.5px] text-fg-3">Showing the first {res.matches.length} matches.</div>}
      </div>
    </div>
  );
}

/** Ctrl/⌘+P: jump to a file in the explorer root by fuzzy name. */
export function QuickOpen() {
  const boot = useApp((s) => s.boot);
  const root = useUI((s) => s.explorerRoot) ?? boot?.defaultCwd ?? '/';
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [files, setFiles] = useState<string[]>([]);
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'p' && !e.shiftKey) {
        e.preventDefault();
        setOpen(true);
        setQ('');
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  useEffect(() => {
    if (!open) return;
    const ctl = new AbortController();
    const t = setTimeout(() => {
      api<{ files: string[] }>(`/api/fs/find?root=${encodeURIComponent(root)}&q=${encodeURIComponent(q)}`, { signal: ctl.signal })
        .then((r) => {
          setFiles(r.files);
          setSel(0);
        })
        .catch(() => {});
    }, 80);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q, open, root]);
  const choose = (p: string) => {
    setOpen(false);
    openFile(p);
  };
  return (
    <Dialog open={open} onClose={() => setOpen(false)} width={620}>
      <input
        ref={input}
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSel((s) => Math.min(s + 1, files.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSel((s) => Math.max(s - 1, 0));
          } else if (e.key === 'Enter' && files[sel]) choose(files[sel]);
        }}
        placeholder={`Go to file in ${tildify(root, boot?.home)}`}
        className="mb-2 h-10 w-full rounded-lg border border-line-2 bg-bg-1 px-3 text-[14px] outline-none focus:border-accent/60"
      />
      <div className="max-h-[50vh] overflow-y-auto">
        {files.map((f, i) => (
          <button key={f} onClick={() => choose(f)} className={cx('flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left', i === sel ? 'bg-bg-3' : 'hover:bg-bg-2')}>
            <File size={13} className="shrink-0 text-fg-3" />
            <span className="shrink-0 text-[13px]">{basename(f)}</span>
            <span className="min-w-0 truncate text-[11.5px] text-fg-3">{tildify(dirname(f), boot?.home)}</span>
          </button>
        ))}
      </div>
    </Dialog>
  );
}
