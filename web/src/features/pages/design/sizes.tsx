// The sizes a design can be, as New → Design and Resize offer them: by group (social media, print, other), each with
// its shape drawn to scale and its size in its own unit, and a size of your own (pixels, millimetres or inches).
import { useState } from 'react';
import { DESIGN_GROUPS, DESIGN_LIMITS, DESIGN_SIZES, sizeText, shapeOf, toPx, type DesignSize, type DesignUnit } from '@shared/design';
import { cx, inputCls } from '../../../components/ui';
import { tr } from '../../../i18n/runtime';

/** A size's shape, small, to scale. */
export function SizeMark({ w, h, on }: { w: number; h: number; on?: boolean }) {
  const k = 22 / Math.max(w, h);
  return (
    <span className="grid h-7 w-7 shrink-0 place-items-center">
      <span className={cx('block rounded-[2px] border-[1.5px]', on ? 'border-accent bg-accent/15' : 'border-fg-3/70')} style={{ width: Math.max(5, w * k), height: Math.max(5, h * k) }} />
    </span>
  );
}

export function customSize(w: number, h: number, unit: DesignUnit): DesignSize | null {
  const pw = toPx(w, unit);
  const ph = toPx(h, unit);
  if (!(pw >= DESIGN_LIMITS.min && ph >= DESIGN_LIMITS.min && pw <= DESIGN_LIMITS.max && ph <= DESIGN_LIMITS.max)) return null;
  return { id: 'custom', label: tr('Custom size'), group: 'other', w: pw, h: ph, unit, uw: w, uh: h, shape: shapeOf(pw, ph) };
}

export function SizePicker({ value, onPick, columns = 2 }: { value: DesignSize | null; onPick: (s: DesignSize) => void; columns?: number }) {
  const [w, setW] = useState(value?.id === 'custom' ? String(value.uw) : '1200');
  const [h, setH] = useState(value?.id === 'custom' ? String(value.uh) : '800');
  const [unit, setUnit] = useState<DesignUnit>(value?.id === 'custom' ? value.unit : 'px');
  const custom = customSize(Number(w), Number(h), unit);
  const isCustom = value?.id === 'custom';
  const pickCustom = (nw: string, nh: string, u: DesignUnit) => {
    const s = customSize(Number(nw), Number(nh), u);
    if (s) onPick(s);
  };
  return (
    <div className="space-y-3">
      {DESIGN_GROUPS.map((g) => (
        <div key={g.id}>
          <div className="pb-1 text-[11.5px] font-semibold tracking-wide text-fg-3 uppercase">{tr(g.label)}</div>
          <div className={cx('grid gap-1', columns === 3 ? 'grid-cols-1 min-[480px]:grid-cols-2 sm:grid-cols-3' : columns === 1 ? 'grid-cols-1' : 'grid-cols-1 min-[420px]:grid-cols-2')}>
            {DESIGN_SIZES.filter((s) => s.group === g.id).map((s) => {
              const on = value?.id === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onPick(s)}
                  className={cx('flex min-w-0 items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition-colors', on ? 'border-accent/60 bg-accent-soft' : 'border-line hover:border-line-2 hover:bg-bg-1')}
                >
                  <SizeMark w={s.w} h={s.h} on={on} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] leading-4 font-medium text-fg">{tr(s.label)}</span>
                    <span className="block truncate text-[11px] leading-4 text-fg-3 tabular-nums">{sizeText(s)}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <div>
        <div className="pb-1 text-[11.5px] font-semibold tracking-wide text-fg-3 uppercase">{tr('Custom size')}</div>
        <div className={cx('flex flex-wrap items-center gap-1.5 rounded-lg border px-2 py-1.5', isCustom ? 'border-accent/60 bg-accent-soft' : 'border-line')}>
          <input value={w} onChange={(e) => (setW(e.target.value), pickCustom(e.target.value, h, unit))} inputMode="decimal" aria-label="Width" className={cx(inputCls, 'h-8 w-20 text-[13px] tabular-nums')} />
          <span className="text-fg-3">×</span>
          <input value={h} onChange={(e) => (setH(e.target.value), pickCustom(w, e.target.value, unit))} inputMode="decimal" aria-label="Height" className={cx(inputCls, 'h-8 w-20 text-[13px] tabular-nums')} />
          <select value={unit} onChange={(e) => (setUnit(e.target.value as DesignUnit), pickCustom(w, h, e.target.value as DesignUnit))} aria-label="Unit" className={cx(inputCls, 'h-8 w-[72px] px-1.5 text-[13px]')}>
            <option value="px">px</option>
            <option value="mm">mm</option>
            <option value="in">in</option>
          </select>
          <button type="button" disabled={!custom} onClick={() => custom && onPick(custom)} className="ml-auto rounded-md px-2 py-1 text-[12.5px] font-medium text-accent hover:underline disabled:opacity-40">
            {custom ? (unit === 'px' ? tr('Use this size') : `${custom.w} × ${custom.h} px`) : tr(`From ${DESIGN_LIMITS.min} to ${DESIGN_LIMITS.max} pixels a side`)}
          </button>
        </div>
      </div>
    </div>
  );
}
