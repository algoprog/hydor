// The parts every Settings section is built from, so that they all read alike: a section is a stack of groups,
// each a short title over one box of rows; a row is one setting (its name, at most a short line on what it does,
// and its control at the end), or one thing in a list (an account, a server, a note). What takes more words to
// explain sits behind the (i) beside a setting's name, and the guide has the rest. A section's main switch or
// button goes beside its title (SectionActions), its rarer actions in one ⋯ menu (MoreMenu).
import { createContext, useContext, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, CircleAlert, Info as InfoIcon, MoreHorizontal, TriangleAlert } from 'lucide-react';
import { cx, IconButton, Popover } from '../../components/ui';

/** Groups of a section, one under another, spaced alike. */
export function Stack({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('space-y-7', className)}>{children}</div>;
}

/**
 * A group of settings: its title (and at most a short line under it, the longer story behind `info`) over one box
 * of rows. `actions` sit at the title's end: a small button that adds to the group's list, a ⋯ menu. `bare` leaves
 * the box out, for what lays itself out (cards, a gallery, a text field of its own).
 */
export function Group({
  title,
  hint,
  info,
  actions,
  children,
  bare,
  className,
}: {
  title?: ReactNode;
  hint?: ReactNode;
  /** The longer story of the whole group, behind an (i) beside its title. */
  info?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  bare?: boolean;
  className?: string;
}) {
  return (
    <section className={cx('min-w-0', className)}>
      {(title || actions) && (
        <header className="mb-2 flex min-h-8 items-end gap-3 px-1">
          <div className="min-w-0 flex-1">
            {title && (
              <h3 className="flex items-center gap-1 text-[13px] font-semibold text-fg-2">
                <span className="min-w-0">{title}</span>
                {info && <Info>{info}</Info>}
              </h3>
            )}
            {hint && <p className="mt-0.5 text-[12.5px] leading-snug text-fg-3">{hint}</p>}
          </div>
          {actions && <div className="-mb-0.5 flex shrink-0 items-center gap-1">{actions}</div>}
        </header>
      )}
      {bare ? children : <div className="divide-y divide-line rounded-xl border border-line bg-panel">{children}</div>}
    </section>
  );
}

/**
 * One setting, or one thing in a list: an icon in a tile (for things: an account, a server), its name, at most a
 * short line on what it does or how it is, and its control at the end. `info` is the longer story, behind an (i)
 * beside the name. `children` show under it, lined up with its name: a status, the setting's own parts. With
 * `onClick` the whole row opens something (a page, a dialog), with a chevron at its end.
 */
