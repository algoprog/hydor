// An app's public page (/a/<slug>): anyone with the link fills the form and sees the answer, without
// signing in. It shows the app's face and form, the visitor's run as it goes, and their earlier runs
// (told apart by a cookie). What a visitor may see is decided by the server (server/apps/public.ts).
import { useEffect, useRef, useState } from 'react';
import { ChevronRight, Play } from 'lucide-react';
import type { AnswerField, AppField, AppRun, RunProgress } from '@shared/apps';
import type { AppUi } from '@shared/app-ui';
import { inputsLine, isActive } from '@shared/apps';
import { applyTheme } from '../../lib/theme';
import { timeAgo } from '../../lib/format';
import { Logo } from '../../components/Logo';
import { Button, cx, Throbber } from '../../components/ui';
import { AppIcon } from './AppIcon';
import { AppForm, formErrors, initialValues, type FormFiles, type FormValues } from './Form';
import { RunBody } from './Result';
import { AppView } from './View';
import { Lightbox, VideoBox } from '../../components/Lightbox';

interface PublicApp {
  slug: string;
  name: string;
  icon: string;
  color: string;
  description: string;
  fields: AppField[];
  answer: AnswerField[];
  /** Its view, as a public page shows it (only what a click does on the page itself). */
  ui?: AppUi;
  /** Its own files, by name (what asset:<name> shows). */
  assets?: Record<string, { sha: string }>;
}

