// Spaces: each project's sessions, files, documents, memory, guidelines, skills and assistant together. The
// list (beside the shared knowledge, on the page's second tab), and a space's own page: start a session in it,
// its sessions and memory; its files (its folder and the folders it works with, SpaceFiles); its knowledge
// (documents only its sessions search, with the shared ones too unless it leaves them out); its skills (only
// its sessions get them, with the library's, SpaceSkills); and what every agent in it is told. A group brings
// spaces together: its sessions work with all of them. Picked by name on the start page in place of a folder.
import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { ArrowLeft, Boxes, Brain, FolderOpen, FolderPlus, Layers, Plus, SquarePen, Trash2 } from 'lucide-react';
import type { KnowledgeBase } from '@shared/knowledge';
import type { Space } from '@shared/spaces';
import { isGroup, MAX_SPACE_INSTRUCTIONS, SPACE_COLORS } from '@shared/spaces';
import { AgentIcon } from '../../components/AgentIcon';
import { Button, cx, Empty, inputCls, Switch, Tabs, Throbber, useConfirm, useMediaQuery } from '../../components/ui';
import { api, del, enc, patch, post } from '../../lib/api';
import { tildify, timeAgo } from '../../lib/format';
import { go, openSession } from '../../lib/nav';
import { toastError, useApp, useSessions } from '../../lib/store';
import type { PickedFile } from '../../lib/upload';
import { PageHeader } from '../layout/PageHeader';
import { useAssistantsState } from '../assistants/state';
import { addFiles, BaseCard, DropFiles, MeaningHint, TrySearch, useKnowledge } from '../knowledge/parts';
import { MemberPicker, memberNames, NewSpaceDialog, SpaceMark, SpacesTabs, startInSpace } from './parts';
import { SpaceFiles } from './SpaceFiles';
import { SpaceSkillsTab } from './SpaceSkills';
import { loadSpaces, useSpaces } from './state';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function List() {
  const spaces = useSpaces();
  const home = useApp((s) => s.boot?.home);
  const [made, setMade] = useState<false | 'space' | 'group'>(false);
  const plain = (spaces ?? []).filter((s) => !isGroup(s)).length;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Spaces"
        tip="spaces"
        sub="Each project’s sessions, documents and guidelines, together"
        actions={
          <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => setMade('space')}>
            New space
          </Button>
        }
      >
        <SpacesTabs tab="spaces" />
      </PageHeader>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[880px] px-3 py-5 sm:px-6">
          {!spaces ? (
            <div className="flex justify-center py-10 text-fg-3">
              <Throbber size={28} />
            </div>
          ) : !spaces.length ? (
            <Empty icon={<Boxes size={22} />} title="No spaces yet">
              A space keeps one project together: its sessions, its files and documents, and what the agents remember about it, with guidelines every agent in it follows. On the
              start page, pick it by name instead of a folder.
            </Empty>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {spaces.map((s) => (
                <button key={s.id} type="button" onClick={() => go(`/spaces/${s.id}`)} className="flex items-start gap-3 rounded-xl border border-line bg-panel p-3.5 text-left transition-colors hover:bg-bg-2">
                  <SpaceMark s={s} size={36} className="rounded-[10px]" />
                  <span className="min-w-0 flex-1">
                    <span translate="no" className="block truncate text-[14px] font-semibold">
                      {s.name}
                    </span>
                    <span translate={isGroup(s) ? undefined : 'no'} className="block truncate text-[12.5px] text-fg-3">
                      {isGroup(s) ? `Brings together ${memberNames(s, spaces)}` : s.description || tildify(s.folder, home)}
                    </span>
                    <span className="mt-0.5 block text-[12px] text-fg-3">
                      <span>
                        {s.sessions} session{s.sessions === 1 ? '' : 's'}
                      </span>
                      {s.docs > 0 && (
                        <>
                          {' · '}
                          <span>
                            {s.docs} document{s.docs === 1 ? '' : 's'}
                          </span>
                        </>
                      )}
                      {s.skills > 0 && (
                        <>
                          {' · '}
                          <span>
                            {s.skills} skill{s.skills === 1 ? '' : 's'}
                          </span>
                        </>
                      )}
                      {s.lastAt ? ` · ${timeAgo(s.lastAt)}` : ''}
                    </span>
                  </span>
                </button>
              ))}
              {plain >= 2 && (
                <button
                  type="button"
                  onClick={() => setMade('group')}
                  className="flex items-start gap-3 rounded-xl border border-dashed border-line-2 p-3.5 text-left text-fg-2 transition-colors hover:bg-bg-2 hover:text-fg"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-bg-2 text-fg-3">
                    <Layers size={17} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-semibold">Group spaces together</span>
                    <span className="block text-[12.5px] text-fg-3">Sessions in a group work with all its spaces: their files, documents and guidelines</span>
                  </span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      <NewSpaceDialog open={!!made} group={made === 'group'} onClose={() => setMade(false)} onMade={(s) => go(`/spaces/${s.id}`)} />
    </div>
  );
}

type Tab = 'sessions' | 'files' | 'knowledge' | 'skills' | 'settings';

/** A space's sessions, with its folder and what its agents remember. */
function SessionsTab({ s, keys }: { s: Space; keys: string[] }) {
  const home = useApp((x) => x.boot?.home);
  const byKey = useSessions((x) => x.byKey);
  const sessions = keys.map((k) => byKey[k]).filter(Boolean);
  return (
    <div className="space-y-6">
      <section className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" icon={<FolderOpen size={14} />} onClick={() => go(`/spaces/${s.id}/files`, true)}>
          Its files
        </Button>
        <Button size="sm" variant="secondary" icon={<Brain size={14} />} onClick={() => go('/settings?s=memory')}>
          What agents remember
        </Button>
        <span className="self-center text-[12px] text-fg-3" title={s.folder}>
          {tildify(s.folder, home)}
        </span>
      </section>
      {sessions.length ? (
        <div className="divide-y divide-line overflow-hidden rounded-xl border border-line">
          {sessions.map((x) => (
            <button key={x.key} type="button" onClick={() => openSession(x.key)} className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-bg-2">
              <AgentIcon agent={x.agent} size={14} name={x.acpName} />
              <span translate="no" className="min-w-0 flex-1 truncate text-[13px]">
                {x.title}
              </span>
              <span className="shrink-0 text-[12px] text-fg-3">{timeAgo(x.updatedAt)}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="text-[13px] text-fg-3">No sessions yet. New session starts one here, with this space’s folder, assistant, guidelines and skills.</div>
      )}
    </div>
  );
}

/** Documents only this space's sessions search, and whether they search the shared ones too. */
function KnowledgeTab({ s, onSaved }: { s: Space; onSaved: (next: Space) => void }) {
  const [st, load] = useKnowledge();
  const spaces = useSpaces();
  const own = st?.bases.filter((b) => b.space === s.id) ?? [];
  const sharedDocs = (st?.bases ?? []).filter((b) => !b.space || (spaces && !spaces.some((x) => x.id === b.space))).reduce((n, b) => n + b.docs, 0);
  const useShared = s.sharedKnowledge !== false;
  const members = (s.members ?? []).map((id) => spaces?.find((x) => x.id === id)).filter((x): x is NonNullable<typeof x> => !!x);
  const setShared = async (on: boolean) => {
    try {
      onSaved(await patch<Space>(`/api/spaces/${enc(s.id)}`, { sharedKnowledge: on }));
      loadSpaces();
    } catch (e) {
      toastError(e);
    }
  };
  const newBase = async () => {
    try {
      await post('/api/knowledge', { name: own.length ? 'New knowledge base' : s.name, space: s.id });
      load();
    } catch (e) {
      toastError(e);
    }
  };
  /** Files dropped before the space has a base: one is made for them, named for the space. */
  const firstFiles = async (picked: PickedFile[]) => {
    try {
      const b = await post<KnowledgeBase>('/api/knowledge', { name: s.name, space: s.id });
      await addFiles(b, picked);
      load();
    } catch (e) {
      toastError(e);
    }
  };
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 rounded-xl border border-line bg-panel px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-medium">Also search the shared knowledge</div>
          <div className="text-[12.5px] text-fg-3">
            {sharedDocs ? `${plural(sharedDocs, 'document', 'documents')} every session can search` : 'Documents every session can search'}
            {' · '}
            <button type="button" onClick={() => go('/knowledge')} className="font-medium text-accent hover:underline">
              Shared knowledge
            </button>
          </div>
        </div>
        <Switch on={useShared} label="Also search the shared knowledge" onChange={(v) => void setShared(v)} />
      </div>
      {members.length > 0 && (
        <div className="rounded-xl border border-line bg-panel px-4 py-3">
          <div className="text-[13.5px] font-medium">Also the documents of the spaces it brings together</div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {members.map((m) => (
              <button key={m.id} type="button" onClick={() => go(`/spaces/${m.id}/knowledge`)} className="flex h-7 min-w-0 items-center gap-1.5 rounded-full bg-bg-2 pr-2.5 pl-1.5 text-[12.5px] hover:bg-bg-3">
                <SpaceMark s={m} size={15} />
                <span translate="no" className="min-w-0 truncate">
                  {m.name}
                </span>
                <span className="tnum text-fg-3">{m.docs}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {!st ? (
        <div className="flex justify-center py-6 text-fg-3">
          <Throbber size={24} />
        </div>
      ) : !own.length ? (
        <div className="space-y-4">
          <div className="text-[13.5px] leading-relaxed text-fg-2">
            {members.length
              ? 'Documents of the group’s own, beside those of its spaces: papers, contracts, notes, a whole folder. Agents find passages by their words or what they mean, and cite the file and page they read.'
              : 'Documents only this space’s sessions search: papers, contracts, notes, a whole folder. Agents find passages by their words or what they mean, and cite the file and page they read.'}
          </div>
          <DropFiles big onFiles={(p) => void firstFiles(p)} />
          <div className="text-center">
            <Button variant="ghost" icon={<FolderPlus size={14} />} onClick={() => void newBase()}>
              Start with a folder on this computer instead
            </Button>
          </div>
        </div>
      ) : (
        <>
          <TrySearch space={s.id} />
          {!st.meaning && <MeaningHint />}
          {own.map((b) => (
            <BaseCard key={b.id} b={b} meaning={st.meaning} />
          ))}
          <Button size="sm" variant="ghost" icon={<Plus size={14} />} onClick={() => void newBase()}>
            New knowledge base
          </Button>
        </>
      )}
    </div>
  );
}

/** The space itself: its name, what it is about, what its agents are told, the assistant they start as, its colour. */
function SettingsTab({ s, onSaved }: { s: Space; onSaved: (next: Space) => void }) {
  const [form, setForm] = useState<Partial<Space>>(s);
  const [confirm, confirmNode] = useConfirm();
  const assistants = useAssistantsState()?.assistants ?? [];
  const spaces = useSpaces();
  // A space in a group stays a plain space (groups are one level deep).
  const inGroups = (spaces ?? []).filter((x) => x.members?.includes(s.id));
  useEffect(() => setForm(s), [s]);
  const sameMembers = (form.members ?? []).join() === (s.members ?? []).join();
  const dirty = !sameMembers || (['name', 'description', 'instructions', 'assistant', 'color'] as const).some((k) => (form[k] ?? '') !== (s[k] ?? ''));
  const save = async () => {
    try {
      onSaved(
        await patch<Space>(`/api/spaces/${enc(s.id)}`, {
          name: form.name,
          description: form.description ?? '',
          instructions: form.instructions ?? '',
          assistant: form.assistant ?? '',
          color: form.color,
          ...(sameMembers ? {} : { members: form.members ?? [] }),
        }),
      );
      loadSpaces();
    } catch (e) {
      toastError(e);
    }
  };
  const remove = async () => {
    const ok = await confirm({
      title: `Delete the ${s.name} space?`,
      body: 'Its sessions, folder, documents and skills stay. The sessions and folder just no longer belong to a space, its knowledge moves to the shared knowledge, and its skills to your skill library.',
      confirm: 'Delete',
      danger: true,
    });
    if (!ok) return;
    await del(`/api/spaces/${enc(s.id)}`).catch(toastError);
    loadSpaces();
    go('/spaces');
  };
  return (
    <section className="space-y-3">
      <label className="block">
        <span className="mb-1 block text-[12.5px] text-fg-2">Name</span>
        <input className={inputCls} value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </label>
      <label className="block">
        <span className="mb-1 block text-[12.5px] text-fg-2">What it is about</span>
        <input className={inputCls} value={form.description ?? ''} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional" />
      </label>
      <label className="block">
        <span className="mb-1 block text-[12.5px] text-fg-2">Agent Guidelines: what every agent in it follows</span>
        <textarea
          rows={5}
          maxLength={MAX_SPACE_INSTRUCTIONS}
          className={cx(inputCls, 'h-auto resize-y py-2 leading-relaxed')}
          value={form.instructions ?? ''}
          onChange={(e) => setForm({ ...form, instructions: e.target.value })}
          placeholder="Who it is for, how to work, what to keep in mind"
        />
      </label>
      <div>
        <span className="mb-1.5 block text-[12.5px] text-fg-2">The spaces it brings together</span>
        {inGroups.length ? (
          <div className="text-[12.5px] text-fg-3">
            It is in {inGroups.map((g) => g.name).join(', ')}, so it cannot bring other spaces together itself.
          </div>
        ) : (
          <MemberPicker value={form.members ?? []} onChange={(members) => setForm({ ...form, members })} self={s.id} />
        )}
      </div>
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
      {confirmNode}
    </section>
  );
}

function Detail({ id, tab }: { id: string; tab: Tab }) {
  const [data, setData] = useState<{ space: Space; sessions: string[] } | null>(null);
  const spaces = useSpaces();
  const docs = spaces?.find((x) => x.id === id)?.docs ?? 0;
  const skills = spaces?.find((x) => x.id === id)?.skills ?? 0;
  // Five tabs fit a phone's width without their counts (and the smallest phones', closer together).
  const counts = useMediaQuery('(min-width: 440px)');
  useEffect(() => {
    api<{ space: Space; sessions: string[] }>(`/api/spaces/${enc(id)}`).then(setData, toastError);
  }, [id, spaces]);
  if (!data)
    return (
      <div className="flex justify-center py-10 text-fg-3">
        <Throbber size={28} />
      </div>
    );
  const s = data.space;
  const saved = (next: Space) => setData({ ...data, space: next });
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title={
          <span translate="no" className="flex items-center gap-2">
            <SpaceMark s={s} size={20} />
            {s.name}
          </span>
        }
        sub={isGroup(s) ? `Brings together ${memberNames(s, spaces)}` : s.description ? <span translate="no">{s.description}</span> : 'Space'}
        actions={
          <>
            <Button size="sm" variant="ghost" icon={<ArrowLeft size={14} />} onClick={() => go('/spaces')}>
              <span className="max-sm:hidden">All spaces</span>
            </Button>
            <Button size="sm" icon={<SquarePen size={14} />} onClick={() => startInSpace(s)}>
              New session
            </Button>
          </>
        }
      >
        <Tabs
          value={tab}
          className="max-[374px]:gap-0"
          onChange={(t) => go(`/spaces/${s.id}${t === 'sessions' ? '' : `/${t}`}`, true)}
          options={[
            { value: 'sessions', label: 'Sessions', count: counts ? data.sessions.length : undefined },
            { value: 'files', label: 'Files' },
            { value: 'knowledge', label: 'Knowledge', count: counts ? docs : undefined },
            { value: 'skills', label: 'Skills', count: counts ? skills : undefined },
            { value: 'settings', label: 'Settings' },
          ]}
        />
      </PageHeader>
      {tab === 'files' ? (
        // The folder scrolls in its own box, so the page keeps its height.
        <div className="min-h-0 flex-1">
          <div className="mx-auto h-full max-w-[1100px] px-3 pt-4 pb-3 sm:px-6">
            <SpaceFiles s={s} onSaved={saved} />
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[880px] px-3 py-5 sm:px-6">
            {tab === 'knowledge' ? (
              <KnowledgeTab s={s} onSaved={saved} />
            ) : tab === 'skills' ? (
              <SpaceSkillsTab s={s} />
            ) : tab === 'settings' ? (
              <SettingsTab s={s} onSaved={saved} />
            ) : (
              <SessionsTab s={s} keys={data.sessions} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function SpacesPage() {
  const [loc] = useLocation();
  const m = /^\/spaces\/([a-z0-9]+)(?:\/(files|knowledge|skills|settings))?$/.exec(loc);
  return m ? <Detail id={m[1]} tab={(m[2] as Tab | undefined) ?? 'sessions'} /> : <List />;
}
