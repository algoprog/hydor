// The visual editor's Layers tab: the page's parts as a tree, as they sit inside each other. Pointing at one
// shows it in the page; a click picks it (the parts around the one picked open by themselves), even a part
// too small, hidden or covered to click in the page.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cx, Throbber } from '../../../components/ui';
import type { EdLayer, EdSel } from '../frame';
import type { Cmd } from './Inspector';

const keyOf = (p: number[]) => p.join('.');

export function LayersPanel({ tree, sel, cmd }: { tree: EdLayer | null; sel: EdSel | null; cmd: Cmd }) {
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const selKey = sel ? keyOf(sel.path) : '';
  const box = useRef<HTMLDivElement>(null);
  // The parts around the one picked open, and it comes into view.
  useEffect(() => {
    if (!sel) return;
    setOpen((o) => {
      const n = new Set(o);
      for (let i = 1; i < sel.path.length; i++) n.add(keyOf(sel.path.slice(0, i)));
      return n;
    });
    requestAnimationFrame(() => box.current?.querySelector('[aria-selected=true]')?.scrollIntoView({ block: 'nearest' }));
  }, [selKey]);
  if (!tree)
    return (
      <div className="flex justify-center py-10 text-fg-3">
        <Throbber />
      </div>
    );
  const toggle = (k: string) =>
    setOpen((o) => {
      const n = new Set(o);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  const rows: ReactNode[] = [];
  const walk = (node: EdLayer, depth: number) => {
    const k = keyOf(node.p);
    const isOpen = depth === 0 || open.has(k);
    const picked = k === selKey;
    rows.push(
      <div
        key={k}
        role="treeitem"
        aria-selected={picked}
        aria-expanded={node.c.length ? isOpen : undefined}
        onPointerEnter={(e) => e.pointerType !== 'touch' && cmd('hover', node.p)}
        onPointerLeave={(e) => e.pointerType !== 'touch' && cmd('hover', null)}
        onClick={() => cmd('select', node.p)}
        style={{ paddingLeft: 4 + depth * 14 }}
        className={cx('flex h-7.5 cursor-pointer items-center gap-1 rounded-md pr-2 text-[12.5px] max-md:h-9', picked ? 'bg-accent-soft text-fg' : 'text-fg-2 hover:bg-bg-2')}
      >
        {node.c.length && depth > 0 ? (
          <button
            type="button"
            aria-label={isOpen ? 'Fold' : 'Open'}
            onClick={(e) => {
              e.stopPropagation();
              toggle(k);
            }}
            className="grid h-5 w-5 shrink-0 place-items-center rounded text-fg-3 hover:bg-bg-3"
          >
            {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
        ) : (
          <span className="w-5 shrink-0" />
        )}
        <span className={cx('shrink-0', picked && 'font-semibold')}>{node.n}</span>
        {node.x && (
          <span translate="no" className="min-w-0 truncate text-fg-3">
            {node.x}
          </span>
        )}
        <span translate="no" className="ml-auto shrink-0 pl-1 font-mono text-[10.5px] text-fg-3/70">
          {node.t}
        </span>
      </div>,
    );
    if (isOpen) for (const c of node.c) walk(c, depth + 1);
  };
  walk(tree, 0);
  return (
    <div ref={box} role="tree" aria-label="Layers" className="px-2 pb-4">
      {rows}
    </div>
  );
}
