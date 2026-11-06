// A video from words: what happens, its length and shape (those the video model makes), sound (when it makes it),
// and the picture picked to start on (when it can); what it would cost, said plainly (videos cost far more than
// pictures). It takes minutes: the dialog shows how long it has been on its way, and may be closed meanwhile (the
// video goes on being made, and a note with Insert shows when it is done). A video asked for before and still
// waiting shows at the top, to take it back here. Then the video, to watch, and Use it.
import { useEffect, useState } from 'react';
import { Film } from 'lucide-react';
import type { TiersInfo, VideoJob } from '@shared/images';
import type { VideosState } from '@shared/media';
import { Button, Dialog, Switch } from '../../../components/ui';
import { getTiers, startVideo, videoJob, videoSettings } from './api';
import { elapsed, money, nearestAspect, videoPrice } from './logic';
import { Choice, NoKey, PriceLine, Problem, ShapeMark, Words, Working } from './parts';
import { shownSrc } from './pictures';
import type { MadeVideo, VideoOpts } from './store';
import { finished, madeOf, POLL_OPEN, takeBack, useFollowed } from './videoJobs';

const EXAMPLES = ['Waves rolling onto a beach at dusk, the camera slowly rising', 'A paper boat drifting down a rainy street', 'Steam curling from a cup of coffee by a window'];

