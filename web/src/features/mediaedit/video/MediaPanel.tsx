// The media panel: the videos, pictures and sounds of this edit, each with its frame and its length. More come from
// this device (sent to the server as a deck's would be), the Library or Files; a voice-over is recorded with the
// microphone. Drag one onto a track of the timeline (V1 the clips, V2 and V3 overlays, A2 music, A3 voice), or
// double-click it to put it at the end of the clips (a sound: at the playhead, as music). Files from the desktop can be
// dropped on the panel (they are imported and added to it) or on the timeline (imported and placed where dropped); the
// editor does the importing (VideoEditor.bring), this file knows what a file is and how to send it.
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, AudioLines, ChevronRight, Film, Folder, FolderOpen, HardDrive, Image as ImageIcon, Mic, Plus, Square } from 'lucide-react';
import { viaLink } from '../../../lib/machine';
import { videoClock, type VideoSize } from '@shared/mediaedit-video';
import type { MediaItem } from '@shared/media';
import { Button, cx, Dialog, inputCls, Throbber } from '../../../components/ui';
import { api, enc } from '../../../lib/api';
import { toastError } from '../../../lib/store';
import { useMedia } from '../../media/state';
import { uploadVideo } from '../../pages/slides/media';
import { keepPicture, keepSound, playUrl, stripUrl, videoFacts } from './api';
import type { PoolItem } from './model';
import { MenuList, PanelHead } from './shell';

const VIDEO = /\.(mp4|m4v|mov|webm)$/i;
const PICTURE = /\.(png|jpe?g|webp|gif|bmp)$/i;
const SOUND = /\.(mp3|wav|m4a|aac|ogg|oga|opus|flac)$/i;
const CAPTIONS = /\.(srt|vtt)$/i;

/** What a file from this device is, by its type or its name: a video, a picture, a sound, captions (.srt, .vtt), or none of them. */
export function kindOfFile(f: File): 'video' | 'picture' | 'sound' | 'captions' | null {
  if (f.type.startsWith('video/') || VIDEO.test(f.name)) return 'video';
  if (f.type.startsWith('image/') || PICTURE.test(f.name)) return 'picture';
  if (f.type.startsWith('audio/') || SOUND.test(f.name)) return 'sound';
  if (CAPTIONS.test(f.name) || f.type === 'text/vtt' || f.type === 'application/x-subrip') return 'captions';
  return null;
}

/** A video, picture or sound from this device sent to the editor and read: what goes in the media panel. `onShare` hears how much of a video is sent. */
export async function importFile(f: File, kind: 'video' | 'picture' | 'sound', onShare: (share: number) => void): Promise<PoolItem> {
  const name = f.name.replace(/\.[^.]+$/, '');
  const src = kind === 'video' ? await uploadVideo(f, onShare) : kind === 'picture' ? await keepPicture(f) : (await keepSound(f)).src;
  return poolItemOf(src, name);
}

/** Something of this edit's, read: its facts from the server. */
export async function poolItemOf(src: string, name: string): Promise<PoolItem> {
  const f = await videoFacts(src);
  if (!f.ffmpeg) throw new Error(f.why ?? 'Video editing needs ffmpeg');
  const facts: VideoSize = { duration: f.duration ?? 0, width: f.width ?? 0, height: f.height ?? 0, ...(f.picture ? { picture: true } : {}), ...(f.audio ? { audio: true } : {}), ...(f.fps ? { fps: f.fps } : {}) };
  return { src, kind: f.picture ? 'picture' : f.sound ? 'sound' : 'video', name, facts };
}

