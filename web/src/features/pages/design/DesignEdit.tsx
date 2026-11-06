// A design in Edit (Canva's or Adobe Express's way): its artboards in the page's frame, where the design editor
// (server/pages/design-editor.ts) moves, sizes, turns, snaps and groups what is on them; the Add panel on the left
// (words, shapes, frames, pictures, icons, QR codes, videos, backgrounds, the brand), the inspector on the right (what
// is picked, or the artboard), and a bar on top: undo, redo, Resize (a copy at another size), Download (PNG, JPG or a
// PDF to print) and the zoom. In a narrow panel, Add opens over the page and the inspector sits under it.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Download, Maximize, Minus, PanelLeftClose, PanelLeftOpen, Plus, Redo2, Scaling, Undo2 } from 'lucide-react';
import { designSize, isDesignHtml, type DesignSize } from '@shared/design';
import { fontsHref } from '@shared/design-fonts';
import { post } from '../../../lib/api';
import { toast, toastError } from '../../../lib/store';
import { Button, cx, Dialog, IconButton, MenuItem, MenuSep, Popover } from '../../../components/ui';
import { tr } from '../../../i18n/runtime';
import { EditFrame, type EditHandle, type EdState, type Store } from '../frame';
import { editKept } from '../../mediaedit/open';
import { editKeptVideo } from '../../mediaedit/video/open';
import { pageData } from '../../images/studio';
import { pictureData } from '../studio/Inspector';
import { firstFrame, uploadVideo } from '../slides/media';
import { DesignAdd } from './AddPanel';
import { DesignInspector } from './Inspector';
import { DownloadDialog, ResizeDialog } from './dialogs';
import { DEFAULT_LOOK, designLabels, type Look } from './elements';
import { useBrand } from './brand';

/** What the design editor says is picked (design-editor.ts `tell`). */
export interface DEl {
  type: string;
  name: string;
  path: number[];
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
  fx: boolean;
  fy: boolean;
  locked: boolean;
  inGroup: boolean;
  style: Record<string, string>;
  inline: Record<string, string>;
  words?: string;
  curve?: string;
  highlight?: string;
  frame?: string;
  shape?: string;
  icon?: string;
  qr?: string;
  empty?: boolean;
  arrow?: boolean;
  src?: string;
  alt?: string;
  imgFilter?: string;
  natural?: { w: number; h: number };
  video?: { src: string; controls: boolean; loop: boolean; muted: boolean; autoplay: boolean };
  editing: boolean;
  cropping: boolean;
}
export interface DSel {
  design: true;
  kind: 'board' | 'el' | 'many';
  count: number;
  board: { index: number; count: number; w: number; h: number; bg: string; bgColor: string; bgImage: string } | null;
  el: DEl | null;
  many: { x: number; y: number; w: number; h: number; types: string[]; locked: boolean } | null;
  canGroup: boolean;
  scope: boolean;
}

export type DCmd = (c: string, arg?: unknown) => void;

/** Elements copied in a design, to paste in another while the app is open. */
let designClip: string | null = null;

/** A video of the app's, by its own address in a page ("/pg/video/<sha>/<sig>"), as the video editor names it. */
export const videoSrcOf = (url: string) => {
  const m = /\/pg\/video\/([a-f0-9]{16,64})\//.exec(url);
  return m ? `naget-video:${m[1]}` : null;
};

/** A kept video's address for a page (signed by the server: it plays without the app's sign-in). */
export const videoAddress = async (src: string) => (await post<{ url: string }>('/api/pages/video-address', { src })).url;

/** A picture's size, read from its data. */
export const sizeOfPicture = (src: string) =>
  new Promise<{ w: number; h: number }>((ok) => {
    const i = new Image();
    i.onload = () => ok({ w: i.naturalWidth, h: i.naturalHeight });
    i.onerror = () => ok({ w: 0, h: 0 });
    i.src = src;
  });

/** A video from this device, kept by the app: its address for the page, its first frame as its still, its size. */
export async function deviceVideo(file: File, onProgress?: (n: number) => void) {
  const [src, frame] = await Promise.all([uploadVideo(file, onProgress ?? (() => {})), firstFrame(file)]);
  return { url: await videoAddress(src), poster: frame?.data, w: frame?.w ?? 16, h: frame?.h ?? 9 };
}

