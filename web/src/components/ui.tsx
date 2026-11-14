import { clsx } from 'clsx';
import { Check, ChevronDown, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { MARK_BOX, WaterOmega } from './Logo';
import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';

export const cx = clsx;

// ---- buttons ---------------------------------------------------------------------

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md'; icon?: ReactNode }>(
  function Button({ variant = 'secondary', size = 'md', icon, className, children, ...rest }, ref) {
    return (
      <button
        ref={ref}
        className={cx(
          'inline-flex items-center justify-center gap-1.5 rounded-[10px] font-medium whitespace-nowrap transition duration-150 select-none active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45',
          size === 'sm' ? 'h-8 px-3 text-[13px]' : 'h-9 px-4 text-[13.5px]',
          variant === 'primary' && 'bg-accent text-accent-fg hover:opacity-90',
          variant === 'secondary' && 'bg-bg-2 text-fg ring-1 ring-line-2 ring-inset hover:bg-bg-3',
          variant === 'ghost' && 'text-fg-2 hover:bg-bg-2 hover:text-fg',
          variant === 'subtle' && 'bg-bg-2 text-fg-2 hover:bg-bg-3 hover:text-fg',
          variant === 'danger' && 'bg-err text-white hover:opacity-90',
          className,
        )}
        {...rest}
      >
        {icon}
        {children}
      </button>
    );
  },
);

export const IconButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { label: string; size?: 'sm' | 'md'; active?: boolean }>(
  function IconButton({ label, size = 'md', active, className, children, ...rest }, ref) {
    return (
      <button
        ref={ref}
        aria-label={label}
        title={label}
        className={cx(
          'inline-flex shrink-0 items-center justify-center rounded-lg text-fg-3 transition duration-150 hover:bg-bg-2 hover:text-fg active:scale-95 disabled:pointer-events-none disabled:opacity-40',
          size === 'sm' ? 'h-7 w-7' : 'h-8.5 w-8.5',
          active && 'bg-bg-2 text-fg',
          className,
        )}
        {...rest}
      >
        {children}
      </button>
    );
  },
);

/** Loading: the app's mark at work, whole from the first frame: water rises and falls in the Ω, its surface a
 * moving wave. As tall as the text around it unless given a size (in px, for a page that is loading). */
export function Throbber({ className, size }: { className?: string; size?: number }) {
  const id = useId();
  return (
    <svg viewBox={MARK_BOX} className={cx('throbber', className)} style={size ? { width: size, height: size } : undefined} aria-hidden>
      <WaterOmega id={id} water="throbber-water" />
    </svg>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-line-2 bg-bg-2 px-1 py-px font-mono text-[10.5px] text-fg-3">{children}</kbd>;
}

export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'ok' | 'err' | 'warn' | 'info' | 'claude' | 'codex'; className?: string }) {
  return (
    <span
      className={cx(
        'inline-flex h-4.5 shrink-0 items-center rounded px-1.5 text-[10.5px] font-medium leading-none',
        tone === 'neutral' && 'bg-bg-3 text-fg-2',
        tone === 'ok' && 'bg-ok/15 text-ok',
        tone === 'err' && 'bg-err/15 text-err',
        tone === 'warn' && 'bg-warn/15 text-warn',
        tone === 'info' && 'bg-info/15 text-info',
        tone === 'claude' && 'bg-claude/15 text-claude',
        tone === 'codex' && 'bg-codex/15 text-codex',
        className,
      )}
    >
      {children}
    </span>
  );
}

// ---- popover ----------------------------------------------------------------------

export function useOutside(refs: RefObject<HTMLElement | null>[], onOutside: () => void, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const h = (e: PointerEvent) => {
      if (refs.some((r) => r.current?.contains(e.target as Node))) return;
      onOutside();
    };
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onOutside();
    document.addEventListener('pointerdown', h, true);
    document.addEventListener('keydown', k);
    return () => {
      document.removeEventListener('pointerdown', h, true);
      document.removeEventListener('keydown', k);
    };
  }, [active, onOutside, refs]);
}

