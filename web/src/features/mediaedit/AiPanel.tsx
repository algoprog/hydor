// The picture editor's AI tools: Remove the background, Erase (paint over what to take away), Change with AI (words,
// and only where painted if some is) and Expand the picture (to a new shape, the new part drawn by AI). Taking the
// background out and erasing run on this computer for nothing once the picture tools are set up (their card offers
// it, with OpenRouter as the other way, priced); a result made here can be done again by AI (Do it with AI instead).
// What goes through OpenRouter with no key set asks for it in place, and skipped, runs nothing. Each result goes into
// the picture at its whole size (ai.ts), one step to undo; the marks stay on top, still movable.
import { useEffect, useRef, useState } from 'react';
import { Eraser, Expand, Scissors, Sparkles, Trash2, Undo2 } from 'lucide-react';
import type { PictureAnswer, TiersInfo } from '@shared/images';
import { Button, cx, IconButton, Switch } from '../../components/ui';
import { cutout, editImage, erase, getTiers } from '../images/studio/api';
import { KeyAsk } from '../images/studio/KeyAsk';
import { LocalToolsCard, useLocalTools } from '../images/studio/LocalTools';
import { aiInsteadButton, changePrice, insteadLine, madeWith, money, needsKey, toolPrice } from '../images/studio/logic';
import { PriceLine, Problem, Working } from '../images/studio/parts';
import { expansionAsk, expansionResult, keepCanvas, maskOf, putInPainted, readKept, sendable, SEND_SIDE, withAlphaOf } from './ai';
import { Group, Slider } from './panels';
import type { Stroke } from './PictureView';

export type AiMode = 'cutout' | 'erase' | 'change' | 'expand';

const MODES: { id: AiMode; label: string; line: string; icon: React.ReactNode }[] = [
  { id: 'cutout', label: 'Remove the background', line: 'Keeps what the picture is of, on a see-through background.', icon: <Scissors size={16} /> },
  { id: 'erase', label: 'Erase', line: 'Paint over something to take it away; what is around it fills the gap.', icon: <Eraser size={16} /> },
  { id: 'change', label: 'Change with AI', line: 'Say what to change, everywhere or only where you paint.', icon: <Sparkles size={16} /> },
  { id: 'expand', label: 'Expand the picture', line: 'A wider or taller picture, the new part drawn by AI.', icon: <Expand size={16} /> },
];

const EXPAND_SHAPES: { id: string; label: string; ratio: number | 'all' }[] = [
  { id: '16:9', label: '16:9', ratio: 16 / 9 },
  { id: '4:3', label: '4:3', ratio: 4 / 3 },
  { id: '1:1', label: 'Square (1:1)', ratio: 1 },
  { id: '4:5', label: '4:5', ratio: 4 / 5 },
  { id: '9:16', label: '9:16', ratio: 9 / 16 },
  { id: 'all', label: 'All round', ratio: 'all' },
];

/** What the editor lends the AI tools: the picture as it is now (at its whole size, without its marks), and a way to put a result in. */
export interface AiHost {
  flat(): HTMLCanvasElement;
  /** A result at the whole size; `place`: where the picture before it sits in it (an expansion), else at the same place and size. */
  apply(c: HTMLCanvasElement, o?: { place?: { x: number; y: number } }): void;
}

interface Done {
  mode: AiMode;
  how: PictureAnswer['how'];
  model?: string;
  cost?: number;
  why?: string;
  /** To do it again by AI: what was sent, and the picture it was made from. */
  again?: { full: HTMLCanvasElement; sent: { src: string; w: number; h: number; k: number }; strokes: Stroke[] };
}

/** What the AI tools keep while the editor shows them: the tool picked, the paint, the brush's size. */
export function useAiTools() {
  const [mode, setMode] = useState<AiMode | null>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [brush, setBrush] = useState(44);
  const [part, setPart] = useState(false);
  const painting = mode === 'erase' || (mode === 'change' && part);
  return { mode, setMode, strokes, setStrokes, brush, setBrush, part, setPart, painting };
}
export type AiTools = ReturnType<typeof useAiTools>;

const whyOf = (r: PictureAnswer & { why?: unknown; note?: unknown }) => (typeof r.why === 'string' && r.why.trim() ? r.why : typeof r.note === 'string' && r.note.trim() ? r.note : undefined);

