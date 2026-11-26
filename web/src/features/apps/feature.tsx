// Apps: reusable tasks with a form, a gallery, and public pages; beside them, the services agents connect to.
//
//   /apps                 Agent apps: your apps, the latest runs, the ready-made ones; on a computer the Apps page's column has its places:
//                         ?place=pinned|recent|own, ?kind=<a kind of app> (the whole gallery, or one part of it)
//   /apps/connected       Connected apps: services every agent can use, their marketplace, the keys (?tab=market|keys)
//   /apps/web/<id>        a web app: its page and its tabs (?tab=preview|checks|keys|launch|run…)
//   /apps/<id>            an app: its form and Run, runs, rows of a CSV, API and sharing
//   /apps/t/<template>    a template, run as it is (also /apps/tpl:<template>)
//   ?in.<question>=…      on an app's page: its form filled in with that answer (several may be given), not run yet
//   /apps/make            What do you want to make?: the kinds of web app as cards with pictures, and the small tool with no pages
//   /apps/new, …/edit     the builder (?template=… to start from one, ?from=<session> from a session, &turn=<a reply's place> from that turn)
//   /apps/runs/<run>      a run's result, its follow-ups and a box for the next one
//   /a/<slug>             the public page (main.tsx, without the sign-in)
//
// A run's session opens on the same result (SessionPane), with a switch to its conversation. An app an agent ran for
// you in another session shows there as its card (InSession), under the turn that asked for it.
import { useEffect, useState } from 'react';
import { ClipboardCheck, LayoutGrid } from 'lucide-react';
import { useLocation, useSearch } from 'wouter';
import type { AnswerField, AppRecipe } from '@shared/apps';
import type { SessionSummary, ToolItem } from '@shared/types';
import { api, enc } from '../../lib/api';
import { go, sessionPath } from '../../lib/nav';
import { useSessions } from '../../lib/store';
import { MenuItem } from '../../components/ui';
import type { WebFeature } from '../registry';
import { useSessionShow } from '../session/show';
import { runPath } from './api';
import { AllowedSettings } from './AllowedSettings';
import { AppPage } from './AppPage';
import { BuilderPage } from './Builder';
import { GalleryPage } from './Gallery';
import { ResultView } from './Result';
import { RunPage } from './RunPage';
import { AppSessionPane, runOfSession } from './SessionPane';
import { AppRunNote, USE_APP_VIEW } from './InSession';
import { AppSide, BUILDER_VIEWS, closeAppSide, useAppSide, useAppSideOpen } from './Beside';
import { WEB_TABS, type WebTab } from '../webapps/api';
import { WebAppPage } from '../webapps/Page';
import { WebDock } from '../webapps/simple/Dock';
import { MakePage } from '../webapps/Make';
import { ChooseRow } from '../webapps/ChooseRow';
import { closeWebSide, useWebSideOpen, WebAppRow, WebSide, webAppOf } from '../webapps/Side';
import { keysCardOf } from '@shared/keys';
import { servicesCardOf } from '@shared/services';
import { ServicesRow } from '../webapps/ServicesRow';

function AppsRoutes() {
  const [loc] = useLocation();
  const search = useSearch();
  const q = new URLSearchParams(search);
  const tab = q.get('tab');
  let m: RegExpExecArray | null;
  if (loc === '/apps/new') return <BuilderPage key={search} template={q.get('template') ?? undefined} from={q.get('from') ?? undefined} turn={q.get('turn') ?? undefined} />;
  if (loc === '/apps/make') return <MakePage />;
  if (loc === '/apps/connected') return <GalleryPage tab="connected" />;
  if ((m = /^\/apps\/runs\/([^/]+)$/.exec(loc))) return <RunPage key={m[1]} id={decodeURIComponent(m[1])} />;
  if ((m = /^\/apps\/t\/([^/]+)$/.exec(loc))) return <AppPage key={m[1]} id={`tpl:${decodeURIComponent(m[1])}`} tab="run" again={q.get('again')} prefill={search} />;
  if ((m = /^\/apps\/web\/([^/]+)$/.exec(loc))) return <WebAppPage key={m[1]} id={decodeURIComponent(m[1])} tab={WEB_TABS.includes(tab as WebTab) ? (tab as WebTab) : 'overview'} />;
  if ((m = /^\/apps\/([^/]+)\/edit$/.exec(loc))) return <BuilderPage key={m[1]} id={decodeURIComponent(m[1])} />;
  if ((m = /^\/apps\/([^/]+)$/.exec(loc)))
    return <AppPage key={m[1]} id={decodeURIComponent(m[1])} tab={tab === 'runs' || tab === 'rows' || tab === 'share' ? tab : 'run'} again={q.get('again')} prefill={search} />;
  return <GalleryPage />;
}

