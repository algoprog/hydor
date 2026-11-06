// Make a picture with AI: what to make (a few examples to start from), what it is for, a look, its shape (the one of
// where it goes, else one picked), Quick or Best (Auto says which it would use), a see-through background for icons
// and logos, how many (one to four), the colours around it and the picture picked to follow; what it would cost,
// before anything is spent; then the pictures made, to pick one, make them again, or use it. Without an OpenRouter
// key, pressing Make asks for it in place (KeyAsk), offering a drawing instead, which needs none.
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { MakeImageAnswer, PictureKind, TierChoice, TiersInfo } from '@shared/images';
import { Button, cx, Dialog, Switch } from '../../../components/ui';
import { tr } from '../../../i18n/runtime';
import { getTiers, makeImages } from './api';
import { drawingKindOf, LOOKS, madeWith, needsKey, PICTURE_KINDS, picturePrice, pictureTier, SHAPES } from './logic';
import { KeyAsk } from './KeyAsk';
import { Choice, PriceLine, Problem, ShapeMark, Shown, Words, Working, type Option } from './parts';
import { shownSrc } from './pictures';
import type { DrawingOpts, MadeFromWords, PictureOpts } from './store';

/** Kinds whose pictures usually want a see-through background. */
const SEE_THROUGH: PictureKind[] = ['icon', 'logo'];
const shapeFor = (k: PictureKind) => (k === 'icon' || k === 'logo' || k === 'texture' ? '1:1' : k === 'background' ? '16:9' : '3:2');
const tierName = (t: 'quick' | 'best') => (t === 'quick' ? 'Quick' : 'Best');

