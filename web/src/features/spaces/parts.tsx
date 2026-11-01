// Pieces of spaces used on several pages: a space's coloured mark, the tabs over the spaces and the shared
// knowledge, the dialog that makes a new space (or a group of them) with the folders it works in, and the
// picker of a group's spaces.
import { useEffect, useRef, useState } from 'react';
import { Check, Folder, FolderPlus, Plus, X } from 'lucide-react';
import { isGroup, MAX_FOLDERS, MAX_GROUP, SPACE_COLORS, spaceColor, type Space } from '@shared/spaces';
import { FolderFinder } from '../../components/FolderPicker';
import { Button, cx, Dialog, inputCls, Popover, Tabs } from '../../components/ui';
import { post } from '../../lib/api';
import { basename, tildify } from '../../lib/format';
import { go } from '../../lib/nav';
import { toastError, useApp } from '../../lib/store';
import { loadSpaces, useSpaces } from './state';

/** Under the Spaces page's title: the spaces, and the documents every session searches. */
export function SpacesTabs({ tab }: { tab: 'spaces' | 'shared' }) {
  return (
    <Tabs
      value={tab}
      onChange={(t) => go(t === 'shared' ? '/knowledge' : '/spaces', true)}
      options={[
        { value: 'spaces', label: 'All spaces' },
        { value: 'shared', label: 'Shared knowledge' },
      ]}
    />
  );
}

/** A space's mark: a rounded square in its colour, with its first letter; a group's, with another behind it. */
export function SpaceMark({ s, size = 15, className }: { s: Pick<Space, 'name' | 'color'> & Partial<Pick<Space, 'members'>>; size?: number; className?: string }) {
  const c = spaceColor(s);
  const off = Math.max(2, Math.round(size / 8));
  return (
    <span
      className={cx('inline-flex shrink-0 items-center justify-center rounded-[4px] font-semibold', className)}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.62),
        background: `color-mix(in srgb, ${c} 22%, transparent)`,
        color: c,
        boxShadow: isGroup(s) ? `${off}px -${off}px 0 -1px color-mix(in srgb, ${c} 45%, transparent)` : undefined,
      }}
    >
      {[...s.name.trim()][0]?.toUpperCase() ?? 'S'}
    </span>
  );
}

/** "Thesis, Taxes 2026 and The garden": a group's spaces, by name. */
export function memberNames(s: Pick<Space, 'members'>, spaces: Space[] | null): string {
  const names = (s.members ?? []).map((id) => spaces?.find((x) => x.id === id)?.name).filter((n): n is string => !!n);
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : (names[0] ?? '');
}

