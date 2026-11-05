// The LaTeX editor's toolbar row, which never scrolls sideways: its tools are shown, in their order, as long as they
// fit the row's width, the most used first; the others fold away (each is in the editor's menus as well), the least
// used first as the window narrows. A tool may have a smaller form (a button without its words) shown when the whole
// one does not fit. Every tool stays drawn, the folded ones unseen and out of the way, so each keeps its place for a
// popover to open from, and the row knows its width without drawing it twice.
import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { cx } from '../../../components/ui';

export interface RowTool {
  id: string;
  /** How much it is used: 0 first, folded last. */
  rank: number;
  /** Tools of a group sit together, with a line between groups. */
  group: string;
  node: ReactNode;
  /** A smaller form, shown when the whole one does not fit. */
  small?: ReactNode;
}

/** A line between groups: 1px and its margins (mx-1), with the row's gap. */
const SEP = 11;
/** The row's gap between tools (gap-0.5). */
const GAP = 2;

/** Which tools (by id, or id + ":small") fit `room`: the most used first, each in whole or small form, skipping those that do not fit. */
function fitting(tools: RowTool[], widths: Map<string, number>, room: number): Set<string> {
  const shown = new Set<string>();
  const groups = new Set<string>();
  let used = 0;
  for (const t of [...tools].sort((a, b) => a.rank - b.rank)) {
    const sep = groups.size && !groups.has(t.group) ? SEP : 0;
    for (const [key, w] of [
      [t.id, widths.get(t.id)],
      [`${t.id}:small`, t.small ? widths.get(`${t.id}:small`) : undefined],
    ] as const) {
      if (w === undefined) continue;
      if (used + w + GAP + sep <= room) {
        shown.add(key);
        groups.add(t.group);
        used += w + GAP + sep;
        break;
      }
    }
  }
  return shown;
}

export function ToolRow({ tools, className, rowRef }: { tools: RowTool[]; className?: string; rowRef?: RefObject<HTMLDivElement | null> }) {
  const own = useRef<HTMLDivElement>(null);
  const box = rowRef ?? own;
  const [shown, setShown] = useState<Set<string> | null>(null);
  const shownRef = useRef(shown);
  shownRef.current = shown;
  const toolsRef = useRef(tools);
  toolsRef.current = tools;

  // Measured after each drawing, and again when the row or a tool changes size (a label in another language, say).
  const measure = () => {
    const el = box.current;
    if (!el) return;
    const widths = new Map<string, number>();
    for (const w of el.querySelectorAll<HTMLElement>(':scope > [data-tool]')) widths.set(w.dataset.tool!, w.offsetWidth);
    const style = getComputedStyle(el);
    const room = el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const next = fitting(toolsRef.current, widths, room);
    const was = shownRef.current;
    if (!was || was.size !== next.size || [...next].some((k) => !was.has(k))) setShown(next);
  };
  useLayoutEffect(measure);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    for (const w of el.querySelectorAll(':scope > [data-tool]')) ro.observe(w);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tools.map((t) => `${t.id}${t.small ? '+' : ''}`).join()]);

  // Until measured, everything shows (and is measured): the row is drawn again at once, before it is seen.
  const on = (key: string) => !shown || shown.has(key);
  const out: ReactNode[] = [];
  let lastGroup: string | null = null;
  for (const t of tools) {
    const whole = on(t.id);
    const small = !whole && !!t.small && on(`${t.id}:small`);
    if ((whole || small) && lastGroup !== null && lastGroup !== t.group) out.push(<span key={`sep:${t.id}`} className="mx-1 h-5 w-px shrink-0 bg-line" />);
    if (whole || small) lastGroup = t.group;
    out.push(
      <div key={t.id} data-tool={t.id} aria-hidden={!whole || undefined} className={cx('flex w-max shrink-0 items-center', !whole && 'pointer-events-none invisible absolute top-0 left-0')}>
        {t.node}
      </div>,
    );
    if (t.small)
      out.push(
        <div key={`${t.id}:small`} data-tool={`${t.id}:small`} aria-hidden={!small || undefined} className={cx('flex w-max shrink-0 items-center', !small && 'pointer-events-none invisible absolute top-0 left-0')}>
          {t.small}
        </div>,
      );
  }
  return (
    <div ref={box} className={cx('relative flex min-w-0 items-center gap-0.5 overflow-hidden', className)}>
      {out}
    </div>
  );
}

/** Whether a tool shows in the row (whole or small), by what the row drew last: for a popover to open from it, or from elsewhere. */
export const toolShown = (row: HTMLElement | null, id: string) => !!row?.querySelector(`:scope > [data-tool="${id}"]:not([aria-hidden]), :scope > [data-tool="${id}:small"]:not([aria-hidden])`);
