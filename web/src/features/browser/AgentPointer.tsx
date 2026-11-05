// The agent's pointer over the browser's live view, so you see where it points and what it does: a large arrow in the
// app's accent colour, with a soft halo and an "Agent" tag. It glides from where it was to where the agent acts (the
// server waits for it before the click lands), a ripple spreads from each click (two for a double click), the field it
// types into is outlined, a scroll shows its way and keys their names beside it. It rests where it last acted; the
// live view leaves it out while you drive, so yours is the only pointer then. Its size follows the view's.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { PointerBox, Way } from '@shared/pointer';
import { onPointer } from './store';

type Spot = { x: number; y: number };

/** The arrow, its tip at (2, 2): a white edge under a thin dark one, so it reads on light and dark pages alike. */
const ARROW = 'M2 2 L2 25.5 L8.2 19.6 L12.6 29 L16.6 27.2 L12.3 18 L20.6 18 Z';
const pct = (v: number) => `${(v * 100).toFixed(3)}%`;
const CHEVRON: Record<Way, string> = { down: 'M3 5 L9 11 L15 5', up: 'M3 11 L9 5 L15 11', left: 'M11 3 L5 9 L11 15', right: 'M5 3 L11 9 L5 15' };
const SHIFT: Record<Way, [number, number]> = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] };
const ACCENT = (n: number) => `color-mix(in srgb, var(--accent) ${n}%, transparent)`;

