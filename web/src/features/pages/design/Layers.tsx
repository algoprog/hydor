// A design's Layers (a tab of the Add panel): the parts of the artboard shown, front to back, as the design editor in
// the page's frame tells them (design-editor.ts `tellLayers`), groups with what they hold. A click picks one (Shift or
// Ctrl adds one more); pointing at one outlines it on the page; a drag up or down puts it in front of or behind the
// others beside it (on a phone, by its grip); the eye hides it (it stays in the design, but does not show, is not
// picked by a click on the page and is not downloaded) and the lock keeps it in place; a double-click on its name, or
// the pencil on the picked one, names it. Each of these is one step to undo; with the focus in the list, Ctrl+Z and
// Ctrl+Shift+Z undo and redo, Delete deletes what is picked and Ctrl+Shift+H hides it, as on the page.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, Eye, EyeOff, Film, GripVertical, Group, Image, Lock, LockOpen, Minus, Pencil, QrCode, Shapes, Smile, Spline, Square, Type } from 'lucide-react';
import { cx } from '../../../components/ui';
import { tr } from '../../../i18n/runtime';
import type { DCmd } from './DesignEdit';

/** A part of the artboard, as the design editor tells it: its path, name, kind, a few words, locked, hidden, what it holds. */
export interface DLayer {
  p: number[];
  n: string;
  t: string;
  x: string;
  /** Its name was given it (in Layers), not its kind's. */
  own: boolean;
  l: boolean;
  h: boolean;
  c: DLayer[];
}

const keyOf = (p: number[]) => p.join('.');
const ICONS: Record<string, ReactNode> = {
  text: <Type size={13} />,
  curve: <Spline size={13} />,
  pic: <Image size={13} />,
  video: <Film size={13} />,
  shape: <Shapes size={13} />,
  icon: <Smile size={13} />,
  qr: <QrCode size={13} />,
  line: <Minus size={13} />,
  group: <Group size={13} />,
  box: <Square size={13} />,
};

/** Where a row dragged would go: above (in front of) or below (behind) another beside it. */
type Drop = { to: number[]; place: 'above' | 'below' };

