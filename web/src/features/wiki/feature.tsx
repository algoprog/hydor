// Per-chat choices use the wiki and memory settings instead of keeping a separate preference store.
import { useEffect, useState } from 'react';
import { BookOpen, ChevronDown, ChevronRight } from 'lucide-react';
import { WIKI_FEATURES, WIKI_FEATURE_LABELS, type WikiFeature } from '@shared/wiki-controls';
import type { SessionExtra } from '@shared/features';
import type { SessionSummary } from '@shared/types';
import { Switch } from '../../components/ui';
import { api, enc, patch } from '../../lib/api';
import { go } from '../../lib/nav';
import { onFeatureEvent } from '../../lib/featureEvents';
import { toastError } from '../../lib/store';
import { useMemoryState } from '../memory/state';
import { useSpaces } from '../spaces/state';
import type { WebFeature } from '../registry';
import { wikiChatOptions, wikiFeatureChange, type WikiChatDefaults } from './chatOptions';
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
function WikiChatOptions({ value, onChange, session = false, sessionKey, cwd }: { value: SessionExtra; onChange: (patch: Partial<SessionExtra>) => void; session?: boolean; sessionKey?: string; cwd?: string }) {
  const [expanded, setExpanded] = useState(false);
  const settings = useWikiChatDefaults();
  const memory = useMemoryState();
  const spaces = useSpaces();
  const [resolved, setResolved] = useState<{ space: string | null } | null>(null);
  useEffect(() => {
    let active = true;
    setResolved(null);
    const query = new URLSearchParams(sessionKey ? { session: sessionKey } : { ...(cwd ? { cwd } : {}), ...(typeof value.space === 'string' ? { space: value.space } : {}) });
    void api<{ space: string | null }>(`/api/wiki/project?${query}`).then((result) => { if (active) setResolved(result); }).catch(() => { if (active) setResolved(null); });
    return () => { active = false; };
  }, [sessionKey, cwd, value.space, value.parent, spaces]);
  // Wait for the server's project and its current settings before enabling any controls.
  const project = resolved?.space ? spaces?.find((space) => space.id === resolved.space) : undefined;
  const loaded = !!spaces && !!resolved && (!resolved.space || !!project);
  const state = wikiChatOptions(settings, value, !!memory?.enabled, loaded ? project?.wikiMemory : false, project?.wikiFeatures);
  const projectDisabled = !!project && !!settings && (!(project.wikiMemory ?? settings.enabled) || WIKI_FEATURES.filter((key) => key !== 'autoContracts').some((key) => !(project.wikiFeatures?.[key] ?? settings.featureDefaults?.[key] ?? true)));
  return (
    <>
      <div className="flex min-h-9 items-center gap-2 rounded-lg px-2.5 py-1.5 max-sm:min-h-11">
        <BookOpen size={14} className="shrink-0 text-fg-3" />
        <button type="button" aria-expanded={expanded} aria-label="Show Wiki memory options" onClick={() => setExpanded(!expanded)} className="flex min-w-0 flex-1 items-center gap-1 text-left text-[13.5px] text-fg-2 max-sm:text-[14.5px]">{expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}<span>Wiki memory</span></button>
        <Switch on={state.wiki} disabled={!state.available} label="Wiki memory for this chat" onChange={(on) => onChange({ wikiEnabled: on })} />
      </div>
      {session && state.wiki && <p className="px-2.5 pb-1 text-[11.5px] leading-snug text-fg-3">If Wiki memory was turned on after the agent started, restart the agent to enable automatic checkpoints.</p>}
      {expanded && <div className="ml-6 border-l border-line pl-2">
        {projectDisabled && <p className="px-2.5 pb-1 text-[11.5px] text-fg-3">Some options are unavailable in this project.{' '}<button type="button" onClick={() => go(`/projects/${project!.id}/settings`)} className="text-accent hover:underline">Open its Settings</button></p>}
        {WIKI_FEATURES.filter((key) => key !== 'autoContracts').map((key: WikiFeature) => <div key={key} className="flex min-h-9 items-center gap-2 rounded-lg px-2.5 py-1.5 max-sm:min-h-11" title={!state.features.available[key] ? 'Unavailable because a project, Wiki memory or Memory setting is off' : undefined}>
          <span className="min-w-0 flex-1 text-[13.5px] text-fg-2 max-sm:text-[14.5px]">{WIKI_FEATURE_LABELS[key]}</span>
          <Switch on={state.features.enabled[key]} disabled={!state.features.available[key]} label={WIKI_FEATURE_LABELS[key]} onChange={(on) => onChange(wikiFeatureChange(value, key, on, session))} />
        </div>)}
      </div>}
    </>
  );
}

/** Save an existing session override through the same extra-settings endpoint as Memory. */
function SessionOptions({ s }: { s: SessionSummary }) {
  return <WikiChatOptions session sessionKey={s.key} cwd={s.cwd} value={s.extra ?? {}} onChange={(change) => { void patch(`/api/sessions/${enc(s.key)}/extra`, change).catch(toastError); }} />;
}

export const wikiChatFeature: WebFeature = { id: 'wiki-chat', noteViews: { 'wiki-lessons': AutoLessonsNote }, StartOptions: WikiChatOptions, SessionOptions };
