import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { FileText, FolderOpen, Plus } from 'lucide-react';
import type { Agent, InstructionFile } from '@shared/types';
import { api, enc, post } from '../../lib/api';
import { basename, bytes, dirname, joinPath, tildify } from '../../lib/format';
import { go } from '../../lib/nav';
import { toastError, useApp, useUI } from '../../lib/store';
import { Button, cx, Dialog, Throbber, Empty, useConfirm } from '../../components/ui';
import { FileEditor } from '../files/FileEditor';

/** The instruction file each agent reads: Claude Code's CLAUDE.md, Codex's AGENTS.md. */
export const instructionName = (a: Agent) => (a === 'claude' ? 'CLAUDE.md' : 'AGENTS.md');

const SCOPE: Record<InstructionFile['scope'], string> = { user: 'All folders', parent: 'Parent folder', project: 'This folder', local: 'This folder, only you', rules: 'Rule' };

/** Codex reads one file per folder: AGENTS.override.md, when it has text, wins over AGENTS.md. */
function shadowed(f: InstructionFile, all: InstructionFile[]) {
  if (basename(f.path) !== 'AGENTS.md') return false;
  const o = all.find((x) => x.path === joinPath(dirname(f.path), 'AGENTS.override.md'));
  return !!o?.exists && (o.size ?? 0) > 0;
}

/** The file to open first: the one this folder's sessions read, else the main one to create. */
function firstPick(files: InstructionFile[]): string | null {
  const here = files.filter((f) => f.scope === 'project' || f.scope === 'local');
  const read = here.filter((f) => f.exists && !shadowed(f, files));
  return (read.find((f) => f.primary) ?? read[0] ?? here.find((f) => f.primary) ?? files[0])?.path ?? null;
}

function hint(agent: Agent, f: InstructionFile, cwd: string, home?: string) {
  const who = agent === 'claude' ? 'Claude Code' : 'Codex';
  if (f.scope === 'user') return `${who} reads ${tildify(f.path, home)} in every session, whatever the folder.`;
  return `${who} reads it in sessions started in ${tildify(cwd, home)} or below. Commit it to share it with everyone working in the repository.`;
}

/** Asks before closing or switching away from an editor with unsaved changes; one question at a time. */
function useDiscardGuard() {
  const dirty = useRef(false);
  const asking = useRef(false);
  const [confirm, node] = useConfirm();
  const ask = useCallback(async () => {
    if (asking.current) return false;
    asking.current = true;
    try {
      return await confirm({ title: 'Discard your changes?', body: 'The file has unsaved changes.', confirm: 'Discard', danger: true });
    } finally {
      asking.current = false;
    }
  }, [confirm]);
  /** True when it is fine to leave: nothing unsaved, or the changes were discarded. */
  const leave = useCallback(async () => {
    if (asking.current) return false;
    if (dirty.current && !(await ask())) return false;
    dirty.current = false;
    return true;
  }, [ask]);
  const setDirty = useCallback((d: boolean) => void (dirty.current = d), []);
  return { leave, setDirty, node };
}

/**
 * The instruction files an agent reads for a session in `cwd`, in load order, beside an editor for the
 * picked one. The main files that are missing (everyone's and this folder's) can be created in place.
 */
