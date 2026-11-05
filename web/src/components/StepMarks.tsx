// Where an agent's step acted, drawn over the step's picture in the conversation (the browser's page or the computer's
// screen after it): a ring where it clicked (two for a double click, dashed for a right click), the field it typed into
// outlined, a line along a drag, an arrow for a scroll, numbered when one step did several things. The marks follow the
// picture as it is laid out (fitted to its box, or at full size in the large view): places are fractions of its size.
import { useEffect, useLayoutEffect, useState, type RefObject } from 'react';
import { cleanMarks, type StepMark, type Way } from '@shared/pointer';
import { api } from '../lib/api';

const cache = new Map<string, StepMark[]>();

/** A step's marks (its picture's address and ".json", as the step routes answer), read once it is shown. */
export function useStepMarks(path: string | null, shown: boolean): StepMark[] {
  const [marks, setMarks] = useState<StepMark[]>(() => (path ? (cache.get(path) ?? []) : []));
  useEffect(() => {
    if (!path || !shown) return;
    const have = cache.get(path);
    if (have) return setMarks(have);
    let on = true;
    api<{ marks?: unknown }>(path)
      .then((r) => {
        const m = cleanMarks(r);
        cache.set(path, m);
        if (on) setMarks(m);
      })
      .catch(() => {});
    return () => {
      on = false;
    };
  }, [path, shown]);
  return marks;
}

const ARROWS: Record<Way, string> = { down: 'M-5 -2 L0 3 L5 -2', up: 'M-5 2 L0 -3 L5 2', left: 'M2 -5 L-3 0 L2 5', right: 'M-2 -5 L3 0 L-2 5' };

/** The marks over a picture: put this right after the <img>, in the same positioned box. */
export function StepMarks({ img, marks }: { img: RefObject<HTMLImageElement | null>; marks: StepMark[] }) {
  const [r, setR] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const el = img.current;
    if (!el || !marks.length) return;
    // The picture's own box inside the <img> (fitted with object-contain, it may leave bands around it).
    const measure = () => {
      const nw = el.naturalWidth;
      const nh = el.naturalHeight;
      if (!nw || !nh) return setR(null);
      const cs = getComputedStyle(el);
      const pl = parseFloat(cs.paddingLeft) || 0;
      const pt = parseFloat(cs.paddingTop) || 0;
      const cw = el.clientWidth - pl - (parseFloat(cs.paddingRight) || 0);
      const ch = el.clientHeight - pt - (parseFloat(cs.paddingBottom) || 0);
      let w = cw;
      let h = ch;
      if (cs.objectFit === 'contain' || cs.objectFit === 'scale-down') {
        const k = Math.min(cw / nw, ch / nh, cs.objectFit === 'scale-down' ? 1 : Infinity);
        w = nw * k;
        h = nh * k;
      }
      setR({ x: el.offsetLeft + el.clientLeft + pl + (cw - w) / 2, y: el.offsetTop + el.clientTop + pt + (ch - h) / 2, w, h });
    };
    measure();
    el.addEventListener('load', measure);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      el.removeEventListener('load', measure);
      ro.disconnect();
    };
  }, [img, marks.length]);
  if (!r || !marks.length) return null;
  // Rings a little larger on a large picture, never tiny on a small one.
  const k = Math.max(0.8, Math.min(1.5, r.w / 640));
  const many = marks.length > 1;
  return (
    <svg aria-hidden className="pointer-events-none absolute overflow-visible" style={{ left: r.x, top: r.y, width: r.w, height: r.h }} viewBox={`0 0 ${r.w} ${r.h}`}>
      {marks.map((m, i) => {
        const x = m.x * r.w;
        const y = m.y * r.h;
        const ring = (rad: number, dashed = false) => (
          <>
            <circle cx={x} cy={y} r={rad * k} fill="none" stroke="#fff" strokeOpacity={0.8} strokeWidth={4.5 * k} />
            <circle cx={x} cy={y} r={rad * k} fill="none" stroke="var(--accent)" strokeWidth={2.5 * k} strokeDasharray={dashed ? `${4 * k} ${3 * k}` : undefined} />
          </>
        );
        return (
          <g key={i}>
            {m.box && <rect x={m.box.x * r.w} y={m.box.y * r.h} width={m.box.w * r.w} height={m.box.h * r.h} rx={4 * k} fill="var(--accent)" fillOpacity={0.12} stroke="var(--accent)" strokeWidth={2 * k} strokeDasharray={`${5 * k} ${4 * k}`} />}
            {m.act === 'drag' && m.from && (
              <>
                <line x1={m.from.x * r.w} y1={m.from.y * r.h} x2={x} y2={y} stroke="#fff" strokeOpacity={0.8} strokeWidth={5 * k} strokeLinecap="round" />
                <line x1={m.from.x * r.w} y1={m.from.y * r.h} x2={x} y2={y} stroke="var(--accent)" strokeWidth={2.5 * k} strokeLinecap="round" strokeDasharray={`${6 * k} ${4 * k}`} />
                <circle cx={m.from.x * r.w} cy={m.from.y * r.h} r={4 * k} fill="var(--accent)" stroke="#fff" strokeWidth={1.5 * k} />
              </>
            )}
            {m.act === 'scroll' ? (
              <>
                <circle cx={x} cy={y} r={12 * k} fill="var(--accent)" stroke="#fff" strokeWidth={2 * k} />
                <path d={ARROWS[m.dir ?? 'down']} transform={`translate(${x} ${y}) scale(${k})`} fill="none" stroke="var(--accent-fg)" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
              </>
            ) : m.act === 'move' || m.act === 'up' ? (
              ring(7)
            ) : m.act === 'type' || m.act === 'select' || m.act === 'key' ? (
              <circle cx={x} cy={y} r={4 * k} fill="var(--accent)" stroke="#fff" strokeWidth={1.5 * k} />
            ) : (
              <>
                {(m.act === 'double' || m.act === 'triple') && ring(17)}
                {m.act === 'triple' && ring(23)}
                {ring(11, m.act === 'right')}
                <circle cx={x} cy={y} r={3.2 * k} fill="var(--accent)" stroke="#fff" strokeWidth={1.2 * k} />
              </>
            )}
            {many && (
              <>
                <circle cx={x + 15 * k} cy={y - 15 * k} r={8 * k} fill="var(--accent)" stroke="#fff" strokeWidth={1.5 * k} />
                <text x={x + 15 * k} y={y - 15 * k} dy="0.35em" textAnchor="middle" fontSize={10.5 * k} fontWeight={700} fill="var(--accent-fg)" fontFamily="inherit">
                  {i + 1}
                </text>
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}
