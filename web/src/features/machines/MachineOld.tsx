// Another machine whose Hydor is older than this app. Its pages open here in this app's version (this server forwards
// their calls there), and they can need what that machine does not have yet: before 0.61 an older machine's start page
// came up empty. So opening it offers to update it first, from here, as its own Settings → General would (the calls go
// to that machine), and opens its pages once it is back with a version as new as this app's. Open anyway shows them as
// they are, for that version, in this tab. A page that stops working there (components/CrashGuard.tsx) offers the same.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CircleArrowUp, TriangleAlert } from 'lucide-react';
import { compareVersions } from '@shared/releases';
import type { UpdateState } from '@shared/types';
import { api, post } from '../../lib/api';
import { live } from '../../lib/ws';
import { endBoot } from '../../lib/boot';
import { machineId, machinePath } from '../../lib/machine';
import { useMachines } from '../../lib/machines';
import { useApp } from '../../lib/store';
import { cannotUpdate, UPDATE_PHASE } from '../../lib/updates';
import { Button, Throbber } from '../../components/ui';

const KEY = () => `wa.oldMachine.${machineId}`;

/** Whether Open anyway was picked in this tab for this machine at that version. */
export function openedAnyway(version: string): boolean {
  try {
    return !!machineId && sessionStorage.getItem(KEY()) === version;
  } catch {
    return false;
  }
}

/**
 * `version`: that machine's; `own`: this app's. `error`: what stopped a page of it from drawing, when that is how it
 * came up (then Reload stands in for Open anyway).
 */
export function MachineOld({ version, own, error, onOpen }: { version: string; own: string; error?: string; onOpen?: () => void }) {
  useLayoutEffect(endBoot, []);
  const self = useMachines((s) => s.self);
  const name = useMachines((s) => s.list.find((m) => m.id === machineId)?.name) ?? machineId ?? '';
  const update = useApp((s) => s.boot?.update);
  // One already under way (this page reloaded while it ran) shows how far it is.
  const [updating, setUpdating] = useState(() => !!useApp.getState().boot?.update?.running);
  const [problem, setProblem] = useState('');
  // The last update's time before this one, by that machine's clock: a different one is this update's outcome.
  const before = useRef<number | undefined>(undefined);

  // Once it is back with a version as new as this app's, or has restarted at all (its socket went, and it said hello
  // again: this server takes the socket back at once, before that machine answers): this page again, which opens its
  // pages or says what is still missing.
  useEffect(() => {
    if (!updating) return;
    const t = setInterval(() => {
      api<{ version?: string }>('/api/health')
        .then((h) => {
          if (h.version && compareVersions(h.version, own) >= 0) location.reload();
        })
        .catch(() => {});
    }, 3000);
    let gone = false;
    const offStatus = live.onStatus((up) => {
      if (!up) gone = true;
    });
    const offHello = live.on((e) => {
      if (e.t === 'hello' && gone) location.reload();
    });
    return () => {
      clearInterval(t);
      offStatus();
      offHello();
    };
  }, [updating, own]);

  // An update that ended without restarting into a new enough version, as that machine tells it (its update events).
  useEffect(() => {
    if (!updating || !update || update.running) return;
    const last = update.last;
    if (!last || last.at === before.current) return;
    setUpdating(false);
    if (!last.ok) setProblem(`The update did not work: ${last.error ?? 'it gave no reason'}`);
    else if (last.needsRestart) setProblem(`It has the new version: restart Hydor on ${name} to use it.`);
    else setProblem(`It is already as new as where it updates from (${version}): update Hydor there itself, or open it anyway.`);
  }, [updating, update, name, version]);

  const start = async () => {
    setProblem('');
    before.current = update?.last?.at;
    setUpdating(true);
    const keep = (u: UpdateState | null | undefined) => {
      const boot = useApp.getState().boot;
      if (boot && u) useApp.getState().set({ boot: { ...boot, update: u } });
    };
    try {
      // What is out now, so that it gets the newest (a desktop app downloads the newest release). No answer at all: it
      // was not installed from git with an upstream, and has nowhere to update from.
      const checked = await post<{ update: UpdateState | null }>('/api/update-check').catch(() => undefined);
      if (checked && !checked.update) {
        setUpdating(false);
        return setProblem(`${name} has nowhere to update from by itself (it was not installed from git with an upstream): update Hydor there, or open it anyway.`);
      }
      // The check may know of an earlier update the page did not: that one is not this one's outcome.
      if (checked?.update?.last) before.current = checked.update.last.at;
      keep(checked?.update);
      keep((await post<{ update: UpdateState | null }>('/api/update')).update);
    } catch (e) {
      setUpdating(false);
      setProblem(`${(e as Error).message}. Update Hydor on ${name} itself, or open it anyway.`);
    }
  };
  const openAnyway = () => {
    try {
      if (machineId) sessionStorage.setItem(KEY(), version);
    } catch {}
    onOpen?.();
  };

  // A desktop app that cannot replace itself where it is says why, and is updated there.
  const stuck = update && update.kind === 'app' && !update.canRestart ? cannotUpdate(update) : '';
  const running = update?.running;
  return (
    <div className="flex h-full min-h-0 flex-1 items-center justify-center overflow-y-auto bg-bg p-4">
      <div className="w-full max-w-md rounded-2xl border border-line bg-panel p-6">
        <div className="flex items-center gap-2.5">
          {error ? <TriangleAlert size={18} className="text-warn" /> : <CircleArrowUp size={18} className="text-accent" />}
          <h1 className="text-[16.5px] font-semibold">{error ? 'This page stopped working' : `${name} has an older Hydor`}</h1>
        </div>
        <p className="mt-2 text-[13.5px] leading-relaxed text-fg-2">
          {`${name} has version ${version}, and this app ${own}. Its pages open here in this app's version, and some can stop working with an older one. Update it from here: it takes a few minutes, and agents working there carry on.`}
        </p>
        {error && (
          <p className="mt-2 break-words font-mono text-[12px] leading-relaxed text-fg-3" translate="no">
            {error}
          </p>
        )}
        {stuck && <p className="mt-2 text-[13px] leading-relaxed text-warn">{stuck}</p>}
        {problem && <p className="mt-2 text-[13px] leading-relaxed text-warn">{problem}</p>}
        {updating && (
          <p className="mt-3 flex items-center gap-2 text-[13px] text-fg-2">
            <Throbber className="shrink-0 text-fg-3" />
            {running ? (update?.kind === 'app' && running.phase === 'restart' ? 'Opening the new version, this page reconnects by itself' : UPDATE_PHASE[running.phase]) : 'Starting the update'}…
          </p>
        )}
        <div className="mt-5 flex flex-wrap gap-2">
          {!stuck && (
            <Button variant="primary" disabled={updating} onClick={start}>
              Update {name}
            </Button>
          )}
          {error ? (
            <Button variant="secondary" onClick={() => location.reload()}>
              Reload
            </Button>
          ) : (
            <Button variant="secondary" disabled={updating} onClick={openAnyway}>
              Open anyway
            </Button>
          )}
          <Button variant="ghost" onClick={() => (location.href = machinePath(null))}>
            Open {self?.host ?? 'the main machine'}
          </Button>
        </div>
      </div>
    </div>
  );
}
