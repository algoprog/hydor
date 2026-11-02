// The visual editor's Part tab: the part picked in the page. At its top, what it does (ask an agent about
// it, copy, paste, wrap), and where changes go: this part alone or every part of its kind or class, as it
// is or under the pointer, and (with a tablet or phone picked above the page) at that size and smaller. Then
// its words, address or picture, and its look in groups that fold: text, fill and border, space, size,
// layout, and its class, name and CSS. A change goes to the editor in the page's frame at once.
import { useRef, useState, type ReactNode } from 'react';
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, ClipboardPaste, Copy, ImageUp, Italic, MessageSquarePlus, MoreHorizontal, Strikethrough, Type, Underline } from 'lucide-react';
import { Button, cx, IconButton, MenuItem, MenuSep, Popover, Switch } from '../../../components/ui';
import type { EdSel } from '../frame';
import { BoxModel, Choice, ColorField, Group, hexOf, NumField, Row, Select, splitNum, Typed } from './fields';
import { FONTS, fontOf, fontOptions } from './fonts';

export type Cmd = (cmd: string, arg?: unknown) => void;
export type Media = '' | 'tablet' | 'phone';
/** Where the inspector's changes go: this part ("self"), every part of its kind ("tag") or with a class (".card"); as it is or on hover. */
export interface Ctx {
  scope: string;
  state: '' | 'hover';
}

export const MEDIA_NOTE: Record<Exclude<Media, ''>, string> = {
  tablet: 'Changes here are for tablets and phones: screens 900 px wide or narrower',
  phone: 'Changes here are for phones: screens 600 px wide or narrower',
};

/** A picture from this device, made small enough to live in the page (at most 1600 pixels wide). */
export async function pictureData(f: File): Promise<string> {
  if (f.type === 'image/svg+xml' || f.type === 'image/gif') {
    if (f.size > 1_000_000) throw new Error('That picture is over 1 MB');
    return new Promise((ok, fail) => {
      const r = new FileReader();
      r.onload = () => ok(String(r.result));
      r.onerror = () => fail(new Error('The picture could not be read'));
      r.readAsDataURL(f);
    });
  }
  const bmp = await createImageBitmap(f);
  const scale = Math.min(1, 1600 / bmp.width);
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  const type = f.type === 'image/png' ? 'image/png' : 'image/jpeg';
  let url = c.toDataURL(type, 0.85);
  // Big PNG photos go in as JPEG.
  if (url.length > 900_000 && type === 'image/png') url = c.toDataURL('image/jpeg', 0.82);
  return url;
}

