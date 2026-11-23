// Accounts that are signed out when the app needs them (Claude Code, Codex, Grok Build or Antigravity CLI, with nothing else able to do the
// work). The server keeps the list (/api/accounts/sign-in) and tells every change on the event socket ({ t: 'signin' }).
import { create } from 'zustand';
import type { SignInNeed } from '@shared/types';
import { api } from '../../lib/api';

export const useSignIn = create<{
  needs: SignInNeed[];
  load: () => Promise<void>;
  set: (needs: SignInNeed[]) => void;
}>((set) => ({
  needs: [],
  load: async () => {
    const r = await api<{ needs: SignInNeed[] }>('/api/accounts/sign-in');
    set({ needs: r.needs ?? [] });
  },
  set: (needs) => set({ needs: needs ?? [] }),
}));

/** The need's account in the server's routes: `?account=<id>`, none for the program's own sign-in. */
export const needQuery = (n: Pick<SignInNeed, 'account'>) => (n.account ? `?account=${encodeURIComponent(n.account)}` : '');

/** The same account, as the lists and routes tell it apart. */
export const needId = (n: Pick<SignInNeed, 'agent' | 'account'>) => `${n.agent}:${n.account ?? ''}`;
