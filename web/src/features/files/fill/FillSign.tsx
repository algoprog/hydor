// Fill & sign, a PDF's view in Files for filling it in: its pages as pictures, its form's fields over them to type in,
// tick or pick, and a click anywhere on a page puts what the toolbar holds there: a text box (Text, or today's date),
// a tick or a cross. Signature places one of your saved signatures, or one drawn there; a signature field opens it
// too, its box the signature's place. Whatever is placed moves by dragging, and grows or shrinks (ticks and signatures
// by their corner, text with A− and A+). Save writes a copy beside the file ("name (filled).pdf"), or over it with its
// old version in the Trash: fields filled with their own look, everything else drawn onto the pages, in an update that
// keeps the file's digital signature valid where filling is all that changed.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { AArrowDown, AArrowUp, CalendarDays, Check, ChevronDown, Copy, GripVertical, Info, Replace, Signature, Trash2, Type, X } from 'lucide-react';
import { api, enc, post } from '../../../lib/api';
import { basename } from '../../../lib/format';
import { mu } from '../../../lib/machine';
import { toast, toastError } from '../../../lib/store';
import { tr } from '../../../i18n/runtime';
import { LOCALE } from '../../../i18n/locale';
import { Button, cx, Empty, IconButton, MenuItem, Popover, Throbber, useConfirm, useIsMobile } from '../../../components/ui';
import { type Field, type Mark, newId, PAPER_FONT, type PdfInfo, radioValue, textWidth, type Tool, type Widget } from './model';
import { type ChosenSignature, PlaceSignature } from './PlaceSignature';

type Value = Field['value'];

/** Where a text box's first line sits: the PDF puts the font's top this far above the line the page shows. */
const LINE = 1.2;
const BASELINE_SHIFT = 0.0415;

// Fields as Acrobat shows them for filling: a light blue box on the paper, whatever the app's theme.
const FIELD =
  'bg-[rgba(59,130,246,0.1)] text-[#111] outline-none ring-1 ring-[rgba(59,130,246,0.45)] ring-inset focus:bg-[rgba(59,130,246,0.16)] focus:ring-2 focus:ring-[rgba(37,99,235,0.85)] disabled:bg-transparent disabled:ring-[rgba(0,0,0,0.12)]';

/** What a click on a page does with the tool picked. */
const hint = (t: Tool) => (t === 'check' ? tr('Click where a tick goes') : t === 'cross' ? tr('Click where a cross goes') : t === 'date' ? tr('Click where today’s date goes') : tr('Click on a page to type there'));

