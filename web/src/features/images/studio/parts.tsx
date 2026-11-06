// The pieces the editors' AI tools share: the words box with a few examples to start from, a setting that names itself
// and opens a short list ("For  Picture ⌄"), a shape's little outline, the price line, a problem in words with its way
// out (no OpenRouter key: Settings → Models), work going on, and a picture shown over a quiet checkerboard so its
// see-through parts show as such.
import type { CSSProperties, ReactNode } from 'react';
import { KeyRound, TriangleAlert } from 'lucide-react';
import { Button, cx, OptionRow, Picker, Throbber } from '../../../components/ui';
import { tr } from '../../../i18n/runtime';
import { go } from '../../../lib/nav';
import { needsKey, ratioOf } from './logic';

/** Behind a picture with see-through parts: a quiet checkerboard, in either theme. */
export const CHECKER: CSSProperties = { background: 'repeating-conic-gradient(var(--bg-3) 0 25%, var(--bg-1) 0 50%) 0 0 / 16px 16px' };

/** What to make, in words, with a few examples to start from (put in as the app's language shows them). */
export function Words({ value, onChange, label, placeholder, examples, rows = 3, disabled }: { value: string; onChange: (v: string) => void; label: string; placeholder: string; examples?: string[]; rows?: number; disabled?: boolean }) {
  return (
    <div className="space-y-2">
      <textarea
        autoFocus
        value={value}
        rows={rows}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        placeholder={placeholder}
        className="block w-full resize-none rounded-xl border border-line-2 bg-bg-1 px-3 py-2.5 text-[14px] leading-relaxed text-fg outline-none placeholder:text-fg-3 focus:border-accent/60 focus:ring-3 focus:ring-accent/15 disabled:opacity-60"
      />
      {!!examples?.length && !value.trim() && (
        <div className="flex flex-wrap gap-1.5">
          {examples.map((x) => (
            <button key={x} type="button" disabled={disabled} onClick={() => onChange(tr(x))} className="rounded-full border border-line px-2.5 py-1 text-[12.5px] text-fg-2 transition-colors hover:bg-bg-2 hover:text-fg">
              {x}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export interface Option<T extends string> {
  value: T;
  label: string;
  hint?: string;
  icon?: ReactNode;
}

/** A setting that names itself and opens its short list: "Shape  Wide ⌄". */
export function Choice<T extends string>({ label, value, shown, options, onChange, width = 260, disabled }: { label: string; value: T; shown?: string; options: Option<T>[]; onChange: (v: T) => void; width?: number; disabled?: boolean }) {
  const cur = options.find((o) => o.value === value);
  return (
    <Picker label={label} value={shown ?? cur?.label ?? value} title={label} width={width} disabled={disabled}>
      {(close) =>
        options.map((o) => (
          <OptionRow
            key={o.value}
            label={o.label}
            hint={o.hint}
            icon={o.icon}
            selected={o.value === value}
            onClick={() => {
              close();
              onChange(o.value);
            }}
          />
        ))
      }
    </Picker>
  );
}

/** A shape's outline, as wide and tall as it is, inside a small square. */
export function ShapeMark({ aspect, size = 14 }: { aspect: string; size?: number }) {
  const r = ratioOf(aspect);
  const w = r >= 1 ? size : Math.max(4, Math.round(size * r));
  const h = r >= 1 ? Math.max(4, Math.round(size / r)) : size;
  return (
    <span className="inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }} aria-hidden>
      <span className="rounded-[2px] border-[1.5px] border-current" style={{ width: w, height: h }} />
    </span>
  );
}

/** The price line: what it would cost, before anything is spent. */
export function PriceLine({ children }: { children: ReactNode }) {
  return <p className="text-[12.5px] leading-snug text-fg-3">{children}</p>;
}

/** Leaves the tool for Settings → Models, where the OpenRouter key goes. */
function addKey(leave: () => void) {
  leave();
  go('/settings?s=models');
}

/** A problem in words, with its way out where there is one (no OpenRouter key: add it in Settings → Models). */
export function Problem({ error, onLeave, children }: { error: string; onLeave: () => void; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-err/10 px-3 py-2.5 text-[13px] leading-snug text-err">
      <TriangleAlert size={15} className="shrink-0 self-start" />
      <span className="min-w-[min(100%,14rem)] flex-1">{error}</span>
      {needsKey(error) && (
        <Button size="sm" variant="secondary" icon={<KeyRound size={13} />} onClick={() => addKey(onLeave)}>
          Add the key
        </Button>
      )}
      {children}
    </div>
  );
}

/** Before anything: OpenRouter has no key here, so what goes through it cannot be made yet. */
export function NoKey({ what, onLeave }: { what: string; onLeave: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-warn/40 bg-warn/10 px-3 py-2.5">
      <KeyRound size={16} className="shrink-0 text-warn" />
      <div className="min-w-[12rem] flex-1 text-[12.5px] leading-snug text-fg-2">{what}</div>
      <Button size="sm" variant="primary" onClick={() => addKey(onLeave)}>
        Add the key
      </Button>
    </div>
  );
}

/** Work going on, and what it is doing. */
export function Working({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx('flex items-center gap-2 text-[13px] text-fg-2', className)}>
      <Throbber className="shrink-0 text-fg-3" />
      <span className="min-w-0">{children}</span>
    </div>
  );
}

/** A picture shown whole, over the checkerboard (or over `bg`, the colour it will be seen on). */
export function Shown({ src, alt = '', className, onClick, picked, bg }: { src: string; alt?: string; className?: string; onClick?: () => void; picked?: boolean; bg?: string }) {
  const body = <img src={src} alt={alt} draggable={false} className={cx('block max-h-full max-w-full object-contain', className)} />;
  const cls = cx('flex min-h-0 items-center justify-center overflow-hidden rounded-xl border', picked ? 'border-accent ring-2 ring-accent/50' : 'border-line');
  const style = bg ? { background: bg } : CHECKER;
  return onClick ? (
    <button type="button" onClick={onClick} aria-pressed={picked} className={cls} style={style}>
      {body}
    </button>
  ) : (
    <div className={cls} style={style}>
      {body}
    </div>
  );
}

/** A quiet label over a group of settings. */
export function Label({ children }: { children: ReactNode }) {
  return <div className="text-[12px] font-medium text-fg-3">{children}</div>;
}
