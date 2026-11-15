// A call held in the Outbox for your OK, as a draft: which agent and session asked, the account and tool, and its
// input as a form (an email as To, Cc, Subject and Body; a chat message as where and text; a post; else the tool's
// own fields). Send makes the call with what the form holds now; Drop throws it away.
import { useMemo, useState } from 'react';
import { ArrowUpRight, Send, Trash2 } from 'lucide-react';
import { SHAPE_FIELDS, type HeldCall } from '@shared/outbox';
import { AgentIcon } from '../../components/AgentIcon';
import { Button, cx, inputCls, Switch } from '../../components/ui';
import { api, enc } from '../../lib/api';
import { timeAgo } from '../../lib/format';
import { goFull } from '../../lib/nav';
import { toast, toastError } from '../../lib/store';
import { AppIcon, useConn } from '../connections/store';

type Kind = 'text' | 'long' | 'list' | 'number' | 'bool' | 'json';
interface Field {
  name: string;
  label: string;
  kind: Kind;
  required: boolean;
}

/** "thread_ts" → "Thread ts". */
const words = (s: string) => {
  const t = s
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase();
  return t ? t[0].toUpperCase() + t.slice(1) : s;
};

function kindOf(v: unknown, schema: { type?: unknown; items?: { type?: unknown } } | undefined, long: boolean): Kind {
  const t = v === undefined ? schema?.type : Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v;
  if (t === 'boolean') return 'bool';
  if (t === 'number' || t === 'integer') return 'number';
  if (t === 'array') return (Array.isArray(v) ? v.every((x) => typeof x === 'string') : schema?.items?.type === 'string' || !schema?.items) ? 'list' : 'json';
  if (t === 'string' || t === undefined) return long || (typeof v === 'string' && (v.includes('\n') || v.length > 90)) ? 'long' : 'text';
  return 'json';
}

/** The form's fields: the shape's own first (To, Subject, Body…), then the rest of the input, then what the tool requires. */
function fieldsOf(c: HeldCall): Field[] {
  const props = (c.schema?.properties ?? {}) as Record<string, { type?: unknown; title?: string; items?: { type?: unknown } }>;
  const required = new Set(c.schema?.required ?? []);
  const out: Field[] = [];
  const used = new Set<string>();
  const add = (name: string, label: string, long = false) => {
    used.add(name);
    out.push({ name, label, kind: kindOf(c.input[name], props[name], long), required: required.has(name) });
  };
  if (c.shape !== 'fields')
    for (const g of SHAPE_FIELDS[c.shape]) {
      const name = g.names.find((n) => n in c.input) ?? g.names.find((n) => props[n]);
      if (name && !used.has(name)) add(name, g.label, !!g.long);
    }
  for (const name of Object.keys(c.input)) if (!used.has(name)) add(name, props[name]?.title ?? words(name));
  for (const name of Object.keys(props)) if (!used.has(name) && required.has(name)) add(name, props[name]?.title ?? words(name));
  return out;
}

/** What a field shows to start with. */
function shown(f: Field, v: unknown): string | boolean {
  if (f.kind === 'bool') return v === true;
  if (v === undefined || v === null) return '';
  if (f.kind === 'list') return Array.isArray(v) ? v.join(', ') : String(v);
  if (f.kind === 'json') return JSON.stringify(v, null, 2);
  return String(v);
}

/** The form back as the tool's input; a field that cannot be read says why. */
function inputOf(c: HeldCall, fields: Field[], values: Record<string, string | boolean>): { input?: Record<string, unknown>; errors: Record<string, string> } {
  const input: Record<string, unknown> = { ...c.input };
  const errors: Record<string, string> = {};
  for (const f of fields) {
    const v = values[f.name];
    const had = f.name in c.input;
    if (f.kind === 'bool') {
      if (had || v) input[f.name] = !!v;
      continue;
    }
    const s = String(v ?? '');
    if (!s.trim()) {
      if (f.required) errors[f.name] = 'Fill this in';
      else if (had && typeof c.input[f.name] === 'string') input[f.name] = '';
      else delete input[f.name];
      continue;
    }
    if (f.kind === 'list')
      input[f.name] = s
        .split(/[,;\n]/)
        .map((x) => x.trim())
        .filter(Boolean);
    else if (f.kind === 'number') {
      const n = Number(s);
      if (Number.isFinite(n)) input[f.name] = n;
      else errors[f.name] = 'A number';
    } else if (f.kind === 'json') {
      try {
        input[f.name] = JSON.parse(s);
      } catch {
        errors[f.name] = 'Not valid JSON';
      }
    } else input[f.name] = s;
  }
  return Object.keys(errors).length ? { errors } : { input, errors };
}

