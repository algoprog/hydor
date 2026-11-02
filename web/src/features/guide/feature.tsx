// The guide (Help, /guide) and the agents' tools beside it: app_guide (reading the guide), app_api (looking at
// or changing the app for the user, who confirms changes on a card) and ask_form (a form in the conversation).
// They show as plain steps among the agent's work; the cards are the session's own approval cards. An agent
// can also switch the settings kept on this device (theme, language…) of the pages showing its session.
import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { isLang } from '@shared/i18n';
import type { ToolInfo, ToolItem } from '@shared/types';
import { cx } from '../../components/ui';
import { onFeatureEvent } from '../../lib/featureEvents';
import { setNotifyPrefs } from '../../lib/notify';
import { useUI } from '../../lib/store';
import { allThemes, applyTheme, pickTheme } from '../../lib/theme';
import { setLang, currentLang } from '../../i18n';
import { ToolDetail, ToolLine } from '../session/items';
import type { WebFeature } from '../registry';
import { GuidePage } from './GuidePage';
import { useGuide } from './state';

const running = (t: ToolInfo) => t.status === 'running' || t.status === 'pending';
const arg = (t: ToolInfo, k: string) => {
  const v = (t.input as Record<string, unknown> | undefined)?.[k];
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
};

/** A step as the others look: its line, opening to what it sent and got. */
function StepRow({ item, sessionKey }: { item: ToolItem; sessionKey: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="tl-item">
      <button onClick={() => setOpen((o) => !o)} className={cx('group flex min-h-8 w-full items-center gap-2.5 rounded-lg px-2 py-1 text-left transition-colors hover:bg-bg-2', open && 'bg-bg-2')}>
        <ToolLine item={item} />
        <ChevronRight size={14} className={cx('shrink-0 text-fg-3 opacity-0 transition group-hover:opacity-100', open && 'rotate-90 opacity-100')} />
      </button>
      {open && <ToolDetail t={item.tool} item={item} sessionKey={sessionKey} />}
    </div>
  );
}

const topicTitle = (id?: string) => (id ? (useGuide.getState().topics?.find((x) => x.id === id)?.title ?? id) : undefined);

function guideStep(t: ToolInfo) {
  const q = arg(t, 'query');
  const what = q ? `“${q}”` : (topicTitle(arg(t, 'topic')) ?? 'its contents');
  return { category: 'read' as const, verb: running(t) ? 'Reading the guide' : 'Read the guide', title: what };
}

function apiStep(t: ToolInfo) {
  const method = (arg(t, 'method') ?? 'GET').toUpperCase();
  const path = arg(t, 'path') ?? '';
  if (method === 'GET') return { category: 'read' as const, verb: running(t) ? 'Looking in the app' : 'Looked in the app', title: path.replace(/^\/api\//, '').split('?')[0] };
  const summary = arg(t, 'summary');
  if (path === '/device') return { category: 'other' as const, verb: running(t) ? 'Changing this device’s settings' : 'Changed this device’s settings', title: summary };
  return { category: 'edit' as const, verb: running(t) ? 'Changing the app' : t.status === 'error' ? 'App not changed' : 'Changed the app', title: summary ?? `${method} ${path}` };
}

function formStep(t: ToolInfo) {
  return { category: 'question' as const, verb: running(t) ? 'Asking you' : 'Asked you', title: arg(t, 'title') };
}

// Settings kept on this device, as an agent set them for the pages showing its session.
interface DeviceSettings {
  theme?: 'dark' | 'light' | 'system';
  themeName?: string;
  language?: string;
  sound?: boolean;
  enter?: 'join' | 'queue';
  terminalSuggestions?: boolean;
  sidebar?: boolean;
  groupSessions?: boolean;
}

onFeatureEvent('guide', (e) => {
  const d = (e.data as { device?: DeviceSettings } | undefined)?.device;
  if (!d) return;
  const ui = useUI.getState();
  if (d.theme) ui.set({ theme: d.theme });
  if (d.themeName) {
    const name = d.themeName.toLowerCase();
    const t = allThemes().find((x) => x.name.toLowerCase() === name || x.id === name);
    if (t) pickTheme(t);
  }
  if (d.theme || d.themeName) applyTheme();
  if (d.sound !== undefined) setNotifyPrefs({ sound: d.sound });
  if (d.enter)
    try {
      localStorage.setItem('wa.followUp', d.enter === 'queue' ? 'queue' : 'steer');
    } catch {}
  if (d.terminalSuggestions !== undefined) ui.set({ termSuggest: d.terminalSuggestions });
  if (d.sidebar !== undefined) ui.set({ sideOpen: d.sidebar });
  if (d.groupSessions !== undefined) ui.set({ groupByFolder: d.groupSessions });
  // Last: switching the language reloads the page.
  if (d.language && isLang(d.language) && d.language !== currentLang()) setLang(d.language);
});

export const guideFeature: WebFeature = {
  id: 'guide',
  routes: [{ match: (p) => p === '/guide' || p.startsWith('/guide/'), Page: GuidePage }],
  toolViews: {
    app_guide: { place: 'work', Row: StepRow, step: guideStep },
    app_api: { place: 'work', Row: StepRow, step: apiStep },
    ask_form: { place: 'work', Row: StepRow, step: formStep },
  },
};
