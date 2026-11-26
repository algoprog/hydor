// The screenshots an agent shows of a web app (ui_screenshot, before and after a change) or of files it already had
// (show_screenshots), for the user to review. The screenshots of one reply, from either tool, show together as one
// card of small pictures, one for each screen: a screen's own versions (computer or phone size, dark or light
// theme) and its before, if it has one, are behind its picture, and screens may come under headings (sections).
// A picture opens the review: beside the conversation where there is room (as pages do), else over the app. There,
// an after shows over its before with a slider to sweep between them, or both side by side, with switches for the
// size and the theme, and a way to the reply's other screens. "Looks good" and "Change something" put a line in the
// message box.
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { ArrowLeftRight, ChevronDown, ChevronLeft, ChevronRight, Columns2, Image as ImageIcon, Maximize2, Monitor, Moon, Smartphone, Sun, SunMoon, X } from 'lucide-react';
import { SHOT_TOOLS, shotIdsOf, type ShotPair, type UiShot } from '@shared/shots';
import type { TimelineItem, ToolItem } from '@shared/types';
import { api, enc } from '../../lib/api';
import { mu } from '../../lib/machine';
import { composeInsert } from '../../lib/featureEvents';
import { openLightbox } from '../../components/Lightbox';
import { tr } from '../../i18n/runtime';
import { Button, cx, IconButton, Segmented, Throbber, useMediaQuery } from '../../components/ui';
import { PageOverlay } from '../pages/overlay';
import { CANVAS_MEDIA, onScreen, useCanvas } from '../pages/state';

const src = (s: UiShot) => mu(`/api/shots/${enc(s.id)}`);

/** The shots a call took, from what it answered: "(shot <id>, <id>)". */
export const shotIds = shotIdsOf;

const SHOT_TOOL = new RegExp(`(^|__)(${SHOT_TOOLS.join('|')})$`);
const isShot = (it: TimelineItem): it is ToolItem => it.kind === 'tool' && SHOT_TOOL.test(it.tool.name);

/**
 * The shot calls made in the same reply as `id` (from the user's message before it to the turn's end), in order.
 * `id` is a call's id, or one of the shots a call made (a screen's id is its first shot's).
 */
export function shotsOfTurn(items: TimelineItem[], id: string): ToolItem[] {
  const at = items.findIndex((i) => i.id === id || (i.kind === 'tool' && shotIdsOf(i.tool.output).includes(id)));
  if (at < 0) return [];
  const edge = (i: TimelineItem) => i.kind === 'turn' || (i.kind === 'user' && i.meta !== 'note' && i.meta !== 'command-output');
  let a = at;
  while (a > 0 && !edge(items[a - 1])) a--;
  let b = at;
  while (b < items.length - 1 && !edge(items[b + 1])) b++;
  return items.slice(a, b + 1).filter(isShot);
}

// ---- the pictures ---------------------------------------------------------------------------------------------

/** Every shot's pair fetched so far, by the shot's id, so the card and the review beside it ask the server once. */
const pairCache = new Map<string, ShotPair>();
const inflight = new Map<string, Promise<void>>();

/** Fetches the pairs of the shots not kept yet (those asked for already are waited for, not asked again). */
function loadPairs(ids: string[]): Promise<void> {
  const need = ids.filter((id) => !pairCache.has(id) && !inflight.has(id));
  for (let i = 0; i < need.length; i += 100) {
    const part = need.slice(i, i + 100);
    const p = api<{ pairs: ShotPair[] }>(`/api/shots/pairs?ids=${part.map(enc).join(',')}`)
      .then((r) => {
        for (const x of r.pairs) pairCache.set(x.shot.id, x);
      })
      .finally(() => part.forEach((id) => inflight.delete(id)));
    part.forEach((id) => inflight.set(id, p));
  }
  return Promise.all(ids.flatMap((id) => (inflight.has(id) ? [inflight.get(id)!] : []))).then(() => undefined);
}

/** One screen of the reply: all its pictures, as the versions (a size and a theme each) the user can switch between. */
export interface Screen {
  /** Its first shot's id: what the canvas opens it by. */
  id: string;
  label: string;
  section?: string;
  note?: string;
  /** Its pictures: the after ones when it has any (each with its before), else the before ones; one for a size and theme. */
  variants: ShotPair[];
  /** The calls that made them. */
  itemIds: string[];
  /** What makes two shots one screen: the same section and label. */
  key: string;
}

const screenKey = (s: UiShot) => `${s.section || ''}\n${s.label.trim().toLowerCase()}`;