/** Ticks once a second while `on`, for a clock that counts up. */
function useTick(on: boolean) {
  const [, set] = useState(0);
  useEffect(() => {
    if (!on) return;
    const t = window.setInterval(() => set((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, [on]);
}

export function MakeVideo({ o, onDone, onLetGo }: { o: VideoOpts; onDone: (v: MadeVideo | null) => void; onLetGo: (job: VideoJob, prompt: string) => void }) {
  const [prompt, setPrompt] = useState('');
  const [seconds, setSeconds] = useState<number | null>(null);
  const [aspect, setAspect] = useState<string | null>(null);
  const [audio, setAudio] = useState(false);
  const [useFirst, setUseFirst] = useState(!!o.first);
  const [tiers, setTiers] = useState<TiersInfo | null>(null);
  const [vs, setVs] = useState<VideosState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [job, setJob] = useState<VideoJob | null>(null);
  const [asked, setAsked] = useState('');
  const before = useFollowed((s) => s.list[s.list.length - 1] ?? null);
  const running = !!job && !finished(job);
  useTick(running || (!!before && !finished(before.job)));

  useEffect(() => {
    getTiers().then(setTiers, (e: Error) => setError(e.message));
    videoSettings().then(setVs, () => {});
  }, []);

  const m = vs?.usingInfo;
  const lengths = m?.durations.length ? m.durations : [5];
  const secs = seconds ?? lengths.find((d) => d >= 5) ?? lengths[0];
  const shapes = m?.aspects.length ? m.aspects : ['16:9', '9:16', '1:1'];
  const shape = aspect ?? nearestAspect(o.aspect ?? '16:9', shapes) ?? '16:9';
  const fromPicture = !!o.first && (!m || m.frames.includes('first_frame'));
  const price = tiers ? videoPrice(tiers, secs, m?.perSecondMax) : null;
  const noKey = !!tiers && !tiers.keySet;

  // Followed while open.
  useEffect(() => {
    if (!job || finished(job)) return;
    const t = window.setTimeout(() => {
      videoJob(job.job).then(setJob, (e: Error) => setError(e.message));
    }, POLL_OPEN);
    return () => window.clearTimeout(t);
  }, [job]);

  const make = async () => {
    if (!prompt.trim() || sending || noKey) return;
    setSending(true);
    setError(null);
    try {
      const j = await startVideo({ prompt: prompt.trim(), duration: secs, aspect: shape, audio: m?.audio ? audio : undefined, first: fromPicture && useFirst ? o.first : undefined });
      setAsked(prompt.trim());
      setJob(j);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  };
  const close = () => (job && running ? onLetGo(job, asked) : onDone(null));
  const made = job && job.status === 'done' ? madeOf(job) : null;

  let footer;
  if (made)
    footer = (
      <>
        <Button variant="ghost" onClick={() => setJob(null)}>
          Make another
        </Button>
        <Button variant="primary" onClick={() => onDone(made)}>
          Use it
        </Button>
      </>
    );
  else if (job && running)
    footer = (
      <Button variant="secondary" onClick={close}>
        Close: it goes on
      </Button>
    );
  else
    footer = (
      <>
        <Button variant="ghost" onClick={close}>
          Cancel
        </Button>
        <Button variant="primary" disabled={sending || !prompt.trim() || !tiers || noKey} onClick={() => void make()}>
          {sending ? 'Sending it' : (price?.button ?? 'Make the video')}
        </Button>
      </>
    );

  return (
    <Dialog open onClose={close} title="A video" width={580} footer={footer}>
      {job ? (
        <div className="space-y-3">
          {made ? (
            <video src={shownSrc(made.src)} poster={made.poster ? shownSrc(made.poster) : undefined} controls playsInline className="max-h-[48dvh] w-full rounded-xl bg-black" />
          ) : job.status === 'failed' ? (
            <Problem error={job.error ?? 'The video could not be made'} onLeave={() => onDone(null)}>
              <Button size="sm" variant="secondary" onClick={() => setJob(null)}>
                Try again
              </Button>
            </Problem>
          ) : (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-line bg-bg-1 px-4 py-8 text-center">
              <Film size={22} className="text-fg-3" />
              <Working>{job.status === 'queued' ? `Waiting for its turn: ${elapsed(Date.now() - job.startedAt)} so far` : `Making the video: ${elapsed(Date.now() - job.startedAt)} so far`}</Working>
              <p className="max-w-sm text-[12.5px] leading-snug text-fg-3">Videos take a few minutes. You can close this: the video goes on being made, and a note with Insert shows when it is done.</p>
            </div>
          )}
          <p translate="no" className="text-[12.5px] leading-snug text-fg-2">
            {asked}
          </p>
          {job.cost != null && <PriceLine>{made ? `It cost ${money(job.cost)}` : `About ${money(job.cost)}`}</PriceLine>}
          {error && <Problem error={error} onLeave={() => onDone(null)} />}
        </div>
      ) : (
        <div className="space-y-3">
          {before && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-bg-1 px-3 py-2 text-[12.5px] text-fg-2">
              <Film size={14} className="shrink-0 text-fg-3" />
              <span className="min-w-0 flex-1">{finished(before.job) ? 'The video you asked for before is ready.' : `The video you asked for before is still being made: ${elapsed(Date.now() - before.job.startedAt)} so far.`}</span>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  const f = takeBack();
                  if (!f) return;
                  setAsked(f.prompt);
                  setJob(f.job);
                }}
              >
                Show it
              </Button>
            </div>
          )}
          {noKey && <NoKey what="Videos are made through OpenRouter, and no key is set yet." onLeave={() => onDone(null)} />}
          <Words value={prompt} onChange={setPrompt} label="What happens" placeholder="What happens in it: what is seen, how it moves, how the camera moves" examples={EXAMPLES} disabled={sending} />
          <div className="-mx-2 flex flex-wrap items-center gap-x-0.5 gap-y-0.5">
            <Choice label="Length" value={String(secs)} options={lengths.map((d) => ({ value: String(d), label: `${d} second${d === 1 ? '' : 's'}` }))} onChange={(v) => setSeconds(Number(v))} width={180} disabled={sending} />
            <Choice label="Shape" value={shape} options={shapes.map((a) => ({ value: a, label: a, icon: <ShapeMark aspect={a} /> }))} onChange={setAspect} width={180} disabled={sending} />
          </div>
          {(m?.audio || o.first) && (
            <div className="space-y-2">
              {m?.audio && (
                <label className="flex items-center gap-2.5 text-[13px] text-fg-2">
                  <Switch on={audio} onChange={setAudio} label="With sound" disabled={sending} />
                  With sound
                </label>
              )}
              {o.first &&
                (fromPicture ? (
                  <label className="flex items-center gap-2.5 text-[13px] text-fg-2">
                    <Switch on={useFirst} onChange={setUseFirst} label="Start from the picture picked" disabled={sending} />
                    Start from the picture picked
                    <img src={shownSrc(o.first)} alt="" className="h-8 w-8 rounded-md border border-line object-cover" />
                  </label>
                ) : (
                  <PriceLine>This video model cannot start from a picture.</PriceLine>
                ))}
            </div>
          )}
          {error && <Problem error={error} onLeave={() => onDone(null)} />}
          {sending ? <Working>Sending it</Working> : price && <PriceLine>{price.line}</PriceLine>}
        </div>
      )}
    </Dialog>
  );
}
