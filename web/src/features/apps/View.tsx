// An app's view in a page (shared/app-ui.ts): its pages drawn in the sandboxed frame with a run's answer (or, on
// the app's own page, what it keeps and its latest run), and what its events ask of the app done here: find and
// change its records, keep a tick, ask the run's agent, run one of its flows, run it again with changed answers,
// start another app, copy, open an address, say something. Only what `can` allows: a public page's view does
// nothing that reaches the app. A ready-made app's view is put in the app's language first.
import { useMemo, useState } from 'react';
import type { AppUi } from '@shared/app-ui';
import { translateUi } from '@shared/app-ui';
import { libsHead, type AppAsset } from '@shared/app-media';
import { openLightbox, openVideo } from '../../components/Lightbox';
import type { AnswerField, AppRun } from '@shared/apps';
import type { AppInfo } from '@shared/app-manifest';
import { api, enc, post, put } from '../../lib/api';
import { go } from '../../lib/nav';
import { toast, toastError } from '../../lib/store';
import { tr } from '../../i18n/runtime';
import { LOCALE } from '../../i18n/locale';
import { cx } from '../../components/ui';
import { appCall, memoryStore, PageFrame, type UiBridge } from '../pages/frame';
import { runPath } from './api';

/** What a view may ask of its app. */
export type ViewCan = 'keep' | 'ask' | 'run' | 'again' | 'start' | 'data';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** The page the view's kit draws in: the app's colours and font, no margin of its own (the page around it has one). */
const shell = (title: string, lang: string) =>
  `<!doctype html><html lang="${esc(lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title><style>body.n-page{padding:0 0 4px}</style></head><body class="n-page" data-n-fit><div id="n-ui" class="n-ui"></div></body></html>`;

/** A run as its view knows it: how it stands, not its session. */
const runOf = (r: AppRun) => ({ id: r.id, status: r.status, source: r.source, createdAt: r.createdAt, endedAt: r.endedAt ?? null, costUsd: r.costUsd ?? null, error: r.error ?? '' });

