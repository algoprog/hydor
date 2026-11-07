// New's pictures (NewDialog.tsx): each starting point drawn small, as it will look, so they are told apart at a glance
// rather than read. A page's starters in the app's colours (a page follows its light or dark theme), with the covers and
// icons their templates have; LaTeX's templates and a document as white paper, as they typeset; a spreadsheet's grid,
// a notebook's cells and a diagram's shapes. Drawn with boxes sized to the card (cqw: a hundredth of its width), so
// they stay sharp at any size and cost nothing to load. Also the cards they sit on, and the card that opens a file.
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Check, FileUp } from 'lucide-react';
import { cx } from '../../components/ui';

/** A starting point: its picture (`art`), its name and a line on it; picked, it is ringed and ticked (a double click makes it). */
export function Tile({
  on,
  onClick,
  onOpen,
  art,
  label,
  hint,
  extra,
  ratio = '4 / 3',
  title,
}: {
  on: boolean;
  onClick: () => void;
  /** A double click: picks it and makes it at once. */
  onOpen?: () => void;
  art: ReactNode;
  label: ReactNode;
  hint?: ReactNode;
  extra?: ReactNode;
  ratio?: string;
  title?: string;
}) {
  return (
    <button type="button" role="radio" aria-checked={on} onClick={onClick} onDoubleClick={onOpen} title={title} className="group flex min-w-0 flex-col rounded-xl text-left outline-none">
      <span
        className={cx(
          'relative block w-full overflow-hidden rounded-xl border transition-[border-color,box-shadow] duration-150',
          on ? 'border-accent ring-2 ring-accent/35' : 'border-line group-hover:border-line-2 group-hover:shadow-[var(--shadow)] group-focus-visible:ring-2 group-focus-visible:ring-accent/40',
        )}
        style={{ aspectRatio: ratio }}
      >
        {art}
        {on && (
          <span className="absolute top-1.5 right-1.5 grid h-5 w-5 place-items-center rounded-full bg-accent text-accent-fg shadow-sm">
            <Check size={12} strokeWidth={3} />
          </span>
        )}
      </span>
      <span className={cx('mt-2 flex min-w-0 items-center gap-1.5 text-[13px] leading-[18px] font-medium', on ? 'text-fg' : 'text-fg-2 group-hover:text-fg')}>
        <span className="min-w-0 truncate">{label}</span>
        {extra}
      </span>
      {hint && <span className="mt-0.5 line-clamp-2 block text-[11.5px] leading-[15px] text-fg-3">{hint}</span>}
    </button>
  );
}

/** Its child drawn as wide as it is (a slide or a design drawn to the card's width). */
export function AutoWidth({ children }: { children: (w: number) => ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return <div ref={ref}>{children(w)}</div>;
}

/** Starts from a file of yours instead: it opens the device's file chooser at once. */
export function OpenTile({ label, hint, onClick, disabled, ratio = '4 / 3' }: { label: ReactNode; hint?: ReactNode; onClick: () => void; disabled?: boolean; ratio?: string }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="group flex min-w-0 flex-col rounded-xl text-left outline-none disabled:opacity-50">
      <span
        className="grid w-full place-items-center rounded-xl border border-dashed border-line-2 text-fg-3 transition-colors duration-150 group-hover:border-accent/70 group-hover:bg-accent-soft group-hover:text-accent group-focus-visible:ring-2 group-focus-visible:ring-accent/40"
        style={{ aspectRatio: ratio }}
      >
        <span className="grid h-10 w-10 place-items-center rounded-full bg-bg-2 transition-colors group-hover:bg-transparent">
          <FileUp size={18} strokeWidth={1.8} />
        </span>
      </span>
      <span className="mt-2 block text-[13px] leading-[17px] font-medium text-fg-2 group-hover:text-fg">{label}</span>
      {hint && <span className="mt-0.5 line-clamp-2 block text-[11.5px] leading-[15px] text-fg-3">{hint}</span>}
    </button>
  );
}

