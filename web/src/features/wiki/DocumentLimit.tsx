// A whole number from 0 to MAX_WIKI_DOCUMENTS: the most documents a project's knowledge may hold for its wiki to read
// them (Settings → Memory → Wiki memory, and a project's own Settings tab). It is saved when the field is left or Enter is pressed.
import { useEffect, useState } from 'react';
import { MAX_WIKI_DOCUMENTS } from '@shared/wiki';
import { cx, inputCls } from '../../components/ui';

export function DocumentLimit({ value, onCommit, label }: { value: number; onCommit: (n: number) => void; label: string }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const n = Math.min(MAX_WIKI_DOCUMENTS, Math.max(0, Math.round(Number(draft))));
    if (draft.trim() === '' || !Number.isFinite(n)) return setDraft(String(value));
    setDraft(String(n));
    if (n !== value) onCommit(n);
  };
  return (
    <input
      type="number"
      inputMode="numeric"
      min={0}
      max={MAX_WIKI_DOCUMENTS}
      step={1}
      aria-label={label}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
      className={cx(inputCls, 'h-8 w-28 text-[13px] tabular-nums')}
    />
  );
}
