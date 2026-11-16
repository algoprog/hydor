// Bind an explicit hub-change decision to a server-side preview of both directory trees.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Deps } from '../../features/types.ts';
import { HttpError } from '../../auth.ts';
import { taskRoot } from '../../assistants/store.ts';
import { invalidateWikiKnowledge } from '../knowledge/index.ts';
import { applyWikiMigration, previewWikiMigration, type WikiConflict, type WikiMigrationPreview } from './migration.ts';
import { setWikiSettings, wikiSettings } from './settings.ts';

interface Pending { source: string; target: string; preview: WikiMigrationPreview | null; expires: number }
const pending = new Map<string, Pending>();

/** Validate a user-entered hub path before looking at the filesystem. */
function requestedHub(db: Deps['db'], value: unknown): string {
  if (typeof value !== 'string' || /[\0\r\n]/.test(value)) throw new HttpError(400, 'The wiki hub must be an absolute path');
  const entered = value.trim();
  if (!entered) return path.join(taskRoot(db), '.wiki');
  if (!path.isAbsolute(entered)) throw new HttpError(400, 'The wiki hub must be an absolute path');
  return path.resolve(entered);
}

/** Do not allow a settings update to bypass the user decision for a nonempty hub. */
export function guardHubChange(db: Deps['db'], input: Partial<{ hubPath: string }>): void {
  if (input.hubPath === undefined) return;
  const target = requestedHub(db, input.hubPath);
  const source = path.resolve(wikiSettings(db).hubPath);
  if (source === target || !fs.existsSync(source)) return;
  try {
    const st = fs.lstatSync(source);
    if (st.isSymbolicLink() || !st.isDirectory() || fs.readdirSync(source).length) throw new HttpError(409, 'Review the wiki hub move before changing its location');
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(409, 'The current wiki hub cannot be inspected');
  }
}

/** Register preview and apply endpoints; a token is single-use and expires after ten minutes. */
export function wikiMigrationRoutes(d: Deps): void {
  d.app.post('/api/wiki/migration/preview', async (req) => {
    const target = requestedHub(d.db, (req.body as { hubPath?: unknown } | null)?.hubPath);
    const source = path.resolve(wikiSettings(d.db).hubPath);
    if (source === target) throw new HttpError(400, 'The wiki hub is already at that location');
    let preview: WikiMigrationPreview | null = null;
    if (fs.existsSync(source)) {
      try { preview = previewWikiMigration(source, target); }
      catch (error) { throw new HttpError(400, (error as Error).message); }
    }
    const now = Date.now();
    for (const [key, item] of pending) if (item.expires <= now) pending.delete(key);
    if (pending.size >= 128) throw new HttpError(429, 'Too many pending wiki move previews');
    const planToken = crypto.randomBytes(24).toString('hex');
    pending.set(planToken, { source, target, preview, expires: now + 10 * 60_000 });
    return { source, target, sourceFiles: preview?.sourceTree.files.length ?? 0, targetFiles: preview?.targetTree.files.length ?? 0, targetExists: preview?.targetTree.exists ?? fs.existsSync(target), conflicts: preview?.conflicts.filter((item) => !item.identical).length ?? 0, conflictPaths: preview?.conflicts.filter((item) => !item.identical).slice(0, 50).map((item) => item.path) ?? [], planToken };
  });

  d.app.post('/api/wiki/migration/apply', async (req) => {
    const body = (req.body ?? {}) as { hubPath?: unknown; planToken?: unknown; action?: unknown; conflict?: unknown };
    const token = typeof body.planToken === 'string' ? body.planToken : '';
    const plan = pending.get(token);
    pending.delete(token);
    if (!plan || plan.expires <= Date.now()) throw new HttpError(409, 'The wiki move preview has expired; review it again');
    if (requestedHub(d.db, body.hubPath) !== plan.target || path.resolve(wikiSettings(d.db).hubPath) !== plan.source) throw new HttpError(409, 'The wiki location changed; review the move again');
    if (!['keep', 'merge', 'replace'].includes(String(body.action))) throw new HttpError(400, 'Choose how to change the wiki location');
    if (body.action === 'keep') {
      // Recheck even a path-only change: files may have appeared after the preview.
      try {
        if (plan.preview ? previewWikiMigration(plan.source, plan.target).fingerprint !== plan.preview.fingerprint : fs.existsSync(plan.source)) throw new Error('Wiki contents changed since the preview');
      } catch (error) { throw new HttpError(409, (error as Error).message); }
      return d.db.transaction(() => {
        const settings = setWikiSettings(d.db, { hubPath: plan.target });
        invalidateWikiKnowledge(d.db);
        return settings;
      })();
    }
    if (!plan.preview || !plan.preview.sourceTree.files.length) throw new HttpError(409, 'There are no source files to move');
    const conflicts = plan.preview.conflicts.some((item) => !item.identical);
    if (body.action === 'merge' && conflicts && !['source', 'target', 'oldest'].includes(String(body.conflict))) throw new HttpError(400, 'Choose how to resolve conflicting files');
    let migration;
    try { migration = applyWikiMigration(plan.preview, body.action as 'merge' | 'replace', (body.conflict ?? 'target') as WikiConflict); }
    catch (error) { throw new HttpError(409, (error as Error).message); }
    try {
      // Keep the configured hub and its Knowledge bindings in one database transaction.
      const settings = d.db.transaction(() => {
        const next = setWikiSettings(d.db, { hubPath: plan.target });
        invalidateWikiKnowledge(d.db);
        return next;
      })();
      return { ...settings, migration: { sourceBackup: migration.sourceBackup, targetBackup: migration.targetBackup } };
    } catch (error) {
      try { migration.rollback(); } catch (restore) { throw new HttpError(500, (restore as Error).message); }
      throw error;
    }
  });
}
