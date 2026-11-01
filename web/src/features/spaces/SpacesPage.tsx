// Spaces: each project's sessions, files, memory, instructions and assistant together. The list, and a
// space's own page: start a session in it, its sessions, its files and memory, and what every agent in it
// is told. Picked by name on the start page in place of a folder.
import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { ArrowLeft, Brain, FolderOpen, LayoutGrid, Plus, SquarePen, Trash2 } from 'lucide-react';
import type { Space } from '@shared/spaces';
import { MAX_SPACE_INSTRUCTIONS, SPACE_COLORS } from '@shared/spaces';
import { AgentIcon } from '../../components/AgentIcon';
import { Button, cx, Empty, inputCls, Throbber, useConfirm } from '../../components/ui';
import { api, del, enc, patch } from '../../lib/api';
import { tildify, timeAgo } from '../../lib/format';
import { go, openSession, showInFiles } from '../../lib/nav';
import { saveStart } from '../../lib/start';
import { toastError, useApp, useSessions } from '../../lib/store';
import { PageHeader } from '../layout/PageHeader';
import { useAssistantsState } from '../assistants/state';
import { NewSpaceDialog, SpaceMark } from './parts';
import { loadSpaces, useSpaces } from './state';

/** The start page, with this space picked: its folder, its assistant. */
function startIn(s: Space) {
  saveStart({ space: s.id, cwd: s.folder, task: false, ...(s.assistant ? { assistant: s.assistant } : {}) }, true);
  go('/');
}

