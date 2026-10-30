// A session's worktree: where it is, how far its branch has come, and removing it when the work is done
// (its branch stays unless you delete it; uncommitted changes need a second confirmation).
import { useEffect, useState } from 'react';
import { GitBranch } from 'lucide-react';
import type { SessionSummary, WorktreeInfo } from '@shared/types';
import { api, enc, post } from '../../lib/api';
import { tildify } from '../../lib/format';
import { go } from '../../lib/nav';
import { toast, toastError, useApp } from '../../lib/store';
import { Button, Dialog, Dots } from '../../components/ui';

type State = WorktreeInfo & { exists: boolean; dirty: number; ahead: number; behind: number };

export function WorktreeDialog({ s, open, onClose }: { s: SessionSummary; open: boolean; onClose: () => void }) {
  const home = useApp((x) => x.boot?.home);
  const [st, setSt] = useState<State | null>(null);
  const [deleteBranch, setDeleteBranch] = useState(false);
  const [force, setForce] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setSt(null);
    setForce(false);
    setDeleteBranch(false);
    api<State>(`/api/sessions/${enc(s.key)}/worktree`)
      .then(setSt)
      .catch((e) => (toastError(e), onClose()));
  }, [open, s.key]);
  const remove = async () => {
    setBusy(true);
    try {
      const r = await post<{ branchKept: boolean }>(`/api/sessions/${enc(s.key)}/worktree/remove`, { force, deleteBranch });
      toast(r.branchKept ? `Removed the worktree; branch ${st?.branch} is kept` : 'Removed the worktree and its branch', 'ok');
      onClose();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onClose={onClose} title="Worktree" width={480}>
      {!st ? (
        <div className="flex justify-center py-6 text-fg-3">
          <Dots />
        </div>
      ) : (
        <div className="space-y-4 text-[13.5px]">
          <div className="space-y-1.5 rounded-xl border border-line bg-bg-1 px-3.5 py-3">
            <div className="flex items-center gap-2 font-medium">
              <GitBranch size={14} className="text-fg-3" /> {st.branch}
              <span className="font-normal text-fg-3">from {st.base}</span>
            </div>
            <div className="truncate font-mono text-[12px] text-fg-3" title={st.path}>
              {tildify(st.path, home)}
            </div>
            <div className="text-[12.5px] text-fg-2">
              {!st.exists
                ? 'The folder is already gone.'
                : `${st.ahead} commit${st.ahead === 1 ? '' : 's'} ahead of ${st.base}${st.behind ? `, ${st.behind} behind` : ''} · ${st.dirty ? `${st.dirty} uncommitted change${st.dirty === 1 ? '' : 's'}` : 'nothing uncommitted'}`}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => (onClose(), go(`/review/${enc(s.key)}`))}>
              Review its changes
            </Button>
            <Button size="sm" variant="ghost" onClick={() => (onClose(), go(`/git?path=${encodeURIComponent(st.path)}`))}>
              Open in Git
            </Button>
          </div>
          <div className="space-y-2 border-t border-line pt-3">
            <div className="font-medium">Remove the worktree</div>
            <p className="text-[12.5px] leading-relaxed text-fg-3">The folder goes; the session keeps its history. Its branch stays, so nothing committed is lost, unless you delete it too.</p>
            <label className="flex items-center gap-2 text-[13px]">
              <input type="checkbox" checked={deleteBranch} onChange={(e) => setDeleteBranch(e.target.checked)} className="accent-[var(--accent)]" />
              Delete branch {st.branch} too{st.ahead ? ` (${st.ahead} commit${st.ahead === 1 ? '' : 's'} not in ${st.base})` : ''}
            </label>
            {st.dirty > 0 && (
              <label className="flex items-center gap-2 text-[13px] text-warn">
                <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} className="accent-[var(--warn)]" />
                Discard the {st.dirty} uncommitted change{st.dirty === 1 ? '' : 's'}
              </label>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
            <Button variant="danger" onClick={remove} disabled={busy || (st.dirty > 0 && !force)}>
              {busy ? 'Removing…' : 'Remove worktree'}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
