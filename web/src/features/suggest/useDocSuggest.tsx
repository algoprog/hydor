// Word suggestions in Docs: the grey rest of the word after the caret in a paragraph (and the next word, dimmer), laid
// over the page at the caret the way the AI's "Suggest as I type" is (its text starts at the caret and wraps to the
// paragraph's left edge). The paragraph's words before the caret are what is typed; the document before the paragraph
// is the context. The keys come from the editor's own chain, before its Tab handling; what is taken goes in through
// the editor's own typing (so Undo takes it out).
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import type { Run } from '@shared/docs';
import type { DocEngine, SelState } from '../pages/docs/engine';
import * as ops from '../pages/docs/ops';
import { useUI } from '../../lib/store';
import { makeSuggester } from './controller';
import { tail, type Field, type Grey } from './logic';
import { useSuggest, warmSuggest } from './store';

/** The words a run shows on the page: nothing for words suggested to be taken out, and for marks that stand for a footnote, a citation, a reference or an equation (their `t` is an id or LaTeX). */
const shows = (r: Run) => !r.del && !r.fn && !r.cite && !r.xref && !r.math;
const visible = (runs: Run[]) => runs.map((r) => (shows(r) ? r.t : '')).join('');

/** The words of a box before offset `o` and after it, as the page shows them. */
export function splitRuns(runs: Run[], o: number): [string, string] {
  const [a, b] = ops.splitAt(runs, o);
  return [visible(a), visible(b)];
}

/** The text of the document before block `index`, newest last (only as much as goes to the server). */
export function docBefore(doc: { blocks: Parameters<typeof ops.isText>[0][] }, index: number): string {
  const parts: string[] = [];
  let n = 0;
  for (let i = index - 1; i >= 0 && n < 2200; i--) {
    const b = doc.blocks[i];
    if (!ops.isText(b)) continue;
    const t = visible(b.runs);
    if (!t.trim()) continue;
    parts.unshift(t);
    n += t.length + 2;
  }
  return tail(parts.join('\n\n')) ?? '';
}

interface Spot {
  left: number;
  top: number;
  width: number;
  indent: number;
  font: string;
}

export function useDocSuggest(o: { engine: DocEngine | null; st: SelState | null; host: RefObject<HTMLDivElement | null>; readOnly: boolean; tick: string }): { onKey: (ev: KeyboardEvent) => boolean; overlay: ReactNode; shown: boolean } {
  const [grey, setGrey] = useState<Grey | null>(null);
  const [spot, setSpot] = useState<Spot | null>(null);
  const opts = useRef(o);
  opts.current = o;
  const composing = useRef(false);
  const sg = useRef<ReturnType<typeof makeSuggester> | null>(null);
  if (!sg.current) {
    sg.current = makeSuggester(
      {
        place: 'docs',
        read(): Field | null {
          const { engine: e, readOnly } = opts.current;
          if (!e || readOnly || document.activeElement !== e.root || e.picked) return null;
          const [s, z] = e.range();
          const b = ops.blockOf(e.doc, s.b);
          // A paragraph's own words: not a table's cell, not code.
          if (!b || !ops.isText(b) || s.c || (b.type === 'p' && b.style === 'code')) return null;
          const [before, after] = splitRuns(b.runs, s.o);
          const sameBox = ops.samePos(s, z);
          return { before, after: sameBox ? after : after || ' ', selected: !sameBox, composing: composing.current, id: s.b };
        },
        insert: (text) => opts.current.engine?.typeText(text),
        context() {
          const e = opts.current.engine;
          if (!e) return {};
          const [s] = e.range();
          return { doc: docBefore(e.doc, ops.indexOf(e.doc, s.b)) };
        },
      },
      setGrey,
    );
  }
  const ctl = sg.current;

  // The editor's own words: what it did to the document or the caret (`st` changes with each), and an input method.
  useEffect(() => ctl.sync(), [o.st, o.engine, o.readOnly, ctl]);
  useEffect(() => {
    const root = o.engine?.root;
    if (!root) return;
    const start = () => ((composing.current = true), ctl.sync());
    const end = () => ((composing.current = false), ctl.sync());
    const blur = () => ctl.reset();
    const focus = () => (warmSuggest(), ctl.sync());
    root.addEventListener('compositionstart', start);
    root.addEventListener('compositionend', end);
    root.addEventListener('blur', blur);
    root.addEventListener('focus', focus);
    return () => {
      root.removeEventListener('compositionstart', start);
      root.removeEventListener('compositionend', end);
      root.removeEventListener('blur', blur);
      root.removeEventListener('focus', focus);
      ctl.reset();
    };
  }, [o.engine, ctl]);
  useEffect(() => {
    const a = useSuggest.subscribe(() => ctl.sync());
    const b = useUI.subscribe((s, p) => s.wordSuggestions !== p.wordSuggestions && ctl.sync());
    return () => (a(), b());
  }, [ctl]);

  // Where it goes: at the caret, in the paragraph's own font, wrapping to the paragraph's left edge.
  const place = () => {
    const { engine: e, st, host } = opts.current;
    if (!grey || !e || !st) return setSpot(null);
    const [s] = e.range();
    const el = e.elementOf(s.b);
    const caret = e.caretRect();
    const h = host.current?.getBoundingClientRect();
    if (!el || !caret || !h) return setSpot(null);
    const r0 = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const pl = parseFloat(cs.paddingLeft) || 0;
    const left = r0.left - h.left + pl;
    const next: Spot = { left, top: caret.top - h.top, width: r0.width - pl - (parseFloat(cs.paddingRight) || 0), indent: caret.left - h.left - left, font: `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize}/${cs.lineHeight} ${cs.fontFamily}` };
    setSpot((p) => (p && p.left === next.left && p.top === next.top && p.width === next.width && p.indent === next.indent && p.font === next.font ? p : next));
  };
  useLayoutEffect(place, [grey, o.tick, o.st]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    onKey: (ev) => (o.readOnly ? false : ctl.key(ev)),
    shown: !!grey,
    overlay:
      grey && spot ? (
        <div aria-hidden="true" translate="no" className="pointer-events-none absolute z-10 whitespace-pre-wrap" style={{ left: spot.left, top: spot.top, width: spot.width, textIndent: spot.indent, font: spot.font }}>
          <span style={{ color: '#9aa0a6' }}>{grey.word}</span>
          {grey.next && <span style={{ color: '#9aa0a6', opacity: 0.55 }}>{grey.next}</span>}
        </div>
      ) : null,
  };
}
