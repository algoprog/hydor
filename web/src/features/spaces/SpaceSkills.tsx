// A space's own skills, on its page's Skills tab: written methods only its sessions get (and those of the
// groups that bring it in), with the skill library, each in place of a library skill of the same name.
// Write one, copy one from the library to change for the space alone, change, rename or remove one (and
// bring it back); in a group, the skills of the spaces it brings together. Agents working in the space can
// propose one too: you approve it in the conversation (skillpack/ProposalCard).
import { useCallback, useEffect, useRef, useState } from 'react';
import { BookCopy, Pencil, Plus, RotateCcw, Sparkles, Trash2 } from 'lucide-react';
import { parseSkill, type LibrarySkill, type SkillDoc, type SkillLibrary, type SpaceSkill, type SpaceSkills } from '@shared/skillpack';
import type { Space } from '@shared/spaces';
import { api, del, enc, post, put } from '../../lib/api';
import { useFeatureEvent } from '../../lib/featureEvents';
import { ago } from '../../lib/format';
import { go } from '../../lib/nav';
import { toast, toastError } from '../../lib/store';
import { Badge, Button, cx, Dialog, IconButton, inputCls, Popover, Throbber, useConfirm, useSheets } from '../../components/ui';
import { SkillDialog } from '../skillpack/SkillView';
import { SpaceMark } from './parts';
import { loadSpaces, useSpaces } from './state';

const used = (k: SpaceSkill) => (k.uses ? `Used ${k.uses === 1 ? 'once' : `${k.uses} times`}${k.lastUsed ? `, last ${ago(k.lastUsed)}` : ''}` : 'Not used yet');

/** "Citation style" → citation-style, as the server names it. */
const slug = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);

/** A new skill for the space, or one of its skills to change (`name`): its name, when to use it, and the skill. */
function SkillEditor({ s, name, onClose, onSaved }: { s: Space; name?: string; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<{ name: string; description: string; body: string } | null>(name ? null : { name: '', description: '', body: '' });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!name) return;
    api<SkillDoc>(`/api/spaces/${enc(s.id)}/skills/${enc(name)}`).then(
      (d) => {
        const fm = parseSkill(d.text);
        setForm({ name, description: fm.description ?? '', body: fm.body.replace(/^\s*\n/, '') });
      },
      (e) => (toastError(e), onClose()),
    );
  }, [s.id, name]);
  const ready = !!form && !!slug(form.name) && !!form.description.trim() && !!form.body.trim() && !busy;
  const save = async () => {
    if (!form || !ready) return;
    setBusy(true);
    try {
      const body = { ...form, name: slug(form.name) };
      await (name ? put(`/api/spaces/${enc(s.id)}/skills/${enc(name)}`, body) : post(`/api/spaces/${enc(s.id)}/skills`, body));
      onSaved();
      onClose();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onClose={onClose}
      width={700}
      title={name ? `Change ${name}` : 'New skill'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={!ready} icon={busy ? <Throbber /> : undefined}>
            {name ? 'Save' : 'Add the skill'}
          </Button>
        </>
      }
    >
      {!form ? (
        <div className="flex justify-center py-10 text-fg-3">
          <Throbber size={24} />
        </div>
      ) : (
        <div className="space-y-3.5">
          <label className="block">
            <span className="mb-1 block text-[13px] font-medium">Name</span>
            <input
              autoFocus={!name}
              className={cx(inputCls, 'font-mono text-[13.5px]')}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              onBlur={() => setForm({ ...form, name: slug(form.name) })}
              placeholder="citation-style"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[13px] font-medium">When to use it</span>
            <input className={inputCls} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Use when citing a source in the thesis" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[13px] font-medium">The skill</span>
            <textarea
              rows={12}
              spellCheck={false}
              className={cx(inputCls, 'h-auto resize-y py-2 font-mono text-[13px] leading-relaxed')}
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              placeholder="The steps in order, the checks, and the mistakes to avoid"
            />
          </label>
        </div>
      )}
    </Dialog>
  );
}

