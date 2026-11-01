// The visual editor's inspector: the part picked in the page (its place among the parts around it), its
// words, address or picture, and its look: text, fill, corners, spacing, width. With nothing picked, the
// page's own look. A change goes to the editor in the page's frame at once.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AlignCenter, AlignLeft, AlignRight, ChevronDown, ChevronRight, ImageUp, MousePointerClick } from 'lucide-react';
import { cx, inputCls, Segmented, Switch } from '../../../components/ui';
import type { EdSel } from '../frame';

type Cmd = (cmd: string, arg?: unknown) => void;

/** "rgb(29, 27, 23)" as "#1d1b17"; transparent as null. */
export function hexOf(c: string | undefined): string | null {
  const m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+%?))?\s*\)/.exec(c ?? '');
  if (!m) return /^#[0-9a-f]{3,8}$/i.test(c ?? '') ? c! : null;
  const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
  if (a === 0) return null;
  return `#${[m[1], m[2], m[3]].map((x) => Number(x).toString(16).padStart(2, '0')).join('')}`;
}
const px = (v: string | undefined) => (v && /px$/.test(v) ? Math.round(parseFloat(v)) : 0);

function Row({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="flex min-h-8 items-center gap-2" title={hint}>
      <span className="w-[76px] shrink-0 text-[12px] text-fg-3">{label}</span>
      <div className="flex min-w-0 flex-1 items-center gap-1.5">{children}</div>
    </div>
  );
}

function Group({ title, children, open: start = true }: { title: string; children: ReactNode; open?: boolean }) {
  const [open, setOpen] = useState(start);
  return (
    <section className="border-t border-line py-2 first:border-t-0">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex h-7 w-full items-center gap-1 text-left text-[12px] font-semibold text-fg-2">
        {open ? <ChevronDown size={13} className="text-fg-3" /> : <ChevronRight size={13} className="text-fg-3" />}
        {title}
      </button>
      {open && <div className="space-y-1 pt-1">{children}</div>}
    </section>
  );
}

const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
/** Colours far enough apart to tell from each other, at most `n`. */
function distinct(list: string[], n: number): string[] {
  const out: string[] = [];
  for (const c of list) {
    if (c.length !== 7) continue;
    const [r, g, b] = rgb(c);
    if (out.some((o) => {
      const [r2, g2, b2] = rgb(o);
      return Math.abs(r - r2) + Math.abs(g - g2) + Math.abs(b - b2) < 36;
    }))
      continue;
    out.push(c);
    if (out.length >= n) break;
  }
  return out;
}

/** Swatches of the page's own colours, a picker for any other, and none. */
function ColorField({ value, palette, onChange, none }: { value: string | null; palette: string[]; onChange: (v: string | null) => void; none?: boolean }) {
  const list = distinct(palette.map(hexOf).filter((x): x is string => !!x), none ? 5 : 6);
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1">
      {none && (
        <button
          type="button"
          title="None"
          onClick={() => onChange(null)}
          className={cx('relative h-5.5 w-5.5 overflow-hidden rounded-full border border-line-2 bg-white', value === null && 'ring-2 ring-accent ring-offset-1 ring-offset-panel')}
        >
          <span className="absolute top-1/2 left-1/2 h-px w-7 -translate-x-1/2 -translate-y-1/2 -rotate-45 bg-err" />
        </button>
      )}
      {list.map((c) => (
        <button
          key={c}
          type="button"
          title={c}
          onClick={() => onChange(c)}
          style={{ background: c }}
          className={cx('h-5.5 w-5.5 rounded-full border border-line-2', value?.toLowerCase() === c && 'ring-2 ring-accent ring-offset-1 ring-offset-panel')}
        />
      ))}
      <label title="Another colour" className="relative h-5.5 w-5.5 cursor-pointer overflow-hidden rounded-full border border-line-2 bg-[conic-gradient(#f44,#fd4,#4d4,#4df,#44f,#f4f,#f44)]">
        <input type="color" value={value ?? '#ffffff'} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
      </label>
    </div>
  );
}

