import { useEffect, useState } from "react";
import {
  Brain,
  Check,
  Cpu,
  Download,
  ExternalLink,
  Eye,
  HardDrive,
  Play,
  Plus,
  Search,
  Square,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import type {
  HfInspect,
  LocalModel,
  ModelFit,
  ModelsState,
  OpenRouterModel,
  OpenRouterSort,
} from "@shared/types";
import { api, post, put } from "../../lib/api";
import { toast, toastError } from "../../lib/store";
import { live } from "../../lib/ws";
import {
  Button,
  cx,
  inputCls,
  Section,
  Throbber,
  useConfirm,
} from "../../components/ui";

const GiB = 1024 ** 3;
export const size = (b: number) =>
  b >= 10 * GiB
    ? `${Math.round(b / GiB)} GB`
    : b >= 0.1 * GiB
      ? `${(b / GiB).toFixed(1)} GB`
      : `${Math.round(b / 1024 ** 2)} MB`;
const params = (n?: number) =>
  n
    ? n >= 1e9
      ? `${(n / 1e9).toFixed(n >= 1e10 ? 0 : 1)}B parameters`
      : `${Math.round(n / 1e6)}M parameters`
    : "";

/** The Custom agent's models, kept current: providers, what is on this machine, downloads. */
export function useModels(): ModelsState | null {
  const [st, setSt] = useState<ModelsState | null>(null);
  useEffect(() => {
    api<ModelsState>("/api/models").then(setSt, toastError);
    return live.on((e) => e.t === "models" && setSt(e.state));
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
        Custom, the app’s own agent, runs any of these models with the same
        tools, skills and MCP servers as the other agents. Pick Custom on the
        start page, then the model.
      </p>
      <LocalModels st={st} />
      <AddFromHf st={st} />
      <OpenRouter st={st} />
      <Runtimes st={st} />
    </div>
  );
}

function Verdict({ fit }: { fit: ModelFit }) {
  const label =
    fit.verdict === "good"
      ? `Runs well on GPU ${fit.gpu}`
      : fit.verdict === "slow"
        ? "Runs on the CPU, slowly"
        : fit.verdict === "tight"
          ? "Runs on the CPU, very slowly"
          : "Too big for this machine";
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-px text-[11.5px] font-medium",
        fit.verdict === "good"
          ? "bg-ok/12 text-ok"
          : fit.verdict === "no"
            ? "bg-err/12 text-err"
            : "bg-warn/12 text-warn",
      )}
    >
      {fit.verdict === "good" && <Check size={11} strokeWidth={3} />}
      {label}
    </span>
  );
}

