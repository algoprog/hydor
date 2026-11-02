// Before and after screenshots an agent took of a web app it changed (ui_screenshot), for the user to
// review: a before (or a plain look) shows as pictures; an after shows beside its before, with a slider
// to sweep between them or both side by side, on a computer's screen or a phone's. "Looks good" and
// "Change something" put a line in the message box. While pages show beside the conversation (wide
// screens), the review opens there.
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { ArrowLeftRight, Columns2, Image as ImageIcon, Maximize2, Monitor, PanelRight, Smartphone, X } from 'lucide-react';
import type { UiShot } from '@shared/shots';
import type { ToolItem } from '@shared/types';
import { api, enc } from '../../lib/api';
import { composeInsert } from '../../lib/featureEvents';
import { openLightbox } from '../../components/Lightbox';
import { tr } from '../../i18n/runtime';
import { Button, cx, IconButton, Segmented, Throbber, useMediaQuery } from '../../components/ui';
import { CANVAS_MEDIA, onScreen, useCanvas } from '../pages/state';

const src = (s: UiShot) => `/api/shots/${enc(s.id)}`;

/** The shots a call took, from what it answered: "(shot <id>, <id>)". */
export const shotIds = (output?: string): string[] => /\(shot ([a-f0-9, ]+)\)/.exec(output ?? '')?.[1].split(/,\s*/).filter((x) => /^[a-f0-9]{12}$/.test(x)) ?? [];

interface Pair {
  shot: UiShot;
  before: UiShot | null;
}

