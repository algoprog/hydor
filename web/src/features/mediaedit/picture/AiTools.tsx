// The picture editor's AI panel: Remove the background and Erase (on the picked pixel layer), Change with AI (what shows,
// changed as the words say: a new layer over the picked one, only inside the selection or where painted when there is
// one, as a generative fill), Expand the picture (the canvas made larger, the new part drawn by AI, under the layers),
// Make it larger (2× or 4×, free on this computer: Real-ESRGAN) and Select the subject. Taking the background out,
// erasing, making larger and selecting the subject run on this computer for nothing once the picture tools are set up
// (their card offers it; OpenRouter is the other way where there is one, priced); a result made here can be done again by
// AI (Do it with AI instead). What goes through OpenRouter with no key set asks for it in place, and skipped, runs
// nothing. Each result is one step Undo takes back, and says how it was made.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Eraser, Expand, Maximize2, Scissors, Sparkles, Trash2, Undo2, UserSquare2 } from 'lucide-react';
import type { PictureAnswer, TiersInfo } from '@shared/images';
import { LIMITS } from '@shared/mediaedit';
import { Button, cx, IconButton } from '../../../components/ui';
import { cutout, editImage, erase, getTiers, upscale } from '../../images/studio/api';
import { KeyAsk } from '../../images/studio/KeyAsk';
import { LocalToolsCard, useLocalTools } from '../../images/studio/LocalTools';
import { aiInsteadButton, changePrice, insteadLine, madeWith, money, needsKey, toolPrice } from '../../images/studio/logic';
import { PriceLine, Problem, Working } from '../../images/studio/parts';
import { expansionAsk, expansionResult, keepCanvas, maskOf, putInPainted, readKept, sendable, sized, withAlphaOf, SEND_SIDE } from '../ai';
import { seeThrough } from '../render';
import { Seg, SliderRow } from '../shell';
import { flattenDoc } from './compose';
import { canvasOf, type RasterLayer } from './doc';
import type { PictureEd } from './editor';
import { selCanvas } from './paint';
import { trimMask, type Mask } from './mask';
import { useEd } from './View';

export type AiMode = 'cutout' | 'erase' | 'change' | 'expand' | 'upscale' | 'subject';

const MODES: { id: AiMode; label: string; line: string; icon: ReactNode }[] = [
  { id: 'cutout', label: 'Remove the background', line: 'Keeps what the picked layer is of, on a see-through background.', icon: <Scissors size={15} /> },
  { id: 'erase', label: 'Erase', line: 'Select or paint over something to take it away; what is around it fills the gap.', icon: <Eraser size={15} /> },
  { id: 'change', label: 'Change with AI', line: 'Say what to change, everywhere, or inside the selection or where you paint: it comes as a new layer.', icon: <Sparkles size={15} /> },
  { id: 'expand', label: 'Expand the picture', line: 'A wider or taller picture, the new part drawn by AI.', icon: <Expand size={15} /> },
  { id: 'upscale', label: 'Make it larger', line: 'Twice or four times as large, its detail drawn in sharply, on this computer.', icon: <Maximize2 size={15} /> },
  { id: 'subject', label: 'Select the subject', line: 'Selects what the picture is of, to change it or what is around it.', icon: <UserSquare2 size={15} /> },
];

const EXPAND_SHAPES: { id: string; label: string; ratio: number | 'all' }[] = [
  { id: '16:9', label: '16:9', ratio: 16 / 9 },
  { id: '4:3', label: '4:3', ratio: 4 / 3 },
  { id: '1:1', label: 'Square (1:1)', ratio: 1 },
  { id: '4:5', label: '4:5', ratio: 4 / 5 },
  { id: '9:16', label: '9:16', ratio: 9 / 16 },
  { id: 'all', label: 'All round', ratio: 'all' },
];

interface Done {
  mode: AiMode;
  how: PictureAnswer['how'];
  model?: string;
  cost?: number;
  why?: string;
  again?: () => void;
}

