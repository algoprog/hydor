// Custom, the app's own agent: Settings → Custom, for Auto mode, the sandbox for its commands, and how
// long a goal may run. Its models are in Settings → Models.
import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { api, put } from '../../lib/api';
import { toastError } from '../../lib/store';
import { Segmented, Switch, Throbber } from '../../components/ui';
import { Group, Row, Stack } from '../settings/kit';
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
  // The rows show at once; each control comes as the settings arrive.
  const wait = <Throbber className="text-fg-3" />;
  const rounds = !st || ['10', '30', '100'].includes(String(st.goalRounds)) ? ['10', '30', '100'] : ['10', '30', '100', String(st.goalRounds)];
  return (
    <Stack>
      <Group>
        <Row
          label="Auto mode"
          hint="Routine steps go ahead without asking; a quick check decides about the rest"
          info={
            <>
              <p>One of Custom’s modes, beside Ask, Accept edits, Full access and Plan. Reading and editing in the session’s folder, and running the project’s tests, builds and linters, go ahead.</p>
              <p>
                Steps that delete or overwrite files outside the folder, use sudo, run a script straight from the internet, force-push, change permissions of a whole folder, send or post
                through a connected account, or spend money always ask you first.
              </p>
              <p>The check (the helper model in Settings → Models) sees only your own messages, the folder and the step, never what the agent read, so a web page or a file cannot talk it into anything.</p>
            </>
          }
        />
        <Row
          label="Sandbox for commands"
          hint={st && !st.bwrap ? 'bubblewrap is not installed here, or cannot run, so commands run without one' : 'In Auto mode, commands change files only in the session’s folder and /tmp'}
          info={
            st && !st.bwrap
              ? 'Install bubblewrap (bwrap) to use a sandbox. Some containers cannot run it.'
              : 'It uses bubblewrap. Turn it off if a tool must write elsewhere, for example to install something for the whole system. Full access runs without this sandbox or approval prompts.'
          }
          control={st ? <Switch on={st.sandbox} onChange={(on) => void save({ sandbox: on })} label="Sandbox for commands" disabled={!st.bwrap} /> : wait}
        />
      </Group>
      <Group title="Goals">
        <Row
          label="Rounds before a goal pauses"
          hint="With /goal, Custom works turn after turn until the goal holds"
          info="After each turn the helper model checks the goal against what the turn did, and gives the next step. It also pauses after three rounds without progress."
          control={st ? <Segmented size="sm" value={String(st.goalRounds)} options={rounds.map((v) => ({ value: v, label: v }))} onChange={(v) => void save({ goalRounds: Number(v) })} /> : wait}
        />
      </Group>
    </Stack>
  );
}

export const customFeature: WebFeature = {
  id: 'custom',
  settings: [{ id: 'custom', label: 'Custom', icon: ShieldCheck, sub: 'Auto mode, a sandbox for commands, and how long goals run', Body: CustomSettings }],
};
