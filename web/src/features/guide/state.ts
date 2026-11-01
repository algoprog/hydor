// The guide's text in the page's language (English where a topic has no translation), fetched once a page:
// it changes only with the app, and a new language reloads the page.
import { create } from 'zustand';
import type { GuideResponse, GuideTopic } from '@shared/guide';
import { api } from '../../lib/api';
import { currentLang } from '../../i18n';

export const useGuide = create<{ topics: GuideTopic[] | null }>(() => ({ topics: null }));

let loading: Promise<GuideTopic[]> | null = null;

export function loadGuide(): Promise<GuideTopic[]> {
  const have = useGuide.getState().topics;
  if (have) return Promise.resolve(have);
  return (loading ??= api<GuideResponse>(`/api/guide?lang=${currentLang()}`)
    .then((r) => {
      useGuide.setState({ topics: r.topics });
      return r.topics;
    })
    .finally(() => (loading = null)));
}
