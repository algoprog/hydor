// Prices per model for the cost estimates: the public table's rates show as placeholders; a price you
// type (dollars per million tokens) replaces it. Any model ID works, including ones the table lacks.
import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { ModelPrice, ModelUsage } from '@shared/types';
import { api, put } from '../../lib/api';
import { toast, toastError } from '../../lib/store';
import { Button, Dialog, IconButton } from '../../components/ui';

type Draft = { input: string; cacheRead: string; output: string };

const cell = 'h-8 w-full rounded-md border border-line-2 bg-bg-1 px-2 text-right text-[12.5px] tabular-nums outline-none placeholder:text-fg-3 focus:border-accent/60';

export function ModelPricesDialog({ open, models, onClose, onSaved }: { open: boolean; models: ModelUsage[]; onClose: () => void; onSaved: () => void }) {
  const [rows, setRows] = useState<Record<string, Draft>>({});
  const [extra, setExtra] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    api<{ prices: Record<string, ModelPrice> }>('/api/prices')
      .then((r) => {
        const next: Record<string, Draft> = {};
        for (const m of models) next[m.model] = { input: '', cacheRead: '', output: '' };
        for (const [m, p] of Object.entries(r.prices)) next[m] = { input: String(p.input), cacheRead: p.cacheRead != null ? String(p.cacheRead) : '', output: String(p.output) };
        setRows(next);
      })
      .catch(toastError);
  }, [open, models]);

  const table = (m: string) => models.find((x) => x.model === m)?.price;
  const save = async () => {
    const prices: Record<string, ModelPrice> = {};
    for (const [m, d] of Object.entries(rows)) {
      if (!d.input.trim() && !d.output.trim()) continue;
      const input = Number(d.input);
      const output = Number(d.output);
      if (!Number.isFinite(input) || !Number.isFinite(output)) return toast(`${m}: enter both the input and the output price`, 'error');
      prices[m] = { input, output, cacheRead: d.cacheRead.trim() ? Number(d.cacheRead) : undefined };
    }
    setBusy(true);
    try {
      await put('/api/prices', { prices });
      onSaved();
      onClose();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Model prices" width={620}>
      <p className="mb-3 text-[12.5px] leading-relaxed text-fg-3">
        Dollars per million tokens. Empty fields use the public price table (shown in grey); type a price to use your own. Subscriptions are flat-rate: the estimate is what the same tokens would
        cost through the API.
      </p>
      <div className="max-h-[50vh] overflow-y-auto">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="text-left text-[11px] text-fg-3">
              <th className="py-1.5 pr-2 font-medium">Model</th>
              <th className="w-24 py-1.5 pr-2 text-right font-medium">Input</th>
              <th className="w-24 py-1.5 pr-2 text-right font-medium">Cached</th>
              <th className="w-24 py-1.5 pr-2 text-right font-medium">Output</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {Object.entries(rows).map(([m, d]) => {
              const t = table(m);
              const set = (k: keyof Draft, v: string) => setRows((r) => ({ ...r, [m]: { ...r[m], [k]: v } }));
              return (
                <tr key={m} className="border-t border-line">
                  <td className="max-w-[220px] truncate py-1.5 pr-2 font-mono text-[12px]" title={m}>
                    {m}
                  </td>
                  <td className="py-1 pr-2">
                    <input inputMode="decimal" value={d.input} onChange={(e) => set('input', e.target.value)} placeholder={t ? String(+t.input.toFixed(3)) : '—'} className={cell} />
                  </td>
                  <td className="py-1 pr-2">
                    <input inputMode="decimal" value={d.cacheRead} onChange={(e) => set('cacheRead', e.target.value)} placeholder={t ? String(+(t.cacheRead ?? t.input).toFixed(3)) : '—'} className={cell} />
                  </td>
                  <td className="py-1 pr-2">
                    <input inputMode="decimal" value={d.output} onChange={(e) => set('output', e.target.value)} placeholder={t ? String(+t.output.toFixed(3)) : '—'} className={cell} />
                  </td>
                  <td className="py-1">
                    <IconButton label="Use the table's price" size="sm" onClick={() => setRows((r) => ({ ...r, [m]: { input: '', cacheRead: '', output: '' } }))}>
                      <Trash2 size={13} />
                    </IconButton>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const m = extra.trim();
          if (!m) return;
          setRows((r) => ({ ...r, [m]: r[m] ?? { input: '', cacheRead: '', output: '' } }));
          setExtra('');
        }}
      >
        <input value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="Another model ID" className="h-8 min-w-0 flex-1 rounded-md border border-line-2 bg-bg-1 px-2 font-mono text-[12.5px] outline-none placeholder:text-fg-3 focus:border-accent/60" />
        <Button size="sm" variant="secondary" icon={<Plus size={13} />} type="submit">
          Add
        </Button>
      </form>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" onClick={save} disabled={busy}>
          {busy ? 'Saving…' : 'Save prices'}
        </Button>
      </div>
    </Dialog>
  );
}
