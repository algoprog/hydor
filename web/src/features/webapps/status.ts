// What a web app is doing, in plain words: one label, one tone, and the reason when there is one.
import type { WebApp } from '@shared/webapps';

export type Tone = 'ok' | 'idle' | 'busy' | 'err';
export interface WebStatus {
  tone: Tone;
  label: string;
  /** Why, in a sentence: the server's own words for a folder or a hydor.json that is wrong, a build that failed, an exit. */
  reason?: string;
  /** What is wrong is the app's files, not something that running it again would change. */
  broken?: 'folder' | 'file';
}

export const FOLDER_GONE = /not there any more/i;
/** An app whose hydor.json is not written yet: not broken, being made. */
export const FILE_NOT_YET = /has no hydor\.json yet/i;

/** Whether the app can be run at all: its hydor.json can be read. */
export const readable = (a: Pick<WebApp, 'shape'>): boolean => a.shape.ok;

export function statusOf(a: WebApp): WebStatus {
  if (!a.shape.ok) {
    const why = a.shape.problem ?? '';
    if (FOLDER_GONE.test(why)) return { tone: 'err', label: 'Folder missing', reason: why, broken: 'folder' };
    if (FILE_NOT_YET.test(why)) return { tone: 'idle', label: 'Being made', reason: why, broken: 'file' };
    return { tone: 'err', label: 'hydor.json can’t be used', reason: a.shape.problems?.join(' ') ?? why, broken: 'file' };
  }
  if (a.build.state === 'building') return { tone: 'busy', label: 'Building…' };
  if (a.run.state === 'starting') return { tone: 'busy', label: 'Starting…' };
  if (a.run.state === 'running') return { tone: 'ok', label: 'Running' };
  if (a.run.state === 'crashed') return { tone: 'err', label: 'Stopped unexpectedly', reason: a.run.lastExit ?? undefined };
  if (a.build.state === 'failed') return { tone: 'err', label: 'Build failed', reason: a.build.problem };
  // An app being made runs its development server: nothing has to be built for it to run.
  if (!a.build.exists && a.mode?.runsAs !== 'dev') return { tone: 'idle', label: 'Not built yet' };
  return { tone: 'idle', label: 'Stopped' };
}