function List() {
  const spaces = useSpaces();
  const home = useApp((s) => s.boot?.home);
  const [made, setMade] = useState(false);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Spaces"
        sub="Each project’s sessions, files, memory and instructions, together"
        actions={
          <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => setMade(true)}>
            New space
          </Button>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[880px] px-3 py-5 sm:px-6">
          {!spaces ? (
            <div className="flex justify-center py-10 text-fg-3">
              <Throbber size={28} />
            </div>
          ) : !spaces.length ? (
            <Empty icon={<LayoutGrid size={22} />} title="No spaces yet">
              A space keeps one project together: its sessions, its files and what the agents remember about it, with instructions every agent in it gets. On the start page,
              pick it by name instead of a folder.
            </Empty>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {spaces.map((s) => (
                <button key={s.id} type="button" onClick={() => go(`/spaces/${s.id}`)} className="flex items-start gap-3 rounded-xl border border-line bg-panel p-3.5 text-left transition-colors hover:bg-bg-2">
                  <SpaceMark s={s} size={36} className="rounded-[10px]" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold">{s.name}</span>
                    <span className="block truncate text-[12.5px] text-fg-3">{s.description || tildify(s.folder, home)}</span>
                    <span className="mt-0.5 block text-[12px] text-fg-3">
                      {s.sessions} session{s.sessions === 1 ? '' : 's'}
                      {s.lastAt ? ` · ${timeAgo(s.lastAt)}` : ''}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <NewSpaceDialog open={made} onClose={() => setMade(false)} onMade={(s) => go(`/spaces/${s.id}`)} />
    </div>
  );
}

function Detail({ id }: { id: string }) {
  const [data, setData] = useState<{ space: Space; sessions: string[] } | null>(null);
  const [form, setForm] = useState<Partial<Space>>({});
  const [confirm, confirmNode] = useConfirm();
  const spaces = useSpaces();
  const assistants = useAssistantsState()?.assistants ?? [];
  const home = useApp((s) => s.boot?.home);
  const byKey = useSessions((s) => s.byKey);
  useEffect(() => {
    api<{ space: Space; sessions: string[] }>(`/api/spaces/${enc(id)}`).then((r) => {
      setData(r);
      setForm(r.space);
    }, toastError);
  }, [id, spaces]);
  if (!data)
    return (
      <div className="flex justify-center py-10 text-fg-3">
        <Throbber size={28} />
      </div>
    );
  const s = data.space;
  const dirty = (['name', 'description', 'instructions', 'assistant', 'color'] as const).some((k) => (form[k] ?? '') !== (s[k] ?? ''));
  const save = async () => {
    try {
      const next = await patch<Space>(`/api/spaces/${enc(s.id)}`, { name: form.name, description: form.description ?? '', instructions: form.instructions ?? '', assistant: form.assistant ?? '', color: form.color });
      setData({ ...data, space: next });
      loadSpaces();
    } catch (e) {
      toastError(e);
    }
  };
  const remove = async () => {
    if (!(await confirm({ title: `Delete the ${s.name} space?`, body: 'Its sessions and its folder stay as they are; they just no longer belong to a space.', confirm: 'Delete', danger: true }))) return;
    await del(`/api/spaces/${enc(s.id)}`).catch(toastError);
    loadSpaces();
    go('/spaces');
  };
  const sessions = data.sessions.map((k) => byKey[k]).filter(Boolean);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <SpaceMark s={form.name ? { name: form.name, color: form.color ?? s.color } : s} size={20} />
            {s.name}
          </span>
        }
        sub={s.description || 'Space'}
        actions={
          <>
            <Button size="sm" variant="ghost" icon={<ArrowLeft size={14} />} onClick={() => go('/spaces')}>
              <span className="max-sm:hidden">All spaces</span>
            </Button>
            <Button size="sm" icon={<SquarePen size={14} />} onClick={() => startIn(s)}>
              New session
            </Button>
          </>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[880px] space-y-6 px-3 py-5 sm:px-6">
          <section className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" icon={<FolderOpen size={14} />} onClick={() => showInFiles(s.folder)}>
              Its files
            </Button>
            <Button size="sm" variant="secondary" icon={<Brain size={14} />} onClick={() => go('/settings?s=memory')}>
              What agents remember
            </Button>
            <span className="self-center text-[12px] text-fg-3" title={s.folder}>
              {tildify(s.folder, home)}
            </span>
          </section>

          <section>
            <h2 className="mb-2 text-[13px] font-semibold">Sessions</h2>
            {sessions.length ? (
              <div className="divide-y divide-line overflow-hidden rounded-xl border border-line">
                {sessions.map((x) => (
                  <button key={x.key} type="button" onClick={() => openSession(x.key)} className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-bg-2">
                    <AgentIcon agent={x.agent} size={14} name={x.acpName} />
                    <span className="min-w-0 flex-1 truncate text-[13px]">{x.title}</span>
                    <span className="shrink-0 text-[12px] text-fg-3">{timeAgo(x.updatedAt)}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-[13px] text-fg-3">None yet. New session starts one here, with this space’s folder, assistant and instructions.</div>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-[13px] font-semibold">The space</h2>
            <label className="block">
              <span className="mb-1 block text-[12.5px] text-fg-2">Name</span>
              <input className={inputCls} value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[12.5px] text-fg-2">What it is about</span>
              <input className={inputCls} value={form.description ?? ''} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional" />
            </label>
            <label className="block">
              <span className="mb-1 block text-[12.5px] text-fg-2">What every agent in it should know</span>
              <textarea
                rows={5}
                maxLength={MAX_SPACE_INSTRUCTIONS}
                className={cx(inputCls, 'h-auto resize-y py-2 leading-relaxed')}
                value={form.instructions ?? ''}
                onChange={(e) => setForm({ ...form, instructions: e.target.value })}
                placeholder="Who it is for, how to work, what to keep in mind"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[12.5px] text-fg-2">Its sessions start as</span>
              <select className={cx(inputCls, 'pr-8')} value={form.assistant ?? ''} onChange={(e) => setForm({ ...form, assistant: e.target.value })}>
                <option value="">The assistant picked on the start page</option>
                {assistants.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-center gap-1.5">
              {Object.keys(SPACE_COLORS).map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={c}
                  onClick={() => setForm({ ...form, color: c })}
                  className={cx('h-6 w-6 rounded-full ring-offset-2 ring-offset-bg transition-shadow', (form.color ?? s.color) === c && 'ring-2 ring-fg-3')}
                  style={{ background: SPACE_COLORS[c] }}
                />
              ))}
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Button onClick={() => void save()} disabled={!dirty || !form.name?.trim()}>
                Save
              </Button>
              <span className="flex-1" />
              <Button variant="ghost" icon={<Trash2 size={14} />} onClick={() => void remove()}>
                Delete the space
              </Button>
            </div>
          </section>
        </div>
      </div>
      {confirmNode}
    </div>
  );
}

export function SpacesPage() {
  const [loc] = useLocation();
  const id = /^\/spaces\/([a-z0-9]+)$/.exec(loc)?.[1];
  return id ? <Detail id={id} /> : <List />;
}