const whyOf = (r: PictureAnswer & { why?: unknown; note?: unknown }) => (typeof r.why === 'string' && r.why.trim() ? r.why : typeof r.note === 'string' && r.note.trim() ? r.note : undefined);

/** A mask (white on black, as the routes take it) of the selection over a part of the canvas at `k` times its size. */
function selMaskData(sel: Mask, origin: { x: number; y: number; w: number; h: number }, k: number): string {
  const c = canvasOf(origin.w * k, origin.h * k);
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, c.width, c.height);
  g.imageSmoothingQuality = 'high';
  g.drawImage(selCanvas(sel), (sel.x - origin.x) * k, (sel.y - origin.y) * k, sel.w * k, sel.h * k);
  return c.toDataURL('image/png');
}

/** `after` (fitted to `before`) laid over `before` only where the selection is, its own soft edge kept: a new canvas. */
function throughSel(before: HTMLCanvasElement | null, after: CanvasImageSource, sel: Mask, origin: { x: number; y: number }, w: number, h: number): HTMLCanvasElement {
  const part = sized(after, w, h);
  const pg = part.getContext('2d')!;
  pg.globalCompositeOperation = 'destination-in';
  pg.drawImage(selCanvas(sel), sel.x - origin.x, sel.y - origin.y);
  // Beyond the selection's box nothing is kept.
  pg.globalCompositeOperation = 'source-over';
  const out = before ? sized(before, w, h) : canvasOf(w, h);
  out.getContext('2d')!.drawImage(part, 0, 0);
  return out;
}

