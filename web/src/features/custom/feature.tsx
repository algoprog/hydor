// Custom, the app's own agent: Settings → Custom, for Auto mode, the sandbox for its commands, and how
// long a goal may run. Its models are in Settings → Models.
import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { api, put } from '../../lib/api';
import { toastError } from '../../lib/store';
import { Section, Segmented, Switch, Throbber } from '../../components/ui';
import type { WebFeature } from '../registry';

interface CustomSettingsView {
  sandbox: boolean;
  goalRounds: number;
  /** bubblewrap works on this machine. */
  bwrap: boolean;
}

function CustomSettings() {
  const [st, setSt] = useState<CustomSettingsView | null>(null);
  useEffect(() => {
    api<CustomSettingsView>('/api/custom/settings').then(setSt, toastError);
  }, []);
  const save = (p: Partial<CustomSettingsView>) => put<CustomSettingsView>('/api/custom/settings', p).then(setSt, toastError);
  if (!st)
    return (
      <div className="flex justify-center py-10 text-fg-3">
        <Throbber size={28} />
      </div>
    );
  const rounds = ['10', '30', '100'].includes(String(st.goalRounds)) ? ['10', '30', '100'] : ['10', '30', '100', String(st.goalRounds)];
  return (
    <div className="space-y-4">
      <Section title="Auto mode" sub="One of Custom’s modes, beside Ask, Accept edits, Full access and Plan.">
        <p className="text-[12.5px] leading-relaxed text-fg-3">
          Routine steps go ahead without asking: reading and editing in the session’s folder, and running the project’s tests, builds and linters. A quick check decides about the rest. Steps
          that delete or overwrite files outside the folder, use sudo, run a script straight from the internet, force-push, change permissions of a whole folder, send or post through a
          connected account, or spend money always ask you first. The check sees only your own messages, the folder and the step, never what the agent read, so a web page or a file cannot talk
          it into anything. The helper model in Settings → Models does it.
        </p>
      </Section>
      <Section
        title="Sandbox for commands"
        sub="In Auto and Full access modes, commands can change files only in the session’s folder and /tmp. They can still use the network."
        actions={<Switch on={st.sandbox} onChange={(on) => void save({ sandbox: on })} label="Sandbox for commands" disabled={!st.bwrap} />}
      >
        <p className="text-[12.5px] leading-relaxed text-fg-3">
          {st.bwrap
            ? 'It uses bubblewrap. Turn it off if a tool must write elsewhere, for example to install something for the whole system.'
            : 'bubblewrap (bwrap) is not installed here, or cannot run (as in some containers), so commands run without a sandbox. Install it to use one.'}
        </p>
      </Section>
      <Section
        title="Goals"
        sub="With /goal, Custom keeps working, turn after turn, until the goal holds. After this many rounds it pauses for you."
        actions={<Segmented size="sm" value={String(st.goalRounds)} options={rounds.map((v) => ({ value: v, label: v }))} onChange={(v) => void save({ goalRounds: Number(v) })} />}
      >
        <p className="text-[12.5px] leading-relaxed text-fg-3">After each turn the helper model checks the goal against what the turn did, and gives the next step. It also pauses after three rounds without progress.</p>
      </Section>
    </div>
  );
}

export const customFeature: WebFeature = {
  id: 'custom',
  settings: [{ id: 'custom', label: 'Custom', icon: ShieldCheck, sub: 'Auto mode, a sandbox for commands, and how long goals run', Body: CustomSettings }],
};
