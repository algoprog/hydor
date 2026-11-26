// An evaluation's smaller windows: which folder to score (its own, or a git worktree of the same repository), what
// changed since it was sealed (each file with its diff folded under it, Put them back and Seal again), and the
// question before the final test.
import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Folder, GitBranch, Lock } from 'lucide-react';
import type { EvalChange, EvalFolder, EvalRestored, Evaluation, SealState } from '@shared/evaluations';
import { api, enc, post } from '../../lib/api';
import { tildify } from '../../lib/format';
import { folderName } from '../../lib/folderNames';
import { toastError, useApp } from '../../lib/store';
import { DiffView } from '../../components/DiffView';
import { Button, cx, Dialog, inputCls, Throbber } from '../../components/ui';
import { evalUrl } from './evalApi';
import { canPutBack, pathWords } from './evalWords';

// ---- which folder ----------------------------------------------------------------------------------------------------

/** The folder as one line: its branch when it has one, else its name. */
const folderLabel = (f: EvalFolder, home: string) => f.branch ?? folderName(f.path, home);

export function FolderDialog({ folders, onPick, onClose }: { folders: EvalFolder[] | null; onPick: (folder: string) => void; onClose: () => void }) {
  const home = useApp((s) => s.boot?.home) ?? '';
  return (
    <Dialog part="experiments" open={!!folders} onClose={onClose} title="Score what is in which folder?" width={480}>
      <div className="space-y-1.5 pb-[max(8px,var(--safe-bottom))]">
        {folders?.map((f) => (
          <button key={f.path} type="button" onClick={() => onPick(f.path)} className="flex w-full min-w-0 items-center gap-3 rounded-xl border border-line px-3 py-2.5 text-left transition-colors hover:bg-bg-2">
            <span className="shrink-0 text-fg-3">{f.home ? <Folder size={16} /> : <GitBranch size={16} />}</span>
            <span className="min-w-0 flex-1">
              <span translate="no" className="block truncate font-mono text-[13px] font-medium text-fg">
                {folderLabel(f, home)}
              </span>
              <span translate="no" className="block truncate text-[12px] text-fg-3">
                {tildify(f.path, home)}
              </span>
            </span>
            <span className="shrink-0 text-[12px] text-fg-3">{f.home ? 'The folder itself' : 'A worktree'}</span>
          </button>
        ))}
      </div>
    </Dialog>
  );
}

// ---- what changed ----------------------------------------------------------------------------------------------------

const WHAT: Record<EvalChange['what'], string> = { changed: 'Changed', missing: 'Missing', added: 'New file' };

