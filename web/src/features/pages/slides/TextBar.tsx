// How words look, in the slides editor's toolbar: Rewrite first (the words rewritten with AI: Rewrite.tsx), then the
// font, its size, bold, italic, underline and strike, colour, alignment, bullets and numbers, indent, a link. While words
// are changed in place it acts on the words selected; otherwise on the whole of each text box or shape picked. The same
// actions are the Format menu's (textActions).
import { useEffect, useRef, useState, type RefObject } from 'react';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Baseline,
  Bold,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Link2,
  List,
  ListOrdered,
  RemoveFormatting,
  Strikethrough,
  Underline,
} from 'lucide-react';
import { cssColor, FONTS, fontName, type Align, type Deck, type El, type Para, type TextProps } from '@shared/slides';
import { Button, inputCls, Popover } from '../../../components/ui';
import { ColorButton, NumInput, Tool } from './controls';
import { dropRunField, eachRun, listAll, setEls } from './ops';
import { RewriteButton, slidesTarget } from './Rewrite';
import type { CanvasHandle } from './SlideCanvas';

type TextEl = Extract<El, { type: 'text' | 'shape' }>;

/** The words last selected in the box being edited: a colour picker or the link's field takes the focus away. */
let lastRange: Range | null = null;

/** The words selected again, if the focus went elsewhere meanwhile. */
const restore = () => {
  const s = window.getSelection();
  const node = lastRange?.startContainer;
  const box = (node instanceof Element ? node : node?.parentElement)?.closest('.ns-txt') as HTMLElement | null | undefined;
  if (box && s && (!s.rangeCount || !box.contains(s.anchorNode))) {
    box.focus({ preventScroll: true });
    s.removeAllRanges();
    s.addRange(lastRange!);
  }
};

const exec = (cmd: string, arg?: string) => {
  restore();
  document.execCommand('styleWithCSS', false, 'true');
  document.execCommand(cmd, false, arg);
};

/** The words selected made `px` big (the browser's own command knows only seven sizes, so its largest is swapped for this one). */
function sizeSelection(box: HTMLElement, px: number) {
  exec('fontSize', '7');
  for (const el of Array.from(box.querySelectorAll<HTMLElement>('font[size="7"], span[style*="xxx-large"]'))) {
    if (el.tagName === 'FONT') {
      const s = document.createElement('span');
      s.style.fontSize = `${px}px`;
      while (el.firstChild) s.appendChild(el.firstChild);
      el.replaceWith(s);
    } else el.style.fontSize = `${px}px`;
  }
}

/** While words are changed in place with nothing selected, a change to how they look is for all of them. */
function wholeIfNothing(box: HTMLElement | null | undefined) {
  if (!box || (lastRange && !lastRange.collapsed)) return;
  const r = document.createRange();
  r.selectNodeContents(box);
  lastRange = r;
  const s = window.getSelection();
  box.focus({ preventScroll: true });
  s?.removeAllRanges();
  s?.addRange(r);
}

type TextArgs = { deck: Deck; index: number; els: TextEl[]; editing: boolean; canvas: RefObject<CanvasHandle | null>; change: (d: Deck | ((d: Deck) => Deck), key?: string) => void };
export type TextActions = ReturnType<typeof textActions>;

