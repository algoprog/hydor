// Share with people, opened from anywhere in the app: a project (its page's menu, its card, its overview), or one thing
// of the Library (a page's Share menu, a picture's, video's or sound's page, a card's menu). One dialog for the whole
// app (the shell holds it), loaded the first time it opens. useSharedThings says which things are shared, and with how
// many people, for the marks the Library shows on them.
import { lazy, Suspense, useEffect } from 'react';
import { create } from 'zustand';
import type { Space } from '@shared/spaces';
import type { ShareThing } from '@shared/share';
import { api } from '../../lib/api';
import { onFeatureEvent } from '../../lib/featureEvents';
import type { ShareTarget } from './ShareDialog';

const ShareDialog = lazy(() => import('./ShareDialog').then((m) => ({ default: m.ShareDialog })));

const useOpen = create<{ target: ShareTarget | null }>(() => ({ target: null }));

/** Opens Share with people for a project or a thing. */
export const openShare = (t: ShareTarget) => useOpen.setState({ target: t });

/** Opens Share with people for a project. */
export const openShareDialog = (s: Pick<Space, 'id' | 'name'>) => openShare({ kind: 'project', space: s });

/** The dialog, wherever it was opened from. */
export function ShareDialogHost() {
  const t = useOpen((x) => x.target);
  if (!t) return null;
  return (
    <Suspense fallback={null}>
      <ShareDialog target={t} onClose={() => useOpen.setState({ target: null })} />
    </Suspense>
  );
}

// ---- which things are shared ---------------------------------------------------------------------------------

type Shared = Map<string, number>;
const useThings = create<{ things: Shared | null }>(() => ({ things: null }));
let loading = false;
let listening = false;

function load() {
  if (loading) return;
  loading = true;
  api<{ things: (ShareThing & { people: number })[] }>('/api/shares')
    .then((r) => useThings.setState({ things: new Map(r.things.map((t) => [`${t.kind}:${t.id}`, t.people])) }))
    .catch(() => {})
    .finally(() => (loading = false));
}

/** How many people each thing shared alone is shared with now (none: not shared), kept up to date with the server's news. */
export function useSharedThings(): (kind: ShareThing['kind'], id: string) => number {
  const things = useThings((x) => x.things);
  useEffect(() => {
    // Once for the app: the list is the same wherever it is shown.
    if (!listening) {
      listening = true;
      onFeatureEvent('sharing', () => load());
    }
    if (!useThings.getState().things) load();
  }, []);
  return (kind, id) => things?.get(`${kind}:${id}`) ?? 0;
}
