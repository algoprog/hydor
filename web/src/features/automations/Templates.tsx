// Settings → Scheduled tasks: ready-made automations, in a few groups. Each opens a short form; it becomes a
// task at once, or opens in the full task form for more options. A webhook example's form says where its
// address goes once it is made.
import { useEffect, useState } from 'react';
import type { TaskDraft } from '@shared/automations';
import { hookHelp } from '@shared/engineering';
import type { Agent } from '@shared/types';
import { DAY_NAMES } from '@shared/automations';
import { post } from '../../lib/api';
import { lastAgent } from '../../lib/start';
import { toast, toastError, useApp } from '../../lib/store';
import { FolderChip } from '../../components/FolderPicker';
import { Button, cx, Dialog, inputCls, Section, Switch } from '../../components/ui';
import { AgentPicker } from '../home/AgentPicker';
import { boxCls, Field } from './parts';
import { GROUPS, TEMPLATES, type Template, type TemplateField } from './taskTemplates';

const small = cx(boxCls, 'h-9 text-[13.5px]');

/** The agent picked last on the start page, else Claude Code. */
export { lastAgent };

/** A new task's mode: Custom's Auto suits runs nobody watches (routine steps go ahead, risky ones ask); others keep their own default. */
export const defaultMode = (agent: Agent, acp?: string | null) => (agent === 'acp' && acp === 'console' ? 'auto' : undefined);