export function MediaPanel({ pool, onAdd, onUse, onRecorded, sending, onFiles }: { pool: PoolItem[]; onAdd: (it: PoolItem) => void; onUse: (it: PoolItem) => void; onRecorded: (it: PoolItem) => void; sending: { name: string; share: number }[]; onFiles: (files: File[]) => void }) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [dialog, setDialog] = useState<'library' | 'files' | null>(null);
  // Files dragged over it from the desktop.
  const [over, setOver] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const addBtn = useRef<HTMLButtonElement>(null);
  const rec = useRecorder(onRecorded);

  return (
    <div
      className={cx('flex h-full min-h-0 flex-col bg-panel', over && 'ring-2 ring-accent ring-inset')}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && setOver(false)}
      onDrop={(e) => {
        setOver(false);
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        onFiles(Array.from(e.dataTransfer.files));
      }}
    >
      <PanelHead title="Media">
        <button
          type="button"
          onClick={rec.on ? rec.stop : rec.start}
          title={rec.on ? 'Stop recording' : 'Record a voice-over with the microphone'}
          className={cx('flex h-6 items-center gap-1 rounded-md px-1.5 text-[11.5px]', rec.on ? 'bg-err/15 text-err' : 'text-fg-3 hover:bg-bg-2 hover:text-fg')}
        >
          {rec.on ? <Square size={11} fill="currentColor" /> : <Mic size={13} />}
          {rec.on ? videoClock(rec.seconds) : 'Record'}
        </button>
        <button ref={addBtn} type="button" onClick={() => {
          const r = addBtn.current!.getBoundingClientRect();
          setMenu(menu ? null : { x: r.right - 220, y: r.bottom + 4 });
        }} className="flex h-6 items-center gap-1 rounded-md px-1.5 text-[11.5px] text-fg-2 hover:bg-bg-2 hover:text-fg">
          <Plus size={13} />
          Add
        </button>
      </PanelHead>
      {menu && (
        <>
          <div className="fixed inset-0 z-[60]" onPointerDown={() => setMenu(null)} />
          <MenuList
            x={menu.x}
            y={menu.y}
            width={220}
            items={[
              { label: 'From this device…', onClick: () => file.current?.click() },
              // At someone's link: only what they bring from their own device.
              ...(viaLink
                ? []
                : [
                    { label: 'From the Library…', onClick: () => setDialog('library') },
                    { label: 'From Files…', onClick: () => setDialog('files') },
                  ]),
            ]}
            onPick={(it) => {
              setMenu(null);
              it.onClick?.();
            }}
          />
        </>
      )}
      <input ref={file} type="file" multiple accept="video/mp4,video/quicktime,video/webm,video/x-m4v,image/*,audio/*,.srt,.vtt" className="hidden" onChange={(e) => (onFiles(Array.from(e.target.files ?? [])), (e.target.value = ''))} />
      <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-2 overflow-y-auto p-2.5">
        {pool.map((it) => (
          <PoolCard key={it.src} it={it} onUse={() => onUse(it)} />
        ))}
        {sending.map((s, i) => (
          <div key={`s${i}`} className="flex aspect-video flex-col items-center justify-center gap-1 rounded-md border border-dashed border-line-2 text-[11px] text-fg-3">
            <Throbber size={14} />
            <span className="max-w-full truncate px-1" translate="no">
              {s.name}
            </span>
            {s.share > 0 && <span className="tnum">{`${Math.round(s.share * 100)}%`}</span>}
          </div>
        ))}
        {rec.error && <p className="col-span-full text-[11.5px] text-err">{rec.error}</p>}
      </div>
      <p className="shrink-0 border-t border-line px-2.5 py-1.5 text-[11px] leading-snug text-fg-3">Drag onto a track, or double-click to put it at the end. Files from your desktop can be dropped here or on a track.</p>
      {dialog === 'library' && <LibraryPicker onClose={() => setDialog(null)} onPick={(it) => onAdd(it)} />}
      {dialog === 'files' && <FilesPicker start={pool.find((x) => x.main)?.src} onClose={() => setDialog(null)} onPick={(it) => onAdd(it)} />}
    </div>
  );
}

