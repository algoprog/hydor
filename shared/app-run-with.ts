// Which program and model an app runs with. A ready-made app takes, in this order: what this run picked, the choice kept
// for that app, Settings → Apps → "Ready-made apps run with", and the app's own. Its model is its own tier in the table
// of whichever program that is (Settings → Models → Tiers). An app of the person's own runs with what it saves. The
// server settles it before a run starts (server/apps/runwith.ts); the pages show the same.
import { allSteps } from './app-manifest.ts';
import type { AppRecipe } from './apps.ts';
import { firstUsableProgram, type ProgramStatus } from './programs.ts';
import { isTier, tierProgram, type Tier } from './tiers.ts';
import type { Agent } from './types.ts';

/** Settings → Apps → "Ready-made apps run with". */
export type RunWith = 'auto' | 'claude' | 'codex' | 'custom';

export const RUN_WITH: { value: RunWith; label: string }[] = [
  { value: 'auto', label: 'Automatic' },
  { value: 'claude', label: 'Claude Code' },
  { value: 'codex', label: 'Codex' },
  { value: 'custom', label: 'Custom' },
];

export const isRunWith = (v: unknown): v is RunWith => RUN_WITH.some((x) => x.value === v);

/** The program, model, effort and mode of a run: no model and no tier is the program's own default model. */
export interface AppPick {
  agent: Agent;
  acpAgent?: string;
  model?: string;
  tier?: Tier;
  effort?: string;
  mode?: string;
}

/**
 * A pick as a page or a program sends it. `model: null` with no tier asks for the program's own default model; neither a
 * model nor a tier said leaves the app's own tier.
 */
export interface SentPick {
  agent?: unknown;
  acpAgent?: unknown;
  model?: unknown;
  tier?: unknown;
  effort?: unknown;
  mode?: unknown;
}

/** The parts of an app's own recipe a pick starts from. */
export type OwnPick = Pick<AppRecipe, 'agent' | 'acpAgent' | 'model' | 'tier' | 'effort' | 'mode'>;

/** Where the program of a run came from: this run, the app's kept choice, the setting, or the first usable (Automatic). */
export type PickFrom = 'run' | 'kept' | 'setting' | 'auto';

/** What a ready-made app's page knows of how it runs. */
export interface RunsWithView {
  /** What a run takes now when it picks nothing itself. */
  pick: AppPick;
  from: Exclude<PickFrom, 'run'>;
}

const text = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 200) : undefined);
const agentOf = (v: unknown): Agent | undefined => (v === 'claude' || v === 'codex' || v === 'acp' ? v : undefined);

/** A pick with only what it has, an ACP agent named. */
function tidy(p: AppPick): AppPick {
  const acpAgent = p.agent === 'acp' ? p.acpAgent || 'console' : undefined;
  return {
    agent: p.agent,
    ...(acpAgent ? { acpAgent } : {}),
    ...(p.model ? { model: p.model } : p.tier ? { tier: p.tier } : {}),
    ...(p.effort ? { effort: p.effort } : {}),
    ...(p.mode ? { mode: p.mode } : {}),
  };
}

const sameProgram = (a: { agent: Agent; acpAgent?: string }, b: { agent: Agent; acpAgent?: string }) => a.agent === b.agent && (a.agent !== 'acp' || (a.acpAgent || 'console') === (b.acpAgent || 'console'));

/** The app's own model for a program: its model by name only on the program it was named for, else its tier. */
function ownModel(own: OwnPick, program: { agent: Agent; acpAgent?: string }): Pick<AppPick, 'model' | 'tier' | 'effort'> {
  const same = sameProgram(own, program);
  return {
    ...(same && own.model ? { model: own.model } : tierProgram(program.agent, program.acpAgent) && own.tier ? { tier: own.tier } : {}),
    ...(same && own.effort ? { effort: own.effort } : {}),
  };
}

/** What a ready-made app runs with when neither the run nor the app has a choice: the setting's program, the app's tier. */
export function defaultPick(own: OwnPick, setting: RunWith, status: ProgramStatus | null | undefined): AppPick {
  const program: { agent: Agent; acpAgent?: string } =
    setting === 'claude' || setting === 'codex' ? { agent: setting } : setting === 'custom' ? { agent: 'acp', acpAgent: 'console' } : { agent: firstUsableProgram(status).agent, acpAgent: firstUsableProgram(status).acp ?? undefined };
  return tidy({ ...program, ...ownModel(own, program), mode: own.mode });
}

