import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { Brain, Check, ChevronRight, Gauge, ShieldCheck } from 'lucide-react';
import type { Agent, AgentCatalog, ModelOption, SessionPrefs } from '@shared/types';
import { api } from '../lib/api';
import { agentName } from './AgentIcon';
import { cx, OptionRow, Picker } from './ui';

type Catalog = AgentCatalog & { prefs?: SessionPrefs };

// Catalogs by agent; an ACP agent's by its id ("acp:<id>"): what it offered when it last ran.
const useCatalogs = create<{ byAgent: Record<string, Catalog>; loading: Record<string, boolean> }>(() => ({ byAgent: {}, loading: {} }));
const catalogKey = (agent: Agent, acp?: string) => (agent === 'acp' ? `acp:${acp ?? ''}` : agent);

export function loadCatalog(agent: Agent, force = false, acp?: string) {
  const k = catalogKey(agent, acp);
  const s = useCatalogs.getState();
  if (!force && (s.byAgent[k] || s.loading[k])) return;
  useCatalogs.setState((x) => ({ loading: { ...x.loading, [k]: true } }));
  api<Catalog>(`/api/catalog/${agent}${agent === 'acp' ? `?acp=${encodeURIComponent(acp ?? '')}` : ''}`)
    .then((c) => useCatalogs.setState((x) => ({ byAgent: { ...x.byAgent, [k]: c } })))
    .catch(() => {})
    .finally(() => useCatalogs.setState((x) => ({ loading: { ...x.loading, [k]: false } })));
}

export function useCatalog(agent: Agent, acp?: string): Catalog | undefined {
  const c = useCatalogs((s) => s.byAgent[catalogKey(agent, acp)]);
  // An ACP agent's offer is known once it has run: ask again each time.
  useEffect(() => loadCatalog(agent, agent === 'acp', acp), [agent, acp]);
  return c;
}

export function findModel(c: Catalog | undefined, value?: string | null): ModelOption | undefined {
  if (!c) return undefined;
  if (!value) return c.models.find((m) => m.isDefault) ?? c.models[0];
  // Live sessions report resolved ids (claude-opus-5-5[1m], claude-haiku-4-5-20251001).
  const v = value.toLowerCase().replace(/\[1m\]$/, '');
  const named = c.models.filter((m) => m.value !== 'default');
  return (
    named.find((m) => m.value.toLowerCase() === v) ??
    named.find((m) => m.resolved?.toLowerCase() === v) ??
    named.find((m) => m.resolved && (v.startsWith(m.resolved.toLowerCase()) || m.resolved.toLowerCase().startsWith(v))) ??
    named.find((m) => v.startsWith(m.value.toLowerCase()))
  );
}

export function modelLabel(c: Catalog | undefined, value?: string | null): string {
  if (!value) return findModel(c, null)?.label ?? 'Default model';
  const m = findModel(c, value);
  if (m && m.value !== 'default') return m.label;
  // A resolved model id the catalog does not list: tidy it up.
  return value.replace(/^claude-/, '').replace(/-\d{8}$/, '').replace(/\[1m\]$/, ' 1M');
}

/** "Opus 5.5" → opus [5, 5]; "GPT-6-Luna" → gpt luna [6]: models of one family differ only in their version. */
function family(label: string): { name: string; version: number[] } | null {
  const m = /\d+(?:[.-]\d+)*/.exec(label);
  if (!m) return null;
  const name = (label.slice(0, m.index) + ' ' + label.slice(m.index + m[0].length)).toLowerCase().replace(/[\s_-]+/g, ' ').trim();
  return { name, version: m[0].split(/[.-]/).map(Number) };
}

const newer = (a: number[], b: number[]) => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  return false;
};

interface ModelRow {
  opt: ModelOption;
  /** What picking it sets: null for the agent's default. */
  value: string | null;
  label: string;
  hint?: string;
  isDefault: boolean;
  older: boolean;
}

