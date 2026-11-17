// Resolve per-chat controls without replacing project-level wiki memory settings.
import { WIKI_FEATURES, resolveWikiFeatures, type WikiFeature } from '../../shared/wiki-controls.ts';
import { spaceById } from '../spaces/index.ts';
import { sessionMemoryOn } from '../memory/store.ts';
import type { SessionExtra } from '../../shared/features.ts';
import { isConfidential } from '../../shared/confidential.ts';
import type { DB } from '../db.ts';
import { sessionExtra } from '../sessionExtra.ts';
import { wikiMemoryOn, wikiSpaceOfSession } from './roots.ts';
import { wikiSettings } from './settings/settings.ts';

/** A chat setting supplements the project's existing Wiki memory setting. */
export function wikiChatEnabled(db: DB, extra: SessionExtra): boolean {
  return !isConfidential(extra) && (typeof extra.wikiEnabled === 'boolean' ? extra.wikiEnabled : wikiSettings(db).defaultChatEnabled);
}

/** Automatic suggestions use the same session choice and installation defaults. */
export function wikiAutoLessonsEnabled(db: DB, extra: SessionExtra): boolean {
  return wikiChatEnabled(db, extra) && (extra.wikiAutoLessons ?? extra.wikiFeatures?.autoLessons ?? wikiSettings(db).defaultAutoLessons);
}

/** Every access must also respect the existing per-project wiki setting. */
export function wikiEnabledForSession(db: DB, key: string, cwd?: string): boolean {
  return wikiChatEnabled(db, sessionExtra(db, key)) && wikiMemoryOn(db, wikiSpaceOfSession(db, key, cwd));
}

/** Resolve feature gates again on every use, including after a user approval card. */
export function wikiFeatureEnabled(db: DB, key: string, cwd: string | undefined, feature: WikiFeature): boolean {
  const extra = sessionExtra(db, key);
  const space = wikiSpaceOfSession(db, key, cwd);
  const project = space ? spaceById(db, space) : null;
  const settings = wikiSettings(db);
  // Existing auto-lessons chat choices and defaults retain their original meaning.
  const chat = { ...extra.wikiFeatures, autoLessons: extra.wikiAutoLessons ?? extra.wikiFeatures?.autoLessons ?? settings.defaultAutoLessons };
  const defaults = Object.fromEntries(WIKI_FEATURES.map((name) => [name, settings.featureDefaults[name] !== false])) as Record<WikiFeature, boolean>;
  return resolveWikiFeatures(defaults, project?.wikiFeatures ?? {}, chat, wikiEnabledForSession(db, key, cwd), sessionMemoryOn(db, key)).enabled[feature];
}

/** A cross-project read must respect both the chat and the target project's feature choice. */
export function wikiFeatureEnabledInProject(db: DB, key: string, cwd: string | undefined, feature: WikiFeature, target: string | null): boolean {
  if (!wikiFeatureEnabled(db, key, cwd, feature)) return false;
  const current = wikiSpaceOfSession(db, key, cwd);
  if (!target || target === current) return true;
  const project = spaceById(db, target);
  if (!project || !wikiMemoryOn(db, target)) return false;
  const settings = wikiSettings(db);
  const defaults = Object.fromEntries(WIKI_FEATURES.map((name) => [name, settings.featureDefaults[name] !== false])) as Record<WikiFeature, boolean>;
  return resolveWikiFeatures(defaults, project.wikiFeatures ?? {}, {}, true, true).enabled[feature];
}
