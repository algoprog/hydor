// What the start page takes from assistants beyond the picker: the folder chip with "New task folder"
// (a fresh folder for the task, the default unless a folder is picked or the assistant works in
// projects, like Coder), and the agent, model and mode an assistant suggests, set when it is picked.
import { Children, useEffect, useRef, useState, type ReactNode } from 'react';
import { Folder, FolderPlus } from 'lucide-react';
import type { Space, SpaceView } from '@shared/spaces';
import { agentMode, type Assistant } from '@shared/assistants';
import { tierProgram } from '@shared/tiers';
import type { Agent } from '@shared/types';
import { post } from '../../lib/api';
import { tildify } from '../../lib/format';
import { useApp } from '../../lib/store';
import { folderName, useFolderNames } from '../../lib/folderNames';
import { FolderFinder } from '../../components/FolderPicker';
import { Popover, SettingChip, useSheets } from '../../components/ui';
import { SpaceMark } from '../spaces/parts';
import { assistantIn, lastAssistant, useAssistantsState } from './state';
import { useTierMap } from './agentsState';

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
 * "Folder  New task folder", the folder a new session works in, or the project it belongs to (its folder, by the
 * project's name); picking a folder turns the new one off. Its menu is a field to find any project or folder, over two
 * short lists: Projects (the five at work last, and the one picked; New makes one) and Folders (the folder in use and
 * the three picked last; Browse lists the home folder's), then a new task folder. A project's own folder is the
 * project: it shows only as the project. The menu opens on the side of the chip with more room and shows fewer folders,
 * then projects, until it fits. `children` go at the end: what goes with a folder of your own (a worktree); `note`
 * follows the folder's name ("· new worktree"). On a phone it is a sheet from the bottom, and the keyboard waits until
 * the field is tapped.
 */
export function WorkFolderChip({
  value,
  task,
  onFolder,
  onTask,
  note,
  children,
  space,
  spaces,
  onSpace,
  onNewSpace,
}: {
  value: string;
  task: boolean;
  onFolder: (path: string) => void;
  onTask: () => void;
  note?: string;
  children?: ReactNode;
  /** The project picked, when one is. */
  space?: SpaceView | null;
  /** All the projects; null while they load. */
  spaces?: SpaceView[] | null;
  onSpace?: (s: Space) => void;
  onNewSpace?: () => void;
}) {
  const home = useApp((s) => s.boot?.home) ?? '';
  const st = useAssistantsState();
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  // The side of the chip the menu opens on, and how tall it may be there.
  const [room, setRoom] = useState<{ prefer: 'above' | 'below'; fit: number }>({ prefer: 'below', fit: 0 });
  const phone = useSheets();
  const root = tildify(st?.taskRoot ?? `${home}/Hydor`, home);
  const extras = Children.toArray(children);
  useFolderNames((x) => x.mine);
  const nameOf = (p: string) => (p === home ? '~' : folderName(p, home));
  const toggle = () => {
    const a = ref.current?.getBoundingClientRect();
    if (!open && a) {
      const vh = window.innerHeight;
      const below = vh - a.bottom - 8;
      const above = a.top - 8;
      // A sheet from the bottom has the screen less its title; a menu, the side with more room less its edge.
      setRoom(phone ? { prefer: 'below', fit: vh - 150 } : { prefer: above > below ? 'above' : 'below', fit: Math.max(140, Math.max(above, below) - 6) - 10 });
    }
    setOpen((o) => !o);
  };
  const close = () => setOpen(false);
  const projects = [...(spaces ?? [])].sort((a, b) => (b.lastAt ?? b.createdAt) - (a.lastAt ?? a.createdAt));
  return (
    <>
      <SettingChip
        ref={ref}
        label={space ? 'Project' : 'Folder'}
        icon={space ? <SpaceMark s={space} size={14} /> : task ? <FolderPlus size={14} /> : <Folder size={14} />}
        open={open}
        onClick={toggle}
        title={space ? `The ${space.name} project: its sessions, files and memory, in ${tildify(space.folder, home)}` : task ? `A new folder for this task, in ${root}` : tildify(value, home)}
        value={space ? `${space.name}${note ? ` · ${note}` : ''}` : task ? 'New task folder' : `${nameOf(value)}${note ? ` · ${note}` : ''}`}
      />
      <Popover anchor={ref} open={open} onClose={close} width={Math.min(380, window.innerWidth - 16)} prefer={room.prefer} title="Project or folder to work in">
        <FolderFinder
          value={task || space ? null : value}
          placeholder="Find a project or folder, or type a path"
          lead={projects.map((sp) => ({
            key: `space:${sp.id}`,
            icon: <SpaceMark s={sp} />,
            name: sp.name,
            where: tildify(sp.folder, home),
            title: sp.description || `The ${sp.name} project: its sessions, files and memory`,
            on: space?.id === sp.id,
            owns: sp.folder,
            pick: () => {
              onSpace?.(sp);
              close();
            },
          }))}
          leadCount={5}
          groups={{
            lead: 'Projects',
            onNew: onNewSpace
              ? () => {
                  onNewSpace();
                  close();
                }
              : undefined,
            newTitle: 'New project: its sessions, files and memory together',
            empty: spaces ? 'A project keeps its sessions, files and memory together' : null,
          }}
          fit={room.fit || undefined}
          anchor={ref}
          autoFocus={!phone}
          onPick={(p) => {
            onFolder(p);
            close();
          }}
          more={[
            {
              key: 'task',
              icon: <FolderPlus size={15} />,
              name: 'New task folder',
              where: `a fresh one in ${root}`,
              title: `A fresh folder in ${root}, named for the task`,
              on: task,
              pick: () => {
                onTask();
                close();
              },
            },
          ]}
          footer={extras.length > 0 && <div onClick={(e) => (e.target as HTMLElement).closest('[data-closes]') && close()}>{extras}</div>}
        />
      </Popover>
    </>
  );
}

const sameAgent = (a: Assistant, agent: Agent, acpId: string | null) => a.agent === agent && (agent !== 'acp' || a.acpAgent === acpId);

/**
 * Picking an agent sets the program, model and mode it suggests (the model of the tier it thinks with, when it has one). Call it after the start page's own
 * choice of model and mode for an agent (from what it was last used with): each catalog of the agent
 * that arrives (`cat`) resets them to that, so the assistant's go on again after it. The pick the page
 * opens with changes nothing.
 */
export function useAssistantDefaults(
  id: string | undefined,
  o: { agent: Agent; acpId: string | null; cat: unknown; setAgent: (a: Agent) => void; setAcpId: (id: string | null) => void; setModel: (m: string | null) => void; setMode: (m: string | null) => void },
) {
  const st = useAssistantsState();
  const tiers = useTierMap();
  const pending = useRef<Assistant | null>(null);
  const seen = useRef<string | undefined>(undefined);
  const done = useRef<unknown>(null);
  useEffect(() => {
    if (id === seen.current) return;
    const first = seen.current === undefined;
    seen.current = id;
    const a = first ? undefined : assistantIn(st, id);
    pending.current = a && (a.agent || a.mode || a.tier) ? a : null;
    done.current = null;
    if (a?.agent && !sameAgent(a, o.agent, o.acpId)) {
      if (a.agent === 'acp') o.setAcpId(a.acpAgent ?? null);
      o.setAgent(a.agent);
    }
  }, [id]);
  useEffect(() => {
    const a = pending.current;
    if (!a || !o.cat || done.current === o.cat || (a.agent && !sameAgent(a, o.agent, o.acpId))) return;
    // A tier's model waits for the tiers to be known.
    if (a.tier && !tiers) return;
    done.current = o.cat;
    const prog = tierProgram(o.agent, o.acpId ?? undefined);
    const tierModel = a.tier && tiers && prog ? tiers[prog][a.tier].model : undefined;
    if (tierModel) o.setModel(tierModel);
    else if (a.agent && a.model) o.setModel(a.model);
    const m = agentMode(a.mode, o.agent, o.acpId ?? undefined);
    if (m) o.setMode(m);
  });
}
