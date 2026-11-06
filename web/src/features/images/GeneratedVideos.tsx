// Videos an agent made (generate_video), with its reply: while the model works a placeholder of the shape
// asked for, with the time it has taken (videos take a minute or several); then the video in the app's own
// player (as in Files), to download and keep in the Library. A call that stopped waiting says the video is still being made: the agent's next
// call shows it. Without an OpenRouter key, a way to Settings.
import { useEffect, useState } from 'react';
import { Clapperboard, Download, FolderOpen, KeyRound, VideoOff } from 'lucide-react';
import type { ToolItem } from '@shared/types';
import { basename, duration } from '../../lib/format';
import { mu } from '../../lib/machine';
import { go, showInFiles } from '../../lib/nav';
import { Button, cx, IconButton } from '../../components/ui';
import { VideoPlayer } from '../../components/VideoPlayer';
import { download } from '../documents/FileCards';
import { FileMore } from '../files/SpaceMenu';
import { KeepButton } from '../media/Keep';
import { OpenRouterKeyCard } from '../connections/OpenRouterKeyCard';

interface Clip {
  path: string;
  w?: number;
  h?: number;
  secs?: number;
}

/** The saved videos, from the tool's answer: one path per line, then "(width×height, 5 s, size)". */
export function clipsOf(output?: string): Clip[] {
  const out: Clip[] = [];
  for (const line of (output ?? '').split('\n')) {
    const m = /^(\/.+?\.(?:mp4|webm|mov|m4v))(?: \(([^)]*)\))?$/i.exec(line.trim());
    if (!m) continue;
    const size = /(\d+)×(\d+)/.exec(m[2] ?? '');
    const secs = /(\d+(?:\.\d+)?) s\b/.exec(m[2] ?? '');
    out.push({ path: m[1], ...(size ? { w: Number(size[1]), h: Number(size[2]) } : {}), ...(secs ? { secs: Number(secs[1]) } : {}) });
  }
  return out;
}

const ratio = (aspect?: string) => {
  const m = /^(\d+):(\d+)$/.exec(aspect ?? '');
  return m ? `${m[1]} / ${m[2]}` : '16 / 9';
};

function Working({ since, aspect, prompt }: { since?: number; aspect?: string; prompt?: string }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="tl-item my-1.5 max-w-[30rem]">
      <div className="relative flex w-full max-w-full items-center justify-center overflow-hidden rounded-xl border border-line bg-bg-2" style={{ aspectRatio: ratio(aspect), maxHeight: 380 }}>
        <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-bg-2 via-bg-3 to-bg-2" />
        <div className="relative flex flex-col items-center gap-1.5 px-4 text-center text-[13px] text-fg-2">
          <Clapperboard size={20} className="text-accent" />
          <span>Making a video{since ? ` · ${duration(Date.now() - since)}` : '…'}</span>
          <span className="text-[12px] text-fg-3">It takes a minute or several</span>
        </div>
      </div>
      {prompt && (
        <p className="mt-1.5 line-clamp-2 px-0.5 text-[12.5px] text-fg-3" translate="no">
          {prompt}
        </p>
      )}
    </div>
  );
}

function Note({ icon, title, text, action }: { icon: React.ReactNode; title: string; text: string; action?: React.ReactNode }) {
  return (
    <div className="tl-item my-1.5 flex max-w-[34rem] items-start gap-3 rounded-xl border border-line bg-panel px-3 py-2.5">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-bg-2 text-fg-3">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium text-fg">{title}</div>
        <p className="mt-0.5 line-clamp-4 text-[12.5px] leading-snug text-fg-3">{text}</p>
        {action}
      </div>
    </div>
  );
}

export function GeneratedVideos({ item, sessionKey }: { item: ToolItem; sessionKey: string }) {
  const t = item.tool;
  const input = (t.input ?? {}) as { prompt?: unknown; aspect_ratio?: unknown };
  const prompt = typeof input.prompt === 'string' ? input.prompt : undefined;
  const aspect = typeof input.aspect_ratio === 'string' ? input.aspect_ratio : undefined;
  const clips = clipsOf(t.output);
  // While it runs it may be waiting for an OpenRouter key: the card to give one (or skip) shows above it.
  if (t.status === 'running' || t.status === 'pending' || t.status === 'waiting')
    return (
      <>
        <OpenRouterKeyCard sessionKey={sessionKey} />
        <Working since={item.ts} aspect={aspect} prompt={prompt} />
      </>
    );
  if (!clips.length) {
    const text = (t.output || t.error || 'No video was made.').trim();
    if (/no OpenRouter key/i.test(text))
      return (
        <Note
          icon={<KeyRound size={16} />}
          title="Videos need an OpenRouter key"
          text="Video models are reached through OpenRouter. Add your key in Settings → Models, then ask again."
          action={
            <Button size="sm" variant="secondary" className="mt-2" icon={<KeyRound size={13} />} onClick={() => go('/settings?s=models')}>
              Add an OpenRouter key
            </Button>
          }
        />
      );
    if (/still being made/i.test(text)) return <Note icon={<Clapperboard size={16} />} title="Still being made" text="The model is still at it, and the app keeps the video coming: it shows here once the agent checks on it again." />;
    if (/closed the form/i.test(text)) return <Note icon={<VideoOff size={16} />} title="No video this time" text="You closed the form, so nothing was made or spent." />;
    return <Note icon={<VideoOff size={16} />} title="No video this time" text={text} />;
  }
  const model = /with ([^\s:(]+)/.exec(t.output ?? '')?.[1];
  return (
    <figure className="tl-item my-1.5">
      <div className={cx('grid gap-2', clips.length > 1 ? 'max-w-[40rem] grid-cols-2' : 'max-w-[34rem]')}>
        {clips.map((c) => {
          const src = mu(`/api/fs/raw?path=${encodeURIComponent(c.path)}`);
          return (
            <div key={c.path} className="group relative overflow-hidden rounded-xl border border-line bg-black" style={c.w && c.h ? { aspectRatio: `${c.w} / ${c.h}`, maxHeight: 480 } : { aspectRatio: ratio(aspect) }}>
              <VideoPlayer src={src} name={basename(c.path)} downloadUrl={`${src}&download=1`} />
              <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
                <IconButton label="Show in the files" size="sm" onClick={() => showInFiles(c.path)} className="bg-black/45 text-white backdrop-blur-sm hover:bg-black/65 hover:text-white">
                  <FolderOpen size={14} />
                </IconButton>
                <IconButton label="Download" size="sm" onClick={() => download(c.path)} className="bg-black/45 text-white backdrop-blur-sm hover:bg-black/65 hover:text-white">
                  <Download size={14} />
                </IconButton>
                <FileMore path={c.path} inFiles={false} small iconSize={14} className="bg-black/45 text-white backdrop-blur-sm hover:bg-black/65 hover:text-white" />
              </div>
            </div>
          );
        })}
      </div>
      <figcaption className="mt-1.5 flex max-w-[40rem] items-start gap-3 px-0.5 text-[12.5px] leading-snug text-fg-3">
        <span className="min-w-0 flex-1">
          {prompt && (
            <span className="line-clamp-2" translate="no">
              {prompt}
            </span>
          )}
          {model && (
            <span className="text-[11.5px] text-fg-3/80" translate="no">
              {model}
            </span>
          )}
        </span>
        <KeepButton path={clips[0].path} prompt={prompt} model={model} sessionKey={sessionKey} className="shrink-0" />
      </figcaption>
    </figure>
  );
}
