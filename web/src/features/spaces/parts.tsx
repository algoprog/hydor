// Pieces of spaces used on several pages: a space's coloured mark, the tabs over the spaces and the shared
// knowledge, and the dialog that makes a new space.
import { useEffect, useState } from 'react';
import { SPACE_COLORS, spaceColor, type Space } from '@shared/spaces';
import { Button, cx, Dialog, inputCls, Tabs } from '../../components/ui';
import { post } from '../../lib/api';
import { go } from '../../lib/nav';
import { toastError } from '../../lib/store';
import { loadSpaces } from './state';

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

/** A space's mark: a rounded square in its colour, with its first letter. */
export function SpaceMark({ s, size = 15, className }: { s: Pick<Space, 'name' | 'color'>; size?: number; className?: string }) {
  const c = spaceColor(s);
  return (
    <span
      className={cx('inline-flex shrink-0 items-center justify-center rounded-[4px] font-semibold', className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.62), background: `color-mix(in srgb, ${c} 22%, transparent)`, color: c }}
    >
      {[...s.name.trim()][0]?.toUpperCase() ?? 'S'}
    </span>
  );
}

/** A new space: its name, what it is about and anything every session in it should know. Its folder is made for it. */
export function NewSpaceDialog({ open, onClose, onMade }: { open: boolean; onClose: () => void; onMade?: (s: Space) => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  const [color, setColor] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setName('');
    setDescription('');
    setInstructions('');
    setColor(undefined);
  }, [open]);
  const make = async () => {
    setBusy(true);
    try {
      const s = await post<Space>('/api/spaces', { name, description, instructions, ...(color ? { color } : {}) });
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
      title="New space"
      width={460}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void make()} disabled={!name.trim() || busy}>
            Make the space
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <div className="text-[13px] leading-relaxed text-fg-2">
          A space keeps a project’s sessions, files, documents and memory together, with instructions every agent in it gets. It gets a folder of its own.
        </div>
        <label className="block">
          <span className="mb-1 block text-[13px] font-medium">Name</span>
          <input autoFocus className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Taxes 2026, The garden, Thesis…" onKeyDown={(e) => e.key === 'Enter' && name.trim() && void make()} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[13px] font-medium">What it is about</span>
          <input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" />
        </label>
        <label className="block">
          <span className="mb-1 block text-[13px] font-medium">What every agent in it should know</span>
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