function FitLine({ fit }: { fit: ModelFit }) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-fg-3">
      <Verdict fit={fit} />
      <span>needs {size(fit.needBytes)}</span>
      {fit.tokensPerSec ? (
        <span>· about {fit.tokensPerSec} tokens/s</span>
      ) : null}
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
        body: (
          <>
            Its files ({size(m.sizeBytes)}) are deleted from this machine. You
            can install it again later.
          </>
        ),
        confirm: "Remove",
        danger: true,
      }))
    )
      return;
    post("/api/models/remove", { id: m.id }).then(
      () => toast(`Removed ${m.repo}`, "ok"),
      toastError,
    );
  };
  const running = st.downloads.filter((d) => d.status !== "done");
  return (
    <Section title="On this machine">
      {confirmNode}
      <div className="mb-2 flex items-center gap-2 text-[12.5px] text-fg-3">
        <HardDrive size={13} />
        Models take {size(st.storage.usedBytes)} · {size(st.storage.freeBytes)}{" "}
        of disk free
        {st.machine.gpus.length > 0 && (
          <span>
            ·{" "}
            {st.machine.gpus
              .map((g) => `GPU ${g.index} ${size(g.freeBytes)} free`)
              .join(", ")}
          </span>
        )}
      </div>
      {running.map((d) => (
        <div
          key={d.key}
          className="flex items-center gap-3 border-t border-line py-2.5"
        >
          <Download size={15} className="shrink-0 text-fg-3" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px]">
              {d.name.replace(/^hf\.co\//, "")}
            </div>
            {d.status === "running" ? (
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
                  {size(d.doneBytes)} of{" "}
                  {d.totalBytes ? size(d.totalBytes) : "…"} ·{" "}
                  {d.target === "ollama" ? "with Ollama" : "for vLLM"}
                </div>
              </>
            ) : (
              <div
                className={cx(
                  "text-[12px]",
                  d.status === "failed" ? "text-err" : "text-fg-3",
                )}
              >
                {d.status === "failed" ? d.error : "Cancelled"}
              </div>
            )}
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              post("/api/models/cancel", { key: d.key }).catch(toastError)
            }
          >
            {d.status === "running" ? "Cancel" : "Dismiss"}
          </Button>
        </div>
      ))}
      {!st.local.length && !running.length && (
        <div className="border-t border-line py-3 text-[13px] text-fg-3">
          No models here yet: add one from Hugging Face below.
        </div>
      )}
      {st.local.map((m) => (
        <div
          key={m.id}
          className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-line py-2.5"
        >
          <Cpu size={15} className="shrink-0 text-fg-3" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] text-fg">{m.repo}</div>
            <div className="text-[12px] text-fg-3">
              {m.runtime === "ollama" ? "Ollama" : "vLLM"} · {size(m.sizeBytes)}
              {m.detail ? ` · ${m.detail}` : ""}
              {m.vision ? " · sees images" : ""}
              {m.server?.state === "ready" &&
                ` · running on GPU ${m.server.gpu}`}
              {m.server?.state === "starting" && " · starting…"}
              {m.supported === false && m.reason ? ` · ${m.reason}` : ""}
            </div>
            {m.server?.state === "failed" && (
              <div className="mt-1 line-clamp-3 font-mono text-[11px] text-err">
                {m.server.error}
              </div>
            )}
          </div>
          {m.runtime === "vllm" &&
            m.supported &&
            (m.server && m.server.state !== "failed" ? (
              <Button
                size="sm"
                variant="ghost"
                icon={<Square size={12} />}
                onClick={() =>
                  post("/api/models/stop", { repo: m.repo }).catch(toastError)
                }
              >
                Stop
              </Button>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                icon={<Play size={12} />}
                onClick={() =>
                  post("/api/models/start", { repo: m.repo }).catch(toastError)
                }
              >
                Start
              </Button>
            ))}
          <Button
            size="sm"
            variant="ghost"
            icon={<Trash2 size={13} />}
            onClick={() => remove(m)}
          >
            Remove
          </Button>
        </div>
      ))}
    </Section>
  );
}

// ---- from Hugging Face -----------------------------------------------------------------------------

function AddFromHf({ st }: { st: ModelsState }) {
  return (
    <Section title="Add a model from Hugging Face">
      <HfCheck st={st} />
    </Section>
  );
}

