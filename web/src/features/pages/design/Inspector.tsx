// A design's inspector: what is picked, or the artboard when nothing is. Words: their text (written by AI too), font,
// size, weight, style, colour, alignment, spacing, capitals, effects (shadow, lift, hollow, outline, glow, neon, echo,
// splice, gradient), a highlight behind them and a curve. Pictures: replaced, edited in the picture editor, changed with
// AI, cropped in their frame, cut to a shape, a look and their light and colours, corners, a border, a shadow. Videos:
// replaced, edited in the video editor, playing as a moving background or with controls. Shapes, boxes, icons, lines,
// QR codes: their colours and lines. Then where it is (its box and turn), how it lines up on the page, its order, its
// flip and how see-through it is. Several picked: lined up, spread out, grouped. Each change is a step to undo.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AlignCenter,
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignLeft,
  AlignRight,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  ArrowDown,
  ArrowDownToLine,
  ArrowUp,
  ArrowUpToLine,
  Bold,
  CaseUpper,
  Copy,
  Crop,
  Eraser,
  FlipHorizontal2,
  FlipVertical2,
  Group,
  ImageMinus,
  ImageUp,
  Italic,
  LibraryBig,
  Lock,
  LockOpen,
  MessageSquarePlus,
  Palette as PaletteIcon,
  Replace,
  Scaling,
  SlidersHorizontal,
  Sparkles,
  Strikethrough,
  Trash2,
  Underline,
  Ungroup,
  WandSparkles,
} from 'lucide-react';
import { DESIGN_FONTS, FONT_CATS, FONT_PAIRS, firstFont, fontByName, fontStack } from '@shared/design-fonts';
import { FRAME_IDS, FRAME_NAMES, SHAPE_IDS, SHAPE_NAMES, frameCss, shapePath } from '@shared/design-shapes';
import { hexColour, PALETTES } from '@shared/design';
import type { BrandKit } from '@shared/design-brand';
import type { RewriteAnswer } from '@shared/write';
import { post } from '../../../lib/api';
import { toast, toastError } from '../../../lib/store';
import { Button, cx, inputCls, MenuItem, Popover, Segmented, Throbber } from '../../../components/ui';
import { tr } from '../../../i18n/runtime';
import { editPicture as editWithAi, makePicture, pageData } from '../../images/studio';
import { choosePhoto } from '../FreePhotos';
import { IconPicker } from '../slides/IconPicker';
import { chooseVideo } from '../slides/media';
import { RewriteButton } from '../slides/Rewrite';
import { pictureData } from '../studio/Inspector';
import { ColorField, Group as Fold, NumField, Row } from '../studio/fields';
import { applyBrand, loadFontPreviews } from './AddPanel';
import { MediaPick } from './dialogs';
import { coloursOf } from './colours';
import { deviceVideo, type DCmd, type DEl, type DSel } from './DesignEdit';
import { EFFECTS, effectCss, filterCss, iconHtml, LOOKS, NO_ADJUST, qrHtml, readFilter, shapeHtml, type Effect, type Look } from './elements';

const n = (v: string | undefined, d = 0) => {
  const x = parseFloat(v ?? '');
  return Number.isFinite(x) ? x : d;
};
const hex = (v: string | undefined) => (v ? hexColour(v) : null);
/** A small field of the inspector (the shared input class is as wide as its row). */
const fieldCls = 'h-8 rounded-lg border border-line-2 bg-bg-1 px-2 text-[12.5px] outline-none focus:border-accent/60';

function Slider({ label, value, min, max, step = 1, onChange, unit = '', hint }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; unit?: string; hint?: string }) {
  return (
    <Row label={label} hint={hint}>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} className="h-1.5 min-w-0 flex-1 cursor-pointer accent-[var(--accent)]" />
      <span className="w-10 shrink-0 text-right text-[11.5px] text-fg-3 tabular-nums">{`${Math.round(value * 100) / 100}${unit}`}</span>
    </Row>
  );
}

function Icons({ items }: { items: { icon: ReactNode; title: string; on?: boolean; run: () => void; disabled?: boolean }[] }) {
  return (
    <div className="flex flex-wrap gap-0.5">
      {items.map((b) => (
        <button
          key={b.title}
          type="button"
          title={b.title}
          aria-label={b.title}
          aria-pressed={b.on}
          disabled={b.disabled}
          // The words being written keep their selection.
          onMouseDown={(e) => e.preventDefault()}
          onClick={b.run}
          className={cx('grid h-8 w-7 place-items-center rounded-lg text-fg-2 transition-colors hover:bg-bg-2 hover:text-fg disabled:opacity-35', b.on && 'bg-accent-soft text-accent')}
        >
          {b.icon}
        </button>
      ))}
    </div>
  );
}