/** A button that picks a picture from this device and hands it over as a data address. */
export function PictureButton({ onPicture, onError, title = 'A picture from this device' }: { onPicture: (src: string) => void; onError: (e: unknown) => void; title?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        title={title}
        aria-label={title}
        onClick={() => ref.current?.click()}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-line text-fg-2 hover:bg-bg-2"
      >
        <ImageUp size={14} />
      </button>
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

const TURN = [
  { value: 'h1', label: 'H1', title: 'Heading 1' },
  { value: 'h2', label: 'H2', title: 'Heading 2' },
  { value: 'h3', label: 'H3', title: 'Heading 3' },
  { value: 'p', label: 'Text', title: 'Text' },
  { value: 'blockquote', label: '❝', title: 'Quote' },
];
export const WEIGHTS = [
  { value: '300', label: 'Light (300)' },
  { value: '400', label: 'Regular (400)' },
  { value: '500', label: 'Medium (500)' },
  { value: '600', label: 'Semibold (600)' },
  { value: '700', label: 'Bold (700)' },
  { value: '800', label: 'Extra bold (800)' },
  { value: '900', label: 'Black (900)' },
];
const SHADOWS: Record<string, string | null> = { none: null, soft: '0 1px 3px rgba(0,0,0,.12)', medium: '0 6px 18px rgba(0,0,0,.14)', strong: '0 16px 40px rgba(0,0,0,.22)' };
const shadowOf = (v: string) => (!v || v === 'none' ? 'none' : (Object.entries(SHADOWS).find(([, s]) => s && v.replace(/\s/g, '').includes(s.split(' ')[1]?.replace(/\s/g, '') ?? '§'))?.[0] ?? null));

/** How a part lays out what is in it, in the inspector's words. */
function layoutOf(c: Record<string, string>): 'block' | 'row' | 'column' | 'grid' | 'hidden' | null {
  const d = c.display ?? '';
  if (d === 'none') return 'hidden';
  if (d.includes('grid')) return 'grid';
  if (d.includes('flex')) return c['flex-direction']?.startsWith('column') ? 'column' : 'row';
  return d === 'block' || d === 'flow-root' || d === 'list-item' ? 'block' : null;
}

export function PartPanel({
  sel,
  palette,
  fonts,
  cmd,
  ctx,
  onCtx,
  media,
  clip,
  onAsk,
  onError,
  onPageTab,
}: {
  sel: EdSel;
  palette: string[];
  /** The page's Google fonts, loaded already. */
  fonts: string[];
  cmd: Cmd;
  ctx: Ctx;
  onCtx: (c: Ctx) => void;
  media: Media;
  clip: { html: string; name: string } | null;
  onAsk?: () => void;
  onError: (e: unknown) => void;
  onPageTab: () => void;
}) {
  const moreRef = useRef<HTMLButtonElement>(null);
  const [more, setMore] = useState(false);
  const c = sel.computed;
  const d = sel.declared;
  const get = (p: string) => d[p] ?? c[p] ?? '';
  const isSet = (p: string) => !!d[p];
  const style = (props: Record<string, string | null>) => cmd('style', props);
  const reset =
    (...ps: string[]) =>
    () =>
      style(Object.fromEntries(ps.map((p) => [p, null])));
  const a = sel.attrs;
  const page = sel.tag === 'body';

  if (page)
    return (
      <div className="space-y-3 px-3 pt-1 pb-4">
        <p className="text-[12.5px] leading-relaxed text-fg-2">This is the page itself. Its colours, fonts, width and the look of its headings, links and buttons are on the Page tab.</p>
        <Button size="sm" variant="secondary" icon={<Type size={14} />} onClick={onPageTab}>
          The page’s look
        </Button>
      </div>
    );

  const isImg = sel.tag === 'img';
  const isLink = sel.tag === 'a';
  const isField = sel.tag === 'input' || sel.tag === 'textarea';
  const textual = sel.wordy || sel.children > 0 || !!sel.words;
  const lay = layoutOf(c);
  const flex = lay === 'row' || lay === 'column';
  const scopes = [
    { value: 'self', label: 'This part' },
    { value: 'tag', label: `Every ${sel.name} (${sel.counts.tag ?? 1})` },
    ...sel.classes.slice(0, 8).map((k) => ({ value: `.${k}`, label: `Every .${k} (${sel.counts[`.${k}`] ?? 1})` })),
  ];
  const font = fontOf(get('font-family'));
  const setFont = (v: string) => {
    const f = FONTS.find((x) => x.value === v);
    if (!f) return style({ 'font-family': null });
    if (f.google && !fonts.includes(f.value)) cmd('fonts', [...fonts, f.value]);
    style({ 'font-family': f.css });
  };
  const deco = get('text-decoration-line');
  const toggle = (on: boolean, props: Record<string, string | null>, off: Record<string, string | null>) => style(on ? off : props);
  const [w] = splitNum(c.width);
  const [h] = splitNum(c.height);
  const bgImage = /url\(["']?([^"')]*)/.exec(get('background-image'))?.[1] ?? '';

  return (
    <div className="px-3 pb-4">
      <div className="flex items-center gap-1 pb-2">
        {onAsk && (
          <Button size="sm" variant="secondary" icon={<MessageSquarePlus size={14} />} onClick={onAsk} title="Puts a note in your message box saying which part you mean">
            Ask the agent
          </Button>
        )}
        <span className="flex-1" />
        <IconButton label="Copy (Ctrl+C)" size="sm" onClick={() => cmd('copy')}>
          <Copy size={14} />
        </IconButton>
        <IconButton label={clip ? `Paste ${clip.name || 'the part copied'} after it (Ctrl+V)` : 'Paste: copy a part first'} size="sm" disabled={!clip} onClick={() => cmd('paste', { where: 'after' })}>
          <ClipboardPaste size={14} />
        </IconButton>
        <IconButton ref={moreRef} label="More" size="sm" active={more} onClick={() => setMore((o) => !o)}>
          <MoreHorizontal size={15} />
        </IconButton>
        <Popover anchor={moreRef} open={more} onClose={() => setMore(false)} align="end" width={230} title={sel.name}>
          {[
            { label: 'Cut', hint: 'Ctrl+X', run: () => cmd('cut') },
            ...(clip && sel.holds ? [{ label: 'Paste inside it', run: () => cmd('paste', { where: 'inside' }) }] : []),
            { label: 'Wrap in a block', hint: 'Ctrl+G', run: () => cmd('wrap') },
            ...(sel.children ? [{ label: 'Take out what is in it', hint: 'Ctrl+Shift+G', run: () => cmd('unwrap') }] : []),
            { label: 'Duplicate', hint: 'Ctrl+D', run: () => cmd('dup') },
            { label: 'Show it on the page', run: () => cmd('reveal') },
          ].map((m) => (
            <MenuItem
              key={m.label}
              hint={m.hint}
              onClick={() => {
                setMore(false);
                m.run();
              }}
            >
              {m.label}
            </MenuItem>
          ))}
          <MenuSep />
          <MenuItem
            danger
            hint="Delete"
            onClick={() => {
              setMore(false);
              cmd('del');
            }}
          >
            Delete
          </MenuItem>
        </Popover>
      </div>

      <div className="mb-1 space-y-1.5 rounded-xl bg-bg-1 p-2">
        <div className="flex items-center gap-1.5">
          <Select value={ctx.scope} options={scopes} onChange={(v) => onCtx({ ...ctx, scope: v })} title="Which parts the changes below are for" />
          <div className="w-[112px] shrink-0">
            <Choice
              value={ctx.state || 'normal'}
              onChange={(v) => onCtx({ ...ctx, state: v === 'hover' ? 'hover' : '' })}
              options={[
                { value: 'normal', label: 'Normal', title: 'As it is' },
                { value: 'hover', label: 'Hover', title: 'While the pointer is over it' },
              ]}
            />
          </div>
        </div>
        {(ctx.scope !== 'self' || ctx.state || media) && (
          <p className="px-0.5 text-[11.5px] leading-snug text-fg-3">
            {[ctx.scope !== 'self' ? `Every part it names changes together.` : '', ctx.state ? 'Shown while the pointer is over it.' : '', media ? MEDIA_NOTE[media] : ''].filter(Boolean).join(' ')}
          </p>
        )}
      </div>

      {(sel.words !== undefined || isLink || isImg || isField || /^(h[1-6]|p|blockquote)$/.test(sel.tag)) && (
        <Group id="content" title="Content" start summary={sel.snippet}>
          {sel.words !== undefined && (
            <Row label="Words" top>
              <Typed value={sel.words} onChange={(v) => cmd('words', v)} area label="Words" />
            </Row>
          )}
          {/^(h[1-6]|p|blockquote)$/.test(sel.tag) && (
            <Row label="Kind">
              <Choice value={sel.tag} onChange={(v) => cmd('retag', v)} options={TURN} />
            </Row>
          )}
          {isLink && (
            <>
              <Row label="Goes to">
                <Typed value={a.href ?? ''} onChange={(v) => cmd('attr', { name: 'href', value: v || null })} placeholder="https://…" label="Goes to" />
              </Row>
              <Row label="New tab">
                <Switch label="Opens in a new tab" on={a.target === '_blank'} onChange={(on) => cmd('attr', { name: 'target', value: on ? '_blank' : null })} />
              </Row>
            </>
          )}
          {isImg && (
            <>
              <Row label="Picture">
                <Typed
                  value={a.src?.startsWith('data:') ? '' : (a.src ?? '')}
                  onChange={(v) => v && cmd('attr', { name: 'src', value: v })}
                  placeholder={a.src?.startsWith('data:') ? 'In the page' : 'https://…'}
                  label="Picture"
                />
                <PictureButton onPicture={(src) => cmd('attr', { name: 'src', value: src })} onError={onError} />
              </Row>
              <Row label="Description" hint="Read out by screen readers, and shown when the picture can't load">
                <Typed value={a.alt ?? ''} onChange={(v) => cmd('attr', { name: 'alt', value: v })} placeholder="What it shows" label="Description" />
              </Row>
            </>
          )}
          {isField && (
            <Row label="Placeholder">
              <Typed value={a.placeholder ?? ''} onChange={(v) => cmd('attr', { name: 'placeholder', value: v || null })} label="Placeholder" />
            </Row>
          )}
        </Group>
      )}

      {textual && (
        <Group
          id="text"
          title="Text"
          start
          summary={[FONTS.find((f) => f.value === font)?.label, c['font-size'], WEIGHTS.find((x) => x.value === c['font-weight'])?.label.replace(/ \(\d+\)$/, '')].filter(Boolean).join(' · ')}
        >
          <Row label="Font" set={isSet('font-family')} onReset={reset('font-family')}>
            <Select
              value={isSet('font-family') ? font || get('font-family').split(',')[0].replace(/["']/g, '').trim() : ''}
              options={fontOptions(font && !isSet('font-family') ? `As around it (${FONTS.find((f) => f.value === font)?.label})` : 'As around it')}
              onChange={setFont}
              title="Font"
            />
          </Row>
          <Row label="Size" set={isSet('font-size')} onReset={reset('font-size')}>
            <NumField value={get('font-size')} onChange={(v) => style({ 'font-size': v })} units={['px', 'em', 'rem', '%']} min={0} scrub="A" title="Text size" />
            <Select value={c['font-weight'] ?? '400'} options={WEIGHTS} onChange={(v) => style({ 'font-weight': v })} title="Weight" className="w-[118px] shrink-0" />
          </Row>
          <Row label="Spacing" set={isSet('line-height') || isSet('letter-spacing')} onReset={reset('line-height', 'letter-spacing')} hint="The height of its lines, and the space between its letters">
            <NumField
              value={get('line-height') === 'normal' ? '' : get('line-height')}
              onChange={(v) => style({ 'line-height': v })}
              units={['', 'px', 'em']}
              words={['normal']}
              min={0}
              step={0.1}
              scrub="↕"
              placeholder="Auto"
              title="Line height"
            />
            <NumField
              value={get('letter-spacing') === 'normal' ? '' : get('letter-spacing')}
              onChange={(v) => style({ 'letter-spacing': v })}
              units={['px', 'em']}
              step={0.1}
              scrub="↔"
              placeholder="0"
              title="Letter spacing"
            />
          </Row>
          <Row label="Colour" set={isSet('color')} onReset={reset('color')}>
            <ColorField value={hexOf(get('color'))} palette={palette} onChange={(v) => style({ color: v })} />
          </Row>
          <Row label="Align" set={isSet('text-align')} onReset={reset('text-align')}>
            <Choice
              value={c['text-align'] === 'center' ? 'center' : c['text-align'] === 'right' || c['text-align'] === 'end' ? 'right' : c['text-align'] === 'justify' ? 'justify' : 'left'}
              onChange={(v) => style({ 'text-align': v })}
              options={[
                { value: 'left', label: <AlignLeft size={14} />, title: 'Left' },
                { value: 'center', label: <AlignCenter size={14} />, title: 'Centre' },
                { value: 'right', label: <AlignRight size={14} />, title: 'Right' },
                { value: 'justify', label: <AlignJustify size={14} />, title: 'Both edges' },
              ]}
            />
          </Row>
          <Row label="Style" set={isSet('font-style') || isSet('text-decoration-line') || isSet('text-transform')} onReset={reset('font-style', 'text-decoration-line', 'text-transform')}>
            <div className="flex gap-1">
              {(
                [
                  { on: c['font-style'] === 'italic', icon: <Italic size={14} />, title: 'Italic', props: { 'font-style': 'italic' }, off: { 'font-style': 'normal' } },
                  { on: deco.includes('underline'), icon: <Underline size={14} />, title: 'Underlined', props: { 'text-decoration-line': 'underline' }, off: { 'text-decoration-line': 'none' } },
                  {
                    on: deco.includes('line-through'),
                    icon: <Strikethrough size={14} />,
                    title: 'Struck through',
                    props: { 'text-decoration-line': 'line-through' },
                    off: { 'text-decoration-line': 'none' },
                  },
                  {
                    on: c['text-transform'] === 'uppercase',
                    icon: <span className="text-[11px] font-bold">AA</span>,
                    title: 'Capitals',
                    props: { 'text-transform': 'uppercase' },
                    off: { 'text-transform': 'none' },
                  },
                ] as { on: boolean; icon: ReactNode; title: string; props: Record<string, string>; off: Record<string, string> }[]
              ).map((t) => (
                <button
                  key={t.title}
                  type="button"
                  title={t.title}
                  aria-label={t.title}
                  aria-pressed={t.on}
                  onClick={() => toggle(t.on, t.props, t.off)}
                  className={cx('grid h-8 w-8 place-items-center rounded-lg border text-fg-2 transition-colors', t.on ? 'border-accent/60 bg-accent-soft text-accent' : 'border-line hover:bg-bg-2')}
                >
                  {t.icon}
                </button>
              ))}
            </div>
          </Row>
        </Group>
      )}

      <Group id="fill" title="Fill and border" summary={hexOf(get('background-color')) ?? (bgImage ? 'Picture' : '')}>
        <Row label="Fill" set={isSet('background-color')} onReset={reset('background-color')}>
          <ColorField value={hexOf(get('background-color'))} palette={palette} onChange={(v) => style({ 'background-color': v ?? 'transparent' })} none />
        </Row>
        <Row label="Picture" set={isSet('background-image')} onReset={reset('background-image', 'background-size', 'background-position', 'background-repeat')} hint="A picture behind what is in it">
          <Typed
            value={bgImage.startsWith('data:') ? '' : bgImage}
            onChange={(v) => style(v ? { 'background-image': `url("${v.replace(/"/g, '%22')}")`, 'background-size': 'cover', 'background-position': 'center' } : { 'background-image': null })}
            placeholder={bgImage.startsWith('data:') ? 'In the page' : 'https://…'}
            label="Picture behind it"
          />
          <PictureButton onPicture={(src) => style({ 'background-image': `url("${src}")`, 'background-size': 'cover', 'background-position': 'center' })} onError={onError} />
        </Row>
        <Row label="See-through" set={isSet('opacity')} onReset={reset('opacity')} hint="How much shows through it">
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round((1 - (parseFloat(get('opacity') || '1') || 0)) * 100)}
            onChange={(e) => style({ opacity: String(1 - Number(e.target.value) / 100) })}
            className="min-w-0 flex-1 accent-[var(--accent)]"
            aria-label="See-through"
          />
          <span className="w-9 shrink-0 text-right text-[12px] text-fg-3 tabular-nums">{Math.round((1 - (parseFloat(get('opacity') || '1') || 0)) * 100)}%</span>
        </Row>
        <Row label="Corners" set={isSet('border-top-left-radius')} onReset={reset('border-radius')}>
          <NumField value={get('border-top-left-radius')} onChange={(v) => style({ 'border-radius': v })} units={['px', '%']} min={0} scrub="◜" title="Rounded corners" />
        </Row>
        <Row label="Border" set={isSet('border-top-width') || isSet('border-top-style')} onReset={reset('border')}>
          <Select
            value={c['border-top-style'] && c['border-top-style'] !== 'none' && splitNum(c['border-top-width'])[0] ? c['border-top-style'] : 'none'}
            options={[
              { value: 'none', label: 'None' },
              { value: 'solid', label: 'Line' },
              { value: 'dashed', label: 'Dashes' },
              { value: 'dotted', label: 'Dots' },
            ]}
            onChange={(v) =>
              style(
                v === 'none'
                  ? { border: 'none' }
                  : { 'border-style': v, 'border-width': splitNum(c['border-top-width'])[0] ? c['border-top-width'] : '1px', 'border-color': hexOf(c['border-top-color']) ?? 'currentColor' },
              )
            }
            title="Border"
          />
          {c['border-top-style'] && c['border-top-style'] !== 'none' && (
            <NumField value={get('border-top-width')} onChange={(v) => style({ 'border-width': v })} min={0} scrub="W" title="Border width" className="max-w-[84px]" />
          )}
        </Row>
        {c['border-top-style'] && c['border-top-style'] !== 'none' && (
          <Row label="Border colour" set={isSet('border-top-color')} onReset={reset('border-color')}>
            <ColorField value={hexOf(get('border-top-color'))} palette={palette} onChange={(v) => style({ 'border-color': v })} />
          </Row>
        )}
        <Row label="Shadow" set={isSet('box-shadow')} onReset={reset('box-shadow')}>
          <Choice
            value={shadowOf(get('box-shadow'))}
            onChange={(v) => style({ 'box-shadow': SHADOWS[v] ?? 'none' })}
            options={[
              { value: 'none', label: 'None' },
              { value: 'soft', label: 'Soft' },
              { value: 'medium', label: 'Medium' },
              { value: 'strong', label: 'Strong' },
            ]}
          />
        </Row>
      </Group>

      <Group id="space" title="Space" summary={`${c['padding-top'] ?? ''} inside`}>
        <BoxModel get={get} isSet={isSet} onChange={style} size={w !== null && h !== null ? `${Math.round(w)} × ${Math.round(h)}` : ''} />
      </Group>

      <Group id="size" title="Size" summary={w !== null && h !== null ? `${Math.round(w)} × ${Math.round(h)}` : ''}>
        <Row label="Width" set={isSet('width') || isSet('max-width')} onReset={reset('width', 'max-width')}>
          <NumField
            value={d.width ?? ''}
            onChange={(v) => style({ width: v })}
            units={['px', '%', 'vw']}
            words={['auto']}
            min={0}
            scrub="W"
            placeholder={w !== null ? `${Math.round(w)}` : 'Auto'}
            title="Width"
          />
          <NumField
            value={get('max-width') === 'none' ? '' : get('max-width')}
            onChange={(v) => style({ 'max-width': v })}
            units={['px', '%']}
            words={['none']}
            min={0}
            scrub="≤"
            placeholder="Any"
            title="At most this wide"
          />
        </Row>
        <Row label="Height" set={isSet('height') || isSet('min-height')} onReset={reset('height', 'min-height')}>
          <NumField
            value={d.height ?? ''}
            onChange={(v) => style({ height: v })}
            units={['px', '%', 'vh']}
            words={['auto']}
            min={0}
            scrub="H"
            placeholder={h !== null ? `${Math.round(h)}` : 'Auto'}
            title="Height"
          />
          <NumField
            value={get('min-height') === 'auto' || get('min-height') === '0px' ? '' : get('min-height')}
            onChange={(v) => style({ 'min-height': v })}
            units={['px', 'vh']}
            min={0}
            scrub="≥"
            placeholder="Any"
            title="At least this tall"
          />
        </Row>
        {(isImg || sel.tag === 'video') && (
          <Row label="Fit" set={isSet('object-fit')} onReset={reset('object-fit')} hint="How the picture fills its size">
            <Choice
              value={(c['object-fit'] as 'cover' | 'contain' | 'fill') ?? 'fill'}
              onChange={(v) => style({ 'object-fit': v })}
              options={[
                { value: 'cover', label: 'Fill, cut', title: 'Fills it, cut at the edges' },
                { value: 'contain', label: 'Whole', title: 'All of it shows' },
                { value: 'fill', label: 'Stretch', title: 'Stretched to it' },
              ]}
            />
          </Row>
        )}
      </Group>

      <Group id="layout" title="Layout" summary={lay ? { block: 'One under another', row: 'In a row', column: 'In a column', grid: 'In a grid', hidden: 'Hidden' }[lay] : ''}>
        <Row label="Show" set={isSet('display')} onReset={reset('display', 'flex-direction', 'grid-template-columns')} hint="How the parts in it sit, or hide it">
          <Select
            value={lay ?? ''}
            onChange={(v) =>
              style(
                v === 'row'
                  ? { display: 'flex', 'flex-direction': 'row', 'grid-template-columns': null }
                  : v === 'column'
                    ? { display: 'flex', 'flex-direction': 'column', 'grid-template-columns': null }
                    : v === 'grid'
                      ? { display: 'grid', 'grid-template-columns': 'repeat(auto-fit, minmax(200px, 1fr))', 'flex-direction': null }
                      : v === 'hidden'
                        ? { display: 'none' }
                        : { display: 'block', 'flex-direction': null, 'grid-template-columns': null },
              )
            }
            options={[
              ...(lay ? [] : [{ value: '', label: 'As it is' }]),
              { value: 'block', label: 'One under another' },
              { value: 'row', label: 'In a row' },
              { value: 'column', label: 'In a column' },
              { value: 'grid', label: 'In a grid' },
              { value: 'hidden', label: media ? 'Hidden at this size' : 'Hidden' },
            ]}
            title="Show"
          />
        </Row>
        {flex && (
          <>
            <Row label="Line up" set={isSet('align-items')} onReset={reset('align-items')}>
              <Choice
                value={(c['align-items'] === 'normal' ? 'stretch' : c['align-items']) as string}
                onChange={(v) => style({ 'align-items': v })}
                options={[
                  { value: 'flex-start', label: 'Start' },
                  { value: 'center', label: 'Middle' },
                  { value: 'flex-end', label: 'End' },
                  { value: 'stretch', label: 'Fill' },
                ]}
              />
            </Row>
            <Row label="Spread" set={isSet('justify-content')} onReset={reset('justify-content')}>
              <Choice
                value={(c['justify-content'] === 'normal' ? 'flex-start' : c['justify-content']) as string}
                onChange={(v) => style({ 'justify-content': v })}
                options={[
                  { value: 'flex-start', label: 'Start' },
                  { value: 'center', label: 'Middle' },
                  { value: 'flex-end', label: 'End' },
                  { value: 'space-between', label: 'Apart' },
                ]}
              />
            </Row>
            <Row label="Wrap" set={isSet('flex-wrap')} onReset={reset('flex-wrap')}>
              <Switch label="Onto more lines when there is no room" on={c['flex-wrap'] === 'wrap'} onChange={(on) => style({ 'flex-wrap': on ? 'wrap' : 'nowrap' })} />
            </Row>
          </>
        )}
        {lay === 'grid' && (
          <Row label="Columns" set={isSet('grid-template-columns')} onReset={reset('grid-template-columns')} hint="As many as fit, or a number of them">
            <Select
              value={/auto-fit|auto-fill/.test(get('grid-template-columns')) || !isSet('grid-template-columns') ? 'fit' : String(get('grid-template-columns').split(/\s+(?![^(]*\))/).length)}
              options={[{ value: 'fit', label: 'As many as fit' }, ...[1, 2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: n === 1 ? '1 column' : `${n} columns` }))]}
              onChange={(v) => style({ 'grid-template-columns': v === 'fit' ? 'repeat(auto-fit, minmax(200px, 1fr))' : `repeat(${v}, minmax(0, 1fr))` })}
              title="Columns"
            />
          </Row>
        )}
        {(flex || lay === 'grid') && (
          <Row label="Gap" set={isSet('gap') || isSet('row-gap') || isSet('column-gap')} onReset={reset('gap')}>
            <NumField
              value={get('gap').split(' ')[0] === 'normal' ? '' : get('gap').split(' ')[0]}
              onChange={(v) => style({ gap: v })}
              units={['px', 'em', '%']}
              min={0}
              scrub="↔"
              placeholder="0"
              title="Space between the parts in it"
            />
          </Row>
        )}
        <Row label="Place" set={isSet('position')} onReset={reset('position', 'top', 'right', 'bottom', 'left', 'z-index')} hint="Where it sits: where the page puts it, or moved, pinned or stuck">
          <Select
            value={c.position ?? 'static'}
            options={[
              { value: 'static', label: 'Where it falls' },
              { value: 'relative', label: 'Moved from there' },
              { value: 'absolute', label: 'On its block' },
              { value: 'fixed', label: 'On the screen' },
              { value: 'sticky', label: 'Sticks when scrolled' },
            ]}
            onChange={(v) => style({ position: v === 'static' ? null : v })}
            title="Place"
          />
        </Row>
        {c.position && c.position !== 'static' && (
          <div className="grid grid-cols-2 gap-1 pl-[92px]">
            {(['top', 'right', 'bottom', 'left'] as const).map((p) => (
              <NumField
                key={p}
                value={d[p] ?? ''}
                onChange={(v) => style({ [p]: v })}
                units={['px', '%']}
                words={['auto']}
                scrub={p[0].toUpperCase()}
                placeholder="Auto"
                title={{ top: 'From the top', right: 'From the right', bottom: 'From the bottom', left: 'From the left' }[p]}
              />
            ))}
            <NumField
              value={d['z-index'] ?? ''}
              onChange={(v) => style({ 'z-index': v === null ? null : String(Math.round(parseFloat(v) || 0)) })}
              units={['']}
              words={['auto']}
              scrub="Z"
              placeholder="Layer"
              title="In front of others (higher is nearer)"
            />
          </div>
        )}
      </Group>

      <More sel={sel} cmd={cmd} />
    </div>
  );
}

/** Less often: its class and id, and what is set for it here as CSS. */
function More({ sel, cmd }: { sel: EdSel; cmd: Cmd }) {
  const css = Object.entries(sel.declared)
    .map(([k, v]) => `${k}: ${v};`)
    .join('\n');
  return (
    <Group id="more" title="Class, name and CSS">
      <Row label="Class" hint="Names it shares with others, which the page's CSS styles">
        <Typed value={sel.classes.join(' ')} onChange={(v) => cmd('attr', { name: 'class', value: v.trim() || null })} label="Class" />
      </Row>
      <Row label="Name (id)" hint="A name of its own: a link to #name goes to it">
        <Typed value={sel.attrs.id ?? ''} onChange={(v) => cmd('attr', { name: 'id', value: v.trim() || null })} label="Name" />
      </Row>
      <div className="space-y-1 pt-1">
        <span className="text-[12px] text-fg-3">CSS set here</span>
        <Typed value={css} onChange={(v) => cmd('css', v.replace(/\n/g, ' '))} area mono placeholder={'color: #333;\npadding: 12px;'} label="CSS set here" />
      </div>
    </Group>
  );
}
