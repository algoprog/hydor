// A template's main screen, on its page in place of its form: the screen's page (Pages keeps it) in a frame
// with window.naget.app for this template, so its App parts run its flows and keep its data. It follows the
// page as it changes (an agent's new version, an edit in Pages).
import { useEffect, useMemo, useState } from 'react';
import type { AppDef } from '@shared/apps';
import { appInfo } from '@shared/app-manifest';
import { api, enc } from '../../lib/api';
import { useFeatureEvent } from '../../lib/featureEvents';
import { Empty, Throbber } from '../../components/ui';
import { pageStore, PageFrame } from '../pages/frame';

export function AppScreen({ app }: { app: AppDef }) {
  const page = app.screens?.main?.page;
  const [html, setHtml] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [err, setErr] = useState('');
  const load = () => {
    if (!page) return;
    api<{ html?: string; page: { version: number } }>(`/api/pages/${enc(page)}`).then(
      (r) => {
        setHtml(r.html ?? '');
        setVersion(r.page.version);
        setErr('');
      },
      (e) => setErr((e as Error).message),
    );
  };
  useEffect(load, [page]);
  useFeatureEvent('pages', ({ data: e }) => (e as { what?: string })?.what === 'pages' && load());
  const store = useMemo(() => (page ? pageStore(page) : null), [page]);
  const bridge = useMemo(() => ({ info: appInfo(app.id, app) }), [app]);
  if (err) return <Empty title="Its screen could not be opened">{err}</Empty>;
  if (!page || html === null || !store)
    return (
      <div className="flex justify-center py-20 text-fg-3">
        <Throbber size={28} />
      </div>
    );
  return <PageFrame key={`${page}:${version}`} html={html} title={app.name} store={store} app={bridge} fill />;
}
