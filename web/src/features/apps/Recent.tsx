// Near the top of the Apps page: the apps you ran lately, each once, newest first, with when and how its last run went,
// to open its result (an app that opens on its own page: that page) or run it again with the same answers; and, for
// someone who has run none yet, four ready-made apps most people use, to start with.
import { RotateCcw } from 'lucide-react';
import type { AppField, AppRun } from '@shared/apps';
import type { AppUi } from '@shared/app-ui';
import { inputsLine, isActive } from '@shared/apps';
import { pagesFor } from '@shared/app-ui';
import { enc } from '../../lib/api';
import { ago } from '../../lib/format';
import { go } from '../../lib/nav';
import { appPath, runPath, type ReadyApp, type UsedApp } from './api';
import { AppIcon } from './AppIcon';
import { statusBadge } from './status';

/** What a recent app's card shows of it. */
export interface UsedFace {
  name: string;
  icon: string;
  color: string;
  fields: AppField[];
  ui?: AppUi;
}

/** Where its run's card leads, and what that is called: the result, the question waiting, the run at work, or the run that did not finish. */
function openOf(app: string, r: AppRun, face: UsedFace): { path: string; label: string } {
  if (r.status === 'done') return { path: pagesFor(face.ui, 'app').length ? appPath(app) : runPath(r.id), label: 'Open the result' };
  if (r.status === 'waiting') return { path: runPath(r.id), label: 'Answer it' };
  if (isActive(r.status)) return { path: runPath(r.id), label: 'Follow it' };
  return { path: runPath(r.id), label: 'Open the run' };
}

/** One app you ran lately: its face, what it was asked, how its last run went and when, and what to do next. */
function UsedCard({ u, face }: { u: UsedApp; face: UsedFace }) {
  const r = u.run;
  const open = openOf(u.app, r, face);
  return (
    <div className="flex w-[252px] shrink-0 snap-start flex-col rounded-2xl border border-line bg-panel p-3 sm:w-auto">
      <div onClick={() => go(open.path)} className="flex min-w-0 cursor-pointer items-start gap-2.5">
        <AppIcon icon={face.icon} color={face.color} size={34} />
        <div className="min-w-0 flex-1">
          <div translate={u.app.startsWith('tpl:') ? undefined : 'no'} className="truncate text-[14px] font-semibold tracking-tight">
            {face.name}
          </div>
          <div translate="no" className="truncate text-[12.5px] text-fg-3">
            {inputsLine(face.fields, r.inputs, 60) || '—'}
          </div>
        </div>
      </div>
      <div className="mt-2 flex min-w-0 items-center gap-2">
        {statusBadge(r)}
        <span className="truncate text-[12px] text-fg-3">{ago(r.endedAt ?? r.createdAt)}</span>
      </div>
      <div className="mt-2 flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[12.5px] font-medium">
        <button type="button" onClick={() => go(open.path)} className="text-accent hover:underline">
          {open.label}
        </button>
        {!isActive(r.status) && (
          <button type="button" onClick={() => go(`${appPath(u.app)}?again=${enc(r.id)}`)} title="Its form, filled in with the same answers" className="inline-flex items-center gap-1 text-fg-3 hover:text-fg">
            <RotateCcw size={12} />
            Run again
          </button>
        )}
      </div>
    </div>
  );
}

/** The apps you ran lately: rows of cards on a computer, one row that scrolls sideways on a phone. */
export function RecentlyUsed({ used, faces }: { used: UsedApp[]; faces: Record<string, UsedFace | undefined> }) {
  return (
    <div className="-mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 @3xl:grid-cols-3 @4xl:grid-cols-4 [&::-webkit-scrollbar]:hidden">
      {used.map((u) => {
        const face = faces[u.app];
        return face ? <UsedCard key={u.app} u={u} face={face} /> : null;
      })}
    </div>
  );
}

/** The ready-made apps someone new is offered first: the ones most people use. */
const START = ['weather-outlook', 'trip-planner', 'fridge-recipes', 'compare-products'];

/** Four ready-made apps to start with (those still installed): each opens its form. */
export function StartWith({ templates }: { templates: ReadyApp[] }) {
  const list = START.map((id) => templates.find((t) => t.id === id && t.installed)).filter((t): t is ReadyApp => !!t);
  return (
    <div className="grid grid-cols-2 gap-3 @3xl:grid-cols-4">
      {list.map((t) => (
        <button key={t.id} type="button" onClick={() => go(appPath(`tpl:${t.id}`))} className="flex flex-col items-start gap-3 rounded-2xl border border-line bg-panel p-3.5 text-left transition-colors hover:border-line-2 hover:bg-bg-1">
          <AppIcon icon={t.icon} color={t.color} size={40} />
          <span className="block w-full min-w-0">
            <span className="line-clamp-2 block text-[14.5px] leading-snug font-semibold tracking-tight">{t.name}</span>
            <span className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-fg-3">{t.description}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

/** Whether someone is new to apps here: nothing run yet (the page then offers ready-made ones to start with). */
export const isNew = (used: UsedApp[] | undefined, recent: AppRun[]) => !used?.length && !recent.length;
