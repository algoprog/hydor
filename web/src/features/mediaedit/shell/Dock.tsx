// The editors' panels, as a pro app docks them on the right: groups of tabbed panels one above the other, each group
// folded away by its chevron, the line between two groups dragged to share the height, the dock's left edge dragged to
// make it wider; all of it remembered in this browser. `focus` brings a panel forward (a menu item that opens it). On a
// phone, PanelSheet shows the same panels in a sheet from the bottom, tabs along its top, the picture still in view.
import { useEffect, useRef, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { cx, IconButton } from '../../../components/ui';
import { usePersisted } from './persist';

export interface DockPanel {
  id: string;
  label: string;
  icon?: ReactNode;
  render: () => ReactNode;
}

interface DockState {
  width: number;
  tabs: Record<number, string>;
  folded: Record<number, boolean>;
  weights: number[];
}

const MIN_W = 240;
const MAX_W = 520;

export function Dock({ id, panels, groups, focus, defaultWidth = 300, defaultWeights, defaultFolded }: { id: string; panels: DockPanel[]; groups: string[][]; focus?: { panel: string; n: number } | null; defaultWidth?: number; defaultWeights?: number[]; defaultFolded?: Record<number, boolean> }) {
  const [st, setSt] = usePersisted<DockState>(`${id}.dock`, { width: defaultWidth, tabs: {}, folded: defaultFolded ?? {}, weights: defaultWeights ?? groups.map(() => 1) });
  const box = useRef<HTMLDivElement>(null);
  const byId = (p: string) => panels.find((x) => x.id === p);
  const weights = groups.map((_, i) => st.weights[i] ?? 1);
  const tabOf = (i: number) => (groups[i].includes(st.tabs[i]) ? st.tabs[i] : groups[i][0]);

  // A panel asked for: its group shows it, unfolded.
  useEffect(() => {
    if (!focus) return;
    const i = groups.findIndex((g) => g.includes(focus.panel));
    if (i < 0) return;
    setSt((s) => ({ ...s, tabs: { ...s.tabs, [i]: focus.panel }, folded: { ...s.folded, [i]: false } }));
  }, [focus?.n]); // eslint-disable-line react-hooks/exhaustive-deps

  const dragWidth = (e: React.PointerEvent) => {
    e.preventDefault();
    const x0 = e.clientX;
    const w0 = st.width;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => setSt((s) => ({ ...s, width: Math.round(Math.max(MIN_W, Math.min(MAX_W, w0 + x0 - ev.clientX))) }));
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };

  /** The line under group `i` dragged: it and the next open group share their height anew. */
  const dragSplit = (i: number) => (e: React.PointerEvent) => {
    const j = groups.findIndex((_, k) => k > i && !st.folded[k]);
    if (j < 0 || st.folded[i]) return;
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const nodes = box.current?.querySelectorAll<HTMLElement>('[data-dock-group]');
    const a = nodes?.[i]?.getBoundingClientRect().height ?? 100;
    const b = nodes?.[j]?.getBoundingClientRect().height ?? 100;
    const y0 = e.clientY;
    const total = weights[i] + weights[j];
    const move = (ev: PointerEvent) => {
      const ha = Math.max(60, Math.min(a + b - 60, a + ev.clientY - y0));
      const wa = (ha / (a + b)) * total;
      setSt((s) => {
        const w = groups.map((_, k) => s.weights[k] ?? 1);
        w[i] = wa;
        w[j] = total - wa;
        return { ...s, weights: w };
      });
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };

  return (
    <aside ref={box} aria-label="Panels" className="relative flex min-h-0 shrink-0 flex-col border-l border-line bg-panel" style={{ width: st.width }}>
      <span aria-hidden onPointerDown={dragWidth} className="absolute top-0 bottom-0 -left-1 z-10 w-2 cursor-ew-resize" />
      {groups.map((g, i) => {
        const folded = !!st.folded[i];
        const tab = tabOf(i);
        const p = byId(tab);
        return (
          <div key={g.join()} data-dock-group className={cx('flex min-h-0 flex-col', !folded && 'min-h-[60px]')} style={folded ? { flex: 'none' } : { flexGrow: weights[i], flexBasis: 0 }}>
            <div className={cx('flex h-8 shrink-0 items-center gap-0.5 border-line bg-bg-1 pr-1 pl-1', i > 0 && 'border-t', !folded && 'border-b')}>
              <div role="tablist" className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [&::-webkit-scrollbar]:hidden">
                {g.map((pid) => {
                  const x = byId(pid);
                  if (!x) return null;
                  const on = pid === tab && !folded;
                  return (
                    <button
                      key={pid}
                      type="button"
                      role="tab"
                      aria-selected={on}
                      onClick={() => setSt((s) => ({ ...s, tabs: { ...s.tabs, [i]: pid }, folded: { ...s.folded, [i]: false } }))}
                      className={cx('flex h-6.5 shrink-0 items-center gap-1 rounded-md px-2 text-[12px] font-medium whitespace-nowrap', on ? 'bg-panel text-fg shadow-[0_1px_2px_rgba(0,0,0,0.12)] ring-1 ring-line' : 'text-fg-3 hover:text-fg')}
                    >
                      {x.icon}
                      {x.label}
                    </button>
                  );
                })}
              </div>
              <IconButton label={folded ? 'Show the panel' : 'Fold the panel'} size="sm" onClick={() => setSt((s) => ({ ...s, folded: { ...s.folded, [i]: !folded } }))}>
                {folded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
              </IconButton>
            </div>
            {!folded && p && <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain">{p.render()}</div>}
            {!folded && i < groups.length - 1 && <span aria-hidden onPointerDown={dragSplit(i)} className="relative z-10 -my-1 h-2 shrink-0 cursor-ns-resize" />}
          </div>
        );
      })}
    </aside>
  );
}

/** On a phone: the panels in a sheet from the bottom, their tabs along its top; the picture stays in view above it. */
export function PanelSheet({ panels, tab, onTab, onClose }: { panels: DockPanel[]; tab: string; onTab: (id: string) => void; onClose: () => void }) {
  const p = panels.find((x) => x.id === tab) ?? panels[0];
  return (
    <div role="dialog" aria-label="Panels" className="absolute inset-x-0 bottom-0 z-30 flex max-h-[58%] min-h-[40%] flex-col rounded-t-[18px] border border-b-0 border-line bg-elevated shadow-lg">
      <div className="flex shrink-0 items-center gap-1 border-b border-line px-2 pt-2 pb-1.5">
        <div role="tablist" className="flex min-w-0 flex-1 gap-0.5 overflow-x-auto [&::-webkit-scrollbar]:hidden">
          {panels.map((x) => (
            <button key={x.id} type="button" role="tab" aria-selected={x.id === p.id} onClick={() => onTab(x.id)} className={cx('flex h-8 shrink-0 items-center gap-1 rounded-lg px-2.5 text-[13px] font-medium whitespace-nowrap', x.id === p.id ? 'bg-bg-2 text-fg' : 'text-fg-3')}>
              {x.icon}
              {x.label}
            </button>
          ))}
        </div>
        <IconButton label="Close" onClick={onClose}>
          <X size={17} />
        </IconButton>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[var(--safe-bottom)]">{p.render()}</div>
    </div>
  );
}
