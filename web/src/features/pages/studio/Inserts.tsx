// What the page editor asks the app for while you write (writing.ts asks, the frame passes it on): an emoji, a
// page's icon or a callout's, a cover (a gradient, a picture from this device or the web, or one made with AI), a
// picture (from this device or the web, made with AI, or a drawing), a video from YouTube or Vimeo (Vimeo's still
// asked of the server), maths in LaTeX (drawn with KaTeX, whose look the page then loads from jsDelivr). Each opens
// beside where it was asked in the page (a sheet from the bottom on a phone) and its answer goes back to its place;
// a picture made with AI goes in as a data: address, as a page keeps its pictures. Also the covers the Page tab
// offers, and the editor's keyboard shortcuts.
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ImageUp, PenTool, Trash2, WandSparkles } from 'lucide-react';
import { videoEmbed } from '@shared/app-media';
import { post } from '../../../lib/api';
import { makeDrawing, makePicture, pageData } from '../../images/studio';
import { Button, cx, Popover, SheetsOnPhone } from '../../../components/ui';
import type { EdAsk } from '../frame';
import { CharPicker } from '../common/CharPicker';
import { loadKatex, texHtml, useTexHtml } from '../common/katex';
import type { ShortcutGroup } from '../common/Shortcuts';
import { pictureData } from './Inspector';

/** Covers of a few colours, light and dark alike. */
export const COVER_GRADIENTS: { css: string; name: string }[] = [
  { css: 'linear-gradient(135deg,#f6d365,#fda085)', name: 'Sunrise' },
  { css: 'linear-gradient(135deg,#a1c4fd,#c2e9fb)', name: 'Sky' },
  { css: 'linear-gradient(135deg,#d4fc79,#96e6a1)', name: 'Meadow' },
  { css: 'linear-gradient(135deg,#fbc2eb,#a6c1ee)', name: 'Lilac' },
  { css: 'linear-gradient(135deg,#89f7fe,#66a6ff)', name: 'Lagoon' },
  { css: 'linear-gradient(135deg,#ff9a9e,#fecfef)', name: 'Blossom' },
  { css: 'linear-gradient(135deg,#667eea,#764ba2)', name: 'Dusk' },
  { css: 'linear-gradient(135deg,#434343,#0f0f0f)', name: 'Night' },
];

const fieldCls = 'h-8 w-full min-w-0 rounded-lg border border-line bg-bg-1 px-2.5 text-[13px] text-fg outline-none placeholder:text-fg-3 focus:border-accent/60';

/**
 * A Vimeo video's still, from the app's server (POST /api/pages/video-still, which the slides editor's Video uses too): a
 * picture's address the page can show (https, or a data: picture), or nothing when the server can't tell (or is older and
 * has no such route) within a few seconds.
 */
export function videoStill(url: string): Promise<string | undefined> {
  const late = new Promise<undefined>((r) => setTimeout(() => r(undefined), 8000));
  const asked = post<{ src?: unknown }>('/api/pages/video-still', { url }).then(
    (r) => (typeof r.src === 'string' && /^(https:\/\/|data:image\/)/.test(r.src) ? r.src : undefined),
    () => undefined,
  );
  return Promise.race([asked, late]);
}

/** A picture from this device, as a big button: made small enough to live in the page. */
function DeviceButton({ onPicture, onError, children }: { onPicture: (src: string) => void; onError: (e: unknown) => void; children: ReactNode }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <Button size="sm" variant="secondary" icon={<ImageUp size={14} />} onClick={() => ref.current?.click()}>
        {children}
      </Button>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) pictureData(f).then(onPicture, onError);
        }}
      />
    </>
  );
}

/** An address typed, sent with Enter or the button. */
function AddressRow({ placeholder, label, onSend, check, button = 'Add', autoFocus }: { placeholder: string; label: string; onSend: (url: string) => void; check?: (url: string) => string | null; button?: string; autoFocus?: boolean }) {
  const [v, setV] = useState('');
  const [err, setErr] = useState('');
  const send = () => {
    const url = v.trim();
    if (!url) return;
    const bad = check?.(url) ?? (/^https?:\/\/\S+$/i.test(url) ? null : 'That is not a web address (https://…)');
    if (bad) return setErr(bad);
    onSend(url);
  };
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <input
          autoFocus={autoFocus}
          value={v}
          onChange={(e) => (setV(e.target.value), setErr(''))}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), send())}
          placeholder={placeholder}
          aria-label={label}
          spellCheck={false}
          className={fieldCls}
        />
        <Button size="sm" variant="primary" onClick={send} disabled={!v.trim()}>
          {button}
        </Button>
      </div>
      {err && <p className="text-[12px] text-err">{err}</p>}
    </div>
  );
}

