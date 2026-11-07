// The shapes beside a diagram, as draw.io's sidebar: a search, then groups of shapes drawn as they will be (General,
// Connectors, Flowchart, Containers, UML, Entity relation, BPMN, Network and cloud, Sticky notes), each group folding
// away; a search finds Lucide's icons too, every one of them. A click puts a shape in the middle of what shows; a drag
// puts it where it is dropped.
import { memo, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Search, X } from 'lucide-react';
import { DARK, LIGHT, type DiagramEdge, type DiagramShape } from '@shared/diagram';
import { KINDS } from '@shared/diagram-shapes';
import { edgeSvg, shapeSvg } from '@shared/diagram-render';
import { PALETTE, searchPalette, type PaletteEntry } from '@shared/diagram-palette';
import type { IconNode } from '@shared/slides';
import { cx } from '../../../components/ui';

/** What a drag from the panel carries: an entry of the library, or one of Lucide's icons. */
export type Pick = { entry: PaletteEntry; icon?: IconNode[] };

const OPEN_KEY = 'hydor.diagram.groups';
const openGroups = (): Set<string> => {
  try {
    const v = JSON.parse(localStorage.getItem(OPEN_KEY) ?? 'null');
    if (Array.isArray(v)) return new Set(v);
  } catch {}
  return new Set(['general', 'lines', 'flowchart']);
};

type Icons = { iconPaths: (n: string) => IconNode[] | null; ICON_NAMES: string[] };
let iconsMod: Icons | null = null;
let iconsLoading: Promise<Icons> | null = null;
/** Lucide's icons, loaded the first time the panel shows. */
export const loadIcons = () => (iconsLoading ??= import('./icons').then((m) => (iconsMod = m)));
export const iconsNow = () => iconsMod;

/** An entry drawn small, as it will look. */
const Preview = memo(function Preview({ e, dark, icon }: { e: PaletteEntry; dark: boolean; icon?: IconNode[] | null }) {
  const theme = dark ? DARK : LIGHT;
  if (e.edge) {
    const ed: DiagramEdge = { id: 'pv', type: 'edge', from: { x: 6, y: 34 }, to: { x: 58, y: 10 }, route: e.edge.route === 'curved' ? 'curved' : 'straight', ...(e.edge.style ? { style: e.edge.style } : {}) };
    if (e.edge.route === 'curved') ed.points = [[20, 12]];
    return <svg viewBox="0 0 64 44" className="h-full w-full" dangerouslySetInnerHTML={{ __html: edgeSvg(ed, new Map(), { theme }) }} />;
  }
  const kind = e.shape ?? 'rect';
  // Words and pictures drawn as what they are, large enough to read in a small tile.
  if (kind === 'text') return <span className={cx('flex h-full w-full items-center justify-center text-fg-2', e.style?.bold ? 'text-[15px] font-bold' : 'text-[14px]')}>{e.style?.bold ? 'Title' : 'Text'}</span>;
  if (kind === 'image')
    return (
      <svg viewBox="0 0 24 24" className="h-full w-full p-1.5 text-fg-2" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="9" cy="9" r="2" />
        <path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
      </svg>
    );
  const def = KINDS[kind];
  const w = e.w ?? def.w;
  const h = e.h ?? def.h;
  const s: DiagramShape = { id: `pv-${e.id}`, type: 'shape', shape: kind, x: 0, y: 0, w, h, ...(e.rows ? { rows: e.rows } : {}), ...(e.style ? { style: e.style } : {}) };
  if (kind === 'icon' && icon) s.icon = { name: e.icon ?? '', paths: icon };
  const m = Math.max(w, h) * 0.08 + 2;
  return <svg viewBox={`${-m} ${-m} ${w + 2 * m} ${h + 2 * m}`} className="h-full w-full" preserveAspectRatio="xMidYMid meet" dangerouslySetInnerHTML={{ __html: shapeSvg(s, { theme }) }} />;
});