// ---- the parts they are drawn with ----------------------------------------------------------

/** A line of words: `w` a share of the line (a number, in %) or any width; `h` in cqw. */
function Bar({ w, h = 2.4, c = 'bg-fg/15', className, style }: { w: number | string; h?: number; c?: string; className?: string; style?: CSSProperties }) {
  return <div className={cx('shrink-0 rounded-full', c, className)} style={{ width: typeof w === 'number' ? `${w}%` : w, height: `${h}cqw`, ...style }} />;
}

const Lines = ({ ws, h = 1.4, c = 'bg-black/18' }: { ws: number[]; h?: number; c?: string }) => (
  <>
    {ws.map((w, i) => (
      <Bar key={i} w={w} h={h} c={c} />
    ))}
  </>
);

/** A to-do's box, ticked or not. */
function Box({ done }: { done?: boolean }) {
  return (
    <span className={cx('grid shrink-0 place-items-center', done ? 'bg-accent text-accent-fg' : 'border border-fg/30')} style={{ width: '4.4cqw', height: '4.4cqw', borderRadius: '1cqw' }}>
      {done && (
        <svg viewBox="0 0 12 12" style={{ width: '80%', height: '80%' }} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M2.6 6.3 5 8.6l4.4-5" />
        </svg>
      )}
    </span>
  );
}

const Row = ({ children, gap = 2.2 }: { children: ReactNode; gap?: number }) => (
  <div className="flex items-center" style={{ gap: `${gap}cqw` }}>
    {children}
  </div>
);