/** One row per model, the default marked rather than listed twice; older versions of a family are set apart. */
function modelRows(c: Catalog): ModelRow[] {
  const def = c.models.find((m) => m.isDefault);
  const defModel = def?.value === 'default' ? findModel(c, def.resolved) : def;
  const named = c.models.filter((m) => m.value !== 'default');
  const best = new Map<string, number[]>();
  for (const m of named) {
    const f = family(m.label);
    if (f && (!best.has(f.name) || newer(f.version, best.get(f.name)!))) best.set(f.name, f.version);
  }
  return named.map((m) => {
    const f = family(m.label);
    const isDefault = m === defModel;
    return {
      opt: m,
      // Claude's "default" follows its recommendation; Codex's must be named, or Codex falls back to its
      // config.toml model, which a ChatGPT sign-in may not allow.
      value: isDefault && def?.value === 'default' ? null : m.value,
      label: m.label,
      hint: m.description,
      isDefault,
      older: !isDefault && !!f && newer(best.get(f.name)!, f.version),
    };
  });
}

function ModelMenu({ agent, c, value, onPick }: { agent: Agent; c: Catalog | undefined; value?: string | null; onPick: (v: string | null) => void }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  if (!c) return <div className="px-2.5 py-1.5 text-[12px] text-fg-3">Loading {agentName(agent)} models…</div>;
  const rows = modelRows(c);
  // The chosen model, with "default" read as the model it stands for.
  const chosen = findModel(c, value);
  const chosenModel = chosen?.value === 'default' ? findModel(c, chosen.resolved) : chosen;
  const selected = (r: ModelRow) => r.opt === chosenModel;
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const found = (r: ModelRow) => words.every((w) => `${r.label} ${r.value ?? ''}`.toLowerCase().includes(w));
  const shown = words.length ? rows.filter(found) : rows.filter((r) => !r.older || open || selected(r));
  const hidden = words.length ? 0 : rows.length - shown.length;
  return (
    <div className="py-0.5">
      {rows.length > 8 && (
        <input
          autoFocus={!window.matchMedia('(pointer: coarse)').matches}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && shown[0]) onPick(shown[0].value);
          }}
          placeholder="Search models"
          className="mx-1 mb-1 h-8 w-[calc(100%-8px)] rounded-lg bg-bg-2 px-2.5 text-[13px] outline-none placeholder:text-fg-3"
        />
      )}
      {shown.map((r) => (
        <button
          key={r.opt.value}
          type="button"
          title={r.hint}
          onClick={() => onPick(r.value)}
          className={cx('flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[13px] transition-colors hover:bg-bg-2', selected(r) && 'bg-bg-2')}
        >
          <span className="min-w-0 flex-1 truncate text-fg">{r.label}</span>
          {r.isDefault && <span className="shrink-0 text-[11px] text-fg-3">default</span>}
          {selected(r) && <Check size={14} className="shrink-0" strokeWidth={2.5} />}
        </button>
      ))}
      {hidden > 0 && (
        <button type="button" onClick={() => setOpen(true)} className="flex h-7.5 w-full items-center gap-1.5 rounded-lg px-2.5 text-[12px] text-fg-3 transition-colors hover:bg-bg-2 hover:text-fg">
          <ChevronRight size={12} />
          {hidden} older {hidden === 1 ? 'model' : 'models'}
        </button>
      )}
    </div>
  );
}

/**
 * The model, from the agent's own list only: Claude Code's models for Claude Code, Codex's for Codex, the
 * Custom models for Custom. Rows are one line each; older versions of a model wait behind "older models".
 */
export function ModelPicker({
  agent,
  value,
  onChange,
  disabled,
  acp,
  label,
}: {
  agent: Agent;
  value?: string | null;
  onChange: (v: string | null) => void;
  disabled?: boolean;
  /** For an ACP agent: which one (its models are what it offered when it last ran). */
  acp?: string;
  /** Named, without an icon (the start page): "Model  Opus 5.5", the default read as the model it stands for. */
  label?: string;
}) {
  const c = useCatalog(agent, acp);
  if (agent === 'acp' && !c?.models.length) return null;
  const def = !value && label ? c?.models.find((m) => m.isDefault) : undefined;
  return (
    <Picker
      icon={label ? undefined : <Brain size={13} className="shrink-0" />}
      label={label}
      value={c ? (def?.resolved ? modelLabel(c, def.resolved) : modelLabel(c, value)) : '…'}
      title={def ? `Model: ${agentName(agent)}'s default` : 'Model'}
      disabled={disabled}
      width={260}
    >
      {(close) => (
        <ModelMenu
          agent={agent}
          c={c}
          value={value}
          onPick={(v) => {
            onChange(v);
            close();
          }}
        />
      )}
    </Picker>
  );
}

