// The tour's model steps, made for a first look rather than for every option (Settings → Models keeps
// those): OpenRouter is a key and a few models picked from a short list; this computer is what it has,
// what runs well on it, and a click to get one. Both read and change the same state as Settings.
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { ArrowUpRight, Check, Cpu, Download, KeyRound, Plus, Search, X } from 'lucide-react';
import type { HfInspect, HfModel, HfQuant, LocalModel, ModelDownload, ModelFit, ModelsState, OpenRouterModel } from '@shared/types';
import { api, post, put } from '../../lib/api';
import { toast, toastError } from '../../lib/store';
import { Button, cx, Throbber } from '../../components/ui';
import { aboutParams, count, dollars, paramsShort, repoOf, shortGpu, size, tokens, useModels } from '../settings/ModelsSettings';

/** Rows of a list on one quiet panel. */
const panel = 'overflow-hidden rounded-2xl bg-panel/60 ring-1 ring-line divide-y divide-line';

function Wait() {
  return (
    <div className="flex justify-center py-8 text-fg-3">
      <Throbber size={24} />
    </div>
  );
}

/** A small heading over a list, and what goes with it on the right. */
function Label({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-2.5 flex min-h-6 items-center gap-3 text-[13px]">
      <span className="font-medium text-fg-2">{children}</span>
      <span className="flex-1" />
      {aside}
    </div>
  );
}

/** A maker's initial on a tile of its own colour. */
function Mark({ name }: { name: string }) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return (
    <span className="org-mark flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[13.5px] font-semibold" style={{ '--h': h } as CSSProperties} aria-hidden>
      {name.replace(/^~/, '').charAt(0).toUpperCase()}
    </span>
  );
}

/** The search box: large and quiet, with a throbber while it looks and a way to clear it. */
function Find({ value, onChange, placeholder, busy, onEnter }: { value: string; onChange: (v: string) => void; placeholder: string; busy?: boolean; onEnter?: () => void }) {
  return (
    <div className="relative">
      <Search size={17} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-fg-3" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onEnter?.()}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
        className="h-12 w-full rounded-xl bg-panel/70 pr-11 pl-11 text-[15px] text-fg ring-1 ring-line transition-[box-shadow,background-color] outline-none placeholder:text-fg-3 focus:bg-panel focus:ring-2 focus:ring-accent/45"
      />
      {busy ? (
        <Throbber className="absolute top-1/2 right-4 -translate-y-1/2 text-fg-3" />
      ) : (
        value && (
          <button type="button" aria-label="Clear" onClick={() => onChange('')} className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded-lg p-1.5 text-fg-3 hover:bg-fg/[0.06] hover:text-fg">
            <X size={15} />
          </button>
        )
      )}
    </div>
  );
}

/** Show all of a long list, or the first few again. */
function More({ n, open, onToggle }: { n: number; open: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} className="text-[13px] font-medium text-fg-3 transition-colors hover:text-fg">
      {open ? 'Show fewer' : `Show all ${n}`}
    </button>
  );
}

const FIRST = 6;

// ---- OpenRouter ----------------------------------------------------------------------------------------

/** OpenRouter: its key, then the models it brings into the pickers. */
export function TourOpenRouter() {
  const st = useModels();
  if (!st) return <Wait />;
  return st.openrouter.keyHint ? <OrModels st={st} /> : <OrKey />;
}

function OrKey() {
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const connect = async () => {
    setBusy(true);
    try {
      await put('/api/models', { openrouterKey: key.trim() });
      setKey('');
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (key.trim() && !busy) void connect();
        }}
        className="flex items-center gap-2 rounded-xl bg-panel/70 p-1.5 pl-4 ring-1 ring-line transition-[box-shadow] focus-within:ring-2 focus-within:ring-accent/45"
      >
        <KeyRound size={17} className="shrink-0 text-fg-3" />
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="Paste your OpenRouter key: sk-or-…"
          autoComplete="off"
          spellCheck={false}
          className="h-9 min-w-0 flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-fg-3"
        />
        <Button type="submit" variant="primary" className="h-9 rounded-lg px-4" disabled={!key.trim() || busy}>
          {busy ? 'Connecting…' : 'Connect'}
        </Button>
      </form>
      <p className="mt-3 text-[13.5px] leading-relaxed text-fg-3">
        No key yet?{' '}
        <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-medium text-accent hover:underline">
          Create one at openrouter.ai
          <ArrowUpRight size={13} />
        </a>{' '}
        Make an account there, add some credit, and create a key. You pay OpenRouter only for what you use.
      </p>
    </div>
  );
}

