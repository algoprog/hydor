// Settings → Computer use: on or off (off at first); on a Mac, macOS's two permissions with a button to ask for each;
// what keeps it from working on this computer (a Linux desktop on Wayland, a library missing); and Stop while an agent
// is at the computer. Only the desktop apps (Mac, Windows, Linux) can do it: elsewhere the section says so.
import { useEffect, useState } from 'react';
import { CheckCircle2, Hand, Keyboard, MonitorUp, MousePointer2, Square } from 'lucide-react';
import type { ComputerState } from '@shared/computer';
import { post, put } from '../../lib/api';
import { toastError } from '../../lib/store';
import { Button, Switch, Throbber } from '../../components/ui';
import { Group, Notice, Row, SectionActions, Stack } from '../settings/kit';
import { listenComputer, loadComputer, stopComputer, useComputer } from './store';

/** How to stop an agent, as each desktop app has it. */
const STOP = {
  mac: { hint: 'Press Esc (or ⌘⇧Esc), or choose Stop in the menu bar', where: 'choose Stop in the menu bar' },
  windows: { hint: 'Press Esc, or choose Stop from Hydor’s notification-area icon', where: 'choose Stop from Hydor’s icon in the notification area' },
  linux: { hint: 'Press Esc, or choose Stop from Hydor’s system tray icon', where: 'choose Stop from Hydor’s icon in the system tray' },
} as const;

const AT_WORK = { mac: 'An agent is using your Mac', windows: 'An agent is using your PC', linux: 'An agent is using your computer' } as const;

export function ComputerSettings() {
  const st = useComputer((s) => s.state);
  const active = useComputer((s) => s.active);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    listenComputer();
    void loadComputer();
    // Back from the system's settings: read the permissions again.
    const again = () => void loadComputer();
    window.addEventListener('focus', again);
    return () => window.removeEventListener('focus', again);
  }, []);
  if (!st)
    return (
      <Stack>
        <Group>
          <Row label="Looking at this computer" control={<Throbber className="text-fg-3" />} />
        </Group>
      </Stack>
    );
  if (!st.available || !st.system)
    return (
      <Stack>
        <Notice
          icon={<MonitorUp size={15} />}
          action={
            <Button size="sm" variant="secondary" onClick={() => window.open('https://github.com/algoprog/hydor/releases/latest', '_blank', 'noreferrer')}>
              Get the app
            </Button>
          }
        >
          Computer use needs the Hydor desktop app, for Mac, Windows or Linux. This copy of Hydor does not run in it.
        </Notice>
      </Stack>
    );
  const system = st.system;
  const call = async (what: string, fn: () => Promise<ComputerState>) => {
    setBusy(what);
    try {
      useComputer.setState({ state: await fn() });
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
    }
  };
  const p = st.permissions;
  const allow = (which: 'accessibility' | 'screen') => call(which, () => post<ComputerState>(`/api/computer/permissions/${which}`));
  const granted = (
    <span className="flex items-center gap-1.5 text-[13px] text-ok">
      <CheckCircle2 size={14} /> Allowed
    </span>
  );
  return (
    <Stack>
      <SectionActions>
        <Switch on={st.enabled} label="Let agents use this computer" disabled={busy === 'enabled'} onChange={(on) => call('enabled', () => put<ComputerState>('/api/computer/settings', { enabled: on }))} />
      </SectionActions>
      {st.problem && <Notice tone="warn">{st.problem}</Notice>}
      {!st.enabled && !st.problem && (
        <Notice>Agents cannot use this computer while this is off</Notice>
      )}
      {system === 'mac' && p === null && <Notice tone="warn">The Mac app did not say what macOS allows: quit and open Hydor again.</Notice>}
      {active && (
        <Group>
          <Row
            icon={<MonitorUp size={16} />}
            label={AT_WORK[system]}
            hint={<span translate="no">{active.title}</span>}
            control={
              <Button size="sm" variant="danger" icon={<Square size={12} />} onClick={() => void stopComputer()}>
                Stop
              </Button>
            }
          />
        </Group>
      )}
      {system === 'mac' && (
        <Group title="macOS permissions" info="Allow… shows macOS’s own question, then its System Settings at the right place: turn on Hydor there. If macOS asks to quit and reopen Hydor, do: running agents carry on.">
          <Row
            icon={<Keyboard size={16} />}
            label="Accessibility"
            hint="Lets Hydor use the mouse and keyboard"
            control={p?.accessibility ? granted : <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => allow('accessibility')}>Allow…</Button>}
          />
          <Row
            icon={<MonitorUp size={16} />}
            label="Screen Recording"
            hint="Lets Hydor see the screen"
            control={p?.screen === 'granted' ? granted : <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => allow('screen')}>Allow…</Button>}
          />
        </Group>
      )}
      <Group title="While it is on">
        <Row
          icon={<MousePointer2 size={16} />}
          label="Each session asks you first"
          hint="Agents see the screen and use the mouse and keyboard"
          info="In any app. For websites they keep to the browser."
        />
        <Row
          icon={<Hand size={16} />}
          label="Stop at any time"
          hint={STOP[system].hint}
          info={`While an agent works, a glow lines the edges of your screen; agents never see it. To stop it, press Esc${system === 'mac' ? ' (or ⌘⇧Esc)' : ''}, or ${STOP[system].where}.`}
        />
      </Group>
    </Stack>
  );
}
