// Pieces the Git page's parts share: where a repository's parts are (its address), the letters files carry,
// a file's name with its folder, branch and tag labels, a failure said in plain words, the files a commit or
// stash changed (each opening to its diff), and the way diffs are laid out.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ChevronRight, Cloud, GitBranch, Tag, X } from 'lucide-react';
import type { GitChangedFile, GitFileStatus, GitRef } from '@shared/types';
import { DiffStat, DiffView } from '../../components/DiffView';
import { Button, cx, Dialog, IconButton, inputCls, Segmented } from '../../components/ui';
import { go } from '../../lib/nav';
import { toast } from '../../lib/store';

export type Tab = 'changes' | 'history' | 'branches' | 'stashes';
export const TABS: Tab[] = ['changes', 'history', 'branches', 'stashes'];

/** A repository's address on the page, with the tab and what is open in it. */
export function repoUrl(path: string, o: { tab?: Tab; file?: string | null; c?: string | null; stash?: string | null } = {}): string {
  const q = new URLSearchParams({ path });
  if (o.tab && o.tab !== 'changes') q.set('tab', o.tab);
  if (o.file) q.set('file', o.file);
  if (o.c) q.set('c', o.c);
  if (o.stash) q.set('stash', o.stash);
  return `/git?${q}`;
}

/** Opens the start page with a prompt and the repository's folder filled in (nothing starts by itself). */
export function askAgent(prompt: string, cwd: string) {
  go(`/?prompt=${encodeURIComponent(prompt)}&cwd=${encodeURIComponent(cwd)}`);
}

/** Copies text, on a page served over plain http too (where the clipboard API is missing). */
export function copyText(text: string, done = 'Copied') {
  const fallback = () => {
    const t = document.createElement('textarea');
    t.value = text;
    t.style.position = 'fixed';
    t.style.opacity = '0';
    document.body.appendChild(t);
    t.select();
    const ok = document.execCommand('copy');
    t.remove();
    toast(ok ? done : 'Could not copy', ok ? 'ok' : 'error');
  };
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(() => toast(done, 'ok'), fallback);
  else fallback();
}

export const commits = (n: number) => (n === 1 ? '1 commit' : `${n.toLocaleString()} commits`);
export const filesN = (n: number) => (n === 1 ? '1 file' : `${n.toLocaleString()} files`);
export const short = (h: string) => h.slice(0, 7);

/** A setting kept in this browser. */
export function usePref<T extends string>(key: string, def: T, ok: readonly T[]): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    const s = localStorage.getItem(key) as T | null;
    return s && ok.includes(s) ? s : def;
  });
  return [
    v,
    (n: T) => {
      localStorage.setItem(key, n);
      setV(n);
    },
  ];
}

export type DiffLayout = 'unified' | 'split';
/** Side by side needs room for two columns of code: below this width a diff stays unified (and the switch hides). */
export const SPLIT_MIN = 640;
export const useDiffLayout = () => usePref<DiffLayout>('wa.git.diff', 'unified', ['unified', 'split']);

/** Unified or Side by side. */
export function DiffLayoutSwitch({ value, onChange }: { value: DiffLayout; onChange: (v: DiffLayout) => void }) {
  return (
    <Segmented
      size="sm"
      value={value}
      onChange={onChange}
      options={[
        { value: 'unified', label: 'Unified' },
        { value: 'split', label: 'Side by side' },
      ]}
    />
  );
}

// ---- files ---------------------------------------------------------------------------------------

/** The letter a changed file carries (as on the Files page), its colour and what it means. */
export function statusOf(f: Pick<GitFileStatus, 'code' | 'conflict'>): { letter: string; cls: string; label: string } {
  const xy = f.code;
  if (f.conflict || xy.includes('U') || xy === 'AA' || xy === 'DD') return { letter: 'C', cls: 'text-err', label: 'A conflict to settle' };
  if (xy === '??') return { letter: 'U', cls: 'text-ok', label: 'New, not yet in git' };
  if (xy.includes('R')) return { letter: 'R', cls: 'text-info', label: 'Renamed' };
  if (xy.includes('D')) return { letter: 'D', cls: 'text-err', label: 'Deleted' };
  if (xy.includes('A')) return { letter: 'A', cls: 'text-ok', label: 'New, added to git' };
  return { letter: 'M', cls: 'text-warn', label: 'Changed' };
}

/** A commit's file status letter (A, M, D, R, C). */
export function commitStatus(s?: string): { letter: string; cls: string; label: string } {
  if (s === 'A') return { letter: 'A', cls: 'text-ok', label: 'Added' };
  if (s === 'D') return { letter: 'D', cls: 'text-err', label: 'Deleted' };
  if (s === 'R') return { letter: 'R', cls: 'text-info', label: 'Renamed' };
  if (s === 'C') return { letter: 'C', cls: 'text-info', label: 'Copied' };
  return { letter: 'M', cls: 'text-warn', label: 'Changed' };
}

