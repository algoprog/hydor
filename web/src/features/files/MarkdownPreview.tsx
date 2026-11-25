// A Markdown file as it looks (its preview in the file viewer), and, while an agent changes it beside a conversation
// (pages/liveEdits.ts), the change as it comes: the text being written shows in place of the file's, the parts of the
// document it changes are lit in the agent's colour with its flag and kept in view (unless the reader scrolled away
// lately), and once the change is in the file the light fades. Beside a conversation, a change that comes whole (an
// agent that hands over its calls whole, a command) is lit for a moment once it lands, without the flag (it may be
// anyone's), and brought into view. The parts are found by where each top-level part of the document is in its text,
// read as it is drawn.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { codexCitations } from '@shared/file-citations';
import { Markdown } from '../../components/Markdown';
import { normalizeMath } from '../../components/markdown-math';
import { cx, Throbber } from '../../components/ui';
import { keepInView, useOwnScroll } from '../pages/live';
import type { ShownEdit } from '../pages/liveEdits';

/** Where each top-level part of the document is in its text (start and end offsets; -1 when it says nothing), in order. */
type Spans = [number, number][];

/**
 * Where a place in the document's text is in the text Markdown reads (Markdown.tsx reads it with its maths and
 * citations put its own way first, which moves what follows them).
 */
const readAt = (text: string, at: number) => normalizeMath(codexCitations(text.slice(0, at)), true).length;

/** Fills `into` with where the document's top-level parts are, each time it is drawn. */
function rehypeSpans(o: { into: Spans }) {
  return (tree: { children?: { type: string; position?: { start?: { offset?: number }; end?: { offset?: number } } }[] }) => {
    o.into.length = 0;
    for (const c of tree.children ?? []) if (c.type === 'element') o.into.push([c.position?.start?.offset ?? -1, c.position?.end?.offset ?? -1]);
  };
}

/** The parts of the document that hold [from, to) (an empty range: the part it is in, or the next one), and the one `at` is in. */
function partsOf(spans: Spans, from: number, to: number, at: number): { first: number; last: number; caret: number } | null {
  let first = -1;
  let last = -1;
  spans.forEach(([a, z], i) => {
    if (a < 0) return;
    if (to > from ? a < to && z > from : a <= from && from <= z) {
      if (first < 0) first = i;
      last = i;
    }
  });
  if (first < 0) {
    const next = spans.findIndex(([a]) => a >= from);
    first = last = next >= 0 ? next : spans.length - 1;
  }
  if (first < 0) return null;
  let caret = last;
  for (let i = first; i <= last; i++) if (spans[i][0] <= at && at <= spans[i][1]) caret = i;
  return { first, last, caret };
}

export function MarkdownPreview({
  text,
  edit,
  mdHtml,
  images,
  dir,
  landing,
}: {
  text: string;
  /** An agent's change being made (or just made) in it, if one is. */
  edit: ShownEdit | null;
  /** A change that comes whole is lit for a moment (beside a session's conversation). */
  landing?: boolean;
  mdHtml: typeof import('../../components/markdownHtml') | null;
  images?: (src: string) => string | null;
  dir: string;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const own = useOwnScroll(scroller);
  const spans = useRef<Spans>([]);
  const rehype = useMemo(() => (mdHtml ? [...mdHtml.MD_HTML, [rehypeSpans, { into: spans.current }]] : null), [mdHtml]);
  const shown = edit?.text ?? text;
  // A change of the file that came whole while it shows here, none being written: where it is, lit, then fading.
  const was = useRef<string | null>(null);
  const [landed, setLanded] = useState<{ from: number; to: number; fading: boolean; n: number } | null>(null);
  useEffect(() => {
    const before = was.current;
    was.current = text;
    if (before === null || before === text) return;
    if (edit || !landing) return setLanded(null);
    let p = 0;
    while (p < before.length && p < text.length && before[p] === text[p]) p++;
    let s = 0;
    while (s < before.length - p && s < text.length - p && before[before.length - 1 - s] === text[text.length - 1 - s]) s++;
    const n = Date.now();
    setLanded({ from: p, to: text.length - s, fading: false, n });
    const t1 = setTimeout(() => setLanded((l) => (l?.n === n ? { ...l, fading: true } : l)), 1400);
    const t2 = setTimeout(() => setLanded((l) => (l?.n === n ? null : l)), 2200);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  const lit = edit
    ? { from: edit.from, to: edit.to, placing: edit.placing, fading: edit.text === null, n: edit.n, at: edit.placing ? 'first' : 'caret' }
    : landed && { from: landed.from, to: landed.to, placing: false, fading: landed.fading, n: -landed.n, at: 'whole' };
  const [mark, setMark] = useState<{ top: number; height: number; placing: boolean; fading: boolean; flag: boolean } | null>(null);
  useLayoutEffect(() => {
    const b = box.current;
    // The document's own element (the Markdown's), the box's first.
    const md = b?.firstElementChild;
    if (!lit || !b || !md?.classList.contains('md')) return setMark(null);
    const els = [...md.children] as HTMLElement[];
    const list = spans.current;
    const from = readAt(shown, lit.from);
    const to = lit.to === lit.from ? from : readAt(shown, lit.to);
    const p = els.length === list.length ? partsOf(list, from, to, to) : null;
    if (!p) return setMark(null);
    const br = b.getBoundingClientRect();
    const r1 = els[p.first].getBoundingClientRect();
    const r2 = els[p.last].getBoundingClientRect();
    const top = r1.top - br.top - 6;
    setMark({ top, height: Math.max(12, r2.bottom - br.top + 6 - top), placing: lit.placing, fading: lit.fading, flag: lit.at !== 'whole' });
    // Where the words arrive (the part it is about to change, while the old words are still coming; a change that came
    // whole, from its start), well in view.
    const sc = scroller.current;
    if (sc && !lit.fading && !own()) {
      if (lit.at === 'caret') {
        const rc = els[p.caret].getBoundingClientRect();
        keepInView(sc, Math.max(rc.top, rc.bottom - sc.clientHeight / 3) - 24, rc.bottom + 24);
      } else keepInView(sc, r1.top - 24, Math.min(r2.bottom, r1.top + sc.clientHeight / 2) + 24);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lit?.n, lit?.from, lit?.to, lit?.fading, shown]);
  return (
    <div ref={scroller} tabIndex={-1} className="relative z-10 h-full overflow-auto bg-bg outline-none">
      <div ref={box} className="relative mx-auto max-w-[860px] px-5 py-6">
        {rehype ? <Markdown text={shown} rehypeExtra={rehype} resolveImage={images} baseDir={dir} /> : <Throbber className="text-fg-3" />}
        {mark && (
          <div
            aria-hidden
            className={cx(
              'pointer-events-none absolute inset-x-2 rounded-lg transition-opacity duration-700',
              mark.placing ? 'border border-dashed border-busy/60' : 'bg-busy/8',
              mark.fading ? 'opacity-0' : 'opacity-100',
            )}
            style={{ top: mark.top, height: mark.height }}
          >
            <div className="absolute inset-y-0 -left-1 w-[3px] rounded-full bg-busy" />
            {mark.flag && <div className="absolute -top-3.5 right-0 rounded-[3px] bg-busy px-1 text-[10px] leading-[14px] font-semibold whitespace-nowrap text-bg">Agent</div>}
          </div>
        )}
      </div>
    </div>
  );
}
