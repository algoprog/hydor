import { clsx } from 'clsx';
import { Check, ChevronDown, X } from 'lucide-react';
import {
  forwardRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
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

export function Dots({ className }: { className?: string }) {
  return (
    <span className={cx('dots', className)} aria-hidden>
      <span />
      <span />
      <span />
    </span>
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

// Open popovers in the order they opened. A popover nested inside another (e.g. the folder picker's
// suggestions inside the folder chip) portals to <body>, so the outer one can't see it as a DOM child;
// this stack lets each popover treat a click in a later-opened popover as inside, not an outside click.
const popoverStack: HTMLElement[] = [];

/** Closes a popover on a click outside it, its anchor, and any popover opened on top of it; Escape closes only the topmost. */
function usePopoverDismiss(node: RefObject<HTMLElement | null>, anchor: RefObject<HTMLElement | null>, onClose: () => void, open: boolean) {
  // Register in open order once per open, so re-renders (e.g. typing) never reorder the nesting stack.
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

  useEffect(() => {
    if (!open) return;
    const h = (e: PointerEvent) => {
      const t = e.target as Node;
      const el = node.current;
      if (el?.contains(t) || anchor.current?.contains(t)) return;
      const i = el ? popoverStack.indexOf(el) : -1;
      for (let j = i + 1; j < popoverStack.length; j++) if (popoverStack[j].contains(t)) return; // inside a popover opened on top
      onClose();
    };
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && (!node.current || popoverStack[popoverStack.length - 1] === node.current)) onClose();
    };
    document.addEventListener('pointerdown', h, true);
    document.addEventListener('keydown', k);
    return () => {
      document.removeEventListener('pointerdown', h, true);
      document.removeEventListener('keydown', k);
    };
  }, [open, onClose, node, anchor]);
}

/** A floating panel anchored to `anchor`; flips above when there is no room below. */
export function Popover({
  anchor,
  open,
  onClose,
  children,
  align = 'start',
  width,
  className,
  prefer = 'below',
}: {
  anchor: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  align?: 'start' | 'end';
  width?: number;
  className?: string;
  prefer?: 'below' | 'above';
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; maxH: number } | null>(null);
  const place = useCallback(() => {
    const a = anchor.current?.getBoundingClientRect();
    const el = ref.current;
    if (!a || !el) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = Math.min(width ?? el.offsetWidth, vw - 16);
    const h = el.scrollHeight;
    const below = vh - a.bottom - 8;
    const above = a.top - 8;
    const goAbove = prefer === 'above' ? above >= Math.min(h, 220) || above > below : below < Math.min(h, 260) && above > below;
    const maxH = Math.max(140, (goAbove ? above : below) - 6);
    const top = goAbove ? Math.max(8, a.top - Math.min(h, maxH) - 6) : a.bottom + 6;
    let left = align === 'end' ? a.right - w : a.left;
    left = Math.max(8, Math.min(left, vw - w - 8));
    setPos({ top, left, maxH });
  }, [anchor, width, align, prefer]);
  useLayoutEffect(() => {
    if (!open) return setPos(null);
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
  }, [open, place]);
  usePopoverDismiss(ref, anchor as RefObject<HTMLElement | null>, onClose, open);
  if (!open) return null;
  return createPortal(
    <div
      ref={ref}
      role="dialog"
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width, maxHeight: pos?.maxH }}
      className={cx('anim-pop fixed z-50 overflow-y-auto rounded-xl border border-line bg-elevated p-1 shadow-lg', className)}
    >
      {children}
    </div>,
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
}: {
  icon?: ReactNode;
  children: ReactNode;
  hint?: ReactNode;
  onClick?: () => void;
  danger?: boolean;
  checked?: boolean;
  disabled?: boolean;
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
    </button>
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

/** A chip that opens a picker popover. */
export function Picker({
  icon,
  value,
  title,
  children,
  width = 260,
  disabled,
  className,
}: {
  icon?: ReactNode;
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
        <ChevronDown size={12} className="shrink-0 opacity-60" />
      </button>
      <Popover anchor={ref} open={open} onClose={close} width={width} prefer="above">
        {children(close)}
      </Popover>
    </>
  );
}

// ---- dialog --------------------------------------------------------------------------

export function Dialog({
  open,
  onClose,
  title,
  children,
  width = 520,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  width?: number;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="anim-overlay fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        role="dialog"
        aria-modal
        style={{ maxWidth: width }}
        className="anim-pop flex max-h-[92dvh] w-full flex-col rounded-t-[20px] border border-line bg-elevated shadow-lg sm:rounded-[20px]"
      >
        {title && (
          <div className="flex items-center gap-2 px-5 pt-4 pb-1">
            <div className="min-w-0 flex-1 truncate text-[16px] font-semibold tracking-tight">{title}</div>
            <IconButton label="Close" size="sm" onClick={onClose}>
              <X size={16} />
            </IconButton>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 px-5 pt-2 pb-[max(16px,var(--safe-bottom))]">{footer}</div>}
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
  return (
    <div className="inline-flex rounded-[10px] bg-bg-2 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cx(
            'inline-flex items-center gap-1.5 rounded-lg font-medium transition-colors',
            size === 'sm' ? 'h-7 px-2.5 text-[12.5px]' : 'h-8 px-3 text-[13px]',
            value === o.value ? 'bg-panel text-fg shadow-[0_1px_2px_rgba(0,0,0,0.12)] ring-1 ring-line' : 'text-fg-3 hover:text-fg',
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

/** Underline tabs for page and panel headers. */
export function Tabs<T extends string>({ value, options, onChange, className }: { value: T; options: { value: T; label: ReactNode; count?: ReactNode }[]; onChange: (v: T) => void; className?: string }) {
  return (
    <div role="tablist" className={cx('flex items-end gap-1 overflow-x-auto [&::-webkit-scrollbar]:hidden', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'relative flex h-9 shrink-0 items-center gap-1.5 px-2.5 text-[13.5px] font-medium transition-colors',
            value === o.value ? 'text-fg' : 'text-fg-3 hover:text-fg-2',
          )}
        >
          {o.label}
          {o.count != null && o.count !== 0 && <span className="tnum rounded-md bg-bg-2 px-1.5 text-[11.5px] font-normal text-fg-3">{o.count}</span>}
          {value === o.value && <span className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-fg" />}
        </button>
      ))}
    </div>
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
