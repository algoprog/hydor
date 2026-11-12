// The picture editor's font list for words: a button showing the font in use (in its own face) that opens a short list
// by kind (Sans, Serif, Display, Handwriting, Monospace), each font written in itself, and, where the browser allows
// it (Chromium asks first), This computer's own fonts. The fonts come from the app (Inter and JetBrains Mono are part
// of it) and from Google Fonts, loaded as they are looked at or used; the shared list is shared/mediaedit's MARK_FONTS.
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { fontOf, MARK_FONTS, type MarkFont } from '@shared/mediaedit';
import { fontsHref } from '@shared/design-fonts';
import { cx, Popover } from '../../../components/ui';
import { Seg } from '../shell';
import { localFamilies } from '../render';

const KINDS = [
  { value: 'sans', label: 'Sans serif' },
  { value: 'serif', label: 'Serif' },
  { value: 'display', label: 'Display' },
  { value: 'hand', label: 'Script' },
  { value: 'mono', label: 'Monospace' },
  { value: 'local', label: 'This computer' },
] as const;
type Kind = (typeof KINDS)[number]['value'];

/** The stylesheet that lets a kind's fonts show in their own faces (once per kind). */
function loadPreviews(list: readonly MarkFont[], kind: string) {
  const id = `n-font-preview-${kind}`;
  if (document.getElementById(id)) return;
  const href = fontsHref(list.flatMap((f) => (f.google ? [f.google] : [])));
  if (!href) return;
  const l = document.createElement('link');
  l.id = id;
  l.rel = 'stylesheet';
  l.href = href;
  document.head.append(l);
}

export function FontPicker({ value, onChange, width = 130 }: { value: string | undefined; onChange: (id: string) => void; width?: number }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const cur = fontOf(value);
  const [kind, setKind] = useState<Kind>(cur.local ? 'local' : cur.cat);
  const [local, setLocal] = useState<string[] | null | 'asking'>(null);
  const list = useMemo(() => MARK_FONTS.filter((f) => f.cat === kind), [kind]);
  useEffect(() => {
    if (open && kind !== 'local') loadPreviews(list, kind);
  }, [open, kind, list]);
  const ask = async () => {
    setLocal('asking');
    setLocal(await localFamilies());
  };
  return (
    <>
      <button ref={ref} type="button" aria-label="Font" title="Font" aria-expanded={open} onClick={() => setOpen((x) => !x)} className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-line-2 bg-bg-1 pr-1.5 pl-2 text-[12px] hover:bg-bg-2" style={{ width }}>
        <span className="min-w-0 flex-1 truncate text-left" style={{ fontFamily: cur.css }}>
          {cur.label}
        </span>
        <ChevronDown size={12} className="shrink-0 text-fg-3" />
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={270} title="Font" className="p-2">
        <div className="mb-1.5 flex flex-wrap gap-1">
          <Seg value={kind} options={KINDS.slice(0, 5).map((k) => ({ value: k.value, label: k.label }))} onChange={setKind} />
          <Seg value={kind} options={[{ value: 'local' as Kind, label: 'This computer' }]} onChange={setKind} />
        </div>
        <div className="max-h-[260px] overflow-y-auto" role="listbox" aria-label="Fonts">
          {kind === 'local' ? (
            local === null || local === 'asking' ? (
              <div className="p-2 text-[12px] text-fg-3">
                <p>Your computer’s own fonts can be used where the browser allows it; it asks first.</p>
                <button type="button" disabled={local === 'asking'} onClick={() => void ask()} className="mt-2 h-7 rounded-md bg-bg-2 px-2.5 text-[12px] text-fg ring-1 ring-line-2 hover:bg-bg-3 disabled:opacity-45">
                  Show this computer’s fonts
                </button>
              </div>
            ) : local.length === 0 ? (
              <p className="p-2 text-[12px] text-fg-3">The browser did not give any: it may not allow it, or it was declined.</p>
            ) : (
              local.map((fam) => (
                <FontRow key={fam} on={value === `local:${fam}`} css={`"${fam}", sans-serif`} label={fam} onPick={() => (onChange(`local:${fam}`), setOpen(false))} />
              ))
            )
          ) : (
            list.map((f) => <FontRow key={f.id} on={cur.id === f.id} css={f.css} label={f.label} onPick={() => (onChange(f.id), setOpen(false))} />)
          )}
        </div>
      </Popover>
    </>
  );
}

function FontRow({ on, css, label, onPick }: { on: boolean; css: string; label: string; onPick: () => void }) {
  return (
    <button type="button" role="option" aria-selected={on} translate="no" onClick={onPick} className={cx('flex h-8 w-full items-center rounded-md px-2 text-left text-[15px]', on ? 'bg-accent-soft' : 'hover:bg-bg-2')} style={{ fontFamily: css }}>
      <span className="truncate">{label}</span>
    </button>
  );
}
