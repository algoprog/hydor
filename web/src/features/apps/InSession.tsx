// An app an agent ran for you in a session (use_app): its card in the conversation, under the turn that asked for
// it. It follows the run live (where it stands, the steps going by), asks you what one of its steps needs to know,
// and shows its answer as the app shows it (its view, or the plain card); Open goes to the run's page, the app's
// name to the app. The tool call itself is a line among the agent's steps. The run's own reply stays on its page: the
// session's agent says what came of it, above the card (a run that ends after the call stopped waiting moves its
// card under the reply to that news, and the news itself shows no bubble: Timeline.tsx).
import { ArrowUpRight } from 'lucide-react';
import type { SessionNote } from '@shared/features';
import type { ToolInfo } from '@shared/types';
import { inputsLine } from '@shared/apps';
import { go } from '../../lib/nav';
import { Button, Throbber } from '../../components/ui';
import { StepRow } from '../automations/StepRow';
import type { ToolView } from '../registry';
import { appPath, runPath, useRunDetail } from './api';
import { AppIcon } from './AppIcon';
import { RunBody } from './Result';
import { AnswerCard, viewCan } from './RunPage';
import { AppView } from './View';

/** What the card knows before the run loads: the run, its app, and the app's face. */
interface AppRunData {
  run: string;
  app: string;
  name: string;
  icon: string;
  color: string;
}

export function AppRunNote({ note }: { note: SessionNote; sessionKey: string }) {
  const data = note.data as AppRunData;
  const { d, err } = useRunDetail(data.run);
  const ready = data.app.startsWith('tpl:');
  const r = d?.run;
  const asked = d && r ? inputsLine(d.recipe.fields, r.inputs, 80) : '';
  // In the conversation, its view does what it does on the run's page, but asks nothing of the run's own agent.
  const can = d ? viewCan(d).filter((c) => c !== 'ask') : [];
  return (
    <div className="my-3 space-y-2">
      <div className="flex min-w-0 items-center gap-2.5 px-1">
        <AppIcon icon={data.icon} color={data.color} size={24} />
        <button type="button" onClick={() => go(appPath(data.app))} className="min-w-0 shrink truncate text-[13.5px] font-semibold transition-colors hover:text-accent" title="Open the app" translate={ready ? undefined : 'no'}>
          {data.name}
        </button>
        {asked && (
          <span className="min-w-0 flex-1 truncate text-[12.5px] text-fg-3" translate="no">
            · {asked}
          </span>
        )}
        {!asked && <span className="flex-1" />}
        <Button size="sm" variant="ghost" icon={<ArrowUpRight size={14} />} onClick={() => go(runPath(data.run))} className="shrink-0">
          Open
        </Button>
      </div>
      {!d ? (
        err ? (
          <div className="rounded-2xl border border-line bg-panel px-4 py-3 text-[13px] text-fg-3">{err}</div>
        ) : (
          <div className="flex items-center gap-2 rounded-2xl border border-line bg-panel px-4 py-3 text-[13px] text-fg-3">
            <Throbber /> Starting…
          </div>
        )
      ) : (
        <>
          <RunBody
            assets={d.recipe.assets}
            noReply
            run={d.run}
            progress={d.progress}
            answer={d.recipe.answer}
            name={d.recipe.name}
            view={d.recipe.ui ? <AppView ui={d.recipe.ui} name={d.recipe.name} appId={d.run.app} run={d.run} answer={d.recipe.answer} view={d.view} can={can} translate={ready} assets={d.recipe.assets} /> : undefined}
          />
          {d.question && <AnswerCard runId={d.run.id} q={d.question} />}
        </>
      )}
    </div>
  );
}

/** The app a use_app call ran, in words for its step line ("trip-planner" → "Trip planner"). */
function appWords(t: ToolInfo): string {
  const v = (t.input as Record<string, unknown> | undefined)?.app;
  const s = typeof v === 'string' ? v.replace(/^tpl:/, '').replace(/[-_]+/g, ' ').trim() : '';
  return s ? s[0].toUpperCase() + s.slice(1) : 'an app';
}

const running = (t: ToolInfo) => t.status === 'running' || t.status === 'pending';

/** use_app among the agent's steps: "Running Trip planner", its call and answer when opened. */
export const USE_APP_VIEW: ToolView = { place: 'work', Row: StepRow, step: (t) => ({ verb: running(t) ? 'Running' : 'Ran', title: appWords(t) }) };
