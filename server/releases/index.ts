// Release notes: GET /api/releases gives what changed in each version, from this copy's own CHANGELOG.md, so they
// match the version running (an update brings its notes with it). Read again when the file changes.
import fs from 'node:fs';
import path from 'node:path';
import { parseReleases, type ReleasesResponse } from '../../shared/releases.ts';
import { APP_ROOT, config } from '../config.ts';
import type { Feature } from '../features/types.ts';

export const CHANGELOG = path.join(APP_ROOT, 'CHANGELOG.md');

let read: { at: number; res: ReleasesResponse } | null = null;

export function releases(): ReleasesResponse {
  try {
    const at = fs.statSync(CHANGELOG).mtimeMs;
    if (read?.at !== at) read = { at, res: { current: config.version, releases: parseReleases(fs.readFileSync(CHANGELOG, 'utf8')) } };
    return read.res;
  } catch {
    return { current: config.version, releases: [] };
  }
}

export const releaseNotes: Feature = {
  id: 'releases',
  routes(d) {
    d.app.get('/api/releases', async () => releases());
  },
};