export function FillSign({ path, onDone }: { path: string; onDone: (saved?: { path: string; replaced: boolean }) => void }) {
  const mobile = useIsMobile();
  const [info, setInfo] = useState<PdfInfo | null>(null);
  const [error, setError] = useState('');
  const [values, setValues] = useState<Record<string, Value>>({});
  const [marks, setMarks] = useState<Mark[]>([]);
  const [tool, setTool] = useState<Tool>('text');
  const [selected, setSelected] = useState<string | null>(null);
  const [signing, setSigning] = useState<{ page?: number; box?: Widget } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMenu, setSaveMenu] = useState(false);
  const saveRef = useRef<HTMLButtonElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const pageEls = useRef<(HTMLDivElement | null)[]>([]);
  const [colW, setColW] = useState(0);
  // Zoom over the pages' width (1: as wide as the view): a pinch on a touch screen, Ctrl with the wheel or + and −.
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  const width = Math.round(colW * zoom);
  const [confirm, confirmNode] = useConfirm();

  useEffect(() => {
    let alive = true;
    api<PdfInfo>(`/api/pdf/info?path=${enc(path)}`)
      .then((r) => alive && setInfo(r))
      .catch((e) => alive && setError((e as Error).message));
    return () => {
      alive = false;
    };
  }, [path]);

  // The pages as wide as the view allows, up to a page's comfortable reading width.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const fit = () => setColW(Math.max(200, Math.min(920, el.clientWidth - (mobile ? 16 : 48))));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [mobile, info]);

  // The point a zoom keeps where it was: its place in the pages (shares of their scrolled size) and in the view.
  const anchor = useRef<{ fx: number; fy: number; px: number; py: number } | null>(null);
  /** Zooms to `z`, keeping the point (x, y) of the view (from its top-left) where it is. */
  const zoomTo = useCallback((z: number, x?: number, y?: number) => {
    const sc = scroller.current;
    const next = Math.max(1, Math.min(4, z));
    if (!sc || Math.abs(next - zoomRef.current) < 0.001) return;
    const px = x ?? sc.clientWidth / 2;
    const py = y ?? sc.clientHeight / 2;
    // Measured on what is drawn now (the zoom last laid out), once per drawing: a pinch's moves come faster.
    anchor.current ??= { fx: (sc.scrollLeft + px) / Math.max(1, sc.scrollWidth), fy: (sc.scrollTop + py) / Math.max(1, sc.scrollHeight), px, py };
    setZoom(next);
  }, []);
  // Once the new width is laid out, the point goes back under the fingers (or the pointer).
  useLayoutEffect(() => {
    zoomRef.current = zoom;
    const sc = scroller.current;
    const a = anchor.current;
    anchor.current = null;
    if (!sc || !a) return;
    sc.scrollLeft = a.fx * sc.scrollWidth - a.px;
    sc.scrollTop = a.fy * sc.scrollHeight - a.py;
  }, [zoom]);
  useEffect(() => {
    const sc = scroller.current;
    if (!sc) return;
    // Two fingers apart or together zoom; one finger scrolls as it always does.
    const touches = new Map<number, { x: number; y: number }>();
    let pinch: { d: number; z: number } | null = null;
    const spread = () => {
      const [a, b] = [...touches.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };
    const down = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2) pinch = { d: spread(), z: zoomRef.current };
    };
    const move = (e: PointerEvent) => {
      if (!touches.has(e.pointerId)) return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && touches.size === 2) {
        const [a, b] = [...touches.values()];
        const r = sc.getBoundingClientRect();
        zoomTo((pinch.z * spread()) / Math.max(1, pinch.d), (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
      }
    };
    const up = (e: PointerEvent) => {
      touches.delete(e.pointerId);
      if (touches.size < 2) pinch = null;
    };
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const r = sc.getBoundingClientRect();
      zoomTo(zoomRef.current * Math.exp(-e.deltaY / 400), e.clientX - r.left, e.clientY - r.top);
    };
    const key = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      if (e.key === '=' || e.key === '+') zoomTo(zoomRef.current * 1.25);
      else if (e.key === '-') zoomTo(zoomRef.current / 1.25);
      else if (e.key === '0') zoomTo(1);
      else return;
      e.preventDefault();
    };
    sc.addEventListener('pointerdown', down);
    sc.addEventListener('pointermove', move);
    sc.addEventListener('pointerup', up);
    sc.addEventListener('pointercancel', up);
    sc.addEventListener('wheel', wheel, { passive: false });
    window.addEventListener('keydown', key);
    return () => {
      sc.removeEventListener('pointerdown', down);
      sc.removeEventListener('pointermove', move);
      sc.removeEventListener('pointerup', up);
      sc.removeEventListener('pointercancel', up);
      sc.removeEventListener('wheel', wheel);
      window.removeEventListener('keydown', key);
    };
  }, [zoomTo]);

  const dirty = Object.keys(values).length > 0 || marks.some((m) => m.type !== 'text' || !!m.text?.trim());
  useEffect(() => {
    if (!dirty) return;
    const before = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', before);
    return () => window.removeEventListener('beforeunload', before);
  }, [dirty]);

  const update = useCallback((id: string, patch: Partial<Mark>) => setMarks((ms) => ms.map((m) => (m.id === id ? { ...m, ...patch } : m))), []);
  const remove = useCallback((id: string) => {
    setMarks((ms) => ms.filter((m) => m.id !== id));
    setSelected((s) => (s === id ? null : s));
  }, []);
  const add = (m: Omit<Mark, 'id'>) => {
    const id = newId();
    setMarks((ms) => [...ms, { ...m, id }]);
    setSelected(id);
    return id;
  };

  // Delete takes the selected tick or signature away; Escape lets go of it.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable]')) return;
      if (e.key === 'Escape') setSelected(null);
      else if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
        e.preventDefault();
        remove(selected);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [selected, remove]);

  const valueOf = (f: Field): Value => (f.name in values ? values[f.name] : f.value);
  const setValue = (f: Field, v: Value) => setValues((vs) => ({ ...vs, [f.name]: v }));

  /** A click on a page's paper puts the toolbar's mark there (blank after blank, one click each); Escape or a click off the page lets go. */
  const placeAt = (page: number, x: number, y: number) => {
    if (tool === 'check' || tool === 'cross') {
      const s = 14;
      add({ type: tool, page, x: x - s / 2, y: y - s / 2, w: s, h: s });
      return;
    }
    const size = 11;
    const text = tool === 'date' ? new Date().toLocaleDateString(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' }) : '';
    add({ type: 'text', page, x, y: y - size * LINE * 0.5, w: 0, h: 0, text, size });
  };

  /** The page most in view, and the middle of what shows of it (points). */
  const inView = (): { page: number; y: number } => {
    const sc = scroller.current;
    if (!sc || !info) return { page: 1, y: 200 };
    const r = sc.getBoundingClientRect();
    const mid = r.top + r.height / 2;
    let best = 0;
    let bestD = Infinity;
    pageEls.current.forEach((el, i) => {
      if (!el) return;
      const b = el.getBoundingClientRect();
      const d = mid < b.top ? b.top - mid : mid > b.bottom ? mid - b.bottom : 0;
      if (d < bestD) ((best = i), (bestD = d));
    });
    const b = pageEls.current[best]!.getBoundingClientRect();
    const k = b.width / info.pages[best].width;
    return { page: best + 1, y: Math.max(40, Math.min(info.pages[best].height - 80, (Math.min(Math.max(mid, b.top), b.bottom) - b.top) / k)) };
  };

  const placeSignature = (s: ChosenSignature) => {
    if (!info) return;
    const target = signing;
    const ratio = s.height / Math.max(1, s.width);
    let page: number;
    let x: number;
    let y: number;
    let w = s.kind === 'initials' ? 60 : 150;
    let h = w * ratio;
    if (target?.box) {
      // Inside the signature field's box, its shape kept.
      const b = target.box;
      const k = Math.min(b.w / w, b.h / h, 1.6);
      w *= k;
      h *= k;
      page = b.page;
      x = b.x + (b.w - w) / 2;
      y = b.y + (b.h - h) / 2;
    } else {
      const v = inView();
      page = target?.page ?? v.page;
      const ps = info.pages[page - 1];
      w = Math.min(w, ps.width * 0.6);
      h = w * ratio;
      x = (ps.width - w) / 2;
      y = v.y - h / 2;
    }
    add({ type: 'image', page, x, y, w, h, src: s.src, ...(s.id ? { signature: s.id } : { png: s.png }) });
  };

  const save = async (replace: boolean) => {
    setSaveMenu(false);
    if (!info || saving) return;
    setSaving(true);
    try {
      const out = marks
        .filter((m) => m.type !== 'text' || m.text?.trim())
        .map((m) =>
          m.type === 'text'
            ? { type: 'text', page: m.page, x: m.x, y: m.y + BASELINE_SHIFT * (m.size ?? 11), text: m.text, size: m.size }
            : m.type === 'image'
              ? { type: 'image', page: m.page, x: m.x, y: m.y, w: m.w, h: m.h, ...(m.signature ? { signature: m.signature } : { png: m.png }) }
              : { type: m.type, page: m.page, x: m.x, y: m.y, size: m.w },
        );
      const r = await post<{ path: string; replaced: boolean; notes: string[] }>('/api/pdf/save', { path, mtime: info.mtime, replace, values, marks: out });
      toast(`Saved ${basename(r.path)}`, 'ok');
      for (const n of r.notes) toast(n, 'info');
      onDone({ path: r.path, replaced: r.replaced });
    } catch (e) {
      toastError(e);
    } finally {
      setSaving(false);
    }
  };

  const close = async () => {
    if (dirty && !(await confirm({ title: tr('Leave without saving?'), body: tr('What you filled in and placed on its pages will be lost.'), confirm: tr('Leave'), danger: true }))) return;
    onDone();
  };

  const notes = useMemo(() => {
    if (!info) return [];
    const out: string[] = [];
    if (info.form.dynamic) out.push(tr('This is an XFA form: its fields can only be filled in Adobe Acrobat or Reader. You can still type and sign on its pages.'));
    else if (info.permissions && !info.permissions.fillForms && info.form.fields.length) out.push(tr('Its owner protected its form against filling.'));
    if (info.permissions && !info.permissions.modify) out.push(tr('Its owner protected its pages against changes: only its fields can be filled.'));
    if (info.certified) out.push(tr('It is certified with a digital signature that allows filling its fields only.'));
    else if (info.signed) out.push(tr('It has a digital signature. Filling its fields keeps it valid; what you place on its pages shows as a change made after signing.'));
    return out;
  }, [info]);

  const stem = basename(path).replace(/\.pdf$/i, '');
  const toolButton = (t: Tool, label: string, icon: React.ReactNode) => (
    <IconButton key={t} label={label} active={tool === t} aria-pressed={tool === t} onClick={() => setTool(t)} className={cx(mobile ? 'h-9 w-9' : 'h-7.5 w-7.5', tool === t && 'bg-bg-3 text-fg shadow-sm')}>
      {icon}
    </IconButton>
  );

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div className="flex h-12 shrink-0 items-center gap-1 border-b border-line px-2 sm:h-11 sm:px-3">
        <div className="flex items-center gap-0.5 rounded-[10px] bg-bg-2 p-0.5" role="toolbar" aria-label="What a click puts on a page">
          {toolButton('text', 'Text', <Type size={15} />)}
          {toolButton('check', 'Tick', <Check size={15} strokeWidth={2.5} />)}
          {toolButton('cross', 'Cross', <X size={15} strokeWidth={2.5} />)}
          {toolButton('date', 'Date', <CalendarDays size={15} />)}
        </div>
        {mobile ? (
          <IconButton label="Signature" onClick={() => setSigning({})} className="h-9 w-9">
            <Signature size={17} />
          </IconButton>
        ) : (
          <Button size="sm" variant="ghost" icon={<Signature size={14} />} onClick={() => setSigning({})}>
            Signature
          </Button>
        )}
        <div className="min-w-0 flex-1 truncate px-1 text-[12.5px] text-fg-3 max-md:hidden">{hint(tool)}</div>
        {mobile && <div className="flex-1" />}
        {mobile ? (
          <IconButton label="Close Fill & sign" onClick={() => void close()} className="h-9 w-9">
            <X size={18} />
          </IconButton>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => void close()}>
            Close
          </Button>
        )}
        <div className="flex items-center">
          <Button size="sm" variant="primary" disabled={!dirty || saving || !info} onClick={() => void save(false)} className={cx('rounded-r-none pr-2.5', mobile && 'h-9')} title={tr('Save a copy beside it')}>
            {saving ? 'Saving' : 'Save'}
          </Button>
          <button
            ref={saveRef}
            type="button"
            aria-label="More ways to save"
            title="More ways to save"
            disabled={!dirty || saving || !info}
            onClick={() => setSaveMenu((o) => !o)}
            className={cx('inline-flex items-center justify-center rounded-r-[10px] border-l border-black/15 bg-accent px-1.5 text-accent-fg hover:opacity-90 disabled:pointer-events-none disabled:opacity-45', mobile ? 'h-9' : 'h-8')}
          >
            <ChevronDown size={14} />
          </button>
        </div>
        <Popover anchor={saveRef} open={saveMenu} onClose={() => setSaveMenu(false)} align="end" width={250}>
          <MenuItem icon={<Copy size={14} />} onClick={() => void save(false)}>
            Save a copy beside it
          </MenuItem>
          <MenuItem icon={<Replace size={14} />} onClick={() => void save(true)}>
            Replace the file
          </MenuItem>
          <div className="px-2.5 pt-1 pb-1.5 text-[11.5px] leading-snug text-fg-3">
            A copy is named <span translate="no">“{stem} (filled).pdf”</span>. A replaced file’s old version goes to the Trash.
          </div>
        </Popover>
      </div>
      {notes.map((n) => (
        <div key={n} className="flex shrink-0 items-start gap-2 border-b border-line bg-bg-1 px-3 py-1.5 text-[12.5px] leading-snug text-fg-2">
          <Info size={14} className="mt-0.5 shrink-0 text-fg-3" />
          <span>{n}</span>
        </div>
      ))}
      <div ref={scroller} className="relative min-h-0 flex-1 touch-pan-x touch-pan-y overflow-auto bg-bg-1 py-3 sm:py-6" onClick={(e) => e.target === e.currentTarget && setSelected(null)}>
        {error ? (
          <Empty title="Could not open the PDF">{error}</Empty>
        ) : !info || !colW ? (
          <div className="flex h-full items-center justify-center text-fg-3">
            <Throbber size={34} />
          </div>
        ) : (
          <div className="mx-auto flex flex-col gap-4 sm:gap-6" style={{ width }}>
            {info.pages.map((p, i) => (
              <PageView
                key={i}
                n={i + 1}
                size={p}
                width={width}
                path={path}
                mtime={info.mtime}
                refEl={(el) => (pageEls.current[i] = el)}
                fields={info.form.fields}
                valueOf={valueOf}
                setValue={setValue}
                marks={marks.filter((m) => m.page === i + 1)}
                selected={selected}
                onSelect={setSelected}
                onPlace={placeAt}
                update={update}
                remove={remove}
                onSign={(box) => setSigning({ box })}
              />
            ))}
          </div>
        )}
      </div>
      {zoom > 1.01 && (
        <button type="button" onClick={() => zoomTo(1)} className="absolute right-4 bottom-[max(16px,var(--safe-bottom))] z-10 rounded-full border border-line bg-elevated px-3 py-1.5 text-[12.5px] text-fg-2 shadow-lg hover:text-fg">
          Fit width
        </button>
      )}
      <PlaceSignature open={!!signing} onClose={() => setSigning(null)} onPlace={placeSignature} />
      {confirmNode}
    </div>
  );
}