/** A Hugging Face model by name: how it would run here, then installing it (with Ollama or for vLLM). */
export function HfCheck({
  st,
  placeholder = "org/model, or its huggingface.co address",
}: {
  st: ModelsState;
  placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<HfInspect | null>(null);
  const check = async (input = q) => {
    if (!input.trim()) return;
    setBusy(true);
    setInfo(null);
    try {
      setInfo(await post<HfInspect>("/api/models/inspect", { input }));
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const install = (body: { repo?: string; ollama?: string }) =>
    post("/api/models/install", body).then(() => {
      toast("Downloading: it shows under On this machine", "ok");
      setInfo(null);
      setQ("");
    }, toastError);
  return (
    <>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void check();
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
          className={cx(inputCls, "min-w-0 flex-1")}
        />
        <Button
          type="submit"
          size="sm"
          variant="secondary"
          disabled={busy || !q.trim()}
          icon={busy ? <Throbber /> : <Search size={13} />}
        >
          Check
        </Button>
      </form>
      <p className="mt-1.5 text-[12px] text-fg-3">
        Checks how the model would run on this machine before anything
        downloads.
      </p>
      {info && (
        <div className="anim-in mt-3 rounded-xl border border-line bg-bg-1 p-3">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <a
              href={`https://huggingface.co/${info.repo}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[13.5px] font-medium text-fg hover:underline"
            >
              {info.repo} <ExternalLink size={11} />
            </a>
            <span className="text-[12px] text-fg-3">
              {[
                params(info.params),
                info.contextLength
                  ? `${Math.round(info.contextLength / 1000)}K context`
                  : "",
                info.vision ? "sees images" : "",
                info.arch,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </div>
          {info.gated && (
            <div className="mt-1 text-[12px] text-warn">
              Gated: accept its terms on Hugging Face and add a token below
              first.
            </div>
          )}
          {info.kind === "gguf" && (
            <div className="mt-2">
              <div className="text-[12px] text-fg-3">
                GGUF weights: they run with Ollama
                {st.ollama.version ? "" : ", which is not running here"}.
                Smaller files trade a little quality for speed and memory.
              </div>
              {info.quants.map((x) => (
                <div
                  key={x.tag}
                  className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-2"
                >
                  <div className="min-w-0 flex-1">
                    <span className="font-mono text-[12.5px] text-fg">
                      {x.tag}
                    </span>
                    <FitLine fit={x.fit} />
                  </div>
                  <Button
                    size="sm"
                    variant={x.fit.verdict === "good" ? "primary" : "secondary"}
                    disabled={!st.ollama.version || x.fit.verdict === "no"}
                    onClick={() => install({ ollama: x.ollamaName })}
                  >
                    Install
                  </Button>
                </div>
              ))}
            </div>
          )}
          {info.kind === "safetensors" && info.vllm && (
            <div className="mt-2">
              {info.vllm.supported === false || info.vllm.supported === null ? (
                <div className="text-[12.5px] text-fg-2">
                  {info.vllm.supported === null
                    ? "vLLM is not installed here (it runs these weights)."
                    : info.vllm.reason}
                  {info.ggufRepo && (
                    <>
                      {" "}
                      The GGUF version runs with Ollama:{" "}
                      <button
                        className="text-accent hover:underline"
                        onClick={() => (
                          setQ(info.ggufRepo!),
                          void check(info.ggufRepo)
                        )}
                      >
                        check {info.ggufRepo}
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] text-fg-3">
                      Runs with vLLM, which starts it on a GPU when a session
                      uses it.
                    </div>
                    <FitLine fit={info.vllm.fit} />
                  </div>
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={info.vllm.fit.verdict === "no"}
                    onClick={() => install({ repo: info.repo })}
                  >
                    Download
                  </Button>
                </div>
              )}
              {info.vllm.supported !== false && (
                <div className="mt-1.5 text-[11.5px] text-fg-3">
                  {info.vllm.fit.notes.join(" ")}
                </div>
              )}
            </div>
          )}
          {info.kind === "other" && (
            <div className="mt-2 text-[12.5px] text-fg-3">
              No weights this app can run (safetensors for vLLM, GGUF for
              Ollama).
            </div>
          )}
        </div>
      )}
    </>
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
const STARTERS = ["deepseek", "qwen", "glm", "kimi", "gpt-oss", "mistral"];

const FILTERS: { id: string; label: string; icon?: React.ReactNode }[] = [
  { id: "tools", label: "Tool calls", icon: <Wrench size={12} /> },
  { id: "vision", label: "Sees images", icon: <Eye size={12} /> },
  { id: "reasoning", label: "Reasoning", icon: <Brain size={12} /> },
  { id: "free", label: "Free" },
];
const SORTS: { id: OpenRouterSort; label: string }[] = [
  { id: "match", label: "Best match" },
  { id: "new", label: "Newest" },
  { id: "price", label: "Cheapest" },
  { id: "context", label: "Longest context" },
];

/** 1M, 164K… */
const tokens = (n: number) =>
  n >= 1_000_000
    ? `${+(n / 1_048_576).toFixed(1)}M`
    : `${Math.round(n / 1000)}K`;
/** $0.15, $3, $0.021… per million tokens. */
const dollars = (n: number) =>
  `$${n >= 10 ? Math.round(n) : n >= 1 ? n.toFixed(2).replace(/\.00$/, "") : n >= 0.1 ? n.toFixed(2) : +n.toPrecision(2)}`;
const DAY = 86_400_000;

/** A maker's initial on a tile of its own colour. */
function OrgMark({ name }: { name: string }) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return (
    <span
      className="org-mark flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] text-[13px] font-semibold"
      style={{ "--h": h } as React.CSSProperties}
      title={name}
      aria-hidden
    >
      {name.replace(/^~/, "").charAt(0).toUpperCase()}
    </span>
  );
}

function Tag({
  tone = "plain",
  icon,
  children,
  title,
}: {
  tone?: "plain" | "accent" | "ok" | "warn";
  icon?: React.ReactNode;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cx(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-px text-[11px] leading-[17px] font-medium whitespace-nowrap",
        tone === "plain" && "bg-bg-2 text-fg-2 ring-1 ring-line",
        tone === "accent" && "bg-accent-soft text-accent",
        tone === "ok" && "bg-ok/12 text-ok",
        tone === "warn" && "bg-warn/12 text-warn",
      )}
    >
      {icon}
      {children}
    </span>
  );
}

/** One model: its maker, name and what it can do, then context, longest reply, price and age. */
function OrModelRow({
  m,
  action,
}: {
  m: OpenRouterModel;
  action: React.ReactNode;
}) {
  const slug = m.detail ?? m.id.replace(/^openrouter\//, "");
  const latest = slug.startsWith("~");
  const free = !!m.price && m.price.input === 0 && m.price.output === 0;
  const fresh = !!m.created && Date.now() - m.created < 21 * DAY;
  return (
    <div className="px-3 py-2.5">
      <div className="flex items-start gap-3">
        <OrgMark name={m.org ?? slug.split("/")[0]} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
            <span className="text-[13.5px] leading-5 font-medium text-fg">
              {m.label}
            </span>
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
            {m.tools && m.tools !== "native" && (
              <Tag
                tone="warn"
                title="Custom tells it about its tools in the prompt and reads its calls from the text"
              >
                No native tools
              </Tag>
            )}
          </div>
          <div className="tnum mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-fg-3">
            {m.org && <span className="text-fg-2">{m.org}</span>}
            {m.contextLength ? (
              <span title="How much it reads at once">
                {tokens(m.contextLength)} context
              </span>
            ) : null}
            {m.maxOutput ? (
              <span title="Its longest reply">{tokens(m.maxOutput)} out</span>
            ) : null}
            {m.price && !free && (
              <span title="Per million tokens">
                {dollars(m.price.input)} in · {dollars(m.price.output)} out
              </span>
            )}
            {m.created && (
              <span>
                {new Date(m.created).toLocaleDateString(undefined, {
                  month: "short",
                  year: "numeric",
                })}
              </span>
            )}
          </div>
        </div>
        <div className="shrink-0 pt-0.5">{action}</div>
      </div>
      {/* Under the text on wide screens; the whole width on a phone. */}
      {m.description && (
        <p
          className="mt-1.5 line-clamp-2 pl-11 text-[12px] leading-snug text-fg-3 max-sm:pl-0"
          title={m.description}
        >
          {m.description}
        </p>
      )}
      <div className="mt-1 truncate pl-11 font-mono text-[11px] text-fg-3/80 max-sm:pl-0">
        {slug}
      </div>
    </div>
  );
}

/** The OpenRouter key, and the models it brings into the pickers: search by name, filter, sort. */
export function OpenRouterBody({ st }: { st: ModelsState }) {
  const [key, setKey] = useState("");
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<string[]>([]);
  const [sort, setSort] = useState<OpenRouterSort | "">("");
  const [hits, setHits] = useState<OpenRouterModel[] | null>(null);
  const [busy, setBusy] = useState(false);
  const browsing = !!q.trim() || filters.length > 0 || !!sort;
  useEffect(() => {
    if (!browsing || !st.openrouter.keyHint) return setHits(null);
    let alive = true;
    const p = new URLSearchParams({ q: q.trim() });
    if (sort) p.set("sort", sort);
    if (filters.length) p.set("f", filters.join(","));
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
  }, [q, filters, sort, browsing, st.openrouter.keyHint]);
  const pinned = new Set(st.openrouter.pinned.map((p) => p.id));
  const save = (body: Record<string, unknown>) =>
    put("/api/models", body).catch(toastError);
  const toggle = (f: string) =>
    setFilters((l) => (l.includes(f) ? l.filter((x) => x !== f) : [...l, f]));
  return (
    <>
      <p className="mb-2 text-[12.5px] text-fg-3">
        Hundreds of models through one key, paid per token at{" "}
        <a
          className="text-accent hover:underline"
          href="https://openrouter.ai/keys"
          target="_blank"
          rel="noreferrer"
        >
          openrouter.ai
        </a>
        .
      </p>
      {st.openrouter.keyHint ? (
        <div className="flex items-center gap-2 text-[13px]">
          <span className="font-mono text-fg-2">{st.openrouter.keyHint}</span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => save({ openrouterKey: null })}
          >
            Remove key
          </Button>
        </div>
      ) : (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void save({ openrouterKey: key }).then(() => setKey(""));
          }}
        >
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="sk-or-…"
            autoComplete="off"
            className={cx(inputCls, "min-w-0 flex-1")}
          />
          <Button
            type="submit"
            size="sm"
            variant="primary"
            disabled={!key.trim()}
          >
            Save
          </Button>
        </form>
      )}
      {st.openrouter.keyHint && (
        <>
          {st.openrouter.pinned.length > 0 && (
            <div className="mt-3">
              <div className="mb-1 text-[11.5px] font-medium tracking-wide text-fg-3 uppercase">
                In the pickers
              </div>
              <div className="divide-y divide-line overflow-hidden rounded-xl border border-line">
                {st.openrouter.pinned.map((m) => (
                  <OrModelRow
                    key={m.id}
                    m={m}
                    action={
                      <button
                        className="rounded p-1 text-fg-3 hover:bg-bg-2 hover:text-fg"
                        aria-label={`Remove ${m.label}`}
                        title="Remove from the pickers"
                        onClick={() => save({ unpin: m.id })}
                      >
                        <X size={14} />
                      </button>
                    }
                  />
                ))}
              </div>
            </div>
          )}
          <div className="relative mt-3">
            <Search
              size={14}
              className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-fg-3"
            />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Add a model: search by name or maker (deepseek, qwen, claude…)"
              className={cx(inputCls, "w-full pr-8 pl-8")}
            />
            {busy && (
              <Throbber className="absolute top-1/2 right-2.5 -translate-y-1/2 text-fg-3" />
            )}
          </div>
          {/* One row; on a narrow screen it scrolls sideways. */}
          <div className="-mx-1 mt-2 flex items-center gap-1.5 overflow-x-auto px-1 py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {FILTERS.map((f) => {
              const on = filters.includes(f.id);
              return (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(f.id)}
                  className={cx(
                    "inline-flex h-7 shrink-0 items-center gap-1 rounded-lg px-2.5 text-[12px] font-medium whitespace-nowrap ring-1 transition-colors",
                    on
                      ? "bg-accent-soft text-accent ring-accent/40"
                      : "bg-bg-2 text-fg-2 ring-line hover:bg-bg-3 hover:text-fg",
                  )}
                >
                  {f.icon}
                  {f.label}
                </button>
              );
            })}
            <span className="flex-1" />
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as OpenRouterSort | "")}
              aria-label="Order"
              className="h-7 shrink-0 rounded-lg bg-bg-2 px-2 text-[12px] font-medium text-fg-2 ring-1 ring-line outline-none hover:bg-bg-3"
            >
              <option value="">{q.trim() ? "Best match" : "Newest"}</option>
              {SORTS.filter((x) => x.id !== (q.trim() ? "match" : "new")).map(
                (x) => (
                  <option key={x.id} value={x.id}>
                    {x.label}
                  </option>
                ),
              )}
            </select>
          </div>
          {!st.openrouter.pinned.length && !browsing && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px] text-fg-3">
              Pick at least one to use it. Try
              {STARTERS.map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setQ(w)}
                  className="rounded-md bg-bg-2 px-1.5 py-0.5 font-mono text-[11.5px] text-fg-2 ring-1 ring-line transition-colors hover:bg-bg-3 hover:text-fg"
                >
                  {w}
                </button>
              ))}
            </div>
          )}
          {hits && (
            <div className="anim-in mt-2">
              <div className="mb-1 text-[11.5px] text-fg-3">
                {hits.length
                  ? `${hits.length === 50 ? "First 50" : hits.length} model${hits.length === 1 ? "" : "s"}`
                  : "No model matches"}
              </div>
              {hits.length > 0 && (
                <div className="max-h-[min(460px,55vh)] divide-y divide-line overflow-y-auto overscroll-contain rounded-xl border border-line">
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
                          <Button
                            size="sm"
                            variant="secondary"
                            icon={<Plus size={13} />}
                            onClick={() => save({ pin: m.id })}
                            aria-label={`Add ${m.label}`}
                          >
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
        </>
      )}
    </>
  );
}

// ---- Ollama, vLLM, other endpoints, Hugging Face token ------------------------------------------------

function Runtimes({ st }: { st: ModelsState }) {
  const [ollama, setOllama] = useState(st.ollama.url);
  const [vllm, setVllm] = useState(st.vllm.command ?? "");
  const [hf, setHf] = useState("");
  const [ep, setEp] = useState({ name: "", baseUrl: "", apiKey: "" });
  const save = (body: Record<string, unknown>) =>
    put("/api/models", body).then(() => toast("Saved", "ok"), toastError);
  return (
    <Section title="Runtimes and endpoints">
      <div className="space-y-3 text-[13px]">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium">Ollama</span>
            <span
              className={cx(
                "text-[12px]",
                st.ollama.version ? "text-ok" : "text-fg-3",
              )}
            >
              {st.ollama.version
                ? `running, ${st.ollama.version}`
                : "not running at this address"}
            </span>
            {!st.ollama.version && (
              <a
                className="text-[12px] text-accent hover:underline"
                href="https://ollama.com/download"
                target="_blank"
                rel="noreferrer"
              >
                Install Ollama
              </a>
            )}
          </div>
          <div className="mt-1 flex gap-2">
            <input
              value={ollama}
              onChange={(e) => setOllama(e.target.value)}
              className={cx(inputCls, "min-w-0 flex-1 font-mono text-[12.5px]")}
            />
            {ollama !== st.ollama.url && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => save({ ollamaUrl: ollama })}
              >
                Save
              </Button>
            )}
          </div>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium">vLLM</span>
            <span
              className={cx(
                "text-[12px]",
                st.vllm.path ? "text-ok" : "text-fg-3",
              )}
            >
              {st.vllm.path
                ? `${st.vllm.version} · ${st.vllm.path}`
                : "not found (pip install vllm), or give its command"}
            </span>
          </div>
          <div className="mt-1 flex gap-2">
            <input
              value={vllm}
              onChange={(e) => setVllm(e.target.value)}
              placeholder="found by itself: on the PATH or in a conda or venv environment"
              className={cx(inputCls, "min-w-0 flex-1 font-mono text-[12.5px]")}
            />
            {vllm !== (st.vllm.command ?? "") && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => save({ vllmCommand: vllm || null })}
              >
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
                {e.name}{" "}
                <span className="font-mono text-[12px] text-fg-3">
                  {e.baseUrl}
                </span>{" "}
                <span className="text-[12px] text-fg-3">
                  · {e.models.length} models
                </span>
              </span>
              <button
                className="rounded p-1 text-fg-3 hover:bg-bg-2 hover:text-fg"
                aria-label={`Remove ${e.name}`}
                onClick={() => save({ endpoint: { id: e.id, remove: true } })}
              >
                <X size={14} />
              </button>
            </div>
          ))}
          <form
            className="mt-1 flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void save({ endpoint: ep }).then(() =>
                setEp({ name: "", baseUrl: "", apiKey: "" }),
              );
            }}
          >
            <input
              value={ep.name}
              onChange={(e) => setEp({ ...ep, name: e.target.value })}
              placeholder="Name"
              className={cx(inputCls, "w-28")}
            />
            <input
              value={ep.baseUrl}
              onChange={(e) => setEp({ ...ep, baseUrl: e.target.value })}
              placeholder="http://localhost:1234/v1"
              className={cx(inputCls, "min-w-0 flex-1 font-mono text-[12.5px]")}
            />
            <input
              type="password"
              value={ep.apiKey}
              onChange={(e) => setEp({ ...ep, apiKey: e.target.value })}
              placeholder="Key (optional)"
              className={cx(inputCls, "w-32")}
            />
            <Button
              type="submit"
              size="sm"
              variant="secondary"
              disabled={!ep.name.trim() || !ep.baseUrl.trim()}
            >
              Add
            </Button>
          </form>
        </div>
        <div>
          <div className="font-medium">Hugging Face token</div>
          <div className="text-[12px] text-fg-3">
            Only for gated or private models.
          </div>
          {st.hfTokenHint ? (
            <div className="mt-1 flex items-center gap-2">
              <span className="font-mono text-fg-2">{st.hfTokenHint}</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => save({ hfToken: null })}
              >
                Remove
              </Button>
            </div>
          ) : (
            <form
              className="mt-1 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void save({ hfToken: hf }).then(() => setHf(""));
              }}
            >
              <input
                type="password"
                value={hf}
                onChange={(e) => setHf(e.target.value)}
                placeholder="hf_…"
                autoComplete="off"
                className={cx(inputCls, "min-w-0 flex-1")}
              />
              <Button
                type="submit"
                size="sm"
                variant="secondary"
                disabled={!hf.trim()}
              >
                Save
              </Button>
            </form>
          )}
        </div>
      </div>
    </Section>
  );
}
