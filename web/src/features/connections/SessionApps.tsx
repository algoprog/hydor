// A session's own choice of apps: its menu opens a list of the connected apps, each on or off for this
// session alone (kept in its settings). The list lives in the session's dock, so it outlives the menu.
import { useEffect, useState } from 'react';
import { PlugZap } from 'lucide-react';
import { create } from 'zustand';
import type { SessionConnection } from '@shared/connections';
import type { SessionSummary } from '@shared/types';
import { api, enc, put } from '../../lib/api';
import { go } from '../../lib/nav';
import { toastError } from '../../lib/store';
import { Button, Dialog, MenuItem, Switch, Throbber } from '../../components/ui';
import { AppIcon, useConn } from './store';

const useOpen = create<{ key: string | null; set: (k: string | null) => void }>((set) => ({ key: null, set: (key) => set({ key }) }));

export function SessionAppsItem({ s, close }: { s: SessionSummary; close: () => void }) {
  return (
    <MenuItem icon={<PlugZap size={15} />} onClick={() => (close(), useOpen.getState().set(s.key))}>
      Connected apps…
    </MenuItem>
  );
}

export function SessionAppsDialog({ s }: { s: SessionSummary }) {
  const open = useOpen((x) => x.key === s.key);
  const apps = useConn((x) => x.apps);
  const [list, setList] = useState<SessionConnection[] | null>(null);
  useEffect(() => {
    if (!open) return;
    setList(null);
    void useConn.getState().loadCatalog();
    api<{ apps: SessionConnection[] }>(`/api/connections/session/${enc(s.key)}`)
      .then((r) => setList(r.apps))
      .catch(toastError);
  }, [open, s.key]);
  if (!open) return null;
  const close = () => useOpen.getState().set(null);
  const set = async (id: string, on: boolean) => {
    try {
      const r = await put<{ apps: SessionConnection[] }>(`/api/connections/session/${enc(s.key)}`, { id, on });
      setList(r.apps);
    } catch (e) {
      toastError(e);
    }
  };
  return (
    <Dialog
      open
      onClose={close}
      title="Connected apps in this session"
      width={460}
      footer={
        <Button variant="primary" onClick={close}>
          Done
        </Button>
      }
    >
      {!list ? (
        <Throbber className="text-fg-3" />
      ) : !list.length ? (
        <div className="space-y-3 text-[13.5px] leading-relaxed text-fg-2">
          <p>No apps are connected yet. Connect one once in Settings, and every agent can use it.</p>
          <Button size="sm" variant="secondary" onClick={() => (close(), go('/settings?s=connections'))}>
            Open Settings → Connections
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="-my-1 divide-y divide-line">
            {list.map((c) => {
              const app = apps?.find((a) => a.id === c.id);
              return (
                <label key={c.id} className="flex cursor-pointer items-center gap-3 py-2.5">
                  {app ? <AppIcon app={app} size={28} /> : <span className="h-7 w-7 rounded-[9px] bg-bg-2" />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px]">{c.name}</span>
                    <span className="block text-[11.5px] text-fg-3">{c.on === c.global ? (c.global ? 'On, as in every session' : 'Off, as in every session') : c.on ? 'On here only' : 'Off here only'}</span>
                  </span>
                  <Switch on={c.on} onChange={(on) => set(c.id, on)} label={`${c.name} in this session`} />
                </label>
              );
            })}
          </div>
          <p className="text-[12px] leading-snug text-fg-3">Apps over the internet follow at once. Apps that run on this computer follow when the agent next starts.</p>
        </div>
      )}
    </Dialog>
  );
}
