// The documents editor's toolbar, one row that fits a laptop's screen (sideways on a phone): undo and redo; the
// paragraph's style; the words' font and size; bold, italic, underline; their colour and highlight; a link (Ctrl+K);
// alignment, in a menu; bullets, numbers and a checklist; Insert (a picture from the device or the web, a table of a
// size picked on a grid, a line across, a page break); the table's rows and columns when the caret is in one; and
// More formatting (struck, raised and lowered words, indent, clearing the words' look). It acts on what is selected in the
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
  Highlighter,
  Image as ImageIcon,
  IndentDecrease,
  IndentIncrease,
  Italic,
  MoreHorizontal,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Plus,
  Redo2,
  RemoveFormatting,
  SeparatorHorizontal,
  Strikethrough,
  Subscript,
  Superscript,
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
function ColorPick({ label, icon, value, colors, none, onPick }: { label: string; icon: ReactNode; value: string | undefined; colors: string[]; none: string; onPick: (c: string | undefined) => void }) {
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
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={212} title={label}>
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

/** A grid to pick a table's size from: hover (or tap) the corner cell. */
function TableGrid({ onPick }: { onPick: (rows: number, cols: number) => void }) {
  const [at, setAt] = useState<[number, number]>([2, 3]);
  return (
    <div className="p-2">
      <div className="mb-1.5 text-center text-[12.5px] text-fg-2 tabular-nums">
        {at[1]} × {at[0]}
      </div>
      <div className="grid grid-cols-8 gap-[3px]" onMouseLeave={() => setAt([2, 3])}>
        {Array.from({ length: 64 }, (_, k) => {
          const r = Math.floor(k / 8) + 1;
          const c = (k % 8) + 1;
          return (
            <button
              key={k}
              type="button"
              aria-label={`${c} × ${r}`}
              onMouseEnter={() => setAt([r, c])}
              onClick={() => onPick(r, c)}
              className={cx('h-[22px] w-[22px] rounded-[3px] border', r <= at[0] && c <= at[1] ? 'border-accent bg-accent-soft' : 'border-line-2 bg-bg-1')}
            />
          );
        })}
      </div>
    </div>
  );
}

export function Toolbar({
  engine,
  st,
  doc,
  linking,
  setLinking,
  linkRef,
  onPicture,
  onPictureUrl,
}: {
  engine: DocEngine;
  st: SelState;
  doc: Doc;
  linking: { url: string; text: string } | null;
  setLinking: (l: { url: string; text: string } | null) => void;
  linkRef: RefObject<HTMLButtonElement | null>;
  onPicture: () => void;
  onPictureUrl: (url: string) => void;
}) {
  const [menu, setMenu] = useState<'insert' | 'url' | 'grid' | 'table' | 'align' | 'more' | null>(null);
  const [url, setUrl] = useState('');
  const insertRef = useRef<HTMLButtonElement>(null);
  const tableRef = useRef<HTMLButtonElement>(null);
  const alignRef = useRef<HTMLButtonElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const AlignIcon = ALIGNS.find((a) => a.value === st.align)?.icon ?? AlignLeft;
  const act = (f: () => void) => () => (setMenu(null), f());
  const shownSize = st.look.size ?? Math.round(doc.size * STYLES[st.style].k * 2) / 2;
  const t = st.block?.type === 'table' ? st.block : null;
  const openLink = () => setLinking({ url: st.link ?? '', text: '' });
  return (
    <div className="flex shrink-0 items-center gap-0.5" data-keeps-editing>
      <Tool label="Undo (Ctrl+Z)" disabled={!st.canUndo} onClick={() => engine.undo()}>
        <Undo2 size={15} />
      </Tool>
      <Tool label="Redo (Ctrl+Shift+Z)" disabled={!st.canRedo} onClick={() => engine.redo()}>
        <Redo2 size={15} />
      </Tool>
      <Sep />
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
      <ColorPick label="Text colour" icon={<Baseline size={14} />} value={st.look.color} colors={TEXT_COLORS} none="Automatic" onPick={(c) => engine.value('color', c)} />
      <ColorPick label="Highlight" icon={<Highlighter size={14} />} value={st.look.hl} colors={HL_COLORS} none="None" onPick={(c) => engine.value('hl', c)} />
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
      <Sep />
      <Button ref={insertRef} size="sm" variant="ghost" icon={<Plus size={14} />} onMouseDown={(e) => e.preventDefault()} onClick={() => setMenu(menu ? null : 'insert')} className={cx('shrink-0 px-2', menu && menu !== 'table' && 'bg-bg-2')}>
        Insert
        <ChevronDown size={12} className="-ml-0.5 text-fg-3" />
      </Button>
      {t && (
        <Button ref={tableRef} size="sm" variant="ghost" icon={<Table2 size={14} />} onMouseDown={(e) => e.preventDefault()} onClick={() => setMenu(menu === 'table' ? null : 'table')} className={cx('shrink-0 px-2', menu === 'table' && 'bg-bg-2')}>
          Table
          <ChevronDown size={12} className="-ml-0.5 text-fg-3" />
        </Button>
      )}
      <button
        ref={moreRef}
        type="button"
        title="More formatting"
        aria-label="More formatting"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setMenu(menu === 'more' ? null : 'more')}
        className={cx('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-fg-2 transition-colors hover:bg-bg-2 hover:text-fg', menu === 'more' && 'bg-bg-2')}
      >
        <MoreHorizontal size={15} />
      </button>
      <Popover anchor={alignRef} open={menu === 'align'} onClose={() => setMenu(null)} width={230}>
        {ALIGNS.map((a) => (
          <MenuItem key={a.value} icon={<a.icon size={14} />} hint={a.keys} checked={st.align === a.value} onClick={act(() => engine.align(a.value))}>
            {a.label}
          </MenuItem>
        ))}
      </Popover>
      <Popover anchor={moreRef} open={menu === 'more'} onClose={() => setMenu(null)} width={250}>
        <MenuItem icon={<Strikethrough size={14} />} hint="Ctrl+Shift+X" checked={!!st.on.s} onClick={act(() => engine.toggle('s'))}>
          Strikethrough
        </MenuItem>
        <MenuItem icon={<Superscript size={14} />} hint="Ctrl+." checked={!!st.on.sup} onClick={act(() => engine.toggle('sup'))}>
          Superscript
        </MenuItem>
        <MenuItem icon={<Subscript size={14} />} hint="Ctrl+," checked={!!st.on.sub} onClick={act(() => engine.toggle('sub'))}>
          Subscript
        </MenuItem>
        <MenuSep />
        <MenuItem icon={<IndentDecrease size={14} />} hint="Shift+Tab" onClick={act(() => engine.indent(-1))}>
          Less indent
        </MenuItem>
        <MenuItem icon={<IndentIncrease size={14} />} hint="Tab" onClick={act(() => engine.indent(1))}>
          More indent
        </MenuItem>
        <MenuSep />
        <MenuItem icon={<RemoveFormatting size={14} />} hint="Ctrl+\" onClick={act(() => engine.clear())}>
          Clear the formatting
        </MenuItem>
      </Popover>

      <Popover anchor={insertRef} open={menu === 'insert' || menu === 'url' || menu === 'grid'} onClose={() => setMenu(null)} width={menu === 'grid' ? 230 : 260} title="Insert">
        {menu === 'insert' && (
          <>
            <MenuItem icon={<ImageIcon size={14} />} onClick={() => (setMenu(null), onPicture())}>
              A picture from this device
            </MenuItem>
            <MenuItem icon={<Link2 size={14} />} onClick={() => setMenu('url')}>
              A picture from the web
            </MenuItem>
            <MenuItem icon={<Table2 size={14} />} submenu onClick={() => setMenu('grid')}>
              A table
            </MenuItem>
            <MenuSep />
            <MenuItem icon={<Minus size={14} />} onClick={() => (setMenu(null), engine.insertAtom('hr'))}>
              A line across
            </MenuItem>
            <MenuItem icon={<SeparatorHorizontal size={14} />} hint="Ctrl+Enter" onClick={() => (setMenu(null), engine.insertAtom('pagebreak'))}>
              A page break
            </MenuItem>
          </>
        )}
        {menu === 'url' && (
          <form
            className="space-y-2 p-2"
            onSubmit={(e) => {
              e.preventDefault();
              const u = url.trim();
              setMenu(null);
              setUrl('');
              if (u) onPictureUrl(u);
            }}
          >
            <p className="text-[12px] text-fg-3">The picture’s own address (it ends in .jpg, .png…). The app keeps a copy in the document.</p>
            <input autoFocus value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" className={inputCls} />
            <div className="flex justify-end">
              <Button size="sm" variant="primary" type="submit" disabled={!url.trim()}>
                Add it
              </Button>
            </div>
          </form>
        )}
        {menu === 'grid' && (
          <TableGrid
            onPick={(r, c) => {
              setMenu(null);
              engine.insertTable(r, c);
            }}
          />
        )}
      </Popover>
      <Popover anchor={tableRef} open={menu === 'table' && !!t} onClose={() => setMenu(null)} width={250} title="Table">
        <MenuItem onClick={() => (setMenu(null), engine.table('rowAbove'))}>Insert a row above</MenuItem>
        <MenuItem onClick={() => (setMenu(null), engine.table('rowBelow'))}>Insert a row below</MenuItem>
        <MenuItem onClick={() => (setMenu(null), engine.table('colLeft'))}>Insert a column on the left</MenuItem>
        <MenuItem onClick={() => (setMenu(null), engine.table('colRight'))}>Insert a column on the right</MenuItem>
        <MenuSep />
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
      <Popover anchor={linkRef} open={!!linking} onClose={() => setLinking(null)} width={300} title="Link">
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
