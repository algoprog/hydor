// Where it stands, drawn: every score of an evaluation as a point over time, the best so far as a stepped line, the
// baseline dashed, failed scores as small red marks at the bottom. On a wide chart each step of the best line is named by
// what was measured; on a narrow one only the best now is. It shares EvalChart's axis, dates and measuring; a tap on a
// point shows that score on the evaluation's page.
import { useMemo } from 'react';
import { tr } from '../../i18n/runtime';
import { num } from '../experiments/api';
import { clock, day, ticks, useWidth } from '../experiments/EvalChart';
import { placeLabels, type ChartModel } from './words';

const AXIS_W = 46;
const PAD = { top: 12, right: 14, bottom: 24 };
/** Narrower than this the steps are not named, but the best now. */
const NAMES_FROM = 520;
/** About as wide as one character of the 11 px labels. */
const CHAR = 5.6;

const when = (t: number) => `${day(t)} ${clock(t)}`;

export function ResearchChart({ model, label, onPick }: { model: ChartModel; label: string; onPick: (score: string) => void }) {
  const { box, width } = useWidth();
  const wide = width >= NAMES_FROM;
  const height = wide ? 196 : 176;
  const g = useMemo(() => {
    const plotW = Math.max(0, width - AXIS_W - PAD.right);
    const plotH = height - PAD.top - PAD.bottom;
    const x = (t: number) => AXIS_W + ((t - model.t0) / (model.t1 - model.t0)) * plotW;
    const y = (v: number) => PAD.top + plotH - ((v - model.lo) / (model.hi - model.lo)) * plotH;
    return { plotW, plotH, x, y };
  }, [width, height, model]);
  const { x, y } = g;
  const right = width - PAD.right;
  const steps = model.points.filter((p) => p.step);
  const current = steps[steps.length - 1];
  const sameDay = day(model.from) === day(model.to);
  const edge = sameDay ? clock : day;

  // Names for the steps. Wide: each step that has room for its name (placeLabels); narrow: the best now, cut to fit.
  let named: { id: string; x: number; y: number; text: string; end: boolean }[] = [];
  if (width > 0 && wide) {
    const line = model.line.map((v) => ({ x: x(v.t), y: y(v.v) }));
    named = placeLabels(steps.map((p) => ({ id: p.id, label: p.label, x: x(p.at), y: y(p.mean) })), line, AXIS_W, right, CHAR);
  } else if (width > 0 && current) {
    let text = `${num(current.mean)}${current.label ? ` · ${current.label}` : ''}`;
    const px = x(current.at);
    const roomR = right - (px + 6);
    const roomL = px - 6 - AXIS_W;
    const end = text.length * CHAR + 8 > roomR && roomL > roomR;
    const room = end ? roomL : roomR;
    if (text.length * CHAR + 8 > room) {
      const chars = Math.floor((room - 8) / CHAR);
      text = chars < 6 ? num(current.mean) : `${text.slice(0, chars - 1).trimEnd()}…`;
    }
    named = [{ id: current.id, x: end ? px - 6 : px + 6, y: y(current.mean) - 9, text, end }];
  }

  return (
    <div ref={box} translate="no" style={{ minHeight: height + 6 }} className="mt-2">
      {width > 0 && (
        <svg width="100%" height={height} role="img" aria-label={tr(label)}>
          {ticks(model.lo, model.hi).map((t) => (
            <g key={t}>
              <line x1={AXIS_W} x2={right} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} />
              <text x={AXIS_W - 6} y={y(t) + 3.5} textAnchor="end" className="tnum fill-[var(--fg-3)] text-[10px]">
                {num(t)}
              </text>
            </g>
          ))}
          {model.baseline !== undefined && <line x1={AXIS_W} x2={right} y1={y(model.baseline)} y2={y(model.baseline)} stroke="var(--fg-3)" strokeWidth={1.5} strokeDasharray="5 4" />}
          {model.line.length > 1 && <polyline fill="none" stroke="var(--ok)" strokeWidth={2} strokeLinejoin="round" points={model.line.map((v) => `${x(v.t)},${y(v.v)}`).join(' ')} />}
          {model.failed.map((t) => (
            <line key={t} x1={x(t)} x2={x(t)} y1={height - PAD.bottom - 11} y2={height - PAD.bottom - 1} stroke="var(--err)" strokeWidth={2}>
              <title>{tr(`${when(t)}: failed`)}</title>
            </line>
          ))}
          {model.points.map((p) => (
            <g key={p.id} role="button" tabIndex={0} aria-label={`${when(p.at)}: ${num(p.mean)}`} className="cursor-pointer" onClick={() => onPick(p.id)} onKeyDown={(e) => e.key === 'Enter' && onPick(p.id)}>
              <title>{`${when(p.at)}: ${num(p.mean)}${p.label ? ` · ${p.label}` : ''}`}</title>
              <rect x={x(p.at) - 11} y={PAD.top} width={22} height={g.plotH} fill="transparent" />
              <circle cx={x(p.at)} cy={y(p.mean)} r={p.step ? 4.5 : 3.5} fill="var(--viz-1)" stroke="var(--panel)" strokeWidth={p.step ? 2 : 1.5} />
            </g>
          ))}
          {named.map((n) => (
            <text key={n.id} x={n.x} y={n.y} textAnchor={n.end ? 'end' : 'start'} className="fill-[var(--fg-3)] text-[11px]" style={{ paintOrder: 'stroke', stroke: 'var(--panel)', strokeWidth: 3 }}>
              {n.text}
            </text>
          ))}
          <text x={AXIS_W} y={height - 6} textAnchor="start" className="tnum fill-[var(--fg-3)] text-[10px]">
            {edge(model.from)}
          </text>
          {edge(model.to) !== edge(model.from) && (
            <text x={right} y={height - 6} textAnchor="end" className="tnum fill-[var(--fg-3)] text-[10px]">
              {edge(model.to)}
            </text>
          )}
        </svg>
      )}
    </div>
  );
}

/** What the marks mean: a score, the best so far, the baseline with its number, and failed scores when there are some. */
export function ChartLegend({ model }: { model: ChartModel }) {
  return (
    <div className="mt-0.5 flex flex-wrap gap-x-3.5 gap-y-1 text-[12px] text-fg-3">
      <span className="inline-flex items-center gap-1.5">
        <i aria-hidden className="inline-block h-2 w-2 rounded-full bg-[var(--viz-1)]" />
        <span>a score</span>
      </span>
      <span className="inline-flex items-center gap-1.5">
        <i aria-hidden className="inline-block h-0.5 w-4 bg-ok" />
        <span>best so far</span>
      </span>
      {model.baseline !== undefined && (
        <span className="inline-flex items-center gap-1.5">
          <i aria-hidden className="inline-block w-4 border-t-2 border-dashed border-fg-3" />
          <span>{`baseline ${num(model.baseline)}`}</span>
        </span>
      )}
      {model.failed.length > 0 && (
        <span className="inline-flex items-center gap-1.5">
          <i aria-hidden className="inline-block h-2.5 w-0.5 bg-err" />
          <span>failed</span>
        </span>
      )}
    </div>
  );
}
