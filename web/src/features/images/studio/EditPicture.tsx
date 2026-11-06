// Change a picture, in three ways: Change with AI (words, and only where it is painted if some of it is), Remove the
// background, and Erase part of it (paint over what to take away). Taking the background out and erasing run on this
// computer, for nothing, once the picture tools are set up here (the card offers it, with OpenRouter as the other
// way, priced); the first use of each downloads its model, its progress shown. The result shows beside the picture
// as it was (drag across to compare); Keep hands it to the editor, Try again goes back. A model's whole picture made
// for a painted part is put in only where it was painted, its edge softened, then kept.
import { useEffect, useRef, useState } from 'react';
import type { MadePicture, PictureAnswer, TiersInfo } from '@shared/images';
import { Button, Dialog, Switch, Tabs } from '../../../components/ui';
import { cutout, editImage, erase, getTiers } from './api';
import { asPng, maskData, painted, putInPainted, type Stroke } from './canvas';
import { Compare } from './Compare';
import { LocalToolsCard, useLocalTools } from './LocalTools';
import { changePrice, insteadLine, money, toolPrice } from './logic';
import { Painter } from './Painter';
import { NoKey, PriceLine, Problem, Shown, Words, Working } from './parts';
import { keepPicture, shownSrc } from './pictures';
import type { EditOpts } from './store';

type Mode = 'change' | 'cutout' | 'erase';

const MODES: { value: Mode; label: string }[] = [
  { value: 'change', label: 'Change with AI' },
  { value: 'cutout', label: 'Remove the background' },
  { value: 'erase', label: 'Erase part of it' },
];

/** Pictures the tools take as they are; others (drawings, GIFs) go to them as PNGs. */
const PIXELS = /^image\/(png|jpeg|webp)$/;

interface Result {
  pic: MadePicture;
  how: PictureAnswer['how'];
  model?: string;
  cost?: number;
}

