// Settings → Models → Tiers: the model (and effort) Quick, Standard, Best and Max mean for each program, and how
// sessions use them. A session on Automatic thinks with Best, or with Max for a hard problem, and its main agent
// hands clear parts to subagents on Standard and Quick; an agent of yours thinks with one tier.
import { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { TIER_PROGRAMS, TIERS, type TeamSettings, type Tier, type TierMap, type TierPick, type TierProgram } from '@shared/tiers';
import type { Agent } from '@shared/types';
import { api, put } from '../../lib/api';
import { toastError } from '../../lib/store';
import { EffortPicker, ModelPicker } from '../../components/AgentPickers';
import { MenuItem, Segmented, Switch, Throbber } from '../../components/ui';
import { Group, MoreMenu, Row } from './kit';
import { useTiers } from '../assistants/agentsState';

const AGENT_OF: Record<TierProgram, { agent: Agent; acp?: string }> = { claude: { agent: 'claude' }, codex: { agent: 'codex' }, console: { agent: 'acp', acp: 'console' } };

interface State {
  tiers: TierMap;
  defaults: TierMap;
  /** Missing on a server from before the team. */
  team?: TeamSettings;
}

/** What each tier is for, in a few words (the longer story is `TIERS`' own hint, behind the (i)). */
const SHORT: Record<Tier, string> = {
  quick: 'Small, clear jobs whose result can be checked',
  standard: 'Clear tasks of medium size',
  best: 'The main agent: plans, leads subagents, checks',
  max: 'The hardest problems',
};

export function TiersSection() {
  const [st, setSt] = useState<State | null>(null);
  const [program, setProgram] = useState<TierProgram>('claude');
  useEffect(() => {
    api<State>('/api/models/tiers').then(setSt, toastError);
  }, []);
  const save = (body: { tiers?: TierMap; team?: Partial<TeamSettings> }) =>
    put<State>('/api/models/tiers', body).then((r) => {
      setSt(r);
      useTiers.setState({ tiers: r.tiers, team: r.team ?? null });
    }, toastError);
  const set = (p: TierProgram, t: Tier, pick: TierPick) => st && save({ tiers: { ...st.tiers, [p]: { ...st.tiers[p], [t]: pick } } });
  const same = st && JSON.stringify(st.tiers) === JSON.stringify(st.defaults);
  const { agent, acp } = AGENT_OF[program];
  return (
    <>
      <Group
        title="Tiers"
        info="The model each tier means for each program. A session on Automatic thinks with Best, or with Max for a hard problem; its main agent hands clear parts to subagents on Standard and Quick. A tier you leave alone follows its program’s newest model."
        actions={
          <>
            <Segmented size="sm" value={program} onChange={setProgram} options={TIER_PROGRAMS.map((p) => ({ value: p.id, label: p.label }))} />
            <MoreMenu width={220}>
              {(close) => (
                <MenuItem
                  icon={<RotateCcw size={14} />}
                  disabled={!st || !!same}
                  onClick={() => {
                    close();
                    if (st) void save({ tiers: st.defaults });
                  }}
                >
                  Back to the defaults
                </MenuItem>
              )}
            </MoreMenu>
          </>
        }
      >
        {TIERS.map((t) => {
          const pick = st?.tiers[program][t.id];
          return (
            <Row
              key={t.id}
              // By its name among the agents' words ("Max" is also a column's largest value elsewhere).
              label={<span data-i18n="agents">{t.label}</span>}
              hint={
                <>
                  <div>{SHORT[t.id]}</div>
                  {pick && program === 'console' && !pick.model && <div className="mt-0.5">The model the session picked</div>}
                </>
              }
              info={t.hint}
              control={
                !st || !pick ? (
                  <Throbber className="text-fg-3" />
                ) : (
                  <>
                    <ModelPicker agent={agent} acp={acp} value={pick.model ?? null} onChange={(model) => set(program, t.id, { ...pick, model: model ?? undefined })} />
                    {program !== 'console' && (
                      <EffortPicker agent={agent} model={pick.model ?? null} value={pick.effort ?? null} onChange={(effort) => set(program, t.id, { ...pick, effort: effort ?? undefined })} />
                    )}
                  </>
                )
              }
            />
          );
        })}
      </Group>
      {st?.team && (
        <Group title="Tiers in sessions">
          <Row
            label="Lead with subagents"
            hint="The main agent plans, hands clear parts to subagents on cheaper tiers, checks them"
            info="A session’s main agent plans, hands clear parts to subagents on cheaper tiers and checks their work, and a subagent asked for with no tier gets Standard. Off: agents work alone unless they choose otherwise, and the start page has no Automatic."
            control={<Switch on={st.team.on} onChange={(on) => save({ team: { on } })} label="Lead with subagents" />}
          />
          <Row
            label="Max for hard problems"
            hint="Automatic starts a hard problem on Max instead of Best"
            info="On Automatic, a request that reads as a hard problem starts on Max instead of Best, and a main agent may move itself to Max when a problem proves harder than it looked. The conversation says when either happens."
            control={<Switch on={st.team.hard} onChange={(hard) => save({ team: { hard } })} label="Max for hard problems" />}
          />
        </Group>
      )}
    </>
  );
}