function Input({ f, value, onChange }: { f: TemplateField; value: string; onChange: (v: string) => void }) {
  const label = f.optional ? `${f.label} (optional)` : f.label;
  switch (f.kind) {
    case 'time':
      return (
        <Field label={label}>
          <input type="time" value={value} onChange={(e) => onChange(e.target.value)} className={cx(small, 'w-32')} />
        </Field>
      );
    case 'days':
      return (
        <Field label={label}>
          <select value={value} onChange={(e) => onChange(e.target.value)} className={cx(small, 'w-auto')}>
            <option value="daily">Every day</option>
            <option value="weekdays">Weekdays</option>
            <option value="weekends">Weekends</option>
          </select>
        </Field>
      );
    case 'weekday':
      return (
        <Field label={label}>
          <select value={value} onChange={(e) => onChange(e.target.value)} className={cx(small, 'w-auto')}>
            {[1, 2, 3, 4, 5, 6, 0].map((d) => (
              <option key={d} value={String(d)}>
                {DAY_NAMES[d]}
              </option>
            ))}
          </select>
        </Field>
      );
    case 'folder':
      return (
        <Field label={label}>
          <FolderChip value={value} onChange={onChange} />
        </Field>
      );
    case 'choice':
      return (
        <Field label={label} hint={f.hint}>
          <select value={value} onChange={(e) => onChange(e.target.value)} className={cx(small, 'w-auto')}>
            {(f.options ?? []).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
      );
    case 'yesno':
      return (
        <div className="flex items-center gap-3">
          <span className="min-w-0 flex-1 text-[13px] text-fg-2">{f.label}</span>
          <Switch on={value === 'yes'} label={f.label} onChange={(on) => onChange(on ? 'yes' : '')} />
        </div>
      );
    case 'long':
      return (
        <Field label={label} hint={f.hint}>
          <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={2} placeholder={f.placeholder} className={cx(inputCls, 'h-auto py-1.5 text-[13.5px]')} />
        </Field>
      );
    default:
      return (
        <Field label={label} hint={f.hint}>
          <input
            type={f.kind === 'number' ? 'number' : 'text'}
            inputMode={f.kind === 'url' ? 'url' : f.kind === 'number' ? 'numeric' : undefined}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={f.placeholder}
            className={cx(small, f.kind === 'number' ? 'w-28' : 'w-full')}
          />
        </Field>
      );
  }
}

function TemplateDialog({ template, onClose, onMore }: { template: Template; onClose: () => void; onMore: (d: TaskDraft) => void }) {
  const boot = useApp((s) => s.boot);
  const folder = boot?.defaultCwd || boot?.home || '/';
  const [v, setV] = useState<Record<string, string>>({});
  const [who, setWho] = useState(lastAgent);
  const [busy, setBusy] = useState(false);
  useEffect(() => setV(Object.fromEntries(template.fields.map((f) => [f.id, f.default ?? (f.kind === 'folder' ? folder : '')]))), [template, folder]);
  const missing = template.fields.some((f) => !f.optional && f.kind !== 'yesno' && !(v[f.id] ?? '').trim());
  const draft = (): TaskDraft => {
    const b = template.build(v);
    return { ...b, cwd: b.cwd || folder, agent: who.agent, acpAgent: who.agent === 'acp' ? (who.acp ?? undefined) : undefined, mode: defaultMode(who.agent, who.acp), origin: b.origin ?? `template:${template.id}` };
  };
  // Where a webhook example's address goes, for what its form says now (CI doctor's CI…). A form still empty may not build.
  const where = (() => {
    try {
      const b = template.build(v);
      return hookHelp(b.origin ?? `template:${template.id}`, b.schedule);
    } catch {
      return null;
    }
  })();
  const create = async () => {
    setBusy(true);
    try {
      await post('/api/tasks', draft());
      toast(`Created “${draft().name}”`, 'ok');
      onClose();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onClose={onClose}
      width={480}
      title={
        <span className="flex items-center gap-2">
          <template.icon size={16} className="text-fg-3" />
          {template.title}
        </span>
      }
      footer={
        <>
          <Button variant="ghost" onClick={() => onMore(draft())} disabled={missing}>
            More options…
          </Button>
          <Button variant="primary" onClick={create} disabled={busy || missing}>
            {busy ? 'Creating…' : 'Create task'}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-[13px] leading-relaxed text-fg-3">
        {template.blurb}
        {template.needs && ` It needs ${template.needs} (Apps → Connected apps).`}
      </p>
      <div className="space-y-3">
        {template.fields.map((f) => (
          <Input key={f.id} f={f} value={v[f.id] ?? ''} onChange={(x) => setV((p) => ({ ...p, [f.id]: x }))} />
        ))}
        <Field label="Run by">
          <div>
            <AgentPicker agent={who.agent} acpId={who.acp} acpList={boot?.acpAgents ?? []} onPick={(agent, acp) => setWho({ agent, acp })} />
          </div>
        </Field>
        {where && <p className="rounded-xl bg-bg-1 px-3 py-2 text-[12px] leading-relaxed text-fg-3">Once it is made, its address shows in the list. {where}</p>}
      </div>
    </Dialog>
  );
}

function TemplateCard({ t, onPick }: { t: Template; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      className="group flex items-start gap-3 rounded-xl border border-line px-3 py-2.5 text-left transition-colors hover:border-line-2 hover:bg-bg-1 active:scale-[0.99]"
    >
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-bg-2 text-fg-2 transition-colors group-hover:text-accent">
        <t.icon size={15} />
      </span>
      <span className="min-w-0">
        <span className="block text-[13.5px] font-medium text-fg">{t.title}</span>
        <span className="block text-[12px] leading-snug text-fg-3">{t.blurb}</span>
      </span>
    </button>
  );
}

export function TemplateGallery({ onMore }: { onMore: (d: TaskDraft) => void }) {
  const [pick, setPick] = useState<Template | null>(null);
  return (
    <Section title="Start from an example" sub="A short form each; change anything later.">
      <div className="space-y-4">
        {GROUPS.map((g) => (
          <div key={g.id}>
            <h3 className="mb-1.5 text-[12px] font-medium text-fg-3">{g.title}</h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {TEMPLATES.filter((t) => t.group === g.id).map((t) => (
                <TemplateCard key={t.id} t={t} onPick={() => setPick(t)} />
              ))}
            </div>
          </div>
        ))}
      </div>
      {pick && (
        <TemplateDialog
          template={pick}
          onClose={() => setPick(null)}
          onMore={(d) => {
            setPick(null);
            onMore(d);
          }}
        />
      )}
    </Section>
  );
}
