// Resolve Wiki memory choices identically for project settings, chat controls and server access.

/** Independently controlled Wiki memory capabilities. */
export const WIKI_FEATURES = ['autoLessons', 'contracts', 'autoContracts', 'plans', 'execution'] as const;

/** A capability name used by global, project and chat settings. */
export type WikiFeature = typeof WIKI_FEATURES[number];

/** Missing project or chat values inherit their corresponding default. */
export type WikiChoices = Partial<Record<WikiFeature, boolean>>;

/** Effective values and availability; saved choices are never modified by resolving them. */
export interface WikiFeatureState {
  available: Record<WikiFeature, boolean>;
  enabled: Record<WikiFeature, boolean>;
}

/** Resolve project defaults, chat overrides and dependencies without introducing a global hard lock. */
export function resolveWikiFeatures(
  defaults: Record<WikiFeature, boolean>,
  project: WikiChoices,
  chat: WikiChoices,
  wikiOn: boolean,
  memoryOn: boolean,
): WikiFeatureState {
  // An explicit project choice overrides the global default and bounds its chats.
  const permitted = Object.fromEntries(WIKI_FEATURES.map((key) => [key, project[key] === undefined ? defaults[key] === true : project[key] === true])) as Record<WikiFeature, boolean>;
  const available = Object.fromEntries(WIKI_FEATURES.map((key) => [key, wikiOn && permitted[key]])) as Record<WikiFeature, boolean>;
  available.autoLessons &&= memoryOn;
  available.autoContracts &&= memoryOn;
  const enabled = Object.fromEntries(WIKI_FEATURES.map((key) => [key, available[key] && (chat[key] === undefined || chat[key] === true)])) as Record<WikiFeature, boolean>;
  // Automatic suggestions require contracts to be enabled in the same chat.
  available.autoContracts &&= enabled.contracts;
  enabled.autoContracts &&= available.autoContracts;
  return { available, enabled };
}

/** User-facing labels shared by the three settings levels. */
export const WIKI_FEATURE_LABELS: Record<WikiFeature, string> = {
  autoLessons: 'Auto lessons learned',
  contracts: 'Wiki contracts',
  autoContracts: 'Auto contract suggestions',
  plans: 'Wiki plans',
  execution: 'Execution tracking',
};
