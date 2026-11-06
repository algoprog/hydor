// Paragraph styles a document changes (Format → Paragraph styles → Change the styles), as Word's Modify Style and
// Google Docs' Update to match: the look of Normal text, the title, subtitle, headings, quotes, code and callouts (font,
// size, colour, bold, italic, line spacing, space before and after, alignment), seen on every paragraph of the style at
// once; a style back to the app's look, or all of them. Kept in the document and its Word file (its styles).
import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { FONTS, isAtom, PARA_STYLES, STYLES, styleOf, TEXT_COLORS, type Doc, type ParaStyle, type StyleLook } from '@shared/docs';
import { Button, cx, Dialog, Segmented, Switch } from '../../../components/ui';
import { NumInput } from '../slides/controls';
import { Select } from '../studio/fields';
import * as ops from './ops';
import type { DocEngine } from './engine';

/** The document with a style's own look changed (none: the app's again). */
export function withStyle(d: Doc, k: ParaStyle, look: StyleLook | null): Doc {
  const styles = { ...(d.styles ?? {}) };
  const clean = look ? (Object.fromEntries(Object.entries(look).filter(([, v]) => v !== undefined)) as StyleLook) : null;
  if (clean && Object.keys(clean).length) styles[k] = clean;
  else delete styles[k];
  const { styles: _s, ...rest } = d;
  return Object.keys(styles).length ? { ...rest, styles } : rest;
}

/**
 * Update "Heading 1" to match: the look of the paragraph at the caret (its words' font, size, colour, weight and slant,
 * where all of them have it; its spacing and alignment) becomes its style's, and that paragraph keeps none of it as its own.
 */
export function matchStyle(e: DocEngine): string | null {
  const [s] = e.range();
  const b = ops.blockOf(e.doc, s.b);
  if (!b || b.type !== 'p' || s.c) return null;
  const k: ParaStyle = b.style ?? 'normal';
  const len = ops.lenOf(b.runs);
  const look = len ? ops.commonLook(e.doc, { b: b.id, o: 0 }, { b: b.id, o: len }) : {};
  const st: StyleLook = { ...(e.doc.styles?.[k] ?? {}) };
  let d = e.doc;
  if (k === 'normal') {
    // Normal text's font and size are the document's own.
    if (look.font) d = { ...d, font: look.font };
    if (look.size) d = { ...d, size: look.size };
  } else {
    if (look.font) st.font = look.font;
    if (look.size) st.size = look.size;
  }
  if (look.color) st.color = look.color;
  if (look.b) st.b = true;
  if (look.i) st.i = true;
  if (b.lh !== undefined) st.lh = b.lh;
  if (b.sb !== undefined) st.sb = b.sb;
  if (b.sa !== undefined) st.sa = b.sa;
  if (b.align) st.align = b.align;
  d = withStyle(d, k, st);
  // The paragraph's own look is its style's now.
  d = ops.patchBlock(d, b.id, (x) => {
    if (x.type !== 'p') return x;
    const { lh: _l, sb: _b, sa: _a, align: _al, ...rest } = x;
    const runs = x.runs.map((r) => {
      if (isAtom(r)) return r;
      const y = { ...r };
      delete y.font;
      delete y.size;
      delete y.color;
      if (look.b) delete y.b;
      if (look.i) delete y.i;
      return y;
    });
    return { ...rest, runs };
  });
  e.change(d);
  return STYLES[k].label;
}

