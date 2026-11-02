// What a template keeps between its runs (the builder's What it keeps): its lists of records, each saying
// what its records hold (or any record, when it does not), and whether its agents remember across runs in
// a memory of the template's own. Renaming a list renames it in the steps that use it.
import { Plus, Trash2 } from 'lucide-react';
import type { AppRecipe } from '@shared/apps';
import { fieldId } from '@shared/apps';
import type { DataCollection, Flow } from '@shared/app-manifest';
import { allSteps } from '@shared/app-manifest';
import { Button, cx, IconButton, inputCls, Switch } from '../../components/ui';
import { FieldChips } from './StepsEditor';

const bare = inputCls.replace('w-full', '');

/** The flow with a list's new name in the steps that keep data in it. */
function withList(flow: Flow, from: string, to: string): Flow {
  const next: Flow = JSON.parse(JSON.stringify(flow));
  for (const s of allSteps(next.steps)) if (s.do === 'data' && s.collection === from) s.collection = to;
  return next;
}

export function KeepsEditor({ recipe, onChange }: { recipe: AppRecipe; onChange: (p: Partial<AppRecipe>) => void }) {
  const data = recipe.data ?? {};
  const names = Object.keys(data);
  const setData = (d: Record<string, DataCollection>) => onChange({ data: Object.keys(d).length ? d : undefined });
  const rename = (from: string, typed: string) => {
    const to = fieldId(typed, names.filter((n) => n !== from)).replace(/^(\d)/, 'list_$1');
    if (to === from) return;
    onChange({ data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k === from ? to : k, v])), ...(recipe.flow ? { flow: withList(recipe.flow, from, to) } : {}) });
  };
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {names.map((n) => (
          <div key={n} className="space-y-2 rounded-xl border border-line bg-bg-1 p-2.5">
            <div className="flex items-center gap-2">
              <input className={cx(bare, 'h-8.5 w-[38%] min-w-[120px] font-mono text-[12.5px]')} aria-label="The list’s name" defaultValue={n} onBlur={(e) => rename(n, e.target.value)} />
              <input className={cx(bare, 'h-8.5 min-w-0 flex-1 text-[13.5px]')} placeholder="What it holds (optional)" value={data[n].description ?? ''} onChange={(e) => setData({ ...data, [n]: { ...data[n], description: e.target.value || undefined } })} />
              <IconButton label="Remove the list" size="sm" onClick={() => setData(Object.fromEntries(Object.entries(data).filter(([k]) => k !== n)))}>
                <Trash2 size={14} />
              </IconButton>
            </div>
            <FieldChips fields={data[n].fields ?? []} onChange={(f) => setData({ ...data, [n]: { ...data[n], fields: f.length ? f : undefined } })} add="Add a field" none="Any record: no fields set" plain />
          </div>
        ))}
        <Button size="sm" variant="subtle" icon={<Plus size={14} />} onClick={() => setData({ ...data, [fieldId('items', names)]: {} })}>
          Add a list
        </Button>
      </div>
      <label className="flex cursor-pointer items-start gap-3">
        <Switch on={!!recipe.memory} onChange={(on) => onChange({ memory: on || undefined })} label="Remembers across runs" className="mt-0.5" />
        <span className="min-w-0">
          <span className="block text-[13.5px]">Remembers across runs</span>
          <span className="block text-[12px] leading-snug text-fg-3">Its agents keep what later runs should know in a memory of its own, which Settings → Memory lists under its name.</span>
        </span>
      </label>
    </div>
  );
}
