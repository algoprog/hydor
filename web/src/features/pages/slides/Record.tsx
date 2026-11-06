// Recording a video of the slideshow, as Canva's Present and record and PowerPoint's recording: the slideshow full
// screen, taken by the browser's capture of this tab (asked first: Chrome offers this tab), your microphone, and your
// camera in its round bubble (drag it to a corner, or hide it); Pause and Stop; at the end the video plays back, to keep
// in the Library or download. Where the browser can take one part of a page (Chrome's element capture) the recording's
// own controls stay out of the video; elsewhere they hide while the pointer rests. Offered where the browser can
// capture the screen and record, and never on a phone.
import { useEffect, useRef, useState } from 'react';
import { Circle, Download, LibraryBig, Mic, Pause, Play, RotateCcw, Square, Video } from 'lucide-react';
import type { Deck } from '@shared/slides';
import type { Show } from '@shared/slides-runtime';
import { tr } from '../../../i18n/runtime';
import { bytes } from '../../../lib/format';
import { toast } from '../../../lib/store';
import { Button, cx, Dialog, Switch, useConfirm } from '../../../components/ui';
import { addToLibrary } from '../uploads';
import { CameraBubble, useCamera } from './Camera';
import { Slideshow } from './Present';

/** Whether this browser can record the slideshow: it captures the screen and records, and it is not a phone's. */
export const canRecordShow = () => typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia && !window.matchMedia('(pointer: coarse)').matches && window.innerWidth >= 768;

/** The kinds a recording may be made in, the most widely played first (MP4, then WebM). */
const KINDS = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1,opus', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
const kindOf = () => KINDS.find((k) => MediaRecorder.isTypeSupported(k)) ?? '';

function clock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const two = (n: number) => String(n).padStart(2, '0');
  return s >= 3600 ? `${Math.floor(s / 3600)}:${two(Math.floor((s % 3600) / 60))}:${two(s % 60)}` : `${two(Math.floor(s / 60))}:${two(s % 60)}`;
}

interface Took {
  display: MediaStream;
  mic: MediaStream | null;
  camera: boolean;
  narrate: boolean;
}

/** Before recording: the camera, the microphone, the narration; Start asks the browser what to share. */
function RecordSetup({ deck, onStart, onClose }: { deck: Deck; onStart: (t: Took) => void; onClose: () => void }) {
  const [camera, setCamera] = useState(() => localStorage.getItem('wa.slides.recordCamera') !== '0');
  const [mic, setMic] = useState(true);
  const narrated = deck.slides.some((s) => s.narration && !s.hidden);
  const [narrate, setNarrate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const cam = useCamera(camera);
  const start = async () => {
    setError(null);
    setAsking(true);
    localStorage.setItem('wa.slides.recordCamera', camera ? '1' : '0');
    let display: MediaStream;
    try {
      // This tab first (Chrome), its sound too when the narration plays.
      display = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: 'browser', frameRate: { ideal: 30 }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: narrate,
        preferCurrentTab: true,
        selfBrowserSurface: 'include',
        surfaceSwitching: 'exclude',
        systemAudio: 'exclude',
      } as DisplayMediaStreamOptions);
    } catch (e) {
      setAsking(false);
      setError((e as Error).name === 'NotAllowedError' ? tr('Nothing was shared, so nothing is recorded. Start again and pick this tab.') : tr('This browser could not capture the screen.'));
      return;
    }
    let voice: MediaStream | null = null;
    if (mic)
      try {
        voice = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      } catch {
        toast(tr('The microphone was not allowed: the video is recorded without your voice'), 'error');
      }
    setAsking(false);
    onStart({ display, mic: voice, camera, narrate });
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title={tr('Record a video')}
      width={460}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {tr('Cancel')}
          </Button>
          <Button variant="primary" icon={<Circle size={13} className="fill-current" />} disabled={asking} onClick={() => void start()}>
            {asking ? tr('Asking the browser') : tr('Start')}
          </Button>
        </>
      }
    >
      <p className="text-[13.5px] leading-relaxed text-fg-2">{tr('The slideshow plays full screen and is recorded with your voice and your camera, as you present it. The browser asks what to share: pick this tab.')}</p>
      <div className="mt-3 space-y-1">
        <label className="flex min-h-9 items-center gap-2.5 text-[13px] text-fg-2">
          <Video size={15} className="text-fg-3" />
          <span className="min-w-0 flex-1">{tr('Your camera, in a round bubble')}</span>
          <Switch label={tr('Your camera, in a round bubble')} on={camera} onChange={setCamera} />
        </label>
        {camera && (cam.stream ? <CameraPreview stream={cam.stream} /> : cam.error && <p className="pl-7 text-[12.5px] text-err">{cam.error}</p>)}
        <label className="flex min-h-9 items-center gap-2.5 text-[13px] text-fg-2">
          <Mic size={15} className="text-fg-3" />
          <span className="min-w-0 flex-1">{tr('Your microphone')}</span>
          <Switch label={tr('Your microphone')} on={mic} onChange={setMic} />
        </label>
        {narrated && (
          <>
            <label className="flex min-h-9 items-center gap-2.5 text-[13px] text-fg-2">
              <Play size={15} className="text-fg-3" />
              <span className="min-w-0 flex-1">{tr('Play the narration')}</span>
              <Switch label={tr('Play the narration')} on={narrate} onChange={setNarrate} />
            </label>
            {narrate && <p className="pl-7 text-[12px] leading-snug text-fg-3">{tr('Each slide’s narration plays and the slideshow goes on by itself; share the tab’s sound too when the browser asks.')}</p>}
          </>
        )}
      </div>
      {error && <p className="mt-2 text-[12.5px] text-err">{error}</p>}
    </Dialog>
  );
}

