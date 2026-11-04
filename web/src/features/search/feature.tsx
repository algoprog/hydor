// Web search: Naget Search and other providers. The sources a reply cites show with the reply (components/Citations.tsx).
import { Globe } from 'lucide-react';
import type { ToolInfo } from '@shared/types';
import { siteOf } from '@shared/search';
import type { WebFeature } from '../registry';
import { StepRow } from '../automations/StepRow';
import { SearchSettings } from './SearchSettings';
import { ReadRow, SearchRow } from './views';

const running = (t: ToolInfo) => t.status === 'running' || t.status === 'pending';
const arg = (t: ToolInfo, k: string) => {
  const v = (t.input as Record<string, unknown> | undefined)?.[k];
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
};

export const searchFeature: WebFeature = {
  id: 'search',
  // Steps of the agent's work: they fold with the others (counted as web searches).
  toolViews: {
    web_search: {
      place: 'work',
      Row: SearchRow,
      step: (t) => ({ category: 'web', verb: running(t) ? 'Searching the web' : 'Searched the web', title: arg(t, 'query') ?? arg(t, 'q') }),
    },
    read_page: {
      place: 'work',
      Row: ReadRow,
      step: (t) => {
        const url = arg(t, 'url');
        return { category: 'web', verb: running(t) ? 'Reading' : 'Read', title: url ? siteOf(url) : undefined };
      },
    },
    // Pictures (and videos) for a list of things: "Found pictures · video game".
    find_media: {
      place: 'work',
      Row: StepRow,
      step: (t) => {
        const input = (t.input ?? {}) as Record<string, unknown>;
        const videos = !!input.videos && input.videos !== 'false';
        const verb = !videos ? (running(t) ? 'Finding pictures' : 'Found pictures') : input.pictures === false ? (running(t) ? 'Finding videos' : 'Found videos') : running(t) ? 'Finding pictures and videos' : 'Found pictures and videos';
        return { category: 'web', verb, title: arg(t, 'kind') };
      },
    },
  },
  settings: [{ id: 'search', label: 'Search', icon: Globe, sub: 'How agents search the web: Naget Search and other providers', Body: SearchSettings }],
};