export function Letter({ s }: { s: { letter: string; cls: string; label: string } }) {
  return (
    <span title={s.label} className={cx('w-3.5 shrink-0 text-center font-mono text-[12px] font-semibold', s.cls)}>
      {s.letter}
    </span>
  );
}

/** A file's name, bold, with its folder after it, quieter; a rename's old path in the tooltip. */
export function FileName({ path, from, className }: { path: string; from?: string; className?: string }) {
  const p = path.replace(/\/$/, '');
  const i = p.lastIndexOf('/');
  const name = (i >= 0 ? p.slice(i + 1) : p) + (path.endsWith('/') ? '/' : '');
  const dir = i >= 0 ? p.slice(0, i) : '';
  return (
    <span translate="no" title={from ? `${from} → ${path}` : path} className={cx('flex min-w-0 items-baseline gap-1.5', className)}>
      <span className="shrink-0 truncate font-medium text-fg max-w-[75%]">{name}</span>
      {dir && <span className="min-w-0 truncate text-[12px] text-fg-3">{dir}</span>}
    </span>
  );
}

// ---- refs ----------------------------------------------------------------------------------------

/** A branch, a remote branch or a tag on a commit. */
export function RefChip({ r }: { r: GitRef }) {
  const icon = r.kind === 'tag' ? <Tag size={10} /> : r.kind === 'remote' ? <Cloud size={10} /> : <GitBranch size={10} />;
  return (
    <span
      translate="no"
      title={r.kind === 'tag' ? `Tag ${r.name}` : r.kind === 'remote' ? `${r.name}, on the remote` : r.current ? `${r.name}, the branch you are on` : `Branch ${r.name}`}
      className={cx(
        'inline-flex h-[18px] max-w-[12rem] shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] leading-none font-medium',
        r.kind === 'tag' ? 'bg-warn/12 text-warn' : r.kind === 'remote' ? 'bg-bg-2 text-fg-3' : r.current ? 'bg-accent/15 text-accent ring-1 ring-accent/40 ring-inset' : 'bg-info/12 text-info',
      )}
    >
      {icon}
      <span className="truncate">{r.name}</span>
    </span>
  );
}

// ---- failures ------------------------------------------------------------------------------------