/** submit_result in the conversation: what the agent handed in, or why it did not fit yet. */
function SubmitRow({ item, sessionKey }: { item: ToolItem; sessionKey: string }) {
  const run = useSessions((s) => (s.byKey[sessionKey]?.extra?.app as { run?: string } | undefined)?.run);
  const [loc] = useLocation();
  const t = item.tool;
  const input = t.input && typeof t.input === 'object' ? (t.input as Record<string, unknown>) : null;
  // A card's data draws as its card only with the run's answer fields (which card it is): read once, when there is one.
  const card = !!input && Object.values(input).some((v) => !!v && typeof v === 'object' && !Array.isArray(v));
  const [answer, setAnswer] = useState<AnswerField[]>([]);
  useEffect(() => {
    if (run && card) api<{ recipe: AppRecipe }>(`/api/apps/runs/${enc(run)}`).then((r) => setAnswer(r.recipe.answer), () => {});
  }, [run, card]);
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
      {failed ? <div className="rounded-xl bg-bg-2 px-3 py-2 text-[12.5px] whitespace-pre-wrap text-fg-2">{(t.output ?? '').slice(0, 1200)}</div> : input && <ResultView answer={answer} result={input} />}
    </div>
  );
}

/** Beside the conversation: the template an agent is building, or else the web app. */
function SidePanel({ s }: { s: SessionSummary }) {
  const template = useAppSide((x) => !!x.open[s.key]);
  return template ? <AppSide s={s} /> : <WebSide s={s} />;
}

export const appsFeature: WebFeature = {
  id: 'apps',
  routes: [{ match: (p) => p === '/apps' || p.startsWith('/apps/'), Page: AppsRoutes }],
  nav: [{ id: 'apps', path: '/apps', label: 'Apps', icon: <LayoutGrid size={17} />, match: (p) => p === '/apps' || p.startsWith('/apps/') }],
  toolViews: {
    submit_result: { place: 'answer', Row: SubmitRow },
    use_app: USE_APP_VIEW,
    ...BUILDER_VIEWS,
    // Web apps: the options put to the maker (answered on a card), and the app as an agent makes or changes it, beside the conversation.
    webapp_choose: { place: 'answer', Row: ChooseRow },
    // Of a turn's calls about one app only the newest shows with the reply (the others stay steps of the work).
    webapp_new: { place: 'answer', same: (t) => webAppOf(t.output ?? '') ?? undefined, Row: WebAppRow },
    // One with a keys card is not folded into a later call's row: the card stays where it was asked.
    webapp_run: { place: 'answer', same: (t) => webAppOf(t.output ?? '') ?? undefined, Row: WebAppRow },
  },
  // The choice of a service (or the keys card of the one chosen), where it was asked.
  matchTool: (t) => (/webapp_services$/.test(t.name) && (servicesCardOf(t.output) || keysCardOf(t.output)) ? { place: 'attention', Row: ServicesRow } : undefined),
  noteViews: { 'app-run': AppRunNote },
  settings: [{ id: 'apps', label: 'Apps', icon: LayoutGrid, sub: 'What apps know about you, and which run without asking', Body: AllowedSettings }],
  // A template an agent builds, beside its conversation while it is new.
  sessionSide: {
    useOpen: (key) => {
      const template = useAppSideOpen(key);
      const web = useWebSideOpen(key);
      return template || web;
    },
    close: (key) => {
      closeAppSide(key);
      closeWebSide(key);
    },
    Panel: SidePanel,
  },
  // A web app being made: where it is, above the message box.
  SessionDock: WebDock,
  sessionPane: { label: 'Result', icon: <ClipboardCheck size={13} />, match: (s) => !!runOfSession(s), placeholder: 'Ask for a change to the result…', Body: AppSessionPane },
  // Not for a confidential session, whose words stay on this computer.
  SessionMenu: ({ s, close }) =>
    s.extra?.confidential ? null : (
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
