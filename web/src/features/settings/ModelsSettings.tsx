import { useEffect, useState } from 'react';
import { Brain, Check, Cpu, Download, ExternalLink, Eye, HardDrive, Lock, MemoryStick, Play, Plus, Search, Square, Trash2, Wrench, X } from 'lucide-react';
import type { HfInspect, HfModel, HfSort, LocalModel, ModelFit, ModelsState, OpenRouterModel, OpenRouterSort } from '@shared/types';
import { api, post, put } from '../../lib/api';
import { toast, toastError } from '../../lib/store';
import { live } from '../../lib/ws';
import { Button, cx, inputCls, Section, Throbber, useConfirm } from '../../components/ui';
import { HelperModel } from './HelperModel';

const GiB = 1024 ** 3;
export const size = (b: number) => (b >= 10 * GiB ? `${Math.round(b / GiB)} GB` : b >= 0.1 * GiB ? `${(b / GiB).toFixed(1)} GB` : `${Math.round(b / 1024 ** 2)} MB`);
const params = (n?: number) => (n ? (n >= 1e9 ? `${(n / 1e9).toFixed(n >= 1e10 ? 0 : 1)}B parameters` : `${Math.round(n / 1e6)}M parameters`) : '');

/** The Custom agent's models, kept current: providers, what is on this machine, downloads. */
export function useModels(): ModelsState | null {
  const [st, setSt] = useState<ModelsState | null>(null);
  useEffect(() => {
    api<ModelsState>('/api/models').then(setSt, toastError);
    return live.on((e) => e.t === 'models' && setSt(e.state));
  }, []);
  return st;
}

/** The Custom agent's models: providers and keys, models on this machine, and adding more from Hugging Face. */
export function ModelsSettings() {
  const st = useModels();
  if (!st)
    return (
      <div className="flex justify-center py-10 text-fg-3">
        <Throbber size={28} />
      </div>
    );
  return (
    <div className="space-y-4">
      <p className="text-[13px] leading-relaxed text-fg-3">
        Custom, the app’s own agent, runs any of these models with the same tools, skills and MCP servers as the other agents. Pick Custom on the start page, then the model.
      </p>
      <HelperModel />
      <LocalModels st={st} />
      <AddFromHf st={st} />
      <OpenRouter st={st} />
      <Runtimes st={st} />
    </div>
  );
}

function Verdict({ fit }: { fit: ModelFit }) {
  const label =
    fit.verdict === 'good'
      ? `Runs well on GPU ${fit.gpu}`
      : fit.verdict === 'slow'
        ? 'Runs on the CPU, slowly'
        : fit.verdict === 'tight'
          ? 'Runs on the CPU, very slowly'
          : 'Too big for this machine';
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-px text-[11.5px] font-medium',
        fit.verdict === 'good' ? 'bg-ok/12 text-ok' : fit.verdict === 'no' ? 'bg-err/12 text-err' : 'bg-warn/12 text-warn',
      )}
    >
      {fit.verdict === 'good' && <Check size={11} strokeWidth={3} />}
      {label}
    </span>
  );
}

function FitLine({ fit }: { fit: ModelFit }) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-fg-3">
      <Verdict fit={fit} />
      <span>needs {size(fit.needBytes)}</span>
      {fit.tokensPerSec ? <span>· about {fit.tokensPerSec} tokens/s</span> : null}
      <span>· download {size(fit.downloadBytes)}</span>
    </div>
  );
}

// ---- on this machine -------------------------------------------------------------------------------