function PoolCard({ it, onUse }: { it: PoolItem; onUse: () => void }) {
  const thumb = it.kind === 'video' ? stripUrl(it.src, 1, 120, Math.min(1, it.facts.duration / 3), Math.min(1, it.facts.duration / 3) + 0.1) : it.kind === 'picture' ? playUrl(it.src) : null;
  return (
    <div
      draggable
      data-src={it.src}
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-hydor-media', it.src);
        e.dataTransfer.effectAllowed = 'copy';
      }}
      onDoubleClick={onUse}
      title={`${it.name}: drag onto a track, or double-click to put it at the end`}
      className="group relative cursor-grab overflow-hidden rounded-md border border-line bg-bg-1 hover:border-line-2"
    >
      <div className="relative flex aspect-video items-center justify-center overflow-hidden bg-black/40">
        {thumb ? <img src={thumb} alt="" draggable={false} className="h-full w-full object-cover" /> : <AudioLines size={22} className="text-ok" />}
        <span className="absolute top-1 left-1 flex h-4 items-center rounded bg-black/55 px-1 text-white">{it.kind === 'video' ? <Film size={10} /> : it.kind === 'picture' ? <ImageIcon size={10} /> : <AudioLines size={10} />}</span>
        {it.kind !== 'picture' && <span className="tnum absolute right-1 bottom-1 rounded bg-black/55 px-1 text-[10px] text-white">{videoClock(it.facts.duration)}</span>}
        {it.main && <span className="absolute top-1 right-1 rounded bg-accent px-1 text-[9.5px] font-semibold text-accent-fg">Edited</span>}
        <button type="button" onClick={onUse} title="Put it at the end" className="absolute right-1 bottom-1 hidden h-5 w-5 items-center justify-center rounded bg-accent text-accent-fg group-hover:flex">
          <Plus size={12} />
        </button>
      </div>
      <div className="truncate px-1.5 py-1 text-[11px] text-fg-2" translate="no">
        {it.name}
      </div>
    </div>
  );
}

/** The microphone, recording a voice-over: kept as a sound and put on the voice track at the playhead. */
function useRecorder(onDone: (it: PoolItem) => void) {
  const [on, setOn] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<{ mr: MediaRecorder; stream: MediaStream; chunks: Blob[]; at: number; timer: number } | null>(null);
  useEffect(() => () => rec.current?.stream.getTracks().forEach((t) => t.stop()), []);
  const start = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const mr = new MediaRecorder(stream);
      const r = { mr, stream, chunks: [] as Blob[], at: Date.now(), timer: 0 };
      mr.ondataavailable = (e) => e.data.size && r.chunks.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        window.clearInterval(r.timer);
        setOn(false);
        try {
          const kept = await keepSound(new Blob(r.chunks, { type: mr.mimeType || 'audio/webm' }));
          onDone(await poolItemOf(kept.src, `Voice-over ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`));
        } catch (e) {
          setError((e as Error).message);
        }
      };
      r.timer = window.setInterval(() => setSeconds((Date.now() - r.at) / 1000), 200);
      rec.current = r;
      mr.start(500);
      setSeconds(0);
      setOn(true);
    } catch {
      setError('The microphone could not be used: allow it for this page in the browser.');
    }
  };
  const stop = () => rec.current?.mr.state === 'recording' && rec.current.mr.stop();
  return { on, seconds, error, start: () => void start(), stop };
}

/** The Library's videos, pictures and sounds, to pick from. */
function LibraryPicker({ onClose, onPick }: { onClose: () => void; onPick: (it: PoolItem) => void }) {
  const items = useMedia((s) => s.items);
  useEffect(() => {
    useMedia.getState().ensure();
  }, []);
  const [kind, setKind] = useState<'video' | 'image' | 'audio'>('video');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const list = useMemo(() => (items ?? []).filter((m) => m.kind === kind && (!q || m.title.toLowerCase().includes(q.toLowerCase()))), [items, kind, q]);
  const pick = async (m: MediaItem) => {
    setBusy(m.id);
    try {
      onPick(await poolItemOf(`media:${m.id}`, m.title));
      onClose();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
    }
  };
  return (
    <Dialog open onClose={onClose} title="Add from the Library" width={640}>
      <div className="flex flex-wrap items-center gap-2 pb-3">
        {(['video', 'image', 'audio'] as const).map((k) => (
          <button key={k} type="button" onClick={() => setKind(k)} className={cx('h-7 rounded-full border px-3 text-[12.5px]', kind === k ? 'border-accent bg-accent-soft text-fg' : 'border-line text-fg-2 hover:bg-bg-2')}>
            {k === 'video' ? 'Videos' : k === 'image' ? 'Pictures' : 'Sounds'}
          </button>
        ))}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find by name" className={cx(inputCls, 'h-7 min-w-0 flex-1 px-2 text-[12.5px]')} />
      </div>
      <div className="grid max-h-[55vh] grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-2 overflow-y-auto">
        {list.map((m) => (
          <button key={m.id} type="button" disabled={!!busy} onClick={() => void pick(m)} className="overflow-hidden rounded-lg border border-line text-left hover:border-accent disabled:opacity-60">
            <div className="flex aspect-video items-center justify-center bg-black/40">
              {m.kind === 'audio' ? <AudioLines size={22} className="text-ok" /> : <img src={`/api/media/${enc(m.id)}/still`} alt="" className="h-full w-full object-cover" onError={(e) => (e.currentTarget.style.display = 'none')} />}
              {busy === m.id && <Throbber size={16} className="absolute" />}
            </div>
            <div className="truncate px-2 py-1 text-[12px]" translate="no">
              {m.title}
            </div>
          </button>
        ))}
        {items && !list.length && <p className="col-span-full py-6 text-center text-[12.5px] text-fg-3">{q ? 'Nothing by that name.' : 'None in your Library yet.'}</p>}
      </div>
    </Dialog>
  );
}