async function call<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(path, body === undefined ? { credentials: 'same-origin' } : { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(data?.error ?? `Something went wrong (${r.status})`);
  return data as T;
}

export default function PublicAppPage({ slug }: { slug: string }) {
  const [app, setApp] = useState<PublicApp | null>(null);
  const [err, setErr] = useState('');
  const [runs, setRuns] = useState<AppRun[]>([]);
  const [values, setValues] = useState<FormValues>({});
  const [files, setFiles] = useState<FormFiles>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [sendErr, setSendErr] = useState('');
  const [shown, setShown] = useState<{ run: AppRun; progress?: RunProgress } | null>(null);
  const top = useRef<HTMLDivElement>(null);
  const base = `/a-api/${encodeURIComponent(slug)}`;

  useEffect(() => {
    applyTheme();
    call<{ app: PublicApp; runs: AppRun[] }>(base).then(
      (r) => {
        setApp(r.app);
        setRuns(r.runs);
        setValues(initialValues(r.app.fields));
        document.title = r.app.name;
        // A run still going when the page was left picks up again.
        const going = r.runs.find((x) => isActive(x.status));
        if (going) setShown({ run: going });
      },
      (e) => setErr((e as Error).message),
    );
  }, [slug]);

  // While the shown run works, ask how it is going.
  const id = shown?.run.id;
  const active = shown ? isActive(shown.run.status) : false;
  useEffect(() => {
    if (!id || !active) return;
    let stop = false;
    const tick = () =>
      call<{ run: AppRun; progress: RunProgress }>(`${base}/run/${encodeURIComponent(id)}`).then(
        (r) => {
          if (stop) return;
          setShown(r);
          setRuns((l) => l.map((x) => (x.id === r.run.id ? r.run : x)));
        },
        () => {},
      );
    tick();
    const t = setInterval(tick, 2500);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [id, active]);

  const send = async () => {
    if (!app) return;
    const e = formErrors(app.fields, values, files);
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    setSendErr('');
    try {
      const r = await call<{ run: AppRun }>(`${base}/run`, { inputs: values, files: Object.fromEntries(Object.entries(files).map(([k, f]) => [k, { name: f.name, data: f.data }])) });
      setRuns((l) => [r.run, ...l]);
      setShown({ run: r.run });
      requestAnimationFrame(() => document.getElementById('the-run')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    } catch (x) {
      setSendErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (err)
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-bg px-6 text-center">
        <Logo size={34} />
        <div className="text-[16px] font-semibold">This page is not open</div>
        <div className="max-w-sm text-[13.5px] text-fg-3">{err}</div>
      </div>
    );
  if (!app)
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg text-fg-3">
        <Throbber size={30} />
      </div>
    );

  const going = runs.some((r) => isActive(r.status));
  return (
    <div ref={top} className="h-full overflow-y-auto bg-bg pt-[var(--safe-top)] pb-[max(24px,var(--safe-bottom))]">
      {/* A picture its view opens large, or a video from YouTube or Vimeo. */}
      <Lightbox />
      <VideoBox />
      <div className="mx-auto max-w-[720px] px-4 sm:px-6">
        <header className="flex items-start gap-3.5 pt-8 pb-5 sm:pt-12">
          <AppIcon icon={app.icon} color={app.color} size={52} />
          <div className="min-w-0 flex-1 pt-0.5">
            <h1 className="text-[21px] leading-tight font-semibold tracking-tight sm:text-[24px]">{app.name}</h1>
            {app.description && <p className="mt-1 text-[14px] leading-relaxed text-fg-2">{app.description}</p>}
          </div>
        </header>

        <section className="rounded-[20px] border border-line bg-panel p-4 shadow-[0_8px_30px_rgba(0,0,0,0.06)] sm:p-5">
          <AppForm
            fields={app.fields}
            values={values}
            files={files}
            errors={errors}
            disabled={busy}
            maxMb={3}
            onChange={(k, v) => (setValues((x) => ({ ...x, [k]: v })), errors[k] && setErrors((e) => ({ ...e, [k]: '' })))}
            onFile={(k, v) =>
              setFiles((x) => {
                const n = { ...x };
                if (v) n[k] = v;
                else delete n[k];
                return n;
              })
            }
          />
          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-4">
            <div className={cx('min-w-0 flex-1 text-[12.5px]', sendErr ? 'text-err' : 'text-fg-3')}>{sendErr || (going ? 'Your last run is still going.' : 'It takes a minute or two.')}</div>
            <Button variant="primary" icon={busy ? <Throbber /> : <Play size={14} fill="currentColor" />} onClick={send} disabled={busy || going} className="h-10 px-5 max-sm:w-full">
              {busy ? 'Sending…' : 'Run'}
            </Button>
          </div>
        </section>

        {shown && (
          <div id="the-run" className="mt-5 scroll-mt-4">
            <RunBody
              assets={app.assets}
              run={shown.run}
              progress={shown.progress}
              answer={app.answer}
              publicView
              name={app.name}
              view={app.ui ? <AppView ui={app.ui} name={app.name} appId="public" run={shown.run} answer={app.answer} can={[]} publicView assets={app.assets} /> : undefined}
            />
          </div>
        )}

        {runs.filter((r) => r.id !== shown?.run.id).length > 0 && (
          <section className="mt-8">
            <h2 className="mb-2 px-1 text-[13px] font-medium text-fg-3">Your earlier runs</h2>
            <div className="overflow-hidden rounded-2xl border border-line bg-panel">
              {runs
                .filter((r) => r.id !== shown?.run.id)
                .map((r) => (
                  <button key={r.id} type="button" onClick={() => (setShown({ run: r }), requestAnimationFrame(() => document.getElementById('the-run')?.scrollIntoView({ behavior: 'smooth' })))} className="flex w-full items-center gap-3 border-b border-line px-4 py-3 text-left last:border-0 active:bg-bg-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px]">{inputsLine(app.fields, r.inputs, 80) || app.name}</span>
                      <span className="block text-[12px] text-fg-3">
                        {timeAgo(r.createdAt)} ago · {r.status === 'done' ? 'Done' : isActive(r.status) ? 'Working' : 'Did not finish'}
                      </span>
                    </span>
                    <ChevronRight size={15} className="shrink-0 text-fg-3" />
                  </button>
                ))}
            </div>
          </section>
        )}

        <footer className="mt-10 flex items-center justify-center gap-2 text-[12px] text-fg-3">
          <Logo size={16} />
          Made with Hydor · answers can be wrong, so check what matters
        </footer>
      </div>
    </div>
  );
}
