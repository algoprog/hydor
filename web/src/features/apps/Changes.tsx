// What changes each time?: on top of an app drafted from a session (Do this again…, Save as an app), the request as the
// person wrote it, the words each question of the form takes the place of as chips in the accent colour. A click on a
// chip keeps those words as they are (its question leaves the form); selecting other words offers Ask this each time
// (a new question, put in the task where those words were). Small and optional: the tabs under it work as they do.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import type { AppRecipe } from '@shared/apps';
import { askEachTime, fixWords, tidyParts, type DraftPart } from './requestParts';

export function Changes({ parts, recipe, onChange }: { parts: DraftPart[]; recipe: AppRecipe; onChange: (parts: DraftPart[], recipe: AppRecipe) => void }) {
  const box = useRef<HTMLDivElement>(null);
  // The words selected in a piece that stays: its place, and where in it.
  const [picked, setPicked] = useState<{ i: number; start: number; end: number } | null>(null);
  // A chip whose question is no longer in the form (removed under Form) reads as words that stay.
  const shown = useMemo(() => tidyParts(parts.map((p) => (p.field && !recipe.fields.some((f) => f.id === p.field) ? { text: p.text } : p))), [parts, recipe.fields]);
  useEffect(() => {
    const look = () => {
      const sel = document.getSelection();
      const r = sel && sel.rangeCount ? sel.getRangeAt(0) : null;
      const span = (n: Node | null) => (n?.nodeType === Node.TEXT_NODE ? n.parentElement : (n as Element | null))?.closest<HTMLElement>('[data-part]');
      const a = r && !r.collapsed ? span(r.startContainer) : null;
      if (!r || !a || a !== span(r.endContainer) || !box.current?.contains(a)) return setPicked(null);
      const i = Number(a.dataset.part);
      setPicked(shown[i]?.text.slice(r.startOffset, r.endOffset).trim() ? { i, start: r.startOffset, end: r.endOffset } : null);
    };
    document.addEventListener('selectionchange', look);
    return () => document.removeEventListener('selectionchange', look);
  }, [shown]);
  const ask = () => {
    if (!picked) return;
    const done = askEachTime(recipe, shown, picked.i, picked.start, picked.end);
    document.getSelection()?.removeAllRanges();
    setPicked(null);
    if (done) onChange(done.parts, done.recipe);
  };
  const label = (id: string) => recipe.fields.find((f) => f.id === id)?.label || id;
  return (
    <section className="rounded-2xl border border-line bg-panel px-4 py-3.5 sm:px-5">
      <h2 className="text-[14px] font-semibold">What changes each time?</h2>
      <p className="mt-0.5 text-[12.5px] leading-snug text-fg-3">The coloured words are asked each time. Click one to keep it as it is; select other words to ask them each time.</p>
      <div ref={box} translate="no" className="mt-2.5 max-h-60 overflow-y-auto text-[14px] leading-[1.9] break-words whitespace-pre-wrap">
        {shown.map((p, i) =>
          p.field ? (
            <button
              key={i}
              type="button"
              title={`Asked each time (${label(p.field)}): click to keep these words as they are`}
              onClick={() => {
                const done = fixWords(recipe, shown, i);
                onChange(done.parts, done.recipe);
              }}
              className="rounded-md bg-accent-soft px-1 py-px text-accent ring-1 ring-accent/30 transition-colors ring-inset hover:bg-accent/20"
            >
              {p.text}
            </button>
          ) : (
            <span key={i} data-part={i}>
              {p.text}
            </span>
          ),
        )}
      </div>
      {picked && (
        <button
          type="button"
          // Keeps the selection while it is pressed.
          onMouseDown={(e) => e.preventDefault()}
          onClick={ask}
          className="mt-2 inline-flex h-7 items-center gap-1.5 rounded-lg bg-accent-soft px-2.5 text-[12.5px] font-medium text-accent transition-colors hover:bg-accent/20"
        >
          <Plus size={13} />
          Ask this each time
        </button>
      )}
    </section>
  );
}
