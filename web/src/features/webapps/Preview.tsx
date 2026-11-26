// A web app's Preview: the app inside the page in a frame, as a phone or as a computer, with a reload. The address comes from the same
// route that opens it in a tab (it starts the app and signs the person in; each address works once, so a reload asks for a new one).
// Where the page cannot show it in a frame (the path way, for a tunnel with one hostname, where the app runs in a sandbox of its own;
// a browser that refuses the frame, or one that keeps the app's session cookie from inside a frame: Safari, Firefox with strict settings),
// it says so and offers a tab of its own. The second is told by the app's own answer: with no cookie it is "open this from Hydor", which
// to a frame is a small page that tells the page around it (server/webapps/proxy.ts), and nothing else is needed to know.
import { useCallback, useEffect, useRef, useState } from 'react';
import { ExternalLink, Monitor, MousePointerClick, RefreshCw, Send, Smartphone, X } from 'lucide-react';
import type { WebApp, WebAppOpen } from '@shared/webapps';
import { tr } from '../../i18n/runtime';
import { ApiError, enc, post } from '../../lib/api';
import { composeInsert } from '../../lib/featureEvents';
import { Button, cx, IconButton, inputCls, Segmented, Throbber, useMediaQuery } from '../../components/ui';
import { NO_ADDRESS, openWebApp } from './api';
import { useAskAgent } from './ask';
import { BuildWhere } from './BuildWhere';
import { pointNote, readFrameMessage, type Pointed } from './point';
import { readable, statusOf } from './status';
import { useBeingMade } from './simple/sessions';

type Size = 'phone' | 'computer';
/** `waiting`: it did not start while its agent is still making it, and is tried again. */
type Phase = { at: 'idle' } | { at: 'loading' } | { at: 'ready'; url: string } | { at: 'path' } | { at: 'refused' } | { at: 'nocookie' } | { at: 'error'; message: string } | { at: 'waiting'; message: string };

/** While its agent makes it, how long after a start that failed it is tried again (Hydor spaces repeated starts out as well). */
const AGAIN_MS = 8000;

const SIZE_KEY = 'wa.webapps.preview';
/** What the person chose here and keeps across a reload of the page: pointing on (by the key of the place it is shown in). */
const POINT_KEY = 'wa.webapps.point.v1';
const kept = (key: string, at: string): string | null => {
  try {
    return (JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, string>)[at] ?? null;
  } catch {
    return null;
  }
};
const keep = (key: string, at: string, v: string | null) => {
  try {
    const all = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, string>;
    if (v) all[at] = v;
    else delete all[at];
    localStorage.setItem(key, JSON.stringify(all));
  } catch {}
};

/** What the app's page says to the page around it when the frame had no session (server/webapps/proxy.ts FRAME_MESSAGE). */
const NEEDS_OPEN = 'hydor-webapp-needs-open';

/**
 * `session`: the preview is beside that session's conversation: what is pointed at goes into its message box. Without it (the app's
 * own page) the pointed part shows in a small bar under the toolbar, with a box to say what should change and a button that asks the
 * agent in the app's project.
 */
