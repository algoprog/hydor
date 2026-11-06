// Sound an agent made (generate_audio), with its reply: while the model works a card that says what it makes and
// for how long it has been at it (a song takes a minute or two); then the sound in the app's own player (its shape
// to seek along), its title from its file's name, Edit (the sound editor), download, the files and keeping it in the Library, the lyrics a
// song came with under it. Without an OpenRouter key, a way to Settings.
import { useEffect, useState } from 'react';
import { AudioLines, ChevronRight, Download, FolderOpen, KeyRound, Mic, Music, SlidersHorizontal, VolumeX } from 'lucide-react';
import type { ToolItem } from '@shared/types';
import { basename, duration } from '../../lib/format';
import { mu } from '../../lib/machine';
import { go, showInFiles } from '../../lib/nav';
import { Button, IconButton } from '../../components/ui';
import { AudioPlayer } from '../../components/AudioPlayer';
import { download } from '../documents/FileCards';
import { FileMore } from '../files/SpaceMenu';
import { KeepButton } from '../media/Keep';
import { OpenRouterKeyCard } from '../connections/OpenRouterKeyCard';
import { editSessionSound } from '../mediaedit/audio/open';

interface Sound {
  path: string;
  secs?: number;
  /** Its size as the answer wrote it ("3.4 MB"). */
  size?: string;
}

/** The saved sounds, from the tool's answer: one path per line, then "(12.3 s, size)". */
export function soundsOf(output?: string): Sound[] {
  const out: Sound[] = [];
  for (const line of (output ?? '').split('\n')) {
    const m = /^(\/.+?\.(?:mp3|wav|m4a|ogg|flac|opus|aac))(?: \(([^)]*)\))?$/i.exec(line.trim());
    if (!m) continue;
    const secs = /(\d+(?:\.\d+)?) s\b/.exec(m[2] ?? '');
    const size = /(\d+(?:\.\d+)? [KMG]B)/.exec(m[2] ?? '');
    out.push({
      path: m[1],
      ...(secs ? { secs: Number(secs[1]) } : {}),
      ...(size ? { size: size[1] } : {}),
    });
  }
  return out;
}

/** The lyrics a song came with, from the answer's last part. */
export const lyricsOf = (output?: string) => /\nLyrics:\n([\s\S]+)$/.exec(output ?? '')?.[1].trim();

/** "sunny-bakery-jingle-2.mp3" → "Sunny bakery jingle". */
const titleOf = (p: string) => {
  const s = basename(p)
    .replace(/\.[^.]+$/, '')
    .replace(/-\d+$/, '')
    .replace(/[-_]+/g, ' ')
    .trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : basename(p);
};

type Kind = 'music' | 'speech' | 'sound';

const KIND: Record<Kind, { icon: React.ReactNode; making: string; takes: string }> = {
  music: {
    icon: <Music size={18} />,
    making: 'Making music',
    takes: 'A song takes a minute or two',
  },
  speech: {
    icon: <Mic size={18} />,
    making: 'Making a voice-over',
    takes: 'It takes a few seconds to a minute',
  },
  sound: {
    icon: <AudioLines size={18} />,
    making: 'Making a sound',
    takes: 'It takes a few seconds to a minute',
  },
};

/** Bars that rise and fall while the model works. */
function Busy() {
  return (
    <span className="flex h-6 items-end gap-[3px]" aria-hidden>
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className="w-[3px] animate-pulse rounded-full bg-accent/70"
          style={{
            height: `${[45, 80, 60, 95, 55][i]}%`,
            animationDelay: `${i * 140}ms`,
          }}
        />
      ))}
    </span>
  );
}

