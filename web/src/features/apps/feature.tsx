// Apps: reusable tasks with a form, a gallery, and public pages. People see them as Templates.
//
//   /apps                 the gallery: your apps, the latest runs, templates
//   /apps/<id>            an app: its form and Run, runs, rows of a CSV, API and sharing
//   /apps/t/<template>    a template, run as it is
//   /apps/new, …/edit     the builder (?template=… to start from one, ?from=<session> from a session)
//   /apps/runs/<run>      a run's result, its follow-ups and a box for the next one
//   /a/<slug>             the public page (main.tsx, without the sign-in)
//
// A run's session opens on the same result (SessionPane), with a switch to its conversation.
import { ClipboardCheck, LayoutGrid } from 'lucide-react';
import { useLocation, useSearch } from 'wouter';
import type { ToolItem } from '@shared/types';
import { enc } from '../../lib/api';
import { go, sessionPath } from '../../lib/nav';
import { useSessions } from '../../lib/store';
import { MenuItem } from '../../components/ui';
import type { WebFeature } from '../registry';
import { useSessionShow } from '../session/show';
import { runPath } from './api';
import { AppPage } from './AppPage';
import { BuilderPage } from './Builder';
import { GalleryPage } from './Gallery';
import { ResultView } from './Result';
import { RunPage } from './RunPage';
import { AppSessionPane, runOfSession } from './SessionPane';
import { AppSide, BUILDER_VIEWS, closeAppSide, useAppSideOpen } from './Beside';

function AppsRoutes() {
  const [loc] = useLocation();
  const search = useSearch();
  const q = new URLSearchParams(search);
  const tab = q.get('tab');
  let m: RegExpExecArray | null;
  if (loc === '/apps/new') return <BuilderPage key={search} template={q.get('template') ?? undefined} from={q.get('from') ?? undefined} />;
  if ((m = /^\/apps\/runs\/([^/]+)$/.exec(loc))) return <RunPage key={m[1]} id={decodeURIComponent(m[1])} />;
  if ((m = /^\/apps\/t\/([^/]+)$/.exec(loc))) return <AppPage key={m[1]} id={`tpl:${decodeURIComponent(m[1])}`} tab="run" again={q.get('again')} />;
  if ((m = /^\/apps\/([^/]+)\/edit$/.exec(loc))) return <BuilderPage key={m[1]} id={decodeURIComponent(m[1])} />;
  if ((m = /^\/apps\/([^/]+)$/.exec(loc)))
    return <AppPage key={m[1]} id={decodeURIComponent(m[1])} tab={tab === 'runs' || tab === 'rows' || tab === 'share' ? tab : 'run'} again={q.get('again')} />;
  return <GalleryPage />;
}

/** submit_result in the conversation: what the agent handed in, or why it did not fit yet. */
function SubmitRow({ item, sessionKey }: { item: ToolItem; sessionKey: string }) {
  const run = useSessions((s) => (s.byKey[sessionKey]?.extra?.app as { run?: string } | undefined)?.run);
  const [loc] = useLocation();
  const t = item.tool;
  const input = t.input && typeof t.input === 'object' ? (t.input as Record<string, unknown>) : null;
  const failed = t.status === 'error';
  const running = t.status === 'running' || t.status === 'pending';
  return (
    <div className="my-2">
      <div className="mb-2 flex items-center gap-2 text-[13px]">
        <ClipboardCheck size={15} className={failed ? 'text-warn' : 'text-ok'} />
        <span className="min-w-0 flex-1 font-medium">{running ? 'Handing in the result…' : failed ? 'The result did not fit the answer fields yet' : 'Result handed in'}</span>
        {/* On the session's own page, its Result view; anywhere else, the run's page. */}
        {run && !failed && (
          <button
            type="button"
            onClick={() => (loc === sessionPath(sessionKey) ? useSessionShow.getState().show(sessionKey, 'pane') : go(runPath(run)))}
            className="shrink-0 text-[12.5px] text-accent hover:underline"
          >
            Open the result
          </button>
        )}
      </div>
      {failed ? <div className="rounded-xl bg-bg-2 px-3 py-2 text-[12.5px] whitespace-pre-wrap text-fg-2">{(t.output ?? '').slice(0, 1200)}</div> : input && <ResultView answer={[]} result={input} />}
    </div>
  );
}

export const appsFeature: WebFeature = {
  id: 'apps',
  routes: [{ match: (p) => p === '/apps' || p.startsWith('/apps/'), Page: AppsRoutes }],
  nav: [{ path: '/apps', label: 'Apps', icon: <LayoutGrid size={17} />, match: (p) => p === '/apps' || p.startsWith('/apps/') }],
  toolViews: { submit_result: { place: 'answer', Row: SubmitRow }, ...BUILDER_VIEWS },
  // A template an agent builds, beside its conversation while it is new.
  sessionSide: { useOpen: useAppSideOpen, close: closeAppSide, Panel: AppSide },
  sessionPane: { label: 'Result', icon: <ClipboardCheck size={13} />, match: (s) => !!runOfSession(s), placeholder: 'Ask for a change to the result…', Body: AppSessionPane },
  SessionMenu: ({ s, close }) => (
    <MenuItem
      icon={<LayoutGrid size={15} />}
      onClick={() => {
        close();
        go(`/apps/new?from=${enc(s.key)}`);
      }}
    >
      Save as an app
    </MenuItem>
  ),
  sessionMenuPart: 'more',
};
