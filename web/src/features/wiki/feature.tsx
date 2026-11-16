// Per-chat choices use the wiki and memory settings instead of keeping a separate preference store.
import { useEffect, useState } from 'react';
import { BookOpen, Lightbulb } from 'lucide-react';
import type { SessionExtra } from '@shared/features';
import type { SessionSummary } from '@shared/types';
import { Switch } from '../../components/ui';
import { api, enc, patch } from '../../lib/api';
import { onFeatureEvent } from '../../lib/featureEvents';
import { toastError } from '../../lib/store';
import { useMemoryState } from '../memory/state';
import { useSpaces } from '../spaces/state';
import type { WebFeature } from '../registry';
import { wikiChatOptions, type WikiChatDefaults } from './chatOptions';
import { AutoLessonsNote } from './AutoLessonsNote';

/** Load fresh defaults when the options open and refresh when wiki settings change. */
function useWikiChatDefaults(): WikiChatDefaults | null {
  const [settings, setSettings] = useState<WikiChatDefaults | null>(null);
  useEffect(() => {
    let active = true;
    let generation = 0;
    // An older network response must not replace newer defaults.
    const load = () => {
      const current = ++generation;
      void api<WikiChatDefaults>('/api/wiki/settings').then((value) => { if (active && current === generation) setSettings(value); }).catch(() => { if (active && current === generation) setSettings(null); });
    };
    load();
    const off = onFeatureEvent('wiki-settings', load);
    return () => { active = false; off(); };
  }, []);
  return settings;
}

/** Show the same two switches on the start page and in an existing session. */
function WikiChatOptions({ value, onChange, session = false, cwd }: { value: SessionExtra; onChange: (patch: Partial<SessionExtra>) => void; session?: boolean; cwd?: string }) {
  const settings = useWikiChatDefaults();
  const memory = useMemoryState();
  const spaces = useSpaces();
  // Prefer an explicit project; otherwise follow the closest configured project folder.
  const project = spaces?.find((space) => space.id === value.space) ?? (cwd ? spaces?.filter((space) => space.folder && (cwd === space.folder || cwd.startsWith(`${space.folder}/`))).sort((a, b) => (b.folder?.length ?? 0) - (a.folder?.length ?? 0))[0] : undefined);
  const state = wikiChatOptions(settings, value, !!memory?.enabled, project?.wikiMemory);
  return (
    <>
      <div className="flex min-h-9 items-center gap-2 rounded-lg px-2.5 py-1.5 max-sm:min-h-11">
        <BookOpen size={14} className="shrink-0 text-fg-3" />
        <span className="min-w-0 flex-1 text-[13.5px] text-fg-2 max-sm:text-[14.5px]">LLM Wiki</span>
        <Switch on={state.wiki} disabled={!state.available} label="LLM Wiki for this chat" onChange={(on) => onChange({ wikiEnabled: on })} />
      </div>
      {session && state.wiki && <p className="px-2.5 pb-1 text-[11.5px] leading-snug text-fg-3">If LLM Wiki was enabled after the agent started, restart the agent to enable automatic checkpoints.</p>}
      <div className="flex min-h-9 items-center gap-2 rounded-lg px-2.5 py-1.5 max-sm:min-h-11" title={!state.lessonsAvailable ? 'Requires LLM Wiki and Memory for this chat' : 'Propose lessons automatically; saving requires confirmation'}>
        <Lightbulb size={14} className="shrink-0 text-fg-3" />
        <span className="min-w-0 flex-1 text-[13.5px] text-fg-2 max-sm:text-[14.5px]">Auto lessons learned</span>
        <Switch on={state.lessons} disabled={!state.lessonsAvailable} label="Auto lessons learned for this chat" onChange={(on) => onChange({ wikiAutoLessons: on })} />
      </div>
    </>
  );
}

/** Save an existing session override through the same extra-settings endpoint as Memory. */
function SessionOptions({ s }: { s: SessionSummary }) {
  return <WikiChatOptions session cwd={s.cwd} value={s.extra ?? {}} onChange={(change) => { void patch(`/api/sessions/${enc(s.key)}/extra`, change).catch(toastError); }} />;
}

export const wikiChatFeature: WebFeature = { id: 'wiki-chat', noteViews: { 'wiki-lessons': AutoLessonsNote }, StartOptions: WikiChatOptions, SessionOptions };