function Working({ since, kind, prompt }: { since?: number; kind: Kind; prompt?: string }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const k = KIND[kind];
  return (
    <div className="tl-item my-1.5 max-w-[34rem]">
      <div className="flex items-center gap-3 rounded-xl border border-line bg-panel px-3 py-2.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">{k.icon}</span>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium text-fg">
            {k.making}
            {since ? ` · ${duration(Date.now() - since)}` : '…'}
          </div>
          <div className="text-[12px] text-fg-3">{k.takes}</div>
        </div>
        <Busy />
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

/** A song's lyrics, folded until asked for. */
function Lyrics({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1 max-w-[34rem] px-0.5">
      <button type="button" onClick={() => setOpen((x) => !x)} aria-expanded={open} className="inline-flex items-center gap-1 text-[12.5px] font-medium text-fg-3 hover:text-fg">
        <ChevronRight size={13} className={open ? 'rotate-90 transition-transform' : 'transition-transform'} />
        Lyrics
      </button>
      {open && (
        <p translate="no" className="mt-1 max-h-64 overflow-y-auto rounded-lg bg-bg-1 px-3 py-2 text-[12.5px] leading-relaxed whitespace-pre-wrap text-fg-2">
          {text}
        </p>
      )}
    </div>
  );
}

const ICON = 'h-7 w-7';

export function GeneratedAudio({ item, sessionKey }: { item: ToolItem; sessionKey: string }) {
  const t = item.tool;
  const input = (t.input ?? {}) as {
    prompt?: unknown;
    kind?: unknown;
    lyrics?: unknown;
    turns?: unknown;
  };
  const kind: Kind = input.kind === 'music' || input.kind === 'sound' ? input.kind : 'speech';
  const turns = Array.isArray(input.turns) ? (input.turns as { text?: unknown }[]).map((x) => (typeof x?.text === 'string' ? x.text : '')).filter(Boolean) : [];
  const prompt = typeof input.prompt === 'string' && input.prompt.trim() ? input.prompt : turns.join(' ') || undefined;
  const sounds = soundsOf(t.output);
  // While it runs it may be waiting for an OpenRouter key: the card to give one (or skip) shows above it.
  if (t.status === 'running' || t.status === 'pending' || t.status === 'waiting')
    return (
      <>
        <OpenRouterKeyCard sessionKey={sessionKey} />
        <Working since={item.ts} kind={kind} prompt={prompt} />
      </>
    );
  if (!sounds.length) {
    const text = (t.output || t.error || 'No sound was made.').trim();
    if (/no OpenRouter key/i.test(text))
      return (
        <Note
          icon={<KeyRound size={16} />}
          title="Audio needs an OpenRouter key"
          text="Music, voice and sound models are reached through OpenRouter. Add your key in Settings → Models, then ask again."
          action={
            <Button size="sm" variant="secondary" className="mt-2" icon={<KeyRound size={13} />} onClick={() => go('/settings?s=models')}>
              Add an OpenRouter key
            </Button>
          }
        />
      );
    if (/closed the form/i.test(text)) return <Note icon={<VolumeX size={16} />} title="No sound this time" text="You closed the form, so nothing was made or spent." />;
    return <Note icon={<VolumeX size={16} />} title="No sound this time" text={text} />;
  }
  const model = /with ([^\s:(]+)/.exec(t.output ?? '')?.[1];
  const lyrics = kind === 'music' ? (lyricsOf(t.output) ?? (typeof input.lyrics === 'string' ? input.lyrics : undefined)) : undefined;
  return (
    <figure className="tl-item my-1.5">
      <div className="grid max-w-[34rem] gap-2">
        {sounds.map((s) => {
          const src = mu(`/api/fs/raw?path=${encodeURIComponent(s.path)}`);
          // Its shape is read from the file, unless that is large (a long WAV): then a plain line.
          const mb = s.size ? parseFloat(s.size) * (/GB$/.test(s.size) ? 1024 : /MB$/.test(s.size) ? 1 : 0) : 0;
          const large = mb > 30;
          return (
            <div key={s.path} className="rounded-xl border border-line bg-panel px-3 py-2.5">
              <AudioPlayer
                src={src}
                title={titleOf(s.path)}
                peaks={large ? null : undefined}
                downloadUrl={`${src}&download=1`}
                actions={
                  <span className="flex shrink-0 items-center gap-0.5">
                    <IconButton label="Edit" size="sm" className={ICON} onClick={() => editSessionSound(s.path, sessionKey)}>
                      <SlidersHorizontal size={14} />
                    </IconButton>
                    <IconButton label="Show in the files" size="sm" className={ICON} onClick={() => showInFiles(s.path)}>
                      <FolderOpen size={14} />
                    </IconButton>
                    <IconButton label="Download" size="sm" className={ICON} onClick={() => download(s.path)}>
                      <Download size={14} />
                    </IconButton>
                    <FileMore path={s.path} inFiles={false} small iconSize={14} className={ICON} />
                  </span>
                }
              />
            </div>
          );
        })}
      </div>
      <figcaption className="mt-1.5 flex max-w-[34rem] items-start gap-3 px-0.5 text-[12.5px] leading-snug text-fg-3">
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
        <KeepButton path={sounds[0].path} prompt={prompt} model={model} lyrics={lyrics} sessionKey={sessionKey} className="shrink-0" />
      </figcaption>
      {lyrics && <Lyrics text={lyrics} />}
    </figure>
  );
}
