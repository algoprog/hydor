// New → Design: its size (a poster, a flyer, an Instagram post, a story, a YouTube thumbnail, a business card…, or one
// of your own), picked from the button that shows it, then a ready-made design for it (each shown as it will be) or
// Start blank, in its own colours, your theme's, your brand's or a palette's. Make it opens the design in Edit.
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
import { DESIGN_CSS, PALETTES, hexColour, paletteFrom, sizeText, type DesignSize, type Palette } from '@shared/design';
import { templateBoard, templatesFor, type DesignTemplate } from '@shared/design-templates';
import type { BrandKit } from '@shared/design-brand';
import { cx, Popover } from '../../../components/ui';
import { tr } from '../../../i18n/runtime';
import { loadFontPreviews } from './AddPanel';
import { SizeMark, SizePicker } from './sizes';
import { AutoWidth, Tile } from '../newArt';

/** An artboard drawn small, as it will be: its HTML in a shadow root of its own, scaled to `width`. */
export function BoardPreview({ w, h, bg, html, width }: { w: number; h: number; bg: string; html: string; width: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const k = width / w;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = el.shadowRoot ?? el.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${DESIGN_CSS}\n:host{display:block;contain:strict}.n-artboard{box-shadow:none;transform-origin:0 0}</style><div class="n-artboard" style="width:${w}px;height:${h}px;background:${bg.replace(/"/g, "'")};transform:scale(${k})">${html}</div>`;
  }, [w, h, bg, html, k]);
  return <div ref={ref} style={{ width, height: Math.round(h * k) }} className="overflow-hidden" aria-hidden />;
}

/** The colours a new design can start in. */
export type Colours = 'own' | 'theme' | 'brand' | string;

/** The app's theme as a palette (its background, words and accent). */
export function themePalette(): Palette | null {
  const cs = getComputedStyle(document.documentElement);
  const v = (k: string) => hexColour(cs.getPropertyValue(`--${k}`).trim());
  const bg = v('bg');
  const ink = v('fg');
  const accent = v('accent');
  if (!bg || !ink || !accent) return null;
  return { bg, soft: v('panel') ?? bg, ink, muted: v('fg-3') ?? ink, accent, accent2: v('info') ?? accent, onAccent: v('accent-fg') ?? '#ffffff' };
}

export function paletteOf(c: Colours, brand: BrandKit | null): Palette | undefined {
  if (c === 'own') return undefined;
  if (c === 'theme') return themePalette() ?? undefined;
  if (c === 'brand') return brand ? (paletteFrom(brand.colours) ?? undefined) : undefined;
  const p = PALETTES.find((x) => x.id === c);
  return p ? (paletteFrom(p.colours) ?? undefined) : undefined;
}

export function fontsOf(t: DesignTemplate | null, c: Colours, brand: BrandKit | null): [string, string] | undefined {
  if (c === 'brand' && brand && (brand.fonts[0] || brand.fonts[1])) return [brand.fonts[0] || brand.fonts[1], brand.fonts[1] || brand.fonts[0]];
  return t?.fonts;
}

