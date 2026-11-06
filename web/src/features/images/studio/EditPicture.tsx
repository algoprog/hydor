// Change a picture, in three ways: Change with AI (words, and only where it is painted if some of it is), Remove the
// background, and Erase part of it (paint over what to take away). Taking the background out and erasing run on this
// computer, for nothing, once the picture tools are set up here (the card offers it, with OpenRouter as the other
// way, priced); the first use of each downloads its model, its progress shown. The result shows beside the picture
// as it was (drag across to compare); Keep hands it to the editor, Try again goes back. A model's whole picture made
// for a painted part is put in only where it was painted, its edge softened, then kept. A cutout or erasing done here
// can be done again by AI (Do it with AI instead, priced), and Change with AI takes any result further in words. What
// goes through OpenRouter with no key set asks for it in place (KeyAsk); skipped, it does not run.
import { useEffect, useRef, useState } from 'react';
import type { MadePicture, PictureAnswer, TiersInfo } from '@shared/images';
import { Button, Dialog, Switch, Tabs } from '../../../components/ui';
import { cutout, editImage, erase, getTiers } from './api';
import { asPng, maskData, painted, putInPainted, type Stroke } from './canvas';
import { Compare } from './Compare';
import { LocalToolsCard, useLocalTools } from './LocalTools';
import { KeyAsk } from './KeyAsk';
import { aiInsteadButton, changePrice, insteadLine, madeWith, needsKey, toolPrice } from './logic';
import { Painter } from './Painter';
import { PriceLine, Problem, Shown, Words, Working } from './parts';
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
  /** Why it was made by AI when this computer was asked first (the server's words), if it says. */
  why?: string;
}

