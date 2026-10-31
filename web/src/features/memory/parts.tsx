// Small pieces the memory note, the session menu and Settings → Memory share.
import { useEffect, useRef, useState } from 'react';
import { Brain } from 'lucide-react';
import { Badge, Button, cx, inputCls, MenuItem } from '../../components/ui';
import type { MemoryChange } from '@shared/memory';
import { setSessionMemory } from './state';

/** "Memory for this session · On" ("Memory" among a session's settings): turns it off, or back on. */
export function SessionMemoryItem({ sessionKey, on, allOff, close, label = 'Memory for this session' }: { sessionKey: string; on: boolean; allOff: boolean; close: () => void; label?: string }) {
  return (
    <MenuItem icon={<Brain size={15} />} hint={allOff ? 'Off for all' : on ? 'On' : 'Off'} disabled={allOff} onClick={() => (close(), setSessionMemory(sessionKey, !on))}>
      {label}
    </MenuItem>
  );
}

/** Edits a note's text in place: Enter saves, Shift+Enter breaks the line, Escape cancels. */
export function EntryEditor({ text, onSave, onCancel, max = 500 }: { text: string; onSave: (text: string) => Promise<unknown>; onCancel: () => void; max?: number }) {
  const [v, setV] = useState(text);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);
  // Grows with its text.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight + 2, 240)}px`;
  }, [v]);
  const save = async () => {
    if (!v.trim() || busy) return;
    setBusy(true);
    try {
      await onSave(v.trim());
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2">
      <textarea
        ref={ref}
        value={v}
        rows={2}
        maxLength={max}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel();
          else if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void save();
          }
        }}
        className={cx(inputCls, 'h-auto resize-none py-2 text-[13.5px] leading-snug')}
      />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" variant="primary" disabled={!v.trim() || busy || v.trim() === text} onClick={() => void save()}>
          Save
        </Button>
      </div>
    </div>
  );
}

/** "Added", "Updated", "Removed", "Ends" (or "Undone"), coloured by what happened. */
export function ChangeBadge({ c }: { c: MemoryChange }) {
  if (c.undone) return <Badge>Undone</Badge>;
  if (c.action === 'added') return <Badge tone="ok">Added</Badge>;
  if (c.action === 'updated') return <Badge tone="info">Updated</Badge>;
  if (c.action === 'expiry') return <Badge tone="info">{c.expiresAt ? 'Ends' : 'No end date'}</Badge>;
  return <Badge tone="warn">Removed</Badge>;
}