function LocalModels({ st }: { st: ModelsState }) {
  const [confirm, confirmNode] = useConfirm();
  const remove = async (m: LocalModel) => {
    if (
      !(await confirm({
        title: `Remove ${m.repo}?`,
        body: <>Its files ({size(m.sizeBytes)}) are deleted from this machine. You can install it again later.</>,
        confirm: 'Remove',
        danger: true,
      }))
    )
      return;
    post('/api/models/remove', { id: m.id }).then(() => toast(`Removed ${m.repo}`, 'ok'), toastError);
  };
  const running = st.downloads.filter((d) => d.status !== 'done');
  return (
    <Section title="On this machine">
      {confirmNode}
      <div className="mb-3">
        <MachineCard st={st} />
      </div>
      {running.map((d) => (
        <div key={d.key} className="flex items-center gap-3 border-t border-line py-2.5">
          <Download size={15} className="shrink-0 text-fg-3" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px]">{d.name.replace(/^hf\.co\//, '')}</div>
            {d.status === 'running' ? (
              <>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-fg/10">
                  <div
                    className="h-full rounded-full bg-accent transition-[width] duration-500"
                    style={{
                      width: `${d.totalBytes ? Math.min(100, (d.doneBytes / d.totalBytes) * 100) : 5}%`,
                    }}
                  />
                </div>
                <div className="mt-1 text-[11.5px] text-fg-3">
                  {size(d.doneBytes)} of {d.totalBytes ? size(d.totalBytes) : '…'} · {d.target === 'ollama' ? 'with Ollama' : 'for vLLM'}
                </div>
              </>
            ) : (
              <div className={cx('text-[12px]', d.status === 'failed' ? 'text-err' : 'text-fg-3')}>{d.status === 'failed' ? d.error : 'Cancelled'}</div>
            )}
          </div>
          <Button size="sm" variant="ghost" onClick={() => post('/api/models/cancel', { key: d.key }).catch(toastError)}>
            {d.status === 'running' ? 'Cancel' : 'Dismiss'}
          </Button>
        </div>
      ))}
      {!st.local.length && !running.length && <div className="border-t border-line py-3 text-[13px] text-fg-3">No models here yet: add one from Hugging Face below.</div>}
      {st.local.map((m) => (
        <div key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-line py-2.5">
          <Cpu size={15} className="shrink-0 text-fg-3" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] text-fg">{m.repo}</div>
            <div className="text-[12px] text-fg-3">
              {m.runtime === 'ollama' ? 'Ollama' : 'vLLM'} · {size(m.sizeBytes)}
              {m.detail ? ` · ${m.detail}` : ''}
              {m.vision ? ' · sees images' : ''}
              {m.server?.state === 'ready' && ` · running on GPU ${m.server.gpu}`}
              {m.server?.state === 'starting' && ' · starting…'}
              {m.supported === false && m.reason ? ` · ${m.reason}` : ''}
            </div>
            {m.server?.state === 'failed' && <div className="mt-1 line-clamp-3 font-mono text-[11px] text-err">{m.server.error}</div>}
          </div>
          {m.runtime === 'vllm' &&
            m.supported &&
            (m.server && m.server.state !== 'failed' ? (
              <Button size="sm" variant="ghost" icon={<Square size={12} />} onClick={() => post('/api/models/stop', { repo: m.repo }).catch(toastError)}>
                Stop
              </Button>
            ) : (
              <Button size="sm" variant="ghost" icon={<Play size={12} />} onClick={() => post('/api/models/start', { repo: m.repo }).catch(toastError)}>
                Start
              </Button>
            ))}
          <Button size="sm" variant="ghost" icon={<Trash2 size={13} />} onClick={() => remove(m)}>
            Remove
          </Button>
        </div>
      ))}
    </Section>
  );
}

// ---- shared: search box, filters, order, rows ----------------------------------------------------

