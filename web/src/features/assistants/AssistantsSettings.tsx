// Settings → Your agents: where task folders go and cleaning up after a task (your agents themselves are on the
// Agents page; the window that makes and changes one is AgentEditor.tsx), and importing Claude Code agent files.
// How the agents talk to you is part of Agent Guidelines now (features/guidelines).
import { useEffect, useRef, useState } from 'react';
import { Bot, FileUp } from 'lucide-react';
import type { Assistant, AssistantsState } from '@shared/assistants';
import { api, enc, post, put } from '../../lib/api';
import { tildify } from '../../lib/format';
import { toast, toastError, useApp, useUI } from '../../lib/store';
import { FolderChip } from '../../components/FolderPicker';
import { go } from '../../lib/nav';
import { Badge, Button, Dialog, Switch, Throbber } from '../../components/ui';
import { Group, Row, Stack } from '../settings/kit';
import { useAssistants, useAssistantsState } from './state';

const saved = (r: AssistantsState) => useAssistants.getState().set(r);

export function AssistantsSettings() {
  const st = useAssistantsState();
  const home = useApp((s) => s.boot?.home) ?? '';
  const wait = <Throbber className="text-fg-3" />;
  const mine = st ? st.assistants.filter((a) => !a.builtin).length : 0;
  const setCleanUp = (cleanUp: boolean) =>
    put<AssistantsState>('/api/assistants/settings', { cleanUp })
      .then((r) => (saved(r), toast(cleanUp ? 'Agents clean up after a task from their next session' : 'Agents leave what they made in place from their next session', 'ok')), toastError);
  const setRoot = (taskRoot: string) => put<AssistantsState>('/api/assistants/settings', { taskRoot }).then(saved, toastError);
  return (
    <Stack>
      <Group>
        <Row
          icon={<Bot size={16} />}
          label="Your agents"
          hint={!st ? undefined : mine ? `${mine} of your own, beside the built-in ones` : 'Only the built-in agents so far'}
          info="Make and change them on the Agents page: what each does, where and when it works, what it thinks with, and whom it asks."
          control={!st ? wait : undefined}
          onClick={() => go('/agents')}
        />
      </Group>
      <Group title="Tasks">
        <Row
          label="Clean up after a task"
          hint="Agents remove what they made along the way"
          info="The agent removes what it made along the way and no longer needs: scratch and test files, temporary data, extra branches and worktrees, processes it started. It keeps the work you asked for, never touches what it did not make, asks first about anything large or unclear, and says what it removed."
          control={st ? <Switch on={st.cleanUp} onChange={setCleanUp} label="Clean up after a task" /> : wait}
        />
        <Row
          label="Task folders"
          hint={st ? <>
              New ones look like <span translate="no" className="font-mono text-[12px] break-all text-fg-2">{tildify(st.taskRoot, home)}/2026-10-31-plan-trip-lisbon</span>
            </> : undefined}
          info="A session started without a folder gets a new one here, named by the day and the task. Coder works in the folder you pick instead."
          control={
            st ? (
              <>
                {st.taskRoot !== st.defaultTaskRoot && (
                  <Button size="sm" variant="ghost" onClick={() => setRoot('')}>
                    Back to <span translate="no">{tildify(st.defaultTaskRoot, home)}</span>
                  </Button>
                )}
                <FolderChip value={st.taskRoot} onChange={setRoot} />
              </>
            ) : (
              wait
            )
          }
        />
      </Group>
    </Stack>
  );
}

// ---- importing Claude Code agents -----------------------------------------------------------------------

interface AgentFileRow {
  path: string;
  scope: 'user' | 'project';
  name: string;
  description: string;
  imported?: string;
}

export function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const home = useApp((s) => s.boot?.home) ?? '';
  const root = useUI((s) => s.explorerRoot) ?? home;
  const [files, setFiles] = useState<AgentFileRow[] | null>(null);
  const [busy, setBusy] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const load = () =>
    api<{ files: AgentFileRow[] }>(`/api/assistants/import?cwd=${enc(root)}`)
      .then((r) => setFiles(r.files))
      .catch((e) => (toastError(e), setFiles([])));
  useEffect(() => {
    if (open) load();
  }, [open]);
  const take = async (body: { path?: string; text?: string; name?: string }, what: string) => {
    setBusy(what);
    try {
      const r = await post<AssistantsState & { assistant: Assistant }>('/api/assistants/import', body);
      saved(r);
      toast(`${r.assistant.name} is ready to pick on the start page`, 'ok');
      await load();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy('');
    }
  };
  return (
    <Dialog open={open} onClose={onClose} title="Import Claude Code agents" width={520}>
      <p className="mb-3 text-[13px] leading-relaxed text-fg-3">
        Agent files (<span className="font-mono text-[12px]">.claude/agents/*.md</span>) become assistants: their name, description, model and tools, and the text below as the instructions.
      </p>
      {!files ? (
        <Throbber className="text-fg-3" />
      ) : !files.length ? (
        <p className="text-[13px] text-fg-3">
          None in <span className="font-mono text-[12px]">~/.claude/agents</span> or <span className="font-mono text-[12px]">{tildify(root, home)}/.claude/agents</span>.
        </p>
      ) : (
        <div className="-my-1 divide-y divide-line">
          {files.map((f) => (
            <div key={f.path} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-[13.5px] font-medium">
                  <span className="truncate">{f.name}</span>
                  <Badge>{f.scope === 'user' ? 'Yours' : 'This folder'}</Badge>
                </div>
                <div className="truncate text-[12.5px] text-fg-3" title={f.path}>
                  {f.description || tildify(f.path, home)}
                </div>
              </div>
              <Button size="sm" variant={f.imported ? 'ghost' : 'secondary'} disabled={!!busy} onClick={() => take({ path: f.path }, f.path)}>
                {busy === f.path ? 'Importing…' : f.imported ? 'Update' : 'Import'}
              </Button>
            </div>
          ))}
        </div>
      )}
      <div className="mt-4 flex items-center gap-2 border-t border-line pt-3">
        <span className="min-w-0 flex-1 text-[12.5px] text-fg-3">Or an agent file from this device</span>
        <Button size="sm" variant="secondary" icon={<FileUp size={14} />} disabled={!!busy} onClick={() => fileRef.current?.click()}>
          {busy === 'upload' ? 'Importing…' : 'Choose a file'}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".md,text/markdown"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) await take({ text: await f.text(), name: f.name }, 'upload');
          }}
        />
      </div>
    </Dialog>
  );
}