export function InstructionsEditor({ agent, cwd, className, guard }: { agent: Agent; cwd: string; className?: string; guard?: ReturnType<typeof useDiscardGuard> }) {
  const home = useApp((s) => s.boot?.home);
  const [files, setFiles] = useState<InstructionFile[] | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const own = useDiscardGuard();
  const g = guard ?? own;

  const load = useCallback(async () => {
    const r = await api<{ files: InstructionFile[] }>(`/api/setup/instructions?agent=${agent}&cwd=${enc(cwd)}`);
    setFiles(r.files);
    return r.files;
  }, [agent, cwd]);

  useEffect(() => {
    setFiles(null);
    setPick(null);
    load()
      .then((l) => setPick(firstPick(l)))
      .catch(toastError);
  }, [load]);

  const choose = async (p: string) => {
    if (p === pick || !(await g.leave())) return;
    setPick(p);
  };

  const create = async (f: InstructionFile) => {
    try {
      const r = await post<{ path: string }>('/api/setup/instructions', { agent, path: f.path, cwd });
      await load();
      setPick(r.path);
    } catch (e) {
      toastError(e);
    }
  };

  const cur = files?.find((f) => f.path === pick);
  const name = (f: InstructionFile) => (f.scope !== 'user' && f.path.startsWith(cwd.replace(/\/+$/, '') + '/') ? f.path.slice(cwd.replace(/\/+$/, '').length + 1) : tildify(f.path, home));
  return (
    <div className={cx('flex min-h-0 flex-col overflow-hidden rounded-xl border border-line md:flex-row', className)}>
      <div className="max-h-[36%] shrink-0 overflow-y-auto border-b border-line bg-bg-1 p-1.5 md:max-h-none md:w-[260px] md:border-r md:border-b-0">
        <div className="px-2 pt-1 pb-1.5 text-[11.5px] font-medium text-fg-3">Read in this order</div>
        {!files ? (
          <div className="flex justify-center py-6 text-fg-3">
            <Throbber />
          </div>
        ) : (
          files.map((f) => (
            <button
              key={f.path}
              onClick={() => choose(f.path)}
              title={f.path}
              className={cx('flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors', f.path === pick ? 'bg-bg-3' : 'hover:bg-bg-2')}
            >
              <FileText size={14} className={cx('mt-0.5 shrink-0', f.exists ? 'text-fg-2' : 'text-fg-3 opacity-60')} />
              <span className="min-w-0 flex-1">
                <span className={cx('block truncate font-mono text-[12px]', f.exists ? 'text-fg' : 'text-fg-3')}>{name(f)}</span>
                <span className="block truncate text-[11.5px] text-fg-3">
                  {SCOPE[f.scope]} · {!f.exists ? 'Not created' : shadowed(f, files) ? 'Skipped: the override wins' : bytes(f.size)}
                </span>
              </span>
            </button>
          ))
        )}
      </div>
      <div className="relative min-h-0 min-w-0 flex-1">
        {!cur ? null : cur.exists ? (
          <FileEditor key={cur.path} path={cur.path} embedded onDirty={g.setDirty} onSaved={() => load().catch(() => {})} />
        ) : (
          <Empty icon={<FileText size={22} />} title={`No ${basename(cur.path)} here yet`}>
            {hint(agent, cur, cwd, home)}
            <div className="mt-4">
              <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => create(cur)}>
                Create {basename(cur.path)}
              </Button>
            </div>
          </Empty>
        )}
      </div>
      {!guard && own.node}
    </div>
  );
}

/** CLAUDE.md / AGENTS.md for one folder, from the start screen or a session's menu. */
export function InstructionsDialog({ agent, cwd, open, onClose }: { agent: Agent; cwd: string; open: boolean; onClose: () => void }) {
  const home = useApp((s) => s.boot?.home);
  const guard = useDiscardGuard();
  const close = async () => (await guard.leave()) && onClose();
  return (
    <>
      <Dialog
        open={open}
        onClose={close}
        width={1040}
        title={
          <>
            {instructionName(agent)} <span className="font-normal text-fg-3">· {cwd === home ? '~' : basename(cwd) || '/'}</span>
          </>
        }
      >
        <InstructionsEditor agent={agent} cwd={cwd} guard={guard} className="mb-2 h-[min(72dvh,700px)]" />
      </Dialog>
      {guard.node}
    </>
  );
}

/** One file (a skill's SKILL.md) in a dialog editor. */
export function EditorDialog({ path, title, onClose }: { path: string | null; title?: ReactNode; onClose: () => void }) {
  const guard = useDiscardGuard();
  const close = async () => (await guard.leave()) && (onClose(), true);
  return (
    <>
      <Dialog
        open={!!path}
        onClose={close}
        width={1040}
        title={title ?? (path ? basename(path) : '')}
        footer={
          path && (
            <>
              <Button
                variant="ghost"
                size="sm"
                icon={<FolderOpen size={14} />}
                className="mr-auto"
                onClick={async () => {
                  if (!(await close())) return;
                  useUI.getState().set({ explorerRoot: dirname(path) });
                  go('/files');
                }}
              >
                Open the folder in Files
              </Button>
              <Button size="sm" onClick={close}>
                Done
              </Button>
            </>
          )
        }
      >
        {path && (
          <div className="h-[min(68dvh,660px)] overflow-hidden rounded-xl border border-line">
            <FileEditor key={path} path={path} embedded onDirty={guard.setDirty} />
          </div>
        )}
      </Dialog>
      {guard.node}
    </>
  );
}
