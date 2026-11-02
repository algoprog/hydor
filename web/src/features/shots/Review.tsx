// Before and after screenshots an agent took of a web app it changed (ui_screenshot), for the user to
// review. The screenshots of one reply show together, as one card of small pictures: a screen's before,
// its after (with its before, to compare), or a plain look. A picture opens the review: beside the
// conversation where there is room (as pages do), else over the app. There, an after shows over its before
// with a slider to sweep between them, or both side by side, on a computer's screen or a phone's, with a way
// to the reply's other screens. "Looks good" and "Change something" put a line in the message box.
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { ArrowLeftRight, ChevronLeft, ChevronRight, Columns2, Image as ImageIcon, Maximize2, Monitor, Smartphone, X } from 'lucide-react';
import type { UiShot } from '@shared/shots';
import type { TimelineItem, ToolItem } from '@shared/types';
import { api, enc } from '../../lib/api';
import { composeInsert } from '../../lib/featureEvents';
import { openLightbox } from '../../components/Lightbox';
import { tr } from '../../i18n/runtime';
import { Button, cx, IconButton, Segmented, Throbber } from '../../components/ui';
import { PageOverlay } from '../pages/overlay';
import { CANVAS_MEDIA, onScreen, useCanvas } from '../pages/state';

const src = (s: UiShot) => `/api/shots/${enc(s.id)}`;

/** The shots a call took, from what it answered: "(shot <id>, <id>)". */
export const shotIds = (output?: string): string[] => /\(shot ([a-f0-9, ]+)\)/.exec(output ?? '')?.[1].split(/,\s*/).filter((x) => /^[a-f0-9]{12}$/.test(x)) ?? [];

const isShot = (it: TimelineItem): it is ToolItem => it.kind === 'tool' && /(^|__)ui_screenshot$/.test(it.tool.name);
const labelOf = (item?: ToolItem) => ((item?.tool.input ?? {}) as { label?: string }).label?.trim() || 'The page';
const phaseOf = (item: ToolItem): UiShot['phase'] => {
  const p = (item.tool.input as { phase?: string } | undefined)?.phase;
  return p === 'before' || p === 'after' ? p : 'check';
};

