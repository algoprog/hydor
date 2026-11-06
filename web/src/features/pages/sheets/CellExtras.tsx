// What the grid draws in a cell besides its words: a sparkline (SPARKLINE: a line, columns, a bar, or wins and losses),
// a picture (IMAGE, through the app's server, which fetches it: the app's own pages load nothing from the web), the
// mark of an AI cell and what one without its answer shows, and the card of a cell's link (HYPERLINK, Insert → Link).
import { ExternalLink, Link2, Sparkles } from 'lucide-react';
import type { CellSpecial } from '@shared/sheets';
import { cx } from '../../../components/ui';
import type { AiState } from './ai';

/** A sparkline, `w` × `h` px, in the cell's colours (its own colour when the options say). */
export function Sparkline({ spec, w, h }: { spec: Extract<CellSpecial, { kind: 'spark' }>; w: number; h: number }) {
  const vals = spec.values;
  const nums = vals.filter((v): v is number => v !== null);
  if (!nums.length || w < 6 || h < 4) return null;
  const pad = 2;
  const color = spec.color ?? 'var(--accent)';
  const neg = spec.neg ?? '#d93025';
  if (spec.type === 'bar') {
    // One bar: the first value's share of the most (or of the total of the values).
    const max = spec.max ?? Math.max(...nums.map(Math.abs), 1);
    const share = Math.max(0, Math.min(1, (nums[0] ?? 0) / (max || 1)));
    return (
      <svg width={w} height={h} aria-hidden className="block">
        <rect x={pad} y={h * 0.2} width={Math.max(0, (w - pad * 2) * share)} height={h * 0.6} rx={1.5} fill={color} />
      </svg>
    );
  }
  const lo = spec.min ?? Math.min(0, ...nums);
  const hi = spec.max ?? Math.max(...nums);
  const span = hi - lo || 1;
  const n = vals.length;
  const y = (v: number) => pad + (h - pad * 2) * (1 - (v - lo) / span);
  if (spec.type === 'column' || spec.type === 'winloss') {
    const bw = (w - pad * 2) / n;
    return (
      <svg width={w} height={h} aria-hidden className="block">
        {vals.map((v, i) => {
          if (v === null) return null;
          if (spec.type === 'winloss') return <rect key={i} x={pad + i * bw + bw * 0.15} y={v >= 0 ? h * 0.12 : h * 0.52} width={bw * 0.7} height={h * 0.36} fill={v >= 0 ? color : neg} />;
          const zero = y(Math.max(lo, Math.min(hi, 0)));
          const top = Math.min(zero, y(v));
          return <rect key={i} x={pad + i * bw + bw * 0.12} y={top} width={bw * 0.76} height={Math.max(1, Math.abs(y(v) - zero))} fill={v < 0 ? neg : color} />;
        })}
      </svg>
    );
  }
  const step = n > 1 ? (w - pad * 2) / (n - 1) : 0;
  let d = '';
  let pen = false;
  vals.forEach((v, i) => {
    if (v === null) return void (pen = false);
    d += `${pen ? 'L' : 'M'}${(pad + i * step).toFixed(1)},${y(v).toFixed(1)}`;
    pen = true;
  });
  return (
    <svg width={w} height={h} aria-hidden className="block">
      <path d={d} fill="none" stroke={color} strokeWidth={spec.width ?? 1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** A picture in a cell: fetched by the app's server (a data: picture as it is), fitted as IMAGE says. */
export function CellImage({ spec }: { spec: Extract<CellSpecial, { kind: 'image' }> }) {
  const src = spec.url.startsWith('data:') ? spec.url : `/api/pages/picture?url=${encodeURIComponent(spec.url)}`;
  const fit = spec.fit === 'fill' ? 'fill' : spec.fit === 'none' ? 'none' : 'contain';
  const size = spec.fit === 'size' ? { width: spec.w ?? undefined, height: spec.h ?? undefined } : { width: '100%', height: '100%' };
  return <img src={src} alt={spec.alt} draggable={false} loading="lazy" referrerPolicy="no-referrer" className="pointer-events-none block" style={{ ...size, objectFit: fit, objectPosition: 'center' }} />;
}

/** An AI cell's mark: a small sparkle in its corner. */
export const AiMark = ({ z }: { z: number }) => <Sparkles aria-hidden size={Math.round(9 * Math.max(0.8, z))} className="pointer-events-none absolute right-[2px] bottom-[2px] text-accent opacity-70" />;

/** What an AI cell without its answer shows in place of #BUSY!. */
export function aiLabel(s: AiState): { text: string; cls: string; title?: string } {
  if (s.state === 'asking') return { text: 'Asking AI…', cls: 'text-fg-3 italic' };
  if (s.state === 'failed') return { text: 'No answer', cls: 'text-err', title: s.why };
  return { text: 'Not asked yet', cls: 'text-fg-3 italic', title: 'Ask now (at the foot of the sheet) asks the helper model for it' };
}

/** The card under a cell with a link: where it goes, and Open (or Go there, for a place in the workbook). */
export function LinkCard({ url, left, top, onOpen }: { url: string; left: number; top: number; onOpen: (url: string) => void }) {
  const inside = url.startsWith('#');
  return (
    <div data-own className="absolute z-40 flex max-w-[320px] items-center gap-2 rounded-lg border border-line bg-elevated py-1 pr-1 pl-2.5 text-[12.5px] shadow-lg" style={{ left, top }} onPointerDown={(e) => e.stopPropagation()}>
      <Link2 size={13} className="shrink-0 text-fg-3" />
      <span translate="no" className="min-w-0 truncate text-fg-2">
        {inside ? url.slice(1) : url.replace(/^https?:\/\//, '')}
      </span>
      <button type="button" onClick={() => onOpen(url)} className={cx('flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 font-medium text-accent hover:bg-bg-2')}>
        {inside ? 'Go there' : 'Open'}
        {!inside && <ExternalLink size={12} />}
      </button>
    </div>
  );
}