export function AppView({
  ui,
  name,
  description,
  appId,
  run,
  answer,
  view,
  last,
  on = 'run',
  can,
  start,
  translate,
  className,
  onAsked,
  publicView,
  info,
  assets,
}: {
  ui: AppUi;
  name: string;
  description?: string;
  /** Its app ("tpl:<id>" for a ready-made one run as it is, "test" for a try of changes not saved). */
  appId: string;
  /** The run it shows (a run's page). */
  run?: AppRun;
  answer: AnswerField[];
  /** What it keeps (for the run, or the app's own page). */
  view?: Record<string, unknown>;
  /** The app's own page: its latest run of its main flow. */
  last?: AppRun | null;
  on?: 'run' | 'app';
  can: ViewCan[];
  start?: string;
  /** A ready-made app's view: its words in the app's language. */
  translate?: boolean;
  className?: string;
  /** A follow-up went to the run's agent. */
  onAsked?: () => void;
  /** A public page's view: it reads nothing of the app either. */
  publicView?: boolean;
  /** The app's own page: its flows and lists, for the form, runs and chat elements (the App parts). */
  info?: AppInfo;
  /** Its own files, by name: what asset:<name> shows. */
  assets?: Record<string, Pick<AppAsset, 'sha'>>;
}) {
  const [height, setHeight] = useState(240);
  const lang = LOCALE ?? (typeof navigator !== 'undefined' ? navigator.language : 'en');
  const def = useMemo(() => (translate ? translateUi(ui, tr) : ui), [ui, translate]);
  const html = useMemo(() => shell(name, lang), [name, lang]);
  const store = useMemo(() => memoryStore(), []);
  // What it keeps: an app of yours, or a ready-made one ("tpl:<id>", its own page's records); not a try, nor a public page.
  const saved = appId !== 'test' && !publicView;
  // What changes while it is on screen: its run's status and answer (compared by what they hold, not by each new copy).
  const runKey = run ? JSON.stringify([run.id, run.status, run.result ?? null, run.inputs]) : '';
  const lastKey = last ? JSON.stringify([last.id, last.status, last.result ?? null]) : '';
  const ctx = useMemo(
    () => ({
      on,
      result: run?.result ?? {},
      inputs: run?.inputs ?? {},
      run: run ? runOf(run) : {},
      app: { name, description: description ?? '' },
      last: last ? { result: last.result ?? {}, inputs: last.inputs, run: runOf(last) } : {},
      view: view ?? {},
      answer,
      assets: assets ?? {},
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- by what they hold: a page that reloads its run sends new copies of the same
    [on, runKey, lastKey, name, description, JSON.stringify(answer), JSON.stringify(assets ?? {})],
  );
  // What its widgets import, from jsDelivr: an import map, and the stylesheets among them.
  const libs = useMemo(() => (def.libs ? libsHead(def.libs) : undefined), [def]);
  const allowed = useMemo(() => new Set(can), [can.join(',')]);
  const onOp = async (op: string, a: Record<string, unknown>): Promise<unknown> => {
    const need = (what: ViewCan) => {
      if (!allowed.has(what)) throw new Error(tr('This can’t be done here.'));
    };
    const text = (v: unknown, max = 20_000) => String(v ?? '').slice(0, max);
    try {
      switch (op) {
        case 'find':
          if (!saved) return { records: [], count: 0 };
          return await appCall(appId, 'find', a);
        case 'data': {
          need('data');
          if (!saved) throw new Error(tr('Only an app of your own keeps records.'));
          const kind = a.op === 'add' ? 'add' : a.op === 'update' ? 'update' : a.op === 'remove' ? 'remove' : null;
          if (!kind) throw new Error('add, update or remove');
          return await appCall(appId, kind, kind === 'update' ? { collection: a.collection, id: a.id, set: a.record } : a);
        }
        case 'keep': {
          need('keep');
          const body = { name: text(a.name, 250), value: a.value ?? null };
          // The app's own page keeps it with the app, a ready-made one's too (Explore's stories read).
          if (on === 'app') return appId !== 'test' && !publicView ? (await put<{ view: unknown }>(`/api/apps/${enc(appId)}/view`, body)).view : null;
          return run ? (await put<{ view: unknown }>(`/api/apps/runs/${enc(run.id)}/view`, body)).view : null;
        }
        case 'ask': {
          need('ask');
          if (!run) throw new Error(tr('There is no run to ask about.'));
          await post(`/api/apps/runs/${enc(run.id)}/ask`, { text: text(a.text) });
          toast(tr('Sent to its agent: the answer changes when it replies'), 'ok');
          onAsked?.();
          return null;
        }
        case 'run': {
          need('run');
          const r = await post<{ run: AppRun }>(`/api/apps/${enc(appId)}/runs`, { flow: typeof a.flow === 'string' ? a.flow : 'run', inputs: a.inputs && typeof a.inputs === 'object' ? a.inputs : {}, source: 'screen' });
          return { id: r.run.id, status: r.run.status, result: r.run.result ?? null, error: r.run.error ?? '' };
        }
        case 'again': {
          need('again');
          if (!run) throw new Error(tr('There is no run to run again.'));
          const r = await post<{ run: AppRun }>(`/api/apps/runs/${enc(run.id)}/again`, { inputs: a.inputs && typeof a.inputs === 'object' ? a.inputs : {} });
          go(runPath(r.run.id));
          return null;
        }
        case 'start': {
          need('start');
          const want = text(a.app, 120).trim();
          if (!want) throw new Error(tr('Name the app to start'));
          // An app of yours by its id or address; else a ready-made one by its id.
          const target = want.startsWith('tpl:') ? want : await api(`/api/apps/${enc(want)}`).then(() => want, () => `tpl:${want}`);
          const r = await post<{ run: AppRun }>(`/api/apps/${enc(target)}/runs`, { inputs: a.inputs && typeof a.inputs === 'object' ? a.inputs : {} });
          go(runPath(r.run.id));
          return null;
        }
        case 'copy': {
          await navigator.clipboard.writeText(text(a.text, 200_000));
          toast(tr('Copied'), 'ok');
          return null;
        }
        case 'open': {
          const url = text(a.url, 2000).trim();
          if (url.startsWith('/') && !url.startsWith('//')) go(url);
          else if (/^https?:\/\//i.test(url)) window.open(url, '_blank', 'noopener,noreferrer');
          else throw new Error(tr('That is not an address to open'));
          return null;
        }
        case 'say':
          if (a.text) toast(text(a.text, 300), a.error ? 'error' : 'info');
          return null;
        case 'media': {
          // A video from YouTube or Vimeo: played over the page (their players cannot run inside the view's sandbox).
          if (typeof a.video === 'string') {
            openVideo(a.video, text(a.title, 200));
            return null;
          }
          // A picture opened large, with the others beside it: those kept here (this page loads nothing from other
          // sites); one on the web opens there.
          const all = (Array.isArray(a.images) ? a.images : []).slice(0, 200).map((x) => ({ src: String((x as { src?: unknown })?.src ?? ''), name: String((x as { name?: unknown })?.name ?? '').slice(0, 200) }));
          const here = (u: string) => {
            try {
              return /^data:image\//i.test(u) || new URL(u).origin === location.origin;
            } catch {
              return false;
            }
          };
          const at = all[Math.min(Math.max(0, Number(a.at) || 0), Math.max(0, all.length - 1))];
          if (!at) return null;
          if (!here(at.src)) {
            if (/^https?:\/\//i.test(at.src)) window.open(at.src, '_blank', 'noopener,noreferrer');
            return null;
          }
          const list = all.filter((x) => here(x.src));
          openLightbox(list, Math.max(0, list.indexOf(at)));
          return null;
        }
        default:
          throw new Error('That is not something a view can do');
      }
    } catch (e) {
      toastError(e);
      throw e;
    }
  };
  const bridge: UiBridge = { def, ctx, can: [...allowed], appId: appId.startsWith('tpl:') ? appId.slice(4) : appId, start, lang, onOp, ...(libs ? { libs } : {}) };
  return (
    <div style={{ height: Math.max(height, 40) }} className={cx('relative', className)}>
      <PageFrame html={html} title={name} store={store} onHeight={setHeight} ui={bridge} app={info ? { info } : undefined} className="!bg-transparent" />
    </div>
  );
}
