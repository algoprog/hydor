import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { Check, ChevronRight, Cpu, Gauge, ShieldCheck } from 'lucide-react';
import { AUTO_MODEL, modelFamily as family, newerVersion as newer, tierLabel, tierProgram, TIERS, type Tier, type TierPick } from '@shared/tiers';
import type { Agent, AgentCatalog, ModelOption, ModelSource, SessionPrefs } from '@shared/types';
import { api } from '../lib/api';
import { go } from '../lib/nav';
import { useTierMap } from '../features/assistants/agentsState';
import { agentName } from './AgentIcon';
import { cx, MenuLabel, OptionRow, Picker } from './ui';

type Catalog = AgentCatalog & { prefs?: SessionPrefs };

// Catalogs by agent; an ACP agent's by its id ("acp:<id>"): what it offered when it last ran.
const useCatalogs = create<{ byAgent: Record<string, Catalog>; loading: Record<string, boolean> }>(() => ({ byAgent: {}, loading: {} }));
const catalogKey = (agent: Agent, acp?: string) => (agent === 'acp' ? `acp:${acp ?? ''}` : agent);

export function loadCatalog(agent: Agent, force = false, acp?: string) {
  const k = catalogKey(agent, acp);
  const s = useCatalogs.getState();
  // A list that came back empty (the agent did not start) is asked for again, so its models show once it starts.
  if (!force && (s.byAgent[k]?.models.length || s.loading[k])) return;
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

interface ModelRow {
  opt: ModelOption;
  /** What picking it sets: null for the agent's default. */
  value: string | null;
  label: string;
  hint?: string;
  isDefault: boolean;
  older: boolean;
}

/**
 * One row per model, the default marked rather than listed twice; older versions of a family are set apart. `named`:
 * picking the default model names it (where "no model" means Automatic, the tiers' pick).
 */
function modelRows(c: Catalog, named = false): ModelRow[] {
  const def = c.models.find((m) => m.isDefault);
  const defModel = def?.value === 'default' ? findModel(c, def.resolved) : def;
  const listed = c.models.filter((m) => m.value !== 'default');
  const best = new Map<string, number[]>();
  for (const m of listed) {
    const f = family(m.label);
    if (f && (!best.has(f.name) || newer(f.version, best.get(f.name)!))) best.set(f.name, f.version);
  }
  return listed.map((m) => {
    const f = family(m.label);
    const isDefault = m === defModel;
    return {
      opt: m,
      // Claude's "default" follows its recommendation; Codex's must be named, or Codex falls back to its
      // config.toml model, which a ChatGPT sign-in may not allow.
      value: isDefault && def?.value === 'default' && !named ? null : m.value,
      label: m.label,
      hint: m.description,
      isDefault,
      older: !isDefault && !!f && newer(best.get(f.name)!, f.version),
    };
  });
}

/** Custom's models by where they come from, in this order; Claude Code's and Codex's lists have no source and show as one. */
export const MODEL_SOURCES: { source: ModelSource; title: string }[] = [
  { source: 'subscription', title: 'Your subscriptions' },
  { source: 'local', title: 'On this computer' },
  { source: 'cloud', title: 'In the cloud' },
];

/** The model and effort a tier means for a program now (Settings → Models → Tiers); nothing while the table loads or when the program has no tiers. */
export function useTierPick(agent: Agent, acp: string | undefined, tier: Tier | null | undefined): TierPick | undefined {
  const map = useTierMap();
  const prog = tierProgram(agent, acp);
  return tier && prog ? map?.[prog]?.[tier] : undefined;
}

/** "Sonnet 5.5 · High": the model a tier means, with its effort when it sets one. */
export function tierMeans(c: Catalog | undefined, pick: TierPick | undefined): string {
  if (!pick) return '';
  return [modelLabel(c, pick.model), pick.effort && cap(pick.effort)].filter(Boolean).join(' · ');
}

function ModelMenu({
  agent,
  c,
  value,
  onPick,
  localOnly,
  onClose,
  auto,
  acp,
  tier,
  onTier,
}: {
  agent: Agent;
  c: Catalog | undefined;
  value?: string | null;
  onPick: (v: string | null) => void;
  localOnly?: boolean;
  onClose?: () => void;
  /** Automatic is offered first, with this line on what it picks. */
  auto?: string;
  acp?: string;
  /** The tier picked (no model row is then). */
  tier?: Tier | null;
  /** Offers the tiers first, for a program that has them. */
  onTier?: (t: Tier) => void;
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const tierMap = useTierMap();
  if (!c) return <div className="px-2.5 py-1.5 text-[12px] text-fg-3">Loading {agentName(agent)} models…</div>;
  // A confidential session: only models on this computer or your network.
  const rows = modelRows(c, !!auto).filter((r) => !localOnly || r.opt.local);
  if (localOnly && !rows.length)
    return (
      <div className="px-2.5 py-2 text-[12.5px] leading-snug text-fg-3">
        No model on this computer yet.{' '}
        <button type="button" className="font-medium text-accent hover:underline" onClick={() => (onClose?.(), go('/settings?s=models'))}>
          Settings → Models
        </button>{' '}
        installs one.
      </div>
    );
  if (!rows.length) return <NoModels agent={agent} why={c.modelsError} />;
  // The chosen model, with "default" read as the model it stands for.
  const isAuto = !!auto && value === AUTO_MODEL;
  const byTier = !!onTier && !!tier && !!tierProgram(agent, acp);
  const chosen = isAuto || byTier ? undefined : findModel(c, value);
  const chosenModel = chosen?.value === 'default' ? findModel(c, chosen.resolved) : chosen;
  const selected = (r: ModelRow) => r.opt === chosenModel;
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const found = (r: ModelRow) => words.every((w) => `${r.label} ${r.value ?? ''}`.toLowerCase().includes(w));
  const shown = words.length ? rows.filter(found) : rows.filter((r) => !r.older || open || selected(r));
  const hidden = words.length ? 0 : rows.length - shown.length;
  // The tiers that name a model or an effort for this program: offered first, but not while searching (as Automatic).
  const prog = onTier ? tierProgram(agent, acp) : null;
  const tierRows = prog && !words.length ? TIERS.filter((t) => tierMap?.[prog]?.[t.id]?.model || tierMap?.[prog]?.[t.id]?.effort) : [];
  // Custom's rows carry their source: three sections, an empty one (or one with no match) left out.
  const sections: { title?: string; rows: ModelRow[] }[] = shown.some((r) => r.opt.source)
    ? [...MODEL_SOURCES.map(({ source, title }) => ({ title, rows: shown.filter((r) => r.opt.source === source) })), { title: undefined, rows: shown.filter((r) => !r.opt.source) }].filter((x) => x.rows.length)
    : [{ rows: shown }];
  return (
    <div className="py-0.5">
      {rows.length > 8 && (
        <input
          autoFocus={!window.matchMedia('(pointer: coarse)').matches}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && sections[0]) onPick(sections[0].rows[0].value);
          }}
          placeholder="Search models"
          className="mx-1 mb-1 h-8 w-[calc(100%-8px)] rounded-lg bg-bg-2 px-2.5 text-[13px] outline-none placeholder:text-fg-3"
        />
      )}
      {auto && !words.length && (
        <button
          type="button"
          onClick={() => onPick(AUTO_MODEL)}
          className={cx('mb-0.5 flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-bg-2', isAuto && 'bg-bg-2')}
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] text-fg">Automatic</span>
            <span className="block text-[11.5px] leading-snug text-fg-3">{auto}</span>
          </span>
          {isAuto && <Check size={14} className="shrink-0" strokeWidth={2.5} />}
        </button>
      )}
      {tierRows.map((t) => (
        <button
          key={t.id}
          type="button"
          title={t.hint}
          onClick={() => onTier!(t.id)}
          className={cx('mb-0.5 flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-bg-2', byTier && tier === t.id && 'bg-bg-2')}
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] text-fg">{t.label}</span>
            <span className="block truncate text-[11.5px] leading-snug text-fg-3">{tierMeans(c, tierMap?.[prog!]?.[t.id])}</span>
          </span>
          {byTier && tier === t.id && <Check size={14} className="shrink-0" strokeWidth={2.5} />}
        </button>
      ))}
      {tierRows.length > 0 && <MenuLabel>Models by name</MenuLabel>}
      {sections.map((sec) => (
        <div key={sec.title ?? ''}>
          {sec.title && <MenuLabel>{sec.title}</MenuLabel>}
          {sec.rows.map((r) => (
            <button
              key={r.opt.value}
              type="button"
              title={r.hint}
              onClick={() => onPick(r.value)}
              className={cx('flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[13px] transition-colors hover:bg-bg-2', selected(r) && 'bg-bg-2')}
            >
              <span className="min-w-0 flex-1 truncate text-fg">{r.label}</span>
              {r.isDefault && <span className="shrink-0 text-[11px] text-fg-3">default</span>}
              {r.opt.via && (
                <span className="shrink-0 text-[11px] text-fg-3" translate="no">
                  {r.opt.via}
                </span>
              )}
              {selected(r) && <Check size={14} className="shrink-0" strokeWidth={2.5} />}
            </button>
          ))}
        </div>
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

/** No models to pick: the agent did not start when asked (why, in its own words) or listed none; a click asks again. */
function NoModels({ agent, why }: { agent: Agent; why?: string }) {
  const busy = useCatalogs((s) => !!s.loading[catalogKey(agent)]);
  return (
    <div className="px-2.5 py-2 text-[12.5px] leading-snug text-fg-3">
      {why ? (
        <>
          <span>{agentName(agent)} did not start, so its models are not known yet:</span>{' '}
          <span translate="no" className="break-words text-fg-2">
            {why}
          </span>
        </>
      ) : (
        <span>{agentName(agent)} has not listed its models yet.</span>
      )}{' '}
      <button type="button" disabled={busy} className="font-medium text-accent hover:underline disabled:opacity-50" onClick={() => loadCatalog(agent, true)}>
        Try again
      </button>
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
  localOnly,
  auto,
  tier,
  onTier,
}: {
  agent: Agent;
  value?: string | null;
  onChange: (v: string | null) => void;
  disabled?: boolean;
  /** For an ACP agent: which one (its models are what it offered when it last ran). */
  acp?: string;
  /** Named (the start page): "Model  Opus 5.5", the default read as the model it stands for. */
  label?: string;
  /** Only the models on this computer or your network (a confidential session). */
  localOnly?: boolean;
  /** Offers Automatic first (the start page, where the tiers pick the model), with this line on what it picks; `value` is then "auto" for it. */
  auto?: string;
  /** The tier picked in place of a model by name (apps): shown by its name, with no model row picked. */
  tier?: Tier | null;
  /** Offers the tiers first (for a program that has them): picking one calls this, picking a model calls `onChange`. */
  onTier?: (t: Tier) => void;
}) {
  const c = useCatalog(agent, acp);
  const tierPick = useTierPick(agent, acp, onTier ? tier : null);
  if (agent === 'acp' && !c?.models.length) return null;
  const byTier = !!onTier && !!tier && !!tierProgram(agent, acp);
  const isAuto = !byTier && !!auto && value === AUTO_MODEL;
  const def = !byTier && !value && label ? c?.models.find((m) => m.isDefault) : undefined;
  // Custom's model: what it comes through, with the name in the title.
  const via = !isAuto && !def && !byTier ? findModel(c, value)?.via : undefined;
  return (
    <Picker
      icon={<Cpu size={label ? 14 : 13} className="shrink-0" />}
      label={label}
      value={byTier ? tierLabel(tier!) : isAuto ? 'Automatic' : c ? (def?.resolved ? modelLabel(c, def.resolved) : modelLabel(c, value)) : '…'}
      title={byTier ? `Model: ${tierLabel(tier!)}${tierPick ? ` · ${tierMeans(c, tierPick)}` : ''}` : isAuto ? `Model: ${auto}` : def ? `Model: ${agentName(agent)}'s default` : via ? `Model: ${modelLabel(c, value)} · ${via}` : 'Model'}
      disabled={disabled}
      width={260}
    >
      {(close) => (
        <ModelMenu
          agent={agent}
          c={c}
          value={value}
          localOnly={localOnly}
          auto={auto}
          acp={acp}
          tier={tier}
          onClose={close}
          onPick={(v) => {
            onChange(v);
            close();
          }}
          onTier={
            onTier &&
            ((t) => {
              onTier(t);
              close();
            })
          }
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
  tier,
}: {
  agent: Agent;
  model?: string | null;
  value?: string | null;
  onChange: (v: string | null) => void;
  disabled?: boolean;
  acp?: string;
  /** Named (the start page): "Effort  Medium". */
  label?: string;
  /** The tier the model comes from when no `model` is named: the efforts are those of the model it means now. */
  tier?: Tier | null;
}) {
  const c = useCatalog(agent, acp);
  const tierModel = useTierPick(agent, acp, model ? null : tier)?.model;
  // An ACP agent offers efforts only when it says so (Grok Build); until its catalog is here, nothing shows.
  if (agent === 'acp' && !c) return null;
  const m = findModel(c, model || tierModel);
  const levels = m?.efforts ?? [];
  if (c && !levels.length) return null;
  // An effort the model does not take (one kept from another model) shows as the model's default, which is what it runs with.
  const taken = value && (!levels.length || levels.includes(value)) ? value : null;
  const shown = taken ? cap(taken) : label ? (m?.defaultEffort ? cap(m.defaultEffort) : 'Default') : 'Effort';
  return (
    <Picker icon={<Gauge size={label ? 14 : 13} className="shrink-0" />} label={label} value={shown} title="Reasoning effort: how hard the model thinks" disabled={disabled} width={230}>
      {(close) => (
        <>
          <OptionRow
            label="Default"
            hint={m?.defaultEffort ? `Model default (${m.defaultEffort})` : 'Use the configured default'}
            selected={!taken}
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
  /** Named (the start page): "Permissions  Ask". */
  label?: string;
}) {
  const c = useCatalog(agent, acp);
  const cur = c?.modes.find((m) => m.value === value) ?? c?.modes.find((m) => m.value === c?.defaultMode);
  if (agent === 'acp' && !c?.modes.length) return null;
  return (
    <Picker
      icon={<ShieldCheck size={label ? 14 : 13} className="shrink-0" />}
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
