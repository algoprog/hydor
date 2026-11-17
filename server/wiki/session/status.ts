// Persist only the outcome and type of a checkpoint, never the session text or its identifier.
import crypto from 'node:crypto';
import { kvGet, kvSet, type DB } from '../../db.ts';
import { captureEvent, sessionHash, type WikiEvent } from './store.ts';

export interface WikiCheckpointStatus {
  status: 'saved' | 'failed';
  event: Exclude<WikiEvent, 'SessionStart'>;
  at: string;
  content: 'summary' | 'metadata' | null;
  hub: string;
}

/** Bind each status to the session and configured hub without persisting either path or identifier. */
function statusKey(key: string): string { return `wiki.checkpoint.${sessionHash(key)}`; }
function hubHash(hub: string): string { return crypto.createHash('sha256').update(hub).digest('hex'); }

/** Forget the metadata record when its session is deleted. */
export function clearCheckpointStatus(db: DB, key: string): void {
  db.prepare('delete from kv where k = ?').run(statusKey(key));
}

/** Record a failed preparation without retaining the input or the session identifier. */
export function checkpointPreparationFailed(db: DB, hub: string, key: string, event: Exclude<WikiEvent, 'SessionStart'>): void {
  const item: WikiCheckpointStatus = { status: 'failed', event, at: new Date().toISOString(), content: null, hub: hubHash(hub) };
  kvSet(db, statusKey(key), JSON.stringify(item));
}

/** Return only a valid status for the same hub; a changed hub cannot inherit an old success. */
export function checkpointStatus(db: DB, hub: string, key: string): Omit<WikiCheckpointStatus, 'hub'> | null {
  try {
    const raw = kvGet(db, statusKey(key));
    if (!raw) return null;
    const value = JSON.parse(raw) as WikiCheckpointStatus;
    if (value.hub !== hubHash(hub) || !['saved', 'failed'].includes(value.status) || !['PostToolUse', 'PreCompact', 'PostCompact', 'Stop'].includes(value.event) || !Number.isFinite(Date.parse(value.at)) || ![null, 'summary', 'metadata'].includes(value.content)) return null;
    const { hub: _hub, ...status } = value;
    return status;
  } catch { return null; }
}

/** Record the outcome only while capture is enabled by the caller; skipped events keep the preceding result. */
export function captureWithStatus(db: DB, hub: string, key: string, event: WikiEvent, count = 0, summary = ''): ReturnType<typeof captureEvent> {
  const save = (status: WikiCheckpointStatus['status'], content: WikiCheckpointStatus['content']) => {
    if (event === 'SessionStart') return;
    const item: WikiCheckpointStatus = { status, event, at: new Date().toISOString(), content, hub: hubHash(hub) };
    kvSet(db, statusKey(key), JSON.stringify(item));
  };
  try {
    const result = captureEvent(hub, key, event, count, summary);
    // Retaining a previous summary is not evidence that this event wrote a checkpoint.
    if (result && !result.retained) save('saved', summary.trim() ? 'summary' : 'metadata');
    return result;
  } catch (error) {
    // The failure record contains no user content and does not block the agent's compaction.
    try { save('failed', null); } catch { /* No status can be persisted if the database is unavailable. */ }
    throw error;
  }
}
