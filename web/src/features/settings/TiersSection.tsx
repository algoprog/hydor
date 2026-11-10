// Settings → Models → Tiers: the model (and effort) Quick, Standard, Best and Max mean for each program, and how
// sessions use them. A session on Automatic thinks with Best, or with Max for a hard problem, and its main agent
// hands clear parts to helpers on Standard and Quick; an agent of yours thinks with one tier.
import { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { TIER_PROGRAMS, TIERS, type TeamSettings, type Tier, type TierMap, type TierPick, type TierProgram } from '@shared/tiers';
import type { Agent } from '@shared/types';
import { api, put } from '../../lib/api';
import { toastError } from '../../lib/store';
import { EffortPicker, ModelPicker } from '../../components/AgentPickers';
import { Button, Section, Switch, Throbber } from '../../components/ui';
import { useTiers } from '../assistants/agentsState';

const AGENT_OF: Record<TierProgram, { agent: Agent; acp?: string }> = { claude: { agent: 'claude' }, codex: { agent: 'codex' }, console: { agent: 'acp', acp: 'console' } };

interface State {
  tiers: TierMap;
  defaults: TierMap;
  /** Missing on a server from before the team. */
  team?: TeamSettings;
}

function Setting({ label, hint, on, onChange }: { label: string; hint: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <div className="flex items-center gap-4 py-1.5">
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] text-fg">{label}</div>
        <div className="mt-0.5 text-[12px] leading-snug text-fg-3">{hint}</div>
      </div>
      <Switch on={on} onChange={onChange} label={label} />
    </div>
  );
}

export function TiersSection() {
  const [st, setSt] = useState<State | null>(null);
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
  return (
    <Section
      title="Tiers"
      sub="The model each tier means for each program. A session on Automatic thinks with Best, or with Max for a hard problem; its main agent hands clear parts to helpers on Standard and Quick. A tier you leave alone follows its program’s newest model."
      actions={
        st && !same ? (
          <Button size="sm" variant="ghost" icon={<RotateCcw size={13} />} onClick={() => save({ tiers: st.defaults })}>
            Back to the defaults
          </Button>
        ) : undefined
      }
    >
      {!st ? (
        <Throbber className="text-fg-3" />
      ) : (
        <>
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full min-w-[560px] border-separate border-spacing-x-1 border-spacing-y-1 text-[13px]">
              <thead>
                <tr className="text-left text-[12px] text-fg-3">
                  <th className="w-[30%] font-normal" />
                  {TIER_PROGRAMS.map((p) => (
                    <th key={p.id} className="px-1 font-medium">
                      {p.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TIERS.map((t) => (
                  <tr key={t.id} className="align-top">
                    <td className="pr-2">
                      <div className="font-medium">{t.label}</div>
                      <div className="text-[12px] leading-snug text-fg-3">{t.hint}</div>
                    </td>
                    {TIER_PROGRAMS.map((p) => {
                      const pick = st.tiers[p.id][t.id];
                      const { agent, acp } = AGENT_OF[p.id];
                      return (
                        <td key={p.id} className="rounded-lg border border-line px-1 py-0.5">
                          <div className="flex flex-col items-start">
                            <ModelPicker agent={agent} acp={acp} value={pick.model ?? null} onChange={(model) => set(p.id, t.id, { ...pick, model: model ?? undefined })} />
                            {p.id !== 'console' && (
                              <EffortPicker agent={agent} model={pick.model ?? null} value={pick.effort ?? null} onChange={(effort) => set(p.id, t.id, { ...pick, effort: effort ?? undefined })} />
                            )}
                            {p.id === 'console' && !pick.model && <span className="px-2 pb-1 text-[11.5px] text-fg-3">The model the session picked</span>}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {st.team && (
            <div className="mt-3 border-t border-line pt-2">
              <Setting
                label="Lead with helpers"
                hint="A session’s main agent plans, hands clear parts to helpers on cheaper tiers and checks their work, and a helper asked for with no tier gets Standard. Off: agents work alone unless they choose otherwise, and the start page has no Automatic."
                on={st.team.on}
                onChange={(on) => save({ team: { on } })}
              />
              <Setting
                label="Max for hard problems"
                hint="On Automatic, a request that reads as a hard problem starts on Max instead of Best, and a main agent may move itself to Max when a problem proves harder than it looked. The conversation says when either happens."
                on={st.team.hard}
                onChange={(hard) => save({ team: { hard } })}
              />
            </div>
          )}
        </>
      )}
    </Section>
  );
}