interface FsList {
  path: string;
  parent: string | null;
  entries: { name: string; path: string; type: string; size: number }[];
}

/** This computer's files, to pick a video, a picture or a sound from. */
function FilesPicker({ start, onClose, onPick }: { start?: string; onClose: () => void; onPick: (it: PoolItem) => void }) {
  const first = start && start.startsWith('/') && !start.startsWith('/api/') ? start.replace(/\/[^/]*$/, '') || '/' : '~';
  const [at, setAt] = useState(first);
  const [list, setList] = useState<FsList | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    api<FsList>(`/api/fs/list?path=${enc(at)}`).then(
      (l) => live && setList(l),
      (e) => {
        toastError(e);
        if (live && at !== '~') setAt('~');
      },
    );
    return () => {
      live = false;
    };
  }, [at]);
  const media = (n: string) => VIDEO.test(n) || PICTURE.test(n) || SOUND.test(n);
  const pick = async (p: string, name: string) => {
    setBusy(p);
    try {
      onPick(await poolItemOf(p, name.replace(/\.[^.]+$/, '')));
      onClose();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
    }
  };
  return (
    <Dialog open onClose={onClose} title="Add from Files" width={600}>
      <div className="flex items-center gap-1.5 pb-2 text-[12px] text-fg-2">
        <Button size="sm" variant="ghost" icon={<ArrowUp size={13} />} disabled={!list?.parent} onClick={() => list?.parent && setAt(list.parent)}>
          Up
        </Button>
        <Button size="sm" variant="ghost" icon={<HardDrive size={13} />} onClick={() => setAt('~')}>
          Home
        </Button>
        <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-fg-3" translate="no">
          {list?.path ?? at}
        </span>
      </div>
      <div className="max-h-[55vh] overflow-y-auto rounded-lg border border-line">
        {!list ? (
          <div className="flex justify-center py-6 text-fg-3">
            <Throbber />
          </div>
        ) : (
          list.entries
            .filter((e) => e.type === 'dir' || media(e.name))
            .map((e) => (
              <button
                key={e.path}
                type="button"
                disabled={!!busy}
                onClick={() => (e.type === 'dir' ? setAt(e.path) : void pick(e.path, e.name))}
                className="flex h-8 w-full items-center gap-2 border-b border-line px-2.5 text-left text-[12.5px] last:border-b-0 hover:bg-bg-2 disabled:opacity-60"
              >
                {e.type === 'dir' ? <Folder size={14} className="text-fg-3" /> : VIDEO.test(e.name) ? <Film size={14} className="text-accent" /> : PICTURE.test(e.name) ? <ImageIcon size={14} className="text-info" /> : <AudioLines size={14} className="text-ok" />}
                <span className="min-w-0 flex-1 truncate" translate="no">
                  {e.name}
                </span>
                {busy === e.path ? <Throbber size={12} /> : e.type === 'dir' ? <ChevronRight size={13} className="text-fg-3" /> : null}
              </button>
            ))
        )}
        {list && !list.entries.some((e) => e.type === 'dir' || media(e.name)) && (
          <p className="flex items-center justify-center gap-1.5 py-6 text-[12.5px] text-fg-3">
            <FolderOpen size={14} /> No videos, pictures or sounds here.
          </p>
        )}
      </div>
    </Dialog>
  );
}

