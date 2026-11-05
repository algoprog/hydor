// Pieces of spaces used on several pages: a space's coloured mark, the tabs over the spaces and the shared
// knowledge, the dialog that makes a new space (or a group of them) with the folders it works in, the picker
// of a group's spaces, and the folders worth a space (used lately, in no space yet).
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Check, ChevronRight, Folder, FolderOpen, Plus, X } from 'lucide-react';
import { isGroup, MAX_FOLDERS, MAX_GROUP, SPACE_COLORS, spaceColor, type Space, type SpaceSuggestion } from '@shared/spaces';
import { FolderFinder } from '../../components/FolderPicker';
import { Button, cx, Dialog, inputCls, Popover, Tabs } from '../../components/ui';
import { api, post } from '../../lib/api';
import { basename, tildify } from '../../lib/format';
import { go } from '../../lib/nav';
import { saveStart } from '../../lib/start';
import { toastError, useApp } from '../../lib/store';
import { loadSpaces, useSpaces } from './state';

/** Under the Spaces page's title: the spaces, and the documents every session searches. */
export function SpacesTabs({ tab }: { tab: 'spaces' | 'shared' }) {
  return (
    <Tabs
      value={tab}
      onChange={(t) => go(t === 'shared' ? '/knowledge' : '/projects', true)}
      options={[
        { value: 'spaces', label: 'All projects' },
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

/** The start page, with this space picked: its folder, its assistant (and a message in its box, to send or change). */
export function startInSpace(s: Space, prompt?: string) {
  saveStart({ space: s.id, cwd: s.folder, task: false, ...(s.assistant ? { assistant: s.assistant } : {}) }, true);
  go(prompt ? `/?prompt=${encodeURIComponent(prompt)}` : '/');
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
  if (!can.length) return <div className="text-[12.5px] text-fg-3">Make a few projects first: a group brings them together.</div>;
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
 * Folders sessions worked in lately, or changed files in, that no space has yet (the most used first): asked
 * again whenever the spaces change. Null until known.
 */
export function useSpaceSuggestions(): [SpaceSuggestion[] | null, (folder: string) => void] {
  const spaces = useSpaces();
  const [list, setList] = useState<SpaceSuggestion[] | null>(null);
  useEffect(() => {
    let alive = true;
    api<{ folders: SpaceSuggestion[] }>('/api/projects/suggestions').then(
      (r) => alive && setList(r.folders),
      () => alive && setList((l) => l ?? []),
    );
    return () => {
      alive = false;
    };
  }, [spaces]);
  const hide = (folder: string) => {
    setList((l) => l?.filter((x) => x.path !== folder) ?? null);
    post<{ folders: SpaceSuggestion[] }>('/api/projects/suggestions/hide', { folder }).then((r) => setList(r.folders), toastError);
  };
  return [list, hide];
}

/** A space's colour: its mark, which opens the colours to pick from. */
function ColorPick({ name, color, onChange }: { name: string; color: string; onChange: (c: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={ref} type="button" aria-label="Its colour" title="Its colour" onClick={() => setOpen((o) => !o)} className="shrink-0 rounded-[10px] transition-opacity hover:opacity-80">
        <SpaceMark s={{ name: name.trim() || 'S', color }} size={38} className="rounded-[10px]" />
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={196} title="Its colour">
        <div className="grid grid-cols-4 gap-2 p-3">
          {Object.keys(SPACE_COLORS).map((c) => (
            <button
              key={c}
              type="button"
              aria-label={c}
              onClick={() => {
                onChange(c);
                setOpen(false);
              }}
              className={cx('h-8 w-8 rounded-full ring-offset-2 ring-offset-panel transition-shadow', color === c && 'ring-2 ring-fg-3')}
              style={{ background: SPACE_COLORS[c] }}
            />
          ))}
        </div>
      </Popover>
    </>
  );
}

/** One of the two answers to "Where do its files go?". */
function Choice({ on, onPick, title, sub, children }: { on: boolean; onPick: () => void; title: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className={cx('rounded-[10px] border transition-colors', on ? 'border-accent/50 bg-accent-soft/40' : 'border-line-2 bg-bg-1 hover:bg-bg-2')}>
      <button type="button" role="radio" aria-checked={on} onClick={onPick} className="flex w-full min-w-0 items-start gap-2.5 px-3 py-2.5 text-left">
        <span className={cx('mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border', on ? 'border-accent' : 'border-line-2')}>
          {on && <span className="h-2 w-2 rounded-full bg-accent" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-medium">{title}</span>
          {sub && <span className="block text-[12.5px] text-fg-3">{sub}</span>}
        </span>
      </button>
      {children}
    </div>
  );
}

/** A folder picked in a popover over `anchor`, found by name or typed as a path. */
function FindFolder({ anchor, open, onClose, onPick, title, value }: { anchor: RefObject<HTMLElement | null>; open: boolean; onClose: () => void; onPick: (p: string) => void; title: string; value?: string | null }) {
  return (
    <Popover anchor={anchor} open={open} onClose={onClose} width={340} title={title}>
      <FolderFinder
        value={value ?? null}
        autoFocus
        anchor={anchor}
        onPick={(p) => {
          onClose();
          onPick(p);
        }}
      />
    </Popover>
  );
}

/** Folders of yours a space also works with, where they are: each to leave out, and one more to add. */
function OtherFolders({ list, onChange, skip }: { list: string[]; onChange: (l: string[]) => void; skip: (string | null)[] }) {
  const home = useApp((s) => s.boot?.home);
  const [find, setFind] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const row = 'flex h-9 min-w-0 items-center gap-2.5 px-3 text-[13px]';
  return (
    <div className="divide-y divide-line overflow-hidden rounded-[10px] border border-line-2 bg-bg-1">
      {list.map((p) => (
        <div key={p} className={row}>
          <Folder size={15} className="shrink-0 text-fg-3" />
          <span translate="no" className="min-w-0 flex-1 truncate" title={p}>
            {tildify(p, home)}
          </span>
          <button type="button" aria-label={`Leave out ${basename(p)}`} title="Leave it out (the folder stays as it is)" onClick={() => onChange(list.filter((x) => x !== p))} className="rounded p-1 text-fg-3 hover:bg-bg-3 hover:text-fg">
            <X size={13} />
          </button>
        </div>
      ))}
      {list.length < MAX_FOLDERS && (
        <button ref={ref} type="button" onClick={() => setFind((f) => !f)} className={cx(row, 'w-full text-left text-fg-2 transition-colors hover:bg-bg-2 hover:text-fg')}>
          <Plus size={15} className="shrink-0 text-fg-3" />
          Add a folder
        </button>
      )}
      <FindFolder anchor={ref} open={find} onClose={() => setFind(false)} title="A folder it also uses" onPick={(p) => !list.includes(p) && !skip.includes(p) && onChange([...list, p])} />
    </div>
  );
}

/**
 * A new space: its name and colour, and where its files go: a new folder made for it, or one you have (the
 * folders you worked in lately, that no space has, a tap away). What it is about, its Agent Guidelines and
 * other folders it uses are under More options. With `group`, a group of spaces: the spaces it brings together
 * too. `folder`: the folder it starts with (a suggestion on the Spaces page).
 */
export function NewSpaceDialog({ open, onClose, onMade, group, folder }: { open: boolean; onClose: () => void; onMade?: (s: Space) => void; group?: boolean; folder?: string }) {
  const home = useApp((s) => s.boot?.home);
  const spaces = useSpaces();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  const [color, setColor] = useState<string | undefined>();
  const [members, setMembers] = useState<string[]>([]);
  // Where its files go: a new folder, or one you have (`mine`, then `own` once picked).
  const [mine, setMine] = useState(false);
  const [own, setOwn] = useState<string | null>(null);
  const [also, setAlso] = useState<string[]>([]);
  const [more, setMore] = useState(false);
  const [find, setFind] = useState(false);
  const [busy, setBusy] = useState(false);
  const findRef = useRef<HTMLButtonElement>(null);
  const [suggested] = useSpaceSuggestions();
  useEffect(() => {
    if (!open) return;
    setName(folder ? basename(folder) : '');
    setDescription('');
    setInstructions('');
    setColor(undefined);
    setMembers([]);
    setMine(!!folder);
    setOwn(folder ?? null);
    setAlso([]);
    setMore(false);
    setFind(false);
  }, [open, folder]);
  // The colour it gets unless one is picked: the next one no space has (as the server picks it).
  const used = new Set((spaces ?? []).map((x) => x.color));
  const shown = color ?? Object.keys(SPACE_COLORS).find((c) => !used.has(c)) ?? Object.keys(SPACE_COLORS)[(spaces?.length ?? 0) % Object.keys(SPACE_COLORS).length];
  const ready = !!name.trim() && !busy && (!group || members.length > 0) && (!mine || !!own);
  const pickOwn = (p: string) => {
    setMine(true);
    setOwn(p);
    setAlso((l) => l.filter((x) => x !== p));
    // A folder you have names the space, until you name it yourself.
    if (!name.trim()) setName(basename(p));
  };
  const make = async () => {
    if (!ready) return;
    setBusy(true);
    try {
      const s = await post<Space>('/api/projects', {
        name,
        description,
        instructions,
        color: shown,
        ...(group ? { members } : {}),
        ...(mine && own ? { folder: own } : {}),
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
  const chips = (suggested ?? []).filter((x) => x.path !== own).slice(0, 4);
  const label = 'mb-1.5 block text-[13px] font-medium';
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={group ? 'New group of projects' : 'New project'}
      width={460}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void make()} disabled={!ready}>
            {group ? 'Make the group' : 'Make the project'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="text-[13px] leading-relaxed text-fg-2">
          {group
            ? 'A group brings projects together: sessions in it work with all of them, their files, documents and guidelines.'
            : 'A project keeps one piece of work together: its sessions, files, documents and what agents remember about it.'}
        </div>
        <label className="block">
          <span className={label}>Name</span>
          <span className="flex items-center gap-2.5">
            <ColorPick name={name} color={shown} onChange={setColor} />
            <input
              autoFocus
              className={inputCls}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={group ? 'Work, Everything for the thesis…' : 'Taxes 2026, The garden, Thesis…'}
              onKeyDown={(e) => e.key === 'Enter' && void make()}
            />
          </span>
        </label>
        {group && (
          <div>
            <span className={label}>The projects it brings together</span>
            <MemberPicker value={members} onChange={setMembers} />
          </div>
        )}
        <div role="radiogroup" aria-label="Where its files go">
          <span className={label}>Where its files go</span>
          <div className="space-y-2">
            <Choice on={!mine} onPick={() => setMine(false)} title="In a new folder" sub="Made for it and named after it" />
            <Choice
              on={mine}
              onPick={() => {
                setMine(true);
                if (!own && !chips.length) setFind(true);
              }}
              title="In a folder I already have"
              sub={mine && own ? undefined : 'A project or a folder of documents: it stays where it is'}
            >
              {mine && (
                <div className="space-y-2 px-3 pb-3 pl-9">
                  {own ? (
                    <div className="flex h-9 min-w-0 items-center gap-2 rounded-lg border border-line bg-bg px-2.5 text-[13px]">
                      <Folder size={15} className="shrink-0 text-accent/80" />
                      <span translate="no" className="min-w-0 flex-1 truncate" title={own}>
                        {tildify(own, home)}
                      </span>
                      <button ref={findRef} type="button" onClick={() => setFind((f) => !f)} className="shrink-0 text-[12.5px] font-medium text-accent hover:underline">
                        Change
                      </button>
                    </div>
                  ) : (
                    <Button ref={findRef} size="sm" variant="secondary" icon={<FolderOpen size={14} />} onClick={() => setFind((f) => !f)}>
                      Choose a folder…
                    </Button>
                  )}
                  {chips.length > 0 && (
                    <div>
                      <div className="mb-1 text-[12px] text-fg-3">Used lately, in no project yet</div>
                      <div className="flex flex-wrap gap-1.5">
                        {chips.map((x) => (
                          <button
                            key={x.path}
                            type="button"
                            title={tildify(x.path, home)}
                            onClick={() => pickOwn(x.path)}
                            className="flex h-7 max-w-full min-w-0 items-center gap-1.5 rounded-full border border-line bg-bg px-2.5 text-[12.5px] text-fg-2 transition-colors hover:bg-bg-2 hover:text-fg"
                          >
                            <Folder size={13} className="shrink-0 text-fg-3" />
                            <span translate="no" className="min-w-0 truncate">
                              {basename(x.path)}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </Choice>
          </div>
          <FindFolder anchor={findRef} open={find} onClose={() => setFind(false)} title="Its folder" value={own} onPick={pickOwn} />
        </div>
        <div>
          <button type="button" aria-expanded={more} onClick={() => setMore((m) => !m)} className="flex items-center gap-1 text-[13px] font-medium text-fg-2 hover:text-fg">
            <ChevronRight size={15} className={cx('transition-transform', more && 'rotate-90')} />
            More options
            {!more && (description.trim() || instructions.trim() || also.length) ? <span className="ml-1 h-1.5 w-1.5 rounded-full bg-accent" /> : null}
          </button>
          {more && (
            <div className="mt-3 space-y-4">
              <label className="block">
                <span className={label}>What it is about</span>
                <input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="A line shown under its name" />
              </label>
              <label className="block">
                <span className={label}>Agent Guidelines</span>
                <textarea
                  rows={3}
                  className={cx(inputCls, 'h-auto resize-none py-2 leading-relaxed')}
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder="What every agent in it should follow: who it is for, how to work, what to keep in mind"
                />
              </label>
              <div>
                <span className={label}>Other folders it uses</span>
                <OtherFolders list={also} onChange={setAlso} skip={[mine ? own : null]} />
                <span className="mt-1 block text-[12px] text-fg-3">Its agents can work with these too, where they are.</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}