/** A gradient as a browser writes it back (rgb() for #hex), so the page's cover is found among the ones offered. */
const asWritten = (css: string) => {
  const el = document.createElement('div');
  el.style.backgroundImage = css;
  return el.style.backgroundImage.replace(/\s/g, '');
};

/** A cover made with AI: a calm, wide background, made small enough to live in the page; null when none was made. */
export async function aiCover(): Promise<string | null> {
  const p = await makePicture({ kind: 'background', aspect: '21:9' });
  return p ? pageData(p.src) : null;
}

/** A picture made with AI, or a drawing (SVG), as a page keeps it (a data: address) with its words for a description; null when none was made. */
export async function aiPicture(tool: 'picture' | 'drawing'): Promise<{ src: string; alt: string } | null> {
  const p = tool === 'picture' ? await makePicture({ kind: 'picture' }) : await makeDrawing({ kind: 'illustration' });
  return p ? { src: await pageData(p.src), alt: (p.prompt ?? '').replace(/\s+/g, ' ').slice(0, 300) } : null;
}

/** The covers to choose from: gradients, a picture from this device, one made with AI (`onAi`), one from the web, and none. */
export function CoverChoices({ onPick, onRemove, onAi, onError, current }: { onPick: (c: { gradient: string } | { src: string }) => void; onRemove?: () => void; onAi?: () => void; onError: (e: unknown) => void; current?: string }) {
  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-4 gap-1.5">
        {COVER_GRADIENTS.map((g) => (
          <button
            key={g.css}
            type="button"
            title={g.name}
            aria-label={g.name}
            onClick={() => onPick({ gradient: g.css })}
            style={{ backgroundImage: g.css }}
            className={cx('h-10 rounded-lg border border-line-2 transition-transform hover:scale-[1.04]', !!current && asWritten(current) === asWritten(g.css) && 'ring-2 ring-accent ring-offset-1 ring-offset-elevated')}
          />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <DeviceButton onPicture={(src) => onPick({ src })} onError={onError}>
          A picture from this device
        </DeviceButton>
        {onAi && (
          <Button size="sm" variant="secondary" icon={<WandSparkles size={14} />} onClick={onAi}>
            Make with AI
          </Button>
        )}
        {onRemove && (
          <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={onRemove}>
            Remove the cover
          </Button>
        )}
      </div>
      <AddressRow placeholder="https://… a picture on the web" label="A picture's address" onSend={(src) => onPick({ src })} />
    </div>
  );
}

/** Maths in LaTeX, drawn as it is typed. */
function MathForm({ tex: start, onDone }: { tex: string; onDone: (tex: string) => void }) {
  const [tex, setTex] = useState(start || 'E = mc^2');
  const html = useTexHtml(tex, true);
  return (
    <div className="space-y-2">
      <textarea
        autoFocus
        value={tex}
        onChange={(e) => setTex(e.target.value)}
        onKeyDown={(e) => (e.key === 'Enter' && (e.ctrlKey || e.metaKey) ? (e.preventDefault(), tex.trim() && onDone(tex.trim())) : undefined)}
        rows={3}
        spellCheck={false}
        aria-label="LaTeX"
        placeholder="\frac{a}{b}, \sqrt{x}, \sum_{i=1}^n i"
        className="block w-full resize-y rounded-lg border border-line bg-bg-1 px-2.5 py-2 font-mono text-[12.5px] text-fg outline-none focus:border-accent/60"
      />
      <div translate="no" className="min-h-12 overflow-x-auto rounded-lg bg-bg-2 px-3 py-2 text-center text-fg">
        {html ? <span dangerouslySetInnerHTML={{ __html: html }} /> : <span className="text-[12px] text-fg-3">…</span>}
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11.5px] text-fg-3">LaTeX, drawn with KaTeX · Ctrl+Enter</span>
        <Button size="sm" variant="primary" disabled={!tex.trim()} onClick={() => onDone(tex.trim())}>
          {start ? 'Change it' : 'Insert'}
        </Button>
      </div>
    </div>
  );
}

const TITLES: Record<EdAsk['what'], string> = {
  emoji: 'Emoji',
  icon: 'The page’s icon',
  'callout-icon': 'The callout’s icon',
  cover: 'The page’s cover',
  picture: 'A picture',
  video: 'A video from YouTube or Vimeo',
  math: 'Maths',
};
const WIDTHS: Record<EdAsk['what'], number> = { emoji: 336, icon: 336, 'callout-icon': 336, cover: 320, picture: 340, video: 360, math: 420 };

/**
 * What the editor asked for, beside where it was asked: its answer goes to the editor (`answer`, which puts it in
 * place), or straight to it as a command (`cmd`: taking an icon or a cover away).
 */
export function InsertPopover({
  ask,
  frame,
  answer,
  cmd,
  onClose,
  onError,
}: {
  ask: EdAsk | null;
  frame: () => HTMLIFrameElement | null;
  answer: (payload: Record<string, unknown>) => void;
  cmd: (c: string, arg?: unknown) => void;
  onClose: () => void;
  onError: (e: unknown) => void;
}) {
  const anchor = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  // Where it was asked, from the frame's pixels to the app's (the frame may be scaled down to a phone's or a tablet's width).
  useLayoutEffect(() => {
    const f = frame();
    if (!ask || !f) return setBox(null);
    const fr = f.getBoundingClientRect();
    const k = f.offsetWidth ? fr.width / f.offsetWidth : 1;
    const r = ask.rect ?? { x: 0, y: 0, w: f.offsetWidth, h: 0 };
    setBox({ left: fr.left + r.x * k, top: fr.top + r.y * k, width: Math.max(1, r.w * k), height: Math.max(1, r.h * k) });
  }, [ask, frame]);
  if (!ask) return null;
  const id = ask.id;
  const done = (payload: Record<string, unknown>) => {
    answer({ id, ...payload });
    onClose();
  };
  /** Made in a dialog of its own: this closes first, and the answer goes to its place when (and if) something is made. */
  const later = (make: () => Promise<Record<string, unknown> | null>) => {
    onClose();
    make().then((payload) => payload && answer({ id, ...payload }), onError);
  };
  let body: ReactNode = null;
  if (ask.what === 'emoji' || ask.what === 'icon' || ask.what === 'callout-icon') {
    body = (
      <>
        <CharPicker kinds={ask.what === 'emoji' ? ['emoji', 'symbols'] : ['emoji']} onPick={(ch) => done({ char: ch })} />
        {ask.what === 'icon' && ask.has && (
          <div className="border-t border-line p-1.5">
            <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => (cmd('icon', null), onClose())}>
              Remove the icon
            </Button>
          </div>
        )}
      </>
    );
  } else if (ask.what === 'cover') {
    body = (
      <div className="p-2">
        <CoverChoices
          onPick={(c) => done({ cover: c })}
          onRemove={ask.has ? () => (cmd('cover', null), onClose()) : undefined}
          onAi={() =>
            later(async () => {
              const src = await aiCover();
              return src ? { cover: { src } } : null;
            })
          }
          onError={onError}
        />
      </div>
    );
  } else if (ask.what === 'picture') {
    body = (
      <div className="space-y-2.5 p-2">
        <div className="flex flex-wrap gap-1.5">
          <DeviceButton onPicture={(src) => done({ src })} onError={onError}>
            A picture from this device
          </DeviceButton>
          <Button size="sm" variant="secondary" icon={<WandSparkles size={14} />} onClick={() => later(() => aiPicture('picture'))}>
            Make with AI
          </Button>
          <Button size="sm" variant="secondary" icon={<PenTool size={14} />} onClick={() => later(() => aiPicture('drawing'))}>
            A drawing (SVG)
          </Button>
        </div>
        <AddressRow autoFocus placeholder="https://… a picture on the web" label="A picture's address" onSend={(src) => done({ src })} />
        <p className="text-[11.5px] leading-snug text-fg-3">You can also drop a picture on the page, or paste one.</p>
      </div>
    );
  } else if (ask.what === 'video') {
    body = (
      <div className="space-y-2 p-2">
        <AddressRow
          autoFocus
          placeholder="https://www.youtube.com/watch?v=…"
          label="The video's address"
          check={(url) => (videoEmbed(url) ? null : 'That is not a YouTube or Vimeo address')}
          onSend={(url) => {
            const play = videoEmbed(url)!;
            const yt = /\/embed\/([\w-]{6,20})/.exec(play)?.[1];
            if (yt) return done({ href: url, play, thumb: `https://i.ytimg.com/vi/${yt}/hqdefault.jpg` });
            // Vimeo's still is asked of the app's server; without one, the video goes in on a plain dark still.
            void videoStill(url).then((thumb) => done({ href: url, play, thumb }));
          }}
        />
        <p className="text-[11.5px] leading-snug text-fg-3">The page shows its still; a click plays it.</p>
      </div>
    );
  } else if (ask.what === 'math') {
    body = (
      <div className="p-2">
        <MathForm
          tex={ask.tex ?? ''}
          onDone={(tex) => {
            Promise.all([texHtml(tex, true), loadKatex()])
              .then(([html, k]) => done({ tex, html, css: `https://cdn.jsdelivr.net/npm/katex@${(k as { version?: string }).version ?? '0.19.0'}/dist/katex.min.css` }))
              .catch(onError);
          }}
        />
      </div>
    );
  }
  return (
    <SheetsOnPhone.Provider value>
      {box && createPortal(<div ref={anchor} aria-hidden className="pointer-events-none fixed" style={{ left: box.left, top: box.top, width: box.width, height: box.height }} />, document.body)}
      <Popover anchor={anchor} open={!!box} onClose={onClose} width={WIDTHS[ask.what]} title={TITLES[ask.what]}>
        {body}
      </Popover>
    </SheetsOnPhone.Provider>
  );
}

