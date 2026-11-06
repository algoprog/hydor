// A design's Add panel: words (a heading, a subheading, body text, pairs of fonts), elements (shapes, lines, frames to
// drop a picture in, stickers, icons and emoji, a QR code), pictures and videos (from this device, the Library, free
// photos, made with AI, a drawing, collages), the artboard's background (a colour, a gradient, a pattern, a picture, one
// made with AI) and the brand kit. What it adds goes in the middle of what shows of the artboard, picked.
import { useRef, useState, type ReactNode } from 'react';
import { Brush, Clapperboard, Film, Images, ImageUp, LibraryBig, Palette as PaletteIcon, QrCode, Shapes, Smile, Sparkles, Type, WandSparkles } from 'lucide-react';
import { DESIGN_FONTS, FONT_PAIRS, fontStack } from '@shared/design-fonts';
import { FRAME_IDS, FRAME_NAMES, SHAPE_IDS, SHAPE_NAMES, frameCss, shapePath } from '@shared/design-shapes';
import type { BrandKit } from '@shared/design-brand';
import { toast, toastError } from '../../../lib/store';
import { Button, cx } from '../../../components/ui';
import { tr } from '../../../i18n/runtime';
import { aspectOf, makeDrawing, makePicture, makeVideo, pageData } from '../../images/studio';
import { choosePhoto } from '../FreePhotos';
import { IconPicker } from '../slides/IconPicker';
import { chooseVideo } from '../slides/media';
import { pictureData } from '../studio/Inspector';
import { ColorField } from '../studio/fields';
import { boxHtml, COLLAGES, collageHtml, emojiHtml, frameHtml, GRADIENTS, iconHtml, lineHtml, pairHtml, PATTERNS, pictureBg, shapeHtml, STICKERS, stickerHtml, textHtml, type Look } from './elements';
import { BrandDialog } from './BrandDialog';
import { MediaPick, QrDialog } from './dialogs';
import { deviceVideo, sizeOfPicture, videoAddress, type DCmd } from './DesignEdit';

type Tab = 'text' | 'elements' | 'pictures' | 'background' | 'brand';
const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  { id: 'text', label: 'Text', icon: <Type size={15} /> },
  { id: 'elements', label: 'Elements', icon: <Shapes size={15} /> },
  { id: 'pictures', label: 'Pictures', icon: <Images size={15} /> },
  { id: 'background', label: 'Background', icon: <Brush size={15} /> },
  { id: 'brand', label: 'Brand', icon: <PaletteIcon size={15} /> },
];

/** Google's fonts for the previews of the panel (and the inspector's font list), loaded in the app once. */
export function loadFontPreviews() {
  if (document.getElementById('n-design-fonts')) return;
  const l = document.createElement('link');
  l.id = 'n-design-fonts';
  l.rel = 'stylesheet';
  l.href = `https://fonts.googleapis.com/css2?${DESIGN_FONTS.map((f) => `family=${f.name.replace(/ /g, '+')}${f.w.length > 1 ? `:wght@${[400, f.w[f.w.length - 1]].filter((x, i, a) => a.indexOf(x) === i).join(';')}` : ''}`).join('&')}&display=swap`;
  document.head.append(l);
}

const Title = ({ children }: { children: ReactNode }) => <div className="px-1 pt-3 pb-1.5 text-[11.5px] font-semibold tracking-wide text-fg-3 uppercase">{children}</div>;
const Tile = ({ title, onClick, children, className }: { title: string; onClick: () => void; children: ReactNode; className?: string }) => (
  <button type="button" title={title} aria-label={title} onClick={onClick} className={cx('grid aspect-square place-items-center rounded-lg border border-line bg-bg-1 p-1.5 text-fg-2 transition-colors hover:border-line-2 hover:bg-bg-2 hover:text-fg', className)}>
    {children}
  </button>
);
const Wide = ({ icon, children, onClick, hint }: { icon: ReactNode; children: ReactNode; onClick: () => void; hint?: string }) => (
  <button type="button" onClick={onClick} title={hint} className="flex w-full items-center gap-2.5 rounded-lg border border-line bg-bg-1 px-2.5 py-2 text-left text-[13px] text-fg transition-colors hover:border-line-2 hover:bg-bg-2">
    <span className="shrink-0 text-fg-3">{icon}</span>
    <span className="min-w-0 flex-1 truncate">{children}</span>
  </button>
);