/** The spaces a group brings together, each a chip to tap in or out (plain spaces only, not `self`). */
export function MemberPicker({ value, onChange, self }: { value: string[]; onChange: (ids: string[]) => void; self?: string }) {
  const spaces = useSpaces();
  const can = (spaces ?? []).filter((x) => x.id !== self && !isGroup(x));
  if (!can.length) return <div className="text-[12.5px] text-fg-3">Make a few spaces first: a group brings them together.</div>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {can.map((x) => {
        const on = value.includes(x.id);
        return (
          <button
            key={x.id}
            type="button"
            aria-pressed={on}
            disabled={!on && value.length >= MAX_GROUP}
            onClick={() => onChange(on ? value.filter((id) => id !== x.id) : [...value, x.id])}
            className={cx(
              'flex h-8 max-w-full min-w-0 items-center gap-1.5 rounded-full border pr-3 pl-1.5 text-[13px] transition-colors disabled:opacity-40',
              on ? 'border-accent/50 bg-accent-soft text-fg' : 'border-line bg-bg-1 text-fg-2 hover:bg-bg-2',
            )}
          >
            {on ? <Check size={14} className="shrink-0 text-accent" /> : <SpaceMark s={x} size={16} />}
            <span className="min-w-0 truncate">{x.name}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * A space's folders, as a list to change: its own (a new one, named for it, or one you have, `own`), then
 * those it works with besides, where they are (`also`). A folder is found by name or typed as a path.
 */
export function FolderList({ own, also, onOwn, onAlso, fixed }: { own: string | null; also: string[]; onOwn?: (p: string | null) => void; onAlso: (list: string[]) => void; fixed?: string }) {
  const home = useApp((s) => s.boot?.home);
  const [find, setFind] = useState<false | 'own' | 'also'>(false);
  const ownRef = useRef<HTMLButtonElement>(null);
  const alsoRef = useRef<HTMLButtonElement>(null);
  const row = 'flex h-10 min-w-0 items-center gap-2.5 px-3 text-[13.5px]';
  const anchor = find === 'own' ? ownRef : alsoRef;
  return (
    <div className="divide-y divide-line overflow-hidden rounded-[10px] border border-line-2 bg-bg-1">
      <div className={row}>
        {own || fixed ? <Folder size={15} className="shrink-0 text-accent/80" /> : <FolderPlus size={15} className="shrink-0 text-fg-3" />}
        <span translate={own || fixed ? 'no' : undefined} className={cx('min-w-0 flex-1 truncate', !own && !fixed && 'text-fg-2')} title={own ?? fixed}>
          {fixed ? tildify(fixed, home) : own ? tildify(own, home) : 'A new folder, named for it'}
        </span>
        {onOwn && (
          <>
            {own && (
              <button type="button" aria-label="Make a new folder for it instead" title="Make a new folder for it instead" onClick={() => onOwn(null)} className="rounded p-1 text-fg-3 hover:bg-bg-3 hover:text-fg">
                <X size={13} />
              </button>
            )}
            <button ref={ownRef} type="button" onClick={() => setFind((f) => (f === 'own' ? false : 'own'))} className="shrink-0 text-[12.5px] font-medium text-accent hover:underline">
              {own ? 'Change' : 'Use one you have'}
            </button>
          </>
        )}
      </div>
      {also.map((p) => (
        <div key={p} className={row}>
          <Folder size={15} className="shrink-0 text-fg-3" />
          <span translate="no" className="min-w-0 flex-1 truncate" title={p}>
            {tildify(p, home)}
          </span>
          <button type="button" aria-label={`Leave out ${basename(p)}`} title="Leave it out (the folder stays as it is)" onClick={() => onAlso(also.filter((x) => x !== p))} className="rounded p-1 text-fg-3 hover:bg-bg-3 hover:text-fg">
            <X size={13} />
          </button>
        </div>
      ))}
      {also.length < MAX_FOLDERS && (
        <button ref={alsoRef} type="button" onClick={() => setFind((f) => (f === 'also' ? false : 'also'))} className={cx(row, 'w-full text-left text-fg-2 transition-colors hover:bg-bg-2 hover:text-fg')}>
          <Plus size={15} className="shrink-0 text-fg-3" />
          {also.length ? 'Add another folder it works with' : 'Add a folder it works with, where it is'}
        </button>
      )}
      <Popover anchor={anchor} open={!!find} onClose={() => setFind(false)} width={340} align={find === 'own' ? 'end' : 'start'} title={find === 'own' ? 'Its folder' : 'A folder it works with'}>
        <FolderFinder
          value={find === 'own' ? own : null}
          autoFocus
          anchor={anchor}
          onPick={(p) => {
            setFind(false);
            if (find === 'own') onOwn?.(p);
            else if (!also.includes(p) && p !== own && p !== fixed) onAlso([...also, p]);
          }}
        />
      </Popover>
    </div>
  );
}

/**
 * A new space: its name, what it is about and anything every session in it should know. Its folder is made for
 * it, or is one you have; it can work with more of your folders, where they are. With `group`, a group of
 * spaces: the spaces it brings together too.
 */
export function NewSpaceDialog({ open, onClose, onMade, group }: { open: boolean; onClose: () => void; onMade?: (s: Space) => void; group?: boolean }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  const [color, setColor] = useState<string | undefined>();
  const [members, setMembers] = useState<string[]>([]);
  const [own, setOwn] = useState<string | null>(null);
  const [also, setAlso] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setName('');
    setDescription('');
    setInstructions('');
    setColor(undefined);
    setMembers([]);
    setOwn(null);
    setAlso([]);
  }, [open]);
  const ready = !!name.trim() && !busy && (!group || members.length > 0);
  const make = async () => {
    if (!ready) return;
    setBusy(true);
    try {
      const s = await post<Space>('/api/spaces', {
        name,
        description,
        instructions,
        ...(color ? { color } : {}),
        ...(group ? { members } : {}),
        ...(own ? { folder: own } : {}),
        ...(also.length ? { folders: also } : {}),
      });
      loadSpaces();
      onMade?.(s);
      onClose();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={group ? 'New group of spaces' : 'New space'}
      width={460}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void make()} disabled={!ready}>
            {group ? 'Make the group' : 'Make the space'}
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <div className="text-[13px] leading-relaxed text-fg-2">
          {group
            ? 'A group brings spaces together: sessions in it work with all of them, their files, documents and guidelines. It gets a folder of its own for what is made in it.'
            : 'A space keeps a project’s sessions, files, documents and memory together, with guidelines every agent in it follows. It gets a folder of its own, or works in one you have.'}
        </div>
        <label className="block">
          <span className="mb-1 block text-[13px] font-medium">Name</span>
          <input
            autoFocus
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={group ? 'Work, Everything for the thesis…' : 'Taxes 2026, The garden, Thesis…'}
            onKeyDown={(e) => e.key === 'Enter' && void make()}
          />
        </label>
        {group && (
          <div>
            <span className="mb-1.5 block text-[13px] font-medium">The spaces it brings together</span>
            <MemberPicker value={members} onChange={setMembers} />
          </div>
        )}
        <label className="block">
          <span className="mb-1 block text-[13px] font-medium">What it is about</span>
          <input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" />
        </label>
        <div>
          <span className="mb-1 block text-[13px] font-medium">Its folders</span>
          <FolderList
            own={own}
            also={also}
            onOwn={(p) => {
              setOwn(p);
              // A folder you have names the space, until you name it yourself.
              if (p && !name.trim()) setName(basename(p));
            }}
            onAlso={setAlso}
          />
          <span className="mt-1 block text-[12px] text-fg-3">Its sessions work in the first; they work with the others too, where they are.</span>
        </div>
        <label className="block">
          <span className="mb-1 block text-[13px] font-medium">Agent Guidelines: what every agent in it follows</span>
          <textarea
            rows={3}
            className={cx(inputCls, 'h-auto resize-none py-2 leading-relaxed')}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Optional: who it is for, how to work, what to keep in mind"
          />
        </label>
        <div className="flex items-center gap-1.5">
          {Object.keys(SPACE_COLORS).map((c) => (
            <button
              key={c}
              type="button"
              aria-label={c}
              onClick={() => setColor(c)}
              className={cx('h-6 w-6 rounded-full ring-offset-2 ring-offset-panel transition-shadow', color === c && 'ring-2 ring-fg-3')}
              style={{ background: SPACE_COLORS[c] }}
            />
          ))}
        </div>
      </div>
    </Dialog>
  );
}
