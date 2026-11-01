import { useEffect, useRef, useState } from 'react';
import { File } from 'lucide-react';
import { api } from '../../lib/api';
import { basename, dirname, tildify } from '../../lib/format';
import { openFile } from '../../lib/nav';
import { useApp, useUI } from '../../lib/store';
import { cx, Dialog } from '../../components/ui';

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