export function Preview({ app, onBuild, session, simple, control }: { app: WebApp; onBuild: () => void; session?: string; /** With Technical details off: the app fills it, with no toolbar of its own and nothing technical said. */ simple?: boolean; /** Pointing at a part, switched and read by the page around it. */ control?: { pointing: boolean; onPointed: (p: Pointed) => void } }) {
  const [size, setSize] = useState<Size>(() => {
    try {
      return localStorage.getItem(SIZE_KEY) === 'computer' ? 'computer' : 'phone';
    } catch {
      return 'phone';
    }
  });
  const [phase, setPhase] = useState<Phase>({ at: 'idle' });
  const [shown, setShown] = useState(false);
  // On a narrow page the frame simply fills it (a phone inside a phone is two phones).
  const narrow = useMediaQuery('(max-width: 600px)');
  // Where this is shown (a session's side, or the app's own page): what is kept across a reload is kept for it.
  const place = session ?? app.id;
  // Pointing at a part: the app's pages are given Hydor's helper while it is on (a new address, at the page the frame was on).
  const [pointing, setPointing] = useState(() => kept(POINT_KEY, place) === '1');
  const pointingNow = useRef(pointing);
  const [pointed, setPointed] = useState<Pointed | null>(null);
  const [say, setSay] = useState('');
  const pointedText = useRef('');
  const given = useRef(control);
  given.current = control;
  const askAgent = useAskAgent(app);
  const run = useRef(0);
  const frame = useRef<HTMLIFrameElement>(null);
  /** How many pages the frame has finished loading since the address was asked for. */
  const loaded = useRef(0);
  const st = statusOf(app);
  // Its agent is at work on it: a start that fails is "not finished yet", shown as such and tried again, not an error.
  const making = useBeingMade(app);
  const makingNow = useRef(making);
  makingNow.current = making;
  // What it needs before it can be shown at all: its files read, a build, no build running.
  // An app being made runs its development server, so nothing has to be built before it shows.
  const blocker = !readable(app) ? 'file' : app.build.state === 'building' ? 'building' : !app.build.exists && app.mode?.runsAs !== 'dev' ? 'build' : null;

  const load = useCallback((resume = false, quiet = false) => {
    const n = ++run.current;
    loaded.current = 0;
    setShown(false);
    // Tried again by itself while it is being made: it keeps saying so meanwhile.
    if (!quiet) setPhase({ at: 'loading' });
    post<WebAppOpen>(`/api/webapps/${enc(app.id)}/open`, { frame: true, side: 'preview', ...(pointingNow.current ? { point: true } : {}), ...(resume ? { resume: true } : {}) }).then(
      (r) => {
        if (n !== run.current) return;
        setPhase(r.way === 'hostname' ? { at: 'ready', url: r.url } : { at: 'path' });
      },
      (e: unknown) => {
        if (n !== run.current) return;
        const message = e instanceof ApiError || e instanceof Error ? e.message : 'It could not be opened.';
        setPhase(makingNow.current ? { at: 'waiting', message } : { at: 'error', message });
      },
    );
  }, [app.id]);
  // Being made: a start that failed is tried again now and then, and once more as soon as its agent stops. What fails after that is an error.
  useEffect(() => {
    if (phase.at !== 'waiting') return;
    if (!making) return void load(false, true);
    const t = setTimeout(() => load(false, true), AGAIN_MS);
    return () => clearTimeout(t);
  }, [phase, making, load]);
  // Shown as soon as it can be, and again when a build ends (even one that was too quick to be seen going).
  useEffect(() => {
    if (blocker) setPhase({ at: 'idle' });
    else load();
    return () => void ++run.current;
  }, [blocker, load, app.build.endedAt]);
  // A browser that refuses the frame says so, once, by the page's own policy (a reason only that case has).
  useEffect(() => {
    const refused = (e: SecurityPolicyViolationEvent) => {
      if (e.violatedDirective.startsWith('frame-src') || e.violatedDirective.startsWith('child-src')) setPhase({ at: 'refused' });
    };
    document.addEventListener('securitypolicyviolation', refused);
    return () => document.removeEventListener('securitypolicyviolation', refused);
  }, []);
  // The app's own page tells this one when it has no session: as the first page of a frame, the browser kept the cookie out (it
  // would be the same on every try); later in it, the session ran out, and a new address fixes that.
  useEffect(() => {
    const told = (e: MessageEvent) => {
      if (!frame.current || e.source !== frame.current.contentWindow) return;
      if ((e.data as { hydor?: unknown } | null)?.hydor === NEEDS_OPEN) {
        if (loaded.current === 0) setPhase({ at: 'nocookie' });
        else load();
        return;
      }
      // What the app's page says while pointing: accepted from the app's own frame only, and from nobody else.
      const m = readFrameMessage(e.data, e.origin, phaseUrl.current);
      if (m?.type === 'point') {
        if (given.current) given.current.onPointed(m.pointed);
        else setPointed(m.pointed);
      }
    };
    window.addEventListener('message', told);
    return () => window.removeEventListener('message', told);
  }, [load]);
  const phaseUrl = useRef('');
  phaseUrl.current = phase.at === 'ready' ? phase.url : '';
  // Switched by the page around it: the pages are given the helper (a new address, at the page the frame was on), or not.
  const wanted = control?.pointing;
  useEffect(() => {
    if (wanted === undefined || pointingNow.current === wanted) return;
    pointingNow.current = wanted;
    setPointing(wanted);
    load(true);
  }, [wanted, load]);
  const togglePoint = () => {
    const on = !pointing;
    pointingNow.current = on;
    keep(POINT_KEY, place, on ? '1' : null);
    setPointing(on);
    if (!on) setPointed(null);
    // The frame is given a new address, at the page it was on, with the helper (or without it).
    if (phase.at === 'ready') load(true);
  };
  // What was pointed at goes into the conversation's message box (replacing the one before it), or into the bar of the app's own page.
  useEffect(() => {
    if (!pointed || !session) return;
    const note = pointNote(pointed);
    composeInsert(note, session, pointedText.current || undefined);
    pointedText.current = note;
  }, [pointed, session]);
  const choose = (s: Size) => {
    setSize(s);
    try {
      localStorage.setItem(SIZE_KEY, s);
    } catch {}
  };

  const message = (title: string, body?: string, action?: React.ReactNode, busy?: boolean) => (
    <div className="grid h-full place-items-center px-6 py-10 text-center">
      <div className="max-w-[420px]">
        {busy && <Throbber size={24} className="mx-auto mb-4 text-fg-3" />}
        <div className="text-[15px] font-medium">{title}</div>
        {body && (
          <p translate={blocker === 'file' || phase.at === 'error' || (phase.at === 'waiting' && !simple) ? 'no' : undefined} className="mt-1.5 break-words text-[13.5px] leading-relaxed text-fg-3">
            {body}
          </p>
        )}
        {action && <div className="mt-4 flex justify-center gap-2">{action}</div>}
      </div>
    </div>
  );
  const openTab = (
    <Button size="sm" variant="secondary" icon={<ExternalLink size={14} />} onClick={() => void openWebApp(app.id, undefined, 'preview')}>
      Open in a new tab
    </Button>
  );

  let body: React.ReactNode;
  // Its agent is still making it: what does not run yet shows as being made (with why, in technical details), not as a fault.
  if (!blocker && phase.at === 'waiting') body = message(tr('Being made'), simple ? tr('It shows here once it can run.') : phase.message, undefined, true);
  else if (making && blocker === 'file') body = message(tr('Being made'), simple ? tr('It shows here once it can run.') : st.reason, undefined, true);
  else if (simple && blocker === 'file') body = message(tr('Not ready to be shown yet'), tr('It shows here once it can run.'));
  else if (simple && blocker === 'building') body = message(tr('Being put together'), tr('It shows here in a moment.'));
  else if (simple && blocker === 'build')
    body = message(tr('Not ready to be shown yet'), tr('Put it together once to try it.'), (
      <Button size="sm" variant="primary" onClick={onBuild}>{tr('Show it')}</Button>
    ));
  else if (simple && (phase.at === 'path' || phase.at === 'refused' || phase.at === 'nocookie')) body = message(tr('It cannot be shown inside this page here'), tr('It works in a tab of its own.'), openTab);
  else if (simple && phase.at === 'error') body = message(tr('It could not be shown'), tr('Try once more. If it keeps happening, tell the agent.'), <Button size="sm" variant="secondary" onClick={() => load()}>Try again</Button>);
  else if (blocker === 'file') body = message(st.label, st.reason);
  else if (blocker === 'building') body = message('Building…', 'It shows here when the build is done.');
  else if (blocker === 'build')
    body = message('Not built yet', 'It has to be built once before it can be shown.', (
      <div className="space-y-3">
        <Button size="sm" variant="primary" onClick={onBuild}>Build</Button>
        <BuildWhere box={app.build.box} refused={app.build.refused} className="text-left" />
      </div>
    ));
  else if (phase.at === 'path') body = message('This app can’t be shown inside this page here', NO_ADDRESS(), openTab);
  else if (phase.at === 'refused') body = message('Your browser won’t show the app inside this page', undefined, openTab);
  else if (phase.at === 'nocookie')
    body = message('This browser does not allow the preview here', 'It keeps an app’s sign-in from a page shown inside another page. The app works in a tab of its own.', openTab);
  else if (phase.at === 'error') body = message('It could not be shown', phase.message, <Button size="sm" variant="secondary" onClick={() => load()}>Try again</Button>);
  else if (phase.at === 'ready')
    body = (
      <div className={cx('relative mx-auto h-full bg-bg', size === 'phone' && !narrow && !simple ? 'w-[390px] max-w-full overflow-hidden rounded-[22px] border border-line-2 shadow-sm' : 'w-full')}>
        {!shown && (
          <div className="absolute inset-0 z-10 grid place-items-center bg-bg text-fg-3">
            <Throbber size={24} />
          </div>
        )}
        <iframe
          key={phase.url}
          ref={frame}
          src={phase.url}
          title={app.name}
          onLoad={() => {
            loaded.current++;
            setShown(true);
          }}
          // The app is a page of its own origin: it may run its scripts and keep its cookies, and may open its own windows, and nothing more.
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads"
          className="block h-full w-full border-0 bg-white"
        />
      </div>
    );
  else
    body = (
      <div className="grid h-full place-items-center text-fg-3">
        <Throbber size={24} />
      </div>
    );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {!simple && <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2 sm:px-6">
        {!narrow && (
          <Segmented
            size="sm"
            value={size}
            onChange={choose}
            options={[
              { value: 'phone', label: <span className="flex items-center gap-1.5"><Smartphone size={14} />Phone</span> },
              { value: 'computer', label: <span className="flex items-center gap-1.5"><Monitor size={14} />Computer</span> },
            ]}
          />
        )}
        <span className="flex-1" />
        <Button size="sm" variant={pointing ? 'primary' : 'ghost'} aria-pressed={pointing} aria-label={tr('Point at a part')} icon={<MousePointerClick size={14} />} disabled={!!blocker || phase.at !== 'ready'} onClick={togglePoint}>
          <span className={cx(session ? 'hidden' : 'max-sm:hidden')}>{pointing ? tr('Pointing') : tr('Point')}</span>
        </Button>
        <IconButton label="Reload" size="sm" disabled={!!blocker || phase.at === 'loading'} onClick={() => load()}>
          <RefreshCw size={14} className={cx(phase.at === 'loading' && 'animate-spin')} />
        </IconButton>
        {/* Where the message below offers it, once is enough. */}
        {phase.at !== 'path' && phase.at !== 'refused' && phase.at !== 'nocookie' && (
          <Button size="sm" variant="ghost" aria-label="Open in a new tab" icon={<ExternalLink size={14} />} disabled={!!blocker} onClick={() => void openWebApp(app.id, undefined, 'preview')}>
            <span className={cx(session ? 'hidden' : 'max-sm:hidden')}>Open in a new tab</span>
          </Button>
        )}
      </div>}
      {pointing && !pointed && phase.at === 'ready' && <div className="shrink-0 border-b border-line bg-bg px-3 py-2 text-[13px] text-fg-2 sm:px-6">{tr('Tap a part of the app.')}</div>}
      {pointed && !session && (
        <form
          className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-bg px-3 py-2 sm:px-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (!say.trim()) return;
            askAgent(`${pointNote(pointed)}\n${say.trim()}`);
            setSay('');
            setPointed(null);
          }}
        >
          <span translate="no" className="flex min-w-0 max-w-full items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-[12.5px] text-accent">
            <span className="truncate">{pointNote(pointed)}</span>
            <button type="button" aria-label={tr('Clear')} className="shrink-0" onClick={() => setPointed(null)}>
              <X size={12} />
            </button>
          </span>
          <input className={cx(inputCls, 'h-8 min-w-[12rem] flex-1 text-[13px]')} aria-label={tr('What should change?')} placeholder={tr('What should change?')} value={say} onChange={(e) => setSay(e.target.value)} />
          <Button size="sm" variant="primary" type="submit" icon={<Send size={13} />} disabled={!say.trim()}>
            {tr('Ask the agent')}
          </Button>
        </form>
      )}
      <div className={cx('min-h-0 flex-1 bg-bg-1', phase.at === 'ready' && !narrow && !simple && 'p-3 sm:p-4')}>{body}</div>
    </div>
  );
}