/** A slider with its number beside it, in pixels. */
function Size({ value, max, onChange, step = 1 }: { value: number; max: number; onChange: (v: number) => void; step?: number }) {
  return (
    <>
      <input type="range" min={0} max={max} step={step} value={Math.min(value, max)} onChange={(e) => onChange(Number(e.target.value))} className="min-w-0 flex-1 accent-[var(--accent)]" />
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
        className="h-7 w-14 shrink-0 rounded-md border border-line bg-bg-1 px-1.5 text-right text-[12px] tabular-nums outline-none focus:border-accent/60"
      />
    </>
  );
}

/** A field that sends what was typed when it settles (as you type, a moment later). */
function Typed({ value, onChange, placeholder, area }: { value: string; onChange: (v: string) => void; placeholder?: string; area?: boolean }) {
  const [v, setV] = useState(value);
  const t = useRef(0);
  const last = useRef(value);
  useEffect(() => {
    if (value !== last.current) {
      setV(value);
      last.current = value;
    }
  }, [value]);
  const change = (x: string) => {
    setV(x);
    window.clearTimeout(t.current);
    t.current = window.setTimeout(() => {
      last.current = x;
      onChange(x);
    }, 450);
  };
  const cls = cx(inputCls, 'h-8 w-full text-[12.5px]');
  return area ? (
    <textarea value={v} onChange={(e) => change(e.target.value)} placeholder={placeholder} rows={3} className={cx(inputCls, 'w-full resize-y py-1.5 text-[12.5px]')} />
  ) : (
    <input value={v} onChange={(e) => change(e.target.value)} placeholder={placeholder} className={cls} spellCheck={false} />
  );
}

