// New evaluation and Edit: one window in four sections (what it scores, what must not change, the final test, where
// it runs). A wide window has the sections in a column at the left, each with its value now, and one section's fields
// beside it; on a phone the sections fold open one at a time. Saving seals the files, which takes a while for large
// folders; a change that seals again asks first. New also offers to have an agent set it up.
import { useEffect, useState, type ReactNode } from 'react';
import { ChevronDown, Cpu, FlaskConical, Gauge, Lock, Plus, Sparkles, X } from 'lucide-react';
import { TEST_READABLE, type Evaluation } from '@shared/evaluations';
import { api, enc, post, put } from '../../lib/api';
import { toast, useApp } from '../../lib/store';
import { FolderPicker } from '../../components/FolderPicker';
import { Button, cx, Dialog, IconButton, inputCls, Segmented, Throbber, useConfirm, useMediaQuery } from '../../components/ui';
import { ScrollPane } from '../assistants/AgentEditor';
import { askAgent } from '../git/parts';
import { evalUrl } from './evalApi';
import { betterWords, hasSeed, SEAL_AGAIN, SETUP_REQUEST } from './evalWords';
import { tr } from '../../i18n/runtime';

export type EditorSection = 'what' | 'protect' | 'final' | 'where';

const SECTIONS: { id: EditorSection; label: string; icon: ReactNode }[] = [
  { id: 'what', label: 'What it scores', icon: <Gauge size={16} /> },
  { id: 'protect', label: 'What must not change', icon: <Lock size={16} /> },
  { id: 'final', label: 'Final test', icon: <FlaskConical size={16} /> },
  { id: 'where', label: 'Where it runs', icon: <Cpu size={16} /> },
];

/** The folder New run asked for last: the same one here. */
const LAST_CWD = 'naget.experiments.cwd';

interface Form {
  name: string;
  cwd: string;
  command: string;
  metric: string;
  better: Evaluation['better'];
  protect: string[];
  seeds: string;
  finalCommand: string;
  heldOut: string;
  gpus: string;
  mem: string;
  hours: string;
}

const formOf = (ev: Evaluation | undefined, cwd: string): Form => ({
  name: ev?.name ?? '',
  cwd: ev?.cwd ?? cwd,
  command: ev?.command ?? '',
  metric: ev?.metric ?? '',
  better: ev?.better ?? 'higher',
  protect: ev?.protect ?? [],
  seeds: (ev?.seeds ?? [1, 2, 3]).join(', '),
  finalCommand: ev?.final?.command ?? '',
  heldOut: ev?.final?.heldOut ?? '',
  gpus: ev ? (ev.gpus === undefined ? '' : String(ev.gpus)) : '0',
  mem: ev?.gpuMemGb ? String(ev.gpuMemGb) : '',
  hours: ev?.hours ? String(ev.hours) : '',
});

const seedList = (s: string) => s.split(/[\s,]+/).filter(Boolean);

/** What a change to any of these seals again: they say what is scored and how (as the server compares them). */
const sealedPart = (f: Form) =>
  JSON.stringify([f.cwd.trim(), f.command.trim(), f.metric.trim(), f.better, seedList(f.seeds).map(Number), f.protect, f.finalCommand.trim(), f.finalCommand.trim() ? f.heldOut.trim() : '']);

function bodyOf(f: Form, editing: boolean): Record<string, unknown> {
  const test = f.finalCommand.trim();
  const b: Record<string, unknown> = {
    name: f.name.trim(),
    cwd: f.cwd.trim(),
    command: f.command.trim(),
    metric: f.metric.trim(),
    better: f.better,
    seeds: seedList(f.seeds),
    protect: f.protect,
  };
  if (test) b.final = { command: test, ...(f.heldOut.trim() ? { heldOut: f.heldOut.trim() } : {}) };
  else if (editing) b.final = null;
  // Changing one, an emptied field takes its value away.
  if (f.gpus.trim() || editing) b.gpus = f.gpus.trim();
  if (f.gpus.trim() !== '0' && f.mem.trim()) b.gpuMemGb = Number(f.mem);
  else if (editing) b.gpuMemGb = '';
  if (f.hours.trim() || editing) b.hours = f.hours.trim();
  return b;
}