/** One page: its picture without its fields, the fields to fill over it, and what was placed on it. */
function PageView({
  n,
  size,
  width,
  path,
  mtime,
  refEl,
  fields,
  valueOf,
  setValue,
  marks,
  selected,
  onSelect,
  onPlace,
  update,
  remove,
  onSign,
}: {
  n: number;
  size: { width: number; height: number };
  width: number;
  path: string;
  mtime: number;
  refEl: (el: HTMLDivElement | null) => void;
  fields: Field[];
  valueOf: (f: Field) => Value;
  setValue: (f: Field, v: Value) => void;
  marks: Mark[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  onPlace: (page: number, x: number, y: number) => void;
  update: (id: string, patch: Partial<Mark>) => void;
  remove: (id: string) => void;
  onSign: (box: Widget) => void;
}) {
  const k = width / size.width;
  const height = size.height * k;
  // The picture a little sharper than the screen needs, in steps, so the server keeps few sizes.
  const px = Math.min(2400, Math.ceil((width * Math.min(2, window.devicePixelRatio || 1)) / 400) * 400);
  const [loaded, setLoaded] = useState(false);
  const here = fields.flatMap((f) => f.widgets.filter((w) => w.page === n && w.w > 0 && w.h > 0).map((w) => ({ f, w })));
  return (
    <div
      ref={refEl}
      data-paper
      className="relative shrink-0 overflow-hidden bg-white shadow-[0_1px_4px_rgba(0,0,0,0.25)]"
      style={{ width, height }}
      onClick={(e) => {
        if (!(e.target as HTMLElement).hasAttribute('data-paper')) return;
        const r = e.currentTarget.getBoundingClientRect();
        onPlace(n, (e.clientX - r.left) / k, (e.clientY - r.top) / k);
      }}
    >
      <img
        src={mu(`/api/pdf/page?path=${enc(path)}&page=${n}&width=${px}&fields=0&v=${mtime}`)}
        alt=""
        draggable={false}
        loading={n > 2 ? 'lazy' : 'eager'}
        onLoad={() => setLoaded(true)}
        className="pointer-events-none absolute inset-0 h-full w-full select-none"
      />
      {!loaded && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-neutral-400">
          <Throbber size={26} />
        </div>
      )}
      {here.map(({ f, w }, i) =>
        // A signature field with a signature placed over it makes way for it.
        f.kind === 'signature' && marks.some((m) => m.type === 'image' && m.x < w.x + w.w && m.x + m.w > w.x && m.y < w.y + w.h && m.y + m.h > w.y) ? null : (
          <FieldBox key={`${f.name}:${i}`} f={f} w={w} k={k} value={valueOf(f)} onChange={(v) => setValue(f, v)} onSign={() => onSign(w)} />
        ),
      )}
      {marks.map((m) =>
        m.type === 'text' ? (
          <TextMark key={m.id} m={m} k={k} page={size} selected={selected === m.id} onSelect={() => onSelect(m.id)} update={update} remove={remove} />
        ) : (
          <BoxMark key={m.id} m={m} k={k} page={size} selected={selected === m.id} onSelect={() => onSelect(m.id)} update={update} remove={remove} />
        ),
      )}
    </div>
  );
}

