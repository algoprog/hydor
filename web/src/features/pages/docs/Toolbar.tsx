// The documents editor's toolbar, the most used of what the menus hold, in one row that fits a laptop's screen
// (sideways on a phone): undo and redo; the paragraph's style; the words' font and size; bold, italic, underline;
// their colour and highlight; a link (Ctrl+K); a comment on the words picked (Ctrl+Alt+M); the format painter (a
// click carries the look of the words at the caret to the next words picked, a double click keeps it on until Esc);
// alignment, in a menu; bullets, numbers and a checklist; the table's rows and columns when the caret is in one; and at
// its end Editing or Suggesting (Ctrl+Alt+Shift+X), named while suggesting. It acts on what is selected in the
// document, which keeps its selection meanwhile.
import { useRef, useState, type ReactNode, type RefObject } from 'react';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Baseline,
  Bold,
  ChevronDown,
  FilePenLine,
  PencilLine,
  Highlighter,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  MessageSquarePlus,
  PaintRoller,
  Redo2,
  Table2,
  Trash2,
  Underline,
  Undo2,
} from 'lucide-react';
import { FONTS, HL_COLORS, PARA_STYLES, STYLES, TEXT_COLORS, type Doc } from '@shared/docs';
import { Button, cx, inputCls, MenuItem, MenuSep, Popover } from '../../../components/ui';
import { NumInput, Tool } from '../slides/controls';
import { Select } from '../studio/fields';
import type { DocEngine, SelState } from './engine';

const Sep = () => <span className="mx-1 h-5 w-px shrink-0 bg-line" />;

const ALIGNS = [
  { value: 'left', label: 'Align left', keys: 'Ctrl+Shift+L', icon: AlignLeft },
  { value: 'center', label: 'Centre', keys: 'Ctrl+Shift+E', icon: AlignCenter },
  { value: 'right', label: 'Align right', keys: 'Ctrl+Shift+R', icon: AlignRight },
  { value: 'justify', label: 'Justify', keys: 'Ctrl+Shift+J', icon: AlignJustify },
] as const;