export function DesignAdd({ cmd, board, look, palette, brand, onFont, onDone }: { cmd: DCmd; board: { w: number; h: number }; look: Look; palette: string[]; brand: BrandKit | null; onFont: (name: string) => void; onDone: () => void }) {
  const [tab, setTab] = useState<Tab>('text');
  const [icons, setIcons] = useState<'icons' | 'emoji' | null>(null);
  const [qr, setQr] = useState(false);
  const [media, setMedia] = useState<'image' | 'video' | null>(null);
  const [brandOpen, setBrandOpen] = useState(false);
  const files = useRef<HTMLInputElement>(null);
  const W = Math.min(board.w, board.h * 1.4);
  loadFontPreviews();
  const insert = (html: string, fonts: string[] = [], edit = false) => {
    for (const f of fonts) onFont(f);
    cmd('insert', { html, edit });
    onDone();
  };
  const run = (p: Promise<unknown>) => void p.catch(toastError);
  const picture = async (src: string, alt = '') => {
    const data = await pageData(src);
    const s = await sizeOfPicture(data);
    cmd('picture', { src: data, alt, w: s.w, h: s.h, new: true });
    onDone();
  };
  const video = (v: { url: string; poster?: string; w: number; h: number }) => {
    cmd('video', { src: v.url, poster: v.poster, w: v.w, h: v.h, new: true });
    onDone();
  };
  const bg = (css: string | null) => cmd('board', { props: { background: css, 'background-image': null, 'background-color': null } });

  let body: ReactNode;
  if (tab === 'text')
    body = (
      <>
        <div className="space-y-1.5 pt-2">
          <button type="button" onClick={() => insert(textHtml('heading', W, look), [look.head], true)} className="w-full rounded-lg border border-line bg-bg-1 px-3 py-2.5 text-left text-[22px] leading-tight font-extrabold hover:bg-bg-2" style={{ fontFamily: fontStack(look.head) }}>
            {tr('Add a heading')}
          </button>
          <button type="button" onClick={() => insert(textHtml('subheading', W, look), [look.body], true)} className="w-full rounded-lg border border-line bg-bg-1 px-3 py-2 text-left text-[16px] font-semibold hover:bg-bg-2" style={{ fontFamily: fontStack(look.body) }}>
            {tr('Add a subheading')}
          </button>
          <button type="button" onClick={() => insert(textHtml('body', W, look), [look.body], true)} className="w-full rounded-lg border border-line bg-bg-1 px-3 py-2 text-left text-[13px] hover:bg-bg-2" style={{ fontFamily: fontStack(look.body) }}>
            {tr('Add a little bit of body text')}
          </button>
          <button type="button" onClick={() => insert(textHtml('small', W, look), [look.body], true)} className="w-full rounded-lg border border-line bg-bg-1 px-3 py-1.5 text-left text-[11px] font-medium tracking-wider uppercase hover:bg-bg-2" style={{ fontFamily: fontStack(look.body) }}>
            {tr('Add a little text')}
          </button>
        </div>
        <Title>Font pairings</Title>
        <div className="grid grid-cols-2 gap-1.5">
          {FONT_PAIRS.map((p) => (
            <button key={p.id} type="button" title={`${p.head} + ${p.body}`} onClick={() => insert(pairHtml(p, W, look), [p.head, p.body])} className="flex h-[74px] flex-col items-center justify-center gap-0.5 overflow-hidden rounded-lg border border-line bg-bg-1 px-1.5 hover:border-line-2 hover:bg-bg-2">
              <span className={cx('max-w-full truncate text-[19px] leading-tight text-fg', p.upper && 'uppercase')} style={{ fontFamily: fontStack(p.head), fontWeight: p.weight }}>
                {tr(p.label)}
              </span>
              <span className="max-w-full truncate text-[10.5px] text-fg-3" style={{ fontFamily: fontStack(p.body) }}>
                {p.head} · {p.body}
              </span>
            </button>
          ))}
        </div>
      </>
    );
  else if (tab === 'elements')
    body = (
      <>
        <Title>Shapes</Title>
        <div className="grid grid-cols-5 gap-1.5">
          <Tile title={tr('Rectangle')} onClick={() => insert(boxHtml('rect', W, look.accent))}>
            <span className="h-[70%] w-[70%] bg-current" />
          </Tile>
          <Tile title={tr('Rounded rectangle')} onClick={() => insert(boxHtml('rounded', W, look.accent))}>
            <span className="h-[70%] w-[70%] rounded-[22%] bg-current" />
          </Tile>
          <Tile title={tr('Circle')} onClick={() => insert(boxHtml('circle', W, look.accent))}>
            <span className="h-[72%] w-[72%] rounded-full bg-current" />
          </Tile>
          {SHAPE_IDS.map((s) => (
            <Tile key={s} title={tr(SHAPE_NAMES[s])} onClick={() => insert(shapeHtml(s, W, look.accent))}>
              <svg viewBox="0 0 100 100" className="h-[74%] w-[74%]" aria-hidden>
                <path d={shapePath(s)} fill="currentColor" />
              </svg>
            </Tile>
          ))}
        </div>
        <Title>Lines</Title>
        <div className="grid grid-cols-4 gap-1.5">
          {(['solid', 'dashed', 'dotted', 'arrow'] as const).map((s) => (
            <Tile key={s} title={tr(s === 'solid' ? 'Line' : s === 'dashed' ? 'Dashed line' : s === 'dotted' ? 'Dotted line' : 'Arrow')} onClick={() => insert(lineHtml(s, W, look.ink))} className="aspect-[2/1]">
              <svg viewBox="0 0 60 20" className="w-[80%]" aria-hidden>
                <path d="M4 10H54" stroke="currentColor" strokeWidth="3" strokeDasharray={s === 'dashed' ? '8 5' : s === 'dotted' ? '2 5' : undefined} strokeLinecap="round" />
                {s === 'arrow' && <path d="M46 4l8 6-8 6" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />}
              </svg>
            </Tile>
          ))}
        </div>
        <Title>Frames for pictures</Title>
        <div className="grid grid-cols-5 gap-1.5">
          {FRAME_IDS.map((f) => (
            <Tile key={f} title={tr(FRAME_NAMES[f])} onClick={() => insert(frameHtml(f, W, look))}>
              <span className="h-[72%] w-[72%] bg-gradient-to-br from-fg-3/50 to-fg-3/20" style={cssObject(frameCss(f))} />
            </Tile>
          ))}
        </div>
        <Title>Stickers</Title>
        <div className="grid grid-cols-3 gap-1.5">
          {STICKERS.map((s) => (
            <Wide key={s.id} icon={<Sparkles size={14} />} onClick={() => insert(stickerHtml(s.id, W, look), [look.head])}>
              {tr(s.label)}
            </Wide>
          ))}
        </div>
        <Title>Icons, emoji and codes</Title>
        <div className="space-y-1.5">
          <Wide icon={<Shapes size={15} />} onClick={() => setIcons('icons')}>
            {tr('Icons')}
          </Wide>
          <Wide icon={<Smile size={15} />} onClick={() => setIcons('emoji')}>
            {tr('Emoji')}
          </Wide>
          <Wide icon={<QrCode size={15} />} onClick={() => setQr(true)} hint={tr('A link (or any words) as a code a phone’s camera reads')}>
            {tr('QR code')}
          </Wide>
        </div>
      </>
    );
  else if (tab === 'pictures')
    body = (
      <>
        <Title>Pictures</Title>
        <div className="space-y-1.5">
          <Wide icon={<ImageUp size={15} />} onClick={() => files.current?.click()} hint={tr('Or drop them on the page')}>
            {tr('From this device')}
          </Wide>
          <Wide icon={<LibraryBig size={15} />} onClick={() => setMedia('image')}>
            {tr('From your Library')}
          </Wide>
          <Wide icon={<Images size={15} />} onClick={() => run(choosePhoto({}).then((p) => p && picture(p.src, p.photo.title ?? '')))}>
            {tr('Free photos')}
          </Wide>
          <Wide icon={<WandSparkles size={15} />} onClick={() => run(makePicture({ kind: 'picture' }).then((p) => p && picture(p.src, p.prompt ?? '')))} hint={tr('Says what it costs before anything is spent')}>
            {tr('Make with AI')}
          </Wide>
          <Wide icon={<Brush size={15} />} onClick={() => run(makeDrawing({}).then((p) => p && picture(p.src, p.prompt ?? '')))}>
            {tr('A drawing (SVG)')}
          </Wide>
        </div>
        <Title>Collages</Title>
        <div className="grid grid-cols-4 gap-1.5">
          {COLLAGES.map((c) => (
            <Tile key={c.id} title={tr(c.label)} onClick={() => insert(collageHtml(c.id, board, look))}>
              <svg viewBox="0 0 100 100" className="h-[80%] w-[80%]" aria-hidden>
                {c.cells.map(([x, y, w, h], i) => (
                  <rect key={i} x={x * 100 + 2} y={y * 100 + 2} width={w * 100 - 4} height={h * 100 - 4} rx="4" fill="currentColor" opacity={0.25 + (i % 3) * 0.2} />
                ))}
              </svg>
            </Tile>
          ))}
        </div>
        <Title>Videos</Title>
        <div className="space-y-1.5">
          <Wide
            icon={<Film size={15} />}
            onClick={() =>
              run(
                chooseVideo().then(async (f) => {
                  if (!f) return;
                  toast('Adding the video…');
                  video(await deviceVideo(f));
                }),
              )
            }
            hint={tr('An MP4, MOV or WebM file of up to 200 MB')}
          >
            {tr('From this device')}
          </Wide>
          <Wide icon={<LibraryBig size={15} />} onClick={() => setMedia('video')}>
            {tr('From your Library')}
          </Wide>
          <Wide
            icon={<Clapperboard size={15} />}
            onClick={() =>
              run(
                makeVideo({ aspect: aspectOf(board.w, board.h) }).then(async (v) => {
                  if (!v) return;
                  const poster = v.poster ? await pageData(v.poster).catch(() => undefined) : undefined;
                  video({ url: await videoAddress(v.src), poster, w: v.w ?? 16, h: v.h ?? 9 });
                }),
              )
            }
            hint={tr('Videos cost far more than pictures: it says how much first')}
          >
            {tr('Make with AI')}
          </Wide>
        </div>
        <input
          ref={files}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            const list = [...(e.target.files ?? [])].slice(0, 12);
            e.target.value = '';
            run(
              (async () => {
                for (const f of list) {
                  const src = await pictureData(f);
                  const s = await sizeOfPicture(src);
                  cmd('picture', { src, alt: '', w: s.w, h: s.h, new: true });
                }
                onDone();
              })(),
            );
          }}
        />
      </>
    );
  else if (tab === 'background')
    body = (
      <>
        <Title>Colour</Title>
        <ColorField value={null} palette={[...palette, '#ffffff', '#111111']} onChange={(c) => bg(c ?? '#ffffff')} />
        <Title>Gradients</Title>
        <div className="grid grid-cols-5 gap-1.5">
          {GRADIENTS.map((g) => (
            <Tile key={g} title={tr('Gradient')} onClick={() => bg(g)} className="p-0">
              <span className="h-full w-full rounded-[7px]" style={{ background: g }} />
            </Tile>
          ))}
        </div>
        <Title>Patterns</Title>
        <div className="grid grid-cols-6 gap-1.5">
          {PATTERNS.map((p) => (
            <Tile key={p.id} title={tr(p.label)} onClick={() => bg(p.css(look.soft, look.accent))} className="p-0">
              <span className="h-full w-full rounded-[7px]" style={{ background: p.css(look.soft, look.accent).replace(/(\d+)px (\d+)px/g, (_m, a: string, b: string) => `${Math.round(Number(a) / 3)}px ${Math.round(Number(b) / 3)}px`).replace(/ (\d+)px/g, (_m, a: string) => ` ${Math.max(2, Math.round(Number(a) / 3))}px`) }} />
            </Tile>
          ))}
        </div>
        <Title>A picture</Title>
        <div className="space-y-1.5">
          <label className="block">
            <Wide icon={<ImageUp size={15} />} onClick={() => document.getElementById('n-bg-file')?.click()}>
              {tr('From this device')}
            </Wide>
            <input
              id="n-bg-file"
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) run(pictureData(f).then((src) => bg(pictureBg(src))));
              }}
            />
          </label>
          <Wide icon={<WandSparkles size={15} />} onClick={() => run(makePicture({ kind: 'background', aspect: aspectOf(board.w, board.h) }).then(async (p) => p && bg(pictureBg(await pageData(p.src)))))} hint={tr('Says what it costs before anything is spent')}>
            {tr('Make with AI')}
          </Wide>
          <Button size="sm" variant="ghost" onClick={() => bg('#ffffff')}>
            Plain white
          </Button>
        </div>
      </>
    );
  else
    body = brand ? (
      <>
        <Title>Your colours</Title>
        <div className="flex flex-wrap gap-1.5">
          {brand.colours.map((c) => (
            <button key={c} type="button" title={c} onClick={() => bg(c)} className="h-8 w-8 rounded-full border border-line-2" style={{ background: c }} />
          ))}
        </div>
        <p className="px-1 pt-1 text-[11.5px] text-fg-3">{tr('A click makes it the background; the colour fields offer them first.')}</p>
        {brand.fonts.some(Boolean) && (
          <>
            <Title>Your fonts</Title>
            <div className="space-y-1.5">
              {brand.fonts.filter(Boolean).map((f, i) => (
                <button key={f} type="button" onClick={() => insert(textHtml(i === 0 ? 'heading' : 'body', W, { ...look, head: f, body: f }), [f], true)} className="w-full truncate rounded-lg border border-line bg-bg-1 px-3 py-2 text-left text-[17px] hover:bg-bg-2" style={{ fontFamily: fontStack(f) }}>
                  {f}
                </button>
              ))}
            </div>
          </>
        )}
        {!!brand.logos.length && (
          <>
            <Title>Your logos</Title>
            <div className="grid grid-cols-3 gap-1.5">
              {brand.logos.map((l) => (
                <Tile key={l.src} title={l.name || tr('Logo')} onClick={() => run(picture(l.src, l.name))}>
                  <img src={`/api/pages/assets/${l.src.slice('naget-asset:'.length)}`} alt="" className="max-h-full max-w-full object-contain" />
                </Tile>
              ))}
            </div>
          </>
        )}
        <div className="mt-3 space-y-1.5">
          <Button size="sm" variant="primary" icon={<PaletteIcon size={14} />} onClick={() => applyBrand(cmd, brand, onFont)} className="w-full justify-center">
            Apply my brand to this design
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setBrandOpen(true)} className="w-full justify-center">
            Edit the brand kit
          </Button>
        </div>
      </>
    ) : (
      <div className="space-y-2.5 px-1 pt-3 text-[12.5px] leading-relaxed text-fg-2">
        <p>{tr('Keep your brand’s colours, fonts and logos here: designs offer them first, and put them on a whole design in one click. Agents use them too.')}</p>
        <Button size="sm" variant="primary" icon={<PaletteIcon size={14} />} onClick={() => setBrandOpen(true)}>
          Set up your brand kit
        </Button>
      </div>
    );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 gap-0.5 overflow-x-auto border-b border-line px-1.5 py-1.5 [&::-webkit-scrollbar]:hidden" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cx('flex min-w-[54px] flex-1 flex-col items-center gap-0.5 rounded-lg px-1 py-1 text-[11px] transition-colors', tab === t.id ? 'bg-accent-soft font-medium text-fg' : 'text-fg-3 hover:bg-bg-2 hover:text-fg')}
          >
            <span className={tab === t.id ? 'text-accent' : undefined}>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2.5 pb-4">{body}</div>
      <IconPicker
        open={!!icons}
        start={icons ?? 'icons'}
        onClose={() => setIcons(null)}
        title="Add an icon or an emoji"
        onIcon={(i) => insert(iconHtml(i.name, i.paths, W, look.ink))}
        onEmoji={(ch) => insert(emojiHtml(ch, W))}
      />
      <QrDialog open={qr} onClose={() => setQr(false)} onInsert={(html) => insert(html)} width={W} ink={look.ink} />
      <MediaPick
        kind={media}
        onClose={() => setMedia(null)}
        onPick={(m) => {
          setMedia(null);
          if (m.kind === 'video') run(fromLibraryVideo(m.id).then(video));
          else run(picture(`/api/media/${m.id}/file`, m.title));
        }}
      />
      <BrandDialog open={brandOpen} onClose={() => setBrandOpen(false)} />
    </div>
  );
}