function OrModels({ st }: { st: ModelsState }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<OpenRouterModel[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [all, setAll] = useState(false);
  const words = q.trim();
  useEffect(() => {
    let alive = true;
    setAll(false);
    // Before any words: the newest that call tools, as Custom works through them.
    const p = new URLSearchParams(words ? { q: words } : { q: '', sort: 'new', f: 'tools' });
    setBusy(true);
    const t = setTimeout(
      () =>
        api<{ models: OpenRouterModel[] }>(`/api/models/openrouter?${p}`)
          .then((r) => alive && setHits(r.models), toastError)
          .finally(() => alive && setBusy(false)),
      words ? 220 : 0,
    );
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [words]);
  const pinned = new Set(st.openrouter.pinned.map((m) => m.id));
  const save = (body: Record<string, unknown>) => put('/api/models', body).catch(toastError);
  const list = hits ?? [];
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13.5px]">
        <span className="h-2 w-2 rounded-full bg-ok shadow-[0_0_0_3px_color-mix(in_srgb,var(--ok)_18%,transparent)]" />
        <span className="font-medium text-fg">Connected</span>
        <span className="font-mono text-[12.5px] text-fg-3">{st.openrouter.keyHint}</span>
        <button type="button" onClick={() => save({ openrouterKey: null })} className="text-fg-3 underline-offset-2 transition-colors hover:text-fg hover:underline">
          Use another key
        </button>
      </div>
      <div>
        <Label>Your models</Label>
        {st.openrouter.pinned.length ? (
          <div className="flex flex-wrap gap-2">
            {st.openrouter.pinned.map((m) => (
              <span key={m.id} className="anim-pop-in inline-flex h-9 max-w-full items-center gap-1.5 rounded-full bg-accent/10 pr-1.5 pl-3.5 text-[13.5px] font-medium text-fg ring-1 ring-accent/30">
                <span className="truncate">{m.label}</span>
                <button type="button" aria-label={`Remove ${m.label}`} title="Take it out of the pickers" onClick={() => save({ unpin: m.id })} className="shrink-0 rounded-full p-1 text-fg-3 transition-colors hover:bg-fg/[0.08] hover:text-fg">
                  <X size={13} />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-[13.5px] text-fg-3">None yet. Add one or more below: you pick them under the message box when Custom is the agent.</p>
        )}
      </div>
      <div>
        <Find value={q} onChange={setQ} placeholder="Search hundreds of models: deepseek, qwen, claude…" busy={busy} />
        {hits && (
          <div className="mt-6">
            <Label aside={list.length > FIRST && <More n={list.length} open={all} onToggle={() => setAll((x) => !x)} />}>
              {words ? (list.length ? 'Found' : 'Nothing found by that name') : 'The newest that can do tasks'}
            </Label>
            {list.length > 0 && (
              <div className={panel}>
                {(all ? list : list.slice(0, FIRST)).map((m) => (
                  <OrRow key={m.id} m={m} added={pinned.has(m.id)} onToggle={() => save(pinned.has(m.id) ? { unpin: m.id } : { pin: m.id })} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** One model: who makes it, how much it reads at once, its price per million tokens, and Add. */
function OrRow({ m, added, onToggle }: { m: OpenRouterModel; added: boolean; onToggle: () => void }) {
  const free = !!m.price && m.price.input === 0 && m.price.output === 0;
  const org = m.org ?? (m.detail ?? m.id).replace(/^openrouter\//, '').replace(/^~/, '').split('/')[0];
  const facts = [
    org,
    m.contextLength ? `${tokens(m.contextLength)} context` : '',
    free ? 'free' : m.price ? `${dollars(m.price.input)} in, ${dollars(m.price.output)} out` : '',
    m.tools && m.tools !== 'native' ? 'less reliable at tasks' : '',
  ].filter(Boolean);
  return (
    <div className="flex items-center gap-3.5 px-4 py-3 transition-colors hover:bg-fg/[0.025]">
      <Mark name={org} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-medium text-fg">{m.label}</div>
        <div className="tnum mt-0.5 text-[12.5px] text-fg-3 sm:truncate" title="Context: how much it can read at once. Prices are per million tokens (a token is about ¾ of a word): in is what it reads, out is what it writes">
          {facts.join(' · ')}
        </div>
      </div>
      <Toggle on={added} onClick={onToggle} name={m.label} />
    </div>
  );
}

/** Add, or Added (a click takes it out again). */
function Toggle({ on, onClick, name }: { on: boolean; onClick: () => void; name: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      aria-label={on ? `Take ${name} out` : `Add ${name}`}
      className={cx(
        'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium transition-colors',
        on ? 'bg-accent/15 text-accent hover:bg-accent/25' : 'text-fg-2 ring-1 ring-line-2 hover:bg-fg/[0.06] hover:text-fg',
      )}
    >
      {on ? <Check size={14} strokeWidth={2.6} className="anim-pop-in" /> : <Plus size={14} />}
      {on ? 'Added' : 'Add'}
    </button>
  );
}

// ---- this computer ---------------------------------------------------------------------------------

/** Models on this computer: what it has, what is here or coming, and Hugging Face for more. */
export function TourLocal() {
  const st = useModels();
  if (!st) return <Wait />;
  return (
    <div className="space-y-8">
      <Machine st={st} />
      <Here st={st} />
      <FromHf st={st} />
    </div>
  );
}

/** The graphics, memory and disk in words, the two runtimes, and how big a model runs well here. */
function Machine({ st }: { st: ModelsState }) {
  const m = st.machine;
  const kinds = new Map<string, number>();
  for (const g of m.gpus) kinds.set(shortGpu(g.name), (kinds.get(shortGpu(g.name)) ?? 0) + 1);
  const gpus = [...kinds].map(([n, k]) => `${k > 1 ? `${k} × ` : ''}${n}`).join(' + ');
  const each = m.gpus.length ? `${size(Math.max(...m.gpus.map((g) => g.totalBytes)))}${m.gpus.length > 1 ? ' each' : ''}` : '';
  const best = [...m.gpus].sort((a, b) => b.freeBytes - a.freeBytes)[0];
  return (
    <div>
      <div className="flex items-start gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent/12 text-accent">
          <Cpu size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[18px] leading-tight font-semibold tracking-tight text-fg">{gpus || 'No graphics card'}</div>
          <div className="mt-1 text-[13.5px] text-fg-3">{[each, `${size(m.ramBytes)} of memory`, `${size(st.storage.freeBytes)} free for models`].filter(Boolean).join(' · ')}</div>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[13px]">
            <Runtime name="Ollama" version={st.ollama.version} get="https://ollama.com/download" />
            <Runtime name="vLLM" version={st.vllm.path ? (st.vllm.version ?? 'found') : undefined} hint="Optional, for advanced setups: pip install vllm, for NVIDIA cards" />
          </div>
        </div>
      </div>
      <p className="mt-5 flex items-center gap-2 text-[14px] text-fg-2">
        <Check size={15} strokeWidth={2.6} className="shrink-0 text-ok" />
        {best ? `Models up to about ${aboutParams(best.freeBytes)}B in size (billions of parameters, a model’s size) run well here.` : 'Small models run here, slowly; bigger ones need a graphics card.'}
      </p>
    </div>
  );
}

/** A runtime with its version, or how to get it. */
function Runtime({ name, version, get, hint }: { name: string; version?: string; get?: string; hint?: string }) {
  if (version)
    return (
      <span className="inline-flex items-center gap-2 text-fg-2">
        <span className="h-1.5 w-1.5 rounded-full bg-ok" />
        {name} <span className="text-fg-3">{version}</span>
      </span>
    );
  return (
    <span className="inline-flex items-center gap-2 text-fg-3" title={hint}>
      <span className="h-1.5 w-1.5 rounded-full ring-1 ring-line-2" />
      {name}
      {get ? (
        <a href={get} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-medium text-accent hover:underline">
          Install
          <ArrowUpRight size={12} />
        </a>
      ) : (
        <span>not installed</span>
      )}
    </span>
  );
}

/** What is on this computer, and what is on its way. */
function Here({ st }: { st: ModelsState }) {
  const coming = st.downloads.filter((d) => d.status === 'running' || d.status === 'failed');
  if (!st.local.length && !coming.length) return null;
  return (
    <div>
      <Label>On this computer</Label>
      <div className={panel}>
        {coming.map((d) => (
          <Coming key={d.key} d={d} />
        ))}
        {st.local.map((m) => (
          <Have key={m.id} m={m} />
        ))}
      </div>
    </div>
  );
}

function Coming({ d }: { d: ModelDownload }) {
  const pct = d.totalBytes ? Math.min(100, (d.doneBytes / d.totalBytes) * 100) : 0;
  return (
    <div className="flex items-center gap-3.5 px-4 py-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-bg-2 text-fg-3">
        <Download size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-medium text-fg">{d.name.replace(/^hf\.co\//, '')}</div>
        {d.status === 'failed' ? (
          <div className="mt-0.5 truncate text-[12.5px] text-err">{d.error ?? 'The download stopped'}</div>
        ) : (
          <div className="mt-1.5 flex items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-fg/10">
              <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${pct || 3}%` }} />
            </div>
            <span className="tnum shrink-0 text-[12px] text-fg-3">{d.totalBytes ? `${Math.floor(pct)}%` : size(d.doneBytes)}</span>
          </div>
        )}
      </div>
      <Button size="sm" variant="ghost" className="rounded-full" onClick={() => post('/api/models/cancel', { key: d.key }).catch(toastError)}>
        {d.status === 'running' ? 'Cancel' : 'Dismiss'}
      </Button>
    </div>
  );
}

function Have({ m }: { m: LocalModel }) {
  return (
    <div className="flex items-center gap-3.5 px-4 py-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ok/12 text-ok">
        <Check size={16} strokeWidth={2.6} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-medium text-fg">{m.repo}</div>
        <div className="mt-0.5 truncate text-[12.5px] text-fg-3">
          {[m.runtime === 'ollama' ? 'Ollama' : 'vLLM', size(m.sizeBytes), m.vision ? 'sees images' : ''].filter(Boolean).join(' · ')}
        </div>
      </div>
    </div>
  );
}

/** How a model runs here, in words and a colour. */
function Runs({ fit }: { fit: ModelFit }) {
  const [tone, words] =
    fit.verdict === 'good'
      ? ['text-ok', `Runs well${fit.tokensPerSec ? `, about ${Math.max(1, Math.round(fit.tokensPerSec * 0.75))} words a second` : ''}`]
      : fit.verdict === 'slow'
        ? ['text-warn', 'Runs slowly here']
        : fit.verdict === 'tight'
          ? ['text-warn', 'Runs very slowly here']
          : ['text-err', 'Too big for this computer'];
  return (
    <span className={cx('inline-flex items-center gap-1.5 font-medium', tone)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {words}
    </span>
  );
}

/** The better of a model's two first guesses: as stored (vLLM), or at 4-bit with Ollama. */
function guess(m: HfModel): ModelFit | undefined {
  const g = m.fitGguf;
  if (m.fit && g && m.fit.verdict !== 'good' && (g.verdict === 'good' || (m.fit.verdict === 'no' && g.verdict !== 'no'))) return g;
  return m.fit ?? g;
}

type Look = HfInspect | 'busy' | { error: string };

/** Hugging Face: before anything is typed the most downloaded that run well here; Get shows how one
 * would install, and the best size to take. */
function FromHf({ st }: { st: ModelsState }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<HfModel[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [checks, setChecks] = useState<Record<string, Look>>({});
  const words = q.trim();
  const direct = repoOf(words);
  useEffect(() => {
    let alive = true;
    setAll(false);
    const p = new URLSearchParams(words ? { q: direct ?? words, sort: 'downloads' } : { q: '', sort: 'downloads', f: 'fits' });
    setBusy(true);
    const t = setTimeout(
      () =>
        api<{ models: HfModel[] }>(`/api/models/hf?${p}`)
          .then((r) => alive && setHits(r.models), toastError)
          .finally(() => alive && setBusy(false)),
      words ? 300 : 0,
    );
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [words, direct]);
  const get = async (repo: string) => {
    if (open === repo) return setOpen(null);
    setOpen(repo);
    const had = checks[repo];
    if (had && had !== 'busy' && !('error' in had)) return;
    setChecks((c) => ({ ...c, [repo]: 'busy' }));
    try {
      const info = await post<HfInspect>('/api/models/inspect', { input: repo });
      setChecks((c) => ({ ...c, [repo]: info }));
    } catch (e) {
      setChecks((c) => ({ ...c, [repo]: { error: (e as Error).message } }));
    }
  };
  const list = hits ?? [];
  // A model named in full comes first, even when the search does not list it.
  const named = direct && !list.some((m) => m.id.toLowerCase() === direct.toLowerCase()) ? direct : null;
  const rows: HfModel[] = [...(named ? [{ id: named, kind: 'other' as const }] : []), ...list];
  const detail = (repo: string) => {
    const c = checks[repo];
    if (!c || c === 'busy')
      return (
        <div className="flex items-center gap-2 text-[13px] text-fg-3">
          <Throbber /> Looking at its files…
        </div>
      );
    if ('error' in c) return <div className="text-[13px] text-err">{c.error}</div>;
    return <Ways info={c} st={st} onCheck={(r) => void get(r)} onStarted={() => setOpen(null)} />;
  };
  return (
    <div>
      <Find value={q} onChange={setQ} placeholder="Search free models: qwen, gemma, llama…" busy={busy} onEnter={() => direct && void get(direct)} />
      {hits && (
        <div className="mt-6">
          <Label aside={rows.length > FIRST && <More n={rows.length} open={all} onToggle={() => setAll((x) => !x)} />}>
            {words ? (rows.length ? 'Found on Hugging Face' : 'Nothing found by that name') : 'Popular, and running well here'}
          </Label>
          {rows.length > 0 && (
            <div className={panel}>
              {(all ? rows : rows.slice(0, FIRST)).map((m) => (
                <HfRow key={m.id} m={m} open={open === m.id} onGet={() => void get(m.id)}>
                  {open === m.id && detail(m.id)}
                </HfRow>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function HfRow({ m, open, onGet, children }: { m: HfModel; open: boolean; onGet: () => void; children?: ReactNode }) {
  const [org, name] = m.id.split('/');
  const fit = guess(m);
  const facts = [m.params ? `${paramsShort(m.params)} parameters` : '', m.downloads ? `${count(m.downloads)} downloads` : '', m.vision ? 'sees images' : ''].filter(Boolean);
  return (
    <div className={cx('transition-colors', open ? 'bg-fg/[0.03]' : 'hover:bg-fg/[0.025]')}>
      <div className="flex items-center gap-3.5 px-4 py-3">
        <Mark name={org} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px]">
            <span className="text-fg-3">{org}/</span>
            <span className="font-medium text-fg">{name}</span>
          </div>
          <div className="tnum mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[12.5px] text-fg-3">
            {fit && <Runs fit={fit} />}
            {facts.length > 0 && <span>{facts.join(' · ')}</span>}
            {m.gated && <span className="text-warn">asks for access</span>}
          </div>
        </div>
        <button
          type="button"
          onClick={onGet}
          aria-expanded={open}
          className={cx(
            'inline-flex h-8 shrink-0 items-center rounded-full px-3.5 text-[13px] font-medium transition-colors',
            open ? 'text-fg-3 hover:text-fg' : 'text-fg-2 ring-1 ring-line-2 hover:bg-fg/[0.06] hover:text-fg',
          )}
        >
          {open ? 'Close' : 'Get'}
        </button>
      </div>
      {open && <div className="anim-expand px-4 pb-4 sm:pl-[66px]">{children}</div>}
    </div>
  );
}

/** The size to take: the usual 4-bit one when it runs well, else the best that does, else the smallest. */
function pick(qs: HfQuant[]): HfQuant | undefined {
  const good = qs.filter((x) => x.fit.verdict === 'good');
  return good.find((x) => /q4_k_m/i.test(x.tag)) ?? [...good].sort((a, b) => b.sizeBytes - a.sizeBytes)[0] ?? [...qs].sort((a, b) => a.sizeBytes - b.sizeBytes)[0];
}

/** How a model would come here: the best GGUF size for Ollama (the others a click away), or its weights
 * for vLLM; or why not. */
function Ways({ info, st, onCheck, onStarted }: { info: HfInspect; st: ModelsState; onCheck: (repo: string) => void; onStarted: () => void }) {
  const [others, setOthers] = useState(false);
  const install = (body: { repo?: string; ollama?: string }) =>
    post('/api/models/install', body).then(() => {
      toast('Downloading: it shows under On this computer', 'ok');
      onStarted();
    }, toastError);
  const note = (children: ReactNode) => <p className="text-[13px] leading-relaxed text-fg-3">{children}</p>;
  const gated = info.gated && note(<span className="text-warn">It asks for access: accept its terms on Hugging Face and add a token in Settings → Models first.</span>);
  if (info.kind === 'gguf') {
    const best = pick(info.quants);
    const rest = info.quants.filter((x) => x !== best);
    const row = (x: HfQuant, main: boolean) => (
      <div key={x.tag} className="flex items-center gap-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[13.5px]">
            <span className="font-medium text-fg">{x.tag}</span>
            <span className="text-fg-3">{size(x.sizeBytes)}</span>
            {main && <span className="rounded-full bg-accent/15 px-2 py-px text-[11px] font-medium text-accent">Best here</span>}
          </div>
          <div className="mt-0.5 text-[12.5px]">
            <Runs fit={x.fit} />
          </div>
        </div>
        <Button size="sm" variant={main ? 'primary' : 'ghost'} className="rounded-full" icon={<Download size={13} />} disabled={!st.ollama.version || x.fit.verdict === 'no'} onClick={() => void install({ ollama: x.ollamaName })}>
          Get
        </Button>
      </div>
    );
    return (
      <div className="space-y-2">
        {gated}
        {!st.ollama.version && note('This needs Ollama, a free program that runs models, and it is not running here yet: install it (the Install link above), then come back.')}
        {best && row(best, true)}
        {rest.length > 0 && (
          <>
            <button type="button" onClick={() => setOthers((x) => !x)} className="text-left text-[13px] font-medium text-fg-3 transition-colors hover:text-fg">
              {others ? 'Fewer sizes' : `${rest.length} other size${rest.length > 1 ? 's' : ''}: smaller ones are quicker, bigger ones better`}
            </button>
            {others && <div className="divide-y divide-line">{rest.map((x) => row(x, false))}</div>}
          </>
        )}
      </div>
    );
  }
  if (info.kind === 'safetensors' && info.vllm) {
    const v = info.vllm;
    return (
      <div className="space-y-2">
        {gated}
        {v.supported === true ? (
          <div className="flex items-center gap-3 py-1">
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] text-fg">
                The full model, with vLLM <span className="text-fg-3">· {size(v.fit.downloadBytes)}</span>
              </div>
              <div className="mt-0.5 text-[12.5px]">
                <Runs fit={v.fit} />
              </div>
            </div>
            <Button size="sm" variant="primary" className="rounded-full" icon={<Download size={13} />} disabled={v.fit.verdict === 'no'} onClick={() => void install({ repo: info.repo })}>
              Get
            </Button>
          </div>
        ) : (
          note(v.supported === null ? 'This one needs vLLM, a program for advanced setups, and it is not installed here.' : (v.reason ?? 'vLLM can’t run this model here.'))
        )}
        {info.ggufRepo &&
          v.supported !== true &&
          note(
            <>
              A smaller version runs with Ollama:{' '}
              <button type="button" className="font-medium text-accent hover:underline" onClick={() => onCheck(info.ggufRepo!)}>
                {info.ggufRepo}
              </button>
            </>,
          )}
      </div>
    );
  }
  return note('This model can’t run here: it has no files Ollama or vLLM can use.');
}