/** The screenshots taken in the same reply as `id` (from the user's message before it to the turn's end), in order. */
export function shotsOfTurn(items: TimelineItem[], id: string): ToolItem[] {
  const at = items.findIndex((i) => i.id === id);
  if (at < 0) return [];
  const edge = (i: TimelineItem) => i.kind === 'turn' || (i.kind === 'user' && i.meta !== 'note' && i.meta !== 'command-output');
  let a = at;
  while (a > 0 && !edge(items[a - 1])) a--;
  let b = at;
  while (b < items.length - 1 && !edge(items[b + 1])) b++;
  return items.slice(a, b + 1).filter(isShot);
}

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
export function Compare({ pairs, sessionKey, onSaid }: { pairs: Pair[]; sessionKey?: string; onSaid?: () => void }) {
  const sizes = [...new Set(pairs.map((p) => p.shot.viewport))];
  const [size, setSize] = useState(sizes[0]);
  const [how, setHow] = useState<'slider' | 'side'>('slider');
  const p = pairs.find((x) => x.shot.viewport === size) ?? pairs[0];
  const after = p.shot.phase === 'after' ? p.shot : null;
  const before = after ? p.before : null;
  const open = (i: number) => openLightbox((before && after ? [before, after] : [p.shot]).map((s, n) => ({ src: src(s), name: before && after ? (n === 0 ? 'Before' : 'After') : s.label })), i);
  const say = (text: string) => {
    composeInsert(text, sessionKey);
    onSaid?.();
  };
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
        <div className={cx(phone ? (how === 'side' && before ? 'w-full max-w-[560px]' : 'w-full max-w-[300px]') : 'w-full')}>
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

/** One call's review, its pictures fetched as it opens. `onSaid`: a line went to the message box. */
function ShotReview({ item, sessionKey, onSaid }: { item: ToolItem; sessionKey: string; onSaid?: () => void }) {
  const ids = useMemo(() => shotIds(item.tool.output), [item.tool.output]);
  const { pairs, error } = usePairs(ids);
  if (item.tool.status === 'error') return <p className="px-4 py-6 text-[13px] text-fg-3">Could not take the screenshot: {(item.tool.output ?? item.tool.error ?? '').slice(0, 300)}</p>;
  if (error) return <p className="px-4 py-6 text-[13px] text-fg-3">{error}</p>;
  if (!ids.length || !pairs)
    return (
      <div className="flex justify-center py-10 text-fg-3">
        <Throbber size={24} />
      </div>
    );
  return <Compare key={item.id} pairs={pairs} sessionKey={sessionKey} onSaid={onSaid} />;
}

/** The previous and next of the reply's screens, and where this one is among them. */
function Steps({ at, count, onGo }: { at: number; count: number; onGo: (i: number) => void }) {
  if (count < 2) return null;
  return (
    <span className="flex shrink-0 items-center gap-0.5">
      <IconButton label="The screen before" size="sm" disabled={at === 0} onClick={() => onGo(at - 1)}>
        <ChevronLeft size={15} />
      </IconButton>
      <span className="min-w-[3.2em] text-center text-[12px] text-fg-3 tabular-nums">{`${at + 1} / ${count}`}</span>
      <IconButton label="The next screen" size="sm" disabled={at === count - 1} onClick={() => onGo(at + 1)}>
        <ChevronRight size={15} />
      </IconButton>
    </span>
  );
}

const PHASE: Record<UiShot['phase'], string> = { before: 'Before', after: 'Before and after', check: 'Screenshot' };

/** A screen's small picture in the reply's card: its after (or its one picture), marked as what it is; named under it unless `bare` (the card's title names it). */
function Tile({ item, active, onOpen, bare }: { item: ToolItem; active: boolean; onOpen: () => void; bare?: boolean }) {
  const ids = useMemo(() => shotIds(item.tool.output), [item.tool.output]);
  const { pairs, error } = usePairs(ids);
  const label = labelOf(item);
  const phase = phaseOf(item);
  const failed = item.tool.status === 'error' || !!error;
  const shown = pairs?.find((p) => p.shot.viewport === 'desktop') ?? pairs?.[0];
  const phoneToo = !!pairs && pairs.some((p) => p.shot.viewport === 'phone') && pairs.some((p) => p.shot.viewport === 'desktop');
  const tag = phase === 'after' ? (shown?.before ? 'Before → after' : 'After') : phase === 'before' ? 'Before' : null;
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={!pairs && !failed}
      title={failed ? undefined : 'Review it'}
      className={cx(
        'group min-w-0 overflow-hidden rounded-lg border bg-bg-1 text-left transition-colors',
        active ? 'border-accent/60 shadow-[0_0_0_3px_var(--accent-soft)]' : 'border-line hover:border-line-2',
      )}
    >
      <span className={cx('relative block aspect-[16/10] overflow-hidden bg-bg-2', shown?.shot.viewport === 'phone' && 'flex justify-center')}>
        {shown ? (
          <>
            <img
              src={src(shown.shot)}
              alt=""
              loading="lazy"
              decoding="async"
              draggable={false}
              className={cx('block h-full', shown.shot.viewport === 'phone' ? 'w-auto' : 'w-full object-cover object-top')}
            />
            {/* A screen's before and after: the before on the left half, the after on the right. */}
            {shown.before && shown.shot.viewport !== 'phone' && (
              <>
                <img src={src(shown.before)} alt="" loading="lazy" decoding="async" draggable={false} className="absolute inset-0 h-full w-full object-cover object-top [clip-path:inset(0_50%_0_0)]" />
                <span className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_0_1px_rgba(0,0,0,.2)]" />
              </>
            )}
          </>
        ) : failed ? (
          <span className="flex h-full items-center justify-center px-3 text-center text-[11.5px] text-fg-3">Could not take it</span>
        ) : (
          <span className="flex h-full items-center justify-center text-fg-3">
            <Throbber />
          </span>
        )}
        {(tag || phoneToo) && shown && (
          <span className="pointer-events-none absolute top-1.5 left-1.5 flex items-center gap-1">
            {tag && <span className="rounded-md bg-black/60 px-1.5 py-0.5 text-[10.5px] font-medium text-white">{tag}</span>}
            {phoneToo && (
              <span className="grid h-[19px] w-[19px] place-items-center rounded-md bg-black/60 text-white" title="On a phone too">
                <Smartphone size={11} />
              </span>
            )}
          </span>
        )}
      </span>
      {!bare && (
        <span translate="no" className="block truncate px-2 py-1.5 text-[12px] text-fg-2">
          {label}
        </span>
      )}
    </button>
  );
}