export function Row({
  icon,
  label,
  hint,
  info,
  control,
  children,
  onClick,
  disabled,
  className,
}: {
  icon?: ReactNode;
  label: ReactNode;
  hint?: ReactNode;
  info?: ReactNode;
  control?: ReactNode;
  children?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  // The name and its line keep at least 9rem beside the control: a switch or a small button stays on the row's
  // line on a phone; a wide control (a Segmented of four) goes under them, lined up with the name.
  const text = (
    <div className="min-w-[min(100%,9rem)] flex-1">
      <div className="flex min-h-5 items-center gap-1 text-[14px] leading-snug text-fg">
        <span className="min-w-0 break-words">{label}</span>
        {info && <Info>{info}</Info>}
      </div>
      {hint && <div className="mt-0.5 text-[12.5px] leading-snug break-words text-fg-3">{hint}</div>}
    </div>
  );
  const tile = icon && <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-bg-2 text-fg-2">{icon}</span>;
  if (onClick) {
    // A row that opens something, as a button that may hold buttons of its own (its (i), a control): a click on one
    // of those, or in its (i)'s popover (React passes that up through the portal, from outside the row), is theirs.
    const own = (e: { target: EventTarget; currentTarget: HTMLElement }) => {
      const t = e.target as HTMLElement;
      const inner = t.closest?.('button, a, input, select, textarea');
      return e.currentTarget.contains(t) && (!inner || inner === e.currentTarget);
    };
    const button = (
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled || undefined}
        onClick={(e) => !disabled && own(e) && onClick()}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget && !disabled) {
            e.preventDefault();
            onClick();
          }
        }}
        className={cx(
          'flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors outline-none select-none hover:bg-bg-1 focus-visible:bg-bg-1',
          disabled && 'pointer-events-none opacity-50',
          children ? 'group-first/row:rounded-t-[11px]' : 'first:rounded-t-[11px] last:rounded-b-[11px]',
          !children && className,
        )}
      >
        {tile}
        {text}
        {control && <span className="flex shrink-0 items-center gap-2 text-[13px] text-fg-3">{control}</span>}
        <ChevronRight size={16} className="shrink-0 text-fg-3" />
      </div>
    );
    if (!children) return button;
    // What it opened shows under it (a chat's pairing code), lined up with its name.
    return (
      <div className={cx('group/row', className)}>
        {button}
        <div className={cx('pr-4 pb-3', icon ? 'pl-[60px]' : 'pl-4')}>{children}</div>
      </div>
    );
  }
  return (
    <div className={cx('flex gap-3 px-4 py-3', children ? 'items-start' : 'items-center', disabled && 'opacity-50', className)}>
      {tile}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {text}
          {control && <div className="flex shrink-0 flex-wrap items-center gap-2">{control}</div>}
        </div>
        {children && <div className="mt-2.5">{children}</div>}
      </div>
    </div>
  );
}

/** The longer story of a setting, behind a small (i) beside its name: a click shows it. */
export function Info({ children, label = 'More about this' }: { children: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={ref}
        type="button"
        aria-label={label}
        title={label}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className={cx('inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-fg-3 transition-colors hover:bg-bg-2 hover:text-fg', open && 'bg-bg-2 text-fg')}
      >
        <InfoIcon size={13} />
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={320}>
        <div className="space-y-2 px-2.5 py-2 text-[13px] leading-relaxed text-fg-2">{children}</div>
      </Popover>
    </>
  );
}

const TONE = {
  info: { box: 'bg-bg-1 text-fg-2 ring-1 ring-line ring-inset', icon: InfoIcon },
  ok: { box: 'bg-ok/10 text-ok', icon: CheckCircle2 },
  warn: { box: 'bg-warn/10 text-warn', icon: TriangleAlert },
  err: { box: 'bg-err/10 text-err', icon: CircleAlert },
} as const;

/** A line that says how something is, or warns: on its own between groups, or inside a row. `action`: a button at its end. */
export function Notice({ tone = 'info', icon, children, action, className }: { tone?: keyof typeof TONE; icon?: ReactNode; children: ReactNode; action?: ReactNode; className?: string }) {
  const Icon = TONE[tone].icon;
  return (
    <div className={cx('flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl px-3.5 py-2.5', TONE[tone].box, className)}>
      <div className="flex min-w-[min(100%,14rem)] flex-1 items-start gap-2.5 text-[13px] leading-snug">
        <span className="mt-px flex shrink-0">{icon ?? <Icon size={15} />}</span>
        <div className="min-w-0">{children}</div>
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}

/** A group's list with nothing in it yet: one quiet line, and what to do about it. */
export function EmptyRow({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="px-4 py-5 text-center">
      <div className="text-[13px] leading-snug text-fg-3">{children}</div>
      {action && <div className="mt-3 flex justify-center">{action}</div>}
    </div>
  );
}

/** A setting's value picked from a short list: the value and a chevron, the choices in a menu (each with a line on it). */
export function Select<T extends string>({
  value,
  options,
  onChange,
  label,
  width = 260,
  disabled,
}: {
  value: T;
  options: { value: T; label: ReactNode; hint?: ReactNode }[];
  onChange: (v: T) => void;
  /** What it picks, for screen readers and over a phone's sheet. */
  label: string;
  width?: number;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const cur = options.find((o) => o.value === value);
  return (
    <>
      <button
        ref={ref}
        type="button"
        aria-label={label}
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cx(
          'inline-flex h-8 max-w-[16rem] min-w-0 items-center gap-1.5 rounded-lg bg-bg-2 pr-2 pl-3 text-[13px] text-fg ring-1 ring-line-2 transition-colors ring-inset hover:bg-bg-3 disabled:opacity-50',
          open && 'bg-bg-3',
        )}
      >
        <span className="truncate">{cur?.label ?? value}</span>
        <ChevronDown size={14} className={cx('shrink-0 text-fg-3 transition-transform duration-200', open && 'rotate-180')} />
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} align="end" width={width} title={label}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => {
              setOpen(false);
              if (o.value !== value) onChange(o.value);
            }}
            className={cx('flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-bg-2', o.value === value && 'bg-bg-2')}
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] text-fg">{o.label}</span>
              {o.hint && <span className="mt-0.5 block text-[12px] leading-snug text-fg-3">{o.hint}</span>}
            </span>
            {o.value === value && <Check size={14} className="mt-0.5 shrink-0" strokeWidth={2.5} />}
          </button>
        ))}
      </Popover>
    </>
  );
}