export function MakePicture({ o, onDone, onDraw }: { o: PictureOpts; onDone: (p: MadeFromWords | null) => void; onDraw?: (d: DrawingOpts) => void }) {
  const [prompt, setPrompt] = useState(o.prompt ?? '');
  const [kind, setKind] = useState<PictureKind>(o.kind ?? 'picture');
  const [look, setLook] = useState('');
  const [aspect, setAspect] = useState(o.aspect ?? shapeFor(o.kind ?? 'picture'));
  const [aspectSet, setAspectSet] = useState(!!o.aspect);
  const [choice, setChoice] = useState<TierChoice>('auto');
  // null: as the kind says (on for icons and logos).
  const [clear, setClear] = useState<boolean | null>(o.transparent ?? null);
  const [count, setCount] = useState(1);
  const [refs, setRefs] = useState<string[]>(o.refs ?? []);
  const themeColors = o.theme?.colors.filter((c) => /^#[0-9a-f]{3,8}$/i.test(c)).slice(0, 6) ?? [];
  const [inColours, setInColours] = useState(themeColors.length > 0);
  const [tiers, setTiers] = useState<TiersInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<MakeImageAnswer | null>(null);
  const [pick, setPick] = useState(0);
  // Make was pressed with no OpenRouter key: it is asked for here.
  const [askKey, setAskKey] = useState(false);
  const stop = useRef(new AbortController());

  useEffect(() => {
    getTiers().then(setTiers, (e: Error) => setError(e.message));
    const c = stop.current;
    return () => c.abort();
  }, []);

  const info = PICTURE_KINDS.find((k) => k.value === kind) ?? PICTURE_KINDS[0];
  const canClear = SEE_THROUGH.includes(kind) || o.transparent !== undefined;
  const transparent = canClear && (clear ?? SEE_THROUGH.includes(kind));
  const tier = pictureTier(choice, { prompt, kind, refs: refs.length });
  const price = tiers ? picturePrice(tiers, { tier, count, transparent }) : null;

  const shapes: Option<string>[] = [
    ...(o.aspect && !SHAPES.some((s) => s.value === o.aspect) ? [{ value: o.aspect, label: `As where it goes (${o.aspect})` }] : []),
    ...SHAPES.map((s) => ({ ...s, label: s.value === o.aspect ? `${tr(s.label)}, as where it goes` : s.label })),
  ].map((s) => ({ ...s, icon: <ShapeMark aspect={s.value} /> }));
  const shapeShown = SHAPES.find((s) => s.value === aspect)?.label ?? aspect;

  /** Makes them (`keyed`: the key was just saved, so the tiers read before are out of date). */
  const make = async (keyed = false) => {
    if (!prompt.trim() || busy || price?.blocked) return;
    setError(null);
    if (!keyed && tiers && !tiers.keySet) return setAskKey(true);
    setAskKey(false);
    setBusy(true);
    try {
      const r = await makeImages(
        { prompt: prompt.trim(), kind, style: look || undefined, colors: inColours && themeColors.length ? themeColors : undefined, aspect, tier, transparent: transparent || undefined, count, refs: refs.length ? refs : undefined },
        stop.current.signal,
      );
      if (!r.pictures?.length) throw new Error('The model made no picture this time: try other words, or Best');
      setMade(r);
      setPick(0);
    } catch (e) {
      const m = (e as Error).message;
      if (!stop.current.signal.aborted) needsKey(m) ? setAskKey(true) : setError(m);
    } finally {
      setBusy(false);
    }
  };

  const footer = made ? (
    <>
      <Button variant="secondary" disabled={busy || askKey} onClick={() => void make()}>
        {busy ? 'Making them' : (price?.again ?? 'Make again')}
      </Button>
      <Button variant="primary" disabled={busy} onClick={() => onDone({ ...(made.pictures[pick] ?? made.pictures[0]), prompt: prompt.trim() })}>
        Use this one
      </Button>
    </>
  ) : (
    <>
      <Button variant="ghost" onClick={() => onDone(null)}>
        Cancel
      </Button>
      <Button variant="primary" disabled={busy || askKey || !prompt.trim() || !tiers || !!price?.blocked} onClick={() => void make()}>
        {busy ? 'Making it' : (price?.button ?? 'Make it')}
      </Button>
    </>
  );

  const keyAsk = askKey && (
    <KeyAsk
      onSaved={() =>
        void getTiers().then(
          (t) => {
            setTiers(t);
            if (t.keySet) void make(true);
          },
          (e: Error) => setError(e.message),
        )
      }
      onSkip={() => onDone(null)}
      instead={onDraw ? { label: 'Draw it instead (SVG)', run: () => onDraw({ prompt: prompt.trim(), kind: drawingKindOf(kind), aspect }) } : undefined}
    />
  );

  return (
    <Dialog open onClose={() => onDone(null)} title="Make a picture with AI" width={580} footer={footer}>
      {made ? (
        <div className="space-y-2.5">
          <div className={cx('grid gap-2', made.pictures.length > 1 && 'grid-cols-2')}>
            {made.pictures.map((p, i) => (
              <Shown
                key={p.src}
                src={shownSrc(p.src)}
                alt={prompt}
                picked={made.pictures.length > 1 && i === pick}
                onClick={made.pictures.length > 1 ? () => setPick(i) : undefined}
                className={made.pictures.length > 1 ? 'max-h-[26dvh]' : 'max-h-[48dvh]'}
              />
            ))}
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-[12.5px] text-fg-3">
            <span>
              {madeWith(tiers, made.model, made.cost)}
              {made.cutout && <> · {made.pictures.length > 1 ? 'Their backgrounds were taken out on this computer' : 'Its background was taken out on this computer'}</>}
            </span>
            <button type="button" disabled={busy} className="text-accent hover:underline disabled:opacity-50" onClick={() => setMade(null)}>
              Change the words
            </button>
          </div>
          {made.text && (
            <p translate="no" className="text-[12.5px] leading-snug text-fg-2">
              {made.text}
            </p>
          )}
          {busy && <Working>Making them again</Working>}
          {error && <Problem error={error} onLeave={() => onDone(null)} />}
          {keyAsk}
        </div>
      ) : (
        <div className="space-y-3">
          <Words value={prompt} onChange={setPrompt} label="What to make" placeholder="Describe the picture: what is in it, the mood, the colours" examples={info.examples} disabled={busy} />
          <div className="-mx-2 flex flex-wrap items-center gap-x-0.5 gap-y-0.5">
            <Choice
              label="For"
              value={kind}
              options={PICTURE_KINDS.map((k) => ({ value: k.value, label: k.label, hint: k.hint }))}
              onChange={(k) => {
                setKind(k);
                if (!aspectSet) setAspect(shapeFor(k));
              }}
              width={300}
              disabled={busy}
            />
            <Choice label="Look" value={look} options={LOOKS} onChange={setLook} disabled={busy} />
            <Choice
              label="Shape"
              value={aspect}
              shown={shapeShown}
              options={shapes}
              onChange={(a) => {
                setAspect(a);
                setAspectSet(true);
              }}
              width={240}
              disabled={busy}
            />
            <Choice
              label="Quality"
              value={choice}
              shown={choice === 'auto' ? `${tr('Auto')} · ${tr(tierName(tier))}` : tierName(choice)}
              options={[
                { value: 'auto', label: 'Auto', hint: 'Quick or Best, by what you ask' },
                { value: 'quick', label: 'Quick', hint: 'Cheaper, faster: icons, backgrounds, textures' },
                { value: 'best', label: 'Best', hint: 'Scenes, photos, words in a picture, diagrams' },
              ]}
              onChange={setChoice}
              width={320}
              disabled={busy}
            />
            <Choice label="How many" value={String(count)} options={['1', '2', '3', '4'].map((n) => ({ value: n, label: n }))} onChange={(v) => setCount(Number(v))} width={160} disabled={busy} />
          </div>
          {(canClear || themeColors.length > 0) && (
            <div className="space-y-2">
              {canClear && (
                <label className="flex items-center gap-2.5 text-[13px] text-fg-2">
                  <Switch on={transparent} onChange={setClear} label="See-through background" disabled={busy} />
                  See-through background
                </label>
              )}
              {themeColors.length > 0 && (
                <label className="flex items-center gap-2.5 text-[13px] text-fg-2">
                  <Switch on={inColours} onChange={setInColours} label="In these colours" disabled={busy} />
                  In these colours
                  <span className="flex gap-1" aria-hidden>
                    {themeColors.map((c) => (
                      <span key={c} className="h-4 w-4 rounded-full border border-black/10" style={{ background: c }} />
                    ))}
                  </span>
                </label>
              )}
            </div>
          )}
          {refs.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12.5px] text-fg-3">Following the picture picked</span>
              {refs.map((r) => (
                <span key={r} className="relative">
                  <img src={shownSrc(r)} alt="" className="h-11 w-11 rounded-lg border border-line object-cover" />
                  <button
                    type="button"
                    aria-label="Do not follow it"
                    title="Do not follow it"
                    disabled={busy}
                    onClick={() => setRefs((l) => l.filter((x) => x !== r))}
                    className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-line bg-elevated text-fg-3 shadow-sm hover:text-fg"
                  >
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>
          )}
          {error && <Problem error={error} onLeave={() => onDone(null)} />}
          {keyAsk || (busy ? <Working>{count > 1 ? 'Making them: it takes a few seconds' : 'Making it: it takes a few seconds'}</Working> : price && <PriceLine>{price.line}</PriceLine>)}
        </div>
      )}
    </Dialog>
  );
}