function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1 block text-fg-2">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[12px] leading-relaxed text-fg-3">{hint}</span>}
    </label>
  );
}

/** The sealed files and folders: those picked, one to add by name, and what the command suggests. */
function Protect({ form, set }: { form: Form; set: (p: Partial<Form>) => void }) {
  const [text, setText] = useState('');
  const [suggested, setSuggested] = useState<string[]>([]);
  const cwd = form.cwd.trim();
  const command = form.command.trim();
  useEffect(() => {
    if (!cwd || !command) return setSuggested([]);
    let live = true;
    const t = window.setTimeout(() => {
      api<{ suggestions: string[] }>(`/api/experiments/evaluations/suggest?cwd=${enc(cwd)}&command=${enc(command)}`)
        .then((r) => live && setSuggested(r.suggestions))
        .catch(() => live && setSuggested([]));
    }, 300);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [cwd, command]);
  const bare = (p: string) => p.replace(/\/+$/, '');
  const have = new Set(form.protect.map(bare));
  const add = (p: string) => {
    const v = p.trim();
    if (v && !have.has(bare(v))) set({ protect: [...form.protect, v] });
  };
  const addTyped = () => {
    add(text);
    setText('');
  };
  const offered = suggested.filter((s) => !have.has(bare(s)));
  return (
    <div className="space-y-3">
      {form.protect.length > 0 && (
        <ul className="divide-y divide-line rounded-xl border border-line bg-panel">
          {form.protect.map((p) => (
            <li key={p} className="flex items-center gap-2 py-1 pr-1.5 pl-3">
              <span translate="no" className="min-w-0 flex-1 font-mono text-[12.5px] break-all">
                {p}
              </span>
              <IconButton label="Remove" size="sm" onClick={() => set({ protect: form.protect.filter((x) => x !== p) })}>
                <X size={14} />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            addTyped();
          }}
          onBlur={addTyped}
          aria-label="A file or folder to protect"
          placeholder="eval.py or data/dev/"
          spellCheck={false}
          className={cx(inputCls, 'min-w-0 flex-1 font-mono text-[12.5px]')}
        />
        <Button variant="secondary" icon={<Plus size={14} />} onClick={addTyped} disabled={!text.trim()}>
          Add
        </Button>
      </div>
      {offered.length > 0 && (
        <div>
          <p className="mb-1.5 text-[12px] text-fg-3">Suggested from your command</p>
          <div className="flex flex-wrap gap-1.5">
            {offered.map((s) => (
              <button key={s} type="button" onClick={() => add(s)} className="inline-flex min-h-8 max-w-full items-center gap-1 rounded-full border border-line-2 px-2.5 text-left hover:bg-bg-2">
                <Plus size={12} className="shrink-0 text-fg-3" />
                <span translate="no" className="min-w-0 font-mono text-[12px] break-all">
                  {s}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      <p className="text-[12px] leading-relaxed text-fg-3">The scorer, its helpers and the data it scores against. No score is given while one of them differs.</p>
    </div>
  );
}

function summaryOf(id: EditorSection, f: Form): { text: string; own?: boolean } {
  if (id === 'what') return f.metric.trim() ? { text: `${f.metric.trim()} · ${tr(betterWords(f.better))}`, own: true } : { text: 'Not filled in' };
  if (id === 'protect') return { text: f.protect.length === 0 ? 'Nothing yet' : f.protect.length === 1 ? '1 file or folder' : `${f.protect.length} files and folders` };
  if (id === 'final') return { text: !f.finalCommand.trim() ? 'None' : f.heldOut.trim() ? 'With held-out data' : 'Without held-out data' };
  const gpus = f.gpus.trim() === '' ? null : Number(f.gpus);
  const words = gpus === null ? 'This computer' : gpus === 0 ? 'No GPU' : gpus === 1 ? '1 GPU' : `${gpus} GPUs`;
  return { text: f.hours.trim() ? `${tr(words)}, ${tr(`at most ${f.hours.trim()} h`)}` : words, own: !!f.hours.trim() };
}

export function EvaluationEditor({ open, evaluation, section, onClose, onSaved }: { open: boolean; evaluation?: Evaluation; section?: EditorSection; onClose: () => void; onSaved: (evaluation: Evaluation) => void }) {
  const home = useApp((s) => s.boot?.home) ?? '';
  const defaultCwd = useApp((s) => s.boot?.defaultCwd) ?? home;
  const wide = useMediaQuery('(min-width: 640px)');
  const [confirm, confirmNode] = useConfirm();
  const [form, setForm] = useState<Form>(() => formOf(undefined, ''));
  const [first, setFirst] = useState<Form>(() => formOf(undefined, ''));
  const [at, setAt] = useState<EditorSection | null>('what');
  const [busy, setBusy] = useState<'seal' | 'save' | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Filled in as it opens.
  useEffect(() => {
    if (!open) return;
    const f = formOf(evaluation, localStorage.getItem(LAST_CWD) ?? defaultCwd);
    setForm(f);
    setFirst(f);
    setAt(section ?? 'what');
    setBusy(null);
    setError(null);
    // A computer with GPUs: each run takes one, unless you say (as New run).
    if (!evaluation)
      api<{ gpus: unknown[] }>('/api/experiments/queue')
        .then((q) => {
          if (!q.gpus.length) return;
          setForm((x) => (x.gpus === '0' ? { ...x, gpus: '1' } : x));
          setFirst((x) => ({ ...x, gpus: '1' }));
        })
        .catch(() => {});
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Whether the held-out folder as typed is one agents in the project can read: the server knows the project.
  const [heldRead, setHeldRead] = useState(false);
  const heldOut = form.heldOut.trim();
  const folder = form.cwd.trim();
  useEffect(() => {
    setHeldRead(false);
    if (!open || !heldOut || !folder) return;
    let on = true;
    const t = setTimeout(() => {
      api<{ testReadable?: boolean }>(`/api/experiments/evaluations/suggest?cwd=${enc(folder)}&heldOut=${enc(heldOut)}`)
        .then((r) => on && setHeldRead(!!r.testReadable))
        .catch(() => {});
    }, 300);
    return () => {
      on = false;
      clearTimeout(t);
    };
  }, [open, folder, heldOut]);

  const set = (p: Partial<Form>) => {
    setForm((f) => ({ ...f, ...p }));
    setError(null);
  };
  const editing = !!evaluation;
  const dirty = JSON.stringify(form) !== JSON.stringify(first);
  const reseals = editing && sealedPart(form) !== sealedPart(first);
  const missing: EditorSection[] = [];
  if (!form.name.trim() || !form.cwd.trim() || !form.command.trim() || !form.metric.trim()) missing[missing.length] = 'what';
  if (!form.protect.length) missing[missing.length] = 'protect';

  const requestClose = async () => {
    if (busy) return;
    if (dirty && !(await confirm({ title: editing ? 'Discard your changes?' : 'Discard this evaluation?', body: 'What you set here is not saved.', confirm: 'Discard', danger: true }))) return;
    onClose();
  };

  const save = async () => {
    if (reseals && !(await confirm({ title: 'Seal again?', body: SEAL_AGAIN, confirm: 'Save and seal again' }))) return;
    setBusy(!editing || reseals ? 'seal' : 'save');
    setError(null);
    try {
      const body = bodyOf(form, editing);
      const r = editing ? await put<{ evaluation: Evaluation }>(evalUrl(evaluation.id), body) : await post<{ evaluation: Evaluation }>('/api/experiments/evaluations', body);
      try {
        localStorage.setItem(LAST_CWD, form.cwd.trim());
      } catch {}
      toast(!editing || reseals ? 'Sealed' : 'Saved', 'ok');
      onClose();
      onSaved(r.evaluation);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const setUpWithAgent = () => {
    onClose();
    askAgent(tr(SETUP_REQUEST), form.cwd.trim().replace(/^~(?=$|\/)/, home));
  };

  const pane = (id: EditorSection): ReactNode => {
    if (id === 'what')
      return (
        <div className="space-y-3.5">
          <Field label="Name">
            <input value={form.name} onChange={(e) => set({ name: e.target.value })} maxLength={80} autoFocus={!editing && wide} placeholder="Dev queries" className={inputCls} />
          </Field>
          <div>
            <span className="mb-1 block text-fg-2">Folder</span>
            <FolderPicker value={form.cwd} onChange={(cwd) => set({ cwd })} />
          </div>
          <Field label="Command that scores" hint="Write {seed} where the seed goes, to score with several seeds.">
            <textarea
              value={form.command}
              onChange={(e) => set({ command: e.target.value })}
              rows={2}
              spellCheck={false}
              placeholder="python eval.py --split dev --seed {seed}"
              className={cx(inputCls, 'h-auto min-h-[64px] py-2 font-mono text-[12.5px] leading-relaxed')}
            />
          </Field>
          <Field label="The number that counts" hint="As the command prints it, like ndcg@10=0.412.">
            <input value={form.metric} onChange={(e) => set({ metric: e.target.value })} spellCheck={false} placeholder="ndcg@10" className={cx(inputCls, 'font-mono text-[12.5px]')} />
          </Field>
          <Segmented
            size="sm"
            value={form.better}
            onChange={(better) => set({ better })}
            options={[
              { value: 'higher', label: 'Higher is better' },
              { value: 'lower', label: 'Lower is better' },
            ]}
          />
        </div>
      );
    if (id === 'protect')
      return (
        <div className="space-y-4">
          <Protect form={form} set={set} />
          {hasSeed(form.command) && (
            <Field label="Seeds" hint="One run for each: 1, 2, 3 unless you change them.">
              <input value={form.seeds} onChange={(e) => set({ seeds: e.target.value.replace(/[^\d,\s-]/g, '') })} inputMode="numeric" className={cx(inputCls, 'tnum')} />
            </Field>
          )}
        </div>
      );
    if (id === 'final')
      return (
        <div className="space-y-3.5">
          <p className="leading-relaxed text-fg-3">Optional. A last check on data nothing was tuned on, run by you alone, rarely.</p>
          <Field label="Command of the final test">
            <textarea
              value={form.finalCommand}
              onChange={(e) => set({ finalCommand: e.target.value })}
              rows={2}
              spellCheck={false}
              placeholder="python eval.py --split test --seed {seed}"
              className={cx(inputCls, 'h-auto min-h-[64px] py-2 font-mono text-[12.5px] leading-relaxed')}
            />
          </Field>
          <div>
            <span className="mb-1 block text-fg-2">Held-out folder</span>
            <FolderPicker value={form.heldOut} onChange={(heldOut) => set({ heldOut })} />
            <p className="mt-1 text-[12px] leading-relaxed text-fg-3">A folder outside the project that only the final test gets: agents working in the project do not see it there. Your command finds it as $HYDOR_HELD_OUT.</p>
            {!!form.finalCommand.trim() && (!heldOut || heldRead) && <p className="mt-1 text-[12px] leading-relaxed text-fg-3">{TEST_READABLE}</p>}
          </div>
        </div>
      );
    return (
      <div className="space-y-3.5">
        <p className="text-fg-3">On this computer.</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="GPUs">
            <input value={form.gpus} onChange={(e) => set({ gpus: e.target.value.replace(/\D/g, '').slice(0, 2) })} inputMode="numeric" className={cx(inputCls, 'tnum')} />
          </Field>
          {form.gpus !== '0' ? (
            <Field label="Free memory each (GB)">
              <input value={form.mem} onChange={(e) => set({ mem: e.target.value.replace(/[^\d.]/g, '') })} inputMode="decimal" placeholder="Any free GPU" className={cx(inputCls, 'tnum')} />
            </Field>
          ) : (
            <div />
          )}
        </div>
        <Field label="Time limit (hours)" className="max-w-[180px]">
          <input value={form.hours} onChange={(e) => set({ hours: e.target.value.replace(/[^\d.]/g, '') })} inputMode="decimal" className={cx(inputCls, 'tnum')} />
        </Field>
      </div>
    );
  };

  const summary = (id: EditorSection) => {
    const s = summaryOf(id, form);
    return (
      <span translate={s.own ? 'no' : undefined} className="block truncate text-[12px] text-fg-3">
        {s.text}
      </span>
    );
  };
  const cur = at ?? 'what';
  const need = missing.length ? (missing[0] === 'what' ? 'Fill in what it scores to save it.' : 'Say what must not change to save it.') : '';

  return (
    <>
      <Dialog open={open} bare label={editing ? 'Edit evaluation' : 'New evaluation'} width={760} part="experiments" onClose={requestClose}>
        <div data-i18n="experiments" className="flex h-[92dvh] min-h-0 flex-col text-[13px] sm:h-[min(640px,90dvh)]">
          <div className="flex shrink-0 items-center gap-2 border-b border-line px-5 pt-3.5 pb-3">
            <h2 className="min-w-0 flex-1 truncate text-[16px] font-semibold tracking-tight">{editing ? 'Edit evaluation' : 'New evaluation'}</h2>
            <IconButton label="Close" size="sm" onClick={requestClose}>
              <X size={16} />
            </IconButton>
          </div>
          {!editing && (
            <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line bg-bg-1 px-5 py-2">
              <span className="text-fg-2">Not sure what to fill in?</span>
              <Button size="sm" variant="secondary" icon={<Sparkles size={13} />} onClick={setUpWithAgent}>
                Set it up with an agent
              </Button>
            </div>
          )}
          <div className="flex min-h-0 flex-1">
            {wide ? (
              <>
                <nav aria-label="Sections" className="w-[230px] shrink-0 space-y-0.5 overflow-y-auto border-r border-line p-2">
                  {SECTIONS.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      aria-current={s.id === cur ? 'true' : undefined}
                      onClick={() => setAt(s.id)}
                      className={cx('flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors', s.id === cur ? 'bg-bg-2' : 'hover:bg-bg-1')}
                    >
                      <span className={cx('mt-0.5 shrink-0', s.id === cur ? 'text-fg' : 'text-fg-3')}>{s.icon}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13.5px] leading-snug font-medium text-fg">{s.label}</span>
                        {summary(s.id)}
                      </span>
                    </button>
                  ))}
                </nav>
                <ScrollPane key={cur} className="px-6 py-5">
                  <h3 className="mb-4 text-[15px] font-semibold">{SECTIONS.find((s) => s.id === cur)!.label}</h3>
                  {pane(cur)}
                </ScrollPane>
              </>
            ) : (
              <ScrollPane className="p-3">
                <div className="divide-y divide-line rounded-xl border border-line bg-panel">
                  {SECTIONS.map((s) => {
                    const on = s.id === at;
                    return (
                      <section key={s.id}>
                        <button type="button" aria-expanded={on} onClick={() => setAt(on ? null : s.id)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-bg-2 text-fg-2">{s.icon}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[13.5px] font-medium text-fg">{s.label}</span>
                            {summary(s.id)}
                          </span>
                          <ChevronDown size={16} className={cx('shrink-0 text-fg-3 transition-transform', on && 'rotate-180')} />
                        </button>
                        {on && <div className="px-3 pt-1 pb-4">{pane(s.id)}</div>}
                      </section>
                    );
                  })}
                </div>
              </ScrollPane>
            )}
          </div>
          {error && <p className="mx-4 mb-1 max-h-24 shrink-0 overflow-y-auto rounded-lg bg-err/10 px-3 py-2 leading-relaxed break-words text-err">{error}</p>}
          <div className="flex shrink-0 items-center gap-2 border-t border-line px-4 py-3 pb-[max(12px,var(--safe-bottom))] sm:px-5">
            <span className="min-w-0 flex-1 text-[12.5px] leading-snug text-fg-3">
              {busy === 'seal' ? (
                <span className="flex items-center gap-2">
                  <Throbber size={14} />
                  <span>Large folders take a while.</span>
                </span>
              ) : (
                need
              )}
            </span>
            <Button variant="ghost" onClick={requestClose} disabled={!!busy}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save} disabled={!!busy || missing.length > 0 || (editing && !dirty)}>
              {busy === 'seal' ? 'Sealing…' : busy === 'save' ? 'Saving…' : editing ? 'Save' : 'Create and seal'}
            </Button>
          </div>
        </div>
      </Dialog>
      {confirmNode}
    </>
  );
}
