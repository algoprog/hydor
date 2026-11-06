// Images an agent made (generate_image), with its reply: while the model works a placeholder of the
// shape asked for; then the pictures, a tap away from full size (the lightbox), download, and keeping them
// in the Library. Without an OpenRouter key, or with the tool turned off, a way to Settings.
import { useEffect, useState } from 'react';
import { Download, FolderOpen, ImageOff, KeyRound, Sparkles } from 'lucide-react';
import type { ToolItem } from '@shared/types';
import { openLightbox } from '../../components/Lightbox';
import { basename, duration } from '../../lib/format';
import { mu } from '../../lib/machine';
import { go, showInFiles } from '../../lib/nav';
import { Button, cx, IconButton } from '../../components/ui';
import { download } from '../documents/FileCards';
import { FileMore } from '../files/SpaceMenu';
import { KeepButton, KeepIcon } from '../media/Keep';
import { OpenRouterKeyCard } from '../connections/OpenRouterKeyCard';

interface Pic {
  path: string;
  w?: number;
  h?: number;
}

/** The saved images, from the tool's answer: one path per line, then "(width×height, size)". */
export function picsOf(output?: string): Pic[] {
  const out: Pic[] = [];
  for (const line of (output ?? '').split('\n')) {
    const m = /^(\/.+?\.(?:png|jpe?g|webp|gif|svg|avif))(?: \((?:(\d+)×(\d+), )?[^)]*\))?$/i.exec(line.trim());
    if (m) out.push({ path: m[1], ...(m[2] ? { w: Number(m[2]), h: Number(m[3]) } : {}) });
  }
  return out;
}

const ratio = (aspect?: string) => {
  const m = /^(\d+):(\d+)$/.exec(aspect ?? '');
  return m ? `${m[1]} / ${m[2]}` : '1 / 1';
};

function Working({ since, aspect, prompt }: { since?: number; aspect?: string; prompt?: string }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="tl-item my-1.5 max-w-[26rem]">
      <div className="relative flex w-full max-w-full items-center justify-center overflow-hidden rounded-xl border border-line bg-bg-2" style={{ aspectRatio: ratio(aspect), maxHeight: 360 }}>
        <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-bg-2 via-bg-3 to-bg-2" />
        <div className="relative flex flex-col items-center gap-2 px-4 text-center text-[13px] text-fg-2">
          <Sparkles size={20} className="spin-gentle text-accent" />
          <span>Making an image{since ? ` · ${duration(Date.now() - since)}` : '…'}</span>
        </div>
      </div>
      {prompt && <p className="mt-1.5 line-clamp-2 px-0.5 text-[12.5px] text-fg-3">{prompt}</p>}
    </div>
  );
}

export function GeneratedImages({ item, sessionKey }: { item: ToolItem; sessionKey: string }) {
  const t = item.tool;
  const input = (t.input ?? {}) as { prompt?: unknown; aspect_ratio?: unknown };
  const prompt = typeof input.prompt === 'string' ? input.prompt : undefined;
  const aspect = typeof input.aspect_ratio === 'string' ? input.aspect_ratio : undefined;
  const pics = picsOf(t.output);
  const [broken, setBroken] = useState<Set<string>>(new Set());
  // While it runs it may be waiting for an OpenRouter key: the card to give one (or skip) shows above it.
  if (t.status === 'running' || t.status === 'pending' || t.status === 'waiting')
    return (
      <>
        <OpenRouterKeyCard sessionKey={sessionKey} />
        <Working since={item.ts} aspect={aspect} prompt={prompt} />
      </>
    );
  if (!pics.length) {
    const text = (t.output || t.error || 'No image was made.').trim();
    const noKey = /no OpenRouter key/i.test(text);
    return (
      <div className="tl-item my-1.5 flex max-w-[34rem] items-start gap-3 rounded-xl border border-line bg-panel px-3 py-2.5">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-bg-2 text-fg-3">{noKey ? <KeyRound size={16} /> : <ImageOff size={16} />}</span>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium text-fg">{noKey ? 'Images need an OpenRouter key' : 'No image this time'}</div>
          <p className="mt-0.5 line-clamp-4 text-[12.5px] leading-snug text-fg-3">{noKey ? 'Image models are reached through OpenRouter. Add your key in Settings → Models, then ask again.' : text}</p>
          {noKey && (
            <Button size="sm" variant="secondary" className="mt-2" icon={<KeyRound size={13} />} onClick={() => go('/settings?s=models')}>
              Add an OpenRouter key
            </Button>
          )}
        </div>
      </div>
    );
  }
  const srcs = pics.map((p) => ({ src: mu(`/api/fs/raw?path=${encodeURIComponent(p.path)}`), name: basename(p.path) }));
  const model = /with ([^\s:(]+)/.exec(t.output ?? '')?.[1];
  return (
    <figure className="tl-item my-1.5">
      <div className={cx('grid gap-2', pics.length > 1 ? 'max-w-[40rem] grid-cols-2' : 'max-w-[30rem]')}>
        {pics.map((p, i) => (
          <div key={p.path} className="group relative overflow-hidden rounded-xl border border-line bg-bg-2" style={p.w && p.h ? { aspectRatio: `${p.w} / ${p.h}` } : undefined}>
            {broken.has(p.path) ? (
              <div className="flex aspect-square flex-col items-center justify-center gap-1.5 text-[12px] text-fg-3">
                <ImageOff size={18} />
                No longer there
              </div>
            ) : (
              <button type="button" onClick={() => openLightbox(srcs, i)} className="block h-full w-full cursor-zoom-in" aria-label={`Show ${basename(p.path)} full size`}>
                <img src={srcs[i].src} alt={prompt ?? ''} loading="lazy" onError={() => setBroken((b) => new Set(b).add(p.path))} className="h-full w-full object-cover" />
              </button>
            )}
            {!broken.has(p.path) && (
              <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
                <IconButton label="Show in the files" size="sm" onClick={() => showInFiles(p.path)} className="bg-black/45 text-white backdrop-blur-sm hover:bg-black/65 hover:text-white">
                  <FolderOpen size={14} />
                </IconButton>
                <IconButton label="Download" size="sm" onClick={() => download(p.path)} className="bg-black/45 text-white backdrop-blur-sm hover:bg-black/65 hover:text-white">
                  <Download size={14} />
                </IconButton>
                {pics.length > 1 && <KeepIcon path={p.path} prompt={prompt} model={model} sessionKey={sessionKey} className="bg-black/45 text-white backdrop-blur-sm hover:bg-black/65 hover:text-white" />}
                <FileMore path={p.path} inFiles={false} small iconSize={14} className="bg-black/45 text-white backdrop-blur-sm hover:bg-black/65 hover:text-white" />
              </div>
            )}
          </div>
        ))}
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
        {pics.length === 1 && !broken.has(pics[0].path) && <KeepButton path={pics[0].path} prompt={prompt} model={model} sessionKey={sessionKey} className="shrink-0" />}
      </figcaption>
    </figure>
  );
}
