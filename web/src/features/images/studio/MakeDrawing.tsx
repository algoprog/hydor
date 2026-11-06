// A drawing (SVG): what to draw (a few examples to start from), what it is, its shape, the colours to draw with (the
// deck's or the document's, each one changed with a click, more added, any taken away), and how: Quick, written as SVG
// by Claude (or the helper model), or Best, drawn by a vector model through OpenRouter, priced. The drawing is shown
// as a picture (never as the app's own markup), then Draw again or Use it. Best without an OpenRouter key asks for it in
// place (KeyAsk), with Quick, which needs none, beside it.
import { useEffect, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import type { DrawingKind, ImageTier, SvgAnswer, TiersInfo } from '@shared/images';
import { Button, Dialog, Segmented } from '../../../components/ui';
import { getTiers, makeSvg } from './api';
import { KeyAsk } from './KeyAsk';
import { DEFAULT_COLORS, DRAWING_KINDS, drawingPrice, drawingTier, money, needsKey, SHAPES } from './logic';
import { Choice, Label, PriceLine, Problem, ShapeMark, Shown, Words, Working } from './parts';
import { shownSrc } from './pictures';
import type { DrawingOpts, MadeDrawing } from './store';

const shapeFor = (k: DrawingKind) => (k === 'illustration' ? '3:2' : k === 'diagram' ? '16:9' : '1:1');
const HEX = /^#[0-9a-f]{6}$/i;
/** #abc as #aabbcc, which a colour box takes. */
const long = (c: string) => (/^#[0-9a-f]{3}$/i.test(c) ? `#${[...c.slice(1)].map((x) => x + x).join('')}` : c.slice(0, 7));

export function MakeDrawing({ o, onDone }: { o: DrawingOpts; onDone: (d: MadeDrawing | null) => void }) {
  const given = (o.colors ?? [])
    .map(long)
    .filter((c) => HEX.test(c))
    .slice(0, 6);
  const [prompt, setPrompt] = useState(o.prompt ?? '');
  const [kind, setKind] = useState<DrawingKind>(o.kind ?? 'icon');
  const [aspect, setAspect] = useState(o.aspect ?? shapeFor(o.kind ?? 'icon'));
  const [aspectSet, setAspectSet] = useState(!!o.aspect);
  const [colors, setColors] = useState<string[]>(given.length ? given : DEFAULT_COLORS);
  // Picked, or (null) as the kind and the words call for: Best for illustrations and detailed asks.
  const [picked, setPicked] = useState<ImageTier | null>(null);
  const [tiers, setTiers] = useState<TiersInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<SvgAnswer | null>(null);
  // Best was pressed with no OpenRouter key: it is asked for here.
  const [askKey, setAskKey] = useState(false);
  const stop = useRef(new AbortController());

  useEffect(() => {
    getTiers().then(setTiers, (e: Error) => setError(e.message));
    const c = stop.current;
    return () => c.abort();
  }, []);

  const info = DRAWING_KINDS.find((k) => k.value === kind) ?? DRAWING_KINDS[0];
  const tier = picked ?? drawingTier('auto', { prompt, kind });
  const price = tiers ? drawingPrice(tiers, tier) : null;
  const shapes = [...(o.aspect && !SHAPES.some((s) => s.value === o.aspect) ? [{ value: o.aspect, label: `As where it goes (${o.aspect})` }] : []), ...SHAPES].map((s) => ({ ...s, icon: <ShapeMark aspect={s.value} /> }));

  /** Draws it, at the tier shown or the one given (`keyed`: the key was just saved, so the tiers read before are out of date). */
  const draw = async (o: { tier?: ImageTier; keyed?: boolean } = {}) => {
    const t = o.tier ?? tier;
    if (!prompt.trim() || busy) return;
    setError(null);
    if (t === 'best' && !o.keyed && tiers && !tiers.keySet) return setAskKey(true);
    setAskKey(false);
    setBusy(true);
    try {
      const r = await makeSvg({ prompt: prompt.trim(), kind, aspect, tier: t, colors }, stop.current.signal);
      setMade(r);
    } catch (e) {
      const m = (e as Error).message;
      if (!stop.current.signal.aborted) t === 'best' && needsKey(m) ? setAskKey(true) : setError(m);
    } finally {
      setBusy(false);
    }
  };

  const footer = made ? (
    <>
      <Button variant="secondary" disabled={busy || askKey} onClick={() => void draw()}>
        {busy ? 'Drawing it' : (price?.again ?? 'Draw again')}
      </Button>
      <Button variant="primary" disabled={busy} onClick={() => onDone({ src: made.src, w: made.w, h: made.h, mime: made.mime, svg: made.svg, prompt: prompt.trim() })}>
        Use it
      </Button>
    </>
  ) : (
    <>
      <Button variant="ghost" onClick={() => onDone(null)}>
        Cancel
      </Button>
      <Button variant="primary" disabled={busy || askKey || !prompt.trim() || !tiers} onClick={() => void draw()}>
        {busy ? 'Drawing it' : (price?.button ?? 'Draw it')}
      </Button>
    </>
  );

  const keyAsk = askKey && (
    <KeyAsk
      onSaved={() =>
        void getTiers().then(
          (t) => {
            setTiers(t);
            if (t.keySet) void draw({ tier: 'best', keyed: true });
          },
          (e: Error) => setError(e.message),
        )
      }
      onSkip={() => {
        setAskKey(false);
        setPicked('quick');
      }}
      instead={{
        label: 'Draw it Quick',
        run: () => {
          setPicked('quick');
          void draw({ tier: 'quick' });
        },
      }}
    />
  );

  return (
    <Dialog open onClose={() => onDone(null)} title="A drawing (SVG)" width={560} footer={footer}>
      {made ? (
        <div className="space-y-2.5">
          <Shown src={shownSrc(made.src)} alt={prompt} className="max-h-[46dvh] min-h-32 min-w-32" />
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-[12.5px] text-fg-3">
            <span translate="no">{made.cost != null ? `${made.model}: ${money(made.cost)}` : made.model}</span>
            <button type="button" disabled={busy} className="text-accent hover:underline disabled:opacity-50" onClick={() => setMade(null)}>
              Change the words
            </button>
          </div>
          {busy && <Working>Drawing it again</Working>}
          {error && <Problem error={error} onLeave={() => onDone(null)} />}
          {keyAsk}
        </div>
      ) : (
        <div className="space-y-3">
          <Words value={prompt} onChange={setPrompt} label="What to draw" placeholder="Describe the drawing: what is in it, and how simple" examples={info.examples} disabled={busy} />
          <div className="-mx-2 flex flex-wrap items-center gap-x-0.5 gap-y-0.5">
            <Choice
              label="What it is"
              value={kind}
              options={DRAWING_KINDS.map((k) => ({ value: k.value, label: k.label, hint: k.hint }))}
              onChange={(k) => {
                setKind(k);
                if (!aspectSet) setAspect(shapeFor(k));
              }}
              width={280}
              disabled={busy}
            />
            <Choice
              label="Shape"
              value={aspect}
              shown={SHAPES.find((s) => s.value === aspect)?.label ?? aspect}
              options={shapes}
              onChange={(a) => {
                setAspect(a);
                setAspectSet(true);
              }}
              width={240}
              disabled={busy}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Colours</Label>
            <div className="flex flex-wrap items-center gap-2">
              {colors.map((c, i) => (
                <span key={i} className="relative">
                  <label className="block h-8 w-8 cursor-pointer rounded-full border border-black/15 shadow-sm" style={{ background: c }} title={c}>
                    <input type="color" value={c} disabled={busy} onChange={(e) => setColors((l) => l.map((x, j) => (j === i ? e.target.value : x)))} aria-label="Change this colour" className="sr-only" />
                  </label>
                  {colors.length > 1 && (
                    <button
                      type="button"
                      aria-label="Take this colour away"
                      title="Take this colour away"
                      disabled={busy}
                      onClick={() => setColors((l) => l.filter((_, j) => j !== i))}
                      className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border border-line bg-elevated text-fg-3 shadow-sm hover:text-fg"
                    >
                      <X size={10} />
                    </button>
                  )}
                </span>
              ))}
              {colors.length < 6 && (
                <label className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-dashed border-line-2 text-fg-3 hover:bg-bg-2 hover:text-fg" title="Another colour">
                  <Plus size={14} />
                  <input type="color" value="#888888" disabled={busy} onChange={(e) => setColors((l) => [...l, e.target.value])} aria-label="Another colour" className="sr-only" />
                </label>
              )}
              {given.length > 0 && colors.join() !== given.join() && (
                <button type="button" disabled={busy} className="text-[12.5px] text-accent hover:underline" onClick={() => setColors(given)}>
                  Back to the colours it had
                </button>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              size="sm"
              value={tier}
              onChange={setPicked}
              options={[
                { value: 'quick', label: 'Quick' },
                { value: 'best', label: 'Best' },
              ]}
            />
            <span className="text-[12.5px] text-fg-3">{tier === 'quick' ? `Written as SVG by ${tiers?.writer ?? 'Claude'}` : `Drawn by ${tiers?.vector.label ?? 'a vector model'}`}</span>
          </div>
          {error && <Problem error={error} onLeave={() => onDone(null)} />}
          {keyAsk || (busy ? <Working>{tier === 'quick' ? 'Drawing it: this takes up to a minute' : 'Drawing it: it takes a few seconds'}</Working> : price && <PriceLine>{price.line}</PriceLine>)}
        </div>
      )}
    </Dialog>
  );
}
