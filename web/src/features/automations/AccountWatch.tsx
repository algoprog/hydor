// The watcher's "Connected app" kind: one of your connected accounts, one of its tools that only looks (lists or
// searches), its arguments as a form built from the tool's own fields, and Try it, which calls the tool once and shows
// where the items are and which field tells them apart (both can be changed from what came back). For a calendar,
// "Before each event": a run that long before each event, for those with a title or other people if you like.
import { useEffect, useMemo, useState } from 'react';
import { Play } from 'lucide-react';
import type { AccountFind, AccountWatch, EventBefore, WatchAccount, WatchPreview, WatchSpec } from '@shared/automations';
import { api, post } from '../../lib/api';
import { go } from '../../lib/nav';
import { Button, cx, inputCls, Segmented } from '../../components/ui';
import { boxCls, Field } from './parts';

const small = cx(boxCls, 'h-8.5 text-[13px]');

type Prop = { type?: unknown; enum?: unknown[]; description?: string; title?: string; items?: { type?: unknown } };
type Kind = 'text' | 'number' | 'bool' | 'enum' | 'list' | 'json';

/** "max_results" → "Max results". */
const words = (s: string) => {
  const t = s
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase();
  return t ? t[0].toUpperCase() + t.slice(1) : s;
};

function kindOf(p: Prop | undefined): Kind {
  if (Array.isArray(p?.enum) && p!.enum.every((v) => typeof v === 'string')) return 'enum';
  const t = Array.isArray(p?.type) ? p!.type.find((x) => x !== 'null') : p?.type;
  if (t === 'boolean') return 'bool';
  if (t === 'number' || t === 'integer') return 'number';
  if (t === 'array') return !p?.items || p.items.type === 'string' ? 'list' : 'json';
  if (t === 'object') return 'json';
  return 'text';
}

const shown = (k: Kind, v: unknown): string => (v === undefined || v === null ? '' : k === 'list' && Array.isArray(v) ? v.join(', ') : k === 'json' ? JSON.stringify(v) : String(v));

