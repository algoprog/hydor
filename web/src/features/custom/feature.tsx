// Custom, the app's own agent: Settings → Custom, for Auto mode and the sandbox for its commands. Its models are in
// Settings → Models.
import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { api, put } from '../../lib/api';
import { toastError } from '../../lib/store';
import { Switch, Throbber } from '../../components/ui';
import { Group, Row, Stack } from '../settings/kit';
import type { WebFeature } from '../registry';

interface CustomSettingsView {
  sandbox: boolean;
  /** A sandbox for commands works on this machine (named when it was bubblewrap alone). */
  bwrap: boolean;
  /** Which one (a server before 0.66 sends neither this nor platform: it is bubblewrap there). */
  sandboxKind?: 'bwrap' | 'seatbelt' | 'lowbox' | null;
  platform?: string;
}

/** The words beside the sandbox switch, for the sandbox this machine has, or the reason it has none. */
function sandboxWords(st: CustomSettingsView | null): { hint: string; info: string } {
  const off = 'Turn it off if a tool must write elsewhere, for example to install something for the whole system. Full access runs without this sandbox or approval prompts.';
  if (st && !st.bwrap) {
    if (st.platform === 'darwin') return { hint: 'macOS’s sandbox cannot run here, so commands run without one', info: 'It uses Seatbelt, the sandbox that comes with macOS (sandbox-exec). It could not start on this Mac.' };
    if (st.platform === 'win32')
      return {
        hint: 'The sandbox cannot run here, so commands run without one',
        info: 'It needs Git for Windows and the .NET Framework that comes with Windows, to build its small helper the first time. One of them is missing here, or the helper could not start.',
      };
    return { hint: 'bubblewrap is not installed here, or cannot run, so commands run without one', info: 'Install bubblewrap (bwrap) to use a sandbox. Some containers cannot run it.' };
  }
  if (st?.sandboxKind === 'seatbelt') return { hint: 'In Auto mode, commands change files only in the session’s folder and the temporary folders', info: `It uses Seatbelt, the sandbox that comes with macOS. ${off}` };
  if (st?.sandboxKind === 'lowbox')
    return {
      hint: 'In Auto mode, commands change files only in the session’s folder and a temporary folder of their own',
      info: `Commands run at low integrity, a protection Windows has: the session’s folder is marked once so they may change files in it, and they can only read the rest. Your home folder, a whole drive and system folders are never marked: there, commands run without the sandbox. ${off}`,
    };
  return { hint: 'In Auto mode, commands change files only in the session’s folder and /tmp', info: `It uses bubblewrap. ${off}` };
}

function CustomSettings() {
  const [st, setSt] = useState<CustomSettingsView | null>(null);
  useEffect(() => {
    api<CustomSettingsView>('/api/custom/settings').then(setSt, toastError);
  }, []);
  const save = (p: Partial<CustomSettingsView>) => put<CustomSettingsView>('/api/custom/settings', p).then(setSt, toastError);
  // The rows show at once; each control comes as the settings arrive.
  const wait = <Throbber className="text-fg-3" />;
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
          hint={sandboxWords(st).hint}
          info={sandboxWords(st).info}
          control={st ? <Switch on={st.sandbox} onChange={(on) => void save({ sandbox: on })} label="Sandbox for commands" disabled={!st.bwrap} /> : wait}
        />
      </Group>
    </Stack>
  );
}

export const customFeature: WebFeature = {
  id: 'custom',
  settings: [{ id: 'custom', label: 'Custom', icon: ShieldCheck, sub: 'Auto mode and a sandbox for commands', Body: CustomSettings }],
};
