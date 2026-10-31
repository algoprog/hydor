// What the start page takes from assistants beyond the picker: the folder chip with "New task folder"
// (a fresh folder for the task, the default unless a folder is picked or the assistant works in
// projects, like Coder), and the agent, model and mode an assistant suggests, set when it is picked.
import { Children, useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, Folder, FolderPlus } from 'lucide-react';
import { agentMode, type Assistant } from '@shared/assistants';
import type { Agent } from '@shared/types';
import { post } from '../../lib/api';
import { basename, tildify } from '../../lib/format';
import { useApp } from '../../lib/store';
import { FolderPicker } from '../../components/FolderPicker';
import { cx, Popover, SettingChip } from '../../components/ui';
import { assistantIn, lastAssistant, useAssistantsState } from './state';

/** Makes the new task's folder (Settings → Assistants says where) and returns its path. */
export const taskFolderFor = (prompt: string) => post<{ path: string }>('/api/assistants/task-folder', { prompt }).then((r) => r.path);

/**
 * Whether a new session gets a new task folder: as picked in the folder chip (`pick`), else when the
 * assistant does not work in projects. Until the list is known, the folder shown is used.
 */
export function useTaskFolder(assistant: string | undefined, pick: boolean | null): boolean {
  const a = assistantIn(useAssistantsState(), assistant ?? lastAssistant());
  return pick ?? (a ? a.folder !== 'project' : false);
}

/**
 * "Folder  New task folder", or the folder a new session works in; picking a folder turns the new one
 * off. `children` go at the end of its menu: what goes with a folder of your own (a worktree, the
 * instructions the agent reads there); `note` follows the folder's name ("· new worktree").
 */
export function WorkFolderChip({ value, task, onFolder, onTask, note, children }: { value: string; task: boolean; onFolder: (path: string) => void; onTask: () => void; note?: string; children?: ReactNode }) {
  const home = useApp((s) => s.boot?.home) ?? '';
  const st = useAssistantsState();
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const root = tildify(st?.taskRoot ?? `${home}/Naget`, home);
  const extras = Children.toArray(children);
  const use = (p: string) => {
    onFolder(p);
    setOpen(false);
  };
  return (
    <>
      <SettingChip
        ref={ref}
        label="Folder"
        icon={task ? <FolderPlus size={14} /> : <Folder size={14} />}
        open={open}
        onClick={() => {
          setDraft(task ? '' : tildify(value, home));
          setOpen((o) => !o);
        }}
        title={task ? `A new folder for this task, in ${root}` : tildify(value, home)}
        value={task ? 'New task folder' : `${value === home ? '~' : basename(value) || '/'}${note ? ` · ${note}` : ''}`}
      />
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={Math.min(420, window.innerWidth - 16)}>
        <div className="p-2">
          <button
            type="button"
            onClick={() => {
              onTask();
              setOpen(false);
            }}
            className={cx('flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-bg-2', task && 'bg-bg-2')}
          >
            <FolderPlus size={16} className="shrink-0 text-fg-3" />
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-medium text-fg">New task folder</span>
              <span className="block truncate text-[12px] text-fg-3">A fresh folder in {root}, named for the task</span>
            </span>
            {task && <Check size={14} className="shrink-0" strokeWidth={2.5} />}
          </button>
          <div className="mx-0.5 my-2 h-px bg-line" />
          <div className="mb-2 px-0.5 text-[12.5px] text-fg-3">Or a folder to work in</div>
          <FolderPicker value={draft} onChange={setDraft} onPick={use} autoFocus={!task} />
          <div className="mt-2 flex justify-end">
            <button
              className="h-8 rounded-lg bg-fg px-3 text-[13px] font-medium text-bg hover:opacity-90 disabled:opacity-40"
              disabled={!draft.trim()}
              onClick={() => {
                const v = draft.startsWith('~') ? home + draft.slice(1) : draft;
                use(v.replace(/\/+$/, '') || '/');
              }}
            >
              Use this folder
            </button>
          </div>
          {extras.length > 0 && (
            <>
              <div className="mx-0.5 my-2 h-px bg-line" />
              <div onClick={(e) => (e.target as HTMLElement).closest('[data-closes]') && setOpen(false)}>{extras}</div>
            </>
          )}
        </div>
      </Popover>
    </>
  );
}

const sameAgent = (a: Assistant, agent: Agent, acpId: string | null) => a.agent === agent && (agent !== 'acp' || a.acpAgent === acpId);

/**
 * Picking an assistant sets the agent, model and mode it suggests. Call it after the start page's own
 * choice of model and mode for an agent (from what it was last used with): each catalog of the agent
 * that arrives (`cat`) resets them to that, so the assistant's go on again after it. The pick the page
 * opens with changes nothing.
 */
export function useAssistantDefaults(
  id: string | undefined,
  o: { agent: Agent; acpId: string | null; cat: unknown; setAgent: (a: Agent) => void; setAcpId: (id: string | null) => void; setModel: (m: string | null) => void; setMode: (m: string | null) => void },
) {
  const st = useAssistantsState();
  const pending = useRef<Assistant | null>(null);
  const seen = useRef<string | undefined>(undefined);
  const done = useRef<unknown>(null);
  useEffect(() => {
    if (id === seen.current) return;
    const first = seen.current === undefined;
    seen.current = id;
    const a = first ? undefined : assistantIn(st, id);
    pending.current = a && (a.agent || a.mode) ? a : null;
    done.current = null;
    if (a?.agent && !sameAgent(a, o.agent, o.acpId)) {
      if (a.agent === 'acp') o.setAcpId(a.acpAgent ?? null);
      o.setAgent(a.agent);
    }
  }, [id]);
  useEffect(() => {
    const a = pending.current;
    if (!a || !o.cat || done.current === o.cat || (a.agent && !sameAgent(a, o.agent, o.acpId))) return;
    done.current = o.cat;
    if (a.agent && a.model) o.setModel(a.model);
    const m = agentMode(a.mode, o.agent, o.acpId ?? undefined);
    if (m) o.setMode(m);
  });
}
