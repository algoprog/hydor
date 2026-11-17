// Resolve chat choices against the installation defaults and existing privacy controls.
import type { SessionExtra } from '@shared/features';
import { isConfidential } from '@shared/confidential';

export interface WikiChatDefaults {
  enabled: boolean;
  defaultChatEnabled: boolean;
  defaultAutoLessons: boolean;
}

/** Keep each explicit session choice distinct from its dynamically configured default. */
export function wikiChatOptions(settings: WikiChatDefaults | null, extra: SessionExtra, memoryEnabled: boolean, projectOn?: boolean) {
  const available = !!settings && (projectOn ?? settings.enabled) && !isConfidential(extra);
  const wiki = available && (extra.wikiEnabled ?? settings!.defaultChatEnabled);
  const lessonsAvailable = wiki && memoryEnabled && extra.memory !== false;
  const lessons = lessonsAvailable && (extra.wikiAutoLessons ?? settings!.defaultAutoLessons);
  return { available, wiki, lessonsAvailable, lessons };
}
