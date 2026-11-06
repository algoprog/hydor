// Where the editors' AI tools show: on every page (Shell), over everything else (their dialogs go to <body>, as
// full-window layers must: pages are stacking contexts). Their code loads the first time one is asked for. Should
// two hosts be on a page (one of the app's, one a page made for itself), only the first shows them.
import { lazy, Suspense, useEffect, useState } from 'react';
import { create } from 'zustand';
import { useStudio } from './store';

const Dialogs = lazy(() => import('./Dialogs'));

const useHosts = create<{ ids: number[] }>(() => ({ ids: [] }));
let hostSeq = 0;

/** Whether a host is on the page now. */
export const hostsMounted = () => useHosts.getState().ids.length > 0;

export function StudioHost() {
  const [id] = useState(() => ++hostSeq);
  const first = useHosts((s) => s.ids[0] === id);
  const ask = useStudio((s) => s.ask);
  useEffect(() => {
    useHosts.setState((s) => ({ ids: [...s.ids, id] }));
    return () => useHosts.setState((s) => ({ ids: s.ids.filter((x) => x !== id) }));
  }, [id]);
  if (!first || !ask) return null;
  return (
    <Suspense fallback={null}>
      <Dialogs key={ask.n} ask={ask} />
    </Suspense>
  );
}
