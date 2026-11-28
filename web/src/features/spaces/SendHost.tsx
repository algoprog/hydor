// Send to another machine, opened from anywhere in the app (a project's menu, its page). One dialog for the whole app
// (the shell holds it), loaded the first time it opens; it stays open as long as the person leaves it.
import { lazy, Suspense } from 'react';
import { create } from 'zustand';
import type { Space } from '@shared/spaces';

const SendDialog = lazy(() => import('./SendDialog').then((m) => ({ default: m.SendDialog })));

const useOpen = create<{ space: Pick<Space, 'id' | 'name'> | null }>(() => ({ space: null }));

/** Opens Send to another machine for a project. */
export const openSendDialog = (s: Pick<Space, 'id' | 'name'>) => useOpen.setState({ space: s });

/** The dialog, wherever it was opened from. */
export function SendDialogHost() {
  const s = useOpen((x) => x.space);
  if (!s) return null;
  return (
    <Suspense fallback={null}>
      <SendDialog key={s.id} space={s} onClose={() => useOpen.setState({ space: null })} />
    </Suspense>
  );
}
