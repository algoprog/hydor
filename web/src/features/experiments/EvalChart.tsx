// An evaluation's scores over time: each score's mean as a dot with its spread (± one standard deviation) as a bar,
// oldest first and evenly spaced, the baseline's mean as a dashed line. A tap on a dot shows that score in the list.
import { useLayoutEffect, useRef, useState } from 'react';
import type { EvalScore } from '@shared/evaluations';
import { LOCALE } from '../../i18n/locale';
import { num } from './api';
import { meanStd } from './evalWords';

const HEIGHT = 168;
const AXIS_W = 48;
const PAD = { top: 10, right: 12, bottom: 20 };

export const day = (t: number) => new Date(t).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' });
export const clock = (t: number) => new Date(t).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });

/** The width of an element, kept up to date as it changes (0 until it is measured): what a chart draws itself to. */
export function useWidth() {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { box, width };
}

/** Round numbers for the axis, about three of them inside lo…hi. */
export function ticks(lo: number, hi: number): number[] {
  const raw = (hi - lo) / 3;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9 && out.length < 8; v += step) out.push(Number(v.toPrecision(12)));
  return out;
}

export function ScoreChart({ scores, baseline, onPick }: { scores: EvalScore[]; baseline?: number; onPick: (id: string) => void }) {
  const { box, width } = useWidth();

  const ends = scores.flatMap((s) => [s.mean! - (s.std ?? 0), s.mean! + (s.std ?? 0)]);
  if (baseline !== undefined) ends.push(baseline);
  let lo = Math.min(...ends);
  let hi = Math.max(...ends);
  const room = (hi - lo || Math.abs(hi) || 1) * 0.12;
  lo -= room;
  hi += room;
  const plotW = Math.max(0, width - AXIS_W - PAD.right);
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const y = (v: number) => PAD.top + plotH - ((v - lo) / (hi - lo)) * plotH;
  const gap = plotW / Math.max(1, scores.length);
  const x = (i: number) => AXIS_W + gap * (i + 0.5);
  const first = scores[0].createdAt;
  const last = scores[scores.length - 1].createdAt;
  const label = day(first) === day(last) ? clock : day;

  // Its height is there before its width is measured, so a scroll to a score below it lands where it should.
  return (
    <div style={{ minHeight: HEIGHT + 14 }} className="rounded-xl border border-line bg-panel px-2 pt-2 pb-1">
      {/* Measured without the panel's padding: the drawing is this wide, no wider. */}
      <div ref={box}>
      {width > 0 && (
        <svg width="100%" height={HEIGHT} role="group" aria-label="Scores over time">
          {ticks(lo, hi).map((t) => (
            <g key={t}>
              <line x1={AXIS_W} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} />
              <text x={AXIS_W - 6} y={y(t) + 3.5} textAnchor="end" className="tnum fill-[var(--fg-3)] text-[10px]">
                {num(t)}
              </text>
            </g>
          ))}
          {baseline !== undefined && (
            <g>
              <line x1={AXIS_W} x2={width - PAD.right} y1={y(baseline)} y2={y(baseline)} stroke="var(--fg-3)" strokeWidth={1.5} strokeDasharray="5 4" />
            </g>
          )}
          {scores.map((s, i) => {
            const sd = s.std ?? 0;
            return (
              <g key={s.id} role="button" tabIndex={0} aria-label={`${day(s.createdAt)} ${clock(s.createdAt)}: ${meanStd(s)}`} className="cursor-pointer" onClick={() => onPick(s.id)} onKeyDown={(e) => e.key === 'Enter' && onPick(s.id)}>
                <title>{`${day(s.createdAt)} ${clock(s.createdAt)}: ${meanStd(s)}`}</title>
                {/* A wider place to tap than the dot. */}
                <rect x={x(i) - Math.min(gap, 44) / 2} y={PAD.top} width={Math.min(gap, 44)} height={plotH} fill="transparent" />
                {sd > 0 && (
                  <g stroke="var(--viz-1)" strokeWidth={2}>
                    <line x1={x(i)} x2={x(i)} y1={y(s.mean! - sd)} y2={y(s.mean! + sd)} />
                    <line x1={x(i) - 4} x2={x(i) + 4} y1={y(s.mean! - sd)} y2={y(s.mean! - sd)} />
                    <line x1={x(i) - 4} x2={x(i) + 4} y1={y(s.mean! + sd)} y2={y(s.mean! + sd)} />
                  </g>
                )}
                <circle cx={x(i)} cy={y(s.mean!)} r={4.5} fill="var(--viz-1)" stroke="var(--panel)" strokeWidth={2} />
              </g>
            );
          })}
          <text x={x(0)} y={HEIGHT - 5} textAnchor="middle" className="tnum fill-[var(--fg-3)] text-[10px]">
            {label(first)}
          </text>
          {/* What the dashed line is, in the row of dates: on the line itself a score could be drawn over it. */}
          {baseline !== undefined && (
            <g>
              <line x1={AXIS_W + plotW / 2 - 34} x2={AXIS_W + plotW / 2 - 18} y1={HEIGHT - 8.5} y2={HEIGHT - 8.5} stroke="var(--fg-3)" strokeWidth={1.5} strokeDasharray="5 4" />
              <text x={AXIS_W + plotW / 2 - 13} y={HEIGHT - 5} className="fill-[var(--fg-3)] text-[10px]">
                Baseline
              </text>
            </g>
          )}
          {/* Two scores of the same minute need its time once. */}
          {scores.length > 1 && label(last) !== label(first) && (
            <text x={Math.min(width - 1, x(scores.length - 1) + 16)} y={HEIGHT - 5} textAnchor="end" className="tnum fill-[var(--fg-3)] text-[10px]">
              {label(last)}
            </text>
          )}
        </svg>
      )}
      </div>
    </div>
  );
}
