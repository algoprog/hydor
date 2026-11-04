// Settings → Computer use: on or off (off at first); on a Mac, macOS's two permissions with a button to ask for each;
// what keeps it from working on this computer (a Linux desktop on Wayland, a library missing); and Stop while an agent
// is at the computer. Only the desktop apps (Mac, Windows, Linux) can do it: elsewhere the section says so.
import { useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { ComputerState } from '@shared/computer';
import { post, put } from '../../lib/api';
import { toastError } from '../../lib/store';
import { Button, Section, Switch } from '../../components/ui';
import { listenComputer, loadComputer, stopComputer, useComputer } from './store';

function Row({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
      <div className="min-w-[200px] flex-1">
        <div className="text-[13.5px] text-fg">{label}</div>
        {hint && <div className="mt-0.5 text-[12px] leading-snug text-fg-3">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

/** How to stop an agent, as each desktop app has it. */
const STOP_HINT = {
  mac: 'To stop an agent at any time, press Esc (or ⌘⇧Esc), or choose Stop in the menu bar. While an agent works, a glow lines the edges of your screen; agents never see it.',
  windows: 'To stop an agent at any time, press Esc, or choose Stop from Hydor’s icon in the notification area. While an agent works, a glow lines the edges of your screen; agents never see it.',
  linux: 'To stop an agent at any time, press Esc, or choose Stop from Hydor’s icon in the system tray. While an agent works, a glow lines the edges of your screen; agents never see it.',
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
  if (!st) return null;
  if (!st.available || !st.system)
    return (
      <Section>
        <div className="py-1 text-[13px] leading-relaxed text-fg-2">
          Computer use needs the Hydor desktop app, for Mac, Windows or Linux: there, agents can see the screen and use the mouse and keyboard, in any app. This copy of Hydor does not run in it.
        </div>
      </Section>
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
    <div className="space-y-4">
      {st.problem && (
        <div className="flex gap-2.5 rounded-xl border border-warn/40 bg-warn/10 px-3.5 py-3 text-[12.5px] leading-relaxed text-fg-2">
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warn" />
          <div>{st.problem}</div>
        </div>
      )}
      <Section>
        <div className="-my-2 divide-y divide-line">
          <Row label="Let agents use this computer" hint="Agents see the screen and use the mouse and keyboard, in any app (for websites they keep to the browser). Each session asks you first.">
            <Switch on={st.enabled} label="Let agents use this computer" disabled={busy === 'enabled'} onChange={(on) => call('enabled', () => put<ComputerState>('/api/computer/settings', { enabled: on }))} />
          </Row>
          {system === 'mac' && (
            <>
              <Row label="Accessibility" hint="macOS’s permission for Hydor to use the mouse and keyboard.">
                {p?.accessibility ? granted : <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => allow('accessibility')}>Allow…</Button>}
              </Row>
              <Row label="Screen Recording" hint="macOS’s permission for Hydor to see the screen. If macOS asks to quit and reopen Hydor, do: running agents carry on.">
                {p?.screen === 'granted' ? granted : <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => allow('screen')}>Allow…</Button>}
              </Row>
            </>
          )}
          {active && (
            <Row label={AT_WORK[system]} hint={<span translate="no">{active.title}</span>}>
              <Button size="sm" variant="danger" onClick={() => void stopComputer()}>
                Stop
              </Button>
            </Row>
          )}
        </div>
      </Section>
      <div className="px-1 text-[12px] leading-relaxed text-fg-3">
        {system === 'mac' && p === null ? 'The Mac app did not say what macOS allows: quit and open Hydor again. ' : ''}
        {system === 'mac' ? 'Allow… shows macOS’s own question, then its System Settings at the right place: turn on Hydor there. ' : ''}
        {STOP_HINT[system]}
      </div>
    </div>
  );
}
