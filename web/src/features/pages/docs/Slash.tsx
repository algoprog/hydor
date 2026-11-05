// The "/" menu: typed at the start of a line or after a space, "/" opens a short list under the caret of what to put
// there (headings, lists, a checklist, a quote, code, a callout, a table, a picture, an equation, a line across, a page
// break, a table of contents, today's date), narrowed as more is typed. The arrow keys and Enter pick, Esc or a space
// closes it; what was typed from the "/" goes when something is picked. The editor keeps where the "/" is and the keys.
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import {
  CalendarDays,
  Code2,
  Heading1,
  Heading2,
  Heading3,
  Image as ImageIcon,
  Lightbulb,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Quote,
  SeparatorHorizontal,
  Sigma,
  Table2,
  TableOfContents,
} from 'lucide-react';
import { cx } from '../../../components/ui';
import { tr } from '../../../i18n/runtime';
import type { DocEngine } from './engine';

export interface SlashItem {
  label: string;
  icon: ReactNode;
  /** More words it is found by. */
  also: string;
  run: () => void;
}

/** What the "/" menu offers. */
export function slashItems(e: DocEngine, more: { picture: () => void; equation: () => void; today: () => void }): SlashItem[] {
  return [
    { label: 'Heading 1', icon: <Heading1 size={16} />, also: 'h1 title big', run: () => e.style('h1') },
    { label: 'Heading 2', icon: <Heading2 size={16} />, also: 'h2', run: () => e.style('h2') },
    { label: 'Heading 3', icon: <Heading3 size={16} />, also: 'h3', run: () => e.style('h3') },
    { label: 'Bulleted list', icon: <List size={16} />, also: 'bullets ul', run: () => e.list('bullet') },
    { label: 'Numbered list', icon: <ListOrdered size={16} />, also: 'numbers ol', run: () => e.list('number') },
    { label: 'Checklist', icon: <ListChecks size={16} />, also: 'todo tasks checkbox', run: () => e.list('check') },
    { label: 'Quote', icon: <Quote size={16} />, also: 'blockquote', run: () => e.style('quote') },
    { label: 'Code', icon: <Code2 size={16} />, also: 'snippet pre', run: () => e.style('code') },
    { label: 'Callout', icon: <Lightbulb size={16} />, also: 'note tip box emoji', run: () => e.style('callout') },
    { label: 'Table', icon: <Table2 size={16} />, also: 'grid', run: () => e.insertTable(3, 3) },
    { label: 'Picture', icon: <ImageIcon size={16} />, also: 'image photo', run: more.picture },
    { label: 'Equation', icon: <Sigma size={16} />, also: 'maths math formula latex', run: more.equation },
    { label: 'A line across', icon: <Minus size={16} />, also: 'divider rule hr', run: () => e.insertAtom('hr') },
    { label: 'A page break', icon: <SeparatorHorizontal size={16} />, also: 'new page', run: () => e.insertAtom('pagebreak') },
    { label: 'Table of contents', icon: <TableOfContents size={16} />, also: 'toc outline headings', run: () => e.insertToc() },
    { label: "Today's date", icon: <CalendarDays size={16} />, also: 'date now day', run: more.today },
  ];
}

/** The items a query finds (by their words, in English or the app's language). */
export function slashMatches(items: SlashItem[], q: string): SlashItem[] {
  const k = q.toLowerCase();
  if (!k) return items;
  return items.filter((it) => [it.label, tr(it.label), it.also].some((w) => w.toLowerCase().split(/\s+/).some((x) => x.startsWith(k)) || w.toLowerCase().startsWith(k)));
}

/** Where a "/" command is being typed: the "/" itself, and the words after it. */
export function slashAt(before: string): { from: number; query: string } | null {
  const m = /(?:^|[\s ])\/([\p{L}\p{N}]{0,24})$/u.exec(before);
  return m ? { from: before.length - m[1].length - 1, query: m[1] } : null;
}

export function SlashMenu({ items, index, at, bound, onPick, onHover }: { items: SlashItem[]; index: number; at: { x: number; top: number; bottom: number }; bound: number; onPick: (k: number) => void; onHover: (k: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [up, setUp] = useState(false);
  // Under the caret, or above it where there is no room below.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setUp(r.bottom > bound - 8 && at.top - r.height > 60);
  }, [items.length, at.top, bound]);
  useLayoutEffect(() => {
    ref.current?.querySelector(`[data-k="${index}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [index]);
  return (
    <div
      ref={ref}
      data-keeps-editing
      role="listbox"
      onMouseDown={(e) => e.preventDefault()}
      className="absolute z-30 max-h-[300px] w-[240px] overflow-y-auto rounded-xl border border-line bg-elevated p-1 shadow-lg"
      style={{ left: at.x, top: up ? undefined : at.bottom + 6, bottom: up ? `calc(100% - ${at.top - 6}px)` : undefined }}
    >
      {items.map((it, k) => (
        <button
          key={it.label}
          data-k={k}
          type="button"
          role="option"
          aria-selected={k === index}
          onMouseEnter={() => onHover(k)}
          onClick={() => onPick(k)}
          className={cx('flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] text-fg', k === index ? 'bg-bg-2' : 'hover:bg-bg-2')}
        >
          <span className="flex w-4 shrink-0 items-center justify-center text-fg-3">{it.icon}</span>
          <span className="min-w-0 flex-1 truncate">{it.label}</span>
        </button>
      ))}
    </div>
  );
}
