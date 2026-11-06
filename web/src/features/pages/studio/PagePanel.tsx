// The visual editor's Page tab: the look of the whole page. Its title and background, its icon and cover (as
// Notion pages have them), how wide its content runs, the colours it names (its CSS variables, the page kit's
// among them), its fonts, how its text, headings, links and buttons look everywhere in it, and CSS of your own.
// With a tablet or phone picked above the page, sizes changed here are for that size and smaller.
import { useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Smile, Trash2 } from 'lucide-react';
import { cx, IconButton, Popover, SheetsOnPhone, Throbber } from '../../../components/ui';
import type { EdPage } from '../frame';
import { CharPicker } from '../common/CharPicker';
import { Choice, ColorField, Group, hexOf, NumField, Row, Select, splitNum, Typed } from './fields';
import { FONTS, fontOf, fontOptions } from './fonts';
import { aiCover, CoverChoices } from './Inserts';
import { MEDIA_NOTE, WEIGHTS, type Cmd, type Media } from './Inspector';

/** The page kit's colours (and corners), in plain words. */
const KIT_VARS: Record<string, string> = {
  '--n-bg': 'Background',
  '--n-card': 'Cards',
  '--n-fg': 'Text',
  '--n-muted': 'Quiet text',
  '--n-line': 'Lines',
  '--n-soft': 'Soft fill',
  '--n-accent': 'Accent',
  '--n-accent-fg': 'On accent',
  '--n-accent-soft': 'Accent tint',
  '--n-ok': 'Good',
  '--n-err': 'Bad',
  '--n-radius': 'Corners',
};
const isColour = (v: string) => !!v && !/^(inherit|initial|unset|revert|currentcolor)$/i.test(v) && typeof CSS !== 'undefined' && CSS.supports('color', v);

const KINDS: { kind: string; label: string }[] = [
  { kind: 'body', label: 'Text' },
  { kind: 'h1', label: 'Heading 1' },
  { kind: 'h2', label: 'Heading 2' },
  { kind: 'h3', label: 'Heading 3' },
  { kind: 'a:not(.n-btn)', label: 'Links' },
  { kind: ':is(button, .n-btn)', label: 'Buttons' },
];

const WIDTHS = [
  { value: 'full', label: 'Full', px: null },
  { value: 'wide', label: 'Wide', px: '1200px' },
  { value: 'medium', label: 'Medium', px: '960px' },
  { value: 'narrow', label: 'Narrow', px: '720px' },
] as const;