export function DesignLayers({ list, picked, cmd }: { list: DLayer[] | null; picked: number[][]; cmd: DCmd }) {
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [naming, setNaming] = useState<string | null>(null);
  const [drop, setDrop] = useState<Drop | null>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const press = useRef<{ p: number[]; y: number; id: number; went: boolean } | null>(null);
  const dragged = useRef(false);
  const pickedKeys = new Set(picked.map(keyOf));
  const pickKey = picked.map(keyOf).join('|');
  // The panel opened: the list as it is now. The groups round what is picked open, and it comes into view.
  useEffect(() => cmd('layers'), [cmd]);
  useEffect(() => {
    if (!picked.length) return;
    setOpen((o) => {
      const n = new Set(o);
      for (const p of picked) for (let i = 1; i < p.length; i++) n.add(keyOf(p.slice(0, i)));
      return n;
    });
    requestAnimationFrame(() => box.current?.querySelector('[aria-selected=true]')?.scrollIntoView({ block: 'nearest' }));
  }, [pickKey]);
  // The pointer left the panel: nothing outlined on the page.
  useEffect(() => () => cmd('hover', null), [cmd]);

  if (!list) return <p className="px-1 pt-4 text-[12.5px] text-fg-3">{tr('Loading the layers…')}</p>;
  if (!list.length) return <p className="px-1 pt-4 text-[12.5px] leading-relaxed text-fg-3">{tr('Nothing on this page yet: what you add shows here, the front first.')}</p>;

  const toggle = (k: string) =>
    setOpen((o) => {
      const n = new Set(o);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  /** The rows beside a path (of the same parent), as they show, with where each is on the screen. */
  const siblingRows = (p: number[]) => {
    const parent = keyOf(p.slice(0, -1));
    return [...(box.current?.querySelectorAll<HTMLElement>('[data-layer]') ?? [])].filter((r) => r.dataset.parent === parent);
  };
  /** Where a row pressed at `p` would go with the pointer at `y`: by the nearest row beside it. */
  const dropAt = (p: number[], y: number): Drop | null => {
    const rows = siblingRows(p);
    if (rows.length < 2) return null;
    let best: { r: HTMLElement; d: number } | null = null;
    for (const r of rows) {
      const b = r.getBoundingClientRect();
      const d = y < b.top ? b.top - y : y > b.bottom ? y - b.bottom : 0;
      if (!best || d < best.d) best = { r, d };
    }
    if (!best) return null;
    const b = best.r.getBoundingClientRect();
    const place = y < b.top + b.height / 2 ? 'above' : 'below';
    const to = best.r.dataset.layer!.split('.').map(Number);
    // Where it is already: nothing to do.
    const keys = rows.map((r) => r.dataset.layer);
    const from = keys.indexOf(keyOf(p));
    const at = keys.indexOf(keyOf(to)) + (place === 'below' ? 1 : 0);
    if (at === from || at === from + 1) return null;
    return { to, place };
  };

  // A press on a row (with a finger: on its grip, so the list still scrolls) that moves becomes a drag.
  const onDown = (e: React.PointerEvent, p: number[], grip: boolean) => {
    if (e.button !== 0 || (e.pointerType === 'touch' && !grip)) return;
    press.current = { p, y: e.clientY, id: e.pointerId, went: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const pr = press.current;
    if (!pr || pr.id !== e.pointerId) return;
    if (!pr.went && Math.abs(e.clientY - pr.y) < 4) return;
    if (!pr.went) {
      pr.went = true;
      setDragKey(keyOf(pr.p));
    }
    setDrop(dropAt(pr.p, e.clientY));
    // Near the panel's top or bottom: it scrolls.
    const sc = box.current?.closest('.overflow-y-auto');
    if (sc) {
      const b = sc.getBoundingClientRect();
      if (e.clientY < b.top + 24) sc.scrollTop -= 8;
      else if (e.clientY > b.bottom - 24) sc.scrollTop += 8;
    }
  };
  const onUp = (e: React.PointerEvent) => {
    const pr = press.current;
    press.current = null;
    setDragKey(null);
    const d = drop;
    setDrop(null);
    if (!pr || pr.id !== e.pointerId || !pr.went) return;
    // The click that follows a drag picks nothing.
    dragged.current = true;
    if (d) cmd('reorder', { path: pr.p, to: d.to, place: d.place });
  };

  /** With the focus in the list, the page's keys for what is picked: undo and redo, Delete, hide (Ctrl+Shift+H). */
  const editKeys = (e: React.KeyboardEvent) => {
    if ((e.target as Element).closest('input')) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    let run: (() => void) | null = null;
    if (mod && k === 'z') run = () => cmd(e.shiftKey ? 'redo' : 'undo');
    else if (mod && k === 'y') run = () => cmd('redo');
    else if (mod && e.shiftKey && e.code === 'KeyH') run = () => cmd('layer', { hide: !picked.every((p) => findIn(list, p)?.h) });
    else if (!mod && (e.key === 'Delete' || e.key === 'Backspace') && picked.length) run = () => cmd('del');
    if (!run) return;
    e.preventDefault();
    run();
  };

  const rows: ReactNode[] = [];
  const walk = (node: DLayer, depth: number) => {
    const k = keyOf(node.p);
    const isOpen = open.has(k);
    const isPicked = pickedKeys.has(k);
    const lineAt = drop && keyOf(drop.to) === k ? drop.place : null;
    rows.push(
      <div
        key={k}
        data-layer={k}
        data-parent={keyOf(node.p.slice(0, -1))}
        role="treeitem"
        tabIndex={isPicked || (!picked.length && depth === 0 && node === list[0]) ? 0 : -1}
        aria-selected={isPicked}
        aria-expanded={node.c.length ? isOpen : undefined}
        aria-level={depth + 1}
        onPointerEnter={(e) => e.pointerType !== 'touch' && !press.current && cmd('hover', { path: node.p })}
        onPointerLeave={(e) => e.pointerType !== 'touch' && cmd('hover', null)}
        onPointerDown={(e) => !(e.target as Element).closest('button,input') && onDown(e, node.p, false)}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={() => ((press.current = null), setDrop(null), setDragKey(null))}
        onClick={(e) => {
          if (dragged.current) return void (dragged.current = false);
          if ((e.target as Element).closest('button,input')) return;
          cmd('select', { path: node.p, add: e.shiftKey || e.ctrlKey || e.metaKey });
        }}
        onDoubleClick={(e) => !(e.target as Element).closest('button,input') && setNaming(k)}
        onKeyDown={(e) => {
          if (naming) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            cmd('select', { path: node.p, add: e.shiftKey || e.ctrlKey || e.metaKey });
          } else if (e.key === 'F2') {
            e.preventDefault();
            setNaming(k);
          } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            const all = [...(box.current?.querySelectorAll<HTMLElement>('[data-layer]') ?? [])];
            const i = all.indexOf(e.currentTarget as HTMLElement);
            all[Math.max(0, Math.min(all.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]?.focus();
          } else if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && node.c.length) {
            e.preventDefault();
            if ((e.key === 'ArrowRight') !== isOpen) toggle(k);
          }
        }}
        style={{ paddingLeft: 2 + depth * 14 }}
        className={cx(
          'group/layer relative flex h-8 cursor-default touch-pan-y items-center gap-1 rounded-md pr-1 text-[12.5px] outline-none select-none focus-visible:ring-2 focus-visible:ring-accent/50 pointer-coarse:h-10',
          isPicked ? 'bg-accent-soft text-fg' : 'text-fg-2 hover:bg-bg-2',
          dragKey === k && 'opacity-50',
        )}
      >
        {lineAt && <span className={cx('pointer-events-none absolute right-1 left-1 h-0.5 rounded bg-accent', lineAt === 'above' ? '-top-px' : '-bottom-px')} />}
        <span
          aria-hidden
          onPointerDown={(e) => {
            e.stopPropagation();
            onDown(e, node.p, true);
          }}
          className="grid h-6 w-4 shrink-0 cursor-grab touch-none place-items-center text-fg-3 opacity-0 group-hover/layer:opacity-70 pointer-coarse:opacity-60"
        >
          <GripVertical size={12} />
        </span>
        {node.c.length ? (
          <button type="button" aria-label={isOpen ? tr('Fold') : tr('Open')} onClick={() => toggle(k)} className="grid h-5 w-5 shrink-0 place-items-center rounded text-fg-3 hover:bg-bg-3">
            {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
        ) : (
          <span className="w-1 shrink-0" />
        )}
        <span className={cx('shrink-0 text-fg-3', node.h && 'opacity-50')}>{ICONS[node.t] ?? ICONS.box}</span>
        {naming === k ? (
          <NameField
            value={node.own ? node.n : ''}
            placeholder={node.own ? '' : node.n}
            onDone={(name) => {
              setNaming(null);
              if (name !== null && name !== (node.own ? node.n : '')) cmd('layer', { path: node.p, name });
              requestAnimationFrame(() => box.current?.querySelector<HTMLElement>(`[data-layer="${k}"]`)?.focus());
            }}
          />
        ) : (
          <span className={cx('flex min-w-0 flex-1 items-baseline gap-1.5', node.h && 'opacity-50')}>
            <span translate={node.own ? 'no' : undefined} className={cx('shrink-0 truncate', isPicked && 'font-semibold', node.own ? 'max-w-full' : 'max-w-[60%]')}>
              {node.n}
            </span>
            {!node.own && node.x && (
              <span translate="no" className="min-w-0 truncate text-fg-3">
                {node.x}
              </span>
            )}
          </span>
        )}
        {isPicked && naming !== k && (
          <RowButton label={tr('Rename')} onClick={() => setNaming(k)} shown={false}>
            <Pencil size={12} />
          </RowButton>
        )}
        <RowButton label={node.h ? tr('Show') : tr('Hide')} onClick={() => cmd('layer', { path: node.p, hide: !node.h })} shown={node.h}>
          {node.h ? <EyeOff size={13} /> : <Eye size={13} />}
        </RowButton>
        <RowButton label={node.l ? tr('Unlock') : tr('Lock')} onClick={() => cmd('layer', { path: node.p, lock: !node.l })} shown={node.l}>
          {node.l ? <Lock size={12} /> : <LockOpen size={12} />}
        </RowButton>
      </div>,
    );
    if (isOpen) for (const c of node.c) walk(c, depth + 1);
  };
  for (const n of list) walk(n, 0);
  return (
    <div ref={box} role="tree" aria-label={tr('Layers')} aria-multiselectable className="pt-2" onPointerLeave={() => cmd('hover', null)} onKeyDown={editKeys}>
      <p className="px-1 pb-1.5 text-[11.5px] leading-snug text-fg-3">{tr('Front to back. Drag to reorder; double-click a name to rename.')}</p>
      {rows}
    </div>
  );
}

/** A part in the list, by its path. */
export function findIn(list: DLayer[], p: number[]): DLayer | null {
  for (const l of list) {
    if (keyOf(l.p) === keyOf(p)) return l;
    const inner = findIn(l.c, p);
    if (inner) return inner;
  }
  return null;
}

/** A small button at a row's end: shown while the row is pointed at (and always when on, or on a touch screen). */
function RowButton({ label, onClick, shown, children }: { label: string; onClick: () => void; shown: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cx(
        'grid h-6 w-6 shrink-0 place-items-center rounded text-fg-3 hover:bg-bg-3 hover:text-fg focus-visible:opacity-100 pointer-coarse:h-8 pointer-coarse:w-8 pointer-coarse:opacity-100',
        shown ? 'opacity-100' : 'opacity-0 group-hover/layer:opacity-100 group-focus-within/layer:opacity-100',
      )}
    >
      {children}
    </button>
  );
}

/** A layer's name being written: Enter keeps it (empty: its kind's name again), Esc leaves it as it was. */
function NameField({ value, placeholder, onDone }: { value: string; placeholder: string; onDone: (name: string | null) => void }) {
  const [v, setV] = useState(value);
  const done = useRef(false);
  const finish = (name: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(name);
  };
  return (
    <input
      autoFocus
      value={v}
      placeholder={placeholder}
      aria-label={tr('Layer name')}
      onChange={(e) => setV(e.target.value)}
      onFocus={(e) => e.currentTarget.select()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') finish(v.trim());
        else if (e.key === 'Escape') finish(null);
      }}
      onBlur={() => finish(v.trim())}
      maxLength={80}
      className="h-6 min-w-0 flex-1 rounded border border-accent bg-bg-1 px-1.5 text-[12.5px] text-fg outline-none"
    />
  );
}