/** The page editor's keys, for its shortcuts dialog (keys as the editors write them: ⌘ on a Mac). */
export const PAGE_SHORTCUTS: ShortcutGroup[] = [
  {
    title: 'Writing',
    items: [
      ['Enter', 'A new block after this one (in a list, the next item)'],
      ['Shift+Enter', 'A line break in the block'],
      ['Backspace', 'At a block’s start: join it to the block before'],
      ['Tab / Shift+Tab', 'Nest or un-nest a list’s item, or a block after a list'],
      ['↑ / ↓', 'From the first or last line: into the block above or below'],
      ['/', 'The blocks to add (in an empty block, or after a space)'],
      ['@', 'A link to another page of your Library'],
      ['Esc', 'Stop writing, and pick the block'],
    ],
  },
  {
    title: 'Turn into',
    items: [
      ['Ctrl+/', 'Turn into: the kinds of block'],
      ['Ctrl+Alt+0', 'Text'],
      ['Ctrl+Alt+1', 'Heading 1'],
      ['Ctrl+Alt+2', 'Heading 2'],
      ['Ctrl+Alt+3', 'Heading 3'],
      ['Ctrl+Shift+7', 'Numbered list'],
      ['Ctrl+Shift+8', 'Bulleted list'],
      ['Ctrl+Shift+9', 'To-do list'],
      ['Ctrl+Enter', 'Tick a to-do, open or fold a toggle, leave a code block'],
    ],
  },
  {
    title: 'Words',
    items: [
      ['Ctrl+B', 'Bold'],
      ['Ctrl+I', 'Italic'],
      ['Ctrl+U', 'Underline'],
      ['Ctrl+Shift+S', 'Strike through'],
      ['Ctrl+E', 'Code'],
      ['Ctrl+K', 'Make it a link'],
      ['Ctrl+Alt+M', 'Comment on the block, or the words picked'],
    ],
  },
  {
    title: 'Markdown as you type',
    items: [
      ['# ', 'Heading 1 (## and ### for 2 and 3)'],
      ['- ', 'Bulleted list'],
      ['1. ', 'Numbered list'],
      ['[] ', 'To-do list'],
      ['> ', 'Quote'],
      ['```', 'Code block'],
      ['---', 'A line across'],
      ['**words**', 'Bold'],
      ['*words*', 'Italic'],
      ['`words`', 'Code'],
      ['~~words~~', 'Struck through'],
    ],
  },
  {
    title: 'Blocks and parts',
    items: [
      ['Ctrl+D', 'Duplicate'],
      ['Ctrl+Shift+↑ / Ctrl+Shift+↓', 'Move the block up or down'],
      ['Shift+click', 'Pick several blocks'],
      ['Ctrl+C / Ctrl+X / Ctrl+V', 'Copy, cut and paste what is picked'],
      ['Delete', 'Delete what is picked'],
      ['Enter', 'Write in the part picked'],
      ['Esc', 'Pick the part around it'],
      ['Ctrl+G / Ctrl+Shift+G', 'Wrap it in a block, or take out what is in it'],
    ],
  },
  {
    title: 'The page',
    items: [
      ['Ctrl+Z / Ctrl+Shift+Z', 'Undo and redo'],
      ['Ctrl+S', 'Save'],
      ['Ctrl+Shift+/', 'Keyboard shortcuts'],
    ],
  },
];