/** The reply's screenshots: one card of small pictures; a picture opens its review. */
export function ShotCard({ item, sessionKey, more }: { item: ToolItem; sessionKey: string; more?: ToolItem[] }) {
  const all = useMemo(() => [item, ...(more ?? [])], [item, more]);
  const [over, setOver] = useState<number | null>(null);
  const shownId = useCanvas((x) => {
    const t = x.open[sessionKey];
    return t?.kind === 'review' ? t.id : null;
  });
  const last = all[all.length - 1];
  const lastIds = shotIds(last.tool.output).length;
  // An after one that just came opens beside the conversation, as pages do.
  useEffect(() => {
    if (phaseOf(last) !== 'after' || !lastIds || !last.ts || Date.now() - last.ts > 20_000) return;
    const c = useCanvas.getState();
    if (c.auto && !c.open[sessionKey] && matchMedia(CANVAS_MEDIA).matches && onScreen(sessionKey)) c.show(sessionKey, { kind: 'review', id: last.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [last.id, lastIds]);

  const open = (i: number) => {
    if (matchMedia(CANVAS_MEDIA).matches) useCanvas.getState().show(sessionKey, { kind: 'review', id: all[i].id });
    else setOver(i);
  };
  const phases = new Set(all.map(phaseOf));
  const title = phases.has('after') ? PHASE.after : phases.size === 1 && phases.has('before') ? PHASE.before : all.length > 1 ? 'Screenshots' : PHASE.check;
  const one = all.length === 1;
  return (
    <div className={cx('tl-item my-1.5 rounded-xl border border-line bg-panel p-2', one && 'sm:max-w-[22rem]')}>
      <div className="flex items-center gap-2 px-1 pb-2">
        {phases.has('after') ? <ArrowLeftRight size={14} className="shrink-0 text-accent" /> : <ImageIcon size={14} className="shrink-0 text-fg-3" />}
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-fg-2">
          {title}
          {one && (
            <>
              {' · '}
              <span translate="no">{labelOf(item)}</span>
            </>
          )}
        </span>
        {!one && <span className="shrink-0 text-[12px] text-fg-3">{`${all.length} screens`}</span>}
      </div>
      <div className={cx('grid gap-2', one ? 'grid-cols-1' : all.length === 2 ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3')}>
        {all.map((it, i) => (
          <Tile key={it.id} item={it} active={shownId === it.id} onOpen={() => open(i)} bare={one} />
        ))}
      </div>
      {over !== null && all[over] && (
        <PageOverlay title={labelOf(all[over])} onClose={() => setOver(null)} actions={<Steps at={over} count={all.length} onGo={setOver} />}>
          <div className="h-full overflow-y-auto">
            {/* Over the app, the message box is under it: a line put there closes the review. */}
            <ShotReview key={all[over].id} item={all[over]} sessionKey={sessionKey} onSaid={() => setOver(null)} />
          </div>
        </PageOverlay>
      )}
    </div>
  );
}

/** The review beside the conversation: the screen picked, with a way to the reply's other screens. */
export function ReviewPane({ sessionKey, items, id, onClose }: { sessionKey: string; items: ToolItem[]; id: string; onClose: () => void }) {
  const at = Math.max(0, items.findIndex((i) => i.id === id));
  const item = items[at] as ToolItem | undefined;
  const go = (i: number) => items[i] && useCanvas.getState().show(sessionKey, { kind: 'review', id: items[i].id });
  const phase = item ? phaseOf(item) : 'check';
  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      <div className="flex min-h-12 shrink-0 items-center gap-2 border-b border-line px-2 py-1.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
          {phase === 'after' ? <ArrowLeftRight size={16} /> : <ImageIcon size={16} />}
        </span>
        <span className="min-w-0 flex-1">
          <span translate="no" className="block truncate text-[13.5px] font-medium text-fg">
            {labelOf(item)}
          </span>
          <span className="block truncate text-[11.5px] text-fg-3">{phase === 'after' ? 'Before and after, to review' : PHASE[phase]}</span>
        </span>
        <Steps at={at} count={items.length} onGo={go} />
        <IconButton label="Close" size="sm" onClick={onClose}>
          <X size={15} />
        </IconButton>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!item ? <p className="px-4 py-6 text-[13px] text-fg-3">This review is no longer in the conversation.</p> : <ShotReview key={item.id} item={item} sessionKey={sessionKey} />}
      </div>
    </div>
  );
}
