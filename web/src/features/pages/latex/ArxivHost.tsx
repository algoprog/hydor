// The arXiv package's dialog, wherever it is asked for (arxivAsk.ts): on every page, loaded the first time.
import { lazy, Suspense } from 'react';
import { useArxivAsk } from './arxivAsk';

const ArxivDialog = lazy(() => import('./ArxivDialog').then((m) => ({ default: m.ArxivDialog })));

export function ArxivHost() {
  const ask = useArxivAsk((s) => s.ask);
  if (!ask) return null;
  return (
    <Suspense fallback={null}>
      <ArxivDialog key={ask.n} page={ask.page} version={ask.version} />
    </Suspense>
  );
}
