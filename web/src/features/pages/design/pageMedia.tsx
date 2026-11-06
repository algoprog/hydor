// Pictures and videos in any page (not only designs): Edit picture and Edit video from the picked part's bar and its
// Part tab (the editors open in a tab; Save puts the new one in its place, one step to undo), and videos from this
// device, the Library or made with AI, kept by the app and played in the page at their signed address (a moving,
// silent background, or with controls). Pages show them at their own address and published too.
import { useState } from 'react';
import { Clapperboard, Film, LibraryBig, SlidersHorizontal } from 'lucide-react';
import { post } from '../../../lib/api';
import { toast, toastError } from '../../../lib/store';
import { Button, Segmented } from '../../../components/ui';
import { tr } from '../../../i18n/runtime';
import type { EdSel } from '../frame';
import { editKept } from '../../mediaedit/open';
import { editKeptVideo } from '../../mediaedit/video/open';
import { makeVideo, pageData } from '../../images/studio';
import { chooseVideo } from '../slides/media';
import { MediaPick } from './dialogs';
import { deviceVideo, videoAddress, videoSrcOf } from './DesignEdit';

type Cmd = (c: string, arg?: unknown) => void;

/** The picked picture's whole address: a long one (inside the page) comes cut short, so it is read from the page. */
async function wholeSrc(sel: EdSel, pageHtml?: () => Promise<string>): Promise<string> {
  const src = sel.attrs.src ?? '';
  if (!src.endsWith('…') || !pageHtml) return src;
  const head = src.slice(0, -1);
  const d = new DOMParser().parseFromString(await pageHtml(), 'text/html');
  let x: Element | null = d.documentElement;
  for (const i of sel.path) x = x?.children[i] ?? null;
  const at = x?.getAttribute('src');
  if (at?.startsWith(head)) return at;
  return [...d.querySelectorAll('img')].map((i) => i.getAttribute('src') ?? '').find((s) => s.startsWith(head)) ?? src;
}

/** Edit picture, for a page's picked picture: Save puts it back in its place (as the page keeps pictures), one step to undo. */
export async function editPagePicture(o: { sel: EdSel; cmd: Cmd; base?: string; pageHtml?: () => Promise<string>; title: string }) {
  try {
    const src = await wholeSrc(o.sel, o.pageHtml);
    if (!src || src.endsWith('…')) throw new Error('That picture could not be read from the page');
    const abs = /^(data:|https?:)/i.test(src) ? src : new URL(src, new URL(o.base ?? '', location.href)).href;
    const path = o.sel.path;
    editKept(abs, {
      title: o.sel.attrs.alt || tr('Picture'),
      label: o.title || tr('The page'),
      put: async (r) => {
        if (!r.src) return;
        if (o.pageHtml && !(await o.pageHtml().catch(() => ''))) throw new Error('The page it came from is closed: Save a copy keeps the picture in your Library.');
        const data = await pageData(r.src);
        o.cmd('select', path);
        o.cmd('attr', { name: 'src', value: data });
      },
    });
  } catch (e) {
    toastError(e);
  }
}

/** Edit video, for a page's picked video (one the app keeps): Save puts the new one and its still in its place. */
export function editPageVideo(o: { sel: EdSel; cmd: Cmd; title: string }) {
  const src = videoSrcOf(o.sel.attrs.src ?? '');
  if (!src) return toast('Only a video from your device, the Library or made with AI opens in the video editor');
  const path = o.sel.path;
  editKeptVideo(src, {
    title: tr('Video'),
    label: o.title || tr('The page'),
    put: async (r) => {
      if (!r.src) return;
      try {
        const url = await videoAddress(r.src);
        const poster = r.poster ? await pageData(r.poster).catch(() => null) : null;
        o.cmd('select', path);
        o.cmd('attr', { name: 'src', value: url });
        if (poster) o.cmd('attr', { name: 'poster', value: poster });
      } catch (e) {
        toastError(e);
      }
    },
  });
}

/** A kept video for a page: its address, its still. */
export interface PageVideo {
  file: string;
  poster?: string;
}

/** The Video popover's other ways: a video from this device, from the Library, or made with AI. */
export function PageVideoButtons({ onDone, onError }: { onDone: (v: PageVideo) => void; onError: (e: unknown) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [pick, setPick] = useState(false);
  const run = (what: string, p: Promise<PageVideo | null>) => {
    setBusy(what);
    p.then((v) => v && onDone(v))
      .catch(onError)
      .finally(() => setBusy(null));
  };
  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        <Button
          size="sm"
          variant="secondary"
          icon={<Film size={14} />}
          disabled={!!busy}
          title={tr('An MP4, MOV or WebM file of up to 200 MB')}
          onClick={() =>
            run(
              'device',
              chooseVideo().then(async (f) => {
                if (!f) return null;
                const v = await deviceVideo(f);
                return { file: v.url, poster: v.poster };
              }),
            )
          }
        >
          {busy === 'device' ? tr('Adding it…') : tr('From this device')}
        </Button>
        <Button size="sm" variant="secondary" icon={<LibraryBig size={14} />} disabled={!!busy} onClick={() => setPick(true)}>
          From your Library
        </Button>
        <Button
          size="sm"
          variant="secondary"
          icon={<Clapperboard size={14} />}
          disabled={!!busy}
          title={tr('Videos cost far more than pictures: it says how much first')}
          onClick={() =>
            run(
              'ai',
              makeVideo({}).then(async (v) => {
                if (!v) return null;
                const poster = v.poster ? await pageData(v.poster).catch(() => undefined) : undefined;
                return { file: await videoAddress(v.src), poster };
              }),
            )
          }
        >
          Make with AI
        </Button>
      </div>
      <MediaPick
        kind={pick ? 'video' : null}
        onClose={() => setPick(false)}
        onPick={(m) => {
          setPick(false);
          run(
            'library',
            post<{ url: string; poster?: string }>('/api/pages/videos/from-media', { media: m.id }).then((r) => ({ file: r.url, poster: r.poster })),
          );
        }}
      />
    </>
  );
}

/** The Part tab's fields for a video the app keeps: Edit video, and how it plays. */
export function PageVideoFields({ sel, cmd, title }: { sel: EdSel; cmd: Cmd; title: string }) {
  const a = sel.attrs;
  const background = 'autoplay' in a && 'muted' in a && !('controls' in a);
  return (
    <div className="space-y-2 pb-2">
      <Button size="sm" variant="secondary" icon={<SlidersHorizontal size={14} />} onClick={() => editPageVideo({ sel, cmd, title })} disabled={!videoSrcOf(a.src ?? '')}>
        Edit video
      </Button>
      <div className="flex items-center gap-2">
        <span className="w-[84px] shrink-0 text-[12px] text-fg-3">{tr('Plays')}</span>
        <Segmented
          size="sm"
          value={background ? 'background' : 'controls'}
          onChange={(m) => {
            for (const k of ['autoplay', 'muted', 'loop', 'controls']) {
              const on = m === 'controls' ? k === 'controls' : k !== 'controls';
              cmd('attr', { name: k, value: on ? '' : null });
            }
          }}
          options={[
            { value: 'controls', label: tr('With controls') },
            { value: 'background', label: tr('Moving, silent') },
          ]}
        />
      </div>
    </div>
  );
}