export function StylesDialog({ open, onClose, engine, doc }: { open: boolean; onClose: () => void; engine: DocEngine | null; doc: Doc }) {
  const [k, setK] = useState<ParaStyle>('h1');
  const look = doc.styles?.[k] ?? {};
  const shown = styleOf(doc, k);
  const set = (patch: Partial<StyleLook>) => engine?.change(withStyle(engine.doc, k, { ...look, ...patch }), `style:${k}`);
  const size = Math.round(doc.size * shown.k * 2) / 2;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Paragraph styles"
      width={620}
      footer={
        <>
          <Button variant="ghost" icon={<RotateCcw size={14} />} disabled={!doc.styles} onClick={() => engine && engine.change((({ styles: _s, ...rest }) => rest)(engine.doc))}>
            Reset the styles
          </Button>
          <span className="flex-1" />
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      <div className="flex gap-4">
        <div className="w-[150px] shrink-0 space-y-0.5">
          {PARA_STYLES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setK(s)}
              className={cx('flex h-8 w-full items-center justify-between rounded-lg px-2.5 text-left text-[13px]', s === k ? 'bg-bg-2 font-medium text-fg' : 'text-fg-2 hover:bg-bg-2')}
            >
              {STYLES[s].label}
              {doc.styles?.[s] && <span className="h-1.5 w-1.5 rounded-full bg-accent" title="Changed in this document" />}
            </button>
          ))}
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <div translate="no" className="truncate rounded-xl border border-line bg-white px-3 py-2" style={{ fontFamily: FONTS.find((f) => f.name === (shown.font ?? (k === 'normal' ? doc.font : doc.font)))?.css, fontSize: Math.min(28, size * 1.333), color: shown.color, fontWeight: shown.bold ? 700 : 400, fontStyle: shown.italic ? 'italic' : 'normal', textAlign: shown.align ?? 'left' }}>
            {STYLES[k].label}
          </div>
          <div className="flex gap-2">
            <label className="min-w-0 flex-1 space-y-1">
              <span className="text-[12px] text-fg-3">Font</span>
              {k === 'normal' ? (
                <Select value={doc.font} title="Font" onChange={(v) => engine?.setDoc({ font: v })} options={FONTS.map((f) => ({ value: f.name, label: f.name, style: { fontFamily: f.css } }))} />
              ) : (
                <Select value={look.font ?? ''} title="Font" onChange={(v) => set({ font: v || undefined })} options={[{ value: '', label: `${k === 'code' ? 'JetBrains Mono' : doc.font} (as the document)` }, ...FONTS.map((f) => ({ value: f.name, label: f.name, style: { fontFamily: f.css } }))]} />
              )}
            </label>
            <label className="w-[110px] shrink-0 space-y-1">
              <span className="text-[12px] text-fg-3">Size</span>
              <NumInput value={size} onChange={(v) => (k === 'normal' ? engine?.setDoc({ size: v }) : set({ size: v }))} min={4} max={200} step={0.5} unit="pt" label="Size" className="w-full" />
            </label>
          </div>
          <div className="space-y-1">
            <span className="text-[12px] text-fg-3">Colour</span>
            <div className="flex flex-wrap items-center gap-1.5">
              <button type="button" onClick={() => set({ color: undefined })} className={cx('h-6 rounded-full border border-line-2 px-2 text-[11.5px] text-fg-2', !look.color && 'ring-2 ring-accent')}>
                As the app has it
              </button>
              {TEXT_COLORS.map((c) => (
                <button key={c} type="button" title={c} aria-label={c} onClick={() => set({ color: c })} style={{ background: c }} className={cx('h-6 w-6 rounded-full border border-black/10', look.color === c && 'ring-2 ring-accent ring-offset-1 ring-offset-elevated')} />
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-[13px] text-fg">
              <Switch on={!!shown.bold} onChange={(on) => set({ b: on })} label="Bold" />
              Bold
            </label>
            <label className="flex items-center gap-2 text-[13px] text-fg">
              <Switch on={!!shown.italic} onChange={(on) => set({ i: on })} label="Italic" />
              Italic
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="space-y-1">
              <span className="text-[12px] text-fg-3">Line spacing</span>
              <NumInput value={look.lh ?? Math.round((shown.lh / 1.15) * 100) / 100} onChange={(v) => set({ lh: v })} min={0.5} max={5} step={0.05} unit="lines" label="Line spacing" className="w-[110px]" />
            </label>
            <label className="space-y-1">
              <span className="text-[12px] text-fg-3">Space before</span>
              <NumInput value={look.sb ?? Math.round(shown.before * size * 2) / 2} onChange={(v) => set({ sb: v })} min={0} max={200} step={1} unit="pt" label="Space before" className="w-[100px]" />
            </label>
            <label className="space-y-1">
              <span className="text-[12px] text-fg-3">Space after</span>
              <NumInput value={look.sa ?? Math.round(shown.after * size * 2) / 2} onChange={(v) => set({ sa: v })} min={0} max={200} step={1} unit="pt" label="Space after" className="w-[100px]" />
            </label>
          </div>
          <div className="space-y-1">
            <span className="text-[12px] text-fg-3">Alignment</span>
            <Segmented
              size="sm"
              value={look.align ?? 'left'}
              onChange={(v) => set({ align: v === 'left' ? undefined : (v as StyleLook['align']) })}
              options={[
                { value: 'left', label: 'Left' },
                { value: 'center', label: 'Centre' },
                { value: 'right', label: 'Right' },
                { value: 'justify', label: 'Justify' },
              ]}
            />
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-line pt-2.5">
            <p className="text-[11.5px] leading-relaxed text-fg-3">Every paragraph of this style changes at once, here and in the Word file and PDF.</p>
            <Button size="sm" variant="ghost" icon={<RotateCcw size={14} />} disabled={!doc.styles?.[k]} onClick={() => engine?.change(withStyle(engine.doc, k, null))}>
              Reset this style
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