/** The reply's screens from its shots (in the order they were made): the same label in the same section is one screen. */
function screensOf(pairs: ShotPair[], calls: ToolItem[]): Screen[] {
  const groups = new Map<string, ShotPair[]>();
  for (const p of pairs) {
    const k = screenKey(p.shot);
    const g = groups.get(k);
    if (g) g.push(p);
    else groups.set(k, [p]);
  }
  const callsOf = new Map<string, string[]>();
  for (const c of calls) for (const id of shotIdsOf(c.tool.output)) callsOf.set(id, [...(callsOf.get(id) ?? []), c.id]);
  const out: Screen[] = [];
  for (const [key, g] of groups) {
    const after = g.filter((p) => p.shot.phase !== 'before');
    const pool = after.length ? after : g;
    const byKind = new Map<string, ShotPair>();
    for (const p of pool) {
      const k = `${p.shot.viewport}/${p.shot.theme ?? ''}`;
      const old = byKind.get(k);
      if (!old || p.shot.createdAt >= old.shot.createdAt) byKind.set(k, p);
    }
    out.push({
      id: g[0].shot.id,
      label: g[0].shot.label.trim() || 'The page',
      section: g.find((p) => p.shot.section)?.shot.section,
      note: g.find((p) => p.shot.note?.trim())?.shot.note?.trim(),
      variants: [...byKind.values()],
      itemIds: [...new Set(g.flatMap((p) => callsOf.get(p.shot.id) ?? []))],
      key,
    });
  }
  // The screens of one section stay together, the sections in the order they first came.
  const order = new Map<string, number>();
  for (const s of out) if (!order.has(s.section ?? '')) order.set(s.section ?? '', order.size);
  return out.sort((x, y) => order.get(x.section ?? '')! - order.get(y.section ?? '')!);
}

/** Where a screen is among the reply's: by its id, or by the id of a call that made it (how older links opened one). */
const screenAt = (screens: Screen[], id: string): number => {
  const i = screens.findIndex((s) => s.id === id);
  return i >= 0 ? i : screens.findIndex((s) => s.itemIds.includes(id));
};

/** A screen's version to show first: on a computer and in the dark when it has that, else on a computer, else the first. */
const bestOf = (list: ShotPair[]): ShotPair => {
  const rank = (p: ShotPair) => (p.shot.viewport === 'desktop' ? 2 : 0) + (p.shot.theme === 'dark' ? 1 : 0);
  return list.reduce((a, b) => (rank(b) > rank(a) ? b : a));
};

/** Whether a screen has a dark and a light version. */
const bothThemes = (s: Screen) => s.variants.some((v) => v.shot.theme === 'dark') && s.variants.some((v) => v.shot.theme === 'light');

/** What a screen is: with an after (to review), only a before, or a plain look. */
const kindOf = (s: Screen): UiShot['phase'] => (s.variants.some((v) => v.shot.phase === 'after') ? 'after' : s.variants.every((v) => v.shot.phase === 'before') ? 'before' : 'check');