/** What the server may say of an answer made by AI when the picture tools were asked first. */
const whyOf = (r: PictureAnswer & { why?: unknown; note?: unknown }) => (typeof r.why === 'string' && r.why.trim() ? r.why : typeof r.note === 'string' && r.note.trim() ? r.note : undefined);

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
  // What went to OpenRouter with no key set: the key is asked for here, then it goes on.
  const [askKey, setAskKey] = useState<Mode | null>(null);
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

  /** Does it, here or through OpenRouter (`keyed`: the key was just saved, so the tiers read before are out of date). */
  const run = async (how: 'local' | 'cloud', keyed = false) => {
    if (!pic || busy) return;
    const mask = mode !== 'cutout' && painted(own) && (mode === 'erase' || part) ? maskData(own, pic.w, pic.h) : undefined;
    setError(null);
    const here = mode !== 'change' && how === 'local';
    if (!here && !keyed && tiers && !tiers.keySet) return setAskKey(mode);
    setAskKey(null);
    setBusy({ what: mode === 'change' ? 'Changing it: it takes a few seconds' : mode === 'cutout' ? 'Taking the background out' : 'Erasing', how: here ? 'local' : 'cloud' });
    try {
      const sig = stop.current.signal;
      const r = mode === 'change' ? await editImage({ src: pic.src, prompt: words.trim(), mask, tier: 'best' }, sig) : mode === 'cutout' ? await cutout({ src: pic.src, how }, sig) : await erase({ src: pic.src, mask: mask!, how }, sig);
      let out: MadePicture = { src: r.src, w: r.w, h: r.h, mime: r.mime };
      if (r.whole && mask) {
        setBusy({ what: 'Putting it in where you painted', how: 'cloud' });
        out = await keepPicture(await putInPainted(shownSrc(pic.src), shownSrc(r.src), own, pic.w, pic.h));
      }
      if (!sig.aborted) setResult({ pic: out, how: r.how, model: r.model, cost: r.cost, why: whyOf(r) });
    } catch (e) {
      const m = (e as Error).message;
      if (!stop.current.signal.aborted) !here && needsKey(m) ? setAskKey(mode) : setError({ text: m, local: here });
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

  /** Change with AI, from what was made: the result becomes the picture to change. */
  const changeMore = () => {
    if (!result) return;
    setPic(result.pic);
    setResult(null);
    setMode('change');
    setPart(false);
    setStrokes((s) => ({ ...s, change: [] }));
  };
  const tool = mode === 'cutout' || mode === 'erase' ? mode : null;

  let footer;
  if (result)
    footer = (
      <div className="flex flex-wrap items-center justify-end gap-2">
        {tool && (
          <Button variant="ghost" disabled={!!busy || !!askKey} onClick={changeMore}>
            Change with AI
          </Button>
        )}
        {tool && result.how === 'local' && tiers && (
          <Button variant="secondary" disabled={!!busy || !!askKey} onClick={() => void run('cloud')}>
            {aiInsteadButton(tiers, tool)}
          </Button>
        )}
        <Button variant="ghost" disabled={!!busy} onClick={() => setResult(null)}>
          Try again
        </Button>
        <Button variant="primary" disabled={!!busy} onClick={() => onDone(result.pic)}>
          Keep
        </Button>
      </div>
    );
  else
    footer = (
      <>
        <Button variant="ghost" onClick={() => onDone(null)}>
          Cancel
        </Button>
        {mode === 'change' ? (
          <Button variant="primary" disabled={!pic || !!busy || !!askKey || !words.trim() || paintMissing || !tiers} onClick={() => void run('cloud')}>
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

  const keyAsk = askKey === mode && (
    <KeyAsk
      onSaved={() =>
        void getTiers().then(
          (t) => {
            setTiers(t);
            if (t.keySet) void run('cloud', true);
          },
          (e: Error) => setError({ text: e.message, local: false }),
        )
      }
      onSkip={() => setAskKey(null)}
    />
  );

  return (
    <Dialog open onClose={() => onDone(null)} title="Change a picture" width={600} footer={footer}>
      {result && pic ? (
        <div className="space-y-2.5">
          <Compare before={shownSrc(pic.src)} after={shownSrc(result.pic.src)} />
          <p className="text-center text-[12.5px] text-fg-3">{result.how === 'local' ? 'Done on this computer, for nothing' : madeWith(tiers, result.model, result.cost)}</p>
          {result.why && <p className="text-center text-[12.5px] leading-snug text-fg-3">{result.why}</p>}
          {error && <Problem error={error.text} onLeave={() => onDone(null)} />}
          {keyAsk || (busy && <Working className="justify-center">{busy.what}</Working>)}
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
              <Words value={words} onChange={setWords} label="What to change" placeholder="What to change: “make the sky a sunset”, “add a red scarf”, “take the cup away”" rows={2} disabled={!!busy} />
              <label className="flex items-center gap-2.5 text-[13px] text-fg-2">
                <Switch on={part} onChange={setPart} label="Only where I paint" disabled={!!busy} />
                Only where I paint
              </label>
              {part && paintMissing && <PriceLine>Paint over the part to change.</PriceLine>}
            </>
          )}
          {mode === 'erase' && paintMissing && <PriceLine>Paint over what to take away.</PriceLine>}
          {(mode === 'cutout' || mode === 'erase') && tiers && !ready && <LocalToolsCard tools={tools} instead={{ label: insteadLine(tiers, mode), disabled: !pic || !!busy || paintMissing || !!askKey, run: () => void run('cloud') }} />}
          {error && (
            <Problem error={error.text} onLeave={() => onDone(null)}>
              {error.local && tiers && (mode === 'cutout' || mode === 'erase') && (
                <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => void run('cloud')}>
                  {insteadLine(tiers, mode)}
                </Button>
              )}
            </Problem>
          )}
          {keyAsk ? (
            keyAsk
          ) : busy ? (
            <Working>{busy.how === 'local' && local?.step ? local.step : busy.what}</Working>
          ) : mode === 'change' ? (
            change && <PriceLine>{change.line}</PriceLine>
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