/** A picture from this device, made small enough to live in the page (at most 1600 pixels wide). */
async function pictureData(f: File): Promise<string> {
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

const FONTS: { value: string; label: string; css: string }[] = [
  { value: 'system', label: 'System', css: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
  { value: 'serif', label: 'Serif', css: 'Georgia, "Times New Roman", serif' },
  { value: 'round', label: 'Rounded', css: 'ui-rounded, "SF Pro Rounded", "Nunito", system-ui, sans-serif' },
  { value: 'mono', label: 'Mono', css: 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace' },
];
const fontOf = (css: string) => FONTS.find((f) => css.includes(f.css.split(',')[0].replace(/"/g, '')))?.value ?? (/serif/i.test(css) && !/sans/i.test(css) ? 'serif' : /mono/i.test(css) ? 'mono' : 'system');

const TURN: { value: string; label: string }[] = [
  { value: 'h1', label: 'H1' },
  { value: 'h2', label: 'H2' },
  { value: 'h3', label: 'H3' },
  { value: 'p', label: 'Text' },
];

export function Inspector({ sel, palette, cmd, onError, className }: { sel: EdSel | null; palette: string[]; cmd: Cmd; onError: (e: unknown) => void; className?: string }) {
  const style = (props: Record<string, string | null>) => cmd('style', props);
  const fileRef = useRef<HTMLInputElement>(null);
  const page = !sel || sel.tag === 'body';
  const c = sel?.computed ?? {};
  const a = sel?.attrs ?? {};

  if (page) {
    return (
      <div className={cx('min-h-0 overflow-y-auto px-3 pb-3', className)}>
        <div className="flex items-start gap-2 rounded-xl bg-bg-1 px-3 py-2.5 text-[12.5px] leading-relaxed text-fg-2">
          <MousePointerClick size={15} className="mt-0.5 shrink-0 text-accent" />
          <span>Click a part of the page to change it, and click it again to change its words. Drag it by its handle to move it.</span>
        </div>
        {sel && (
          <Group title="The page">
            <Row label="Background">
              <ColorField value={hexOf(c['background-color'])} palette={palette} onChange={(v) => style({ 'background-color': v, background: null })} none />
            </Row>
            <Row label="Text colour">
              <ColorField value={hexOf(c.color)} palette={palette} onChange={(v) => style({ color: v })} />
            </Row>
            <Row label="Font">
              <Segmented size="sm" value={fontOf(c['font-family'] ?? '')} onChange={(v) => style({ 'font-family': FONTS.find((f) => f.value === v)!.css })} options={FONTS.map((f) => ({ value: f.value, label: f.label }))} />
            </Row>
            <Row label="Width">
              <Segmented
                size="sm"
                value={c['max-width'] === 'none' || !c['max-width'] ? 'full' : px(c['max-width']) <= 700 ? 'narrow' : 'medium'}
                onChange={(v) => style(v === 'full' ? { 'max-width': null, margin: null } : { 'max-width': v === 'narrow' ? '680px' : '960px', 'margin-left': 'auto', 'margin-right': 'auto' })}
                options={[
                  { value: 'narrow', label: 'Narrow' },
                  { value: 'medium', label: 'Medium' },
                  { value: 'full', label: 'Full' },
                ]}
              />
            </Row>
            <Row label="Text size">
              <Size value={px(c['font-size'])} max={28} onChange={(v) => style({ 'font-size': `${v}px` })} />
            </Row>
          </Group>
        )}
      </div>
    );
  }

  const isImg = sel.tag === 'img';
  const isLink = sel.tag === 'a';
  const isField = sel.tag === 'input' || sel.tag === 'textarea';
  const textual = sel.wordy || sel.children > 0;
  return (
    <div className={cx('min-h-0 overflow-y-auto px-3 pb-3', className)}>
      {(sel.words !== undefined || isLink || isImg || isField || /^(h[1-4]|p)$/.test(sel.tag)) && (
        <Group title="Content">
          {sel.words !== undefined && (
            <Row label="Words">
              <Typed value={sel.words} onChange={(v) => cmd('words', v)} area={sel.words.length > 40 || sel.words.includes('\n')} />
            </Row>
          )}
          {/^(h[1-4]|p)$/.test(sel.tag) && (
            <Row label="Kind">
              <Segmented size="sm" value={sel.tag} onChange={(v) => cmd('retag', v)} options={TURN} />
            </Row>
          )}
          {isLink && (
            <>
              <Row label="Goes to">
                <Typed value={a.href ?? ''} onChange={(v) => cmd('attr', { name: 'href', value: v || null })} placeholder="https://…" />
              </Row>
              <Row label="New tab">
                <Switch label="Opens in a new tab" on={a.target === '_blank'} onChange={(on) => cmd('attr', { name: 'target', value: on ? '_blank' : null })} />
              </Row>
            </>
          )}
          {isImg && (
            <>
              <Row label="Picture">
                <Typed value={a.src?.startsWith('data:') ? '' : (a.src ?? '')} onChange={(v) => v && cmd('attr', { name: 'src', value: v })} placeholder={a.src?.startsWith('data:') ? 'In the page' : 'https://…'} />
                <button type="button" title="A picture from this device" onClick={() => fileRef.current?.click()} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-line text-fg-2 hover:bg-bg-2">
                  <ImageUp size={14} />
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (f) pictureData(f).then((src) => cmd('attr', { name: 'src', value: src }), onError);
                  }}
                />
              </Row>
              <Row label="Description" hint="Read out by screen readers, and shown when the picture can't load">
                <Typed value={a.alt ?? ''} onChange={(v) => cmd('attr', { name: 'alt', value: v })} placeholder="What it shows" />
              </Row>
            </>
          )}
          {isField && (
            <Row label="Placeholder">
              <Typed value={a.placeholder ?? ''} onChange={(v) => cmd('attr', { name: 'placeholder', value: v || null })} />
            </Row>
          )}
        </Group>
      )}
      {textual && (
        <Group title="Text">
          <Row label="Size">
            <Size value={px(c['font-size'])} max={72} onChange={(v) => style({ 'font-size': `${v}px` })} />
          </Row>
          <Row label="Weight">
            <Segmented
              size="sm"
              value={Number(c['font-weight']) >= 600 ? 'bold' : 'regular'}
              onChange={(v) => style({ 'font-weight': v === 'bold' ? '700' : '400' })}
              options={[
                { value: 'regular', label: 'Regular' },
                { value: 'bold', label: 'Bold' },
              ]}
            />
          </Row>
          <Row label="Align">
            <Segmented
              size="sm"
              value={c['text-align'] === 'center' ? 'center' : c['text-align'] === 'right' || c['text-align'] === 'end' ? 'right' : 'left'}
              onChange={(v) => style({ 'text-align': v })}
              options={[
                { value: 'left', label: <AlignLeft size={14} aria-label="Left" /> },
                { value: 'center', label: <AlignCenter size={14} aria-label="Centre" /> },
                { value: 'right', label: <AlignRight size={14} aria-label="Right" /> },
              ]}
            />
          </Row>
          <Row label="Colour">
            <ColorField value={hexOf(c.color)} palette={palette} onChange={(v) => style({ color: v })} />
          </Row>
        </Group>
      )}
      <Group title="Block">
        <Row label="Fill">
          <ColorField value={hexOf(c['background-color'])} palette={palette} onChange={(v) => style({ 'background-color': v, background: null })} none />
        </Row>
        <Row label="Corners">
          <Size value={px(c['border-top-left-radius'])} max={40} onChange={(v) => style({ 'border-radius': `${v}px` })} />
        </Row>
        <Row label="Inside space">
          <Size value={px(c['padding-top'])} max={64} onChange={(v) => style({ padding: `${v}px` })} />
        </Row>
        <Row label="Space below">
          <Size value={px(c['margin-bottom'])} max={80} onChange={(v) => style({ 'margin-bottom': `${v}px` })} />
        </Row>
        <Row label="Border">
          <Segmented
            size="sm"
            value={c['border-top-style'] && c['border-top-style'] !== 'none' && px(c['border-top-width']) > 0 ? 'line' : 'none'}
            onChange={(v) => style(v === 'line' ? { border: ['1px', 'solid', `${hexOf(c.color) ?? '#d6d0c4'}33`].join(' ') } : { border: null })}
            options={[
              { value: 'none', label: 'None' },
              { value: 'line', label: 'Thin line' },
            ]}
          />
        </Row>
        <Row label="Width">
          <Segmented
            size="sm"
            value={sel.inline.width === '100%' ? 'full' : sel.inline['max-width'] ? 'narrow' : 'auto'}
            onChange={(v) => style(v === 'full' ? { width: '100%', 'max-width': null } : v === 'narrow' ? { width: null, 'max-width': isImg ? '50%' : '520px' } : { width: null, 'max-width': null })}
            options={[
              { value: 'auto', label: 'As it is' },
              { value: 'narrow', label: 'Narrower' },
              { value: 'full', label: 'Full' },
            ]}
          />
        </Row>
      </Group>
      <More sel={sel} cmd={cmd} />
    </div>
  );
}

/** Less often: how its parts sit side by side, its class and id, and its style as CSS. */
function More({ sel, cmd }: { sel: EdSel; cmd: Cmd }) {
  const c = sel.computed;
  const flex = c.display?.includes('flex');
  const grid = c.display?.includes('grid');
  const css = Object.entries(sel.inline)
    .map(([k, v]) => `${k}: ${v};`)
    .join(' ');
  return (
    <Group title="More" open={false}>
      {sel.children > 1 && (
        <>
          <Row label="Parts">
            <Segmented
              size="sm"
              value={flex && c['flex-direction'] === 'row' ? 'row' : grid ? 'grid' : 'stack'}
              onChange={(v) =>
                cmd('style', v === 'row' ? { display: 'flex', 'flex-direction': 'row', 'flex-wrap': 'wrap', 'align-items': 'center', 'grid-template-columns': null } : v === 'grid' ? { display: 'grid', 'grid-template-columns': 'repeat(auto-fit, minmax(200px, 1fr))', 'flex-direction': null } : { display: null, 'flex-direction': null, 'grid-template-columns': null, 'flex-wrap': null, 'align-items': null })
              }
              options={[
                { value: 'stack', label: 'Stacked' },
                { value: 'row', label: 'In a row' },
                { value: 'grid', label: 'Grid' },
              ]}
            />
          </Row>
          {(flex || grid) && (
            <Row label="Gap">
              <Size value={px(c.gap?.split(' ')[0])} max={64} onChange={(v) => cmd('style', { gap: `${v}px` })} />
            </Row>
          )}
        </>
      )}
      <Row label="Class">
        <Typed value={sel.attrs.class ?? ''} onChange={(v) => cmd('attr', { name: 'class', value: v.trim() || null })} />
      </Row>
      <Row label="Name (id)">
        <Typed value={sel.attrs.id ?? ''} onChange={(v) => cmd('attr', { name: 'id', value: v.trim() || null })} />
      </Row>
      <div className="space-y-1 pt-1">
        <span className="text-[12px] text-fg-3">Its own style (CSS)</span>
        <Typed value={css} onChange={(v) => cmd('css', v)} area placeholder="color: #333; padding: 12px;" />
      </div>
    </Group>
  );
}