// A field's box on the paper: the wrapper draws it, so its control can be scaled.
const FIELD_BOX = 'bg-[rgba(59,130,246,0.1)] ring-1 ring-[rgba(59,130,246,0.45)] ring-inset focus-within:bg-[rgba(59,130,246,0.16)] focus-within:ring-2 focus-within:ring-[rgba(37,99,235,0.85)]';
const CONTROL = 'm-0 border-0 bg-transparent text-[#111] outline-none disabled:text-[#555]';

/**
 * A text control on the page: drawn at 16px (smaller ones make a phone zoom in when they are touched, and the app
 * makes them 16px there anyway) and scaled to the size the page shows it at, so it shows the words as they will print.
 */
function Scaled({ box, font, className, children }: { box: { left: number; top: number; width: number; height: number }; font: number; className?: string; children: (inner: CSSProperties) => React.ReactNode }) {
  const s = Math.max(0.05, font / 16);
  return (
    <div className={cx('absolute', FIELD_BOX, className)} style={box}>
      {children({ position: 'absolute', left: 0, top: 0, width: box.width / s, height: box.height / s, fontSize: 16, transform: `scale(${s})`, transformOrigin: '0 0', fontFamily: PAPER_FONT })}
    </div>
  );
}

/** A form field over its place on the page, to type in, tick or pick. */
function FieldBox({ f, w, k, value, onChange, onSign }: { f: Field; w: Widget; k: number; value: Value; onChange: (v: Value) => void; onSign: () => void }) {
  const box = { left: w.x * k, top: w.y * k, width: w.w * k, height: w.h * k };
  const name = f.label ?? f.tooltip ?? f.name;
  const off = !!f.readOnly || !!f.locked;
  const title = f.locked ? tr('Locked by a signature in the file') : f.readOnly ? tr('Read-only') : (f.tooltip ?? f.label ?? f.name);
  const fontSize = Math.max(6, Math.min(w.h * 0.62, 13) * k);
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const base = cx('absolute', FIELD);
  switch (f.kind) {
    case 'text':
      return (
        <Scaled box={box} font={fontSize} className="rounded-[2px]">
          {(inner) => (
            <input
              type={f.password ? 'password' : 'text'}
              value={typeof value === 'string' ? value : ''}
              maxLength={f.maxLength || undefined}
              disabled={off}
              aria-label={name}
              title={title}
              translate="no"
              onChange={(e) => onChange(e.target.value)}
              onClick={stop}
              className={cx(CONTROL, 'px-[0.25em]', f.comb && 'text-center tracking-[0.4em]')}
              style={inner}
            />
          )}
        </Scaled>
      );
    case 'multiline':
      return (
        <Scaled box={box} font={Math.max(6, 10 * k)} className="rounded-[2px]">
          {(inner) => (
            <textarea
              value={typeof value === 'string' ? value : ''}
              maxLength={f.maxLength || undefined}
              disabled={off}
              aria-label={name}
              title={title}
              translate="no"
              onChange={(e) => onChange(e.target.value)}
              onClick={stop}
              className={cx(CONTROL, 'resize-none px-[0.25em] py-[0.15em] leading-[1.15]')}
              style={inner}
            />
          )}
        </Scaled>
      );
    case 'checkbox':
    case 'radio': {
      const mine = f.kind === 'radio' ? radioValue(f, w) : undefined;
      const on = f.kind === 'radio' ? value === mine : value === true;
      return (
        <button
          type="button"
          role={f.kind}
          aria-checked={on}
          aria-label={f.kind === 'radio' ? `${name}: ${f.options?.find((o) => o.value === mine)?.label ?? mine ?? ''}` : name}
          title={title}
          disabled={off}
          onClick={(e) => {
            e.stopPropagation();
            onChange(f.kind === 'radio' ? (on ? null : (mine ?? null)) : !on);
          }}
          className={cx(base, 'flex items-center justify-center', f.kind === 'radio' ? 'rounded-full' : 'rounded-[2px]')}
          style={box}
        >
          {on && (f.kind === 'radio' ? <span className="block rounded-full bg-[#111]" style={{ width: '45%', height: '45%' }} /> : <Check strokeWidth={3} className="text-[#111]" style={{ width: '85%', height: '85%' }} />)}
        </button>
      );
    }
    case 'dropdown': {
      const opts = f.options ?? [];
      const v = typeof value === 'string' ? value : '';
      if (f.editable)
        return (
          <Scaled box={box} font={fontSize} className="rounded-[2px]">
            {(inner) => (
              <>
                <input list={`fs-${f.name}`} value={v} disabled={off} aria-label={name} title={title} translate="no" onChange={(e) => onChange(e.target.value)} onClick={stop} className={cx(CONTROL, 'px-[0.25em]')} style={inner} />
                <datalist id={`fs-${f.name}`}>
                  {opts.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label ?? o.value}
                    </option>
                  ))}
                </datalist>
              </>
            )}
          </Scaled>
        );
      return (
        <Scaled box={box} font={fontSize} className="rounded-[2px]">
          {(inner) => (
            <select value={v} disabled={off} aria-label={name} title={title} translate="no" onChange={(e) => onChange(e.target.value || null)} onClick={stop} className={cx(CONTROL, 'px-[0.15em]')} style={inner}>
              {!opts.some((o) => o.value === v) && <option value="">{v}</option>}
              {opts.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label ?? o.value}
                </option>
              ))}
            </select>
          )}
        </Scaled>
      );
    }
    case 'list': {
      const v = Array.isArray(value) ? value : typeof value === 'string' && value ? [value] : [];
      return (
        <Scaled box={box} font={Math.max(6, 10 * k)} className="rounded-[2px]">
          {(inner) => (
            <select
              // Always a box of options: a single-choice one would show its first option chosen when none is.
              multiple
              size={Math.max(2, (f.options ?? []).length)}
              value={v}
              disabled={off}
              aria-label={name}
              title={title}
              translate="no"
              onChange={(e) => {
                const picked = Array.from(e.target.selectedOptions).map((o) => o.value);
                // One choice: the option just picked (or the one left).
                const fresh = picked.filter((x) => !v.includes(x));
                onChange(f.multiSelect ? picked : fresh.length ? [fresh[0]] : picked.slice(0, 1));
              }}
              onClick={stop}
              className={cx(CONTROL, 'overflow-auto [&>option:checked]:bg-[rgba(59,130,246,0.45)] [&>option:checked]:text-[#111]')}
              style={inner}
            >
              {(f.options ?? []).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label ?? o.value}
                </option>
              ))}
            </select>
          )}
        </Scaled>
      );
    }
    case 'signature':
      return f.signed ? null : (
        <button
          type="button"
          aria-label={`${tr('Sign')}: ${name}`}
          title={title}
          onClick={(e) => {
            e.stopPropagation();
            onSign();
          }}
          className={cx(base, 'flex items-center justify-center gap-1 rounded-[3px] border border-dashed border-[rgba(37,99,235,0.6)] text-[rgba(29,78,216,0.95)]')}
          style={{ ...box, fontSize: Math.max(9, Math.min(w.h * 0.45, 13) * k) }}
        >
          <Signature style={{ width: '1.2em', height: '1.2em' }} />
          <span>Sign here</span>
        </button>
      );
    default:
      return null;
  }
}