function ChangeRow({ c }: { c: EvalChange }) {
  const [open, setOpen] = useState(false);
  const p = pathWords(c.path);
  const head = (
    <>
      <span className={cx('w-[68px] shrink-0 text-[12px] font-medium', c.what === 'missing' ? 'text-err' : 'text-warn')}>{WHAT[c.what]}</span>
      <span className="min-w-0 flex-1">
        <span translate="no" className="block font-mono text-[12.5px] break-all text-fg">
          {p.name}
        </span>
        {p.held && <span className="block text-[11.5px] text-fg-3">In the held-out folder</span>}
      </span>
    </>
  );
  return (
    <li className="border-t border-line first:border-t-0">
      {c.diff ? (
        <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-bg-1">
          {head}
          <span className="mt-0.5 shrink-0 text-fg-3">{open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</span>
        </button>
      ) : (
        <div className="flex items-start gap-2 px-3 py-2 pr-[35px]">{head}</div>
      )}
      {open && c.diff && (
        <div className="border-t border-line">
          <div translate="no" className="max-h-[320px] overflow-auto">
            <DiffView diff={c.diff} />
          </div>
          {c.cut && <p className="border-t border-line px-3 py-1.5 text-[12px] text-fg-3">The rest is not shown.</p>}
        </div>
      )}
    </li>
  );
}

/** What putting files back could not do, and why. */
export function LeftList({ left }: { left: EvalRestored['left'] }) {
  return (
    <div className="rounded-xl border border-warn/40 bg-warn/10 px-3 py-2.5">
      <p className="font-medium text-fg">These could not be put back:</p>
      <ul className="mt-1 space-y-1">
        {left.map((l) => {
          const p = pathWords(l.path);
          return (
            <li key={l.path}>
              <span translate="no" className="font-mono text-[12.5px] break-all text-fg">
                {p.name}
              </span>
              <span className="block text-[12.5px] text-fg-2">{l.why}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export interface ChangesAsk {
  /** The folder looked at; the evaluation's own when absent. */
  folder?: string;
  /** What Put them back just did, when it was pressed on the page. */
  restored?: EvalRestored;
}

export function ChangesDialog({ evaluation, ask, onClose, onSealAgain, onChanged }: { evaluation: Evaluation; ask: ChangesAsk | null; onClose: () => void; onSealAgain: () => Promise<boolean>; onChanged: () => void }) {
  const home = useApp((s) => s.boot?.home) ?? '';
  const [data, setData] = useState<{ folder: string; state: SealState; changes: EvalChange[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restored, setRestored] = useState<EvalRestored | null>(null);
  const [busy, setBusy] = useState(false);
  const folder = ask?.folder;
  const load = useCallback(() => {
    api<{ folder: string; state: SealState; changes: EvalChange[] }>(evalUrl(evaluation.id, `/changes${folder ? `?folder=${enc(folder)}` : ''}`))
      .then((r) => {
        setData(r);
        setError(null);
      })
      .catch((e) => setError((e as Error).message));
  }, [evaluation.id, folder]);
  useEffect(() => {
    if (!ask) return;
    setData(null);
    setRestored(ask.restored ?? null);
    load();
  }, [ask, load]);

  const putBack = async () => {
    setBusy(true);
    try {
      setRestored(await post<EvalRestored>(evalUrl(evaluation.id, '/restore'), folder ? { folder } : {}));
      load();
      onChanged();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const seal = async () => {
    if (await onSealAgain()) onClose();
  };
  const changes = data?.changes ?? [];

  return (
    <Dialog
      part="experiments"
      open={!!ask}
      onClose={onClose}
      title="What changed since it was sealed"
      width={720}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} className="mr-auto">
            Close
          </Button>
          {changes.length > 0 && (
            <>
              <Button variant="secondary" onClick={seal} disabled={busy}>
                Seal again…
              </Button>
              {data && canPutBack(data.state) && (
                <Button variant="primary" onClick={putBack} disabled={busy}>
                  Put them back
                </Button>
              )}
            </>
          )}
        </>
      }
    >
      <div className="space-y-3 text-[13px]">
        {folder && folder !== evaluation.cwd && (
          <p className="text-fg-3">
            <span>In</span>{' '}
            <span translate="no" className="font-mono text-[12px] break-all">
              {tildify(folder, home)}
            </span>
          </p>
        )}
        {restored && restored.restored.length > 0 && <p className="text-ok">{restored.restored.length === 1 ? 'Put back 1 file.' : `Put back ${restored.restored.length} files.`}</p>}
        {restored && restored.left.length > 0 && <LeftList left={restored.left} />}
        {error && <p className="rounded-lg bg-err/10 px-3 py-2 text-err">{error}</p>}
        {!data && !error && (
          <div className="flex justify-center py-6 text-fg-3">
            <Throbber />
          </div>
        )}
        {data && !changes.length && (
          <p className="flex items-center gap-2 py-2 text-fg-2">
            <Lock size={14} className="shrink-0 text-fg-3" />
            Everything is as it was sealed.
          </p>
        )}
        {changes.length > 0 && (
          <ul className="overflow-hidden rounded-xl border border-line">
            {changes.map((c) => (
              <ChangeRow key={c.path} c={c} />
            ))}
          </ul>
        )}
        {!!data?.state.more && <p className="text-fg-3">{`and ${data.state.more} more`}</p>}
      </div>
    </Dialog>
  );
}

// ---- the final test ---------------------------------------------------------------------------------------------------

export function FinalDialog({ open, runs, folders, onClose, onRun }: { open: boolean; runs: number; folders: EvalFolder[]; onClose: () => void; onRun: (folder?: string) => void }) {
  const home = useApp((s) => s.boot?.home) ?? '';
  const [folder, setFolder] = useState('');
  useEffect(() => {
    if (open) setFolder('');
  }, [open]);
  return (
    <Dialog
      part="experiments"
      open={open}
      onClose={onClose}
      title="Run the final test?"
      width={440}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Not yet
          </Button>
          <Button variant="primary" onClick={() => onRun(folder || undefined)}>
            Run the final test
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-[14px] leading-relaxed text-fg-2">
        <p>
          <span>The final test says how well it really does. Each look tells you a little less, so run it when you think you are done.</span>{' '}
          <span>{runs === 1 ? 'It has run 1 time since it was sealed.' : `It has run ${runs} times since it was sealed.`}</span>
        </p>
        {folders.length > 1 && (
          <label className="block text-[13px]">
            <span className="mb-1 block text-fg-2">On what is in</span>
            <select value={folder} onChange={(e) => setFolder(e.target.value)} className={cx(inputCls, 'pr-8 text-[13px]')} translate="no">
              {folders.map((f) => (
                <option key={f.path} value={f.home ? '' : f.path}>
                  {folderLabel(f, home)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
    </Dialog>
  );
}