const ZOOMS = [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];

export function DesignEdit({
  editRef,
  html,
  base,
  title,
  store,
  onState,
  onSave,
  onAsk,
}: {
  editRef: React.RefObject<EditHandle | null>;
  html: string;
  base?: string;
  title: string;
  store: Store;
  onState: (s: EdState) => void;
  onSave: () => void;
  /** Puts a note on what is picked in the message box (the agent beside the page). */
  onAsk?: (text: string) => void;
}) {
  const [sel, setSel] = useState<DSel | null>(null);
  const [zoom, setZoom] = useState({ zoom: 1, fit: true });
  const [boards, setBoards] = useState<{ list: { w: number; h: number }[]; current: number }>({ list: [], current: 0 });
  const [used, setUsed] = useState<{ colours: string[]; fonts: string[] }>({ colours: [], fonts: [] });
  const [ed, setEd] = useState<EdState>({ dirty: false, canUndo: false, canRedo: false });
  const [width, setWidth] = useState(0);
  const shell = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = shell.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const wide = width >= 1120;
  const beside = width >= 760;
  const [addShown, setAddShown] = useState(true);
  const [addOver, setAddOver] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [resizing, setResizing] = useState(false);
  const [zoomMenu, setZoomMenu] = useState(false);
  const zoomRef = useRef<HTMLButtonElement>(null);
  const menuAnchor = useRef<HTMLSpanElement>(null);
  const [focusWords, setFocusWords] = useState(0);
  const labels = useMemo(() => designLabels(), []);
  const brand = useBrand();
  const pending = useRef(new Map<string, (v: unknown) => void>());
  const cmd: DCmd = useCallback((c, arg) => editRef.current?.cmd(c, arg), [editRef]);
  /** Asks the frame something it answers with a message of its own (wa-ed-design `what`, by an id). */
  const askFrame = useCallback(
    <T,>(c: string, arg: Record<string, unknown> = {}): Promise<T | null> =>
      new Promise((ok) => {
        const id = Math.random().toString(36).slice(2);
        pending.current.set(id, ok as (v: unknown) => void);
        cmd(c, { ...arg, id });
        window.setTimeout(() => {
          if (pending.current.delete(id)) ok(null);
        }, 20_000);
      }),
    [cmd],
  );
  useEffect(() => onState(ed), [ed]);

  const board = sel?.board ?? (boards.list[boards.current] ? { ...boards.list[boards.current], index: boards.current, count: boards.list.length, bg: '', bgColor: '', bgImage: '' } : null);
  const size: DesignSize | undefined = useMemo(() => designSize(/data-size="([\w-]+)"/.exec(html.slice(0, 20000))?.[1] ?? ''), [html]);

  /** What the Add panel's elements are made in: the brand's fonts and colours, else what the design uses. */
  const look: Look = useMemo(() => {
    const cs = used.colours;
    const fonts = [...(brand?.fonts ?? []), ...used.fonts].filter(Boolean);
    return {
      head: brand?.fonts?.[0] || used.fonts[0] || DEFAULT_LOOK.head,
      body: brand?.fonts?.[1] || used.fonts[1] || fonts[0] || DEFAULT_LOOK.body,
      ink: cs.find((c) => /^#[0-3]/.test(c)) ?? DEFAULT_LOOK.ink,
      accent: brand?.colours?.[0] ?? cs.find((c) => !/^#(f|e|0|1|2)/.test(c)) ?? DEFAULT_LOOK.accent,
      accent2: brand?.colours?.[1] ?? cs.filter((c) => !/^#(f|e|0|1|2)/.test(c))[1] ?? DEFAULT_LOOK.accent2,
      soft: DEFAULT_LOOK.soft,
    };
  }, [brand, used]);
  /** Swatches: the brand's first, then the design's own. */
  const palette = useMemo(() => [...new Set([...(brand?.colours ?? []), ...used.colours])].slice(0, 14), [brand, used.colours]);

  /** A font of Google's in use: the page's link loads it (with the others it uses). */
  const useFont = useCallback(
    (name: string) => {
      const href = fontsHref([...used.fonts, name]);
      if (href) cmd('fontsHref', href);
      setUsed((u) => (u.fonts.includes(name) ? u : { ...u, fonts: [...u.fonts, name] }));
    },
    [cmd, used.fonts],
  );

  /** The picture picked, whole (the editor tells only the start of a long address). */
  const pictureSrc = async () => (await askFrame<string>('pictureSrc')) ?? '';

  /** Edit picture: the picked picture in the picture editor; Save puts it back in its frame, one step to undo. */
  const editPicture = async () => {
    const el = sel?.el;
    if (!el) return;
    try {
      const src = await pictureSrc();
      if (!src) throw new Error('That picture could not be read from the design');
      const abs = /^(data:|https?:)/i.test(src) ? src : new URL(src, new URL(base ?? '', location.href)).href;
      const path = el.path;
      editKept(abs, {
        title: el.alt || tr('Picture'),
        label: title || tr('The design'),
        put: async (r) => {
          if (!r.src) return;
          if (!(await editRef.current?.html().catch(() => ''))) throw new Error('The design it came from is closed: Save a copy keeps the picture in your Library.');
          const data = await pageData(r.src);
          cmd('select', { path });
          cmd('picture', { src: data });
        },
      });
    } catch (e) {
      toastError(e);
    }
  };
  /** Edit video: the picked video in the video editor; Save puts the new one (and its still) in its place. */
  const editVideo = async () => {
    const el = sel?.el;
    const v = el?.video;
    const src = v ? videoSrcOf(v.src) : null;
    if (!el || !src) return toast('Only a video from your device, the Library or made with AI opens in the video editor');
    const path = el.path;
    editKeptVideo(src, {
      title: tr('Video'),
      label: title || tr('The design'),
      put: async (r) => {
        if (!r.src) return;
        try {
          const url = await videoAddress(r.src);
          const poster = r.poster ? await pageData(r.poster).catch(() => undefined) : undefined;
          cmd('select', { path });
          cmd('video', { src: url, poster });
        } catch (e) {
          toastError(e);
        }
      },
    });
  };

  const onDesign = (d: Record<string, unknown>) => {
    switch (d.what) {
      case 'zoom':
        return setZoom({ zoom: Number(d.zoom) || 1, fit: !!d.fit });
      case 'boards':
        return setBoards({ list: (d.list as { w: number; h: number }[]) ?? [], current: Number(d.current) || 0 });
      case 'used':
        return setUsed({ colours: ((d.colours as string[]) ?? []).slice(0, 16), fonts: ((d.fonts as string[]) ?? []).slice(0, 12) });
      case 'menu': {
        const f = editRef.current?.frame()?.getBoundingClientRect();
        return f && setMenu({ x: f.left + Number(d.x), y: f.top + Number(d.y) });
      }
      case 'action':
        if (d.action === 'editPicture') return void editPicture();
        if (d.action === 'editVideo') return void editVideo();
        if (d.action === 'words') return setFocusWords((n) => n + 1);
        return;
      case 'file': {
        const id = String(d.id ?? '');
        const f = d.file;
        if (!(f instanceof File)) return;
        if (/^video\//.test(f.type)) {
          toast('Adding the video…');
          return void deviceVideo(f)
            .then((v) => cmd('fill', { id, video: v.url, poster: v.poster, w: v.w, h: v.h }))
            .catch(toastError);
        }
        return void pictureData(f)
          .then(async (src) => cmd('fill', { id, src, ...(await sizeOfPicture(src)) }))
          .catch(toastError);
      }
      case 'resized':
      case 'pictureSrc': {
        const done = pending.current.get(String(d.id ?? ''));
        if (!done) return;
        pending.current.delete(String(d.id));
        return done(d.what === 'resized' ? d.html : d.src);
      }
    }
  };

  const ask = () => {
    const el = sel?.el;
    if (!onAsk || !el) return;
    const words = el.words ? ` “${el.words.replace(/\s+/g, ' ').slice(0, 60)}”` : '';
    onAsk(`On the design “${title}”, page ${(sel?.board?.index ?? 0) + 1}, the ${el.name.toLowerCase()}${words}: `);
    toast('In your message box: say what to change', 'ok');
  };

  const add = (
    <DesignAdd
      cmd={cmd}
      board={board ? { w: board.w, h: board.h } : { w: 1080, h: 1080 }}
      look={look}
      palette={palette}
      brand={brand}
      onFont={useFont}
      onDone={() => !wide && setAddOver(false)}
    />
  );

  const menuItems: [string, string | undefined, () => void][] = sel?.kind === 'el' || sel?.kind === 'many'
    ? [
        ['Copy', 'Ctrl+C', () => cmd('copy')],
        ['Paste', 'Ctrl+V', () => cmd('paste', designClip ? { html: designClip } : undefined)],
        ['Duplicate', 'Ctrl+D', () => cmd('dup')],
        ['Copy the look', 'Ctrl+Alt+C', () => cmd('copyStyle')],
        ['Paste the look', 'Ctrl+Alt+V', () => cmd('pasteStyle')],
        ['Bring forward', 'Ctrl+]', () => cmd('order', 'forward')],
        ['Bring to front', 'Ctrl+Shift+]', () => cmd('order', 'front')],
        ['Send backward', 'Ctrl+[', () => cmd('order', 'backward')],
        ['Send to back', 'Ctrl+Shift+[', () => cmd('order', 'back')],
        ...(sel.canGroup ? [['Group', 'Ctrl+G', () => cmd('group')] as [string, string, () => void]] : []),
        ...(sel.el?.type === 'group' ? [['Ungroup', 'Ctrl+Shift+G', () => cmd('ungroup')] as [string, string, () => void]] : []),
        [sel.el?.locked || sel.many?.locked ? 'Unlock' : 'Lock', 'Alt+Shift+L', () => cmd('lock')],
        ...(onAsk && sel.el ? [['Ask the agent', undefined, ask] as [string, undefined, () => void]] : []),
      ]
    : [
        ['Paste', 'Ctrl+V', () => cmd('paste', designClip ? { html: designClip } : undefined)],
        ['Select everything', 'Ctrl+A', () => cmd('selectAll')],
        ['Add a page', undefined, () => cmd('addBoard', {})],
      ];

  const pct = `${Math.round(zoom.zoom * 100)}%`;
  return (
    <div ref={shell} className="flex h-full min-h-0 flex-col">
      <div className="flex h-11 shrink-0 items-center gap-1 border-b border-line bg-panel px-2">
        {wide ? (
          <IconButton label={addShown ? 'Hide the Add panel' : 'Show the Add panel'} size="sm" onClick={() => setAddShown((x) => !x)}>
            {addShown ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
          </IconButton>
        ) : (
          <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => setAddOver(true)}>
            Add
          </Button>
        )}
        <IconButton label="Undo (Ctrl+Z)" size="sm" disabled={!ed.canUndo} onClick={() => cmd('undo')}>
          <Undo2 size={14} />
        </IconButton>
        <IconButton label="Redo (Ctrl+Shift+Z)" size="sm" disabled={!ed.canRedo} onClick={() => cmd('redo')}>
          <Redo2 size={14} />
        </IconButton>
        <span className="ml-1 min-w-0 flex-1 truncate text-[12px] text-fg-3 max-md:hidden">
          {sel?.el?.editing
            ? tr('Writing: Esc when done')
            : sel?.el?.cropping
              ? tr('Drag the picture in its frame, its corners to size it; Enter when done')
              : sel?.kind === 'many'
                ? tr(`${sel.count} picked: drag to move them together`)
                : sel?.kind === 'el'
                  ? tr('Drag to move it, its corners to size it, the round handle to turn it')
                  : tr('Click something to change it; drag across the page to pick several')}
        </span>
        <Button size="sm" variant="ghost" icon={<Scaling size={14} />} onClick={() => setResizing(true)} title="A copy of the design at another size, its elements placed to fit">
          <span className="max-sm:hidden">Resize</span>
        </Button>
        <Button size="sm" variant="ghost" icon={<Download size={14} />} onClick={() => setDownloading(true)} title="PNG, JPG or a PDF to print">
          <span className="max-sm:hidden">Download</span>
        </Button>
        <span className="mx-1 h-5 w-px bg-line" />
        <IconButton label="Zoom out (Ctrl+−)" size="sm" onClick={() => cmd('zoom', 'out')}>
          <Minus size={14} />
        </IconButton>
        <button ref={zoomRef} type="button" onClick={() => setZoomMenu((o) => !o)} className="h-7 min-w-[52px] rounded-md px-1.5 text-[12.5px] font-medium text-fg-2 tabular-nums hover:bg-bg-2" title="Zoom">
          {pct}
        </button>
        <IconButton label="Zoom in (Ctrl+=)" size="sm" onClick={() => cmd('zoom', 'in')}>
          <Plus size={14} />
        </IconButton>
        <Popover anchor={zoomRef} open={zoomMenu} onClose={() => setZoomMenu(false)} align="end" width={170}>
          <MenuItem icon={<Maximize size={14} />} hint="Ctrl+0" onClick={() => (setZoomMenu(false), cmd('zoom', 'fit'))}>
            <span className={cx(zoom.fit && 'font-semibold text-fg')}>Fit</span>
          </MenuItem>
          <MenuSep />
          {ZOOMS.filter((z) => z >= 0.25).map((z) => (
            <MenuItem key={z} onClick={() => (setZoomMenu(false), cmd('zoom', z))}>
              <span className={cx(!zoom.fit && Math.abs(zoom.zoom - z) < 0.001 && 'font-semibold text-fg')}>{`${Math.round(z * 100)}%`}</span>
            </MenuItem>
          ))}
        </Popover>
      </div>
      <div className={cx('flex min-h-0 flex-1', beside ? 'flex-row' : 'flex-col')}>
        {wide && addShown && <aside className="flex min-h-0 w-[300px] shrink-0 flex-col border-r border-line bg-panel">{add}</aside>}
        <div className="relative min-h-0 min-w-0 flex-1">
          <EditFrame
            ref={editRef}
            html={html}
            base={base}
            title={title}
            labels={labels}
            onSel={(s) => setSel(s as unknown as DSel | null)}
            onState={setEd}
            onPalette={() => {}}
            onSave={onSave}
            onReady={() => {
              if (designClip) cmd('clip', { html: designClip });
            }}
            onCopied={(c) => {
              designClip = c.html;
              toast(c.name ? tr(`${c.name} copied`) : tr('Copied'), 'ok');
            }}
            store={store}
            onDesign={onDesign}
          />
          <span ref={menuAnchor} className="pointer-events-none fixed h-0 w-0" style={menu ? { left: menu.x, top: menu.y } : undefined} />
          <Popover anchor={menuAnchor} open={!!menu} onClose={() => setMenu(null)} width={250}>
            {menuItems.map(([label, hint, run]) => (
              <MenuItem key={label} hint={hint} onClick={() => (setMenu(null), run())}>
                {label}
              </MenuItem>
            ))}
            {(sel?.kind === 'el' || sel?.kind === 'many') && (
              <>
                <MenuSep />
                <MenuItem danger hint="Delete" onClick={() => (setMenu(null), cmd('del'))}>
                  Delete
                </MenuItem>
              </>
            )}
          </Popover>
        </div>
        <aside className={cx('flex min-h-0 shrink-0 flex-col bg-panel', beside ? 'w-[300px] border-l border-line' : 'h-[min(46%,420px)] min-h-[200px] border-t border-line')}>
          <DesignInspector
            sel={sel}
            board={board}
            cmd={cmd}
            palette={palette}
            look={look}
            brand={brand}
            usedColours={used.colours}
            onFont={useFont}
            onEditPicture={() => void editPicture()}
            onEditVideo={() => void editVideo()}
            pictureSrc={pictureSrc}
            onAsk={onAsk ? ask : undefined}
            onResize={() => setResizing(true)}
            focusWords={focusWords}
            title={title}
          />
        </aside>
      </div>
      {!wide && (
        <Dialog open={addOver} onClose={() => setAddOver(false)} title="Add" width={420}>
          <div className="-mx-5 -my-3 flex h-[min(70dvh,620px)] flex-col">{add}</div>
        </Dialog>
      )}
      <DownloadDialog open={downloading} onClose={() => setDownloading(false)} html={() => editRef.current?.html() ?? Promise.resolve(html)} title={title} boards={boards.list} current={boards.current} />
      <ResizeDialog
        open={resizing}
        onClose={() => setResizing(false)}
        from={board ? { w: board.w, h: board.h } : null}
        title={title}
        current={size}
        copy={async (s) => {
          const out = await askFrame<string>('resizedCopy', { w: s.w, h: s.h, size: s.id });
          if (!out || !isDesignHtml(out)) throw new Error('The design could not be resized');
          return out;
        }}
        inPlace={(s) => cmd('boardSize', { w: s.w, h: s.h, scale: true, all: true })}
      />
    </div>
  );
}