// Open popovers and dialogs in the order they opened. One opened from inside a popover (the folder picker's
// suggestions inside the folder chip, the Guidelines dialog under Options) portals to <body>, so the popover
// can't see it as a DOM child; this stack lets each popover treat a click in a layer opened later as inside,
// not an outside click, and lets Escape close only the topmost.
const popoverStack: HTMLElement[] = [];

/** Puts an open popover or dialog on the stack, once per open, so re-renders (e.g. typing) never reorder it. */
function useStacked(node: RefObject<HTMLElement | null>, open: boolean) {
  useEffect(() => {
    if (!open) return;
    const el = node.current;
    if (!el) return;
    popoverStack.push(el);
    return () => {
      const i = popoverStack.indexOf(el);
      if (i >= 0) popoverStack.splice(i, 1);
    };
  }, [open, node]);
}

/** Whether nothing was opened over this layer since it opened. */
const onTop = (el: HTMLElement | null) => !el || popoverStack[popoverStack.length - 1] === el;

/** Closes a popover on a click outside it, its anchor, and any popover or dialog opened on top of it; Escape closes only the topmost. */
function usePopoverDismiss(node: RefObject<HTMLElement | null>, anchor: RefObject<HTMLElement | null>, onClose: () => void, open: boolean) {
  useStacked(node, open);

  useEffect(() => {
    if (!open) return;
    const h = (e: PointerEvent) => {
      const t = e.target as Node;
      const el = node.current;
      if (el?.contains(t) || anchor.current?.contains(t)) return;
      const i = el ? popoverStack.indexOf(el) : -1;
      for (let j = i + 1; j < popoverStack.length; j++) if (popoverStack[j].contains(t)) return; // inside a layer opened on top
      onClose();
    };
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onTop(node.current)) onClose();
    };
    document.addEventListener('pointerdown', h, true);
    document.addEventListener('keydown', k);
    return () => {
      document.removeEventListener('pointerdown', h, true);
      document.removeEventListener('keydown', k);
    };
  }, [open, onClose, node, anchor]);
}

/** Narrower than this, a `sheet` popover spans the screen. */
const SHEET_BELOW = 640;

/**
 * Inside it, a popover opens on a phone as a sheet from the bottom of the screen: across it, under a title,
 * clear of the keyboard, with the page dimmed behind (the start page's pickers). One opened from a sheet
 * (a setting under Options) goes over it, and closing it shows the one below again.
 */
export const SheetsOnPhone = createContext(false);

/** Whether a popover opened here would be a sheet from the bottom (SheetsOnPhone, on a phone). */
export function useSheets(): boolean {
  const sheets = useContext(SheetsOnPhone);
  return useMediaQuery(`(max-width: ${SHEET_BELOW - 1}px)`) && sheets;
}

/** Where the keyboard leaves room on a phone: how far a sheet's bottom sits above the screen's, and how tall it may be. */
function useKeyboardRoom(active: boolean): { bottom: number; height: number } | null {
  const [room, setRoom] = useState<{ bottom: number; height: number } | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!active || !vv) return;
    const r = () => setRoom({ bottom: Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)), height: Math.round(vv.height) });
    r();
    vv.addEventListener('resize', r);
    vv.addEventListener('scroll', r);
    return () => {
      vv.removeEventListener('resize', r);
      vv.removeEventListener('scroll', r);
    };
  }, [active]);
  return room;
}