/** 1M, 164K… tokens */
const tokens = (n: number) => (n >= 1_000_000 ? `${+(n / 1_048_576).toFixed(1)}M` : `${Math.round(n / 1000)}K`);
/** $0.15, $3, $0.021… per million tokens. */
const dollars = (n: number) => `$${n >= 10 ? Math.round(n) : n >= 1 ? n.toFixed(2).replace(/\.00$/, '') : n >= 0.1 ? n.toFixed(2) : +n.toPrecision(2)}`;
/** 12.8M, 3.4K, 512 */
const count = (n: number) => (n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${+(n / 1e3).toFixed(1)}K` : String(n));
/** 14.8B, 600M */
const paramsShort = (n: number) => (n >= 1e9 ? `${+(n / 1e9).toFixed(n >= 1e10 ? 0 : 1)}B` : `${Math.round(n / 1e6)}M`);
const month = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
const DAY = 86_400_000;

/** A maker's initial on a tile of its own colour. */
function OrgMark({ name }: { name: string }) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return (
    <span className="org-mark flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] text-[13px] font-semibold" style={{ '--h': h } as React.CSSProperties} title={name} aria-hidden>
      {name.replace(/^~/, '').charAt(0).toUpperCase()}
    </span>
  );
}

function Tag({ tone = 'plain', icon, children, title }: { tone?: 'plain' | 'accent' | 'ok' | 'warn' | 'err'; icon?: React.ReactNode; children?: React.ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className={cx(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-px text-[11px] leading-[17px] font-medium whitespace-nowrap',
        tone === 'plain' && 'bg-bg-2 text-fg-2 ring-1 ring-line',
        tone === 'accent' && 'bg-accent-soft text-accent',
        tone === 'ok' && 'bg-ok/12 text-ok',
        tone === 'warn' && 'bg-warn/12 text-warn',
        tone === 'err' && 'bg-err/12 text-err',
      )}
    >
      {icon}
      {children}
    </span>
  );
}

/** The search box: a magnifier, the words, a throbber while it looks, and a way to clear it. */
function SearchBox({ value, onChange, placeholder, busy, onEnter }: { value: string; onChange: (v: string) => void; placeholder: string; busy?: boolean; onEnter?: () => void }) {
  return (
    <div className="relative">
      <Search size={14} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-3" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onEnter?.()}
        placeholder={placeholder}
        spellCheck={false}
        className={cx(inputCls, 'w-full pr-9 pl-9')}
      />
      {busy ? (
        <Throbber className="absolute top-1/2 right-3 -translate-y-1/2 text-fg-3" />
      ) : (
        value && (
          <button type="button" aria-label="Clear" onClick={() => onChange('')} className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1 text-fg-3 hover:bg-bg-2 hover:text-fg">
            <X size={13} />
          </button>
        )
      )}
    </div>
  );
}

/** Filters as toggles; they wrap rather than run off the edge. */
function FilterChips({ items, on, toggle }: { items: { id: string; label: string; icon?: React.ReactNode }[]; on: string[]; toggle: (id: string) => void }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {items.map((f) => {
        const sel = on.includes(f.id);
        return (
          <button
            key={f.id}
            type="button"
            aria-pressed={sel}
            onClick={() => toggle(f.id)}
            className={cx(
              'inline-flex h-7 items-center gap-1 rounded-lg px-2.5 text-[12px] font-medium whitespace-nowrap ring-1 transition-colors',
              sel ? 'bg-accent-soft text-accent ring-accent/40' : 'bg-bg-2 text-fg-2 ring-line hover:bg-bg-3 hover:text-fg',
            )}
          >
            {f.icon}
            {f.label}
          </button>
        );
      })}
    </div>
  );
}

/** Before anything is typed: words to try, and a way to just look around. */
function Starters({ words, onWord, browse, onBrowse, note }: { words: string[]; onWord: (w: string) => void; browse: string; onBrowse: () => void; note?: string }) {
  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[12px] text-fg-3">
      {note && <span className="w-full text-fg-2">{note}</span>}
      Try
      {words.map((w) => (
        <button key={w} type="button" onClick={() => onWord(w)} className="rounded-md bg-bg-2 px-1.5 py-0.5 font-mono text-[11.5px] text-fg-2 ring-1 ring-line transition-colors hover:bg-bg-3 hover:text-fg">
          {w}
        </button>
      ))}
      <span className="whitespace-nowrap">
        or{' '}
        <button type="button" onClick={onBrowse} className="text-accent hover:underline">
          {browse}
        </button>
      </span>
    </div>
  );
}

/** "42 models", and their order. */
function ResultsHead({ n, limit, order, value, onChange }: { n: number; limit: number; order: { id: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="mb-1.5 flex items-center gap-2 text-[12px] text-fg-3">
      <span>{n ? `${n === limit ? `First ${limit}` : n} model${n === 1 ? '' : 's'}` : 'No model matches'}</span>
      <span className="flex-1" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Order"
        className="h-7 shrink-0 rounded-lg bg-bg-2 px-2 text-[12px] font-medium text-fg-2 ring-1 ring-line outline-none hover:bg-bg-3"
      >
        {order.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

const resultList = 'max-h-[min(520px,60vh)] divide-y divide-line overflow-y-auto overscroll-contain rounded-xl border border-line';

// ---- this computer ---------------------------------------------------------------------------------

export const shortGpu = (name: string) => name.replace(/^NVIDIA\s+/i, '').replace(/^GeForce\s+/i, '');
/** Parameters that roughly fit in this much memory at 4-bit, with room for the context. */
export function aboutParams(free: number): number {
  const b = free / (0.61 * 1.5 * 1e9);
  return b >= 20 ? Math.floor(b / 10) * 10 : b >= 10 ? Math.floor(b / 5) * 5 : Math.max(1, Math.floor(b));
}

function Stat({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-bg-2/70 px-2.5 py-2 max-sm:flex max-sm:items-baseline max-sm:gap-2">
      <div className="flex items-center gap-1.5 text-[11.5px] text-fg-3 max-sm:w-[72px] max-sm:shrink-0">
        {icon}
        {label}
      </div>
      <div className="mt-0.5 truncate text-[13px] font-medium text-fg" title={value}>
        {value}
      </div>
      <div className="truncate text-[11.5px] text-fg-3 max-sm:ml-auto">{sub}</div>
    </div>
  );
}

function RuntimePill({ name, version, install }: { name: string; version?: string; install: string }) {
  if (version)
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-ok/10 px-2.5 py-1 text-[12px] font-medium text-ok">
        <span className="h-1.5 w-1.5 rounded-full bg-ok" />
        {name} {version}
      </span>
    );
  return /^https?:/.test(install) ? (
    <a href={install} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full bg-bg-2 px-2.5 py-1 text-[12px] text-fg-2 ring-1 ring-line hover:text-fg">
      <span className="h-1.5 w-1.5 rounded-full bg-line-2" />
      {name}: install <ExternalLink size={11} />
    </a>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-bg-2 px-2.5 py-1 text-[12px] text-fg-3 ring-1 ring-line" title={install}>
      <span className="h-1.5 w-1.5 rounded-full bg-line-2" />
      {name}: not found
    </span>
  );
}

/** This computer at a glance: graphics, memory, disk, the runtimes, and how big a model fits. */
export function MachineCard({ st }: { st: ModelsState }) {
  const m = st.machine;
  const kinds = new Map<string, number>();
  for (const g of m.gpus) kinds.set(shortGpu(g.name), (kinds.get(shortGpu(g.name)) ?? 0) + 1);
  const gpus = [...kinds].map(([n, k]) => `${k > 1 ? `${k} × ` : ''}${n}`).join(' + ');
  const mem = m.gpus.map((g) => g.totalBytes);
  const lo = Math.min(...mem);
  const hi = Math.max(...mem);
  const best = [...m.gpus].sort((a, b) => b.freeBytes - a.freeBytes)[0];
  return (
    <div className="rounded-xl border border-line bg-bg-1 p-2.5">
      <div className="grid grid-cols-3 gap-2 max-sm:grid-cols-1 max-sm:gap-1.5">
        <Stat
          icon={<Cpu size={12} />}
          label="Graphics"
          value={gpus || 'No GPU'}
          sub={m.gpus.length ? `${hi - lo > 1.5 * GiB ? `${size(lo)}–${size(hi)}` : size(hi)}${m.gpus.length > 1 ? ' each' : ''}` : 'models run on the processor'}
        />
        <Stat icon={<MemoryStick size={12} />} label="Memory" value={size(m.ramBytes)} sub={`${size(m.ramFreeBytes)} free`} />
        <Stat icon={<HardDrive size={12} />} label="Disk" value={`${size(st.storage.freeBytes)} free`} sub={st.storage.usedBytes ? `models take ${size(st.storage.usedBytes)}` : 'for downloads'} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 px-0.5">
        <RuntimePill name="Ollama" version={st.ollama.version} install="https://ollama.com/download" />
        <RuntimePill name="vLLM" version={st.vllm.path ? (st.vllm.version ?? 'found') : undefined} install="pip install vllm (NVIDIA GPUs)" />
        {best && <span className="ml-auto text-[12px] text-fg-3">Fits about {aboutParams(best.freeBytes)}B parameters at 4-bit on one GPU</span>}
      </div>
    </div>
  );
}

// ---- from Hugging Face -----------------------------------------------------------------------------

function AddFromHf({ st }: { st: ModelsState }) {
  return (
    <Section title="Add a model from Hugging Face" sub="Search, see how each would run here, and install it">
      <HfSearch st={st} />
    </Section>
  );
}

/** A first guess at how a model runs here, from its size (Check gives the exact answer); a model too big
 * for vLLM as stored may still run at 4-bit with Ollama. */
function FitPill({ fit, gguf, kind }: { fit: ModelFit; gguf?: ModelFit; kind: HfModel['kind'] }) {
  const viaGguf = fit.verdict !== 'good' && gguf && (gguf.verdict === 'good' || (fit.verdict === 'no' && gguf.verdict !== 'no'));
  const f = viaGguf ? gguf! : fit;
  const tone = f.verdict === 'good' ? 'ok' : f.verdict === 'no' ? 'err' : 'warn';
  const how =
    f.verdict === 'good'
      ? `Runs well${viaGguf ? '' : f.where === 'gpu' && kind === 'safetensors' ? ' with vLLM' : ' with Ollama'}${f.tokensPerSec ? ` · about ${f.tokensPerSec} tokens/s` : ''}`
      : f.verdict === 'slow'
        ? 'On the processor, slowly'
        : f.verdict === 'tight'
          ? 'On the processor, very slowly'
          : 'Too big for this computer';
  return (
    <Tag tone={tone} icon={f.verdict === 'good' ? <Check size={11} strokeWidth={3} /> : undefined} title={f.notes.join(' ')}>
      {viaGguf ? `At 4-bit with Ollama: ${how.charAt(0).toLowerCase()}${how.slice(1)}` : how}
    </Tag>
  );
}

/** What Check found: each GGUF size and how it runs here (Install with Ollama), or the vLLM download. */
function InspectPanel({ info, st, onCheck, onInstalled }: { info: HfInspect; st: ModelsState; onCheck: (repo: string) => void; onInstalled: () => void }) {
  const install = (body: { repo?: string; ollama?: string }) =>
    post('/api/models/install', body).then(() => {
      toast('Downloading: it shows with the models on this computer', 'ok');
      onInstalled();
    }, toastError);
  return (
    <div className="anim-in rounded-xl border border-line bg-bg-1 p-3">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <a href={`https://huggingface.co/${info.repo}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[13px] font-medium text-fg hover:underline">
          {info.repo} <ExternalLink size={11} />
        </a>
        <span className="text-[12px] text-fg-3">
          {[params(info.params), info.contextLength ? `${Math.round(info.contextLength / 1000)}K context` : '', info.vision ? 'sees images' : '', info.arch].filter(Boolean).join(' · ')}
        </span>
      </div>
      {info.gated && <div className="mt-1 text-[12px] text-warn">Gated: accept its terms on Hugging Face and add a token in Settings → Models first.</div>}
      {info.kind === 'gguf' && (
        <div className="mt-2">
          <div className="text-[12px] text-fg-3">
            Runs with Ollama{st.ollama.version ? '' : ', which is not running here'}. Smaller files trade a little quality for speed and memory.
          </div>
          {info.quants.map((x) => (
            <div key={x.tag} className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-2">
              <div className="min-w-0 flex-1">
                <span className="font-mono text-[12.5px] text-fg">{x.tag}</span>
                <FitLine fit={x.fit} />
              </div>
              <Button size="sm" variant={x.fit.verdict === 'good' ? 'primary' : 'secondary'} disabled={!st.ollama.version || x.fit.verdict === 'no'} onClick={() => install({ ollama: x.ollamaName })}>
                Install
              </Button>
            </div>
          ))}
        </div>
      )}
      {info.kind === 'safetensors' && info.vllm && (
        <div className="mt-2">
          {info.vllm.supported === false || info.vllm.supported === null ? (
            <div className="text-[12.5px] text-fg-2">
              {info.vllm.supported === null ? 'vLLM is not installed here (it runs these weights).' : info.vllm.reason}
              {info.ggufRepo && (
                <>
                  {' '}
                  The GGUF version runs with Ollama:{' '}
                  <button className="text-accent hover:underline" onClick={() => onCheck(info.ggufRepo!)}>
                    check {info.ggufRepo}
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <div className="min-w-0 flex-1">
                <div className="text-[12px] text-fg-3">Runs with vLLM, which starts it on a GPU when a session uses it.</div>
                <FitLine fit={info.vllm.fit} />
              </div>
              <Button size="sm" variant="primary" disabled={info.vllm.fit.verdict === 'no'} onClick={() => install({ repo: info.repo })}>
                Download
              </Button>
            </div>
          )}
          {info.vllm.supported !== false && <div className="mt-1.5 text-[11.5px] text-fg-3">{info.vllm.fit.notes.join(' ')}</div>}
        </div>
      )}
      {info.kind === 'other' && <div className="mt-2 text-[12.5px] text-fg-3">No weights this app can run (safetensors for vLLM, GGUF for Ollama).</div>}
    </div>
  );
}

/** One model on Hugging Face: its maker and name, format, size, popularity, and how it would run here. */
function HfModelRow({ m, open, onCheck, children }: { m: HfModel; open: boolean; onCheck: () => void; children?: React.ReactNode }) {
  const [org, name] = m.id.split('/');
  return (
    <div className={cx('px-3 py-2.5 transition-colors', open && 'bg-bg-1/60')}>
      <div className="flex items-start gap-3">
        <OrgMark name={org} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
            <span className="text-[13.5px] leading-5 break-all">
              <span className="text-fg-3">{org}/</span>
              <span className="font-medium text-fg">{name}</span>
            </span>
            {m.kind !== 'other' && (
              <Tag title={m.kind === 'gguf' ? 'GGUF weights: they run with Ollama' : 'Safetensors weights: they run with vLLM'}>{m.kind === 'gguf' ? 'GGUF' : 'vLLM'}</Tag>
            )}
            {m.vision && (
              <Tag icon={<Eye size={11} />} title="Sees images">
                <span className="max-sm:hidden">Images</span>
              </Tag>
            )}
            {m.gated && (
              <Tag tone="warn" icon={<Lock size={10} />} title="Accept its terms on Hugging Face, and add a token, first">
                Gated
              </Tag>
            )}
          </div>
          <div className="tnum mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-fg-3">
            {m.params ? <span className="text-fg-2">{paramsShort(m.params)} parameters</span> : null}
            {m.downloads ? <span title="Downloads in the last 30 days">{count(m.downloads)} downloads</span> : null}
            {m.likes ? <span>{count(m.likes)} likes</span> : null}
            {m.updated ? <span>{month(m.updated)}</span> : null}
          </div>
          {m.fit && (
            <div className="mt-1.5">
              <FitPill fit={m.fit} gguf={m.fitGguf} kind={m.kind} />
            </div>
          )}
        </div>
        <Button size="sm" variant={open ? 'ghost' : 'secondary'} onClick={onCheck} aria-expanded={open} className="shrink-0">
          {open ? 'Close' : 'Check'}
        </Button>
      </div>
      {open && <div className="mt-2.5 pl-11 max-sm:pl-0">{children}</div>}
    </div>
  );
}

const HF_FILTERS = [
  { id: 'fits', label: 'Runs well here', icon: <Check size={12} /> },
  { id: 'gguf', label: 'GGUF · Ollama' },
  { id: 'safetensors', label: 'vLLM' },
  { id: 'vision', label: 'Sees images', icon: <Eye size={12} /> },
];
const HF_ORDER: { id: HfSort; label: string }[] = [
  { id: 'downloads', label: 'Most downloaded' },
  { id: 'trending', label: 'Trending' },
  { id: 'likes', label: 'Most liked' },
  { id: 'new', label: 'Newest' },
];
const HF_STARTERS = ['qwen3', 'gemma', 'llama', 'gpt-oss', 'mistral', 'phi'];

/** "org/name" from that, a huggingface.co address or hf.co/… (as the server reads it). */
function repoOf(input: string): string | null {
  const s = input
    .trim()
    .replace(/^https?:\/\/(www\.)?(huggingface\.co|hf\.co)\//, '')
    .replace(/^hf\.co\//, '')
    .replace(/\/(tree|blob|resolve)\/.*$/, '')
    .replace(/[:?#].*$/, '')
    .replace(/\/+$/, '');
  return /^[\w.-]+\/[\w.-]+$/.test(s) ? s : null;
}

/** Hugging Face, searched by name (or a model given as org/name): each result's fit here, Check, Install. */
export function HfSearch({ st }: { st: ModelsState }) {
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState<string[]>([]);
  const [sort, setSort] = useState<HfSort>('downloads');
  const [browse, setBrowse] = useState(false);
  const [hits, setHits] = useState<HfModel[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [checks, setChecks] = useState<Record<string, HfInspect | 'busy' | { error: string }>>({});
  const words = q.trim();
  const direct = repoOf(words);
  const browsing = !!words || filters.length > 0 || browse;
  useEffect(() => {
    if (!browsing) return setHits(null);
    let alive = true;
    const p = new URLSearchParams({ q: direct ?? words, sort });
    if (filters.length) p.set('f', filters.join(','));
    setBusy(true);
    const t = setTimeout(
      () =>
        api<{ models: HfModel[] }>(`/api/models/hf?${p}`)
          .then((r) => alive && setHits(r.models), toastError)
          .finally(() => alive && setBusy(false)),
      300,
    );
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [words, direct, filters, sort, browsing]);
  const check = async (repo: string) => {
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
  const detail = (repo: string) => {
    const c = checks[repo];
    if (!c || c === 'busy')
      return (
        <div className="flex items-center gap-2 py-1 text-[12px] text-fg-3">
          <Throbber /> Checking how it runs here…
        </div>
      );
    if ('error' in c) return <div className="text-[12px] text-err">{c.error}</div>;
    return <InspectPanel info={c} st={st} onCheck={(r) => void check(r)} onInstalled={() => setOpen(null)} />;
  };
  const list = hits ?? [];
  // A model named in full is offered first, even when the search does not list it.
  const named = direct && !list.some((m) => m.id.toLowerCase() === direct.toLowerCase()) ? direct : null;
  const toggle = (f: string) => setFilters((l) => (l.includes(f) ? l.filter((x) => x !== f) : [...l, f]));
  return (
    <div>
      <SearchBox
        value={q}
        onChange={(v) => {
          setQ(v);
          setOpen(null);
        }}
        placeholder="Search Hugging Face, or paste org/name"
        busy={busy}
        onEnter={() => direct && void check(direct)}
      />
      <FilterChips items={HF_FILTERS} on={filters} toggle={toggle} />
      {!browsing && <Starters words={HF_STARTERS} onWord={setQ} browse="see the most downloaded" onBrowse={() => setBrowse(true)} />}
      {browsing && (hits || named) && (
        <div className="anim-in mt-2.5">
          <ResultsHead n={list.length} limit={40} order={HF_ORDER} value={sort} onChange={(v) => setSort(v as HfSort)} />
          {(list.length > 0 || named) && (
            <div className={resultList}>
              {named && (
                <HfModelRow m={{ id: named, kind: 'other' }} open={open === named} onCheck={() => (open === named ? setOpen(null) : void check(named))}>
                  {open === named && detail(named)}
                </HfModelRow>
              )}
              {list.map((m) => (
                <HfModelRow key={m.id} m={m} open={open === m.id} onCheck={() => (open === m.id ? setOpen(null) : void check(m.id))}>
                  {open === m.id && detail(m.id)}
                </HfModelRow>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---- OpenRouter ------------------------------------------------------------------------------------

function OpenRouter({ st }: { st: ModelsState }) {
  return (
    <Section title="OpenRouter">
      <OpenRouterBody st={st} />
    </Section>
  );
}

/** Words to search the catalog by, for a first model. */
const STARTERS = ['deepseek', 'qwen', 'glm', 'kimi', 'gpt-oss', 'mistral'];

const FILTERS: { id: string; label: string; icon?: React.ReactNode }[] = [
  { id: 'tools', label: 'Tool calls', icon: <Wrench size={12} /> },
  { id: 'vision', label: 'Sees images', icon: <Eye size={12} /> },
  { id: 'reasoning', label: 'Reasoning', icon: <Brain size={12} /> },
  { id: 'free', label: 'Free' },
];
const SORTS: { id: OpenRouterSort; label: string }[] = [
  { id: 'match', label: 'Best match' },
  { id: 'new', label: 'Newest' },
  { id: 'price', label: 'Cheapest' },
  { id: 'context', label: 'Longest context' },
];

/** One model: its maker, name and what it can do, then context, longest reply, price and age (and, unless
 * compact, what it is and its id). */
function OrModelRow({ m, action, compact }: { m: OpenRouterModel; action: React.ReactNode; compact?: boolean }) {
  const slug = m.detail ?? m.id.replace(/^openrouter\//, '');
  const latest = slug.startsWith('~');
  const free = !!m.price && m.price.input === 0 && m.price.output === 0;
  const fresh = !!m.created && Date.now() - m.created < 21 * DAY;
  return (
    <div className={cx('px-3', compact ? 'py-2' : 'py-2.5')}>
      <div className="flex items-start gap-3">
        <OrgMark name={m.org ?? slug.split('/')[0]} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
            <span className="text-[13.5px] leading-5 font-medium text-fg">{m.label}</span>
            {latest && (
              <Tag tone="accent" title="Always the maker’s latest version">
                Latest
              </Tag>
            )}
            {fresh && !latest && <Tag tone="accent">New</Tag>}
            {free && <Tag tone="ok">Free</Tag>}
            {m.reasoning && (
              <Tag icon={<Brain size={11} />} title="Thinks before it answers">
                <span className="max-sm:hidden">Reasoning</span>
              </Tag>
            )}
            {m.vision && (
              <Tag icon={<Eye size={11} />} title="Sees images">
                <span className="max-sm:hidden">Images</span>
              </Tag>
            )}
            {m.tools && m.tools !== 'native' && (
              <Tag tone="warn" title="Custom tells it about its tools in the prompt and reads its calls from the text">
                No native tools
              </Tag>
            )}
          </div>
          <div className="tnum mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-fg-3">
            {m.org && !compact && <span className="text-fg-2">{m.org}</span>}
            {m.contextLength ? <span title="How much it reads at once">{tokens(m.contextLength)} context</span> : null}
            {m.maxOutput ? <span title="Its longest reply">{tokens(m.maxOutput)} out</span> : null}
            {m.price && !free && (
              <span title="Per million tokens">
                {dollars(m.price.input)} in · {dollars(m.price.output)} out
              </span>
            )}
            {m.created && !compact && <span>{month(m.created)}</span>}
          </div>
        </div>
        <div className="shrink-0">{action}</div>
      </div>
      {!compact && m.description && (
        <p className="mt-1.5 line-clamp-2 pl-11 text-[12px] leading-snug text-fg-3 max-sm:pl-0" title={m.description}>
          {m.description}
        </p>
      )}
      {!compact && <div className="mt-1 truncate pl-11 font-mono text-[11px] text-fg-3/80 max-sm:pl-0">{slug}</div>}
    </div>
  );
}

/** The OpenRouter key, and the models it brings into the pickers: search by name, filter, order. */
export function OpenRouterBody({ st }: { st: ModelsState }) {
  const [key, setKey] = useState('');
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState<string[]>([]);
  const [sort, setSort] = useState<OpenRouterSort | ''>('');
  const [hits, setHits] = useState<OpenRouterModel[] | null>(null);
  const [busy, setBusy] = useState(false);
  const words = q.trim();
  const browsing = !!words || filters.length > 0 || !!sort;
  useEffect(() => {
    if (!browsing || !st.openrouter.keyHint) return setHits(null);
    let alive = true;
    const p = new URLSearchParams({ q: words });
    if (sort) p.set('sort', sort);
    if (filters.length) p.set('f', filters.join(','));
    setBusy(true);
    const t = setTimeout(
      () =>
        api<{ models: OpenRouterModel[] }>(`/api/models/openrouter?${p}`)
          .then((r) => alive && setHits(r.models), toastError)
          .finally(() => alive && setBusy(false)),
      220,
    );
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [words, filters, sort, browsing, st.openrouter.keyHint]);
  const pinned = new Set(st.openrouter.pinned.map((p) => p.id));
  const save = (body: Record<string, unknown>) => put('/api/models', body).catch(toastError);
  const toggle = (f: string) => setFilters((l) => (l.includes(f) ? l.filter((x) => x !== f) : [...l, f]));
  if (!st.openrouter.keyHint)
    return (
      <div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void save({ openrouterKey: key }).then(() => setKey(''));
          }}
        >
          <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Your OpenRouter key: sk-or-…" autoComplete="off" className={cx(inputCls, 'min-w-0 flex-1')} />
          <Button type="submit" size="sm" variant="primary" disabled={!key.trim()}>
            Save
          </Button>
        </form>
        <p className="mt-1.5 text-[12px] text-fg-3">
          One key for hundreds of models, paid per token.{' '}
          <a className="inline-flex items-center gap-0.5 text-accent hover:underline" href="https://openrouter.ai/keys" target="_blank" rel="noreferrer">
            Get one at openrouter.ai <ExternalLink size={11} />
          </a>
        </p>
      </div>
    );
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2.5 rounded-xl border border-line bg-bg-1 px-3 py-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ok/12 text-ok">
          <Check size={14} strokeWidth={2.6} />
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="text-[13px] font-medium text-fg">Connected to OpenRouter</div>
          <div className="truncate font-mono text-[11.5px] text-fg-3">{st.openrouter.keyHint}</div>
        </div>
        <Button size="sm" variant="ghost" onClick={() => save({ openrouterKey: null })}>
          Remove
        </Button>
      </div>
      {st.openrouter.pinned.length > 0 && (
        <div>
          <div className="mb-1.5 text-[12px] font-medium text-fg-2">
            Your models <span className="font-normal text-fg-3">· in the pickers</span>
          </div>
          <div className="divide-y divide-line overflow-hidden rounded-xl border border-line">
            {st.openrouter.pinned.map((m) => (
              <OrModelRow
                key={m.id}
                m={m}
                compact
                action={
                  <button className="rounded-md p-1 text-fg-3 hover:bg-bg-2 hover:text-fg" aria-label={`Remove ${m.label}`} title="Remove from the pickers" onClick={() => save({ unpin: m.id })}>
                    <X size={14} />
                  </button>
                }
              />
            ))}
          </div>
        </div>
      )}
      <div>
        <SearchBox value={q} onChange={setQ} placeholder="Search OpenRouter: deepseek, qwen, claude…" busy={busy} />
        <FilterChips items={FILTERS} on={filters} toggle={toggle} />
        {!browsing && (
          <Starters
            words={STARTERS}
            onWord={setQ}
            browse="see the newest"
            onBrowse={() => setSort('new')}
            note={st.openrouter.pinned.length ? undefined : 'Add at least one model to use OpenRouter.'}
          />
        )}
        {hits && (
          <div className="anim-in mt-2.5">
            <ResultsHead
              n={hits.length}
              limit={50}
              order={SORTS.filter((x) => words || x.id !== 'match')}
              value={sort || (words ? 'match' : 'new')}
              onChange={(v) => setSort(v as OpenRouterSort)}
            />
            {hits.length > 0 && (
              <div className={resultList}>
                {hits.map((m) => (
                  <OrModelRow
                    key={m.id}
                    m={m}
                    action={
                      pinned.has(m.id) ? (
                        <span className="anim-pop-in flex items-center gap-1 px-1 text-[12.5px] font-medium text-ok">
                          <Check size={14} /> Added
                        </span>
                      ) : (
                        <Button size="sm" variant="secondary" icon={<Plus size={13} />} onClick={() => save({ pin: m.id })} aria-label={`Add ${m.label}`}>
                          <span className="max-sm:hidden">Add</span>
                        </Button>
                      )
                    }
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Ollama, vLLM, other endpoints, Hugging Face token ------------------------------------------------

function Runtimes({ st }: { st: ModelsState }) {
  const [ollama, setOllama] = useState(st.ollama.url);
  const [vllm, setVllm] = useState(st.vllm.command ?? '');
  const [hf, setHf] = useState('');
  const [ep, setEp] = useState({ name: '', baseUrl: '', apiKey: '' });
  const save = (body: Record<string, unknown>) => put('/api/models', body).then(() => toast('Saved', 'ok'), toastError);
  return (
    <Section title="Runtimes and endpoints">
      <div className="space-y-3 text-[13px]">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium">Ollama</span>
            <span className={cx('text-[12px]', st.ollama.version ? 'text-ok' : 'text-fg-3')}>
              {st.ollama.version ? `running, ${st.ollama.version}` : 'not running at this address'}
            </span>
            {!st.ollama.version && (
              <a className="text-[12px] text-accent hover:underline" href="https://ollama.com/download" target="_blank" rel="noreferrer">
                Install Ollama
              </a>
            )}
          </div>
          <div className="mt-1 flex gap-2">
            <input value={ollama} onChange={(e) => setOllama(e.target.value)} className={cx(inputCls, 'min-w-0 flex-1 font-mono text-[12.5px]')} />
            {ollama !== st.ollama.url && (
              <Button size="sm" variant="secondary" onClick={() => save({ ollamaUrl: ollama })}>
                Save
              </Button>
            )}
          </div>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium">vLLM</span>
            <span className={cx('text-[12px]', st.vllm.path ? 'text-ok' : 'text-fg-3')}>
              {st.vllm.path ? `${st.vllm.version} · ${st.vllm.path}` : 'not found (pip install vllm), or give its command'}
            </span>
          </div>
          <div className="mt-1 flex gap-2">
            <input
              value={vllm}
              onChange={(e) => setVllm(e.target.value)}
              placeholder="found by itself: on the PATH or in a conda or venv environment"
              className={cx(inputCls, 'min-w-0 flex-1 font-mono text-[12.5px]')}
            />
            {vllm !== (st.vllm.command ?? '') && (
              <Button size="sm" variant="secondary" onClick={() => save({ vllmCommand: vllm || null })}>
                Save
              </Button>
            )}
          </div>
        </div>
        <div>
          <div className="font-medium">Other OpenAI-compatible endpoints</div>
          {st.endpoints.map((e) => (
            <div key={e.id} className="mt-1 flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate">
                {e.name} <span className="font-mono text-[12px] text-fg-3">{e.baseUrl}</span> <span className="text-[12px] text-fg-3">· {e.models.length} models</span>
              </span>
              <button className="rounded p-1 text-fg-3 hover:bg-bg-2 hover:text-fg" aria-label={`Remove ${e.name}`} onClick={() => save({ endpoint: { id: e.id, remove: true } })}>
                <X size={14} />
              </button>
            </div>
          ))}
          <form
            className="mt-1 flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void save({ endpoint: ep }).then(() => setEp({ name: '', baseUrl: '', apiKey: '' }));
            }}
          >
            <input value={ep.name} onChange={(e) => setEp({ ...ep, name: e.target.value })} placeholder="Name" className={cx(inputCls, 'w-28')} />
            <input
              value={ep.baseUrl}
              onChange={(e) => setEp({ ...ep, baseUrl: e.target.value })}
              placeholder="http://localhost:1234/v1"
              className={cx(inputCls, 'min-w-0 flex-1 font-mono text-[12.5px]')}
            />
            <input type="password" value={ep.apiKey} onChange={(e) => setEp({ ...ep, apiKey: e.target.value })} placeholder="Key (optional)" className={cx(inputCls, 'w-32')} />
            <Button type="submit" size="sm" variant="secondary" disabled={!ep.name.trim() || !ep.baseUrl.trim()}>
              Add
            </Button>
          </form>
        </div>
        <div>
          <div className="font-medium">Hugging Face token</div>
          <div className="text-[12px] text-fg-3">Only for gated or private models.</div>
          {st.hfTokenHint ? (
            <div className="mt-1 flex items-center gap-2">
              <span className="font-mono text-fg-2">{st.hfTokenHint}</span>
              <Button size="sm" variant="ghost" onClick={() => save({ hfToken: null })}>
                Remove
              </Button>
            </div>
          ) : (
            <form
              className="mt-1 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void save({ hfToken: hf }).then(() => setHf(''));
              }}
            >
              <input type="password" value={hf} onChange={(e) => setHf(e.target.value)} placeholder="hf_…" autoComplete="off" className={cx(inputCls, 'min-w-0 flex-1')} />
              <Button type="submit" size="sm" variant="secondary" disabled={!hf.trim()}>
                Save
              </Button>
            </form>
          )}
        </div>
      </div>
    </Section>
  );
}