export function PagePanel({ page, palette, cmd, media, onError }: { page: EdPage | null; palette: string[]; cmd: Cmd; media: Media; onError: (e: unknown) => void }) {
  const [openKind, setOpenKind] = useState<string | null>(null);
  const iconRef = useRef<HTMLButtonElement>(null);
  const [picking, setPicking] = useState(false);
  if (!page)
    return (
      <div className="flex justify-center py-10 text-fg-3">
        <Throbber />
      </div>
    );
  const body = page.kinds.body ?? { declared: {}, computed: {} };
  const kindStyle = (kind: string | string[], props: Record<string, string | null>) => cmd('pageStyle', { kind, props, media });
  const bodyGet = (p: string) => body.declared[p] ?? body.computed[p] ?? '';
  const [maxW] = splitNum(body.computed['max-width']);
  const width = body.computed['max-width'] === 'none' || maxW === null ? 'full' : maxW >= 1100 ? 'wide' : maxW >= 880 ? 'medium' : 'narrow';
  const colours = page.vars.filter((v) => isColour(v.value));
  const others = page.vars.filter((v) => !isColour(v.value));
  const setFont = (kind: string | string[], v: string) => {
    const f = FONTS.find((x) => x.value === v);
    if (f?.google && !page.fonts.includes(f.value)) cmd('fonts', [...page.fonts, f.value]);
    kindStyle(kind, { 'font-family': f ? f.css : null });
  };
  const textFont = fontOf(body.declared['font-family'] ?? '');
  const headFont = fontOf(page.kinds.h1?.declared['font-family'] ?? '');
  const shownFont = FONTS.find((f) => f.value === fontOf(body.computed['font-family']))?.label;

  return (
    <div className="px-3 pb-4">
      {media && <p className="mb-2 rounded-xl bg-bg-1 px-2.5 py-2 text-[11.5px] leading-snug text-fg-3">{MEDIA_NOTE[media]}</p>}
      <Group id="pg-page" title="The page" start summary={page.title}>
        <Row label="Title" hint="Its name in a browser's tab and in bookmarks">
          <Typed value={page.title} onChange={(v) => cmd('meta', { title: v })} placeholder="No title" label="Title" />
        </Row>
        <Row label="Background" set={!!body.declared['background-color']} onReset={() => kindStyle('body', { 'background-color': null })}>
          <ColorField value={hexOf(bodyGet('background-color'))} palette={palette} onChange={(v) => kindStyle('body', { 'background-color': v ?? 'transparent' })} none />
        </Row>
        <Row
          label="Width"
          set={!!body.declared['max-width']}
          onReset={() => kindStyle('body', { 'max-width': null, 'margin-left': null, 'margin-right': null })}
          hint="How wide its content runs on a big screen, in the middle"
        >
          <Choice
            value={width}
            onChange={(v) => kindStyle('body', { 'max-width': WIDTHS.find((w) => w.value === v)!.px ?? 'none', 'margin-left': 'auto', 'margin-right': 'auto' })}
            options={WIDTHS.map((w) => ({ value: w.value, label: w.label, title: w.px ?? 'As wide as the screen' }))}
          />
        </Row>
        <Row label="Inside space" set={!!body.declared['padding-top']} onReset={() => kindStyle('body', { padding: null })} hint="The space between its edges and what is in it">
          <NumField value={bodyGet('padding-top')} onChange={(v) => kindStyle('body', { padding: v })} units={['px', 'em', '%']} min={0} scrub="↔" title="Space inside the page's edges" />
        </Row>
        <Row label="Language" hint="The language it is written in (en, el, zh…), for screen readers and spelling">
          <Typed value={page.lang} onChange={(v) => cmd('meta', { lang: v.trim() })} placeholder="en" label="Language" />
        </Row>
      </Group>

      <Group id="pg-cover" title="Icon and cover" start summary={[page.icon, page.cover ? (page.cover.kind === 'picture' ? 'A picture' : 'A gradient') : ''].filter(Boolean).join(' · ')}>
        <Row label="Icon" hint="An emoji above the page's first heading">
          <button ref={iconRef} type="button" onClick={() => setPicking((o) => !o)} className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-bg-1 px-2.5 text-left text-[12.5px] hover:bg-bg-2">
            {page.icon ? (
              <span translate="no" className="text-[18px] leading-none">
                {page.icon}
              </span>
            ) : (
              <Smile size={15} className="text-fg-3" />
            )}
            <span className="text-fg-2">{page.icon ? 'Change the icon' : 'Add an icon'}</span>
          </button>
          {page.icon && (
            <IconButton label="Remove the icon" size="sm" onClick={() => cmd('icon', null)}>
              <Trash2 size={14} />
            </IconButton>
          )}
          <SheetsOnPhone.Provider value>
            <Popover anchor={iconRef} open={picking} onClose={() => setPicking(false)} width={336} title="The page’s icon">
              <CharPicker
                kinds={['emoji']}
                onPick={(ch) => {
                  cmd('icon', ch);
                  setPicking(false);
                }}
              />
            </Popover>
          </SheetsOnPhone.Provider>
        </Row>
        <Row label="Cover" top hint="A band of colour or a picture across the page's top">
          <div className="min-w-0 flex-1 pt-1">
            <CoverChoices
              current={page.cover?.kind === 'gradient' ? page.cover.value : undefined}
              onPick={(c) => cmd('cover', c)}
              onRemove={page.cover ? () => cmd('cover', null) : undefined}
              onAi={() => void aiCover().then((src) => src && cmd('cover', { src }), onError)}
              onError={onError}
            />
          </div>
        </Row>
      </Group>

      <Group id="pg-colours" title="Colours" start={colours.length > 0} summary={colours.length ? `${colours.length}` : ''}>
        {colours.length ? (
          colours.map((v) => (
            <Row key={v.name} label={KIT_VARS[v.name] ?? v.name.slice(2)} hint={`${v.name}: everything in the page that uses this colour changes with it`}>
              <ColorField value={v.value} palette={palette} onChange={(x) => cmd('setVar', { name: v.name, value: x })} hex />
            </Row>
          ))
        ) : (
          <p className="text-[12px] leading-relaxed text-fg-3">This page names no colours of its own (CSS variables). Its colours change part by part, on the Part tab.</p>
        )}
        {others.slice(0, 12).map((v) => (
          <Row key={v.name} label={KIT_VARS[v.name] ?? v.name.slice(2)} hint={v.name}>
            <Typed value={v.value} onChange={(x) => cmd('setVar', { name: v.name, value: x || null })} label={v.name} />
          </Row>
        ))}
      </Group>

      <Group id="pg-fonts" title="Fonts" summary={shownFont}>
        <Row label="Text" set={!!body.declared['font-family']} onReset={() => kindStyle('body', { 'font-family': null })}>
          <Select
            value={textFont || (body.declared['font-family'] ? body.declared['font-family'] : '')}
            options={fontOptions(`As it is${shownFont ? ` (${shownFont})` : ''}`)}
            onChange={(v) => setFont('body', v)}
            title="The page's font"
          />
        </Row>
        <Row label="Headings" set={!!page.kinds.h1?.declared['font-family']} onReset={() => kindStyle(['h1', 'h2', 'h3'], { 'font-family': null })}>
          <Select value={headFont} options={fontOptions('As the text')} onChange={(v) => setFont(['h1', 'h2', 'h3'], v)} title="The headings' font" />
        </Row>
        {page.fonts.length > 0 && <p className="text-[11.5px] leading-snug text-fg-3">Loaded from Google Fonts: {page.fonts.join(', ')}</p>}
      </Group>

      <Group id="pg-text" title="Text styles" summary="Headings, links, buttons">
        <p className="pb-1 text-[11.5px] leading-snug text-fg-3">How each kind looks everywhere in the page. A part changed on its own keeps its change.</p>
        {KINDS.map(({ kind, label }) => {
          const k = page.kinds[kind];
          const open = openKind === kind;
          const set = !!k && Object.keys(k.declared).length > 0;
          return (
            <div key={kind} className="rounded-lg">
              <button
                type="button"
                onClick={() => setOpenKind(open ? null : kind)}
                aria-expanded={open}
                className={cx('flex h-8 w-full items-center gap-1.5 rounded-lg px-1 text-left text-[12.5px] hover:bg-bg-2', open && 'bg-bg-1')}
              >
                {open ? <ChevronDown size={12} className="text-fg-3" /> : <ChevronRight size={12} className="text-fg-3" />}
                <span className={cx(set ? 'font-medium text-accent' : 'text-fg-2')}>{label}</span>
                {!k?.computed['font-size'] && <span className="text-[11.5px] text-fg-3">· none in the page</span>}
                <span className="ml-auto text-[11.5px] text-fg-3 tabular-nums">{k?.computed['font-size']}</span>
              </button>
              {open && k && <KindFields kind={kind} k={k} palette={palette} onChange={(props) => kindStyle(kind, props)} />}
            </div>
          );
        })}
      </Group>

      <Group id="pg-css" title="Your CSS" summary={page.css ? `${page.css.split('\n').length} lines` : ''}>
        <p className="text-[11.5px] leading-snug text-fg-3">Rules of your own for the whole page, kept in it as they are.</p>
        <Typed value={page.css} onChange={(v) => cmd('customCss', v)} area mono max={20} placeholder={'.card { border-radius: 16px; }'} label="Your CSS" />
      </Group>
    </div>
  );
}