/** Moves (or sizes) a mark with the pointer, kept on its page; sizing keeps a picture's shape. */
function dragMark(e: React.PointerEvent, m: Mark, k: number, page: { width: number; height: number }, mode: 'move' | 'size', update: (id: string, p: Partial<Mark>) => void, box?: { w: number; h: number }) {
  e.preventDefault();
  e.stopPropagation();
  const sx = e.clientX;
  const sy = e.clientY;
  const o = { ...m };
  const bw = box?.w ?? m.w;
  const bh = box?.h ?? m.h;
  const move = (ev: PointerEvent) => {
    const dx = (ev.clientX - sx) / k;
    const dy = (ev.clientY - sy) / k;
    if (mode === 'move') update(m.id, { x: Math.max(0, Math.min(page.width - Math.min(bw, page.width), o.x + dx)), y: Math.max(0, Math.min(page.height - Math.min(bh, page.height), o.y + dy)) });
    else {
      const w = Math.max(8, Math.min(page.width - o.x, o.w + dx));
      update(m.id, { w, h: (w * o.h) / Math.max(1, o.w) });
    }
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
}

/** The small bar over a selected mark. */
function MarkBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute -top-10 left-0 z-10 flex items-center gap-0.5 rounded-[10px] border border-line bg-elevated p-0.5 shadow-lg max-md:-top-12" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      {children}
    </div>
  );
}