export function AiTools({ ed }: { ed: PictureEd }) {
  useEd(ed);
  const [mode, setModeState] = useState<AiMode | null>(null);
  const [tiers, setTiers] = useState<TiersInfo | null>(null);
  const [words, setWords] = useState('');
  const [shape, setShape] = useState('16:9');
  const [busy, setBusy] = useState<{ what: string; how: 'local' | 'cloud' } | null>(null);
  const [error, setError] = useState<{ text: string; local: boolean } | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [askKey, setAskKey] = useState<null | (() => void)>(null);
  const tools = useLocalTools(busy?.how === 'local');
  const stop = useRef<AbortController | null>(null);
  useEffect(() => {
    getTiers().then(setTiers, (e: Error) => setError({ text: e.message, local: false }));
    return () => stop.current?.abort();
  }, []);
  const ready = !!(tools.state ?? tiers?.local)?.ready;
  const sel = ed.doc.sel;
  const painted = ed.aiStrokes.some((s) => s.pts.length >= 2);
  const paints = mode === 'erase' || mode === 'change';

  const setMode = (m: AiMode | null) => {
    if (busy) return;
    setModeState(m);
    ed.aiStrokes = [];
    ed.aiPaint = (m === 'erase' || m === 'change') && !ed.doc.sel;
    setError(null);
    setAskKey(null);
    setDone(null);
    ed.emit(false);
  };
  // Asked from a menu (Select → Subject, AI → …): that tool, at once where it costs nothing.
  const asked = ed.aiAsk?.n;
  useEffect(() => {
    if (!ed.aiAsk) return;
    const m = ed.aiAsk.mode as AiMode;
    setMode(m);
    if (m === 'subject' && ready) void run('subject', 'local');
  }, [asked]); // eslint-disable-line react-hooks/exhaustive-deps
  // The brush is out only while the tool paints and nothing is selected.
  useEffect(() => {
    const want = paints && !sel;
    if (ed.aiPaint !== want) {
      ed.aiPaint = want;
      ed.emit(false);
    }
  }, [paints, sel, ed]);
  useEffect(
    () => () => {
      ed.aiPaint = false;
      ed.aiStrokes = [];
    },
    [ed],
  );

  /** The pixel layer the background and eraser tools work on: the picked one, or the topmost pixel layer. */
  const target = (): RasterLayer | null => ed.rasterActive() ?? ([...ed.doc.layers].reverse().find((l) => l.kind === 'raster') as RasterLayer | undefined) ?? null;

  const run = async (m: AiMode, how: 'local' | 'cloud', o: { keyed?: boolean; scale?: 2 | 4 } = {}) => {
    if (busy) return;
    const cloud = how === 'cloud';
    if (cloud && !o.keyed && tiers && !tiers.keySet) return setAskKey(() => () => void run(m, how, { ...o, keyed: true }));
    setAskKey(null);
    setError(null);
    setDone(null);
    const ctl = new AbortController();
    stop.current = ctl;
    const sig = ctl.signal;
    const what = { cutout: 'Taking the background out', erase: 'Erasing', change: 'Changing it: it takes a few seconds', expand: 'Drawing the new part: it takes a few seconds', upscale: 'Making it larger', subject: 'Finding the subject' }[m];
    setBusy({ what, how: cloud ? 'cloud' : 'local' });
    ed.busy = what;
    ed.emit(false);
    try {
      const doc = ed.doc;
      if (m === 'upscale') {
        const k = o.scale ?? 2;
        if (doc.w * k > LIMITS.side || doc.h * k > LIMITS.side || doc.w * k * doc.h * k > LIMITS.pixels) throw new Error(`Made ${k}× larger it would be ${doc.w * k} × ${doc.h * k} pixels: at most ${LIMITS.side} on a side and ${LIMITS.pixels / 1e6} million in all.`);
        const made = new Map<string, HTMLCanvasElement>();
        let model = 'Real-ESRGAN';
        for (const l of doc.layers) {
          if (l.kind !== 'raster') continue;
          const c = l.px.canvas;
          const src = seeThrough(c) ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.95);
          const r = await upscale({ src, scale: k }, sig);
          if (sig.aborted) return;
          model = r.model;
          const url = URL.createObjectURL(r.blob);
          try {
            const img = await new Promise<HTMLImageElement>((ok, fail) => {
              const i = new Image();
              i.onload = () => ok(i);
              i.onerror = () => fail(new Error('The larger picture could not be read'));
              i.src = url;
            });
            made.set(l.id, sized(img, img.naturalWidth, img.naturalHeight));
          } finally {
            URL.revokeObjectURL(url);
          }
        }
        ed.upscaled(k, made);
        setDone({ mode: m, how: 'local', model });
        return;
      }
      if (m === 'expand') {
        const full = flattenDoc(doc);
        const ex = EXPAND_SHAPES.find((s) => s.id === shape) ?? EXPAND_SHAPES[0];
        const ask = expansionAsk(full, ex.ratio, 2048);
        const src = await keepCanvas(ask.picture);
        const prompt = ['Extend this picture outward into the marked area so it carries on naturally: the same scene, light, colours and style, with nothing new in the middle of it.', words.trim() ? `In the new part: ${words.trim()}` : ''].filter(Boolean).join(' ');
        const r = await editImage({ src, prompt, mask: ask.mask, tier: 'best' }, sig);
        if (sig.aborted) return;
        const answer = await readKept(r.src);
        ed.expand(expansionResult(full, answer, ask.place), ask.place);
        setDone({ mode: m, how: r.how, model: r.model, cost: r.cost, why: whyOf(r) });
        return;
      }
      if (m === 'subject') {
        const full = flattenDoc(doc);
        const sent = await sendable(full);
        const r = await cutout({ src: sent.src, how: cloud ? 'ai' : 'local' }, sig);
        if (sig.aborted) return;
        const answer = sized(await readKept(r.src), doc.w, doc.h);
        const a = answer.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, doc.w, doc.h).data;
        const mk: Mask = { x: 0, y: 0, w: doc.w, h: doc.h, data: new Uint8Array(doc.w * doc.h) };
        for (let i = 0; i < mk.data.length; i++) mk.data[i] = a[i * 4 + 3];
        const t = trimMask(mk);
        if (!t) throw new Error('No subject was found in the picture.');
        ed.setSel(t, 'Select the subject');
        setDone({ mode: m, how: r.how, model: r.model, cost: r.cost, why: whyOf(r), ...(r.how === 'local' ? { again: () => void run('subject', 'cloud') } : {}) });
        return;
      }
      if (m === 'change') {
        const full = flattenDoc(doc);
        const sent = await sendable(full);
        const box = { x: 0, y: 0, w: doc.w, h: doc.h };
        const strokes = ed.aiStrokes;
        const mask = sel ? selMaskData(sel, box, sent.k) : strokes.length ? maskOf(strokes, full.width, full.height, sent.k) : undefined;
        const r = await editImage({ src: sent.src, prompt: words.trim(), mask, tier: 'best' }, sig);
        if (sig.aborted) return;
        const answer = await readKept(r.src);
        // Only the part changed, as a layer of its own over the picked one.
        const part = sel ? throughSel(null, answer, sel, box, doc.w, doc.h) : strokes.length ? putInPainted(canvasOf(doc.w, doc.h), answer, strokes) : sized(answer, doc.w, doc.h);
        ed.addMade(part, 'Changed with AI');
        ed.aiStrokes = [];
        setDone({ mode: m, how: r.how, model: r.model, cost: r.cost, why: whyOf(r) });
        return;
      }
      // Remove the background, Erase: on a pixel layer, at its whole size.
      const l = target();
      if (!l) throw new Error('There is no pixel layer to work on.');
      const full = l.px.canvas;
      const sent = await sendable(full);
      const box = { x: l.x, y: l.y, w: full.width, h: full.height };
      const strokes = ed.aiStrokes.map((s) => ({ size: s.size, pts: s.pts.map((v, i) => v - (i % 2 ? l.y : l.x)) }));
      const mask = m === 'erase' ? (sel ? selMaskData(sel, box, sent.k) : maskOf(strokes, full.width, full.height, sent.k)) : undefined;
      const r = m === 'cutout' ? await cutout({ src: sent.src, how: cloud ? 'ai' : 'local' }, sig) : await erase({ src: sent.src, mask: mask!, how: cloud ? 'ai' : 'local' }, sig);
      if (sig.aborted) return;
      const answer = await readKept(r.src);
      const near = Math.abs(answer.width / answer.height - full.width / full.height) < 0.02;
      const out = m === 'cutout' ? (near ? withAlphaOf(full, answer) : sized(answer, full.width, full.height)) : sel ? throughSel(full, answer, sel, box, full.width, full.height) : near ? putInPainted(full, answer, strokes) : sized(answer, full.width, full.height);
      ed.replacePixels(l.id, out, m === 'cutout' ? 'Remove the background' : 'Erase');
      ed.aiStrokes = [];
      setDone({ mode: m, how: r.how, model: r.model, cost: r.cost, why: whyOf(r), ...(r.how === 'local' ? { again: () => (ed.undo(), void run(m, 'cloud')) } : {}) });
    } catch (e) {
      const t = (e as Error).message;
      if (sig.aborted) return;
      if (cloud && needsKey(t)) setAskKey(() => () => void run(m, how, { ...o, keyed: true }));
      else setError({ text: t, local: !cloud });
    } finally {
      setBusy(null);
      ed.busy = null;
      ed.emit(false);
      void tools.refresh();
    }
  };

  const local = mode === 'cutout' || mode === 'erase' || mode === 'subject' ? (mode === 'subject' ? 'cutout' : mode) : null;
  const viaLocal = tiers && local ? toolPrice(tiers, local, 'local') : null;
  const viaCloud = tiers && local ? toolPrice(tiers, local, 'cloud') : null;
  const change = tiers ? changePrice(tiers) : null;
  const keyAsk = askKey && (
    <KeyAsk
      onSaved={() =>
        void getTiers().then(
          (t) => {
            setTiers(t);
            const go = askKey;
            setAskKey(null);
            if (t.keySet) go();
          },
          (e: Error) => setError({ text: e.message, local: false }),
        )
      }
      onSkip={() => setAskKey(null)}
    />
  );
  const brush = paints && !sel && (
    <div className="space-y-2">
      <SliderRow label="Brush" value={ed.aiBrush} min={8} max={160} step={2} zero={44} onChange={(v) => ((ed.aiBrush = v), ed.emit(false))} />
      <div className="flex items-center gap-1">
        <span className="min-w-0 flex-1 text-[12px] text-fg-3">{painted ? '' : mode === 'erase' ? 'Paint over what to take away, or select it.' : 'Paint over the part to change, or select it (or neither, for all of it).'}</span>
        <IconButton label="Undo the last stroke" size="sm" disabled={!ed.aiStrokes.length || !!busy} onClick={() => ((ed.aiStrokes = ed.aiStrokes.slice(0, -1)), ed.emit(false))}>
          <Undo2 size={14} />
        </IconButton>
        <IconButton label="Clear the paint" size="sm" disabled={!ed.aiStrokes.length || !!busy} onClick={() => ((ed.aiStrokes = []), ed.emit(false))}>
          <Trash2 size={14} />
        </IconButton>
      </div>
    </div>
  );
  const selLine = paints && sel && <p className="text-[12px] leading-snug text-fg-2">{mode === 'erase' ? 'What is selected is erased.' : 'Only what is selected changes.'}</p>;

  let body: ReactNode = null;
  if (mode === 'cutout' || mode === 'erase' || mode === 'subject') {
    const tool = mode;
    const blocked = mode === 'erase' && !painted && !sel;
    const label = mode === 'subject' ? 'Select the subject' : viaLocal?.button;
    body = (
      <>
        {selLine}
        {brush}
        {ready && viaLocal ? (
          <>
            <Button variant="primary" className="w-full" disabled={!!busy || blocked} onClick={() => void run(tool, 'local')}>
              {mode === 'subject' ? 'Select the subject (free)' : label}
            </Button>
            <PriceLine>{viaLocal.line}</PriceLine>
          </>
        ) : (
          tiers && (
            <>
              <LocalToolsCard tools={tools} />
              <Button variant="secondary" className="h-auto min-h-9 w-full py-1.5 whitespace-normal" disabled={!!busy || blocked || !!askKey} onClick={() => void run(tool, 'cloud')}>
                {insteadLine(tiers, local!)}
              </Button>
              {viaCloud && <PriceLine>{viaCloud.line}</PriceLine>}
            </>
          )
        )}
      </>
    );
  } else if (mode === 'change') {
    body = (
      <>
        <textarea
          value={words}
          rows={3}
          onChange={(e) => setWords(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
          disabled={!!busy}
          aria-label="What to change"
          placeholder="What to change: “make the sky a sunset”, “add a red scarf”, “take the cup away”"
          className="block w-full resize-none rounded-lg border border-line-2 bg-bg-1 px-2.5 py-2 text-[13px] leading-relaxed text-fg outline-none placeholder:text-fg-3 focus:border-accent/60"
        />
        {selLine}
        {brush}
        <Button variant="primary" className="w-full" disabled={!!busy || !words.trim() || !tiers} onClick={() => void run('change', 'cloud')}>
          {change?.button ?? 'Change it'}
        </Button>
        {change && <PriceLine>{change.line}</PriceLine>}
      </>
    );
  } else if (mode === 'expand') {
    body = (
      <>
        <div className="grid grid-cols-3 gap-1">
          {EXPAND_SHAPES.map((s) => (
            <button key={s.id} type="button" onClick={() => setShape(s.id)} aria-pressed={shape === s.id} disabled={!!busy} className={cx('h-7 rounded-md border text-[12px]', shape === s.id ? 'border-accent bg-accent-soft text-fg' : 'border-line text-fg-2 hover:bg-bg-2')}>
              {s.label}
            </button>
          ))}
        </div>
        <input
          value={words}
          onChange={(e) => setWords(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
          disabled={!!busy}
          aria-label="What to put in the new part"
          placeholder="In the new part (if you like): “more beach”"
          className="h-8 w-full rounded-lg border border-line-2 bg-bg-1 px-2.5 text-[13px] outline-none placeholder:text-fg-3 focus:border-accent/60"
        />
        <Button variant="primary" className="w-full" disabled={!!busy || !tiers} onClick={() => void run('expand', 'cloud')}>
          {change?.cost != null ? `Expand it (about ${money(change.cost)})` : 'Expand it'}
        </Button>
        {change && <PriceLine>{change.line}</PriceLine>}
      </>
    );
  } else if (mode === 'upscale') {
    const d = ed.doc;
    const fits = (k: number) => d.w * k <= LIMITS.side && d.h * k <= LIMITS.side && d.w * k * d.h * k <= LIMITS.pixels;
    const first = !(tools.state ?? tiers?.local)?.downloaded.includes('upscale');
    body = ready ? (
      <>
        <div className="grid grid-cols-2 gap-1.5">
          {([2, 4] as const).map((k) => (
            <Button key={k} variant={k === 2 ? 'primary' : 'secondary'} disabled={!!busy || !fits(k)} onClick={() => void run('upscale', 'local', { scale: k })}>
              {k === 2 ? 'Make it 2× larger (free)' : 'Make it 4× larger (free)'}
            </Button>
          ))}
        </div>
        <PriceLine>{`${d.w * 2} × ${d.h * 2} or ${d.w * 4} × ${d.h * 4} pixels, on this computer, for nothing. ${first ? 'The first time, it downloads its model (about 5 MB).' : ''}`}</PriceLine>
        {!fits(2) && <p className="text-[12px] leading-snug text-fg-3">{`The picture is too large to make larger: at most ${LIMITS.side} pixels a side and ${LIMITS.pixels / 1e6} million in all. Crop it first.`}</p>}
      </>
    ) : (
      <LocalToolsCard tools={tools} />
    );
  }

  return (
    <div className="space-y-2.5 p-3">
      <div className="space-y-1">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMode(mode === m.id ? null : m.id)}
            aria-pressed={mode === m.id}
            disabled={!!busy && mode !== m.id}
            className={cx('flex w-full items-start gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors disabled:opacity-50', mode === m.id ? 'border-accent bg-accent-soft' : 'border-line hover:bg-bg-2')}
          >
            <span className={cx('mt-0.5 shrink-0', mode === m.id ? 'text-accent' : 'text-fg-3')}>{m.icon}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium text-fg">{m.label}</span>
              <span className="block text-[11.5px] leading-snug text-fg-3">{m.line}</span>
            </span>
          </button>
        ))}
      </div>
      {mode && <div className="space-y-2.5 border-t border-line pt-2.5">{body}</div>}
      {keyAsk}
      {busy && (
        <div className="flex items-center gap-2">
          <Working className="min-w-0 flex-1">{busy.how === 'local' && tools.state?.step ? tools.state.step : busy.what}</Working>
          <Button size="sm" variant="ghost" onClick={() => stop.current?.abort()}>
            Stop
          </Button>
        </div>
      )}
      {error && (
        <Problem error={error.text} onLeave={() => {}}>
          {error.local && tiers && local && (
            <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => void run(mode!, 'cloud')}>
              {insteadLine(tiers, local)}
            </Button>
          )}
        </Problem>
      )}
      {done && !busy && (
        <div className="space-y-2 rounded-lg border border-line bg-bg-1 px-2.5 py-2">
          <p className="text-[12px] leading-snug text-fg-2">{done.how === 'local' ? 'Done on this computer, for nothing. Undo takes it back.' : `${madeWith(tiers, done.model, done.cost)}. Undo takes it back.`}</p>
          {done.why && <p className="text-[11.5px] leading-snug text-fg-3">{done.why}</p>}
          {done.again && tiers && (done.mode === 'cutout' || done.mode === 'erase' || done.mode === 'subject') && (
            <Button size="sm" variant="secondary" disabled={!!askKey} onClick={done.again}>
              {aiInsteadButton(tiers, done.mode === 'subject' ? 'cutout' : done.mode)}
            </Button>
          )}
        </div>
      )}
      {!mode && <p className="text-[11.5px] leading-snug text-fg-3">{`Pictures go to the AI tools at most ${SEND_SIDE} pixels across; what comes back is put into yours at its whole size.`}</p>}
    </div>
  );
}

export { Seg };