/** A page of the app's own: its cover and icon (a template's), its title, then what it holds. */
function Sheet({ cover, icon, children }: { cover?: string; icon?: string; children: ReactNode }) {
  return (
    <div translate="no" aria-hidden className="@container absolute inset-0 bg-panel">
      {cover && <div style={{ height: '19cqw', background: cover }} />}
      <div style={{ padding: cover ? '0 8cqw' : '8cqw 8cqw 0' }}>
        {icon && <div style={{ fontSize: '10cqw', lineHeight: 1, marginTop: '-5.5cqw', marginBottom: '2.4cqw' }}>{icon}</div>}
        <Bar w={54} h={4.4} c="bg-fg/75" />
        <div className="flex flex-col" style={{ gap: '2.4cqw', marginTop: '3.6cqw' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

// ---- a page's starting points (templates.ts, pageTemplates.ts) ----------------------------------

const BARS = [34, 58, 42, 72, 48, 84, 62, 38, 76, 52, 92, 66, 44, 88];

export function StarterArt({ id }: { id: string }) {
  switch (id) {
    case 'blank':
      return (
        <Sheet>
          <Bar w={90} c="bg-fg/20" />
          <Bar w={66} c="bg-fg/20" />
          <div className="bg-accent" style={{ width: '0.7cqw', height: '4.6cqw', marginTop: '1cqw' }} />
        </Sheet>
      );
    case 'notes':
      return (
        <Sheet>
          <Bar w={30} h={2} c="bg-fg/25" />
          <div className="flex flex-col border border-fg/15" style={{ height: '40cqw', padding: '3.2cqw', gap: '2.6cqw', borderRadius: '2.2cqw' }}>
            <Bar w={84} c="bg-fg/18" />
            <Bar w={92} c="bg-fg/18" />
            <Bar w={58} c="bg-fg/18" />
          </div>
        </Sheet>
      );
    case 'checklist':
      return (
        <Sheet>
          <Row gap={2}>
            <div className="flex-1 border border-fg/15" style={{ height: '7cqw', borderRadius: '1.6cqw' }} />
            <div className="bg-accent" style={{ width: '14cqw', height: '7cqw', borderRadius: '1.6cqw' }} />
          </Row>
          {[
            [true, 52],
            [true, 64],
            [false, 46],
            [false, 58],
          ].map(([done, w], i) => (
            <div key={i} className="flex items-center border border-fg/10 bg-fg/[0.03]" style={{ gap: '2.4cqw', padding: '1.6cqw 2.4cqw', borderRadius: '1.6cqw' }}>
              <Box done={done as boolean} />
              <Bar w={w as number} c={done ? 'bg-fg/12' : 'bg-fg/25'} />
            </div>
          ))}
        </Sheet>
      );
    case 'tracker':
      return (
        <Sheet>
          <Bar w={28} h={2} c="bg-fg/25" />
          <Row gap={9}>
            <div className="flex flex-col" style={{ gap: '1.4cqw' }}>
              <Bar w="13cqw" h={6} c="bg-fg/75" style={{ borderRadius: '1cqw' }} />
              <Bar w="9cqw" h={1.8} c="bg-fg/25" />
            </div>
            <div className="flex flex-col" style={{ gap: '1.4cqw' }}>
              <Bar w="10cqw" h={6} c="bg-fg/75" style={{ borderRadius: '1cqw' }} />
              <Bar w="16cqw" h={1.8} c="bg-fg/25" />
            </div>
          </Row>
          <div className="flex items-end border border-fg/12" style={{ height: '24cqw', gap: '1.1cqw', padding: '2cqw', borderRadius: '2cqw' }}>
            {BARS.map((h, i) => (
              <div key={i} className="flex-1 bg-accent/85" style={{ height: `${h}%`, borderRadius: '0.8cqw 0.8cqw 0 0' }} />
            ))}
          </div>
        </Sheet>
      );
    case 'meeting':
      return (
        <Sheet cover="linear-gradient(135deg,#a1c4fd,#c2e9fb)" icon="🗓️">
          <Bar w={46} h={2} c="bg-fg/25" />
          <Bar w={22} h={3} c="bg-fg/55" />
          {[70, 52, 62].map((w, i) => (
            <Row key={i} gap={1.8}>
              <span className="font-semibold text-fg/45" style={{ fontSize: '3.2cqw', lineHeight: 1 }}>
                {i + 1}.
              </span>
              <Bar w={w} c="bg-fg/18" />
            </Row>
          ))}
          <Bar w={30} h={3} c="bg-fg/55" />
          <Row>
            <Box done />
            <Bar w={58} c="bg-fg/18" />
          </Row>
          <Row>
            <Box />
            <Bar w={44} c="bg-fg/18" />
          </Row>
        </Sheet>
      );
    case 'project':
      return (
        <Sheet cover="linear-gradient(135deg,#667eea,#764ba2)" icon="🚀">
          <div className="grid grid-cols-3" style={{ gap: '2.2cqw' }}>
            {(
              [
                [3, '#94a3b8'],
                [2, '#f59e0b'],
                [2, '#22c55e'],
              ] as const
            ).map(([n, dot], i) => (
              <div key={i} className="flex flex-col bg-fg/[0.05]" style={{ gap: '1.6cqw', padding: '1.8cqw', borderRadius: '1.6cqw' }}>
                <Row gap={1.4}>
                  <span className="shrink-0 rounded-full" style={{ width: '2.2cqw', height: '2.2cqw', background: dot }} />
                  <Bar w={54} h={1.8} c="bg-fg/35" />
                </Row>
                {Array.from({ length: n }, (_, j) => (
                  <div key={j} className="flex flex-col border border-fg/10 bg-panel" style={{ padding: '1.6cqw', gap: '1.2cqw', borderRadius: '1.2cqw' }}>
                    <Bar w={j % 2 ? 60 : 82} h={1.7} c="bg-fg/25" />
                    <Bar w={40} h={1.4} c="bg-fg/12" />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Sheet>
      );
    case 'wiki':
      return (
        <Sheet cover="linear-gradient(135deg,#d4fc79,#96e6a1)" icon="📚">
          <div className="flex flex-col bg-fg/[0.05]" style={{ gap: '2cqw', padding: '2.6cqw', borderRadius: '1.6cqw' }}>
            <Bar w={30} h={2.2} c="bg-fg/40" />
            {[56, 42, 64].map((w, i) => (
              <Row key={i} gap={1.8}>
                <span className="shrink-0 rounded-full bg-accent" style={{ width: '1.8cqw', height: '1.8cqw' }} />
                <Bar w={w} h={2} c="bg-accent/40" />
              </Row>
            ))}
          </div>
          <Bar w={36} h={3} c="bg-fg/55" />
          <Bar w={90} c="bg-fg/18" />
          <Bar w={74} c="bg-fg/18" />
        </Sheet>
      );
    case 'journal':
      return (
        <Sheet cover="linear-gradient(135deg,#fbc2eb,#a6c1ee)" icon="📔">
          <div className="grid grid-cols-7" style={{ gap: '1.2cqw' }}>
            {Array.from({ length: 21 }, (_, i) => (
              <div key={i} className={cx(i === 10 ? 'border border-accent bg-accent/15' : 'bg-fg/[0.06]')} style={{ height: '7cqw', padding: '1cqw', borderRadius: '1cqw' }}>
                {[2, 4, 8, 13, 16].includes(i) && <div className="rounded-full bg-accent/70" style={{ height: '1.4cqw', width: '72%' }} />}
              </div>
            ))}
          </div>
        </Sheet>
      );
    case 'reading':
      return (
        <Sheet cover="linear-gradient(135deg,#f6d365,#fda085)" icon="📖">
          <div className="grid grid-cols-4" style={{ gap: '2.6cqw' }}>
            {['#f97316', '#0ea5e9', '#84cc16', '#a855f7'].map((c, i) => (
              <div key={c} className="flex flex-col" style={{ gap: '1.4cqw' }}>
                <div style={{ aspectRatio: '2 / 3', borderRadius: '1cqw', background: `linear-gradient(160deg, ${c}, color-mix(in srgb, ${c} 60%, #000))` }} />
                <Bar w={84} h={1.7} c="bg-fg/25" />
                <div className="flex" style={{ gap: '0.7cqw' }}>
                  {[0, 1, 2, 3, 4].map((s) => (
                    <span key={s} className={cx('rounded-full', s < 5 - (i % 3) ? 'bg-[#f5b301]' : 'bg-fg/15')} style={{ width: '1.6cqw', height: '1.6cqw' }} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Sheet>
      );
    case 'trip':
      return (
        <Sheet cover="linear-gradient(135deg,#89f7fe,#66a6ff)" icon="✈️">
          <div className="grid grid-cols-7" style={{ gap: '1.2cqw' }}>
            {Array.from({ length: 7 }, (_, i) => (
              <div key={i} className={i >= 2 && i <= 4 ? 'bg-accent/70' : 'bg-fg/[0.06]'} style={{ height: '6cqw', borderRadius: '1cqw' }} />
            ))}
          </div>
          <Row>
            <Box done />
            <Bar w={44} c="bg-fg/18" />
          </Row>
          <Row>
            <Box />
            <Bar w={56} c="bg-fg/18" />
          </Row>
          <div className="flex items-center justify-between border-t border-fg/12" style={{ paddingTop: '2cqw' }}>
            <Bar w={18} h={2.2} c="bg-fg/40" />
            <Bar w={16} h={2.8} c="bg-fg/70" />
          </div>
        </Sheet>
      );
    case 'habits':
      return (
        <Sheet cover="linear-gradient(135deg,#d4fc79,#96e6a1)" icon="✅">
          {[
            [1, 1, 0],
            [1, 0, 1],
            [1, 1, 1],
            [0, 1, 0],
          ].map((r, i) => (
            <div key={i} className="flex items-center" style={{ gap: '2.4cqw' }}>
              <Bar w="14cqw" h={2} c="bg-fg/25" />
              {r.map((v, j) => (
                <Box key={j} done={!!v} />
              ))}
              <Bar w={`${5 + r.reduce((a, b) => a + b, 0) * 3}cqw`} h={2.2} c="bg-ok/60" style={{ marginLeft: 'auto' }} />
            </div>
          ))}
        </Sheet>
      );
    default:
      return (
        <Sheet>
          <Bar w={90} c="bg-fg/20" />
          <Bar w={70} c="bg-fg/20" />
        </Sheet>
      );
  }
}

// ---- paper: LaTeX's templates and a document, as they typeset ------------------------------------

/** A sheet of white paper on the card, upright (or on its side, a slide's), with what is on it. */
function Paper({ children, landscape, pad = 5.5, gap = 1.7 }: { children: ReactNode; landscape?: boolean; pad?: number; gap?: number }) {
  return (
    <div translate="no" aria-hidden className="@container absolute inset-0 grid place-items-center bg-bg-2">
      <div
        className="relative overflow-hidden bg-white shadow-[0_1px_4px_rgba(0,0,0,0.22)]"
        style={landscape ? { width: '76%', aspectRatio: '4 / 3', borderRadius: '0.6cqw' } : { height: '86%', aspectRatio: '1 / 1.3', borderRadius: '0.4cqw' }}
      >
        <div className="flex h-full flex-col" style={{ padding: `${pad}cqw`, gap: `${gap}cqw` }}>
          {children}
        </div>
      </div>
    </div>
  );
}

const INK = 'bg-[#1f2328]/75';
const TEXT = 'bg-[#1f2328]/18';
const SOFT = 'bg-[#1f2328]/35';

export function TexArt({ id }: { id: string }) {
  switch (id) {
    case 'report':
      return (
        <Paper>
          <Bar w={24} h={1.5} c={SOFT} />
          <Bar w={62} h={3.6} c={INK} />
          <Lines ws={[100, 96, 100, 70]} c={TEXT} />
          <div className="mx-auto flex w-[82%] flex-col" style={{ gap: '1cqw', marginTop: '0.6cqw' }}>
            <div className="h-px bg-[#1f2328]/60" />
            <div className="grid grid-cols-3" style={{ gap: '2cqw' }}>
              <Bar w={70} h={1.3} c="bg-[#1f2328]/45" />
              <Bar w={50} h={1.3} c="bg-[#1f2328]/45" />
              <Bar w={60} h={1.3} c="bg-[#1f2328]/45" />
            </div>
            <div className="h-px bg-[#1f2328]/35" />
            {[0, 1].map((r) => (
              <div key={r} className="grid grid-cols-3" style={{ gap: '2cqw' }}>
                <Bar w={80} h={1.2} c={TEXT} />
                <Bar w={40} h={1.2} c={TEXT} />
                <Bar w={55} h={1.2} c={TEXT} />
              </div>
            ))}
            <div className="h-px bg-[#1f2328]/60" />
          </div>
        </Paper>
      );
    case 'book':
      return (
        <Paper gap={2}>
          <div className="flex flex-1 flex-col items-center justify-center" style={{ gap: '2cqw' }}>
            <Bar w={74} h={3.6} c={INK} />
            <Bar w={52} h={3.6} c={INK} />
            <div className="bg-[#1f2328]/50" style={{ width: '40%', height: '0.35cqw', margin: '1cqw 0' }} />
            <Bar w={34} h={1.8} c={SOFT} />
          </div>
          <div className="flex flex-col items-center" style={{ gap: '1.2cqw' }}>
            <Bar w={50} h={1.5} c={SOFT} />
            <Bar w={22} h={1.3} c={TEXT} />
          </div>
        </Paper>
      );
    case 'letter':
      return (
        <Paper gap={1.5}>
          <div className="ml-auto flex w-[38%] flex-col" style={{ gap: '1cqw' }}>
            <Lines ws={[100, 80, 64]} h={1.2} c={SOFT} />
          </div>
          <div className="flex w-[40%] flex-col" style={{ gap: '1cqw' }}>
            <Lines ws={[90, 100, 60]} h={1.2} c={SOFT} />
          </div>
          <Bar w={26} h={1.2} c={TEXT} className="ml-auto" />
          <Bar w={30} h={1.5} c="bg-[#1f2328]/50" />
          <Lines ws={[100, 96, 100, 88, 100, 54]} h={1.2} c={TEXT} />
          <Bar w={24} h={1.4} c="bg-[#1f2328]/45" style={{ marginTop: '1cqw' }} />
          <svg viewBox="0 0 40 10" style={{ width: '30%' }} fill="none" stroke="#1f2328" strokeOpacity={0.6} strokeWidth={1.1} strokeLinecap="round">
            <path d="M1 7c3-6 5-6 5-1s3 3 6-1 4-4 4 0 3 2 6-1 4-2 6 0 4 1 9-2" />
          </svg>
        </Paper>
      );
    case 'beamer':
      return (
        <Paper landscape pad={0} gap={0}>
          <div className="flex items-center bg-[#23373b]" style={{ height: '24%', padding: '0 6cqw' }}>
            <Bar w={50} h={3} c="bg-white/90" />
          </div>
          <div className="bg-[#eb811b]" style={{ width: '38%', height: '0.8cqw' }} />
          <div className="flex flex-col" style={{ gap: '2.4cqw', padding: '4.5cqw 6cqw' }}>
            {[62, 74, 50].map((w, i) => (
              <Row key={i} gap={2}>
                <span className="shrink-0 rounded-full bg-[#eb811b]" style={{ width: '1.8cqw', height: '1.8cqw' }} />
                <Bar w={w} h={1.8} c="bg-[#23373b]/30" />
              </Row>
            ))}
          </div>
        </Paper>
      );
    case 'cv':
      return (
        <Paper gap={1.5}>
          <Bar w={58} h={4} c="bg-[#3873b3]" />
          <Bar w={36} h={1.6} c={SOFT} />
          {[0, 1].map((s) => (
            <div key={s} className="flex flex-col" style={{ gap: '1.3cqw', marginTop: '1.2cqw' }}>
              <Row gap={2}>
                <div className="rounded-sm bg-[#3873b3]/55" style={{ width: '20%', height: '1.6cqw' }} />
                <Bar w={34} h={2.2} c="bg-[#3873b3]" />
              </Row>
              {[0, 1].map((r) => (
                <Row key={r} gap={2}>
                  <Bar w="20%" h={1.2} c="bg-[#1f2328]/30" />
                  <Bar w={r ? 44 : 60} h={1.2} c={TEXT} />
                </Row>
              ))}
            </div>
          ))}
        </Paper>
      );
    case 'homework':
      return (
        <Paper gap={1.5}>
          <div className="flex items-start justify-between">
            <Bar w={36} h={2.6} c={INK} />
            <div className="flex w-[26%] flex-col items-end" style={{ gap: '1cqw' }}>
              <Bar w={100} h={1.2} c={SOFT} />
              <Bar w={70} h={1.2} c={TEXT} />
            </div>
          </div>
          <div className="bg-[#1f2328]/50" style={{ height: '0.35cqw' }} />
          <Bar w={30} h={2.1} c="bg-[#1f2328]/65" />
          <Lines ws={[100, 78]} h={1.2} c={TEXT} />
          <Bar w={20} h={1.5} c="bg-[#1f2328]/40" />
          <Lines ws={[92, 60]} h={1.2} c={TEXT} />
          <Bar w={30} h={2.1} c="bg-[#1f2328]/65" />
          <Lines ws={[100, 70]} h={1.2} c={TEXT} />
        </Paper>
      );
    case 'paper':
    case 'ieee':
    case 'acm':
    case 'lncs':
      return (
        <Paper gap={1.3}>
          <Bar w={74} h={2.8} c={INK} className="mx-auto" />
          <Bar w={48} h={1.3} c={SOFT} className="mx-auto" />
          <div className="grid grid-cols-2" style={{ gap: '3cqw', marginTop: '1cqw' }}>
            <div className="flex flex-col" style={{ gap: '1.1cqw' }}>
              <Bar w={46} h={1.6} c="bg-[#1f2328]/55" />
              <Lines ws={[100, 100, 92, 100, 64]} h={1.1} c={TEXT} />
              <div className="border border-[#1f2328]/15 bg-[#1f2328]/[0.06]" style={{ height: '9cqw', borderRadius: '0.4cqw' }} />
            </div>
            <div className="flex flex-col" style={{ gap: '1.1cqw' }}>
              <Lines ws={[100, 96, 100, 70]} h={1.1} c={TEXT} />
              <Bar w={40} h={1.6} c="bg-[#1f2328]/55" />
              <Lines ws={[100, 100, 88, 100, 52]} h={1.1} c={TEXT} />
            </div>
          </div>
        </Paper>
      );
    case 'poster':
      return (
        <Paper pad={0} gap={0}>
          <div className="flex flex-col items-center justify-center bg-[#2b4c7e]" style={{ height: '17%', gap: '1.2cqw' }}>
            <Bar w={64} h={2.4} c="bg-white/90" />
            <Bar w={36} h={1.2} c="bg-white/55" />
          </div>
          <div className="grid flex-1 grid-cols-3" style={{ gap: '1.6cqw', padding: '2.2cqw' }}>
            {[0, 1, 2].map((c) => (
              <div key={c} className="flex flex-col" style={{ gap: '1.6cqw' }}>
                {[0, 1].map((b) => (
                  <div key={b} className="flex flex-col overflow-hidden border border-[#2b4c7e]/25" style={{ borderRadius: '0.8cqw', flex: c === 1 && b === 0 ? 1.4 : 1 }}>
                    <div className="bg-[#2b4c7e]/75" style={{ height: '2.2cqw' }} />
                    <div className="flex flex-1 flex-col" style={{ gap: '0.9cqw', padding: '1.2cqw' }}>
                      {c === 1 && b === 0 ? (
                        <div className="flex flex-1 items-end" style={{ gap: '0.8cqw' }}>
                          {[40, 70, 55, 90].map((h, i) => (
                            <div key={i} className="flex-1 bg-[#eb811b]/80" style={{ height: `${h}%` }} />
                          ))}
                        </div>
                      ) : (
                        <Lines ws={[100, 84, 92, 60]} h={0.9} c={TEXT} />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Paper>
      );
    default:
      // The article: a title, an abstract, a section and an equation.
      return (
        <Paper gap={1.4}>
          <Bar w={64} h={3} c={INK} className="mx-auto" />
          <Bar w={34} h={1.4} c={SOFT} className="mx-auto" />
          <div className="mx-auto flex w-[82%] flex-col" style={{ gap: '1cqw', marginTop: '0.6cqw' }}>
            <Bar w={30} h={1.4} c="bg-[#1f2328]/50" className="mx-auto" />
            <Lines ws={[100, 100, 74]} h={1.1} c={TEXT} />
          </div>
          <Bar w={42} h={2} c="bg-[#1f2328]/60" style={{ marginTop: '0.8cqw' }} />
          <Lines ws={[100, 94, 100]} h={1.2} c={TEXT} />
          <div className="flex items-center justify-center font-serif text-[#1f2328]/75 italic" style={{ fontSize: '3.6cqw', lineHeight: 1.1 }}>
            e<sup style={{ fontSize: '2.4cqw' }}>iπ</sup>&nbsp;+ 1 = 0
          </div>
          <Lines ws={[100, 66]} h={1.2} c={TEXT} />
        </Paper>
      );
  }
}

// ---- a blank one of each other kind ---------------------------------------------------------

export function BlankArt({ kind }: { kind: 'doc' | 'sheet' | 'notebook' | 'diagram' }) {
  if (kind === 'doc')
    return (
      <Paper pad={6} gap={1.8}>
        <Bar w={56} h={3.2} c={INK} />
        <div className="bg-[#2a78d6]" style={{ width: '0.5cqw', height: '3.4cqw', marginTop: '0.6cqw' }} />
      </Paper>
    );
  if (kind === 'sheet') {
    const cols = ['A', 'B', 'C', 'D', 'E', 'F'];
    return (
      <div translate="no" aria-hidden className="@container absolute inset-0 overflow-hidden bg-panel">
        <div className="grid" style={{ gridTemplateColumns: `7cqw${' 1fr'.repeat(cols.length)}` }}>
          <div className="border-r border-b border-fg/12 bg-fg/[0.05]" style={{ height: '6.4cqw' }} />
          {cols.map((c) => (
            <div key={c} className="grid place-items-center border-r border-b border-fg/12 bg-fg/[0.05] text-fg-3" style={{ height: '6.4cqw', fontSize: '2.8cqw' }}>
              {c}
            </div>
          ))}
          {Array.from({ length: 10 }, (_, r) => [
            <div key={`n${r}`} className="grid place-items-center border-r border-b border-fg/12 bg-fg/[0.05] text-fg-3" style={{ height: '6.4cqw', fontSize: '2.6cqw' }}>
              {r + 1}
            </div>,
            ...cols.map((c) => (
              <div key={c + r} className={cx('border-r border-b border-fg/10', c === 'B' && r === 1 && 'relative z-10 outline-2 -outline-offset-1 outline-[#1baf7a]')} style={{ height: '6.4cqw' }} />
            )),
          ])}
        </div>
      </div>
    );
  }
  if (kind === 'notebook')
    return (
      <div translate="no" aria-hidden className="@container absolute inset-0 bg-panel">
        <div style={{ padding: '7cqw 8cqw' }}>
          <Bar w={52} h={4.4} c="bg-fg/75" />
          <div className="flex items-start" style={{ gap: '2.4cqw', marginTop: '5cqw' }}>
            <span className="font-mono text-fg-3" style={{ fontSize: '2.8cqw', lineHeight: '5cqw' }}>
              [ ]:
            </span>
            <div className="flex-1 border border-accent/50 bg-fg/[0.04]" style={{ height: '13cqw', padding: '2.6cqw', borderRadius: '1.6cqw' }}>
              <div className="bg-accent" style={{ width: '0.6cqw', height: '3.6cqw' }} />
            </div>
          </div>
          <div className="flex justify-center" style={{ gap: '2cqw', marginTop: '4cqw' }}>
            {[9, 8].map((w, i) => (
              <span key={i} className="flex items-center border border-fg/15" style={{ padding: '1.2cqw 2.2cqw', borderRadius: '9cqw', gap: '1cqw' }}>
                <Bar w="1.6cqw" h={1.6} c="bg-fg/30" />
                <Bar w={`${w}cqw`} h={1.4} c="bg-fg/20" />
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  return (
    <div translate="no" aria-hidden className="@container absolute inset-0 bg-panel">
      <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(var(--line-2) 0.9px, transparent 1.2px)', backgroundSize: '5cqw 5cqw', backgroundPosition: 'center' }} />
      <svg viewBox="0 0 160 90" preserveAspectRatio="xMidYMid meet" className="absolute inset-0 h-full w-full" fill="none" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
        <g className="stroke-fg/45">
          <rect x="60" y="8" width="40" height="15" rx="4" className="fill-panel" />
          <path d="M80 23v8" />
          <path d="M80 31l14 10-14 10-14-10z" className="fill-panel stroke-[#e34948]" />
          <path d="M66 41H38v20M94 41h28v20" />
          <rect x="18" y="61" width="40" height="15" rx="4" className="fill-panel" />
          <rect x="102" y="61" width="40" height="15" rx="4" className="fill-panel" />
          <path d="M35 57l3 4 3-4M119 57l3 4 3-4M77 28l3 3 3-3" />
        </g>
      </svg>
    </div>
  );
}