/** What can be done to the words of the text boxes and shapes picked (or to the words selected in the one being edited). */
export function textActions({ deck, index, els, editing, canvas, change }: TextArgs) {
  const t = deck.theme;
  const first = els[0];
  const ids = els.map((e) => e.id);
  const set = (f: (e: TextEl) => TextEl, key?: string) => change((d) => setEls(d, index, ids, (e) => f(e as TextEl) as El), key);
  const state = (cmd: string) => {
    try {
      return document.queryCommandState(cmd);
    } catch {
      return false;
    }
  };
  const on = (cmd: 'bold' | 'italic' | 'underline' | 'strikeThrough') => {
    if (editing) return state(cmd);
    const k = cmd === 'bold' ? 'b' : cmd === 'italic' ? 'i' : cmd === 'underline' ? 'u' : 's';
    const runs = first.paras.flatMap((p) => p.runs).filter((r) => r.t);
    const box = cmd === 'bold' ? !!first.bold : cmd === 'italic' ? !!first.italic : false;
    return runs.length ? runs.every((r) => (r[k] ?? box) === true) : box;
  };
  const toggle = (cmd: 'bold' | 'italic' | 'underline' | 'strikeThrough') => {
    if (editing) return exec(cmd);
    const was = on(cmd);
    if (cmd === 'bold' || cmd === 'italic') {
      const k = cmd === 'bold' ? 'b' : 'i';
      set((e) => ({ ...e, [cmd]: !was || undefined, paras: dropRunField(e.paras, k) }));
    } else {
      const k = cmd === 'underline' ? 'u' : 's';
      set((e) => ({ ...e, paras: eachRun(e.paras, (r) => ({ ...r, [k]: !was || undefined })) }));
    }
  };
  const align = (a: Align) => {
    if (editing) return canvas.current?.paraOp((paras, picked) => paras.map((p, i) => (picked.includes(i) ? { ...p, align: a } : p)));
    set((e) => ({ ...e, align: a, paras: e.paras.map(({ align: _a, ...p }) => p) }));
  };
  const curAlign = (): Align => {
    if (editing) {
      const s = window.getSelection();
      const p = (s?.anchorNode instanceof Element ? s.anchorNode : s?.anchorNode?.parentElement)?.closest<HTMLElement>('.ns-p');
      return (p?.dataset.align as Align) || first.align || 'left';
    }
    return first.align ?? 'left';
  };
  const list = (kind: 'bullet' | 'number') => {
    const all = first.paras.every((p) => p.list === kind);
    if (editing)
      return canvas.current?.paraOp((paras, picked) => {
        const allPicked = picked.every((i) => paras[i]?.list === kind);
        return paras.map((p, i) => {
          if (!picked.includes(i)) return p;
          const { list: _l, ...rest } = p;
          return allPicked ? rest : { ...rest, list: kind };
        });
      });
    set((e) => ({ ...e, paras: listAll(e.paras, all ? null : kind) }));
  };
  const indent = (by: 1 | -1) => {
    const f = (p: Para) => ({ ...p, lvl: Math.max(0, Math.min(4, (p.lvl ?? 0) + by)) || undefined });
    if (editing) return canvas.current?.paraOp((paras, picked) => paras.map((p, i) => (picked.includes(i) ? f(p) : p)));
    set((e) => ({ ...e, paras: e.paras.map(f) }));
  };
  const size = (px: number) => {
    const box = canvas.current?.editBox();
    if (editing && box) {
      wholeIfNothing(box);
      restore();
      return sizeSelection(box, px);
    }
    const old = first.size;
    set((e) => ({ ...e, size: px, paras: eachRun(e.paras, (r) => (r.size ? { ...r, size: Math.round(r.size * (px / old) * 10) / 10 } : r)) }), `size:${ids.join()}`);
  };
  const color = (c: string | undefined) => {
    if (editing) {
      wholeIfNothing(canvas.current?.editBox());
      return exec('foreColor', cssColor(c ?? 'fg', t));
    }
    set((e) => ({ ...e, color: c, paras: dropRunField(e.paras, 'color') }));
  };
  const font = (f: string) => {
    if (editing) {
      wholeIfNothing(canvas.current?.editBox());
      return exec('fontName', fontName(f, t));
    }
    set((e) => ({ ...e, font: f || undefined, paras: dropRunField(e.paras, 'font') }));
  };
  const link = (href: string) => {
    const url = href.trim();
    if (editing) {
      if (url) exec('createLink', /^(https?:|mailto:|tel:|#\d)/i.test(url) ? url : `https://${url}`);
      else exec('unlink');
      return;
    }
    set((e) => ({ ...e, link: url ? (/^(https?:|mailto:|tel:|#\d)/i.test(url) ? url : `https://${url}`) : undefined }));
  };
  /** Raised or lowered words (superscript, subscript): on, or off when they already are. */
  const script = (which: 'sup' | 'sub') => {
    if (editing) return exec(which === 'sup' ? 'superscript' : 'subscript');
    const all = first.paras.flatMap((p) => p.runs).filter((r) => r.t);
    const was = all.length > 0 && all.every((r) => r[which]);
    set((e) => ({ ...e, paras: eachRun(e.paras, (r) => ({ ...r, sup: undefined, sub: undefined, ...(was ? {} : { [which]: true }) })) }));
  };
  /** The words a step bigger or smaller (two pixels). */
  const grow = (by: number) => size(Math.max(6, Math.min(400, (first.size ?? 24) + by)));
  const clear = () => {
    if (editing) return exec('removeFormat');
    set((e) => ({ ...e, paras: e.paras.map((p) => ({ ...p, runs: p.runs.map((r) => ({ t: r.t, ...(r.link ? { link: r.link } : {}) })) })) }));
  };
  return { first, ids, on, toggle, align, curAlign, list, indent, size, color, font, link, script, grow, clear };
}

export function TextBar(args: TextArgs) {
  const { deck, els, editing, canvas } = args;
  const t = deck.theme;
  const first = els[0];
  const [, setTick] = useState(0);
  const linkRef = useRef<HTMLButtonElement>(null);
  const [linking, setLinking] = useState<string | null>(null);
  // The toolbar follows the words selected while editing.
  useEffect(() => {
    if (!editing) return;
    const on = () => {
      const s = window.getSelection();
      const box = canvas.current?.editBox();
      if (s?.rangeCount && box?.contains(s.anchorNode)) lastRange = s.getRangeAt(0).cloneRange();
      setTick((x) => x + 1);
    };
    document.addEventListener('selectionchange', on);
    return () => {
      document.removeEventListener('selectionchange', on);
      lastRange = null;
    };
  }, [editing]);
  if (!first) return null;
  const { on, toggle, align, curAlign, list, indent, size, color, font, link } = textActions(args);
  const fonts = [
    { value: 'head', label: `Headings (${t.headFont})` },
    { value: 'body', label: `Body (${t.font})` },
    ...FONTS.map((f) => ({ value: f.name, label: f.name })),
  ];
  const curFont = first.font ?? (first.role === 'title' || first.role === 'quote' || first.role === 'big' ? 'head' : 'body');
  const a = curAlign();
  const shown = fontName(first.font, t, first.role as TextProps['role']);
  return (
    <div className="flex shrink-0 items-center gap-0.5" data-keeps-editing>
      {els.length === 1 && (
        <>
          <RewriteButton target={() => slidesTarget(args)} />
          <span className="mx-1 h-5 w-px shrink-0 bg-line" />
        </>
      )}
      <span className="relative flex h-8 w-[136px] shrink-0">
        <select
          value={curFont}
          title="Font"
          aria-label="Font"
          onChange={(e) => font(e.target.value)}
          style={{ fontFamily: FONTS.find((f) => f.name === shown)?.css }}
          className="h-full w-full min-w-0 cursor-pointer appearance-none truncate rounded-lg border border-line bg-bg-1 pr-5 pl-2 text-[12.5px] outline-none focus:border-accent/60"
        >
          {fonts.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </span>
      <NumInput value={first.size} onChange={size} min={6} max={400} step={2} label="Size" buttons className="w-[92px] shrink-0" />
      <span className="mx-1 h-5 w-px shrink-0 bg-line" />
      <Tool label="Bold (Ctrl+B)" on={on('bold')} onClick={() => toggle('bold')}>
        <Bold size={15} />
      </Tool>
      <Tool label="Italic (Ctrl+I)" on={on('italic')} onClick={() => toggle('italic')}>
        <Italic size={15} />
      </Tool>
      <Tool label="Underline (Ctrl+U)" on={on('underline')} onClick={() => toggle('underline')}>
        <Underline size={15} />
      </Tool>
      <Tool label="Strikethrough" on={on('strikeThrough')} onClick={() => toggle('strikeThrough')}>
        <Strikethrough size={15} />
      </Tool>
      <ColorButton value={first.color} theme={t} onChange={color} label="Text colour" icon={<Baseline size={15} />} />
      <span className="mx-1 h-5 w-px shrink-0 bg-line" />
      <Tool label="Align left" on={a === 'left'} onClick={() => align('left')}>
        <AlignLeft size={15} />
      </Tool>
      <Tool label="Centre" on={a === 'center'} onClick={() => align('center')}>
        <AlignCenter size={15} />
      </Tool>
      <Tool label="Align right" on={a === 'right'} onClick={() => align('right')}>
        <AlignRight size={15} />
      </Tool>
      <Tool label="Justify" on={a === 'justify'} onClick={() => align('justify')}>
        <AlignJustify size={15} />
      </Tool>
      <span className="mx-1 h-5 w-px shrink-0 bg-line" />
      <Tool label="Bulleted list" on={first.paras.every((p) => p.list === 'bullet')} onClick={() => list('bullet')}>
        <List size={15} />
      </Tool>
      <Tool label="Numbered list" on={first.paras.every((p) => p.list === 'number')} onClick={() => list('number')}>
        <ListOrdered size={15} />
      </Tool>
      <Tool label="Less indent (Shift+Tab)" onClick={() => indent(-1)}>
        <IndentDecrease size={15} />
      </Tool>
      <Tool label="More indent (Tab)" onClick={() => indent(1)}>
        <IndentIncrease size={15} />
      </Tool>
      <span className="mx-1 h-5 w-px shrink-0 bg-line" />
      <button
        ref={linkRef}
        type="button"
        title="Link"
        aria-label="Link"
        data-keeps-editing
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setLinking(first.link ?? '')}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-fg-2 hover:bg-bg-2 hover:text-fg"
      >
        <Link2 size={15} />
      </button>
      {editing && (
        <Tool label="Clear the formatting" onClick={() => exec('removeFormat')}>
          <RemoveFormatting size={15} />
        </Tool>
      )}
      <Popover anchor={linkRef} open={linking !== null} onClose={() => setLinking(null)} width={300} title="Link">
        <form
          data-keeps-editing
          className="space-y-2 p-2"
          onSubmit={(e) => {
            e.preventDefault();
            link(linking ?? '');
            setLinking(null);
          }}
        >
          <p className="text-[12px] text-fg-3">{editing ? 'The words selected open this address (or a slide: #3).' : 'Clicking the part in the slideshow opens this address (or goes to a slide: #3).'}</p>
          <input autoFocus value={linking ?? ''} onChange={(e) => setLinking(e.target.value)} placeholder="https://… or #3" className={inputCls} />
          <div className="flex justify-end gap-2">
            {(editing || first.link) && (
              <Button
                size="sm"
                variant="ghost"
                type="button"
                onClick={() => {
                  link('');
                  setLinking(null);
                }}
              >
                Remove the link
              </Button>
            )}
            <Button size="sm" variant="primary" type="submit">
              Link
            </Button>
          </div>
        </form>
      </Popover>
    </div>
  );
}