/**
 * A sent pick over what a run would take otherwise (`base`). One that names a program is whole: its model by name, else
 * its tier, else (model: null) the program's default, else the app's own tier. One that names none changes only what it
 * says of the base.
 */
export function pickOver(own: OwnPick, base: AppPick, sent: SentPick): AppPick {
  const model = text(sent.model);
  const tier = isTier(sent.tier) ? sent.tier : undefined;
  const effort = text(sent.effort);
  const mode = text(sent.mode);
  const agent = agentOf(sent.agent);
  if (!agent) {
    const thinks = model ? { model, tier: undefined, effort: undefined } : tier ? { tier, model: undefined, effort: undefined } : {};
    return tidy({ ...base, ...thinks, ...(effort ? { effort } : {}), ...(mode ? { mode } : {}) });
  }
  const program = { agent, ...(agent === 'acp' ? { acpAgent: text(sent.acpAgent) ?? 'console' } : {}) };
  const thinks = model ? { model } : tier ? { tier } : sent.model === null ? {} : ownModel(own, program);
  return tidy({ ...program, ...thinks, ...(effort ? { effort } : {}), mode: mode ?? own.mode });
}

/** Whether a sent body picks anything at all. */
export const picksSomething = (s: SentPick | null | undefined): boolean => !!s && !!(agentOf(s.agent) || text(s.model) || isTier(s.tier) || text(s.effort) || text(s.mode));

/** What a ready-made app runs with: this run's pick, else the choice kept for it, else the setting, over its own. */
export function resolvePick(own: OwnPick, o: { sent?: SentPick | null; kept?: AppPick | null; setting: RunWith; status: ProgramStatus | null | undefined }): { pick: AppPick; from: PickFrom } {
  const base: { pick: AppPick; from: PickFrom } = o.kept ? { pick: tidy(o.kept), from: 'kept' } : { pick: defaultPick(own, o.setting, o.status), from: o.setting === 'auto' ? 'auto' : 'setting' };
  return picksSomething(o.sent) ? { pick: pickOver(own, base.pick, o.sent!), from: 'run' } : base;
}

/** A kept choice as stored, or null when it is not one. */
export function cleanPick(v: unknown): AppPick | null {
  const o = v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  const agent = o && agentOf(o.agent);
  if (!o || !agent) return null;
  return tidy({ agent, acpAgent: text(o.acpAgent), model: text(o.model), tier: isTier(o.tier) ? o.tier : undefined, effort: text(o.effort), mode: text(o.mode) });
}

/** Two picks that run the same way (no mode named is Auto, for the programs that have it). */
export function samePick(a: AppPick, b: AppPick): boolean {
  const mode = (p: AppPick) => p.mode ?? (tierProgram(p.agent, p.agent === 'acp' ? p.acpAgent || 'console' : undefined) ? 'auto' : '');
  return sameProgram(a, b) && (a.model ?? '') === (b.model ?? '') && (a.model ? '' : (a.tier ?? '')) === (b.model ? '' : (b.tier ?? '')) && (a.effort ?? '') === (b.effort ?? '') && mode(a) === mode(b);
}

/** A recipe as a run with the pick takes it. */
export function withPick<R extends AppRecipe>(recipe: R, p: AppPick): R {
  return { ...recipe, agent: p.agent, acpAgent: p.acpAgent, model: p.model, tier: p.tier, effort: p.effort, mode: p.mode };
}

/**
 * The programs a run of a recipe works with: its one agent's, or its flow's agent steps' (a step may name its own: `step`)
 * and its code's that calls ctx.agent. Model and tool steps need none, so a flow of those alone has none.
 */
export function programsOf(r: Pick<AppRecipe, 'agent' | 'acpAgent' | 'flow' | 'flows'>, flow?: string): { agent: Agent; acpAgent?: string; step?: boolean }[] {
  const own = { agent: r.agent, acpAgent: r.acpAgent };
  const f = flow ? r.flows?.[flow] : r.flow;
  if (!f?.steps.length) return [own];
  return allSteps(f.steps).flatMap((s) => {
    if (s.do === 'agent') return [s.agent ? { agent: s.agent, acpAgent: s.acpAgent, step: true } : own];
    return s.do === 'code' && /\bctx\.agent\s*\(/.test(s.code) ? [own] : [];
  });
}
