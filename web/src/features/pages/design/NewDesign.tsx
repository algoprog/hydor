// New → Design: pick a size (a poster, a flyer, an Instagram post, a story, a YouTube thumbnail, a business card…, or
// one of your own), then a ready-made design for it (each shown as it will be) or Start blank, in its own colours, your
// theme's, your brand's or a palette's. Make it opens the design in Edit.
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { DESIGN_CSS, PALETTES, hexColour, paletteFrom, sizeText, type DesignSize, type Palette } from '@shared/design';
import { templateBoard, templatesFor, type DesignTemplate } from '@shared/design-templates';
import type { BrandKit } from '@shared/design-brand';
import { cx } from '../../../components/ui';
import { tr } from '../../../i18n/runtime';
import { loadFontPreviews } from './AddPanel';
import { SizePicker } from './sizes';

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
}: {
  size: DesignSize;
  onSize: (s: DesignSize) => void;
  tpl: string | null;
  onTpl: (id: string | null) => void;
  colours: Colours;
  onColours: (c: Colours) => void;
  brand: BrandKit | null;
}) {
  useLayoutEffect(() => loadFontPreviews(), []);
  const list = useMemo(() => templatesFor(size), [size]);
  const card = size.w / size.h > 1.6 ? 196 : size.w / size.h > 1.1 ? 150 : 118;
  const choices: { id: Colours; label: string; swatch: string[] }[] = [
    { id: 'own', label: tr('Its own'), swatch: [] },
    ...(themePalette() ? [{ id: 'theme' as Colours, label: tr('Your theme'), swatch: [themePalette()!.bg, themePalette()!.accent, themePalette()!.ink] }] : []),
    ...(brand?.colours.length ? [{ id: 'brand' as Colours, label: tr('Your brand'), swatch: brand.colours.slice(0, 3) }] : []),
    ...PALETTES.map((p) => ({ id: p.id as Colours, label: tr(p.label), swatch: p.colours.slice(0, 3) })),
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-[230px_1fr]">
      <div className="max-h-[min(52dvh,470px)] overflow-y-auto overscroll-contain pr-1 max-sm:max-h-[34dvh]">
        <SizePicker value={size} onPick={onSize} columns={1} />
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <div className="-mx-0.5 flex gap-1 overflow-x-auto px-0.5 pb-0.5 [&::-webkit-scrollbar]:hidden" role="radiogroup" aria-label="Colours">
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
        <div className="max-h-[min(46dvh,420px)] overflow-y-auto overscroll-contain max-sm:max-h-[40dvh]">
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${card}px, 1fr))` }}>
            <button
              type="button"
              aria-pressed={tpl === null}
              onClick={() => onTpl(null)}
              className={cx('flex flex-col overflow-hidden rounded-xl border text-left transition-colors', tpl === null ? 'border-accent ring-2 ring-accent/30' : 'border-line hover:border-line-2')}
            >
              <span className="grid place-items-center bg-bg-1 text-fg-3" style={{ aspectRatio: `${size.w} / ${size.h}` }}>
                <Plus size={22} />
              </span>
              <span className="truncate px-2 py-1 text-[12px] font-medium text-fg-2">{tr('Start blank')}</span>
            </button>
            {list.map((t) => (
              <TemplateCard key={t.id} t={t} size={size} on={tpl === t.id} onPick={() => onTpl(t.id)} colours={colours} brand={brand} width={card} />
            ))}
          </div>
        </div>
        <p className="text-[11.5px] leading-snug text-fg-3">{tr(`${tr(size.label)} · ${sizeText(size)}. Its words and pictures are yours to replace; drop pictures on its picture places.`)}</p>
      </div>
    </div>
  );
}

function TemplateCard({ t, size, on, onPick, colours, brand, width }: { t: DesignTemplate; size: DesignSize; on: boolean; onPick: () => void; colours: Colours; brand: BrandKit | null; width: number }) {
  const board = useMemo(() => templateBoard(t, size, { palette: paletteOf(colours, brand), fonts: fontsOf(t, colours, brand) }), [t, size, colours, brand]);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <button ref={ref} type="button" aria-pressed={on} onClick={onPick} title={tr(t.label)} className={cx('flex flex-col overflow-hidden rounded-xl border text-left transition-colors', on ? 'border-accent ring-2 ring-accent/30' : 'border-line hover:border-line-2')}>
      <span className="block w-full overflow-hidden bg-bg-1">
        <AutoWidth>{(w) => <BoardPreview w={size.w} h={size.h} bg={board.bg} html={board.html} width={w || width} />}</AutoWidth>
      </span>
      <span className="truncate px-2 py-1 text-[12px] font-medium text-fg-2">{tr(t.label)}</span>
    </button>
  );
}

/** Its child drawn as wide as it is. */
function AutoWidth({ children }: { children: (w: number) => React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, [setW]);
  return <div ref={ref}>{children(w)}</div>;
}