/** The screens of some calls (a reply's), their pictures fetched in one go; more come as the reply adds calls. */
function useScreens(calls: ToolItem[]): { screens: Screen[]; loading: boolean; error: string | null } {
  const ids = [...new Set(calls.flatMap((c) => shotIdsOf(c.tool.output)))];
  const key = ids.join(',');
  const [done, setDone] = useState<{ key: string; error: string | null }>({ key: '', error: null });
  useEffect(() => {
    if (!ids.length) return;
    let alive = true;
    loadPairs(ids)
      .then(() => alive && setDone({ key, error: null }))
      .catch((e) => alive && setDone({ key, error: (e as Error).message }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const screens = useMemo(
    () => screensOf(ids.flatMap((id) => pairCache.get(id) ?? []), calls),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, done],
  );
  const fetching = done.key !== key && ids.some((id) => !pairCache.has(id));
  const running = calls.some((c) => !shotIdsOf(c.tool.output).length && (c.tool.status === 'pending' || c.tool.status === 'running' || c.tool.status === 'waiting'));
  const failed = calls.find((c) => c.tool.status === 'error');
  const why = failed ? (failed.tool.output ?? failed.tool.error ?? '').slice(0, 300) : '';
  const error =
    done.key === key && done.error ? done.error : failed ? (/show_screenshots$/.test(failed.tool.name) ? `Could not show the screenshots: ${why}` : `Could not take the screenshot: ${why}`) : null;
  return { screens, loading: fetching || running, error };
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

type Size = UiShot['viewport'];
type Theme = 'dark' | 'light' | '';

/** One screen's review: its pictures (before and after, or the one), on the size and theme picked. */
export function Compare({ screen, sessionKey, onSaid }: { screen: Screen; sessionKey?: string; onSaid?: () => void }) {
  const { variants } = screen;
  const first = bestOf(variants);
  const [size, setSize] = useState<Size>(first.shot.viewport);
  const [theme, setTheme] = useState<Theme>(first.shot.theme ?? '');
  const [how, setHow] = useState<'slider' | 'side'>('slider');
  const match = (v: ShotPair, z: Size, t: Theme) => v.shot.viewport === z && (v.shot.theme ?? '') === t;
  const p = variants.find((v) => match(v, size, theme)) ?? bestOf(variants.filter((v) => v.shot.viewport === size).concat(variants));
  const sizes = [...new Set(variants.map((v) => v.shot.viewport))];
  const themes = [...new Set(variants.flatMap((v) => (v.shot.theme ? [v.shot.theme] : [])))];
  // Another size keeps the theme when that size has it; another theme keeps the size when that theme has it.
  const pickSize = (z: Size) => {
    const v = variants.find((x) => match(x, z, theme)) ?? bestOf(variants.filter((x) => x.shot.viewport === z));
    setSize(z);
    setTheme(v.shot.theme ?? '');
  };
  const pickTheme = (t: 'dark' | 'light') => {
    const v = variants.find((x) => match(x, size, t)) ?? bestOf(variants.filter((x) => x.shot.theme === t));
    setSize(v.shot.viewport);
    setTheme(t);
  };
  const after = p.shot.phase === 'after' ? p.shot : null;
  const before = after ? p.before : null;
  const open = (i: number) => openLightbox((before && after ? [before, after] : [p.shot]).map((s, n) => ({ src: src(s), name: before && after ? (n === 0 ? 'Before' : 'After') : screen.label })), i);
  const say = (text: string) => {
    composeInsert(text, sessionKey);
    onSaid?.();
  };
  const phone = p.shot.viewport === 'phone';
  // The line on the right: what the agent says about the screen, else where it was (a file: only its name).
  const file = p.shot.url.startsWith('file://');
  const where = file ? (p.shot.url.slice(7).split('/').filter(Boolean).pop() ?? p.shot.url) : p.shot.url.replace(/^https?:\/\//, '');
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        {sizes.length > 1 && (
          <Segmented
            size="sm"
            value={p.shot.viewport}
            onChange={pickSize}
            options={sizes.map((v) => ({ value: v, label: v === 'phone' ? <Smartphone size={14} aria-label="Phone" /> : <Monitor size={14} aria-label="Computer" /> }))}
          />
        )}
        {themes.length > 1 && (
          <Segmented<Theme>
            size="sm"
            value={p.shot.theme ?? ''}
            onChange={(t) => t && pickTheme(t)}
            options={[
              { value: 'dark', label: <Moon size={14} aria-label="Dark" /> },
              { value: 'light', label: <Sun size={14} aria-label="Light" /> },
            ]}
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
        <span translate="no" className={cx('min-w-0 flex-1 text-right text-[11.5px] text-fg-3', screen.note ? 'line-clamp-2' : 'truncate')} title={screen.note ?? (file ? p.shot.url.slice(7) : p.shot.url)}>
          {screen.note ?? where}
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
      {(after || p.shot.source === 'file') && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-2">
          {after && !before && <span className="text-[12px] text-fg-3">No before picture to compare with.</span>}
          <span className="flex-1" />
          <Button size="sm" variant="ghost" onClick={() => say(`${tr(`About “${screen.label}”:`)} `)}>
            Change something
          </Button>
          <Button size="sm" variant="secondary" onClick={() => say(tr(`“${screen.label}” looks good.`))}>
            Looks good
          </Button>
        </div>
      )}
    </div>
  );
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

/**
 * A screen's small picture in the reply's card: its main version, marked as what it is and what else it has; named under
 * it unless `bare` (the card's title names it). `themes`: mark a screen that has both themes (not when every screen has).
 */
function Tile({ screen, active, onOpen, bare, themes = true }: { screen: Screen; active: boolean; onOpen: () => void; bare?: boolean; themes?: boolean }) {
  const shown = bestOf(screen.variants);
  const sizesToo = screen.variants.some((v) => v.shot.viewport === 'phone') && screen.variants.some((v) => v.shot.viewport === 'desktop');
  const themesToo = themes && bothThemes(screen);
  const tag = shown.shot.phase === 'after' ? (shown.before ? 'Before → after' : 'After') : shown.shot.phase === 'before' ? 'Before' : null;
  const sign = 'grid h-[19px] w-[19px] place-items-center rounded-md bg-black/60 text-white';
  return (
    <button
      type="button"
      onClick={onOpen}
      title="Review it"
      className={cx(
        'group min-w-0 overflow-hidden rounded-lg border bg-bg-1 text-left transition-colors',
        active ? 'border-accent/60 shadow-[0_0_0_3px_var(--accent-soft)]' : 'border-line hover:border-line-2',
      )}
    >
      <span className={cx('relative block aspect-[16/10] overflow-hidden bg-bg-2', shown.shot.viewport === 'phone' && 'flex justify-center')}>
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
        {(tag || sizesToo || themesToo) && (
          <span className="pointer-events-none absolute top-1.5 left-1.5 flex items-center gap-1">
            {tag && <span className="rounded-md bg-black/60 px-1.5 py-0.5 text-[10.5px] font-medium text-white">{tag}</span>}
            {sizesToo && (
              <span className={sign} title="On a phone too">
                <Smartphone size={11} />
              </span>
            )}
            {themesToo && (
              <span className={sign} title="In the dark and light themes too">
                <SunMoon size={11} />
              </span>
            )}
          </span>
        )}
      </span>
      {!bare && (
        <span translate="no" className="block truncate px-2 py-1.5 text-[12px] text-fg-2">
          {screen.label}
        </span>
      )}
    </button>
  );
}

/**
 * The reply's screenshots: one card of small pictures, one for each screen, under their sections' names when they have
 * any; a picture opens its review. More than a row of them shows the first row, with Show all under it, so a reply with
 * many screens does not fill the conversation.
 */
export function ShotCard({ item, sessionKey, more }: { item: ToolItem; sessionKey: string; more?: ToolItem[] }) {
  const all = useMemo(() => [item, ...(more ?? [])], [item, more]);
  const { screens, loading, error } = useScreens(all);
  const [over, setOver] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const wide = useMediaQuery('(min-width: 640px)');
  const shownId = useCanvas((x) => {
    const t = x.open[sessionKey];
    return t?.kind === 'review' ? t.id : null;
  });
  const last = all[all.length - 1];
  // An after one that just came opens beside the conversation, as pages do: the reply's newest call's first after screen.
  const tried = useRef('');
  useEffect(() => {
    if (tried.current === last.id) return;
    const after = shotIdsOf(last.tool.output).flatMap((id) => pairCache.get(id) ?? []).find((p) => p.shot.phase === 'after');
    const target = after && screens.find((s) => s.key === screenKey(after.shot));
    if (!target) return;
    tried.current = last.id;
    if (!last.ts || Date.now() - last.ts > 20_000) return;
    const c = useCanvas.getState();
    if (c.auto && !c.open[sessionKey] && matchMedia(CANVAS_MEDIA).matches && onScreen(sessionKey)) c.show(sessionKey, { kind: 'review', id: target.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [last.id, screens]);

  const open = (s: Screen) => {
    if (matchMedia(CANVAS_MEDIA).matches) useCanvas.getState().show(sessionKey, { kind: 'review', id: s.id });
    else setOver(s.id);
  };
  const frame = 'tl-item my-1.5 rounded-xl border border-line bg-panel p-2';
  if (!screens.length)
    return (
      <div className={cx(frame, 'sm:max-w-[22rem]')}>
        <div className="flex items-center gap-2 px-1 pb-2">
          <ImageIcon size={14} className="shrink-0 text-fg-3" />
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-fg-2">{PHASE.check}</span>
        </div>
        {loading ? (
          <div className="flex justify-center py-6 text-fg-3">
            <Throbber />
          </div>
        ) : (
          <p className="px-1 pb-1 text-[12px] text-fg-3">{error ?? 'Could not take it'}</p>
        )}
      </div>
    );
  const kinds = new Set(screens.map(kindOf));
  const title = kinds.has('after') ? PHASE.after : kinds.size === 1 && kinds.has('before') ? PHASE.before : screens.length > 1 ? 'Screenshots' : PHASE.check;
  const one = screens.length === 1;
  // A row: one picture, two side by side, else three (two on a phone). The one open in the review stays in view.
  const perRow = one ? 1 : screens.length === 2 || !wide ? 2 : 3;
  const openAt = shownId ? screenAt(screens, shownId) : -1;
  const folded = screens.length > perRow && !expanded && openAt < perRow;
  const shown = folded ? screens.slice(0, perRow) : screens;
  // The screens of a section come together (they are in that order), each section under its name.
  const runs: { section: string; list: Screen[] }[] = [];
  for (const s of shown) {
    const tail = runs[runs.length - 1];
    if (tail && tail.section === (s.section ?? '')) tail.list.push(s);
    else runs.push({ section: s.section ?? '', list: [s] });
  }
  const named = screens.some((s) => s.section);
  // A sign on every picture says nothing: the themes are marked only when some screens have both and others not.
  const markThemes = !screens.every(bothThemes);
  const overAt = over ? screenAt(screens, over) : -1;
  return (
    <div className={cx(frame, one && 'sm:max-w-[22rem]')}>
      <div className="flex items-center gap-2 px-1 pb-2">
        {kinds.has('after') ? <ArrowLeftRight size={14} className="shrink-0 text-accent" /> : <ImageIcon size={14} className="shrink-0 text-fg-3" />}
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-fg-2">
          {title}
          {one && (
            <>
              {' · '}
              <span translate="no">{screens[0].label}</span>
            </>
          )}
        </span>
        {!one && <span className="shrink-0 text-[12px] text-fg-3">{tr(`${screens.length} screens`)}</span>}
      </div>
      <div className="space-y-3">
        {runs.map((r, n) => (
          <div key={`${n}/${r.section}`}>
            {named && r.section && (
              <div translate="no" className="truncate px-1 pb-1.5 text-[12px] font-medium text-fg-3">
                {r.section}
              </div>
            )}
            <div className={cx('grid gap-2', one ? 'grid-cols-1' : screens.length === 2 ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3')}>
              {r.list.map((s) => (
                <Tile key={s.id} screen={s} active={openAt >= 0 && screens[openAt] === s} onOpen={() => open(s)} bare={one} themes={markThemes} />
              ))}
            </div>
          </div>
        ))}
      </div>
      {screens.length > perRow && (folded || expanded) && (
        <button
          type="button"
          aria-expanded={!folded}
          onClick={() => setExpanded(folded)}
          className="mt-2 flex h-8 w-full items-center justify-center gap-1.5 rounded-lg text-[12.5px] font-medium text-fg-2 transition-colors hover:bg-bg-2 hover:text-fg"
        >
          {folded ? tr(`Show all ${screens.length}`) : 'Show fewer'}
          <ChevronDown size={14} className={cx('transition-transform', !folded && 'rotate-180')} />
        </button>
      )}
      {overAt >= 0 && (
        <PageOverlay title={screens[overAt].label} onClose={() => setOver(null)} actions={<Steps at={overAt} count={screens.length} onGo={(i) => setOver(screens[i].id)} />}>
          <div className="h-full overflow-y-auto">
            {/* Over the app, the message box is under it: a line put there closes the review. */}
            <Compare key={screens[overAt].id} screen={screens[overAt]} sessionKey={sessionKey} onSaid={() => setOver(null)} />
          </div>
        </PageOverlay>
      )}
    </div>
  );
}

/** The review beside the conversation: the screen picked, with a way to the reply's other screens. `items`: the reply's shot calls. */
export function ReviewPane({ sessionKey, items, id, onClose }: { sessionKey: string; items: ToolItem[]; id: string; onClose: () => void }) {
  const { screens, loading, error } = useScreens(items);
  const at = screenAt(screens, id);
  const screen = screens[at] as Screen | undefined;
  const go = (i: number) => screens[i] && useCanvas.getState().show(sessionKey, { kind: 'review', id: screens[i].id });
  const kind = screen ? kindOf(screen) : 'check';
  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      <div className="flex min-h-12 shrink-0 items-center gap-2 border-b border-line px-2 py-1.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
          {kind === 'after' ? <ArrowLeftRight size={16} /> : <ImageIcon size={16} />}
        </span>
        <span className="min-w-0 flex-1">
          <span translate="no" className="block truncate text-[13.5px] font-medium text-fg">
            {screen?.label ?? 'The page'}
          </span>
          <span className="block truncate text-[11.5px] text-fg-3">
            {screen?.section && (
              <>
                <span translate="no">{screen.section}</span>
                {' · '}
              </>
            )}
            {kind === 'after' ? 'Before and after, to review' : PHASE[kind]}
          </span>
        </span>
        <Steps at={at} count={screens.length} onGo={go} />
        <IconButton label="Close" size="sm" onClick={onClose}>
          <X size={15} />
        </IconButton>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {screen ? (
          <Compare key={screen.id} screen={screen} sessionKey={sessionKey} />
        ) : loading ? (
          <div className="flex justify-center py-10 text-fg-3">
            <Throbber size={24} />
          </div>
        ) : error ? (
          <p className="px-4 py-6 text-[13px] text-fg-3">{error}</p>
        ) : (
          <p className="px-4 py-6 text-[13px] text-fg-3">This review is no longer in the conversation.</p>
        )}
      </div>
    </div>
  );
}