function CameraPreview({ stream }: { stream: MediaStream }) {
  const v = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (v.current) v.current.srcObject = stream;
  }, [stream]);
  return <video ref={v} autoPlay muted playsInline className="ml-7 h-24 w-24 rounded-full object-cover ring-2 ring-line" style={{ transform: 'scaleX(-1)' }} />;
}

interface Made {
  blob: Blob;
  ms: number;
  ext: string;
}

/** The slideshow being recorded: Start (a countdown), then Pause and Stop over it; the video when it stops. */
function RecordShow({ deck, from, pageId, title, took, onDone }: { deck: Deck; from: number; pageId?: string; title?: string; took: Took; onDone: (m: Made | null) => void }) {
  const stage = useRef<HTMLDivElement>(null);
  const show = useRef<Show | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const audio = useRef<AudioContext | null>(null);
  const [phase, setPhase] = useState<'ready' | 'counting' | 'on' | 'paused'>('ready');
  const [count, setCount] = useState(3);
  const [kept, setKept] = useState<'element' | 'crop' | null>(null);
  const [awake, setAwake] = useState(true);
  const time = useRef({ from: 0, at: 0, paused: 0 });
  const [, tick] = useState(0);
  const done = useRef(onDone);
  done.current = onDone;
  const over = useRef(false);

  const stopAll = () => {
    for (const s of [took.display, took.mic]) s?.getTracks().forEach((t) => t.stop());
    void audio.current?.close().catch(() => {});
  };
  const elapsed = () => {
    const t = time.current;
    if (!t.from) return 0;
    return (t.at || Date.now()) - t.from - t.paused;
  };
  const finish = () => {
    if (over.current) return;
    over.current = true;
    const r = rec.current;
    if (!r || r.state === 'inactive') {
      stopAll();
      done.current(null);
      return;
    }
    r.onstop = () => {
      stopAll();
      const type = (r.mimeType || 'video/webm').split(';')[0];
      done.current({ blob: new Blob(chunks.current, { type }), ms: elapsed(), ext: type.includes('mp4') ? 'mp4' : 'webm' });
    };
    if (!time.current.at) time.current.at = Date.now();
    r.stop();
  };

  // The recording takes only the slides where the browser can: element capture (Chrome), else cropped to them.
  useEffect(() => {
    const track = took.display.getVideoTracks()[0];
    const el = stage.current;
    if (!track || !el) return;
    // Sharing stopped from the browser's own bar: the recording stops.
    track.addEventListener('ended', finish);
    const w = window as unknown as { RestrictionTarget?: { fromElement(e: Element): Promise<unknown> }; CropTarget?: { fromElement(e: Element): Promise<unknown> } };
    const t = track as MediaStreamTrack & { restrictTo?: (x: unknown) => Promise<void>; cropTo?: (x: unknown) => Promise<void> };
    void (async () => {
      try {
        if (w.RestrictionTarget && t.restrictTo) {
          await t.restrictTo(await w.RestrictionTarget.fromElement(el));
          return setKept('element');
        }
      } catch {}
      try {
        if (w.CropTarget && t.cropTo) {
          await t.cropTo(await w.CropTarget.fromElement(el));
          setKept('crop');
        }
      } catch {}
    })();
    return () => track.removeEventListener('ended', finish);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const i = window.setInterval(() => tick((x) => x + 1), 500);
    return () => {
      window.clearInterval(i);
      // Left another way (the editor closed): nothing is kept running.
      if (!over.current) {
        over.current = true;
        try {
          rec.current?.stop();
        } catch {}
        stopAll();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // The controls hide while the pointer rests, where they would be in the video.
  useEffect(() => {
    if (kept === 'element') return;
    let t = 0;
    const wake = () => {
      setAwake(true);
      window.clearTimeout(t);
      t = window.setTimeout(() => setAwake(false), 2200);
    };
    wake();
    window.addEventListener('pointermove', wake);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('pointermove', wake);
    };
  }, [kept]);

  const begin = () => {
    const wrap = stage.current?.parentElement;
    if (wrap && !document.fullscreenElement) void wrap.requestFullscreen?.().catch(() => {});
    setPhase('counting');
    let n = 3;
    setCount(n);
    const t = window.setInterval(() => {
      n--;
      if (n > 0) return setCount(n);
      window.clearInterval(t);
      record();
    }, 1000);
  };
  const record = () => {
    if (over.current) return;
    const video = took.display.getVideoTracks();
    const sources = [took.mic, took.display].filter((s): s is MediaStream => !!s && s.getAudioTracks().length > 0);
    let sound: MediaStreamTrack[] = [];
    if (sources.length === 1) sound = sources[0].getAudioTracks();
    else if (sources.length > 1) {
      // The voice and the tab's sound, as one.
      const ctx = new AudioContext();
      audio.current = ctx;
      const out = ctx.createMediaStreamDestination();
      for (const s of sources) ctx.createMediaStreamSource(s).connect(out);
      sound = out.stream.getAudioTracks();
    }
    const kind = kindOf();
    let r: MediaRecorder;
    try {
      r = new MediaRecorder(new MediaStream([...video, ...sound]), { ...(kind ? { mimeType: kind } : {}), videoBitsPerSecond: 5_000_000 });
    } catch {
      toast(tr('This browser could not record the video'), 'error');
      finish();
      return;
    }
    chunks.current = [];
    r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    rec.current = r;
    r.start(1000);
    time.current = { from: Date.now(), at: 0, paused: 0 };
    setPhase('on');
  };
  const pause = () => {
    const r = rec.current;
    if (!r) return;
    if (r.state === 'recording') {
      r.pause();
      time.current.at = Date.now();
      show.current?.pauseVoice(true);
      setPhase('paused');
    } else if (r.state === 'paused') {
      r.resume();
      time.current.paused += Date.now() - time.current.at;
      time.current.at = 0;
      show.current?.pauseVoice(false);
      setPhase('on');
    }
  };

  const pill = 'flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium';
  const controls = (
    <div className={cx('absolute top-3 left-1/2 z-[8] flex -translate-x-1/2 items-center gap-1 rounded-full bg-[#1c1c1f]/95 p-1 text-white shadow-xl ring-1 ring-white/10', !awake && phase !== 'ready' && 'invisible')}>
      {phase === 'ready' && (
        <>
          <span className="px-2 text-[13px] text-white/75">{kept === null ? tr('Ready to record') : tr('Ready: this tab’s slides are recorded')}</span>
          <button type="button" onClick={begin} className={cx(pill, 'bg-[#e5484d] text-white hover:bg-[#d93d42]')}>
            <Circle size={11} className="fill-current" />
            {tr('Start recording')}
          </button>
          <button type="button" onClick={finish} className={cx(pill, 'text-white/80 hover:bg-white/10')}>
            {tr('Cancel')}
          </button>
        </>
      )}
      {phase === 'counting' && <span className="px-4 text-[13px] tabular-nums">{tr(`Recording in ${count}`)}</span>}
      {(phase === 'on' || phase === 'paused') && (
        <>
          <span className="flex items-center gap-1.5 px-2.5 font-mono text-[13px] tabular-nums">
            <span className={cx('h-2.5 w-2.5 rounded-full', phase === 'on' ? 'bg-[#e5484d]' : 'bg-white/40')} />
            {clock(elapsed())}
          </span>
          <button type="button" onClick={pause} className={cx(pill, 'hover:bg-white/10')}>
            {phase === 'paused' ? <Play size={14} /> : <Pause size={14} />}
            {phase === 'paused' ? tr('Go on') : tr('Pause')}
          </button>
          <button type="button" onClick={finish} className={cx(pill, 'bg-white text-black hover:bg-white/90')}>
            <Square size={12} className="fill-current" />
            {tr('Stop')}
          </button>
        </>
      )}
    </div>
  );
  return (
    <Slideshow
      deck={deck}
      from={from}
      pageId={pageId}
      title={title}
      narrate={took.narrate}
      camera={took.camera}
      stage={stage}
      onShow={(s) => {
        show.current = s;
        if (s && took.narrate) s.pauseVoice(true);
      }}
      onMove={() => {
        // The narration waits for the recording.
        if (took.narrate && rec.current?.state !== 'recording') show.current?.pauseVoice(true);
        else if (took.narrate) show.current?.pauseVoice(false);
      }}
      controls={controls}
      onClose={finish}
    />
  );
}

/** The video made: it plays here, to keep in the Library or download (or record again). */
function RecordResult({ made, title, onAgain, onClose }: { made: Made; title?: string; onAgain: () => void; onClose: () => void }) {
  const [url] = useState(() => URL.createObjectURL(made.blob));
  const [saved, setSaved] = useState(false);
  const [confirm, node] = useConfirm();
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  const name = `${(title || tr('Slideshow'))
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .trim()
    .slice(0, 80)} (${tr('recording')}).${made.ext}`;
  const keep = () => {
    addToLibrary([{ file: new File([made.blob], name, { type: made.blob.type }), rel: name }], null);
    setSaved(true);
    toast(tr('The video is going into the Library'), 'ok');
  };
  const close = async () => {
    if (!saved && !(await confirm({ title: tr('Close without keeping the video?'), body: tr('It is not in the Library and was not downloaded: it goes once this closes.'), confirm: tr('Close'), danger: true }))) return;
    onClose();
  };
  return (
    <Dialog
      open
      onClose={() => void close()}
      title={tr('Your recording')}
      width={720}
      footer={
        <>
          <Button variant="ghost" icon={<RotateCcw size={14} />} onClick={onAgain}>
            {tr('Record again')}
          </Button>
          <span className="flex-1" />
          <a href={url} download={name} onClick={() => setSaved(true)} className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-line px-3 text-[13px] font-medium text-fg hover:bg-bg-1">
            <Download size={14} />
            {tr('Download')}
          </a>
          <Button variant="primary" icon={<LibraryBig size={14} />} disabled={saved} onClick={keep}>
            {tr('Keep in the Library')}
          </Button>
        </>
      }
    >
      <video src={url} controls playsInline className="aspect-video w-full rounded-xl bg-black" />
      <p className="mt-2 text-[12.5px] text-fg-3 tabular-nums">
        {clock(made.ms)} · {bytes(made.blob.size)} · {made.ext.toUpperCase()}
      </p>
      {node}
    </Dialog>
  );
}

/** Record a video, from start to end: what to record with, the slideshow recorded, the video. */
export function Recorder({ deck, from, pageId, title, onClose }: { deck: Deck; from: number; pageId?: string; title?: string; onClose: () => void }) {
  const [took, setTook] = useState<Took | null>(null);
  const [made, setMade] = useState<Made | null>(null);
  if (made)
    return (
      <RecordResult
        made={made}
        title={title}
        onAgain={() => {
          setMade(null);
          setTook(null);
        }}
        onClose={onClose}
      />
    );
  if (took)
    return (
      <RecordShow
        deck={deck}
        from={from}
        pageId={pageId}
        title={title}
        took={took}
        onDone={(m) => {
          setTook(null);
          if (m && m.blob.size) setMade(m);
          else onClose();
        }}
      />
    );
  return <RecordSetup deck={deck} onStart={setTook} onClose={onClose} />;
}