/** "From the library": a skill of the library to copy into the space and change for it alone. */
function FromLibrary({ s, have, onCopied }: { s: Space; have: string[]; onCopied: (name: string) => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const phone = useSheets();
  const [open, setOpen] = useState(false);
  const [lib, setLib] = useState<LibrarySkill[] | null>(null);
  const [q, setQ] = useState('');
  useEffect(() => {
    if (!open) return;
    setQ('');
    api<SkillLibrary>('/api/skillpack').then((r) => setLib(r.skills), toastError);
  }, [open]);
  const find = q.trim().toLowerCase();
  const list = (lib ?? []).filter((k) => !have.includes(k.name) && (!find || k.name.includes(find) || k.description.toLowerCase().includes(find)));
  const shown = list.slice(0, 8);
  const copy = async (name: string) => {
    setOpen(false);
    try {
      await post(`/api/spaces/${enc(s.id)}/skills`, { from: name });
      onCopied(name);
    } catch (e) {
      toastError(e);
    }
  };
  return (
    <>
      <Button ref={ref} size="sm" variant="secondary" icon={<BookCopy size={14} />} onClick={() => setOpen((o) => !o)}>
        From the library
      </Button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={380} title="A skill from the library">
        <input autoFocus={!phone} className={cx(inputCls, 'mb-1 h-8.5 text-[13.5px]')} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a skill" />
        {!lib ? (
          <div className="flex justify-center py-4 text-fg-3">
            <Throbber />
          </div>
        ) : !list.length ? (
          <div className="px-2.5 py-2 text-[12.5px] text-fg-3">{find ? 'No skill of the library matches.' : 'The space has every skill of the library already.'}</div>
        ) : (
          <>
            {shown.map((k) => (
              <button
                key={k.name}
                type="button"
                title={k.description}
                onClick={() => void copy(k.name)}
                className="flex h-8.5 w-full min-w-0 items-center gap-2.5 rounded-lg px-2.5 text-left transition-colors hover:bg-bg-2"
              >
                <span translate="no" className="shrink-0 text-[13px]">
                  {k.name}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12px] text-fg-3">{k.description}</span>
              </button>
            ))}
            {list.length > shown.length && <div className="px-2.5 pt-1 pb-0.5 text-[11.5px] text-fg-3">{`${list.length - shown.length} more: type to find them`}</div>}
          </>
        )}
      </Popover>
    </>
  );
}