/** A floating panel anchored to `anchor`; flips above when there is no room below (`slide`: moves up to fit whole). */
export function Popover({
  anchor,
  open,
  onClose,
  children,
  align = 'start',
  width,
  className,
  prefer = 'below',
  sheet,
  title,
  z,
  slide,
}: {
  anchor: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  align?: 'start' | 'end';
  width?: number;
  className?: string;
  prefer?: 'below' | 'above';
  /** On a phone, as wide as the screen with the page dimmed behind: a picker by the message box, which would otherwise sit off to one side over the conversation. */
  sheet?: boolean;
  /** What it picks, over a sheet from the bottom (SheetsOnPhone); a popover by its chip says it by where it is. */
  title?: ReactNode;
  /** Its stacking order, when it opens from a layer over the popovers' own (the search box). */
  z?: number;
  /** A menu at a point (a right-click): too tall for the room below, it moves up to show whole rather than scroll. */
  slide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const bottomSheet = useSheets();
  const room = useKeyboardRoom(open && bottomSheet);
  const [pos, setPos] = useState<{ top: number; left: number; maxH: number; width?: number } | null>(null);
  const place = useCallback(() => {
    const a = anchor.current?.getBoundingClientRect();
    const el = ref.current;
    if (!a || !el || bottomSheet) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const full = sheet && vw < SHEET_BELOW;
    const w = full ? vw - 16 : Math.min(width ?? el.offsetWidth, vw - 16);
    const h = el.scrollHeight;
    const below = vh - a.bottom - 8;
    const above = a.top - 8;
    if (slide && !full && h > below) {
      setPos({ top: Math.max(8, vh - h - 8), left: Math.max(8, Math.min(a.left, vw - w - 8)), maxH: vh - 16 });
      return;
    }
    const goAbove = prefer === 'above' ? above >= Math.min(h, 220) || above > below : below < Math.min(h, 260) && above > below;
    const maxH = Math.max(140, (goAbove ? above : below) - 6);
    const top = goAbove ? Math.max(8, a.top - Math.min(h, maxH) - 6) : a.bottom + 6;
    let left = align === 'end' ? a.right - w : a.left;
    left = Math.max(8, Math.min(left, vw - w - 8));
    setPos({ top, left, maxH, width: full ? w : undefined });
  }, [anchor, width, align, prefer, sheet, bottomSheet, slide]);
  useLayoutEffect(() => {
    if (!open) return setPos(null);
    if (bottomSheet) return;
    place();
    const r = () => place();
    window.addEventListener('resize', r);
    window.addEventListener('scroll', r, true);
    // Content that loads after opening (a list arriving) changes the size: place it again.
    const ro = new ResizeObserver(r);
    if (ref.current) ro.observe(ref.current);
    return () => {
      window.removeEventListener('resize', r);
      window.removeEventListener('scroll', r, true);
      ro.disconnect();
    };
  }, [open, place, bottomSheet]);
  usePopoverDismiss(ref, anchor as RefObject<HTMLElement | null>, onClose, open);
  if (!open) return null;
  // The part of the app it opened from (an editor's data-i18n), so its words are translated as they mean there.
  const part = anchor.current?.closest('[data-i18n]')?.getAttribute('data-i18n') ?? undefined;
  if (bottomSheet) {
    // The dimmed page belongs to the sheet: a tap there closes this one, not one it was opened from.
    const kb = !!room && room.bottom > 0;
    return createPortal(
      <div ref={ref} role="dialog" aria-modal data-i18n={part} className="fixed inset-0 z-50" style={z ? { zIndex: z } : undefined}>
        <div className="absolute inset-0 touch-none bg-black/40" onClick={onClose} aria-hidden />
        <div
          style={{ bottom: room?.bottom ?? 0, maxHeight: room ? `calc(${room.height}px - var(--safe-top) - 12px)` : undefined }}
          className="absolute inset-x-0 flex max-h-[calc(100dvh-var(--safe-top)-12px)] flex-col rounded-t-[20px] border border-b-0 border-line bg-elevated shadow-lg"
        >
          <div className="flex shrink-0 items-center gap-2 pt-2.5 pr-2.5 pb-1 pl-4">
            <div className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-tight">{title}</div>
            <IconButton label="Close" onClick={onClose}>
              <X size={18} />
            </IconButton>
          </div>
          <div className={cx('min-h-0 flex-1 overflow-y-auto overscroll-contain px-2', kb ? 'pb-2' : 'pb-[max(12px,var(--safe-bottom))]', className)}>{children}</div>
        </div>
      </div>,
      document.body,
    );
  }
  // A tap on the dimmed page closes it, as anywhere outside does.
  const dim = sheet && window.innerWidth < SHEET_BELOW;
  return createPortal(
    <>
      {dim && <div className="fixed inset-0 z-50 bg-black/30" style={z ? { zIndex: z } : undefined} aria-hidden />}
      <div
        ref={ref}
        role="dialog"
        data-i18n={part}
        style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: pos?.width ?? width, maxHeight: pos?.maxH, zIndex: z }}
        className={cx('fixed z-50 overflow-y-auto rounded-xl border border-line bg-elevated p-1 shadow-lg', className)}
      >
        {children}
      </div>
    </>,
    document.body,
  );
}