export function AiPanel({ ai, host, onBusy }: { ai: AiTools; host: AiHost; onBusy: (busy: boolean) => void }) {
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
  useEffect(() => {
    onBusy(!!busy);
  }, [busy, onBusy]);
  const ready = !!(tools.state ?? tiers?.local)?.ready;
  const { mode, strokes } = ai;
  const painted = strokes.some((s) => s.pts.length >= 2);

  /** Runs a tool: here or through OpenRouter (asking for the key first, when that needs one and none is set). */
  const run = async (m: AiMode, how: 'local' | 'cloud', o: { keyed?: boolean; again?: Done['again'] } = {}) => {
    if (busy) return;
    const cloud = how === 'cloud';
    if (cloud && !o.keyed && tiers && !tiers.keySet) return setAskKey(() => () => void run(m, how, { ...o, keyed: true }));
    setAskKey(null);
    setError(null);
    const ctl = new AbortController();
    stop.current = ctl;
    const sig = ctl.signal;
    setBusy({ what: m === 'cutout' ? 'Taking the background out' : m === 'erase' ? 'Erasing' : m === 'change' ? 'Changing it: it takes a few seconds' : 'Drawing the new part: it takes a few seconds', how: cloud ? 'cloud' : 'local' });
    try {
      const full = o.again?.full ?? host.flat();
      const paint = o.again?.strokes ?? strokes;
      if (m === 'expand') {
        const ex = EXPAND_SHAPES.find((s) => s.id === shape) ?? EXPAND_SHAPES[0];
        const ask = expansionAsk(full, ex.ratio, 2048);
        const src = await keepCanvas(ask.picture);
        const prompt = ['Extend this picture outward into the marked area so it carries on naturally: the same scene, light, colours and style, with nothing new in the middle of it.', words.trim() ? `In the new part: ${words.trim()}` : '']
          .filter(Boolean)
          .join(' ');
        const r = await editImage({ src, prompt, mask: ask.mask, tier: 'best' }, sig);
        if (sig.aborted) return;
        const answer = await readKept(r.src);
        host.apply(expansionResult(full, answer, ask.place), { place: ask.place });
        ai.setStrokes([]);
        setDone({ mode: m, how: r.how, model: r.model, cost: r.cost, why: whyOf(r) });
        return;
      }
      const sent = o.again?.sent ?? (await sendable(full));
      const mask = (m === 'erase' || (m === 'change' && ai.part)) && paint.length ? maskOf(paint, full.width, full.height, sent.k) : undefined;
      const r =
        m === 'cutout'
          ? await cutout({ src: sent.src, how: cloud ? 'ai' : 'local' }, sig)
          : m === 'erase'
            ? await erase({ src: sent.src, mask: mask!, how: cloud ? 'ai' : 'local' }, sig)
            : await editImage({ src: sent.src, prompt: words.trim(), mask, tier: 'best' }, sig);
      if (sig.aborted) return;
      const answer = await readKept(r.src);
      // The answer at the picture's whole size: only its see-through parts, or only where it was painted.
      const near = Math.abs(answer.width / answer.height - full.width / full.height) < 0.02;
      const out = m === 'cutout' && near ? withAlphaOf(full, answer) : mask && near ? putInPainted(full, answer, paint) : answer;
      host.apply(out);
      ai.setStrokes([]);
      setDone({ mode: m, how: r.how, model: r.model, cost: r.cost, why: whyOf(r), ...(r.how === 'local' && (m === 'cutout' || m === 'erase') ? { again: { full, sent, strokes: paint } } : {}) });
    } catch (e) {
      const t = (e as Error).message;
      if (sig.aborted) return;
      if (cloud && needsKey(t)) setAskKey(() => () => void run(m, how, { ...o, keyed: true }));
      else setError({ text: t, local: !cloud });
    } finally {
      setBusy(null);
      void tools.refresh();
    }
  };

  const local = mode === 'cutout' || mode === 'erase' ? mode : null;
  const viaLocal = tiers && local ? toolPrice(tiers, local, 'local') : null;
  const viaCloud = tiers && local ? toolPrice(tiers, local, 'cloud') : null;
  const change = tiers ? changePrice(tiers) : null;
  const pick = (m: AiMode) => {
    if (busy) return;
    ai.setMode(mode === m ? null : m);
    ai.setStrokes([]);
    setError(null);
    setAskKey(null);
    setDone(null);
  };

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

  const brush = ai.painting && (
    <div className="space-y-2">
      <Slider label="Brush" value={ai.brush} min={8} max={160} step={2} zero={44} onChange={ai.setBrush} />
      <div className="flex items-center gap-1">
        <span className="min-w-0 flex-1 text-[12.5px] text-fg-3">{painted ? '' : mode === 'erase' ? 'Paint over what to take away.' : 'Paint over the part to change.'}</span>
        <IconButton label="Undo the last stroke" size="sm" disabled={!strokes.length || !!busy} onClick={() => ai.setStrokes(strokes.slice(0, -1))}>
          <Undo2 size={15} />
        </IconButton>
        <IconButton label="Clear the paint" size="sm" disabled={!strokes.length || !!busy} onClick={() => ai.setStrokes([])}>
          <Trash2 size={15} />
        </IconButton>
      </div>
    </div>
  );

  let body: React.ReactNode = null;
  if (mode === 'cutout' || mode === 'erase') {
    const tool = mode;
    const blocked = mode === 'erase' && !painted;
    body = (
      <>
        {brush}
        {ready && viaLocal ? (
          <>
            <Button variant="primary" className="w-full" disabled={!!busy || blocked} onClick={() => void run(tool, 'local')}>
              {viaLocal.button}
            </Button>
            <PriceLine>{viaLocal.line}</PriceLine>
          </>
        ) : (
          tiers && (
            <>
              <LocalToolsCard tools={tools} />
              {/* The other way, under the card: its words wrap in a narrow panel. */}
              <Button variant="secondary" className="h-auto min-h-9 w-full py-1.5 whitespace-normal" disabled={!!busy || blocked || !!askKey} onClick={() => void run(tool, 'cloud')}>
                {insteadLine(tiers, tool)}
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
          disabled={!!busy}
          aria-label="What to change"
          placeholder="What to change: “make the sky a sunset”, “add a red scarf”, “take the cup away”"
          className="block w-full resize-none rounded-xl border border-line-2 bg-bg-1 px-3 py-2 text-[13.5px] leading-relaxed text-fg outline-none placeholder:text-fg-3 focus:border-accent/60 focus:ring-3 focus:ring-accent/15"
        />
        <label className="flex items-center gap-2.5 text-[13px] text-fg-2">
          <Switch on={ai.part} onChange={(v) => (ai.setPart(v), ai.setStrokes([]))} label="Only where I paint" disabled={!!busy} />
          Only where I paint
        </label>
        {brush}
        <Button variant="primary" className="w-full" disabled={!!busy || !words.trim() || (ai.part && !painted) || !tiers} onClick={() => void run('change', 'cloud')}>
          {change?.button ?? 'Change it'}
        </Button>
        {change && <PriceLine>{change.line}</PriceLine>}
      </>
    );
  } else if (mode === 'expand') {
    body = (
      <>
        <Group title="To">
          <div className="grid grid-cols-3 gap-1.5">
            {EXPAND_SHAPES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setShape(s.id)}
                aria-pressed={shape === s.id}
                disabled={!!busy}
                className={cx('h-8 rounded-lg border text-[12.5px]', shape === s.id ? 'border-accent bg-accent-soft text-fg' : 'border-line text-fg-2 hover:bg-bg-2')}
              >
                {s.label}
              </button>
            ))}
          </div>
        </Group>
        <input
          value={words}
          onChange={(e) => setWords(e.target.value)}
          disabled={!!busy}
          aria-label="What to put in the new part"
          placeholder="In the new part (if you like): “more beach”, “a clear sky”"
          className="h-9 w-full rounded-[10px] border border-line-2 bg-bg-1 px-3 text-[13.5px] outline-none placeholder:text-fg-3 focus:border-accent/60 focus:ring-3 focus:ring-accent/15"
        />
        <Button variant="primary" className="w-full" disabled={!!busy || !tiers} onClick={() => void run('expand', 'cloud')}>
          {change?.cost != null ? `Expand it (about ${money(change.cost)})` : 'Expand it'}
        </Button>
        {change && <PriceLine>{change.line}</PriceLine>}
      </>
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => pick(m.id)}
            aria-pressed={mode === m.id}
            disabled={!!busy && mode !== m.id}
            className={cx('flex w-full items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors disabled:opacity-50', mode === m.id ? 'border-accent bg-accent-soft' : 'border-line hover:bg-bg-2')}
          >
            <span className={cx('mt-0.5 shrink-0', mode === m.id ? 'text-accent' : 'text-fg-3')}>{m.icon}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-medium text-fg">{m.label}</span>
              <span className="block text-[12px] leading-snug text-fg-3">{m.line}</span>
            </span>
          </button>
        ))}
      </div>
      {mode && <div className="space-y-3 border-t border-line pt-3">{body}</div>}
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
            <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => void run(local, 'cloud')}>
              {insteadLine(tiers, local)}
            </Button>
          )}
        </Problem>
      )}
      {done && !busy && (
        <div className="space-y-2 rounded-xl border border-line bg-bg-1 px-3 py-2.5">
          <p className="text-[12.5px] leading-snug text-fg-2">{done.how === 'local' ? 'Done on this computer, for nothing. Undo takes it back.' : `${madeWith(tiers, done.model, done.cost)}. Undo takes it back.`}</p>
          {done.why && <p className="text-[12px] leading-snug text-fg-3">{done.why}</p>}
          {done.again && tiers && (done.mode === 'cutout' || done.mode === 'erase') && (
            <Button size="sm" variant="secondary" disabled={!!askKey} onClick={() => void run(done.mode, 'cloud', { again: done.again })}>
              {aiInsteadButton(tiers, done.mode)}
            </Button>
          )}
        </div>
      )}
      {!mode && <p className="text-[12px] leading-snug text-fg-3">{`Pictures go to the AI tools at most ${SEND_SIDE} pixels across; what comes back is put into yours at its whole size.`}</p>}
    </div>
  );
}