function SkillRow({ k, onOpen, onEdit, onRemove }: { k: SpaceSkill; onOpen: () => void; onEdit: () => void; onRemove: () => void }) {
  return (
    <div className="flex items-start gap-3 px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" translate="no" onClick={onOpen} className="min-w-0 truncate text-left text-[14px] font-medium hover:underline">
            {k.name}
          </button>
          {k.overrides && <Badge tone="info">In place of the library’s</Badge>}
        </div>
        {k.description && <div className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-fg-3">{k.description}</div>}
        <div className="mt-1 text-[11.5px] text-fg-3">
          {used(k)}
          {` · saved ${ago(k.updatedAt)}`}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        <IconButton label="Change" size="sm" onClick={onEdit}>
          <Pencil size={14} />
        </IconButton>
        <IconButton label="Remove" size="sm" onClick={onRemove}>
          <Trash2 size={14} />
        </IconButton>
      </div>
    </div>
  );
}

/** The Skills tab: the space's own skills, and in a group those of its spaces. */
export function SpaceSkillsTab({ s }: { s: Space }) {
  const spaces = useSpaces();
  const [st, setSt] = useState<SpaceSkills | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ name?: string } | null>(null);
  const [confirm, confirmNode] = useConfirm();
  const load = useCallback(() => api<SpaceSkills>(`/api/spaces/${enc(s.id)}/skills`).then(setSt, toastError), [s.id]);
  useEffect(() => {
    setSt(null);
    void load();
  }, [load]);
  // A proposal approved into the space, a change made elsewhere: the list follows.
  useFeatureEvent('skillpack', () => void load());
  const changed = () => {
    void load();
    loadSpaces();
  };
  const members = (s.members ?? []).map((id) => spaces?.find((x) => x.id === id)).filter((x): x is NonNullable<typeof x> => !!x);
  const remove = async (k: SpaceSkill) => {
    const ok = await confirm({
      title: `Remove ${k.name}?`,
      body: k.overrides ? 'The space’s sessions go back to the library’s skill of that name. You can bring this one back from this tab.' : 'The space’s sessions stop seeing it. You can bring it back from this tab.',
      confirm: 'Remove',
      danger: true,
    });
    if (!ok) return;
    try {
      await del(`/api/spaces/${enc(s.id)}/skills/${enc(k.name)}`);
      toast(`Removed ${k.name}`, 'ok');
    } catch (e) {
      toastError(e);
    }
    changed();
  };
  const restore = async (name: string) => {
    try {
      await post(`/api/spaces/${enc(s.id)}/skills/${enc(name)}/restore`);
      toast(`${name} is back`, 'ok');
    } catch (e) {
      toastError(e);
    }
    changed();
  };
  const actions = (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => setEdit({})}>
        New skill
      </Button>
      <FromLibrary
        s={s}
        have={st?.skills.map((k) => k.name) ?? []}
        onCopied={(name) => {
          changed();
          setEdit({ name });
        }}
      />
    </div>
  );
  return (
    <div className="mx-auto max-w-[880px] space-y-5">
      {members.length > 0 && (
        <div className="rounded-2xl border border-line bg-panel px-4 py-3.5">
          <div className="text-[13.5px] font-medium">Also the skills of the spaces it brings together</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {members.map((m) => (
              <button key={m.id} type="button" onClick={() => go(`/spaces/${m.id}/skills`)} className="flex h-7 min-w-0 items-center gap-1.5 rounded-full bg-bg-2 pr-2.5 pl-1.5 text-[12.5px] hover:bg-bg-3">
                <SpaceMark s={m} size={15} />
                <span translate="no" className="min-w-0 truncate">
                  {m.name}
                </span>
                <span className="tnum text-fg-3">{m.skills}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {!st ? (
        <div className="flex justify-center py-6 text-fg-3">
          <Throbber size={24} />
        </div>
      ) : !st.skills.length ? (
        <div className="flex flex-col items-center rounded-2xl border border-line bg-panel px-6 pt-6 pb-7 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-bg-2 text-fg-2">
            <Sparkles size={19} />
          </span>
          <div className="mt-3 text-[14px] font-semibold">None of its own</div>
          <p className="mt-1 max-w-[520px] text-[13px] leading-relaxed text-fg-3">
            Skills only this space’s sessions get, with your skill library: how its work is done, step by step. Agents load one when a task calls for it. A skill with the name of one in the library takes
            its place here.
          </p>
          <p className="mt-2 max-w-[520px] text-[12.5px] leading-relaxed text-fg-3">Agents working in the space can propose one too, after a task that took real effort: you approve it in the conversation.</p>
          <div className="mt-4">{actions}</div>
        </div>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-line bg-panel">
          <header className="flex min-h-12 flex-wrap items-center gap-2 px-4 py-2.5">
            <h2 className="text-[14.5px] font-semibold tracking-tight">Skills</h2>
            <span className="tnum rounded-md bg-bg-2 px-1.5 text-[11.5px] text-fg-3">{st.skills.length}</span>
            <span className="flex-1" />
            {actions}
          </header>
          <div className="divide-y divide-line border-t border-line">
            {st.skills.map((k) => (
              <SkillRow key={k.name} k={k} onOpen={() => setOpen(k.name)} onEdit={() => setEdit({ name: k.name })} onRemove={() => void remove(k)} />
            ))}
          </div>
        </section>
      )}
      {st && st.removed.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-fg-3">
          <span>Removed:</span>
          {st.removed.map((r) => (
            <button key={r.name} type="button" onClick={() => void restore(r.name)} className="inline-flex items-center gap-1 hover:text-fg" title={`Removed ${ago(r.at)}`}>
              <RotateCcw size={12} /> <span translate="no">{r.name}</span>
            </button>
          ))}
        </div>
      )}
      {open && (
        <SkillDialog
          name={open}
          space={s.id}
          onClose={() => setOpen(null)}
          onChange={() => {
            setEdit({ name: open });
            setOpen(null);
          }}
        />
      )}
      {edit && <SkillEditor s={s} name={edit.name} onClose={() => setEdit(null)} onSaved={changed} />}
      {confirmNode}
    </div>
  );
}