function KindFields({ kind, k, palette, onChange }: { kind: string; k: EdPage['kinds'][string]; palette: string[]; onChange: (props: Record<string, string | null>) => void }) {
  const get = (p: string) => k.declared[p] ?? k.computed[p] ?? '';
  const isSet = (p: string) => !!k.declared[p];
  const reset =
    (...ps: string[]) =>
    () =>
      onChange(Object.fromEntries(ps.map((p) => [p, null])));
  const button = kind.includes('n-btn');
  return (
    <div className="space-y-1 py-1.5 pl-2">
      <Row label="Size" set={isSet('font-size')} onReset={reset('font-size')}>
        <NumField value={get('font-size')} onChange={(v) => onChange({ 'font-size': v })} units={['px', 'em', 'rem']} min={0} scrub="A" title="Text size" />
        <Select value={k.computed['font-weight'] ?? '400'} options={WEIGHTS} onChange={(v) => onChange({ 'font-weight': v })} title="Weight" className="w-[118px] shrink-0" />
      </Row>
      <Row label="Spacing" set={isSet('line-height') || isSet('letter-spacing')} onReset={reset('line-height', 'letter-spacing')} hint="The height of its lines, and the space between its letters">
        <NumField
          value={get('line-height') === 'normal' ? '' : get('line-height')}
          onChange={(v) => onChange({ 'line-height': v })}
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
          onChange={(v) => onChange({ 'letter-spacing': v })}
          units={['px', 'em']}
          step={0.1}
          scrub="↔"
          placeholder="0"
          title="Letter spacing"
        />
      </Row>
      <Row label="Colour" set={isSet('color')} onReset={reset('color')}>
        <ColorField value={hexOf(get('color'))} palette={palette} onChange={(v) => onChange({ color: v })} />
      </Row>
      {button && (
        <>
          <Row label="Fill" set={isSet('background-color')} onReset={reset('background-color')}>
            <ColorField value={hexOf(get('background-color'))} palette={palette} onChange={(v) => onChange({ 'background-color': v ?? 'transparent' })} none />
          </Row>
          <Row label="Corners" set={isSet('border-top-left-radius')} onReset={reset('border-radius')}>
            <NumField value={get('border-top-left-radius')} onChange={(v) => onChange({ 'border-radius': v })} units={['px', '%']} min={0} scrub="◜" title="Rounded corners" />
          </Row>
        </>
      )}
      {!button && kind !== 'body' && (
        <Row label="Capitals" set={isSet('text-transform')} onReset={reset('text-transform')}>
          <Choice
            value={get('text-transform') === 'uppercase' ? 'upper' : 'as'}
            onChange={(v) => onChange({ 'text-transform': v === 'upper' ? 'uppercase' : 'none' })}
            options={[
              { value: 'as', label: 'As written' },
              { value: 'upper', label: 'ALL CAPS' },
            ]}
          />
        </Row>
      )}
    </div>
  );
}
