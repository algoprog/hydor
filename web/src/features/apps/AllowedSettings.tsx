// Settings → Apps: About you (AboutYou.tsx), what apps start their questions from; which program runs the ready-made
// apps; then the apps agents run for you without asking first. An agent that wants to run one of your apps asks on the app's card in the conversation;
// "Always run it" there puts the app here. Remove one and agents ask again; add one to skip the question before the
// first time.
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Plus, X } from 'lucide-react';
import { api, enc, put } from '../../lib/api';
import { tr } from '../../i18n/runtime';
import { toastError, useApp } from '../../lib/store';
import { cx, IconButton, Popover, Throbber } from '../../components/ui';
import { RUN_WITH, type RunWith } from '@shared/app-run-with';
import { isProgram, PROGRAM_LABEL, programUsable } from '@shared/programs';
import { EmptyRow, Group, Row, Select, Stack } from '../settings/kit';
import { AppIcon } from './AppIcon';
import { AboutYou } from './AboutYou';

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

/** "Ready-made apps run with": a program for those with no choice kept of their own; one not signed in cannot be picked. */
function ReadyRunsWith() {
  const programs = useApp((s) => s.boot?.programs);
  const [value, setValue] = useState<RunWith | null>(null);
  useEffect(() => {
    let live = true;
    api<{ value: RunWith }>('/api/apps/run-with')
      .then((r) => live && setValue(r.value))
      .catch(toastError);
    return () => {
      live = false;
    };
  }, []);
  const set = (v: RunWith) => put<{ value: RunWith }>('/api/apps/run-with', { value: v }).then((r) => setValue(r.value), toastError);
  const usable = (v: RunWith) => programUsable(programs, v);
  return (
    <Group title="Ready-made apps">
      <Row
        label="Ready-made apps run with"
        hint="A program you keep on an app’s own page comes first."
        info="Automatic takes the first of Claude Code, Codex and Custom signed in here. Each app thinks with its own tier, with the model Settings → Models → Tiers names for the program. Apps of your own run with the program picked in their settings."
        control={
          <Select<RunWith>
            label="Ready-made apps run with"
            value={value ?? 'auto'}
            disabled={!value}
            onChange={set}
            options={RUN_WITH.map((o) => ({
              value: o.value,
              label: o.label,
              disabled: !usable(o.value),
              hint: usable(o.value) ? undefined : 'Not set up: sign in to it under Settings → Agents → Accounts.',
            }))}
          />
        }
      >
        {value && isProgram(value) && !usable(value) && <div className="text-[12.5px] leading-snug text-warn">{`${PROGRAM_LABEL[value]} is not signed in here: ready-made apps that need it will not run.`}</div>}
      </Row>
    </Group>
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
      <AboutYou />
      <ReadyRunsWith />
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