/** One ⋯ button for a group's or a row's rarer actions; its children are the menu (MenuItem, MenuSep). */
export function MoreMenu({ label = 'More', children, width = 260 }: { label?: string; children: (close: () => void) => ReactNode; width?: number }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const close = () => setOpen(false);
  return (
    <>
      <IconButton ref={ref} size="sm" label={label} active={open} onClick={() => setOpen((o) => !o)}>
        <MoreHorizontal size={16} />
      </IconButton>
      <Popover anchor={ref} open={open} onClose={close} align="end" width={width} title={label}>
        {children(close)}
      </Popover>
    </>
  );
}

/** A number set with − and + (how many at once, how big a team). */
export function Stepper({ value, min, max, onChange, label }: { value: number; min: number; max: number; onChange: (n: number) => void; label: string }) {
  const btn = 'flex h-8 w-8 items-center justify-center text-fg-2 transition-colors hover:bg-bg-3 hover:text-fg disabled:opacity-40';
  return (
    <div role="group" aria-label={label} className="inline-flex h-8 items-center overflow-hidden rounded-lg bg-bg-2 ring-1 ring-line-2 ring-inset">
      <button type="button" aria-label={`Fewer: ${label}`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))} className={btn}>
        −
      </button>
      <span className="tnum w-8 text-center text-[13.5px] font-medium text-fg">{value}</span>
      <button type="button" aria-label={`More: ${label}`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))} className={btn}>
        +
      </button>
    </div>
  );
}

/**
 * The top of a page a section opens inside itself (a project's notes, one provider's settings): the way back
 * over its title, and its own actions at the end.
 */
export function SubHeader({ back, onBack, title, hint, actions }: { back: string; onBack: () => void; title: ReactNode; hint?: ReactNode; actions?: ReactNode }) {
  return (
    <div>
      <button type="button" onClick={onBack} className="-ml-1 inline-flex items-center gap-0.5 rounded-md px-1 text-[13px] text-fg-3 transition-colors hover:text-fg">
        <ChevronLeft size={15} /> {back}
      </button>
      <div className="mt-1 flex flex-wrap items-end gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-[16px] font-semibold tracking-tight break-words">{title}</h3>
          {hint && <p className="mt-0.5 text-[13px] leading-snug text-fg-3">{hint}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
      </div>
    </div>
  );
}

/** Where a section's own controls go beside its title (SettingsPage gives it). */
export const HeaderSlot = createContext<HTMLElement | null>(null);

/** A section's main switch or button, beside its title: "Memory  ●", "Add server". */
export function SectionActions({ children }: { children: ReactNode }) {
  const el = useContext(HeaderSlot);
  return el ? createPortal(children, el) : null;
}
