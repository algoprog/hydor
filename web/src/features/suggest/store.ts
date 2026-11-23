// Word suggestions' settings and status, from the server (GET and PUT /api/suggest): loaded when a text box first
// wants them, kept current while the Settings page is open and while it is setting up, starting or learning, and
// warmed (POST /api/suggest/warm) when a text box gets the focus.
import { useEffect } from 'react';
import { create } from 'zustand';
import { SUGGEST_DEFAULTS, type SuggestSettings, type SuggestState, type SuggestStatus } from '@shared/suggest';
import { api, del, post, put } from '../../lib/api';
import { viaLink } from '../../lib/machine';
import { toastError, useUI } from '../../lib/store';
import type { Gate } from './logic';

/** What a change to the settings may hold: any of them, `where` and `sources` whole or in part. */
export type SuggestChange = Partial<Omit<SuggestSettings, 'where' | 'sources'>> & { where?: Partial<SuggestSettings['where']>; sources?: Partial<SuggestSettings['sources']> };

interface Store {
  settings: SuggestSettings | null;
  status: SuggestStatus | null;
  /** The last time it was loaded. */
  at: number;
}

export const useSuggest = create<Store>(() => ({ settings: null, status: null, at: 0 }));

/** The status says something is going on that changes it by itself: set-up, loading, or learning. */
export const busy = (s: SuggestStatus | null) => !!s && (s.state === 'setting-up' || s.state === 'starting' || s.training.state === 'running');

const take = (r: SuggestState) => useSuggest.setState({ settings: { ...SUGGEST_DEFAULTS, ...r.settings, where: { ...SUGGEST_DEFAULTS.where, ...r.settings?.where }, sources: { ...SUGGEST_DEFAULTS.sources, ...r.settings?.sources } }, status: r.status, at: Date.now() });

let inflight: Promise<void> | null = null;
let poll: ReturnType<typeof setTimeout> | undefined;

/** Read the settings and status again; while something is going on, again in a few seconds (wherever it is shown). */
export function loadSuggest(): Promise<void> {
  if (viaLink) return Promise.resolve();
  inflight ??= api<SuggestState>('/api/suggest')
    .then(take)
    .catch(() => {})
    .finally(() => {
      inflight = null;
      clearTimeout(poll);
      if (busy(useSuggest.getState().status)) poll = setTimeout(() => void loadSuggest(), 2500);
    });
  return inflight;
}

/** Load them unless they were read lately. */
export function ensureSuggest(maxAgeMs = 60_000) {
  if (Date.now() - useSuggest.getState().at > maxAgeMs) void loadSuggest();
}

/** Change some settings: shown at once, kept on the server (only what changed goes), and the answer's copy replaces it. */
export async function setSuggest(change: SuggestChange): Promise<void> {
  const cur = useSuggest.getState().settings ?? SUGGEST_DEFAULTS;
  const next = { ...cur, ...change, where: { ...cur.where, ...change.where }, sources: { ...cur.sources, ...change.sources } } as SuggestSettings;
  useSuggest.setState({ settings: next });
  // `where` and `sources` go whole, so the server needs no merge of their parts.
  const body: Record<string, unknown> = { ...change };
  if (change.where) body.where = next.where;
  if (change.sources) body.sources = next.sources;
  try {
    take(await put<SuggestState>('/api/suggest', body));
  } catch (e) {
    toastError(e);
    await loadSuggest();
  }
  if (busy(useSuggest.getState().status)) void loadSuggest();
}

/** Personalise now (Settings: Retrain now). */
export async function retrainNow(): Promise<void> {
  await post('/api/suggest/train');
  await loadSuggest();
}

/** Forget what it learned: the model goes back to the one that came with the app. */
export async function forgetPersonal(): Promise<void> {
  await del('/api/suggest/personal');
  await loadSuggest();
}

/** The settings page: loaded when it opens and every so often while it is open (more often while something is going on). */
export function useSuggestOpen() {
  useEffect(() => {
    void loadSuggest();
    const t = setInterval(() => void loadSuggest(), 15_000);
    return () => clearInterval(t);
  }, []);
}

/** The switches as `allowed` reads them, from the stores. */
export function gateNow(): Gate {
  const { settings, status } = useSuggest.getState();
  return { enabled: !!settings?.enabled, state: status?.state, where: settings?.where ?? SUGGEST_DEFAULTS.where, browser: useUI.getState().wordSuggestions !== false };
}

let warmedAt = 0;
/** A text box got the focus: start what is set up (the models take seconds to load), at most once a minute. */
export function warmSuggest() {
  if (viaLink) return;
  ensureSuggest();
  const { settings } = useSuggest.getState();
  if (!settings?.enabled || useUI.getState().wordSuggestions === false) return;
  if (Date.now() - warmedAt < 60_000) return;
  warmedAt = Date.now();
  post('/api/suggest/warm').catch(() => {});
}