/** The tool's arguments as a form: its own fields, the required ones first. */
function ToolArgs({ schema, args, set }: { schema?: WatchAccount['tools'][number]['schema']; args: Record<string, unknown>; set: (a: Record<string, unknown>) => void }) {
  const props = (schema?.properties ?? {}) as Record<string, Prop>;
  const required = new Set(schema?.required ?? []);
  const names = Object.keys(props).sort((a, b) => Number(required.has(b)) - Number(required.has(a)));
  const [all, setAll] = useState(false);
  const [bad, setBad] = useState<Record<string, string>>({});
  // Its fields as typed: kept as text while they are not valid yet (a list, JSON).
  const [typed, setTyped] = useState<Record<string, string>>({});
  if (!names.length) return <p className="text-[12.5px] text-fg-3">It takes nothing to fill in.</p>;
  const visible = all || names.length <= 6 ? names : names.filter((n, i) => i < 4 || required.has(n) || args[n] !== undefined);
  const put = (n: string, k: Kind, text: string) => {
    setTyped((t) => ({ ...t, [n]: text }));
    const next = { ...args };
    let err = '';
    if (!text.trim()) delete next[n];
    else if (k === 'number') {
      const x = Number(text);
      if (Number.isFinite(x)) next[n] = x;
      else err = 'A number';
    } else if (k === 'list')
      next[n] = text
        .split(/[,;\n]/)
        .map((x) => x.trim())
        .filter(Boolean);
    else if (k === 'json') {
      try {
        next[n] = JSON.parse(text);
      } catch {
        err = 'Not valid JSON';
      }
    } else next[n] = text;
    setBad((b) => ({ ...b, [n]: err }));
    if (!err) set(next);
  };
  return (
    <div className="space-y-2">
      {visible.map((n) => {
        const p = props[n];
        const k = kindOf(p);
        const v = args[n];
        return (
          <label key={n} className="grid gap-1 sm:grid-cols-[132px_1fr] sm:items-start sm:gap-3">
            <span className="pt-1.5 text-[12px] text-fg-3">
              <span translate="no">{p?.title ?? words(n)}</span>
              {required.has(n) && <span className="text-err"> *</span>}
            </span>
            <span className="min-w-0">
              {k === 'bool' ? (
                <select value={v === true ? 'yes' : v === false ? 'no' : ''} onChange={(e) => set(e.target.value ? { ...args, [n]: e.target.value === 'yes' } : Object.fromEntries(Object.entries(args).filter(([x]) => x !== n)))} className={cx(small, 'w-full')}>
                  <option value="">(as it decides)</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              ) : k === 'enum' ? (
                <select value={typeof v === 'string' ? v : ''} onChange={(e) => put(n, k, e.target.value)} className={cx(small, 'w-full')} translate="no">
                  <option value="">{required.has(n) ? '—' : '(none)'}</option>
                  {(p!.enum as string[]).map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  translate="no"
                  value={typed[n] ?? shown(k, v)}
                  onChange={(e) => put(n, k, e.target.value)}
                  inputMode={k === 'number' ? 'decimal' : undefined}
                  placeholder={k === 'list' ? 'one, two' : k === 'json' ? '{ }' : undefined}
                  className={cx(inputCls, 'w-full', k === 'json' && 'font-mono text-[12px]')}
                />
              )}
              {bad[n] ? <span className="mt-0.5 block text-[11.5px] text-err">{bad[n]}</span> : p?.description && <span translate="no" className="mt-0.5 block line-clamp-2 text-[11.5px] leading-snug text-fg-3">{p.description}</span>}
            </span>
          </label>
        );
      })}
      {visible.length < names.length && (
        <button type="button" onClick={() => setAll(true)} className="text-[12.5px] text-accent hover:underline">
          {`Show all ${names.length} fields`}
        </button>
      )}
      <p className="text-[11.5px] leading-snug text-fg-3">{`In a field, ${'{{now}}'} stands for the time of each check, and ${'{{now+2d}}'} for two days later (${'{{today}}'} and ${'{{tomorrow}}'} too).`}</p>
    </div>
  );
}

const LEADS: { value: string; label: string }[] = [
  { value: '15', label: '15 min' },
  { value: '30', label: '30 min' },
  { value: '60', label: '1 hour' },
  { value: 'evening', label: 'The evening before' },
];

/** Where Try it found the items, and the choices to change it. */
function Found({ find, w, set, retry }: { find: AccountFind; w: AccountWatch; set: (p: Partial<AccountWatch>) => void; retry: (p: Partial<AccountWatch>) => void }) {
  const ids = find.fields.filter((f) => f.unique && !f.time);
  const times = find.fields.filter((f) => f.time);
  return (
    <div className="space-y-2">
      {find.lists.length > 0 && (
        <div className="flex flex-wrap items-end gap-2">
          <Field label="The items are in" className="min-w-[10rem] flex-1">
            <select value={find.list ?? ''} onChange={(e) => retry({ list: e.target.value, id: undefined, ...(w.before ? { before: { ...w.before, start: undefined } } : {}) })} className={cx(small, 'w-full')} translate="no">
              {find.lists.map((l) => (
                <option key={l.path} value={l.path}>
                  {`${l.path || 'the answer itself'} (${l.count})`}
                </option>
              ))}
            </select>
          </Field>
          {find.list !== null && (
            <Field label="Told apart by" className="min-w-[10rem] flex-1">
              <select value={find.id ?? ''} onChange={(e) => set({ id: e.target.value || undefined })} className={cx(small, 'w-full')} translate="no">
                {find.id === null && <option value="">(found at the first look)</option>}
                {find.id && find.id !== '*' && !ids.some((f) => f.path === find.id) && <option value={find.id}>{find.id}</option>}
                {ids.map((f) => (
                  <option key={f.path} value={f.path}>
                    {f.path === '*' ? f.sample : `${f.path} (${f.sample})`}
                  </option>
                ))}
                {!ids.some((f) => f.path === '*') && <option value="*">The whole item</option>}
              </select>
            </Field>
          )}
          {w.before && find.list !== null && (
            <Field label="Start time in" className="min-w-[10rem] flex-1">
              <select value={find.start ?? ''} onChange={(e) => set({ before: { ...w.before!, start: e.target.value || undefined } })} className={cx(small, 'w-full')} translate="no">
                {!find.start && <option value="">—</option>}
                {times.map((f) => (
                  <option key={f.path} value={f.path}>
                    {`${f.path} (${f.sample})`}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>
      )}
      {find.items.length > 0 && <pre translate="no" className="max-h-48 overflow-auto font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap text-fg-2">{find.items.join('\n')}</pre>}
      <details className="text-[12px] text-fg-3">
        <summary className="cursor-pointer select-none hover:text-fg-2">What it answered</summary>
        <pre translate="no" className="mt-1 max-h-64 overflow-auto rounded-md bg-bg-1 p-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-fg-2">
          {find.raw}
        </pre>
      </details>
    </div>
  );
}

export function AccountWatchForm({ w, set, cwd, minutes }: { w: AccountWatch; set: (p: Record<string, unknown>) => void; cwd: string; minutes: number }) {
  const [accounts, setAccounts] = useState<WatchAccount[] | null>(null);
  const [test, setTest] = useState<WatchPreview | null>(null);
  const [testing, setTesting] = useState(false);
  useEffect(() => {
    api<{ accounts: WatchAccount[] }>('/api/automations/accounts')
      .then((r) => {
        setAccounts(r.accounts);
        const first = r.accounts.find((a) => !a.problem && a.tools.length);
        if (!w.app && first) set({ app: first.id, tool: first.presets[0]?.tool ?? first.tools[0]?.name ?? '', args: first.presets[0] && !first.presets[0].before ? first.presets[0].args : undefined });
      })
      .catch(() => setAccounts([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const acc = accounts?.find((a) => a.id === w.app);
  const tool = acc?.tools.find((t) => t.name === w.tool);
  const presets = useMemo(() => (acc?.presets ?? []).filter((p) => !!p.before === !!w.before), [acc, w.before]);
  const runTry = async (over: Partial<AccountWatch> = {}) => {
    const spec = { ...w, ...over } as WatchSpec;
    setTesting(true);
    try {
      const r = await post<WatchPreview>('/api/automations/watch/test', { watch: spec, cwd });
      setTest(r);
      // What it found is kept, so the watcher reads the same list and field from the first look on.
      if (r.find && r.find.list !== null) {
        const before = w.before || over.before ? { ...(w.before ?? {}), ...(over.before ?? {}) } : undefined;
        set({ ...over, list: r.find.list, ...(r.find.id ? { id: r.find.id } : {}), ...(before ? { before: { ...before, ...(r.find.start ? { start: r.find.start } : {}) } } : {}) });
      } else if (Object.keys(over).length) set(over);
    } catch (e) {
      setTest({ ok: false, note: (e as Error).message });
    } finally {
      setTesting(false);
    }
  };
  // A change to the account, tool or arguments: what Try it found no longer holds.
  const change = (p: Partial<AccountWatch>) => {
    setTest(null);
    const before: EventBefore | undefined = 'before' in p ? p.before : w.before;
    set({ ...p, list: undefined, id: undefined, before: before ? { ...before, start: undefined } : undefined });
  };
  if (accounts && !accounts.length)
    return (
      <p className="text-[12.5px] leading-relaxed text-fg-2">
        Connect an app first, such as a CRM, a cloud drive, a helpdesk or a calendar:{' '}
        <button type="button" onClick={() => go('/apps/connected?tab=market')} className="text-accent hover:underline">
          Apps → Connected apps
        </button>
        .
      </p>
    );
  const b = w.before;
  const lead = b?.evening ? 'evening' : String(b?.minutes ?? 30);
  return (
    <>
      <Field label="Account">
        <select value={w.app} onChange={(e) => {
          const a = accounts?.find((x) => x.id === e.target.value);
          const p = a?.presets.find((x) => !x.before);
          change({ app: e.target.value, tool: p?.tool ?? a?.tools[0]?.name ?? '', args: p?.args, before: undefined });
        }} className={cx(small, 'w-full')} translate="no">
          {!acc && <option value={w.app}>{w.app ? w.name ?? w.app : '—'}</option>}
          {(accounts ?? []).map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </Field>
      {acc?.problem && <p className="text-[12.5px] text-warn">{acc.problem}</p>}
      {acc && !acc.problem && (
        <>
          {acc.calendar && (
            <Segmented<'new' | 'before'>
              size="sm"
              value={b ? 'before' : 'new'}
              onChange={(v) => {
                const p = acc.presets.find((x) => (v === 'before' ? x.before : !x.before));
                change({ before: v === 'before' ? { minutes: 30 } : undefined, ...(p ? { tool: p.tool, args: p.args } : {}) });
              }}
              options={[
                { value: 'new', label: 'For each new item' },
                { value: 'before', label: 'Before each event' },
              ]}
            />
          )}
          {presets.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[12px] text-fg-3">Start from:</span>
              {presets.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => change({ tool: p.tool, args: p.args })}
                  className={cx('rounded-full border px-2.5 py-0.5 text-[12px]', w.tool === p.tool && JSON.stringify(w.args ?? {}) === JSON.stringify(p.args) ? 'border-accent/60 bg-accent/10 text-fg' : 'border-line-2 text-fg-2 hover:bg-hover')}
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}
          <Field
            label="Tool"
            hint={
              acc.skipped.outside && acc.skipped.notOn
                ? `Only tools that look are offered: ${acc.skipped.outside} that send, change or delete things are left out, and ${acc.skipped.notOn} set to Ask first or Off.`
                : acc.skipped.outside
                  ? `Only tools that look are offered: ${acc.skipped.outside} that send, change or delete things are left out.`
                  : acc.skipped.notOn
                    ? `Only tools that look are offered: ${acc.skipped.notOn} set to Ask first or Off are left out.`
                    : undefined
            }
          >
            <select value={w.tool} onChange={(e) => change({ tool: e.target.value, args: undefined })} className={cx(small, 'w-full font-mono')} translate="no">
              {!tool && <option value={w.tool}>{w.tool || '—'}</option>}
              {acc.tools.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
          {tool?.description && (
            <p translate="no" className="-mt-1 line-clamp-2 text-[12px] leading-snug text-fg-3">
              {tool.description}
            </p>
          )}
          {tool && <ToolArgs key={`${w.app}/${w.tool}`} schema={tool.schema} args={w.args ?? {}} set={(args) => change({ args: Object.keys(args).length ? args : undefined })} />}
          {b && (
            <div className="space-y-2 rounded-lg bg-bg-1 p-2.5">
              <div className="flex flex-wrap items-end gap-2">
                <Field label="Start a run" className="w-auto">
                  <select
                    value={lead}
                    onChange={(e) => set({ before: { ...b, ...(e.target.value === 'evening' ? { evening: b.evening ?? '18:00', minutes: undefined } : { minutes: Number(e.target.value), evening: undefined }) } })}
                    className={cx(small, 'w-auto')}
                  >
                    {LEADS.map((l) => (
                      <option key={l.value} value={l.value}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                </Field>
                {b.evening ? (
                  <Field label="At" className="w-28">
                    <input type="time" value={b.evening} onChange={(e) => set({ before: { ...b, evening: e.target.value || '18:00' } })} className={cx(small, 'w-full')} />
                  </Field>
                ) : (
                  <span className="pb-2 text-[12.5px] text-fg-2">before each event</span>
                )}
                <Field label="Title contains" className="min-w-[9rem] flex-1">
                  <input value={b.title ?? ''} onChange={(e) => set({ before: { ...b, title: e.target.value || undefined } })} placeholder="Client call" className={cx(small, 'w-full')} />
                </Field>
              </div>
              <label className="flex items-center gap-2 text-[12.5px] text-fg-2">
                <input type="checkbox" checked={!!b.others} onChange={(e) => set({ before: { ...b, others: e.target.checked || undefined } })} className="accent-[var(--accent)]" />
                Only events with other people
              </label>
              <p className="text-[11.5px] leading-snug text-fg-3">
                {`It reads the upcoming events at each check (every ${minutes} min) and at each event’s moment. An event that moves gets its run before its new time; a cancelled one gets none.`}
              </p>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" icon={<Play size={13} />} onClick={() => runTry()} disabled={testing || !w.tool}>
              {testing ? 'Calling…' : 'Try it'}
            </Button>
            <span className="text-[12px] text-fg-3">Calls the tool once and shows what came back, and where the items are.</span>
          </div>
          {test && (
            <div className={cx('space-y-2 rounded-lg border px-3 py-2', test.ok ? 'border-line bg-bg-1' : 'border-err/30 bg-err/5')}>
              <div className={cx('text-[12.5px] font-medium', test.ok ? 'text-fg' : 'text-err')}>{test.note}</div>
              {test.find && <Found find={test.find} w={w} set={set} retry={(p) => runTry(p)} />}
            </div>
          )}
          <p className="text-[12px] leading-relaxed text-fg-3">
            {b
              ? 'Each event starts a run of its own at its moment (at most 10 at a check), with the event as outside data. The first look only takes note.'
              : 'Each new item starts a run of its own (at most 10 at a check), with the item as outside data; an item never starts two runs. The first look only takes note. Ask the tool for the newest first, and enough of them, where it can.'}
          </p>
        </>
      )}
    </>
  );
}
