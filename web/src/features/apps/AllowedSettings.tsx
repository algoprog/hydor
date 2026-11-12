// Settings → Apps: the apps agents run for you without asking first. An agent that wants to run one of your apps asks
// on the app's card in the conversation; "Always run it" there puts the app here. Remove one and agents ask again;
// add one to skip the question before the first time.
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Plus, X } from 'lucide-react';
import { api, enc, put } from '../../lib/api';
import { tr } from '../../i18n/runtime';
import { toastError } from '../../lib/store';
import { cx, IconButton, Popover, Throbber } from '../../components/ui';
import { EmptyRow, Group, Row, Stack } from '../settings/kit';
import { AppIcon } from './AppIcon';

interface AppRef {
  id: string;
  name: string;
  icon: string;
  color: string;
  own: boolean;
}
interface Allowed {
  apps: AppRef[];
  others: AppRef[];
}

/** A button that opens the apps not on the list, to add one. */
function AddApp({ others, onAdd }: { others: AppRef[]; onAdd: (a: AppRef) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={ref}
        type="button"
        aria-expanded={open}
        disabled={!others.length}
        onClick={() => setOpen((o) => !o)}
        className={cx('inline-flex h-8 items-center gap-1.5 rounded-lg bg-bg-2 pr-2 pl-3 text-[13px] text-fg ring-1 ring-line-2 transition-colors ring-inset hover:bg-bg-3 disabled:opacity-50', open && 'bg-bg-3')}
      >
        <Plus size={14} className="shrink-0 text-fg-3" />
        Add an app
        <ChevronDown size={14} className={cx('shrink-0 text-fg-3 transition-transform duration-200', open && 'rotate-180')} />
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} align="end" width={280} title="Add an app">
        <div className="max-h-[320px] overflow-auto">
          {others.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => {
                setOpen(false);
                onAdd(a);
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-bg-2"
            >
              <AppIcon icon={a.icon} color={a.color} size={22} />
              <span className="min-w-0 flex-1 truncate text-[13.5px]" translate={a.own ? 'no' : undefined}>
                {a.name}
              </span>
            </button>
          ))}
        </div>
      </Popover>
    </>
  );
}

export function AllowedSettings() {
  const [st, setSt] = useState<Allowed | null>(null);
  useEffect(() => {
    let live = true;
    api<Allowed>('/api/apps/allowed')
      .then((r) => live && setSt(r))
      .catch(toastError);
    return () => {
      live = false;
    };
  }, []);
  const set = async (id: string, allowed: boolean) => {
    try {
      setSt(await put<Allowed>(`/api/apps/allowed/${enc(id)}`, { allowed }));
    } catch (e) {
      toastError(e);
    }
  };
  return (
    <Stack>
      <Group
        title="Run without asking"
        info="When an agent wants to run one of your apps, it first asks on the app’s card in the conversation: Run it, Always run it, or Don’t run. Apps listed here run without that question; the card still shows when the app needs details the request left out. Remove an app to be asked again."
        actions={st ? <AddApp others={st.others} onAdd={(a) => set(a.id, true)} /> : undefined}
      >
        {!st ? (
          <div className="flex justify-center px-4 py-5">
            <Throbber className="text-fg-3" />
          </div>
        ) : st.apps.length ? (
          st.apps.map((a) => (
            <Row
              key={a.id}
              icon={<AppIcon icon={a.icon} color={a.color} size={24} />}
              label={<span translate={a.own ? 'no' : undefined}>{a.name}</span>}
              control={
                <IconButton size="sm" label={tr(`Ask before running ${a.name}`)} onClick={() => set(a.id, false)}>
                  <X size={15} />
                </IconButton>
              }
            />
          ))
        ) : (
          <EmptyRow>None yet. When an agent asks to run an app, choose Always run it on its card, or add one here.</EmptyRow>
        )}
      </Group>
    </Stack>
  );
}