function Tile({ e, dark, icon, onPick, onDrag }: { e: PaletteEntry; dark: boolean; icon?: IconNode[] | null; onPick: (p: Pick) => void; onDrag: (p: Pick, ev: React.PointerEvent) => void }) {
  const pick: Pick = { entry: e, icon: icon ?? undefined };
  return (
    <button
      type="button"
      title={e.label}
      aria-label={e.label}
      onPointerDown={(ev) => {
        if (ev.button !== 0) return;
        onDrag(pick, ev);
      }}
      onClick={() => onPick(pick)}
      className="flex aspect-square min-w-0 touch-none items-center justify-center rounded-md p-1 text-fg hover:bg-bg-2 focus-visible:ring-2 focus-visible:ring-accent/40"
    >
      <span translate="no" className="block h-full w-full">
        <Preview e={e} dark={dark} icon={icon} />
      </span>
    </button>
  );
}

export function ShapePanel({ dark, onPick, onDrag, className }: { dark: boolean; onPick: (p: Pick) => void; onDrag: (p: Pick, ev: React.PointerEvent) => void; className?: string }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(openGroups);
  const [icons, setIcons] = useState<Icons | null>(iconsMod);
  useEffect(() => {
    if (!icons) void loadIcons().then(setIcons);
  }, [icons]);
  const toggle = (id: string) => {
    const next = new Set(open);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setOpen(next);
    try {
      localStorage.setItem(OPEN_KEY, JSON.stringify([...next]));
    } catch {}
  };
  const found = useMemo(() => (q.trim() ? searchPalette(q) : []), [q]);
  // Lucide's icons whose names hold the search, as icon shapes.
  const foundIcons = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length || !icons) return [];
    return icons.ICON_NAMES.filter((n) => words.every((w) => n.includes(w)))
      .slice(0, 80)
      .map((n): PaletteEntry => ({ id: `icon.${n}`, label: n.replace(/-/g, ' '), shape: 'icon', icon: n, text: '' }));
  }, [q, icons]);
  const iconOf = (e: PaletteEntry) => (e.icon && icons ? icons.iconPaths(e.icon) : null);
  return (
    <div className={cx('flex min-h-0 flex-col', className)}>
      <div className="shrink-0 p-2">
        <label className="flex h-8 items-center gap-1.5 rounded-lg border border-line bg-bg-1 px-2 focus-within:border-accent/60">
          <Search size={13} className="shrink-0 text-fg-3" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search shapes and icons" className="min-w-0 flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-fg-3" />
          {q && (
            <button type="button" aria-label="Clear the search" onClick={() => setQ('')} className="text-fg-3 hover:text-fg">
              <X size={13} />
            </button>
          )}
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-3">
        {q.trim() ? (
          <>
            {!found.length && !foundIcons.length && <p className="px-2 py-4 text-center text-[12.5px] text-fg-3">No shape or icon by that name</p>}
            {!!found.length && (
              <div className="grid grid-cols-4 gap-0.5 px-0.5">
                {found.map((e) => (
                  <Tile key={e.id} e={e} dark={dark} icon={iconOf(e)} onPick={onPick} onDrag={onDrag} />
                ))}
              </div>
            )}
            {!!foundIcons.length && (
              <>
                <div className="px-1.5 pt-3 pb-1 text-[11.5px] font-medium text-fg-3">Icons</div>
                <div className="grid grid-cols-4 gap-0.5 px-0.5">
                  {foundIcons.map((e) => (
                    <Tile key={e.id} e={e} dark={dark} icon={iconOf(e)} onPick={onPick} onDrag={onDrag} />
                  ))}
                </div>
              </>
            )}
          </>
        ) : (
          PALETTE.map((g) => (
            <section key={g.id} className="border-b border-line/60 last:border-b-0">
              <button type="button" onClick={() => toggle(g.id)} className="flex w-full items-center gap-1 px-1.5 py-2 text-left text-[12px] font-medium text-fg-2 hover:text-fg">
                {open.has(g.id) ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                {g.label}
              </button>
              {open.has(g.id) && (
                <div className="grid grid-cols-4 gap-0.5 px-0.5 pb-2">
                  {g.entries.map((e) => (
                    <Tile key={e.id} e={e} dark={dark} icon={iconOf(e)} onPick={onPick} onDrag={onDrag} />
                  ))}
                </div>
              )}
            </section>
          ))
        )}
      </div>
    </div>
  );
}
