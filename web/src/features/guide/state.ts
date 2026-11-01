// The guide's text, fetched once a page (it changes only with the app).
import { create } from 'zustand';
import type { GuideResponse, GuideTopic } from '@shared/guide';
import { api } from '../../lib/api';

export const useGuide = create<{ topics: GuideTopic[] | null }>(() => ({ topics: null }));

let loading: Promise<GuideTopic[]> | null = null;

export function loadGuide(): Promise<GuideTopic[]> {
  const have = useGuide.getState().topics;
  if (have) return Promise.resolve(have);
  return (loading ??= api<GuideResponse>('/api/guide')
    .then((r) => {
      useGuide.setState({ topics: r.topics });
      return r.topics;
    })
    .finally(() => (loading = null)));
}