/** A Library video copied in with the design's videos: its address for the page, its still, its size. */
async function fromLibraryVideo(id: string) {
  const { post } = await import('../../../lib/api');
  const r = await post<{ src: string; url: string; poster?: string; w?: number; h?: number }>('/api/pages/videos/from-media', { media: id });
  return { url: r.url, poster: r.poster, w: r.w ?? 16, h: r.h ?? 9 };
}

/** Puts the brand on the whole design: its colours in place of the design's main ones, its fonts on the words. */
export function applyBrand(cmd: DCmd, brand: BrandKit, onFont: (name: string) => void) {
  if (brand.fonts[0] || brand.fonts[1]) {
    for (const f of brand.fonts) if (f) onFont(f);
    cmd('applyFonts', { head: brand.fonts[0] ? fontStack(brand.fonts[0]) : undefined, body: brand.fonts[1] ? fontStack(brand.fonts[1]) : brand.fonts[0] ? fontStack(brand.fonts[0]) : undefined });
  }
  if (brand.colours.length) cmd('brandColours', { colours: brand.colours });
  toast('Your brand is on the design: Undo takes it back', 'ok');
}

/** CSS text as a style object, for a preview. */
function cssObject(css: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of css.split(/;(?![^(]*\))/)) {
    const i = part.indexOf(':');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (!k || !v) continue;
    out[k.startsWith('-webkit-') ? `Webkit${k.slice(8).replace(/-./g, (m) => m[1].toUpperCase()).replace(/^./, (c) => c.toUpperCase())}` : k.replace(/-./g, (m) => m[1].toUpperCase())] = v;
  }
  return out;
}
