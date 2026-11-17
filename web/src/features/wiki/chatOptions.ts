// Resolve chat choices against the installation defaults and existing privacy controls.
import { WIKI_FEATURES, resolveWikiFeatures, type WikiChoices, type WikiFeature } from '@shared/wiki-controls';
import type { SessionExtra } from '@shared/features';
import { isConfidential } from '@shared/confidential';

export interface WikiChatDefaults {
  enabled: boolean;
  defaultChatEnabled: boolean;
  defaultAutoLessons: boolean;
  featureDefaults?: WikiChoices;
}

/** Preserve sibling choices in start forms; existing sessions merge individual fields on the server. */
export function wikiFeatureChange(extra: SessionExtra, key: WikiFeature, on: boolean, session = false): Partial<SessionExtra> {
  if (key === 'autoLessons') return { wikiAutoLessons: on };
  return { wikiFeatures: { ...(session ? {} : extra.wikiFeatures), [key]: on } };
}

/** Keep each explicit session choice distinct from its dynamically configured default. */
export function wikiChatOptions(settings: WikiChatDefaults | null, extra: SessionExtra, memoryEnabled: boolean, projectOn?: boolean, projectFeatures: WikiChoices = {}) {
  const available = !!settings && (projectOn ?? settings.enabled) && !isConfidential(extra);
  const wiki = available && (extra.wikiEnabled ?? settings!.defaultChatEnabled);
  // Existing installations retain the established automatic-lessons chat default.
  const defaults = Object.fromEntries(WIKI_FEATURES.map((key) => [key, settings?.featureDefaults?.[key] !== false])) as Record<WikiFeature, boolean>;
  const features = resolveWikiFeatures(defaults, projectFeatures, { ...extra.wikiFeatures, autoLessons: extra.wikiAutoLessons ?? extra.wikiFeatures?.autoLessons ?? settings?.defaultAutoLessons ?? false }, wiki, memoryEnabled && extra.memory !== false);
  return { available, wiki, lessonsAvailable: features.available.autoLessons, lessons: features.enabled.autoLessons, features };
}
