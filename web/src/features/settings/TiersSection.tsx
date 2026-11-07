// Settings → Models → Tiers: the model (and effort) Quick, Standard and Best mean for each agent program. An agent
// that thinks with a tier starts on its model, and a lead gives each helper it starts a tier for its part.
import { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { TIER_PROGRAMS, TIERS, type Tier, type TierMap, type TierPick, type TierProgram } from '@shared/tiers';
import type { Agent } from '@shared/types';
import { api, put } from '../../lib/api';
import { toastError } from '../../lib/store';
import { EffortPicker, ModelPicker } from '../../components/AgentPickers';
import { Button, Section, Throbber } from '../../components/ui';
import { useTiers } from '../assistants/agentsState';

const AGENT_OF: Record<TierProgram, { agent: Agent; acp?: string }> = { claude: { agent: 'claude' }, codex: { agent: 'codex' }, console: { agent: 'acp', acp: 'console' } };

export function TiersSection() {
  const [st, setSt] = useState<{ tiers: TierMap; defaults: TierMap } | null>(null);
  useEffect(() => {
    api<{ tiers: TierMap; defaults: TierMap }>('/api/models/tiers').then(setSt, toastError);
  }, []);
  const save = (tiers: TierMap) =>
    put<{ tiers: TierMap; defaults: TierMap }>('/api/models/tiers', { tiers }).then((r) => {
      setSt(r);
      useTiers.setState({ tiers: r.tiers });
    }, toastError);
  const set = (p: TierProgram, t: Tier, pick: TierPick) => st && save({ ...st.tiers, [p]: { ...st.tiers[p], [t]: pick } });
  const same = st && JSON.stringify(st.tiers) === JSON.stringify(st.defaults);
  return (
    <Section
      title="Tiers"
      sub="The model each tier means for each program. Agents think with a tier, and give the helpers they start one for their part: Quick for clear jobs whose result can be checked, Standard for most work, Best for hard problems."
      actions={
        st && !same ? (
          <Button size="sm" variant="ghost" icon={<RotateCcw size={13} />} onClick={() => save(st.defaults)}>
            Back to the defaults
          </Button>
        ) : undefined
      }
    >
      {!st ? (
        <Throbber className="text-fg-3" />
      ) : (
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
      )}
    </Section>
  );
}