export function OutboxCard({ c, base = '', onDone }: { c: HeldCall; base?: string; onDone?: () => void }) {
  const fields = useMemo(() => fieldsOf(c), [c]);
  const [values, setValues] = useState<Record<string, string | boolean>>(() => Object.fromEntries(fields.map((f) => [f.name, shown(f, c.input[f.name])])));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<'send' | 'drop' | null>(null);
  const app = useConn((s) => s.connections?.find((x) => x.id === c.app)?.app);
  const set = (name: string, v: string | boolean) => {
    setValues((x) => ({ ...x, [name]: v }));
    if (errors[name]) setErrors((e) => ({ ...e, [name]: '' }));
  };
  const send = async () => {
    const r = inputOf(c, fields, values);
    setErrors(r.errors);
    if (!r.input) return;
    setBusy('send');
    try {
      const out = await api<{ call: HeldCall }>(`/api/outbox/${enc(c.id)}/send`, { method: 'POST', body: { input: r.input }, base });
      if (out.call.status === 'sent') toast(`Sent: ${c.appName} · ${c.tool}`, 'ok');
      else toast(`${c.appName} · ${c.tool}: ${out.call.result ?? 'it did not go'}`, 'error');
      onDone?.();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
    }
  };
  const drop = async () => {
    setBusy('drop');
    try {
      await api(`/api/outbox/${enc(c.id)}/drop`, { method: 'POST', base });
      toast('Dropped: it was not sent', 'ok');
      onDone?.();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
    }
  };
  const failed = c.status === 'failed';
  return (
    <div className="anim-pop overflow-hidden rounded-xl border border-warn/45 bg-panel shadow-[0_0_0_3px_color-mix(in_srgb,var(--warn)_10%,transparent)]">
      <div className="flex items-center gap-2 border-b border-line bg-warn/8 px-3 py-2">
        {app ? <AppIcon app={app} size={22} /> : <Send size={15} className="shrink-0 text-warn" />}
        <div className="min-w-0 flex-1 truncate text-[13px] font-medium">
          <span translate="no">{c.appName}</span>
          <span className="text-fg-3"> · </span>
          <span translate="no" className="font-mono text-[12.5px]">
            {c.tool}
          </span>
        </div>
        <span className="shrink-0 text-[11px] text-fg-3">{failed ? 'did not go' : `waiting ${timeAgo(c.at)}`}</span>
      </div>
      <div className="space-y-3 px-3 py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] text-fg-3">
          {c.agent && <AgentIcon agent={c.agent} size={12} />}
          <span>Held for your OK</span>
          {c.session && (
            <>
              <span>·</span>
              <button type="button" disabled={!c.key} onClick={() => c.key && goFull(`${base}/s/${encodeURIComponent(c.key)}`)} className="inline-flex min-w-0 items-center gap-0.5 hover:text-fg">
                <span translate="no" className="min-w-0 truncate">
                  {c.session}
                </span>
                <ArrowUpRight size={11} className="shrink-0" />
              </button>
            </>
          )}
          {c.task && <span className="min-w-0 truncate">{`· task “${c.task}”`}</span>}
        </div>
        {c.description && (
          <p translate="no" className="line-clamp-2 text-[12.5px] leading-snug text-fg-2">
            {c.description}
          </p>
        )}
        {failed && c.result && (
          <div className="rounded-lg border border-err/30 bg-err/[0.06] px-2.5 py-1.5 text-[12.5px] leading-snug text-err">
            <span className="font-medium">It did not go: </span>
            <span translate="no">{c.result.slice(0, 600)}</span>
          </div>
        )}
        {fields.length > 0 ? (
          // Its labels as an email's or a message's fields ("outbox::To"), not the same words elsewhere.
          <div className="space-y-2" data-i18n="outbox">
            {fields.map((f) => (
              <label key={f.name} className="grid gap-1 sm:grid-cols-[96px_1fr] sm:items-start sm:gap-3">
                <span className="pt-1.5 text-[12px] text-fg-3">
                  <span translate={c.shape === 'fields' ? 'no' : undefined}>{f.label}</span>
                  {f.required && <span className="text-err"> *</span>}
                </span>
                <span className="min-w-0">
                  {f.kind === 'bool' ? (
                    <span className="flex h-8 items-center">
                      <Switch on={values[f.name] === true} onChange={(on) => set(f.name, on)} label={f.label} disabled={!!busy} />
                    </span>
                  ) : f.kind === 'long' || f.kind === 'json' ? (
                    <textarea
                      translate="no"
                      value={String(values[f.name] ?? '')}
                      onChange={(e) => set(f.name, e.target.value)}
                      disabled={!!busy}
                      rows={f.kind === 'json' ? 4 : Math.min(12, Math.max(4, String(values[f.name] ?? '').split('\n').length + 1))}
                      className={cx(inputCls, 'h-auto w-full resize-y py-1.5 leading-relaxed', f.kind === 'json' && 'font-mono text-[12px]')}
                    />
                  ) : (
                    <input
                      translate="no"
                      value={String(values[f.name] ?? '')}
                      onChange={(e) => set(f.name, e.target.value)}
                      disabled={!!busy}
                      inputMode={f.kind === 'number' ? 'decimal' : undefined}
                      className={cx(inputCls, 'w-full')}
                    />
                  )}
                  {errors[f.name] && <span className="mt-0.5 block text-[11.5px] text-err">{errors[f.name]}</span>}
                </span>
              </label>
            ))}
          </div>
        ) : (
          <p className="text-[12.5px] text-fg-3">It takes nothing to fill in.</p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="primary" icon={<Send size={13} />} disabled={!!busy} onClick={send}>
            {busy === 'send' ? 'Sending…' : failed ? 'Send again' : 'Send'}
          </Button>
          <Button size="sm" variant="ghost" icon={<Trash2 size={13} />} disabled={!!busy} onClick={drop}>
            Drop
          </Button>
        </div>
      </div>
    </div>
  );
}