export function MenuItem({
  icon,
  children,
  hint,
  onClick,
  danger,
  checked,
  disabled,
  submenu,
}: {
  icon?: ReactNode;
  children: ReactNode;
  hint?: ReactNode;
  onClick?: () => void;
  danger?: boolean;
  checked?: boolean;
  disabled?: boolean;
  /** It opens a submenu in the menu's place: a chevron at its end. */
  submenu?: boolean;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={cx(
        'flex h-8.5 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13.5px] transition-colors disabled:opacity-40',
        danger ? 'text-err hover:bg-err/10' : 'text-fg hover:bg-bg-2',
      )}
    >
      <span className="flex w-4 shrink-0 items-center justify-center text-fg-3">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint && <span className="shrink-0 text-[11.5px] text-fg-3">{hint}</span>}
      {checked && <Check size={14} className="shrink-0 text-fg" strokeWidth={2.5} />}
      {submenu && <ChevronRight size={14} className="shrink-0 text-fg-3" />}
    </button>
  );
}

/** The top of a submenu shown in its menu's place: its title, which goes back. */
export function MenuBack({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <>
      <MenuItem icon={<ChevronLeft size={15} />} onClick={onClick}>
        <span className="font-medium">{children}</span>
      </MenuItem>
      <MenuSep />
    </>
  );
}

export function MenuSep() {
  return <div className="mx-1.5 my-1 h-px bg-line" />;
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <div className="px-2.5 pt-2 pb-1 text-[11.5px] font-medium text-fg-3">{children}</div>;
}

/** Compact option row for pickers: one line, name + value, description as tooltip. */
export function OptionRow({ label, hint, selected, onClick, icon }: { label: ReactNode; hint?: string; selected?: boolean; onClick: () => void; icon?: ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={hint}
      className={cx('flex w-full items-start gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-bg-2', selected && 'bg-bg-2')}
    >
      {icon && <span className="mt-0.5 shrink-0 text-fg-3">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] text-fg">{label}</span>
        {hint && <span className="block truncate text-[11.5px] text-fg-3">{hint}</span>}
      </span>
      {selected && <Check size={14} className="mt-1 shrink-0" strokeWidth={2.5} />}
    </button>
  );
}