export function AgentPointer({ k, rest, small }: { k: string; rest?: Spot; small?: boolean }) {
  const box0 = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const ptr = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<Spot | null>(rest ?? null);
  const [glide, setGlide] = useState(0);
  const [box, setBox] = useState<PointerBox | null>(null);
  const [keys, setKeys] = useState<{ text: string; n: number } | null>(null);
  // Larger over a large view (full screen), smaller over the folded panel's thumbnail.
  const [scale, setScale] = useState(small ? 0.5 : 1);
  const where = useRef<Spot | null>(rest ?? null);
  const until = useRef(0);
  const timers = useRef(new Set<number>());
  const later = (fn: () => void, ms: number) => {
    const t = window.setTimeout(() => {
      timers.current.delete(t);
      fn();
    }, ms);
    timers.current.add(t);
  };
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  useLayoutEffect(() => {
    const el = box0.current;
    if (!el) return;
    const fit = () => setScale(small || el.clientWidth < 220 ? 0.5 : el.clientWidth < 440 ? 0.8 : el.clientWidth < 760 ? 1 : 1.3);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [small]);

  // Where it rests, as the server says (a view opened after the agent acted, or a reconnect), when nothing moves it.
  useEffect(() => {
    if (!rest || Date.now() < until.current) return;
    const w = where.current;
    if (w && Math.abs(w.x - rest.x) < 0.002 && Math.abs(w.y - rest.y) < 0.002) return;
    where.current = rest;
    setGlide(0);
    setAt(rest);
  }, [rest?.x, rest?.y]);

  const sizeRef = useRef(scale);
  sizeRef.current = scale;
  useEffect(() => {
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    /** A ripple spreading from a click (its edge dashed for a right click), drawn and gone without React. */
    const ripple = (p: Spot, dashed: boolean, delay = 0) => {
      const el = layer.current;
      if (!el) return;
      const s = sizeRef.current;
      const size = Math.round(76 * s);
      const r = document.createElement('div');
      r.style.cssText = `position:absolute;left:${pct(p.x)};top:${pct(p.y)};width:${size}px;height:${size}px;margin:${-size / 2}px 0 0 ${-size / 2}px;border-radius:50%;background:${ACCENT(30)};border:${Math.max(1.5, 3 * s)}px ${dashed ? 'dashed' : 'solid'} var(--accent);box-shadow:0 0 0 1px rgba(0,0,0,.28),inset 0 0 0 1px rgba(255,255,255,.5);opacity:0`;
      el.appendChild(r);
      const frames = still
        ? [{ opacity: 0.85 }, { opacity: 0 }]
        : [
            { transform: 'scale(.2)', opacity: 1 },
            { transform: 'scale(.7)', opacity: 0.85, offset: 0.4 },
            { transform: 'scale(1)', opacity: 0 },
          ];
      r.animate(frames, { duration: still ? 700 : 600, delay, easing: 'cubic-bezier(.2,.6,.35,1)' }).onfinish = () => r.remove();
    };
    /** A badge beside the pointer, its chevrons moving the way the page scrolls. */
    const scroll = (p: Spot, dir: Way) => {
      const el = layer.current;
      const s = sizeRef.current;
      if (!el || s < 0.8) return;
      const [dx, dy] = SHIFT[dir];
      const size = Math.round(40 * s);
      const c = document.createElement('div');
      // To the pointer's left, clear of the arrow and its tag.
      c.style.cssText = `position:absolute;left:${pct(p.x)};top:${pct(p.y)};width:${size}px;height:${size}px;margin:${-size / 2}px 0 0 ${-size / 2 - 34 * s}px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 2px rgba(255,255,255,.75),0 4px 14px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;flex-direction:${dy ? 'column' : 'row'};opacity:0`;
      c.innerHTML = [0, 1]
        .map(
          () =>
            `<svg width="${16 * s}" height="${16 * s}" viewBox="0 0 18 18" style="margin:${dy ? `${-4 * s}px 0` : `0 ${-4 * s}px`}"><path d="${CHEVRON[dir]}" fill="none" stroke="var(--accent-fg)" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
        )
        .join('');
      el.appendChild(c);
      const to = still ? 'translate(0,0)' : `translate(${dx * 14 * s}px,${dy * 14 * s}px)`;
      c.animate(
        [
          { opacity: 0, transform: 'translate(0,0)' },
          { opacity: 1, offset: 0.2 },
          { opacity: 1, offset: 0.6 },
          { opacity: 0, transform: to },
        ],
        { duration: 900, easing: 'ease-out' },
      ).onfinish = () => c.remove();
    };
    return onPointer(k, (p) => {
      const to = { x: p.x, y: p.y };
      const ms = still ? 0 : Math.min(1000, Math.max(0, p.glide ?? 0));
      // The first time, it comes in from the middle of the page: drawn there first (its style worked out), then it glides.
      if (!where.current && ms && p.act !== 'key') {
        flushSync(() => {
          setGlide(0);
          setAt({ x: 0.5, y: 0.5 });
        });
        ptr.current?.getBoundingClientRect();
      }
      // Keys are pressed where it rests (the middle, before it has pointed anywhere).
      if (p.act !== 'key' || !where.current) {
        where.current = to;
        until.current = Date.now() + ms + 400;
        setGlide(ms);
        setAt(to);
      }
      if (p.act !== 'type' && p.act !== 'select' && p.act !== 'key') setBox(null);
      later(() => {
        if (p.act === 'click' || p.act === 'right' || p.act === 'middle' || p.act === 'down') ripple(to, p.act === 'right');
        else if (p.act === 'double' || p.act === 'triple') for (let i = 0; i < (p.act === 'double' ? 2 : 3); i++) ripple(to, false, i * 160);
        else if (p.act === 'select') {
          ripple(to, false);
          if (p.box) setBox(p.box);
        } else if (p.act === 'type' && p.box) setBox(p.box);
        else if (p.act === 'scroll' && p.dir) scroll(to, p.dir);
        else if (p.act === 'key' && p.keys) setKeys((s) => ({ text: p.keys!, n: (s?.n ?? 0) + 1 }));
        if (p.act === 'type' || p.act === 'select') later(() => setBox((b) => (b === p.box ? null : b)), 1800);
      }, ms + 16);
    });
  }, [k]);

  // A key's name shows a moment, then goes.
  useEffect(() => {
    if (!keys) return;
    const t = window.setTimeout(() => setKeys(null), 1500);
    return () => window.clearTimeout(t);
  }, [keys]);

  const s = scale;
  const flipX = (at?.x ?? 0) > 0.8;
  const flipY = (at?.y ?? 0) > 0.86;
  return (
    <div ref={box0} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {box && <div className="absolute rounded-[5px] border-2 border-accent" style={{ left: pct(box.x), top: pct(box.y), width: pct(box.w), height: pct(box.h), boxShadow: `0 0 0 3px ${ACCENT(28)}, 0 0 16px ${ACCENT(45)}` }} />}
      <div ref={layer} className="absolute inset-0" />
      {at && (
        <div ref={ptr} className="absolute h-0 w-0" style={{ left: pct(at.x), top: pct(at.y), transition: glide ? `left ${glide}ms cubic-bezier(.45,0,.25,1), top ${glide}ms cubic-bezier(.45,0,.25,1)` : 'none' }}>
          <div className="absolute rounded-full" style={{ width: 58 * s, height: 58 * s, left: -29 * s, top: -29 * s, background: `radial-gradient(circle, ${ACCENT(55)} 0%, ${ACCENT(22)} 42%, transparent 70%)` }} />
          <svg width={23 * s} height={31 * s} viewBox="0 0 23 31" className="absolute" style={{ left: -2 * s, top: -2 * s, filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.45))' }}>
            <path d={ARROW} fill="none" stroke="#fff" strokeWidth={3.4} strokeLinejoin="round" />
            <path d={ARROW} fill="var(--accent)" stroke="rgba(0,0,0,.55)" strokeWidth={1} strokeLinejoin="round" />
          </svg>
          {s >= 0.8 && (
            <div className="absolute flex items-center gap-1 whitespace-nowrap" style={{ ...(flipX ? { right: 10 * s } : { left: 17 * s }), top: flipY ? -30 : 26 * s }}>
              <span className="rounded-md bg-accent px-1.5 py-px text-[11px] leading-[16px] font-semibold text-accent-fg shadow-[0_1px_4px_rgba(0,0,0,.3)]">Agent</span>
              {keys && (
                <kbd key={keys.n} translate="no" className="rounded-md border border-white/25 bg-black/80 px-1.5 py-px font-mono text-[11px] leading-[16px] text-white shadow-[0_1px_4px_rgba(0,0,0,.3)]">
                  {keys.text}
                </kbd>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