/** A text box placed on the page: typed in as it shows, moved by its handle, its size by A− and A+. */
function TextMark({
  m,
  k,
  page,
  selected,
  onSelect,
  update,
  remove,
}: {
  m: Mark;
  k: number;
  page: { width: number; height: number };
  selected: boolean;
  onSelect: () => void;
  update: (id: string, p: Partial<Mark>) => void;
  remove: (id: string) => void;
}) {
  const mobile = useIsMobile();
  const ref = useRef<HTMLTextAreaElement>(null);
  const size = m.size ?? 11;
  const fs = size * k;
  // Typed at 16px and scaled to the page (see Scaled): its size in those units, and as the page shows it.
  const sc = fs / 16;
  const lines = (m.text ?? '').split('\n');
  const w16 = Math.max(16 * 0.6, ...lines.map((l) => textWidth(l, 16))) + 4 / sc;
  const h16 = lines.length * 16 * LINE;
  const w = w16 * sc;
  const h = h16 * sc;
  // A new box is ready to type in.
  useEffect(() => {
    if (!m.text) ref.current?.focus();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const grip = mobile ? 28 : 18;
  return (
    <div className="absolute" style={{ left: m.x * k, top: m.y * k, width: w, height: h }} onClick={(e) => e.stopPropagation()}>
      <textarea
        ref={ref}
        value={m.text ?? ''}
        rows={lines.length}
        wrap="off"
        spellCheck={false}
        aria-label="Text on the page"
        translate="no"
        onFocus={onSelect}
        onChange={(e) => update(m.id, { text: e.target.value })}
        onBlur={() => !m.text?.trim() && remove(m.id)}
        onKeyDown={(e) => e.key === 'Escape' && ref.current?.blur()}
        className={cx('block resize-none overflow-hidden border-0 bg-transparent p-0 whitespace-pre text-[#111] outline-none', selected ? 'ring-1 ring-[rgba(37,99,235,0.8)]' : 'hover:ring-1 hover:ring-[rgba(37,99,235,0.35)]')}
        style={{ width: w16, height: h16, font: `16px/${LINE} ${PAPER_FONT}`, transform: `scale(${sc})`, transformOrigin: '0 0' }}
      />
      {selected && (
        <>
          <div
            role="button"
            aria-label="Move"
            title="Drag to move"
            className="absolute top-0 flex cursor-move touch-none items-center justify-center rounded-md bg-[rgba(37,99,235,0.9)] text-white"
            style={{ left: -grip - 3, width: grip, height: Math.max(grip, h) }}
            onPointerDown={(e) => dragMark(e, m, k, page, 'move', update, { w: w / k, h: h / k })}
          >
            <GripVertical size={14} />
          </div>
          <MarkBar>
            <IconButton label="Smaller" size="sm" disabled={size <= 5} onClick={() => update(m.id, { size: Math.max(5, size - 1) })} className={mobile ? 'h-9 w-9' : undefined}>
              <AArrowDown size={15} />
            </IconButton>
            <IconButton label="Larger" size="sm" disabled={size >= 48} onClick={() => update(m.id, { size: Math.min(48, size + 1) })} className={mobile ? 'h-9 w-9' : undefined}>
              <AArrowUp size={15} />
            </IconButton>
            <IconButton label="Delete" size="sm" onClick={() => remove(m.id)} className={mobile ? 'h-9 w-9' : undefined}>
              <Trash2 size={14} />
            </IconButton>
          </MarkBar>
        </>
      )}
    </div>
  );
}

/** A tick, cross or signature placed on the page: dragged to move, its corner to size it. */
function BoxMark({
  m,
  k,
  page,
  selected,
  onSelect,
  update,
  remove,
}: {
  m: Mark;
  k: number;
  page: { width: number; height: number };
  selected: boolean;
  onSelect: () => void;
  update: (id: string, p: Partial<Mark>) => void;
  remove: (id: string) => void;
}) {
  const mobile = useIsMobile();
  const handle = mobile ? 22 : 12;
  return (
    <div
      className={cx('absolute cursor-move touch-none', selected ? 'ring-1 ring-[rgba(37,99,235,0.8)]' : 'hover:ring-1 hover:ring-[rgba(37,99,235,0.35)]')}
      style={{ left: m.x * k, top: m.y * k, width: m.w * k, height: m.h * k }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => {
        onSelect();
        dragMark(e, m, k, page, 'move', update);
      }}
    >
      {m.type === 'image' ? (
        <img src={m.src} alt="" draggable={false} className="pointer-events-none h-full w-full object-contain select-none" />
      ) : (
        <svg viewBox="0 0 10 10" className="pointer-events-none h-full w-full" aria-hidden>
          {m.type === 'check' ? (
            <path d="M1.2 5 L4 8 L9 1.5" fill="none" stroke="#111" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          ) : (
            <path d="M1.5 1.5 L8.5 8.5 M1.5 8.5 L8.5 1.5" fill="none" stroke="#111" strokeWidth="1.1" strokeLinecap="round" />
          )}
        </svg>
      )}
      {selected && (
        <>
          <div
            role="button"
            aria-label="Resize"
            title="Drag to resize"
            className="absolute cursor-nwse-resize touch-none rounded-sm border-2 border-white bg-[rgba(37,99,235,0.95)]"
            style={{ width: handle, height: handle, right: -handle / 2, bottom: -handle / 2 }}
            onPointerDown={(e) => dragMark(e, m, k, page, 'size', update)}
          />
          <MarkBar>
            <IconButton label="Delete" size="sm" onClick={() => remove(m.id)} className={mobile ? 'h-9 w-9' : undefined}>
              <Trash2 size={14} />
            </IconButton>
          </MarkBar>
        </>
      )}
    </div>
  );
}