const EFFORT_HINT: Record<string, string> = {
  low: 'Fast, light reasoning',
  medium: 'Balanced',
  high: 'Deeper reasoning',
  xhigh: 'Extra-deep reasoning',
  max: 'Maximum reasoning',
  ultra: 'Maximum, with task delegation',
  minimal: 'Fastest',
  none: 'No reasoning',
};

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

export function EffortPicker({
  agent,
  model,
  value,
  onChange,
  disabled,
  acp,
  label,
}: {
  agent: Agent;
  model?: string | null;
  value?: string | null;
  onChange: (v: string | null) => void;
  disabled?: boolean;
  acp?: string;
  /** Named, without an icon (the start page): "Effort  Medium". */
  label?: string;
}) {
  const c = useCatalog(agent, acp);
  if (agent === 'acp') return null;
  const m = findModel(c, model);
  const levels = m?.efforts ?? [];
  if (c && !levels.length) return null;
  const shown = value ? cap(value) : label ? (m?.defaultEffort ? cap(m.defaultEffort) : 'Default') : 'Effort';
  return (
    <Picker icon={label ? undefined : <Gauge size={13} className="shrink-0" />} label={label} value={shown} title="Reasoning effort: how hard the model thinks" disabled={disabled} width={230}>
      {(close) => (
        <>
          <OptionRow
            label="Default"
            hint={m?.defaultEffort ? `Model default (${m.defaultEffort})` : 'Use the configured default'}
            selected={!value}
            onClick={() => {
              onChange(null);
              close();
            }}
          />
          {levels.map((l) => (
            <OptionRow
              key={l}
              label={cap(l)}
              hint={EFFORT_HINT[l]}
              selected={value === l}
              onClick={() => {
                onChange(l);
                close();
              }}
            />
          ))}
        </>
      )}
    </Picker>
  );
}

export function ModePicker({
  agent,
  value,
  onChange,
  disabled,
  acp,
  label,
}: {
  agent: Agent;
  value?: string | null;
  onChange: (v: string) => void;
  disabled?: boolean;
  acp?: string;
  /** Named, without an icon (the start page): "Permissions  Ask". */
  label?: string;
}) {
  const c = useCatalog(agent, acp);
  const cur = c?.modes.find((m) => m.value === value) ?? c?.modes.find((m) => m.value === c?.defaultMode);
  if (agent === 'acp' && !c?.modes.length) return null;
  return (
    <Picker
      icon={label ? undefined : <ShieldCheck size={13} className="shrink-0" />}
      label={label}
      value={cur?.label ?? (label ? (c ? 'Default' : '…') : 'Mode')}
      title={`${label ? 'What the agent may do without asking you' : 'Mode'} (Shift+Tab cycles)${cur?.description ? `\n${cur.label} · ${cur.description}` : ''}`}
      disabled={disabled}
      width={300}
    >
      {(close) => (
        <>
          {(c?.modes ?? []).map((m) => (
            <OptionRow
              key={m.value}
              label={m.label}
              hint={m.description}
              selected={cur?.value === m.value}
              onClick={() => {
                onChange(m.value);
                close();
              }}
            />
          ))}
          {c?.modeNote && <div className="mx-1 mt-1 border-t border-line px-2 pt-2 pb-1 text-[11.5px] leading-snug text-fg-3">{c.modeNote}</div>}
        </>
      )}
    </Picker>
  );
}

export function nextMode(c: Catalog | undefined, current?: string | null): string | null {
  if (!c?.modes.length) return null;
  const order = c.modes.map((m) => m.value);
  const i = order.indexOf(current ?? c.defaultMode);
  return order[(i + 1) % order.length];
}