/** Each of a call's shots with the before one it answers; refreshed when the session takes more. */
function usePairs(ids: string[]): { pairs: Pair[] | null; error: string | null } {
  const [pairs, setPairs] = useState<Pair[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = ids.join(',');
  useEffect(() => {
    if (!ids.length) return;
    let alive = true;
    Promise.all(ids.map((id) => api<Pair>(`/api/shots/${enc(id)}/pair`)))
      .then((r) => alive && setPairs(r))
      .catch((e) => alive && setError((e as Error).message));
    return () => {
      alive = false;
    };
  }, [key]);
  return { pairs, error };
}

/** The after picture over the before one, cut where the handle is: drag it (or click) to sweep. */
function Slider({ before, after }: { before: UiShot; after: UiShot }) {
  const [at, setAt] = useState(50);
  const box = useRef<HTMLDivElement>(null);
  const set = (x: number) => {
    const r = box.current?.getBoundingClientRect();
    if (r) setAt(Math.max(0, Math.min(100, ((x - r.left) / r.width) * 100)));
  };
  const start = (e: ReactPointerEvent) => {
    e.preventDefault();
    set(e.clientX);
    const move = (ev: PointerEvent) => set(ev.clientX);
    const up = () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
  };
  const ratio = Math.max(before.height / before.width, after.height / after.width);
  return (
    <div
      ref={box}
      onPointerDown={start}
      onKeyDown={(e) => (e.key === 'ArrowLeft' ? setAt((a) => Math.max(0, a - 5)) : e.key === 'ArrowRight' ? setAt((a) => Math.min(100, a + 5)) : undefined)}
      tabIndex={0}
      role="slider"
      aria-label="Before and after"
      aria-valuenow={Math.round(at)}
      className="relative w-full cursor-ew-resize touch-none overflow-hidden bg-bg-2 select-none"
      style={{ aspectRatio: `1 / ${ratio}` }}
    >
      <img src={src(after)} alt="After" draggable={false} className="absolute inset-x-0 top-0 w-full" />
      <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 ${100 - at}% 0 0)` }}>
        <img src={src(before)} alt="Before" draggable={false} className="absolute inset-x-0 top-0 w-full" />
      </div>
      <div className="pointer-events-none absolute inset-y-0" style={{ left: `${at}%` }}>
        <div className="absolute inset-y-0 -left-px w-0.5 bg-white shadow-[0_0_0_1px_rgba(0,0,0,.25)]" />
        <div className="absolute top-1/2 left-0 grid h-8 w-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-[#1d1b17] shadow-md">
          <ArrowLeftRight size={15} />
        </div>
      </div>
      <span className="pointer-events-none absolute top-2 left-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] font-medium text-white">Before</span>
      <span className="pointer-events-none absolute top-2 right-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] font-medium text-white">After</span>
    </div>
  );
}

function Picture({ shot, tag, onOpen }: { shot: UiShot; tag?: string; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="relative block w-full overflow-hidden bg-bg-2 text-left" title="See it large">
      <img src={src(shot)} alt={tag ?? shot.label} translate={tag ? undefined : 'no'} loading="lazy" className="block w-full" />
      {tag && <span className="pointer-events-none absolute top-2 left-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] font-medium text-white">{tag}</span>}
    </button>
  );
}

/** One screen's review: its before and after (or the one picture), on the size picked. */
export function Compare({ pairs, sessionKey, big }: { pairs: Pair[]; sessionKey?: string; big?: boolean }) {
  const sizes = [...new Set(pairs.map((p) => p.shot.viewport))];
  const [size, setSize] = useState(sizes[0]);
  const [how, setHow] = useState<'slider' | 'side'>('slider');
  const p = pairs.find((x) => x.shot.viewport === size) ?? pairs[0];
  const after = p.shot.phase === 'after' ? p.shot : null;
  const before = after ? p.before : null;
  const open = (i: number) => openLightbox((before && after ? [before, after] : [p.shot]).map((s, n) => ({ src: src(s), name: before && after ? (n === 0 ? 'Before' : 'After') : s.label })), i);
  const say = (text: string) => composeInsert(text, sessionKey);
  const phone = size === 'phone';
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        {sizes.length > 1 && (
          <Segmented
            size="sm"
            value={size}
            onChange={setSize}
            options={sizes.map((v) => ({ value: v, label: v === 'phone' ? <Smartphone size={14} aria-label="Phone" /> : <Monitor size={14} aria-label="Computer" /> }))}
          />
        )}
        {before && after && (
          <Segmented
            size="sm"
            value={how}
            onChange={setHow}
            options={[
              { value: 'slider', label: <ArrowLeftRight size={14} aria-label="Slider" /> },
              { value: 'side', label: <Columns2 size={14} aria-label="Side by side" /> },
            ]}
          />
        )}
        <span translate="no" className="min-w-0 flex-1 truncate text-right text-[11.5px] text-fg-3" title={p.shot.url}>
          {p.shot.url.replace(/^file:\/\//, '').replace(/^https?:\/\//, '')}
        </span>
        <IconButton label="See them large" size="sm" onClick={() => open(0)}>
          <Maximize2 size={14} />
        </IconButton>
      </div>
      <div className={cx('border-t border-line', phone && 'flex justify-center bg-bg-1 py-3')}>
        <div className={cx(phone ? (how === 'side' && before ? 'w-full max-w-[560px]' : 'w-full max-w-[300px]') : 'w-full', big ? '' : 'max-h-[70vh] overflow-y-auto')}>
          {before && after ? (
            how === 'slider' ? (
              <Slider before={before} after={after} />
            ) : (
              <div className="grid grid-cols-2 gap-px bg-line">
                <Picture shot={before} tag="Before" onOpen={() => open(0)} />
                <Picture shot={after} tag="After" onOpen={() => open(1)} />
              </div>
            )
          ) : (
            <Picture shot={p.shot} tag={after ? 'After' : p.shot.phase === 'before' ? 'Before' : undefined} onOpen={() => open(0)} />
          )}
        </div>
      </div>
      {after && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-2">
          {!before && <span className="text-[12px] text-fg-3">No before picture to compare with.</span>}
          <span className="flex-1" />
          <Button size="sm" variant="ghost" onClick={() => say(`${tr(`About “${p.shot.label}”:`)} `)}>
            Change something
          </Button>
          <Button size="sm" variant="secondary" onClick={() => say(tr(`“${p.shot.label}” looks good.`))}>
            Looks good
          </Button>
        </div>
      )}
    </div>
  );
}

const PHASE: Record<UiShot['phase'], string> = { before: 'Before', after: 'Before and after', check: 'Screenshot' };

export function ShotCard({ item, sessionKey }: { item: ToolItem; sessionKey: string }) {
  const input = (item.tool.input ?? {}) as { label?: string; phase?: UiShot['phase'] };
  const ids = useMemo(() => shotIds(item.tool.output), [item.tool.output]);
  const { pairs, error } = usePairs(ids);
  const phase: UiShot['phase'] = input.phase === 'before' || input.phase === 'after' ? input.phase : 'check';
  const label = input.label?.trim() || 'The page';
  const wide = useMediaQuery(CANVAS_MEDIA);
  const besideOpen = useCanvas((x) => !!x.open[sessionKey]);
  const here = useCanvas((x) => {
    const t = x.open[sessionKey];
    return t?.kind === 'review' && t.id === item.id;
  });
  // An after one that just came opens beside the conversation, as pages do.
  useEffect(() => {
    if (phase !== 'after' || !item.ts || Date.now() - item.ts > 20_000) return;
    const c = useCanvas.getState();
    if (c.auto && !c.open[sessionKey] && matchMedia(CANVAS_MEDIA).matches && onScreen(sessionKey)) c.show(sessionKey, { kind: 'review', id: item.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.length]);

  if (item.tool.status === 'error') return <div className="tl-item my-1 px-1 text-[12.5px] text-fg-3">Could not take the screenshot: {(item.tool.output ?? item.tool.error ?? '').slice(0, 300)}</div>;
  if (!ids.length)
    return (
      <div className="tl-item my-1 flex items-center gap-2 px-1 text-[12.5px] text-fg-3">
        <Throbber /> Taking a screenshot of “{label}”…
      </div>
    );
  if (wide && besideOpen && phase === 'after')
    return (
      <button
        type="button"
        onClick={() => useCanvas.getState().show(sessionKey, { kind: 'review', id: item.id })}
        className={cx('tl-item my-1 flex w-full items-center gap-3 rounded-xl border bg-panel py-2 pr-3 pl-2.5 text-left transition-colors', here ? 'border-accent/50 shadow-[0_0_0_3px_var(--accent-soft)]' : 'border-line hover:border-line-2')}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-accent-soft text-accent">
          <ArrowLeftRight size={17} />
        </span>
        <span className="min-w-0 flex-1">
          <span translate="no" className="block truncate text-[13.5px] leading-5 font-medium text-fg">
            {label}
          </span>
          <span className="block truncate text-[12px] leading-4 text-fg-3">Before and after, to review</span>
        </span>
        <span className={cx('flex shrink-0 items-center gap-1 text-[12px] font-medium', here ? 'text-accent' : 'text-fg-3')}>
          <PanelRight size={14} />
          {here ? 'Beside' : 'Open'}
        </span>
      </button>
    );
  return (
    <div className={cx('tl-item my-1.5 overflow-hidden rounded-xl border bg-panel', phase === 'after' ? 'border-line-2' : 'border-line', phase === 'before' && 'max-w-[26rem]')}>
      <div className="flex items-center gap-2 border-b border-line px-3 py-1.5">
        {phase === 'after' ? <ArrowLeftRight size={14} className="shrink-0 text-accent" /> : <ImageIcon size={14} className="shrink-0 text-fg-3" />}
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-fg-2">
          {PHASE[phase]} · <span translate="no">{label}</span>
        </span>
      </div>
      {error ? <div className="px-3 py-2.5 text-[12.5px] text-fg-3">{error}</div> : !pairs ? <div className="flex justify-center py-6 text-fg-3"><Throbber /></div> : <Compare pairs={pairs} sessionKey={sessionKey} />}
    </div>
  );
}

/** The review beside the conversation (the panel's own view of an after call). */
export function ReviewPane({ sessionKey, item, onClose }: { sessionKey: string; item: ToolItem | undefined; onClose: () => void }) {
  const ids = useMemo(() => shotIds(item?.tool.output), [item?.tool.output]);
  const { pairs, error } = usePairs(ids);
  const label = ((item?.tool.input ?? {}) as { label?: string }).label?.trim() || 'The page';
  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      <div className="flex min-h-12 shrink-0 items-center gap-2 border-b border-line px-2 py-1.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
          <ArrowLeftRight size={16} />
        </span>
        <span className="min-w-0 flex-1">
          <span translate="no" className="block truncate text-[13.5px] font-medium text-fg">
            {label}
          </span>
          <span className="block truncate text-[11.5px] text-fg-3">Before and after, to review</span>
        </span>
        <IconButton label="Close" size="sm" onClick={onClose}>
          <X size={15} />
        </IconButton>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!item ? (
          <p className="px-4 py-6 text-[13px] text-fg-3">This review is no longer in the conversation.</p>
        ) : error ? (
          <p className="px-4 py-6 text-[13px] text-fg-3">{error}</p>
        ) : !pairs ? (
          <div className="flex justify-center py-10 text-fg-3">
            <Throbber size={24} />
          </div>
        ) : (
          <Compare pairs={pairs} sessionKey={sessionKey} big />
        )}
      </div>
    </div>
  );
}