/** Google's fonts, in their own faces, by kind; the brand's first. */
export function FontPicker({ value, brand, onPick }: { value: string; brand: string[]; onPick: (name: string) => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  useEffect(() => loadFontPreviews(), []);
  const words = q.trim().toLowerCase();
  const list = DESIGN_FONTS.filter((f) => !words || f.name.toLowerCase().includes(words));
  const pick = (name: string) => {
    setOpen(false);
    onPick(name);
  };
  return (
    <>
      <button ref={ref} type="button" onClick={() => setOpen((o) => !o)} className={cx(fieldCls, 'flex min-w-0 flex-1 items-center truncate text-left text-[13.5px]')} style={{ fontFamily: fontStack(value) }} title="Font">
        <span className="truncate">{value || 'Font'}</span>
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={260} title="Font">
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a font" aria-label="Find a font" className={cx(inputCls, 'mb-1 h-8 w-full text-[13px]')} />
        <div className="max-h-[340px] overflow-y-auto">
          {!words && brand.filter(Boolean).length > 0 && (
            <>
              <div className="px-2 pt-1 pb-0.5 text-[11px] font-semibold text-fg-3 uppercase">Your brand</div>
              {brand.filter(Boolean).map((f) => (
                <MenuItem key={`b${f}`} onClick={() => pick(f)}>
                  <span style={{ fontFamily: fontStack(f) }} className="text-[15px]">
                    {f}
                  </span>
                </MenuItem>
              ))}
            </>
          )}
          {FONT_CATS.map((c) => {
            const fs = list.filter((f) => f.cat === c.id);
            if (!fs.length) return null;
            return (
              <div key={c.id}>
                <div className="px-2 pt-1.5 pb-0.5 text-[11px] font-semibold text-fg-3 uppercase">{c.label}</div>
                {fs.map((f) => (
                  <MenuItem key={f.name} onClick={() => pick(f.name)}>
                    <span style={{ fontFamily: fontStack(f.name) }} className={cx('text-[15px]', f.name === value && 'font-semibold text-accent')}>
                      {f.name}
                    </span>
                  </MenuItem>
                ))}
              </div>
            );
          })}
        </div>
      </Popover>
    </>
  );
}

/** "Write it for me": words for the picked text, written by the helper model from what it is about. */
function WriteForMe({ el, title, cmd }: { el: DEl; title: string; cmd: DCmd }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [about, setAbout] = useState('');
  const [busy, setBusy] = useState(false);
  const role = n(el.style['font-size'], 16) >= 40 ? 'heading' : n(el.style['font-size'], 16) >= 24 ? 'subheading' : 'body';
  const go = async () => {
    setBusy(true);
    try {
      const r = await post<RewriteAnswer>('/api/write/design-words', { about, role, now: el.words ?? '', design: title });
      cmd('words', { text: r.text });
      setOpen(false);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button ref={ref} type="button" onClick={() => setOpen((o) => !o)} className="flex h-8 shrink-0 items-center gap-1 rounded-lg px-1.5 text-[12.5px] text-fg-2 hover:bg-bg-2 hover:text-fg" title="New words for it, written with AI">
        {busy ? <Throbber size={14} /> : <Sparkles size={15} />}
        <span>Write for me</span>
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={280} title="Write for me">
        <div className="space-y-2 p-1.5">
          <input
            autoFocus
            value={about}
            onChange={(e) => setAbout(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !busy && void go()}
            placeholder={role === 'heading' ? 'A summer sale at a bakery' : 'What it should say'}
            className={cx(inputCls, 'h-8 w-full text-[13px]')}
          />
          <p className="text-[11.5px] leading-snug text-fg-3">{tr(`A ${role} that fits the design, by the helper model (Settings → Models).`)}</p>
          <Button size="sm" variant="primary" icon={<Sparkles size={14} />} disabled={busy} onClick={() => void go()} className="w-full justify-center">
            {busy ? 'Writing…' : 'Write it'}
          </Button>
        </div>
      </Popover>
    </>
  );
}

function Header({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex min-h-10 items-center gap-1 px-3 pt-1.5">
      <span translate="no" className="min-w-0 flex-1 truncate text-[13px] font-semibold text-fg">
        {title}
      </span>
      {children}
    </div>
  );
}

const SHADOWS: Record<string, string | null> = { none: null, soft: '0 2px 8px rgba(0,0,0,.18)', medium: '0 8px 24px rgba(0,0,0,.24)', strong: '0 18px 48px rgba(0,0,0,.34)' };
/** Which of the shadows a box-shadow is (by its blur). */
const shadowName = (v: string | undefined) => (!v || v === 'none' ? 'none' : v.includes('48px') ? 'strong' : v.includes('24px') ? 'medium' : 'soft');
function ShadowPick({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Shadow" className={cx(fieldCls, 'min-w-0 flex-1')}>
      {['none', 'soft', 'medium', 'strong'].map((v) => (
        <option key={v} value={v}>
          {tr(v === 'none' ? 'None' : v === 'soft' ? 'Soft' : v === 'medium' ? 'Medium' : 'Strong')}
        </option>
      ))}
    </select>
  );
}

export function DesignInspector({
  sel,
  board,
  cmd,
  palette,
  look,
  brand,
  usedColours,
  onFont,
  onEditPicture,
  onEditVideo,
  pictureSrc,
  onAsk,
  onResize,
  focusWords,
  title,
}: {
  sel: DSel | null;
  board: DSel['board'];
  cmd: DCmd;
  palette: string[];
  look: Look;
  brand: BrandKit | null;
  usedColours: string[];
  onFont: (name: string) => void;
  onEditPicture: () => void;
  onEditVideo: () => void;
  pictureSrc: () => Promise<string>;
  onAsk?: () => void;
  onResize: () => void;
  focusWords: number;
  title: string;
}) {
  const style = (props: Record<string, string | null>) => cmd('style', { props });
  const [replace, setReplace] = useState<'image' | 'video' | null>(null);
  const [iconAsk, setIconAsk] = useState(false);
  const run = (p: Promise<unknown>) => void p.catch(toastError);

  if (!sel || sel.kind === 'board' || (!sel.el && !sel.many)) {
    // ---- the artboard ----
    const bg = hex(board?.bgColor);
    return (
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4">
        <Header title={board ? tr(`Page ${board.index + 1} of ${board.count}`) : tr('Page')} />
        <div className="space-y-1 px-3">
          {board && (
            <Row label="Size">
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-fg-2 tabular-nums">{`${board.w} × ${board.h} px`}</span>
              <Button size="sm" variant="secondary" icon={<Scaling size={14} />} onClick={onResize}>
                Resize
              </Button>
            </Row>
          )}
          <Row label="Background">
            <ColorField value={bg} palette={palette} onChange={(c) => cmd('board', { props: { background: c ?? '#ffffff', 'background-image': null, 'background-color': null } })} />
          </Row>
          <p className="pb-1 pl-[92px] text-[11.5px] leading-snug text-fg-3">{tr('Gradients, patterns and pictures: Add → Background.')}</p>
        </div>
        <div className="px-3">
        {usedColours.length > 0 && (
          <Fold id="d-colours" title="Colours in this design" start>
            <p className="pb-1.5 text-[11.5px] leading-snug text-fg-3">{tr('Pick one to change it everywhere it is used.')}</p>
            <div className="flex flex-wrap gap-1.5">
              {usedColours.slice(0, 14).map((c) => (
                <label key={c} title={c} className="relative h-7 w-7 cursor-pointer overflow-hidden rounded-full border border-line-2" style={{ background: c }}>
                  <input type="color" value={c} onChange={(e) => cmd('recolour', { map: { [c]: e.target.value } })} className="absolute inset-0 cursor-pointer opacity-0" />
                </label>
              ))}
            </div>
          </Fold>
        )}
        <Fold id="d-palette" title="New colours">
          <NewColours cmd={cmd} />
        </Fold>
        <Fold id="d-fonts" title="Fonts" start>
          <p className="pb-1.5 text-[11.5px] leading-snug text-fg-3">{tr('A pair for the whole design: the first for its big words, the second for the rest.')}</p>
          <div className="grid grid-cols-2 gap-1.5">
            {FONT_PAIRS.slice(0, 8).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  onFont(p.head);
                  onFont(p.body);
                  cmd('applyFonts', { head: fontStack(p.head), body: fontStack(p.body) });
                }}
                className="truncate rounded-lg border border-line bg-bg-1 px-2 py-1.5 text-left text-[14px] hover:bg-bg-2"
                style={{ fontFamily: fontStack(p.head) }}
                title={`${p.head} + ${p.body}`}
              >
                {tr(p.label)}
              </button>
            ))}
          </div>
        </Fold>
        </div>
        {brand && (
          <div className="px-3 pt-2">
            <Button size="sm" variant="secondary" icon={<PaletteIcon size={14} />} onClick={() => applyBrand(cmd, brand, onFont)} className="w-full justify-center">
              Apply my brand
            </Button>
          </div>
        )}
        <div className="flex flex-wrap gap-1.5 px-3 pt-3">
          <Button size="sm" variant="ghost" onClick={() => cmd('addBoard', {})}>
            Add a page
          </Button>
          <Button size="sm" variant="ghost" onClick={() => cmd('addBoard', { copy: true })}>
            Duplicate this page
          </Button>
          {board && board.count > 1 && (
            <Button size="sm" variant="ghost" onClick={() => cmd('delBoard')}>
              Delete this page
            </Button>
          )}
        </div>
      </div>
    );
  }

  const alignItems = [
    { icon: <AlignStartVertical size={15} />, title: tr('Left'), run: () => cmd('align', 'left') },
    { icon: <AlignCenterVertical size={15} />, title: tr('In the middle, across'), run: () => cmd('align', 'center') },
    { icon: <AlignEndVertical size={15} />, title: tr('Right'), run: () => cmd('align', 'right') },
    { icon: <AlignStartHorizontal size={15} />, title: tr('Top'), run: () => cmd('align', 'top') },
    { icon: <AlignCenterHorizontal size={15} />, title: tr('In the middle, up and down'), run: () => cmd('align', 'middle') },
    { icon: <AlignEndHorizontal size={15} />, title: tr('Bottom'), run: () => cmd('align', 'bottom') },
  ];
  const orderItems = [
    { icon: <ArrowUpToLine size={15} />, title: tr('Bring to front (Ctrl+Shift+])'), run: () => cmd('order', 'front') },
    { icon: <ArrowUp size={15} />, title: tr('Bring forward (Ctrl+])'), run: () => cmd('order', 'forward') },
    { icon: <ArrowDown size={15} />, title: tr('Send backward (Ctrl+[)'), run: () => cmd('order', 'backward') },
    { icon: <ArrowDownToLine size={15} />, title: tr('Send to back (Ctrl+Shift+[)'), run: () => cmd('order', 'back') },
  ];

  if (sel.kind === 'many' && sel.many) {
    // ---- several ----
    const m = sel.many;
    return (
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4">
        <Header title={tr(`${sel.count} picked`)}>
          <Icons
            items={[
              { icon: <Copy size={15} />, title: tr('Duplicate (Ctrl+D)'), run: () => cmd('dup') },
              { icon: m.locked ? <LockOpen size={15} /> : <Lock size={15} />, title: m.locked ? tr('Unlock') : tr('Lock them in place'), run: () => cmd('lock') },
              { icon: <Trash2 size={15} />, title: tr('Delete (Delete)'), run: () => cmd('del') },
            ]}
          />
        </Header>
        <div className="space-y-1.5 px-3">
          <Row label="Line up">
            <Icons items={alignItems} />
          </Row>
          <Row label="Spread out" hint="Even gaps between three or more">
            <Icons
              items={[
                { icon: <AlignHorizontalDistributeCenter size={15} />, title: tr('Across'), run: () => cmd('distribute', 'h'), disabled: sel.count < 3 },
                { icon: <AlignVerticalDistributeCenter size={15} />, title: tr('Up and down'), run: () => cmd('distribute', 'v'), disabled: sel.count < 3 },
              ]}
            />
          </Row>
          <Row label="Order">
            <Icons items={orderItems} />
          </Row>
          {sel.canGroup && (
            <Button size="sm" variant="secondary" icon={<Group size={14} />} onClick={() => cmd('group')}>
              Group them (Ctrl+G)
            </Button>
          )}
          <p className="pt-1 text-[11.5px] leading-snug text-fg-3">{tr('Drag them together, or drag a corner of the box round them to size them all. Shift+click adds or takes one away.')}</p>
        </div>
      </div>
    );
  }

  // ---- one element ----
  const el = sel.el!;
  const st = el.style;
  const inl = el.inline;
  const t = el.type;
  const isWords = t === 'text' || t === 'curve';
  const fontName = firstFont(st['font-family']);
  const size = n(st['font-size'], 16);
  const weight = Number(st['font-weight']) || 400;
  const effect = el.effect;
  const curEffect: Effect = (EFFECTS.find((e) => e.id === effect)?.id ?? (inl['background-clip'] || inl['-webkit-background-clip'] ? 'gradient' : inl['text-shadow'] ? 'shadow' : 'none')) as Effect;
  const filt = readFilter(el.imgFilter ?? '');
  const frameKind = el.frame ?? 'rect';
  const plainFrame = frameKind === 'rect' || frameKind === 'rounded' || frameKind === 'circle';

  const setFont = (name: string) => {
    onFont(name);
    const d = fontByName(name);
    const w = d ? d.w.reduce((b, x) => (Math.abs(x - weight) < Math.abs(b - weight) ? x : b), d.w[0]) : weight;
    style({ 'font-family': fontStack(name), ...(w !== weight ? { 'font-weight': String(w) } : {}) });
  };
  const setEffect = (e: Effect, o: { colour?: string; amount?: number } = {}) => {
    cmd('style', { props: effectCss(e, { size, colour: o.colour ?? (e === 'gradient' ? look.accent : e === 'neon' || e === 'glow' ? look.accent : '#000000'), colour2: look.accent2, amount: o.amount }) });
    cmd('attr', { name: 'data-effect', value: e === 'none' ? null : e });
  };

  let content: ReactNode = null;
  if (isWords) {
    content = (
      <>
        <div className="px-3 pt-1">
          <WordsBox key={el.path.join('.')} words={el.words ?? ''} focus={focusWords} onChange={(text) => cmd('words', { text })} />
          <div className="flex items-center gap-0.5 pt-1">
            <RewriteButton target={() => (el.words?.trim() ? { text: el.words, context: `a design called “${title}”`, put: (text) => (cmd('words', { text }), true) } : null)} />
            <WriteForMe el={el} title={title} cmd={cmd} />
          </div>
        </div>
        <Fold id="d-text" title="Text" start summary={`${fontName} · ${Math.round(size)}`}>
          <Row label="Font">
            <FontPicker value={fontName} brand={brand?.fonts ?? []} onPick={setFont} />
          </Row>
          <Row label="Size">
            <NumField value={`${Math.round(size * 10) / 10}px`} onChange={(v) => v && style({ 'font-size': v })} min={4} max={2000} scrub="A" />
            <select
              value={String(weight)}
              onChange={(e) => style({ 'font-weight': e.target.value })}
              aria-label="Weight"
              className={cx(fieldCls, 'w-[96px] shrink-0 px-1')}
            >
              {(fontByName(fontName)?.w ?? [300, 400, 500, 600, 700, 800, 900]).map((w) => (
                <option key={w} value={w}>
                  {w <= 300 ? 'Light' : w === 400 ? 'Regular' : w === 500 ? 'Medium' : w === 600 ? 'Semibold' : w === 700 ? 'Bold' : w === 800 ? 'Extra bold' : 'Black'}
                </option>
              ))}
            </select>
          </Row>
          <Row label="Style">
            <Icons
              items={[
                { icon: <Bold size={15} />, title: tr('Bold'), on: weight >= 600, run: () => cmd('exec', { cmd: 'bold' }) },
                { icon: <Italic size={15} />, title: tr('Italic'), on: st['font-style'] === 'italic', run: () => cmd('exec', { cmd: 'italic' }) },
                { icon: <Underline size={15} />, title: tr('Underline'), on: /underline/.test(st['text-decoration-line'] ?? ''), run: () => cmd('exec', { cmd: 'underline' }) },
                { icon: <Strikethrough size={15} />, title: tr('Strike through'), on: /line-through/.test(st['text-decoration-line'] ?? ''), run: () => cmd('exec', { cmd: 'strikeThrough' }) },
                { icon: <CaseUpper size={15} />, title: tr('Capitals'), on: st['text-transform'] === 'uppercase', run: () => style({ 'text-transform': st['text-transform'] === 'uppercase' ? null : 'uppercase' }) },
              ]}
            />
          </Row>
          <Row label="Colour">
            <ColorField value={hex(st.color)} palette={palette} onChange={(c) => (el.editing ? cmd('exec', { cmd: 'foreColor', value: c ?? '#000000' }) : style({ color: c }))} />
          </Row>
          <Row label="Align">
            <Icons
              items={[
                { icon: <AlignLeft size={15} />, title: tr('Left'), on: st['text-align'] === 'left' || st['text-align'] === 'start', run: () => style({ 'text-align': null }) },
                { icon: <AlignCenter size={15} />, title: tr('Centre'), on: st['text-align'] === 'center', run: () => style({ 'text-align': 'center' }) },
                { icon: <AlignRight size={15} />, title: tr('Right'), on: st['text-align'] === 'right' || st['text-align'] === 'end', run: () => style({ 'text-align': 'right' }) },
              ]}
            />
          </Row>
          <Slider label="Line height" value={Math.round((n(st['line-height'], size * 1.2) / size) * 100) / 100} min={0.7} max={2.5} step={0.05} onChange={(v) => style({ 'line-height': String(v) })} />
          <Slider label="Letter spacing" value={Math.round((n(st['letter-spacing'], 0) / size) * 100) / 100} min={-0.1} max={0.6} step={0.01} unit="em" onChange={(v) => style({ 'letter-spacing': v ? `${v}em` : null })} />
        </Fold>
        <Fold id="d-effects" title="Effects" start summary={tr(EFFECTS.find((e) => e.id === curEffect)?.label ?? '')}>
          <div className="grid grid-cols-5 gap-1.5 pb-1.5">
            {EFFECTS.map((e) => {
              const css = effectCss(e.id, { size: 22, colour: e.id === 'gradient' || e.id === 'neon' || e.id === 'glow' ? '#8b5cf6' : '#000000', colour2: '#f97316' });
              const preview: Record<string, string> = {};
              for (const [k, v] of Object.entries(css)) if (v) preview[k.startsWith('-webkit-') ? `Webkit${k.slice(8).replace(/-./g, (m) => m[1].toUpperCase()).replace(/^./, (c) => c.toUpperCase())}` : k.replace(/-./g, (m) => m[1].toUpperCase())] = v;
              return (
                <button
                  key={e.id}
                  type="button"
                  title={tr(e.label)}
                  onClick={() => setEffect(e.id)}
                  className={cx('flex h-12 flex-col items-center justify-center rounded-lg border bg-bg-1 hover:bg-bg-2', curEffect === e.id ? 'border-accent' : 'border-line')}
                >
                  <span style={{ ...preview, fontSize: 20, fontWeight: 800, color: e.id === 'neon' ? '#fff' : 'var(--fg)', lineHeight: 1 }}>Ag</span>
                  <span className="mt-0.5 max-w-full truncate px-0.5 text-[9.5px] text-fg-3">{tr(e.label)}</span>
                </button>
              );
            })}
          </div>
          {curEffect !== 'none' && (
            <Row label="Its colour">
              <ColorField value={null} palette={palette} onChange={(c) => setEffect(curEffect, { colour: c ?? '#000000' })} />
            </Row>
          )}
          {t === 'text' && (
            <Row label="Highlight" hint="A colour behind the words">
              <ColorField value={hex(el.highlight)} none palette={palette} onChange={(c) => cmd('highlight', { colour: c })} />
            </Row>
          )}
          <Slider label="Curve" value={n(el.curve, 0)} min={-100} max={100} step={1} onChange={(v) => cmd('curve', { amount: v })} hint="Bends the words along an arc: up, or down" />
        </Fold>
      </>
    );
  } else if (t === 'pic') {
    const adjust = (k: keyof typeof NO_ADJUST, v: number) => cmd('style', { target: 'img', props: { filter: filterCss(filt.look, { ...filt.adjust, [k]: v }) || null } });
    const aiChange = (mode: 'change' | 'cutout' | 'erase') =>
      run(
        (async () => {
          const src = await pictureSrc();
          if (!src) throw new Error('That picture could not be read from the design');
          const p = await editWithAi({ src, mode });
          if (p) cmd('picture', { src: await pageData(p.src) });
        })(),
      );
    content = (
      <>
        <div className="flex flex-wrap gap-1.5 px-3 pt-1">
          {!el.empty && (
            <Button size="sm" variant="secondary" icon={<SlidersHorizontal size={14} />} onClick={onEditPicture} title="Crop, turn, light and colours, filters, marks and words over it, AI">
              Edit picture
            </Button>
          )}
          {!el.empty && (
            <Button size="sm" variant="secondary" icon={<Crop size={14} />} onClick={() => cmd('crop')} title="Move and size the picture inside its frame (double-click)">
              Crop
            </Button>
          )}
          <ReplacePicture empty={!!el.empty} onDevice={(src) => cmd('picture', { src })} onLibrary={() => setReplace('image')} onAi={() => run(makePicture({ kind: 'picture', aspect: undefined }).then(async (p) => p && cmd('picture', { src: await pageData(p.src), alt: p.prompt ?? '' })))} />
        </div>
        {!el.empty && (
          <div className="flex flex-wrap gap-1 px-3 pt-1.5">
            <Button size="sm" variant="ghost" icon={<WandSparkles size={14} />} onClick={() => aiChange('change')}>
              Change with AI
            </Button>
            <Button size="sm" variant="ghost" icon={<ImageMinus size={14} />} onClick={() => aiChange('cutout')}>
              Remove the background
            </Button>
            <Button size="sm" variant="ghost" icon={<Eraser size={14} />} onClick={() => aiChange('erase')}>
              Erase part of it
            </Button>
          </div>
        )}
        <Fold id="d-frame" title="Frame" start summary={tr(FRAME_NAMES[frameKind as keyof typeof FRAME_NAMES] ?? '')}>
          <div className="grid grid-cols-7 gap-1">
            {FRAME_IDS.map((f) => (
              <button
                key={f}
                type="button"
                title={tr(FRAME_NAMES[f])}
                onClick={() => {
                  const css = frameCss(f);
                  const props: Record<string, string | null> = { '-webkit-mask': null, mask: null, 'border-radius': null };
                  for (const part of css.split(/;(?![^(]*\))/)) {
                    const i = part.indexOf(':');
                    if (i > 0) props[part.slice(0, i).trim()] = part.slice(i + 1).trim();
                  }
                  style(props);
                  cmd('attr', { name: 'data-frame', value: f });
                }}
                className={cx('grid aspect-square place-items-center rounded-md border bg-bg-1 hover:bg-bg-2', frameKind === f ? 'border-accent' : 'border-line')}
              >
                <svg viewBox="0 0 100 100" className="h-[70%] w-[70%]" aria-hidden>
                  {f === 'rect' ? <rect width="100" height="100" fill="currentColor" opacity=".5" /> : f === 'rounded' ? <rect width="100" height="100" rx="18" fill="currentColor" opacity=".5" /> : f === 'circle' ? <circle cx="50" cy="50" r="50" fill="currentColor" opacity=".5" /> : <path d={shapePath(f)} fill="currentColor" opacity=".5" />}
                </svg>
              </button>
            ))}
          </div>
          {plainFrame && (
            <>
              <Slider label="Corners" value={n(inl['border-top-left-radius'] || st['border-top-left-radius'], 0)} min={0} max={Math.round(Math.min(el.w, el.h) / 2)} onChange={(v) => style({ 'border-radius': v ? `${v}px` : null })} unit="px" />
              <Slider label="Border" value={n(st['border-top-width'], 0)} min={0} max={40} onChange={(v) => style({ border: v ? `${v}px solid ${hex(st['border-top-color']) ?? '#ffffff'}` : null })} unit="px" />
              {n(st['border-top-width'], 0) > 0 && (
                <Row label="Its colour">
                  <ColorField value={hex(st['border-top-color'])} palette={palette} onChange={(c) => style({ 'border-color': c })} />
                </Row>
              )}
              <Row label="Shadow">
                <ShadowPick value={shadowName(st['box-shadow'])} onChange={(v) => style({ 'box-shadow': SHADOWS[v] })} />
              </Row>
            </>
          )}
        </Fold>
        {!el.empty && (
          <Fold id="d-look" title="Look" start summary={tr(LOOKS.find((l) => l.id === filt.look)?.label ?? '')}>
            <div className="grid grid-cols-5 gap-1 pb-1.5">
              {LOOKS.map((l) => (
                <button key={l.id} type="button" onClick={() => cmd('style', { target: 'img', props: { filter: filterCss(l.id, filt.adjust) || null } })} className={cx('truncate rounded-md border px-1 py-1 text-[11px]', filt.look === l.id ? 'border-accent bg-accent-soft text-fg' : 'border-line text-fg-2 hover:bg-bg-2')} title={tr(l.label)}>
                  {tr(l.label)}
                </button>
              ))}
            </div>
            <Slider label="Brightness" value={filt.adjust.brightness} min={0} max={200} onChange={(v) => adjust('brightness', v)} unit="%" />
            <Slider label="Contrast" value={filt.adjust.contrast} min={0} max={200} onChange={(v) => adjust('contrast', v)} unit="%" />
            <Slider label="Saturation" value={filt.adjust.saturate} min={0} max={200} onChange={(v) => adjust('saturate', v)} unit="%" />
            <Slider label="Blur" value={filt.adjust.blur} min={0} max={30} onChange={(v) => adjust('blur', v)} unit="px" />
          </Fold>
        )}
        {!el.empty && (
          <div className="px-3 pt-1">
            <Row label="Description" hint="Read out by screen readers">
              <input defaultValue={el.alt ?? ''} key={el.path.join('.')} onBlur={(e) => e.target.value !== (el.alt ?? '') && cmd('attr', { name: 'alt', value: e.target.value, target: 'img' })} placeholder="What it shows" className={cx(inputCls, 'h-8 min-w-0 flex-1 text-[12.5px]')} />
            </Row>
          </div>
        )}
      </>
    );
  } else if (t === 'video') {
    const v = el.video;
    content = (
      <div className="space-y-1.5 px-3 pt-1">
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant="secondary" icon={<SlidersHorizontal size={14} />} onClick={onEditVideo} title="Trim, crop, words over it, colours, music">
            Edit video
          </Button>
          <Button size="sm" variant="secondary" icon={<Replace size={14} />} onClick={() => run(chooseVideo().then(async (f) => f && cmd('video', await deviceVideo(f).then((x) => ({ src: x.url, poster: x.poster })))))}>
            From this device
          </Button>
          <Button size="sm" variant="ghost" icon={<LibraryBig size={14} />} onClick={() => setReplace('video')}>
            From your Library
          </Button>
        </div>
        <Row label="Plays">
          <Segmented
            size="sm"
            value={v?.controls ? 'controls' : 'background'}
            onChange={(m) => {
              for (const a of ['autoplay', 'muted', 'loop', 'controls']) cmd('attr', { name: a, value: m === 'controls' ? (a === 'controls' ? true : null) : a === 'controls' ? null : true, target: 'video' });
            }}
            options={[
              { value: 'background', label: tr('Moving, silent') },
              { value: 'controls', label: tr('With controls') },
            ]}
          />
        </Row>
        <p className="text-[11.5px] leading-snug text-fg-3">{tr('Moving and silent, it loops by itself; with controls, people play it with its sound. A picture or a PDF of the design shows its still.')}</p>
        <Slider label="Corners" value={n(st['border-top-left-radius'], 0)} min={0} max={Math.round(Math.min(el.w, el.h) / 2)} onChange={(x) => style({ 'border-radius': x ? `${x}px` : null, overflow: x ? 'hidden' : null })} unit="px" />
      </div>
    );
  } else if (t === 'shape' || t === 'box') {
    content = (
      <>
        <Fold id="d-fill" title="Fill and outline" start>
          <Row label="Fill">
            <ColorField value={hex(t === 'shape' ? st.color : st['background-color'])} none palette={palette} onChange={(c) => style(t === 'shape' ? { color: c ?? 'transparent' } : { background: c ?? 'transparent', 'background-color': null })} />
          </Row>
          {t === 'shape' ? (
            <>
              <Row label="Outline">
                <ColorField value={hex(st['--n-stroke'])} none palette={palette} onChange={(c) => style({ '--n-stroke': c, '--n-sw': c ? inl['--n-sw'] || '4px' : null })} />
              </Row>
              {!!hex(st['--n-stroke']) && <Slider label="Its width" value={n(st['--n-sw'], 4)} min={1} max={40} onChange={(x) => style({ '--n-sw': `${x}px` })} unit="px" />}
            </>
          ) : (
            <>
              <Slider label="Corners" value={n(st['border-top-left-radius'], 0)} min={0} max={Math.round(Math.min(el.w, el.h) / 2)} onChange={(x) => style({ 'border-radius': x ? `${x}px` : null })} unit="px" />
              <Slider label="Border" value={n(st['border-top-width'], 0)} min={0} max={40} onChange={(x) => style({ border: x ? `${x}px solid ${hex(st['border-top-color']) ?? look.ink}` : null })} unit="px" />
              {n(st['border-top-width'], 0) > 0 && (
                <Row label="Its colour">
                  <ColorField value={hex(st['border-top-color'])} palette={palette} onChange={(c) => style({ 'border-color': c })} />
                </Row>
              )}
            </>
          )}
          <Row label="Shadow">
            <ShadowPick
              value={t === 'shape' ? (/drop-shadow/.test(inl.filter ?? '') ? 'soft' : 'none') : shadowName(st['box-shadow'])}
              onChange={(v) => style(t === 'shape' ? { filter: v === 'none' ? null : `drop-shadow(${SHADOWS[v]})` } : { 'box-shadow': SHADOWS[v] })}
            />
          </Row>
        </Fold>
        {t === 'shape' && (
          <Fold id="d-shape" title="Another shape">
            <div className="grid grid-cols-7 gap-1">
              {SHAPE_IDS.map((s) => (
                <button key={s} type="button" title={tr(SHAPE_NAMES[s])} onClick={() => cmd('html', { html: shapeHtml(s, 400, hex(st.color) ?? look.accent).replace(/style="/, `style="${inl['--n-stroke'] ? `--n-stroke:${inl['--n-stroke']};--n-sw:${inl['--n-sw'] ?? '4px'};` : ''}`) })} className={cx('grid aspect-square place-items-center rounded-md border bg-bg-1 text-fg-2 hover:bg-bg-2', el.shape === s ? 'border-accent' : 'border-line')}>
                  <svg viewBox="0 0 100 100" className="h-[70%] w-[70%]" aria-hidden>
                    <path d={shapePath(s)} fill="currentColor" />
                  </svg>
                </button>
              ))}
            </div>
          </Fold>
        )}
      </>
    );
  } else if (t === 'icon') {
    content = (
      <div className="space-y-1 px-3 pt-1">
        <Row label="Colour">
          <ColorField value={hex(st.color)} palette={palette} onChange={(c) => style({ color: c })} />
        </Row>
        <Slider label="Line width" value={n(st['--n-sw'], 2)} min={0.5} max={4} step={0.25} onChange={(x) => style({ '--n-sw': String(x) })} />
        <Button size="sm" variant="secondary" onClick={() => setIconAsk(true)}>
          Another icon
        </Button>
        <IconPicker open={iconAsk} onClose={() => setIconAsk(false)} onIcon={(i) => cmd('html', { html: iconHtml(i.name, i.paths, 400, hex(st.color) ?? look.ink) })} />
      </div>
    );
  } else if (t === 'qr') {
    content = <QrFields text={el.qr ?? ''} dark={el.qrDark || '#000000'} light={el.qrLight ?? '#ffffff'} palette={palette} onChange={(text, colours) => cmd('html', { html: qrHtml(text, colours, 400) })} />;
  } else if (t === 'line') {
    content = (
      <div className="space-y-1 px-3 pt-1">
        <Row label="Colour">
          <ColorField value={hex(st.color)} palette={palette} onChange={(c) => style({ color: c })} />
        </Row>
        <Slider label="Thickness" value={n(st['--n-lw'], 4)} min={1} max={40} onChange={(x) => style({ '--n-lw': `${x}px`, height: `${Math.max(12, x * 4)}px` })} unit="px" />
        <Row label="Style">
          <Segmented
            size="sm"
            value={(st['--n-ls'] || 'solid').trim()}
            onChange={(v) => style({ '--n-ls': v === 'solid' ? null : v })}
            options={[
              { value: 'solid', label: tr('Plain') },
              { value: 'dashed', label: tr('Dashed') },
              { value: 'dotted', label: tr('Dotted') },
            ]}
          />
        </Row>
        <Row label="Arrow">
          <Segmented
            size="sm"
            value={el.arrow ? 'yes' : 'no'}
            onChange={(v) => cmd('attr', { name: 'class', value: `n-el n-line${v === 'yes' ? ' n-arrow' : ''}` })}
            options={[
              { value: 'no', label: tr('None') },
              { value: 'yes', label: tr('At its end') },
            ]}
          />
        </Row>
      </div>
    );
  } else if (t === 'group') {
    content = (
      <div className="space-y-1.5 px-3 pt-1">
        <p className="text-[12px] leading-snug text-fg-3">{tr('A group moves, sizes and turns as one. Double-click it to change what is in it.')}</p>
        <Button size="sm" variant="secondary" icon={<Ungroup size={14} />} onClick={() => cmd('ungroup')}>
          Ungroup (Ctrl+Shift+G)
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4">
      <Header title={el.name}>
        {onAsk && (
          <button type="button" onClick={onAsk} title="Puts a note in your message box saying which part you mean" className="flex h-8 items-center gap-1 rounded-lg px-1.5 text-[12px] text-fg-2 hover:bg-bg-2">
            <MessageSquarePlus size={14} />
            <span className="max-[1300px]:hidden">Ask</span>
          </button>
        )}
        <Icons
          items={[
            { icon: <Copy size={15} />, title: tr('Duplicate (Ctrl+D)'), run: () => cmd('dup') },
            { icon: el.locked ? <LockOpen size={15} /> : <Lock size={15} />, title: el.locked ? tr('Unlock') : tr('Lock it in place'), on: el.locked, run: () => cmd('lock') },
            { icon: <Trash2 size={15} />, title: tr('Delete (Delete)'), run: () => cmd('del'), disabled: el.locked },
          ]}
        />
      </Header>
      {el.locked && <p className="mx-3 mb-1 rounded-lg bg-bg-2 px-2.5 py-1.5 text-[12px] text-fg-2">{tr('Locked: it stays where it is. Unlock it to move or change it.')}</p>}
      <div className="px-3">
      {content}
      <Fold id="d-place" title="Position" start>
        <div className="grid grid-cols-2 gap-x-2 gap-y-1">
          {(['x', 'y', 'w', 'h'] as const).map((k) => (
            <label key={k} className="flex items-center gap-1.5">
              <span className="w-4 shrink-0 text-[11.5px] text-fg-3 uppercase">{k === 'w' ? 'W' : k === 'h' ? 'H' : k}</span>
              <NumField value={`${Math.round(el[k] * 10) / 10}px`} onChange={(v) => v && cmd('geom', { [k]: parseFloat(v), ...(k === 'w' && isWords ? {} : {}) })} scrub={k.toUpperCase()} />
            </label>
          ))}
          <label className="flex items-center gap-1.5">
            <span className="w-4 shrink-0 text-[11.5px] text-fg-3">↻</span>
            <NumField value={`${el.r}deg`} units={['deg']} onChange={(v) => v !== null && cmd('geom', { r: parseFloat(v) || 0 })} min={-180} max={180} />
          </label>
        </div>
        <Row label="On the page">
          <Icons items={alignItems} />
        </Row>
        <Row label="Order">
          <Icons items={orderItems} />
        </Row>
        {!isWords && (
          <Row label="Flip">
            <Icons
              items={[
                { icon: <FlipHorizontal2 size={15} />, title: tr('Flip across'), on: el.fx, run: () => cmd('flip', 'h') },
                { icon: <FlipVertical2 size={15} />, title: tr('Flip up and down'), on: el.fy, run: () => cmd('flip', 'v') },
              ]}
            />
          </Row>
        )}
        <Slider label="See-through" value={Math.round((1 - n(st.opacity, 1)) * 100)} min={0} max={100} onChange={(v) => style({ opacity: v ? String(Math.round((1 - v / 100) * 100) / 100) : null })} unit="%" />
      </Fold>
      </div>
      <MediaPick
        kind={replace}
        onClose={() => setReplace(null)}
        onPick={(m) => {
          setReplace(null);
          if (m.kind === 'video')
            run(
              post<{ url: string; poster?: string }>('/api/pages/videos/from-media', { media: m.id }).then((r) => cmd('video', { src: r.url, poster: r.poster })),
            );
          else run(pageData(`/api/media/${m.id}/file`).then((src) => cmd('picture', { src, alt: m.title })));
        }}
      />
    </div>
  );
}

/** The words of a text element, changed as they are typed (a step to undo while typing goes on). */
function WordsBox({ words, focus, onChange }: { words: string; focus: number; onChange: (v: string) => void }) {
  const [v, setV] = useState(words);
  const ref = useRef<HTMLTextAreaElement>(null);
  const editing = useRef(false);
  useEffect(() => {
    if (!editing.current) setV(words);
  }, [words]);
  useEffect(() => {
    if (focus) ref.current?.focus();
  }, [focus]);
  return (
    <textarea
      ref={ref}
      value={v}
      rows={Math.min(5, Math.max(2, v.split('\n').length))}
      onFocus={() => (editing.current = true)}
      onBlur={() => (editing.current = false)}
      onChange={(e) => {
        setV(e.target.value);
        onChange(e.target.value);
      }}
      aria-label="Words"
      placeholder="Its words"
      className={cx(inputCls, 'h-auto w-full resize-y py-1.5 text-[13px] leading-snug')}
    />
  );
}

/** Replace the picture: from this device, the Library, or made with AI. */
function ReplacePicture({ empty, onDevice, onLibrary, onAi }: { empty: boolean; onDevice: (src: string) => void; onLibrary: () => void; onAi: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button ref={ref} size="sm" variant={empty ? 'primary' : 'secondary'} icon={<Replace size={14} />} onClick={() => setOpen((o) => !o)}>
        {empty ? 'Add a picture' : 'Replace'}
      </Button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={230} title="Replace">
        <MenuItem icon={<ImageUp size={14} />} onClick={() => (setOpen(false), file.current?.click())}>
          From this device
        </MenuItem>
        <MenuItem icon={<LibraryBig size={14} />} onClick={() => (setOpen(false), onLibrary())}>
          From your Library
        </MenuItem>
        <MenuItem
          icon={<ImageUp size={14} />}
          onClick={() => {
            setOpen(false);
            void choosePhoto({})
              .then(async (p) => p && onDevice(await pageData(p.src)))
              .catch(toastError);
          }}
        >
          Free photos
        </MenuItem>
        <MenuItem icon={<WandSparkles size={14} />} onClick={() => (setOpen(false), onAi())}>
          Make with AI
        </MenuItem>
      </Popover>
      <input
        ref={file}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f)
            void pictureData(f)
              .then(onDevice)
              .catch(toastError);
        }}
      />
    </>
  );
}

function QrFields({ text, dark, light, palette, onChange }: { text: string; dark: string; light: string; palette: string[]; onChange: (text: string, c: { dark: string; light: string | null }) => void }) {
  const [v, setV] = useState(text);
  const [ink, setInk] = useState(dark);
  const [ground, setGround] = useState<string | null>(light || null);
  useEffect(() => setV(text), [text]);
  const put = (t: string, c: { dark: string; light: string | null }) => {
    try {
      if (t.trim()) onChange(t.trim(), c);
    } catch (e) {
      toast((e as Error).message);
    }
  };
  return (
    <div className="space-y-1 px-3 pt-1">
      <Row label="Link or words">
        <input value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== text && put(v, { dark: ink, light: ground })} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} className={cx(inputCls, 'h-8 min-w-0 flex-1 text-[12.5px]')} />
      </Row>
      <Row label="Its squares">
        <ColorField value={ink} palette={palette} onChange={(c) => (setInk(c ?? '#000000'), put(v, { dark: c ?? '#000000', light: ground }))} />
      </Row>
      <Row label="Its ground">
        <ColorField value={ground} none palette={['#ffffff', ...palette]} onChange={(c) => (setGround(c), put(v, { dark: ink, light: c }))} />
      </Row>
      <p className="text-[11.5px] leading-snug text-fg-3">{tr('Dark squares on a light ground read best.')}</p>
    </div>
  );
}


/** A whole new palette for the design: a ready one, one read from a picture, or one suggested from a mood. */
function NewColours({ cmd }: { cmd: DCmd }) {
  const [mood, setMood] = useState('');
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const apply = (colours: string[]) => {
    if (colours.length) cmd('brandColours', { colours });
  };
  const suggest = async () => {
    if (!mood.trim()) return;
    setBusy(true);
    try {
      apply((await post<{ colours: string[] }>('/api/write/palette', { mood })).colours);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2">
      <p className="text-[11.5px] leading-snug text-fg-3">{tr('Its colourful colours take a palette’s; its whites, greys and blacks stay. Undo takes it back.')}</p>
      <div className="grid grid-cols-4 gap-1.5">
        {PALETTES.map((p) => (
          <button key={p.id} type="button" title={tr(p.label)} onClick={() => apply(p.colours)} className="flex h-7 overflow-hidden rounded-md border border-line">
            {p.colours.map((c) => (
              <span key={c} className="h-full flex-1" style={{ background: c }} />
            ))}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        <input value={mood} onChange={(e) => setMood(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void suggest()} placeholder={tr('A mood: warm and earthy…')} className={cx(fieldCls, 'min-w-0 flex-1')} />
        <Button size="sm" variant="secondary" icon={busy ? <Throbber size={13} /> : <Sparkles size={14} />} disabled={!mood.trim() || busy} onClick={() => void suggest()} title="By the helper model (Settings → Models)">
          Suggest
        </Button>
      </div>
      <Button size="sm" variant="ghost" icon={<ImageUp size={14} />} onClick={() => file.current?.click()} title="Read here: the picture goes nowhere">
        From a picture
      </Button>
      <input
        ref={file}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f)
            void pictureData(f)
              .then((src) => coloursOf(src, 5))
              .then(apply)
              .catch(toastError);
        }}
      />
    </div>
  );
}
