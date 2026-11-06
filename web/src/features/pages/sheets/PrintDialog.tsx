// Tools → Print and PDF setup: how a sheet prints and goes to PDF (and to Excel's page setup): across the page or
// upright, made to fit the page's width (or the whole page), the cells to print, the header rows each page repeats, and
// the cells' lines.
import { useState } from 'react';
import { parseRange, type PrintSetup } from '@shared/sheets';
import { Button, cx, Dialog, inputCls, Segmented, Switch } from '../../../components/ui';

export function PrintDialog({ setup, picked, onApply, onClose }: { setup: PrintSetup | undefined; picked: string; onApply: (p: PrintSetup | undefined) => void; onClose: () => void }) {
  const [p, setP] = useState<PrintSetup>({ ...(setup ?? {}) });
  const [area, setArea] = useState(setup?.area ?? '');
  const areaOk = !area.trim() || !!parseRange(area.trim().toUpperCase().replace(/\$/g, ''));
  const apply = () => {
    const next: PrintSetup = { ...p };
    if (area.trim()) next.area = area.trim().toUpperCase().replace(/\$/g, '');
    else delete next.area;
    for (const k of Object.keys(next) as (keyof PrintSetup)[]) if (next[k] === undefined) delete next[k];
    onApply(Object.keys(next).length ? next : undefined);
    onClose();
  };
  return (
    <Dialog
      open
      onClose={onClose}
      width={460}
      title="Print and PDF setup"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!areaOk} onClick={apply}>
            Apply
          </Button>
        </>
      }
    >
      <div className="space-y-3.5 text-[13.5px]">
        <div>
          <div className="mb-1.5 text-[12.5px] font-medium text-fg-2">Orientation</div>
          <Segmented<'auto' | 'portrait' | 'landscape'>
            size="sm"
            value={p.orient ?? 'auto'}
            onChange={(v) => setP({ ...p, orient: v === 'auto' ? undefined : v })}
            options={[
              { value: 'auto', label: 'By its width' },
              { value: 'portrait', label: 'Upright' },
              { value: 'landscape', label: 'Across' },
            ]}
          />
        </div>
        <div>
          <div className="mb-1.5 text-[12.5px] font-medium text-fg-2">Size</div>
          <Segmented<'width' | 'page' | 'none'>
            size="sm"
            value={p.fit ?? 'width'}
            onChange={(v) => setP({ ...p, fit: v === 'width' ? undefined : v })}
            options={[
              { value: 'width', label: 'Fit to the page’s width' },
              { value: 'page', label: 'Fit on one page' },
              { value: 'none', label: 'Actual size' },
            ]}
          />
        </div>
        <label className="block">
          <div className="mb-1.5 text-[12.5px] font-medium text-fg-2">Print area</div>
          <div className="flex gap-1.5">
            <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="All of the sheet" translate="no" className={cx(inputCls, 'min-w-0 flex-1 text-[13px]', !areaOk && 'border-err')} />
            <Button size="sm" variant="secondary" onClick={() => setArea(picked)}>
              The cells picked
            </Button>
          </div>
        </label>
        <label className="flex items-center justify-between gap-2">
          <span>
            Header rows repeated on each page
            <span className="block text-[12px] text-fg-3">Left empty: its frozen rows, or a first row of words</span>
          </span>
          <input
            type="number"
            min={0}
            max={20}
            value={p.titles ?? ''}
            placeholder="Auto"
            onChange={(e) => setP({ ...p, titles: e.target.value === '' ? undefined : Math.max(0, Math.min(20, Math.round(Number(e.target.value)))) })}
            aria-label="Header rows repeated on each page"
            className={cx(inputCls, 'w-[84px] text-[13px]')}
          />
        </label>
        <label className="flex items-center justify-between gap-2">
          Gridlines
          <Switch label="Gridlines" on={p.grid !== false} onChange={(on) => setP({ ...p, grid: on ? undefined : false })} />
        </label>
      </div>
    </Dialog>
  );
}
