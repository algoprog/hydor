// Lean, the proof checker, for agents: set up when the person agrees (setup.ts), tools to check, verify and search
// (tools.ts), and the `leancheck` command on agents' PATH (server/shelltools), which finds the app's own Lean through
// HYDOR_LEAN_DIR.
//   GET    /api/lean         how it stands (LeanState)
//   POST   /api/lean/setup   { mathlib? } sets Lean up, and adds Mathlib when asked (the app asks GET again while it installs)
//   DELETE /api/lean         removes the app's own Lean and Mathlib (?mathlib=1: Mathlib alone); your own Lean stays
import type { LeanSetupAsk } from '../../shared/lean.ts';
import { HttpError } from '../auth.ts';
import type { Feature } from '../features/types.ts';
import { leanDir, leanState, removeLean, setupLean } from './setup.ts';
import { LEAN_GUIDE, leanTools } from './tools.ts';

export const lean: Feature = {
  id: 'lean',

  routes({ app }) {
    app.get('/api/lean', async () => leanState());
    app.post('/api/lean/setup', async (req) => {
      const { mathlib } = (req.body ?? {}) as LeanSetupAsk;
      const s = leanState();
      if (!s.ready && !s.installing && !s.canInstall) throw new HttpError(400, s.why ?? 'Lean can’t be set up on this computer.');
      void setupLean({ mathlib: mathlib === true });
      return leanState();
    });
    app.delete('/api/lean', async (req) => {
      const q = (req.query ?? {}) as { mathlib?: string };
      await removeLean({ mathlib: q.mathlib === '1' || q.mathlib === 'true' });
      return leanState();
    });
  },

  tools: () => leanTools,

  spawn(s) {
    // A session that works in one browser tab has no shell and checks no proofs.
    if (s.extra?.browserOnly) return undefined;
    return {
      env: { HYDOR_LEAN_DIR: leanDir() },
      guides: [{ tools: ['lean_check', 'lean_verify', 'lean_search'], text: LEAN_GUIDE }],
    };
  },
};
