// What shows when a page fails to draw, in place of an empty window: that it stopped working, why, and Reload. Around
// each page (the sidebar stays, and moving to another page tries again) and around the whole app. On another machine's
// page whose Hydor differs from this app's, the likely reason: an older one is offered an update from here
// (features/machines/MachineOld.tsx), a newer one asks for this app to be updated.
import { Component, useLayoutEffect, type ErrorInfo, type ReactNode } from 'react';
import { TriangleAlert } from 'lucide-react';
import { compareVersions } from '@shared/releases';
import { endBoot } from '../lib/boot';
import { machineId, machinePath } from '../lib/machine';
import { useMachines } from '../lib/machines';
import { useApp } from '../lib/store';
import { MachineOld } from '../features/machines/MachineOld';
import { Button } from './ui';

/** `again`: drawing the page again once it changes (the page moved). */
export class CrashGuard extends Component<{ children: ReactNode; again?: string }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }
  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('[hydor] a page stopped working', error, info.componentStack);
  }
  componentDidUpdate(prev: { again?: string }) {
    if (this.state.error && prev.again !== this.props.again) this.setState({ error: null });
  }
  render() {
    return this.state.error ? <Crashed error={this.state.error} /> : this.props.children;
  }
}

function Crashed({ error }: { error: Error }) {
  useLayoutEffect(endBoot, []);
  const version = useApp((s) => s.boot?.version);
  const self = useMachines((s) => s.self);
  const name = useMachines((s) => s.list.find((m) => m.id === machineId)?.name) ?? machineId ?? '';
  // Another machine's pages run in this app's version, whatever that machine runs.
  const differs = machineId && version && self?.version ? compareVersions(version, self.version) : 0;
  if (differs < 0) return <MachineOld version={version!} own={self!.version} error={error.message} />;
  return (
    <div className="flex h-full min-h-0 flex-1 items-center justify-center overflow-y-auto bg-bg p-4">
      <div className="w-full max-w-md rounded-2xl border border-line bg-panel p-6">
        <div className="flex items-center gap-2.5">
          <TriangleAlert size={18} className="text-warn" />
          <h1 className="text-[16.5px] font-semibold">This page stopped working</h1>
        </div>
        {differs > 0 && <p className="mt-2 text-[13.5px] leading-relaxed text-fg-2">{`${name} has Hydor ${version}, newer than this app (${self!.version}): update this app, then open it again.`}</p>}
        <p className="mt-2 break-words font-mono text-[12px] leading-relaxed text-fg-3" translate="no">
          {error.message}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => location.reload()}>
            Reload
          </Button>
          {machineId && (
            <Button variant="secondary" onClick={() => (location.href = machinePath(null))}>
              Open {self?.host ?? 'the main machine'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
