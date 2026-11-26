// The guide (Help, /guide) and the agents' tools beside it: app_guide (reading the guide), app_api (looking at
// or changing the app for the user, who confirms changes on a card) and ask_form (a form in the conversation).
// They show as plain steps among the agent's work; the cards are the session's own approval cards. An agent
// can also switch the settings kept on this device (theme, language…) of the pages showing its session.
import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { DeviceSettings } from '@shared/device';
import { validZoom } from '@shared/zoom';
import { isLang } from '@shared/i18n';
import type { ToolInfo, ToolItem } from '@shared/types';
import { cx } from '../../components/ui';
import { onFeatureEvent } from '../../lib/featureEvents';
import { deviceNews, setNotifyPrefs } from '../../lib/notify';
import { useUI } from '../../lib/store';
import { allThemes, applyTheme, pickTheme } from '../../lib/theme';
import { setLang, currentLang } from '../../i18n';
import { ToolDetail, ToolLine } from '../session/items';
import { useVoicePrefs } from '../voice/prefs';
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

// Settings kept on this device, as an agent set them for the pages showing its session (shared/device.ts).
type DeviceChange = Partial<DeviceSettings> & { themeName?: string };

onFeatureEvent('guide', (e) => {
  const d = (e.data as { device?: DeviceChange } | undefined)?.device;
  if (!d) return;
  const ui = useUI.getState();
  if (d.theme) ui.set({ theme: d.theme });
  if (d.themeName) {
    const name = d.themeName.toLowerCase();
    const t = allThemes().find((x) => x.name.toLowerCase() === name || x.id === name);
    if (t) pickTheme(t);
  }
  if (d.theme || d.themeName) applyTheme();
  if (d.motion) ui.set({ motion: d.motion });
  if (d.textSize) ui.set({ textSize: d.textSize });
  if (d.zoom !== undefined) ui.set({ convZoom: validZoom(d.zoom / 100) });
  if (d.sound !== undefined) setNotifyPrefs({ sound: d.sound });
  if (d.enter) {
    try {
      localStorage.setItem('wa.followUp', d.enter === 'queue' ? 'queue' : 'steer');
    } catch {}
    deviceNews();
  }
  if (d.terminalSuggestions !== undefined) ui.set({ termSuggest: d.terminalSuggestions });
  if (d.wordSuggestions !== undefined) ui.set({ wordSuggestions: d.wordSuggestions });
  if (d.technicalDetails !== undefined) ui.set({ technicalDetails: d.technicalDetails });
  if (d.sidebar !== undefined) ui.set({ sideOpen: d.sidebar });
  if (d.groupSessions !== undefined) ui.set({ groupByFolder: d.groupSessions });
  // Voice: the language spoken, how dictation listens, the voice and speed replies are read in.
  const voice = useVoicePrefs.getState();
  if (d.voiceLanguage !== undefined) voice.set({ lang: d.voiceLanguage });
  if (d.dictation) voice.set({ use: d.dictation });
  if (d.readingSpeed !== undefined) voice.set({ rate: d.readingSpeed });
  if (d.readingVoice !== undefined) {
    const want = d.readingVoice.toLowerCase();
    const v = want && typeof speechSynthesis !== 'undefined' ? speechSynthesis.getVoices().find((x) => x.name.toLowerCase() === want || x.voiceURI.toLowerCase() === want) : undefined;
    if (!want || v) voice.set({ voice: v ? v.voiceURI : '' });
  }
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
