// Pieces of spaces used on several pages: a space's coloured mark, the tabs over the spaces and the shared
// knowledge, the dialog that makes a new space (or a group of them), and the picker of a group's spaces.
import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { isGroup, MAX_GROUP, SPACE_COLORS, spaceColor, type Space } from '@shared/spaces';
import { Button, cx, Dialog, inputCls, Tabs } from '../../components/ui';
import { post } from '../../lib/api';
import { go } from '../../lib/nav';
import { toastError } from '../../lib/store';
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
 * A new space: its name, what it is about and anything every session in it should know. Its folder is made for
 * it. With `group`, a group of spaces: the spaces it brings together too.
 */
export function NewSpaceDialog({ open, onClose, onMade, group }: { open: boolean; onClose: () => void; onMade?: (s: Space) => void; group?: boolean }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  const [color, setColor] = useState<string | undefined>();
  const [members, setMembers] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setName('');
    setDescription('');
    setInstructions('');
    setColor(undefined);
    setMembers([]);
  }, [open]);
  const ready = !!name.trim() && !busy && (!group || members.length > 0);
  const make = async () => {
    if (!ready) return;
    setBusy(true);
    try {
      const s = await post<Space>('/api/spaces', { name, description, instructions, ...(color ? { color } : {}), ...(group ? { members } : {}) });
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
            : 'A space keeps a project’s sessions, files, documents and memory together, with guidelines every agent in it follows. It gets a folder of its own.'}
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