/** A chip that opens a picker popover; with `label`, a setting that names itself ("Model  Opus 5.5"). */
export function Picker({
  icon,
  label,
  value,
  title,
  children,
  width = 260,
  disabled,
  className,
}: {
  icon?: ReactNode;
  label?: string;
  value: ReactNode;
  title: string;
  children: (close: () => void) => ReactNode;
  width?: number;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  if (label)
    return (
      <>
        <SettingChip ref={ref} label={label} icon={icon} value={value} title={title} open={open} disabled={disabled} onClick={() => setOpen((o) => !o)} className={className} />
        <Popover anchor={ref} open={open} onClose={close} width={width} title={label}>
          {children(close)}
        </Popover>
      </>
    );
  return (
    <>
      <button
        ref={ref}
        type="button"
        disabled={disabled}
        title={title}
        onClick={() => setOpen((o) => !o)}
        className={cx(
          'inline-flex h-8 max-w-[11rem] min-w-0 shrink-0 items-center gap-1.5 rounded-lg px-2 text-[13px] text-fg-2 transition-colors hover:bg-bg-2 hover:text-fg disabled:opacity-50',
          open && 'bg-bg-2 text-fg',
          className,
        )}
      >
        {icon}
        <span className="truncate">{value}</span>
        <ChevronDown size={12} className="shrink-0 opacity-60 max-md:hidden" />
      </button>
      <Popover anchor={ref} open={open} onClose={close} width={width} prefer="above" sheet>
        {children(close)}
      </Popover>
    </>
  );
}

/**
 * How the setting chips inside it show: named (the default), `bare` where the icon and value say enough
 * (the start page's row: the name is left to screen readers), or as the `row`s of a list of settings.
 */
export const SettingLayout = createContext<'chip' | 'bare' | 'row'>('chip');

/**
 * A setting of a new session, as the start page lists them: what it is, then what it is set to, and a
 * menu on click ("Folder  New task folder ⌄"). The name is quieter, so the values read first; `on` marks a
 * value that is not the usual one (no memory, a spending cap).
 */
export const SettingChip = forwardRef<
  HTMLButtonElement,
  { label: string; value: ReactNode; icon?: ReactNode; title?: string; open?: boolean; on?: boolean; disabled?: boolean; onClick: () => void; className?: string }
>(function SettingChip({ label, value, icon, title, open, on, disabled, onClick, className }, ref) {
  const layout = useContext(SettingLayout);
  if (layout === 'row')
    return (
      <button
        ref={ref}
        type="button"
        title={title}
        disabled={disabled}
        onClick={onClick}
        aria-expanded={open}
        className={cx(
          'flex h-9 w-full min-w-0 items-center gap-2 rounded-lg px-2.5 text-left text-[13.5px] transition-colors hover:bg-bg-2 disabled:opacity-50 max-sm:h-11 max-sm:text-[14.5px]',
          open && 'bg-bg-2',
          className,
        )}
      >
        {icon && <span className="flex shrink-0 text-fg-3">{icon}</span>}
        <span className="shrink-0 text-fg-2">{label}</span>
        <span className={cx('ml-auto min-w-0 truncate pl-3 font-medium', on ? 'text-accent' : 'text-fg')}>{value}</span>
        <ChevronDown size={12} className={cx('shrink-0 text-fg-3 transition-transform duration-200', open && 'rotate-180')} />
      </button>
    );
  const bare = layout === 'bare';
  return (
    <button
      ref={ref}
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      aria-expanded={open}
      className={cx(
        'group inline-flex h-8 max-w-[min(100%,18rem)] min-w-0 shrink-0 items-center gap-1.5 rounded-lg px-2 text-[13px] transition-colors hover:bg-bg-2 disabled:opacity-50',
        open && 'bg-bg-2',
        className,
      )}
    >
      {icon && <span className="flex shrink-0 text-fg-3">{icon}</span>}
      <span className={bare ? 'sr-only' : 'shrink-0 text-fg-3'}>{label}</span>
      <span className={cx('truncate transition-colors', !bare && 'font-medium', on ? 'text-accent' : 'text-fg-2 group-hover:text-fg', open && !on && 'text-fg')}>{value}</span>
      <ChevronDown size={12} className={cx('-ml-0.5 shrink-0 text-fg-3 transition-transform duration-200', open && 'rotate-180')} />
    </button>
  );
});

// ---- dialog --------------------------------------------------------------------------

export function Dialog({
  open,
  onClose,
  title,
  children,
  width = 520,
  footer,
  part,
  bare,
  label,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  width?: number;
  footer?: ReactNode;
  /** The part of the app it belongs to (an editor's data-i18n), so its words are translated as they mean there: it opens outside that part. */
  part?: string;
  /** Its children lay out the whole of it, edge to edge (their own title, close button, scrolling and buttons): no title row, padding or footer of its own. */
  bare?: boolean;
  /** What it is, for screen readers, when it has no title. */
  label?: string;
}) {
  // On the popovers' stack: a dialog opened from a popover (Options → Guidelines) is over it, so a click in it
  // isn't a click outside the popover, which would close the popover and the dialog inside it.
  const ref = useRef<HTMLDivElement>(null);
  useStacked(ref, open);
  // A tap on the dimmed page closes it on the tap's click, not as it goes down, so that click can't land on
  // what was under it (the Options sheet on a phone); a press that began in the dialog (selecting text) doesn't.
  const pressed = useRef(false);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onTop(ref.current) && onClose();
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div
      ref={ref}
      data-i18n={part}
      className="scrim fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
      onPointerDown={(e) => (pressed.current = e.target === e.currentTarget)}
      onClick={(e) => pressed.current && e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal
        aria-label={label}
        style={{ maxWidth: width }}
        className={cx('flex max-h-[92dvh] w-full flex-col rounded-t-[20px] border border-line bg-elevated shadow-lg sm:rounded-[20px]', bare && 'overflow-hidden')}
      >
        {bare ? children : title && (
          <div className="flex items-center gap-2 px-5 pt-4 pb-1">
            <div className="min-w-0 flex-1 truncate text-[16px] font-semibold tracking-tight">{title}</div>
            <IconButton label="Close" size="sm" onClick={onClose}>
              <X size={16} />
            </IconButton>
          </div>
        )}
        {!bare && <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">{children}</div>}
        {!bare && footer && <div className="flex items-center justify-end gap-2 px-5 pt-2 pb-[max(16px,var(--safe-bottom))]">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/**
 * A panel over the right side of the page, full screen on a phone (a background task opens in one): the page dims behind
 * it, a tap there or Escape closes it, and a dialog opened from it (a confirmation) goes over it. Its children lay out
 * the whole of it: their own header, scrolling and buttons.
 */
export function Sheet({ open, onClose, children, label, width = 560 }: { open: boolean; onClose: () => void; children: ReactNode; label: string; width?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useStacked(ref, open);
  // As Dialog: a tap on the dimmed page closes on its click, and a press that began inside (selecting text) does not.
  const pressed = useRef(false);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onTop(ref.current) && onClose();
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div
      ref={ref}
      className="scrim fixed inset-0 z-50 flex justify-end [--scrim:0.26]"
      onPointerDown={(e) => (pressed.current = e.target === e.currentTarget)}
      onClick={(e) => pressed.current && e.target === e.currentTarget && onClose()}
    >
      <div role="dialog" aria-modal aria-label={label} style={{ '--sheet-w': `${width}px` } as CSSProperties} className="flex h-full w-full flex-col overflow-hidden border-l border-line bg-bg shadow-lg sm:max-w-[var(--sheet-w)] max-sm:border-l-0">
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function useConfirm() {
  const [state, setState] = useState<{ title: string; body?: ReactNode; confirm: string; danger?: boolean; resolve: (ok: boolean) => void } | null>(null);
  const ask = useCallback(
    (o: { title: string; body?: ReactNode; confirm?: string; danger?: boolean }) =>
      new Promise<boolean>((resolve) => setState({ title: o.title, body: o.body, confirm: o.confirm ?? 'OK', danger: o.danger, resolve })),
    [],
  );
  const close = (ok: boolean) => {
    state?.resolve(ok);
    setState(null);
  };
  const node = (
    <Dialog
      open={!!state}
      onClose={() => close(false)}
      title={state?.title}
      width={420}
      footer={
        <>
          <Button variant="ghost" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button variant={state?.danger ? 'danger' : 'primary'} onClick={() => close(true)} autoFocus>
            {state?.confirm}
          </Button>
        </>
      }
    >
      <div className="text-[14px] leading-relaxed text-fg-2">{state?.body}</div>
    </Dialog>
  );
  return [ask, node] as const;
}

// ---- segmented ------------------------------------------------------------------------

export function Segmented<T extends string>({ value, options, onChange, size = 'md' }: { value: T; options: { value: T; label: ReactNode; icon?: ReactNode }[]; onChange: (v: T) => void; size?: 'sm' | 'md' }) {
  // The chosen option's pill glides to the next one (placed at once the first time).
  const box = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ x: number; w: number; glide: boolean } | null>(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const place = () => {
      const b = [...el.querySelectorAll<HTMLElement>('[data-seg]')].find((x) => x.dataset.seg === value);
      if (b) setPill((p) => ({ x: b.offsetLeft, w: b.offsetWidth, glide: !!p }));
      else setPill(null);
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(el);
    return () => ro.disconnect();
  }, [value, options.length]);
  return (
    <div ref={box} className="relative inline-flex rounded-[10px] bg-bg-2 p-0.5">
      {pill && (
        <span
          aria-hidden
          className={cx('absolute top-0.5 bottom-0.5 left-0 rounded-lg bg-panel shadow-[0_1px_2px_rgba(0,0,0,0.12)] ring-1 ring-line', pill.glide && 'transition-[translate,width] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]')}
          style={{ translate: `${pill.x}px 0`, width: pill.w }}
        />
      )}
      {options.map((o) => (
        <button
          key={o.value}
          data-seg={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cx(
            'relative inline-flex items-center gap-1.5 rounded-lg font-medium transition-colors duration-200',
            size === 'sm' ? 'h-7 px-2.5 text-[12.5px]' : 'h-8 px-3 text-[13px]',
            value === o.value ? 'text-fg' : 'text-fg-3 hover:text-fg',
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** An on/off toggle. */
export function Switch({ on, onChange, label, disabled, className }: { on: boolean; onChange: (on: boolean) => void; label: string; disabled?: boolean; className?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={cx('relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 disabled:opacity-40', on ? 'bg-accent' : 'bg-fg/20', className)}
    >
      <span className={cx('inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200', on ? 'translate-x-[18px]' : 'translate-x-0.5')} />
    </button>
  );
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 px-6 py-14 text-center">
      {icon && <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-2xl bg-bg-2 text-fg-3">{icon}</div>}
      <div className="text-[15px] font-medium text-fg">{title}</div>
      {children && <div className="max-w-sm text-[13.5px] leading-relaxed text-fg-3">{children}</div>}
    </div>
  );
}

export function useMediaQuery(q: string): boolean {
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const h = () => setM(mq.matches);
    // The query itself can change (it may depend on other state): take its answer now.
    h();
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, [q]);
  return m;
}

export const useIsMobile = () => !useMediaQuery('(min-width: 768px)');

// ---- page building blocks -------------------------------------------------------------

/**
 * Underline tabs for page and panel headers. `dense`: closer together and taller, for a phone. `fold`: the tabs that
 * do not fit the row's width go under one at its end, More (named after the open tab when that is one of them), whose
 * menu lists them with their icons; without it, a row too long scrolls sideways, keeping the open tab in view.
 */
export function Tabs<T extends string>({
  value,
  options,
  onChange,
  className,
  dense,
  fold,
}: {
  value: T;
  options: { value: T; label: ReactNode; count?: ReactNode; icon?: ReactNode }[];
  onChange: (v: T) => void;
  className?: string;
  dense?: boolean;
  fold?: boolean;
}) {
  const row = useRef<HTMLDivElement>(null);
  const ruler = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const [fits, setFits] = useState(options.length);
  const [menu, setMenu] = useState(false);
  const n = options.length;
  const at = options.findIndex((o) => o.value === value);
  const shown = fold ? Math.min(fits, n) : n;
  const folded = options.slice(shown);
  const openFolded = at >= shown ? options[at] : undefined;
  const words = options.map((o) => `${o.value}:${typeof o.label === 'string' ? o.label : ''}:${o.count ?? ''}`).join('|');
  // Its menu closes when More goes (a wider window, where every tab fits), so it does not open again by itself.
  useEffect(() => {
    if (!folded.length) setMenu(false);
  }, [folded.length]);

  // How many fit before More: each tab's width as drawn (the ruler, out of sight in the row), the last one's (More,
  // or the open tab when it is folded) and the gaps, against the row's width; again when either changes size (a
  // narrower window, the words translated, the font arriving).
  useLayoutEffect(() => {
    const box = row.current;
    const kids = ruler.current ? ([...ruler.current.children] as HTMLElement[]) : [];
    if (!fold || !box || kids.length !== 2 * n + 1) return;
    const measure = () => {
      const w = kids.map((k) => k.getBoundingClientRect().width);
      const gap = parseFloat(getComputedStyle(box).columnGap) || 0;
      const room = box.clientWidth + 0.5;
      const width = (k: number) => {
        const tabs = w.slice(0, k).reduce((a, b) => a + b, 0);
        return k === n ? tabs + gap * (n - 1) : tabs + (at >= k ? w[n + at] : w[2 * n]) + gap * k;
      };
      let k = n;
      while (k > 0 && width(k) > room) k--;
      setFits(k);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    for (const k of kids) ro.observe(k);
    return () => ro.disconnect();
  }, [fold, n, at, words]);

  // A row that scrolls: the open tab in view (an address that opens the last of many, on a phone).
  useLayoutEffect(() => {
    const box = row.current;
    const t = box?.querySelector<HTMLElement>(':scope > [aria-selected="true"]');
    if (!box || !t || box.scrollWidth <= box.clientWidth) return;
    if (t.offsetLeft < box.scrollLeft) box.scrollLeft = t.offsetLeft - 8;
    else if (t.offsetLeft + t.offsetWidth > box.scrollLeft + box.clientWidth) box.scrollLeft = t.offsetLeft + t.offsetWidth - box.clientWidth + 8;
  }, [value, shown]);

  const tabCls = (on: boolean) =>
    cx('relative flex shrink-0 items-center gap-1.5 text-[13.5px] font-medium whitespace-nowrap transition-colors', dense ? 'h-10 px-2' : 'h-9 px-2.5', on ? 'text-fg' : 'text-fg-3 hover:text-fg-2');
  const count = (o: (typeof options)[number]) =>
    o.count != null && o.count !== 0 && <span className="tnum rounded-md bg-bg-2 px-1.5 text-[11.5px] font-normal text-fg-3">{o.count}</span>;
  // The open tab's line, on the bottom edge (over the header's border when the row overlaps it).
  const line = <span className={cx('absolute bottom-0 h-[2px] rounded-full bg-fg', dense ? 'inset-x-1.5' : 'inset-x-2')} />;
  const chevron = <ChevronDown size={14} className="-mr-0.5 shrink-0 text-fg-3" />;
  return (
    <>
      <div
        ref={row}
        role="tablist"
        className={cx('relative flex items-end overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden', dense ? 'gap-0' : 'gap-1', className)}
      >
        {options.slice(0, shown).map((o) => (
          <button key={o.value} role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)} className={tabCls(value === o.value)}>
            {o.label}
            {count(o)}
            {value === o.value && line}
          </button>
        ))}
        {folded.length > 0 && (
          <button
            ref={moreRef}
            role="tab"
            aria-selected={!!openFolded}
            aria-haspopup="menu"
            aria-expanded={menu}
            onClick={() => setMenu((m) => !m)}
            className={tabCls(!!openFolded || menu)}
          >
            {openFolded ? openFolded.label : 'More'}
            {chevron}
            {openFolded && line}
          </button>
        )}
        {/* Each tab as a tab, each as the last one (with its chevron) and More: measured, never seen. */}
        {fold && (
          <div ref={ruler} aria-hidden className="pointer-events-none invisible absolute top-0 left-0 flex h-0 w-0 overflow-hidden">
            {options.map((o) => (
              <span key={`tab-${o.value}`} className={tabCls(false)}>
                {o.label}
                {count(o)}
              </span>
            ))}
            {options.map((o) => (
              <span key={`last-${o.value}`} className={tabCls(false)}>
                {o.label}
                {chevron}
              </span>
            ))}
            <span className={tabCls(false)}>
              <span>More</span>
              {chevron}
            </span>
          </div>
        )}
      </div>
      {folded.length > 0 && (
        <Popover anchor={moreRef} open={menu} onClose={() => setMenu(false)} align="end" width={230}>
          {folded.map((o) => (
            <MenuItem
              key={o.value}
              icon={o.icon}
              hint={o.count != null && o.count !== 0 ? o.count : undefined}
              checked={o.value === value}
              onClick={() => {
                setMenu(false);
                onChange(o.value);
              }}
            >
              {o.label}
            </MenuItem>
          ))}
        </Popover>
      )}
    </>
  );
}

/** A titled group of content on a page. */
export function Section({ title, sub, actions, children, className }: { title?: ReactNode; sub?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('rounded-2xl border border-line bg-panel', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 pt-4">
          {/* Actions move below the title when there is not room beside it. */}
          <div className="min-w-[min(100%,240px)] flex-1">
            {title && <h2 className="text-[14.5px] font-semibold">{title}</h2>}
            {sub && <div className="text-[12.5px] text-fg-3">{sub}</div>}
          </div>
          {actions}
        </header>
      )}
      <div className="px-5 pt-3 pb-4">{children}</div>
    </section>
  );
}

export const inputCls =
  'h-9.5 w-full rounded-[10px] border border-line-2 bg-bg-1 px-3 text-[14px] outline-none transition-colors placeholder:text-fg-3 focus:border-accent/60 focus:ring-3 focus:ring-accent/15';