export function NewDesign({
  size,
  onSize,
  tpl,
  onTpl,
  colours,
  onColours,
  brand,
  onMake,
}: {
  size: DesignSize;
  onSize: (s: DesignSize) => void;
  tpl: string | null;
  onTpl: (id: string | null) => void;
  colours: Colours;
  onColours: (c: Colours) => void;
  brand: BrandKit | null;
  /** A double click on a card: made at once. */
  onMake?: () => void;
}) {
  useLayoutEffect(() => loadFontPreviews(), []);
  const list = useMemo(() => templatesFor(size), [size]);
  const sizeBtn = useRef<HTMLButtonElement>(null);
  const [sizes, setSizes] = useState(false);
  // Wide sizes (a banner, a thumbnail) get wider cards, so each shows about as large as a post's.
  const card = size.w / size.h > 1.6 ? 200 : size.w / size.h > 1.1 ? 168 : 136;
  const choices: { id: Colours; label: string; swatch: string[] }[] = [
    { id: 'own', label: tr('Its own'), swatch: [] },
    ...(themePalette() ? [{ id: 'theme' as Colours, label: tr('Your theme'), swatch: [themePalette()!.bg, themePalette()!.accent, themePalette()!.ink] }] : []),
    ...(brand?.colours.length ? [{ id: 'brand' as Colours, label: tr('Your brand'), swatch: brand.colours.slice(0, 3) }] : []),
    ...PALETTES.map((p) => ({ id: p.id as Colours, label: tr(p.label), swatch: p.colours.slice(0, 3) })),
  ];
  return (
    <div className="space-y-3">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {/* The size first: the templates are those made for it. */}
        <button
          ref={sizeBtn}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={sizes}
          onClick={() => setSizes((o) => !o)}
          className="flex h-9 max-w-full min-w-0 shrink-0 items-center gap-1.5 rounded-[10px] border border-line-2 bg-bg-1 pr-2.5 pl-1 text-left transition-colors hover:border-accent/50"
        >
          <SizeMark w={size.w} h={size.h} on />
          <span className="min-w-0 truncate text-[13px] font-medium text-fg">{tr(size.label)}</span>
          <span className="shrink-0 text-[12px] text-fg-3 tabular-nums">{sizeText(size)}</span>
          <ChevronDown size={14} className="shrink-0 text-fg-3" />
        </button>
        <Popover anchor={sizeBtn} open={sizes} onClose={() => setSizes(false)} align="start" width={480} title="Size" className="overscroll-contain">
          <div className="p-2">
            <SizePicker
              value={size}
              onPick={(s) => {
                onSize(s);
                if (s.id !== 'custom') setSizes(false);
              }}
              columns={2}
            />
          </div>
        </Popover>
        <div
          className="-mx-0.5 flex min-w-0 flex-1 gap-1 overflow-x-auto py-0.5 pr-6 pl-0.5 [mask-image:linear-gradient(to_right,#000_calc(100%-28px),transparent)] [&::-webkit-scrollbar]:hidden"
          role="radiogroup"
          aria-label="Colours"
        >
          {choices.map((c) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={colours === c.id}
              onClick={() => onColours(c.id)}
              title={c.label}
              className={cx('flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2 text-[12px]', colours === c.id ? 'border-accent/60 bg-accent-soft font-medium text-fg' : 'border-line text-fg-2 hover:bg-bg-1')}
            >
              {!!c.swatch.length && (
                <span className="flex -space-x-1">
                  {c.swatch.map((s, i) => (
                    <span key={i} className="h-3.5 w-3.5 rounded-full border border-line-2" style={{ background: s }} />
                  ))}
                </span>
              )}
              {c.label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-x-3 gap-y-3.5" role="radiogroup" aria-label="Start from" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${card}px, 1fr))` }}>
        <Tile
          on={tpl === null}
          onClick={() => onTpl(null)}
          onOpen={onMake}
          ratio={`${size.w} / ${size.h}`}
          label={tr('Start blank')}
          art={
            <span className="absolute inset-0 grid place-items-center bg-bg-1 text-fg-3">
              <Plus size={22} />
            </span>
          }
        />
        {list.map((t) => (
          <TemplateCard key={t.id} t={t} size={size} on={tpl === t.id} onPick={() => onTpl(t.id)} onMake={onMake} colours={colours} brand={brand} width={card} />
        ))}
      </div>
      <p className="text-[11.5px] leading-snug text-fg-3">{tr(`${tr(size.label)} · ${sizeText(size)}. Its words and pictures are yours to replace; drop pictures on its picture places.`)}</p>
    </div>
  );
}

function TemplateCard({
  t,
  size,
  on,
  onPick,
  onMake,
  colours,
  brand,
  width,
}: {
  t: DesignTemplate;
  size: DesignSize;
  on: boolean;
  onPick: () => void;
  onMake?: () => void;
  colours: Colours;
  brand: BrandKit | null;
  width: number;
}) {
  const board = useMemo(() => templateBoard(t, size, { palette: paletteOf(colours, brand), fonts: fontsOf(t, colours, brand) }), [t, size, colours, brand]);
  return (
    <Tile
      on={on}
      onClick={onPick}
      onOpen={onMake}
      title={tr(t.label)}
      ratio={`${size.w} / ${size.h}`}
      label={tr(t.label)}
      art={
        <span className="absolute inset-0 block overflow-hidden bg-bg-1">
          <AutoWidth>{(w) => <BoardPreview w={size.w} h={size.h} bg={board.bg} html={board.html} width={w || width} />}</AutoWidth>
        </span>
      }
    />
  );
}
