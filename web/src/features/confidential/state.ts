// What a confidential session can use here (GET /api/confidential): the models on this computer, the best first,
// whether its commands can be cut off from the network, and whether the helper model runs here (else titles come
// from the first words). Asked once a page load, and again whenever the models change.
import { useEffect } from 'react';
import { create } from 'zustand';
import { isConfidential } from '@shared/confidential';
import type { SessionSummary } from '@shared/types';
import { api } from '../../lib/api';
import { live } from '../../lib/ws';

export interface ConfidentialInfo {
  /** Custom's models on this computer or your network, the best first. */
  models: string[];
  /** Commands run without network here (bubblewrap); else each one asks. */
  sandbox: boolean;
  /** The helper model runs here, so it names confidential sessions. */
  helper: boolean;
}

const useInfo = create<{ info: ConfidentialInfo | null }>(() => ({ info: null }));
let asked = false;

const load = () =>
  api<ConfidentialInfo>('/api/confidential').then(
    (info) => useInfo.setState({ info }),
    () => (asked = false),
  );

export function useConfidentialInfo(): ConfidentialInfo | null {
  const info = useInfo((s) => s.info);
  useEffect(() => {
    if (asked) return;
    asked = true;
    void load();
    live.on((e) => e.t === 'models' && void load());
  }, []);
  return info;
}

/** Whether a session is confidential. */
export const confidentialSession = (s?: Pick<SessionSummary, 'extra'> | null) => isConfidential(s?.extra);