export function EditPicture({ o, onDone }: { o: EditOpts; onDone: (p: MadePicture | null) => void }) {
  const [pic, setPic] = useState<MadePicture | null>(null);
  const [mode, setMode] = useState<Mode>(o.mode ?? 'change');
  const [tiers, setTiers] = useState<TiersInfo | null>(null);
  const [words, setWords] = useState('');
  const [part, setPart] = useState(false);
  const [strokes, setStrokes] = useState<Record<Mode, Stroke[]>>({ change: [], cutout: [], erase: [] });
  const [brush, setBrush] = useState(40);
  const [busy, setBusy] = useState<{ what: string; how: 'local' | 'cloud' } | null>(null);
  const [error, setError] = useState<{ text: string; local: boolean } | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const tools = useLocalTools(busy?.how === 'local');
  const stop = useRef(new AbortController());

  useEffect(() => {
    getTiers().then(setTiers, (e: Error) => setError({ text: e.message, local: false }));
    keepPicture(o.src)
      .then(async (p) => (PIXELS.test(p.mime) ? p : keepPicture(await asPng(shownSrc(p.src), p.w, p.h))))
      .then(setPic, (e: Error) => setError({ text: `That picture could not be opened: ${e.message}`, local: false }));
    const c = stop.current;
    return () => c.abort();
  }, [o.src]);

  const local = tools.state;
  // The local tools' readiness, as the tiers say it when they came first.
  const ready = !!(local ?? tiers?.local)?.ready;
  const own = strokes[mode];
  const setOwn = (s: Stroke[]) => setStrokes((all) => ({ ...all, [mode]: s }));

  const run = async (how: 'local' | 'cloud') => {
    if (!pic || busy) return;
    const mask = mode !== 'cutout' && painted(own) && (mode === 'erase' || part) ? maskData(own, pic.w, pic.h) : undefined;
    setError(null);
    const here = mode !== 'change' && how === 'local';
    setBusy({ what: mode === 'change' ? 'Changing it: it takes a few seconds' : mode === 'cutout' ? 'Taking the background out' : 'Erasing', how: here ? 'local' : 'cloud' });
    try {
      const sig = stop.current.signal;
      const r = mode === 'change' ? await editImage({ src: pic.src, prompt: words.trim(), mask, tier: 'best' }, sig) : mode === 'cutout' ? await cutout({ src: pic.src, how }, sig) : await erase({ src: pic.src, mask: mask!, how }, sig);
      let out: MadePicture = { src: r.src, w: r.w, h: r.h, mime: r.mime };
      if (r.whole && mask) {
        setBusy({ what: 'Putting it in where you painted', how: 'cloud' });
        out = await keepPicture(await putInPainted(shownSrc(pic.src), shownSrc(r.src), own, pic.w, pic.h));
      }
      if (!sig.aborted) setResult({ pic: out, how: r.how, model: r.model, cost: r.cost });
    } catch (e) {
      if (!stop.current.signal.aborted) setError({ text: (e as Error).message, local: here });
    } finally {
      setBusy(null);
      void tools.refresh();
    }
  };

  const change = tiers ? changePrice(tiers) : null;
  const viaLocal = tiers && (mode === 'cutout' || mode === 'erase') ? toolPrice(tiers, mode, 'local') : null;
  const viaCloud = tiers && (mode === 'cutout' || mode === 'erase') ? toolPrice(tiers, mode, 'cloud') : null;
  const needsPaint = mode === 'erase' || (mode === 'change' && part);
  const paintMissing = needsPaint && !painted(own);

  let footer;
  if (result)
    footer = (
      <>
        <Button variant="ghost" onClick={() => setResult(null)}>
          Try again
        </Button>
        <Button variant="primary" onClick={() => onDone(result.pic)}>
          Keep
        </Button>
      </>
    );
  else
    footer = (
      <>
        <Button variant="ghost" onClick={() => onDone(null)}>
          Cancel
        </Button>
        {mode === 'change' ? (
          <Button variant="primary" disabled={!pic || !!busy || !words.trim() || paintMissing || !tiers?.keySet} onClick={() => void run('cloud')}>
            {busy ? 'Changing it' : (change?.button ?? 'Change it')}
          </Button>
        ) : (
          ready &&
          viaLocal && (
            <Button variant="primary" disabled={!pic || !!busy || paintMissing} onClick={() => void run('local')}>
              {busy ? (mode === 'cutout' ? 'Taking it out' : 'Erasing') : viaLocal.button}
            </Button>
          )
        )}
      </>
    );

  const picture = pic ? (
    mode === 'erase' || (mode === 'change' && part) ? (
      <Painter src={shownSrc(pic.src)} w={pic.w} h={pic.h} strokes={own} onStrokes={setOwn} brush={brush} onBrush={setBrush} disabled={!!busy} />
    ) : (
      <Shown src={shownSrc(pic.src)} className="max-h-[min(44dvh,420px)]" />
    )
  ) : (
    !error && <Working className="py-10 justify-center">Opening the picture</Working>
  );

  return (
    <Dialog open onClose={() => onDone(null)} title="Change a picture" width={600} footer={footer}>
      {result && pic ? (
        <div className="space-y-2.5">
          <Compare before={shownSrc(pic.src)} after={shownSrc(result.pic.src)} />
          <p className="text-center text-[12.5px] text-fg-3">
            {result.how === 'local' ? 'Done on this computer, for nothing' : result.cost != null ? `Done with ${result.model ?? 'OpenRouter'}: ${money(result.cost)}` : `Done with ${result.model ?? 'OpenRouter'}`}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <Tabs
            value={mode}
            options={MODES}
            onChange={(m) => {
              if (busy) return;
              setMode(m);
              setError(null);
            }}
            dense
            className="-mx-1.5 border-b border-line"
          />
          {picture}
          {mode === 'change' && (
            <>
              {tiers && !tiers.keySet && <NoKey what="Changes with AI are made through OpenRouter, and no key is set yet." onLeave={() => onDone(null)} />}
              <Words value={words} onChange={setWords} label="What to change" placeholder="What to change: “make the sky a sunset”, “add a red scarf”, “take the cup away”" rows={2} disabled={!!busy} />
              <label className="flex items-center gap-2.5 text-[13px] text-fg-2">
                <Switch on={part} onChange={setPart} label="Only where I paint" disabled={!!busy} />
                Only where I paint
              </label>
              {part && paintMissing && <PriceLine>Paint over the part to change.</PriceLine>}
            </>
          )}
          {mode === 'erase' && paintMissing && <PriceLine>Paint over what to take away.</PriceLine>}
          {(mode === 'cutout' || mode === 'erase') && tiers && !ready && <LocalToolsCard tools={tools} instead={{ label: insteadLine(tiers, mode), disabled: !pic || !!busy || paintMissing, run: () => void run('cloud') }} />}
          {error && (
            <Problem error={error.text} onLeave={() => onDone(null)}>
              {error.local && tiers && (mode === 'cutout' || mode === 'erase') && (
                <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => void run('cloud')}>
                  {insteadLine(tiers, mode)}
                </Button>
              )}
            </Problem>
          )}
          {busy ? (
            <Working>{busy.how === 'local' && local?.step ? local.step : busy.what}</Working>
          ) : mode === 'change' ? (
            change && tiers?.keySet && <PriceLine>{change.line}</PriceLine>
          ) : ready ? (
            viaLocal && <PriceLine>{viaLocal.line}</PriceLine>
          ) : (
            viaCloud && <PriceLine>{viaCloud.line}</PriceLine>
          )}
        </div>
      )}
    </Dialog>
  );
}