/** A colour from a few, any other, or none ("Automatic" for words, "None" for a highlight). */
function ColorPick({ label, icon, value, colors, none, onPick, onClosed }: { label: string; icon: ReactNode; value: string | undefined; colors: string[]; none: string; onPick: (c: string | undefined) => void; onClosed?: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={ref}
        type="button"
        title={label}
        aria-label={label}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((o) => !o)}
        className={cx('flex h-8 w-9 shrink-0 flex-col items-center justify-center gap-[3px] rounded-lg text-fg-2 transition-colors hover:bg-bg-2 hover:text-fg', open && 'bg-bg-2')}
      >
        {icon}
        <span className="h-[3px] w-4 rounded-full border border-line-2" style={{ background: value ?? 'transparent' }} />
      </button>
      <Popover anchor={ref} open={open} onClose={() => (setOpen(false), onClosed?.())} width={212} title={label}>
        <div className="p-2" onMouseDown={(e) => e.target instanceof HTMLInputElement || e.preventDefault()}>
          <button
            type="button"
            onClick={() => (onPick(undefined), setOpen(false))}
            className={cx('mb-2 flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-[13px] hover:bg-bg-2', !value && 'bg-bg-2')}
          >
            <span className="relative h-5 w-5 overflow-hidden rounded-full border border-line-2 bg-white">
              <span className="absolute top-1/2 left-1/2 h-px w-7 -translate-x-1/2 -translate-y-1/2 -rotate-45 bg-err" />
            </span>
            {none}
          </button>
          <div className="grid grid-cols-6 gap-1.5">
            {colors.map((c) => (
              <button
                key={c}
                type="button"
                title={c}
                aria-label={c}
                onClick={() => (onPick(c), setOpen(false))}
                style={{ background: c }}
                className={cx('h-6 w-6 rounded-full border border-black/10', value === c && 'ring-2 ring-accent ring-offset-1 ring-offset-elevated')}
              />
            ))}
          </div>
          <label className="mt-2 flex h-8 cursor-pointer items-center gap-2 rounded-lg px-2 text-[13px] text-fg-2 hover:bg-bg-2">
            <span className="relative h-5 w-5 overflow-hidden rounded-full border border-line-2 bg-[conic-gradient(#f44,#fd4,#4d4,#4df,#44f,#f4f,#f44)]">
              <input type="color" value={value ?? '#000000'} onChange={(e) => onPick(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
            </span>
            Another colour
          </label>
        </div>
      </Popover>
    </>
  );
}

export function Toolbar({
  engine,
  st,
  doc,
  linking,
  setLinking,
  linkRef,
  onComment,
  slim,
  suggesting,
  onSuggesting,
}: {
  engine: DocEngine;
  st: SelState;
  doc: Doc;
  linking: { url: string; text: string } | null;
  setLinking: (l: { url: string; text: string } | null) => void;
  linkRef: RefObject<HTMLButtonElement | null>;
  onComment: () => void;
  /** Beside the menus where room is short: undo, redo and comment are left to the menus (and their keys). */
  slim?: boolean;
  /** Edits are suggestions (Suggesting), and the switch between that and Editing. */
  suggesting?: boolean;
  onSuggesting?: (on: boolean) => void;
}) {
  const [menu, setMenu] = useState<'table' | 'align' | null>(null);
  const tableRef = useRef<HTMLButtonElement>(null);
  const alignRef = useRef<HTMLButtonElement>(null);
  // A double click on the painter keeps it on: the first click's start is undone by the second.
  const clicks = useRef(0);
  const AlignIcon = ALIGNS.find((a) => a.value === st.align)?.icon ?? AlignLeft;
  const act = (f: () => void) => () => (setMenu(null), f());
  const shownSize = st.look.size ?? Math.round(doc.size * STYLES[st.style].k * 2) / 2;
  const t = st.block?.type === 'table' ? st.block : null;
  const openLink = () => setLinking({ url: st.link ?? '', text: '' });
  return (
    <div className="flex shrink-0 items-center gap-0.5" data-keeps-editing>
      {!slim && (
        <>
          <Tool label="Undo (Ctrl+Z)" disabled={!st.canUndo} onClick={() => engine.undo()}>
            <Undo2 size={15} />
          </Tool>
          <Tool label="Redo (Ctrl+Shift+Z)" disabled={!st.canRedo} onClick={() => engine.redo()}>
            <Redo2 size={15} />
          </Tool>
          <Sep />
        </>
      )}
      <Select
        value={st.style}
        title="Paragraph style"
        onChange={(v) => engine.style(v as typeof st.style)}
        options={PARA_STYLES.map((s) => ({ value: s, label: STYLES[s].label }))}
        className="w-[112px] shrink-0"
      />
      <Select
        value={st.look.font ?? ''}
        title="Font"
        onChange={(v) => engine.value('font', v || undefined)}
        options={[{ value: '', label: doc.font }, ...FONTS.filter((f) => f.name !== doc.font).map((f) => ({ value: f.name, label: f.name, style: { fontFamily: f.css } }))]}
        className="ml-1 w-[112px] shrink-0"
      />
      <NumInput value={shownSize} onChange={(v) => engine.value('size', v)} min={1} max={400} step={1} label="Size" buttons className="ml-1 w-[88px] shrink-0" />
      <Sep />
      <Tool label="Bold (Ctrl+B)" on={st.on.b} onClick={() => engine.toggle('b')}>
        <Bold size={15} />
      </Tool>
      <Tool label="Italic (Ctrl+I)" on={st.on.i} onClick={() => engine.toggle('i')}>
        <Italic size={15} />
      </Tool>
      <Tool label="Underline (Ctrl+U)" on={st.on.u} onClick={() => engine.toggle('u')}>
        <Underline size={15} />
      </Tool>
      <ColorPick label="Text colour" icon={<Baseline size={14} />} value={st.look.color} colors={TEXT_COLORS} none="Automatic" onPick={(c) => engine.value('color', c)} onClosed={() => engine.refocusSoon()} />
      <ColorPick label="Highlight" icon={<Highlighter size={14} />} value={st.look.hl} colors={HL_COLORS} none="None" onPick={(c) => engine.value('hl', c)} onClosed={() => engine.refocusSoon()} />
      <button
        ref={linkRef}
        type="button"
        title="Link (Ctrl+K)"
        aria-label="Link (Ctrl+K)"
        aria-pressed={!!st.link}
        onMouseDown={(e) => e.preventDefault()}
        onClick={openLink}
        className={cx('flex h-8 min-w-8 shrink-0 items-center justify-center rounded-lg px-1.5 text-fg-2 transition-colors hover:bg-bg-2 hover:text-fg', st.link && 'bg-accent-soft text-accent')}
      >
        <Link2 size={15} />
      </button>
      {!slim && (
        <Tool label="Comment (Ctrl+Alt+M)" disabled={st.collapsed || !st.text.trim()} onClick={onComment}>
          <MessageSquarePlus size={15} />
        </Tool>
      )}
      <button
        type="button"
        title="Format painter (a double click keeps it on until Esc)"
        aria-label="Format painter"
        aria-pressed={!!engine.paint}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          clicks.current++;
          const n = clicks.current;
          setTimeout(() => n === clicks.current && (clicks.current = 0), 350);
          if (n === 2) return engine.startPaint(true);
          if (engine.paint) engine.stopPaint();
          else engine.startPaint(false);
        }}
        className={cx('flex h-8 min-w-8 shrink-0 items-center justify-center rounded-lg px-1.5 text-fg-2 transition-colors hover:bg-bg-2 hover:text-fg', engine.paint && 'bg-accent-soft text-accent')}
      >
        <PaintRoller size={15} />
      </button>
      <Sep />
      <button
        ref={alignRef}
        type="button"
        title="Alignment"
        aria-label="Alignment"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setMenu(menu === 'align' ? null : 'align')}
        className={cx('flex h-8 shrink-0 items-center gap-0.5 rounded-lg px-1.5 text-fg-2 transition-colors hover:bg-bg-2 hover:text-fg', menu === 'align' && 'bg-bg-2')}
      >
        <AlignIcon size={15} />
        <ChevronDown size={12} className="text-fg-3" />
      </button>
      <Sep />
      <Tool label="Bullets (Ctrl+Shift+8)" on={st.list === 'bullet'} onClick={() => engine.list('bullet')}>
        <List size={15} />
      </Tool>
      <Tool label="Numbers (Ctrl+Shift+7)" on={st.list === 'number'} onClick={() => engine.list('number')}>
        <ListOrdered size={15} />
      </Tool>
      <Tool label="Checklist (Ctrl+Shift+9)" on={st.list === 'check'} onClick={() => engine.list('check')}>
        <ListChecks size={15} />
      </Tool>
      {t && <Sep />}
      {t && (
        <Button ref={tableRef} size="sm" variant="ghost" icon={<Table2 size={14} />} onMouseDown={(e) => e.preventDefault()} onClick={() => setMenu(menu === 'table' ? null : 'table')} className={cx('shrink-0 px-2', menu === 'table' && 'bg-bg-2')}>
          Table
          <ChevronDown size={12} className="-ml-0.5 text-fg-3" />
        </Button>
      )}
      {onSuggesting && (
        <>
          <Sep />
          <button
            type="button"
            title={suggesting ? 'Suggesting: your changes are suggestions (Ctrl+Alt+Shift+X to edit)' : 'Editing (Ctrl+Alt+Shift+X to suggest changes instead)'}
            aria-label="Suggest changes"
            aria-pressed={!!suggesting}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onSuggesting(!suggesting)}
            className={cx(
              'flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2 text-[12.5px] font-medium transition-colors',
              suggesting ? 'bg-[#188038]/15 text-[#188038] hover:bg-[#188038]/25 dark:text-[#5bc27a]' : 'text-fg-2 hover:bg-bg-2 hover:text-fg',
            )}
          >
            {suggesting ? <FilePenLine size={15} /> : <PencilLine size={15} />}
            {suggesting && <span>Suggesting</span>}
          </button>
        </>
      )}
      <Popover anchor={alignRef} open={menu === 'align'} onClose={() => (setMenu(null), engine.refocusSoon())} width={230}>
        {ALIGNS.map((a) => (
          <MenuItem key={a.value} icon={<a.icon size={14} />} hint={a.keys} checked={st.align === a.value} onClick={act(() => engine.align(a.value))}>
            {a.label}
          </MenuItem>
        ))}
      </Popover>
      <Popover anchor={tableRef} open={menu === 'table' && !!t} onClose={() => (setMenu(null), engine.refocusSoon())} width={250} title="Table">
        <MenuItem onClick={() => (setMenu(null), engine.table('rowAbove'))}>Insert a row above</MenuItem>
        <MenuItem onClick={() => (setMenu(null), engine.table('rowBelow'))}>Insert a row below</MenuItem>
        <MenuItem onClick={() => (setMenu(null), engine.table('colLeft'))}>Insert a column on the left</MenuItem>
        <MenuItem onClick={() => (setMenu(null), engine.table('colRight'))}>Insert a column on the right</MenuItem>
        <MenuSep />
        <MenuItem disabled={!st.cells || (st.cells.a[0] === st.cells.f[0] && st.cells.a[1] === st.cells.f[1])} onClick={() => (setMenu(null), engine.mergeCells())}>
          Merge cells
        </MenuItem>
        <MenuItem disabled={!(st.cell && t && (t.rows[st.cell[0]]?.[st.cell[1]]?.rs || t.rows[st.cell[0]]?.[st.cell[1]]?.cs))} onClick={() => (setMenu(null), engine.unmergeCell())}>
          Unmerge cells
        </MenuItem>
        <MenuItem checked={!!t?.head} onClick={() => (setMenu(null), engine.table('head'))}>
          Header row
        </MenuItem>
        <MenuSep />
        <MenuItem onClick={() => (setMenu(null), engine.table('delRow'))}>Delete the row</MenuItem>
        <MenuItem onClick={() => (setMenu(null), engine.table('delCol'))}>Delete the column</MenuItem>
        <MenuItem icon={<Trash2 size={14} />} danger onClick={() => (setMenu(null), engine.table('delTable'))}>
          Delete the table
        </MenuItem>
      </Popover>
      <Popover anchor={linkRef} open={!!linking} onClose={() => (setLinking(null), engine.refocusSoon())} width={300} title="Link">
        {linking && (
          <form
            className="space-y-2 p-2"
            onSubmit={(e) => {
              e.preventDefault();
              const u = linking.url.trim();
              setLinking(null);
              if (!u) return;
              engine.link(/^(https?:|mailto:|tel:)/i.test(u) ? u : /^[^\s@/]+@[^\s@]+\.[^\s@]+$/.test(u) ? `mailto:${u}` : `https://${u}`, linking.text);
            }}
          >
            {st.collapsed && !st.link && <input value={linking.text} onChange={(e) => setLinking({ ...linking, text: e.target.value })} placeholder="The words to show" className={inputCls} />}
            <input autoFocus value={linking.url} onChange={(e) => setLinking({ ...linking, url: e.target.value })} placeholder="https://… or an e-mail address" className={inputCls} />
            <div className="flex justify-end gap-2">
              {st.link && (
                <Button
                  size="sm"
                  variant="ghost"
                  type="button"
                  onClick={() => {
                    setLinking(null);
                    engine.link(null);
                  }}
                >
                  Remove the link
                </Button>
              )}
              <Button size="sm" variant="primary" type="submit" disabled={!linking.url.trim()}>
                Link
              </Button>
            </div>
          </form>
        )}
      </Popover>
    </div>
  );
}