/** What went wrong, in plain words, for git's common failures; null when git's own words have to do. */
export function explain(output: string): string | null {
  const o = output;
  if (/Could not resolve host|unable to access|Connection (refused|timed out)|Network is unreachable|timed out|Operation timed out/i.test(o))
    return 'Couldn’t reach the remote. Check this computer’s connection, then try again.';
  if (/Authentication failed|Permission denied \(publickey|could not read Username|terminal prompts disabled|Host key verification failed|returned error: 40[13]/i.test(o))
    return 'The remote didn’t accept this computer’s sign-in. Set up an SSH key or saved git credentials for it (the app never asks for a password).';
  if (/would be overwritten by (merge|checkout|switch)|Your local changes to the following files would be overwritten/i.test(o))
    return 'Your uncommitted changes touch files this would change too. Commit them or put them aside in a stash first, then try again.';
  if (/\[rejected\]|non-fast-forward|fetch first|Updates were rejected/i.test(o)) return 'The remote has commits you don’t have yet. Sync to bring them in first.';
  if (/not fully merged/i.test(o)) return 'This branch has commits no other branch has.';
  if (/Not possible to fast-forward|Diverging branches/i.test(o)) return 'Your branch and the remote’s have both moved on.';
  if (/nothing to commit|no changes added to commit/i.test(o)) return 'There was nothing to commit.';
  if (/Please tell me who you are|empty ident|user\.email/i.test(o)) return 'Git doesn’t know who you are yet: set your name and email for commits (git config user.name and user.email) in a terminal.';
  if (/gpg failed|failed to sign/i.test(o)) return 'Git couldn’t sign the commit: check your signing key, or turn signing off for this repository.';
  if (/hook.*(failed|declined)|pre-commit|pre-push/i.test(o)) return 'One of the repository’s hooks stopped it: see what it said below.';
  return null;
}

/** A red box: what didn't go through, why in plain words when we know, and git's own words. */
export function FailureBox({ title, output, onClose, className }: { title: string; output: string; onClose: () => void; className?: string }) {
  const plain = explain(output);
  const [open, setOpen] = useState(!plain);
  return (
    <div className={cx('rounded-xl border border-err/35 bg-err/5 px-3 py-2.5', className)}>
      <div className="flex items-start gap-2 text-[13px]">
        <div className="min-w-0 flex-1">
          <div className="font-medium text-err">{title}</div>
          {plain && <div className="mt-0.5 text-fg-2">{plain}</div>}
        </div>
        {output && plain && (
          <button onClick={() => setOpen((o) => !o)} className="shrink-0 text-[12px] text-fg-3 hover:text-fg">
            {open ? 'Hide git’s words' : 'What git said'}
          </button>
        )}
        <IconButton label="Dismiss" size="sm" onClick={onClose} className="-mt-1 -mr-1">
          <X size={14} />
        </IconButton>
      </div>
      {output && open && <pre className="term-out mt-2 max-h-48 overflow-auto rounded-lg px-3 py-2 text-[12px]">{output}</pre>}
    </div>
  );
}

// ---- pages inside the page -----------------------------------------------------------------------

/** The top of a part shown on its own (a file's diff, a commit), with the way back. */
export function BackBar({ label, onBack, children }: { label: string; onBack: () => void; children?: ReactNode }) {
  return (
    <div className="flex h-11 shrink-0 items-center gap-1 border-b border-line px-1.5">
      <button onClick={onBack} className="flex h-9 min-w-0 shrink-0 items-center gap-1 rounded-lg px-1.5 text-[13.5px] text-fg-2 hover:bg-bg-2 hover:text-fg">
        <ArrowLeft size={16} />
        {label}
      </button>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-1">{children}</div>
    </div>
  );
}

/** An element's width as it changes (0 until known). */
export function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

// ---- what a commit or stash changed --------------------------------------------------------------

/**
 * The files a commit or stash changed, each opening to its diff. When the changes are small they are open
 * from the start.
 */
export function ChangedFiles({ files, split }: { files: GitChangedFile[]; split: boolean }) {
  const small = files.length <= 6 && files.reduce((n, f) => n + f.added + f.removed, 0) <= 300;
  const [open, setOpen] = useState<Set<string>>(() => new Set(small ? files.map((f) => f.path) : []));
  if (!files.length) return <div className="px-1 py-2 text-[13px] text-fg-3">No files changed.</div>;
  return (
    <div className="overflow-hidden rounded-xl border border-line">
      {files.map((f, i) => {
        const on = open.has(f.path);
        return (
          <div key={f.path} className={cx(i > 0 && 'border-t border-line')}>
            <button
              onClick={() =>
                setOpen((s) => {
                  const n = new Set(s);
                  if (on) n.delete(f.path);
                  else n.add(f.path);
                  return n;
                })
              }
              className={cx('flex h-9 w-full items-center gap-2 px-2.5 text-left text-[13px] hover:bg-bg-2 max-md:h-11', on && 'bg-bg-1')}
            >
              <ChevronRight size={13} className={cx('shrink-0 text-fg-3', on && 'rotate-90')} />
              <Letter s={commitStatus(f.status)} />
              <FileName path={f.path} from={f.from} className="flex-1" />
              {f.binary ? <span className="shrink-0 text-[11.5px] text-fg-3">binary</span> : <DiffStat added={f.added} removed={f.removed} compact />}
            </button>
            {on && (
              <div className="border-t border-line">
                {f.binary ? <div className="px-3 py-2 text-[12px] text-fg-3">A binary file: no lines to show.</div> : <DiffView diff={f.diff} split={split} className="max-h-[70vh] overflow-auto text-[12px]" />}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---- a name to give ------------------------------------------------------------------------------

/**
 * Asks for a name (a new branch, a tag, a branch's new name), and with `note` an optional second line (a
 * tag's message). `done` gets them; it returns whether to close.
 */
export function NameDialog({
  open,
  title,
  initial = '',
  placeholder,
  note,
  confirm,
  children,
  onClose,
  done,
}: {
  open: boolean;
  title: string;
  initial?: string;
  placeholder: string;
  note?: string;
  confirm: string;
  children?: ReactNode;
  onClose: () => void;
  done: (name: string, note: string) => Promise<boolean>;
}) {
  const [name, setName] = useState(initial);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setName(initial);
      setText('');
    }
  }, [open, initial]);
  const ok = name.trim() && !/\s/.test(name.trim()) && !name.trim().startsWith('-');
  const go = async () => {
    if (!ok || busy) return;
    setBusy(true);
    try {
      if (await done(name.trim(), text.trim())) onClose();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      width={440}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!ok || busy} onClick={go}>
            {confirm}
          </Button>
        </>
      }
    >
      {children && <div className="mb-3 text-[13px] leading-relaxed text-fg-2">{children}</div>}
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && void go()}
        placeholder={placeholder}
        aria-label={placeholder}
        spellCheck={false}
        autoCapitalize="none"
        autoCorrect="off"
        className={cx(inputCls, 'font-mono text-[13.5px]')}
      />
      {name.trim() && /\s/.test(name.trim()) && <div className="mt-1.5 text-[12px] text-warn">No spaces: use - or / between words.</div>}
      {note && <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void go()} placeholder={note} aria-label={note} className={cx(inputCls, 'mt-2')} />}
    </Dialog>
  );
}
