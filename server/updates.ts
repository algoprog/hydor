// Is there a newer version? For a copy installed from git: once a day, fetch its upstream and count
// the commits this checkout is behind. Nothing for copies without git or without an upstream.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { git } from './git.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export interface UpdateInfo {
  behind: number;
  /** The newest commit's subject. */
  latest?: string;
  checkedAt: number;
}

let last: UpdateInfo | null = null;

export const updateInfo = () => last;

export async function checkUpdates(): Promise<UpdateInfo | null> {
  if (!fs.existsSync(path.join(ROOT, '.git'))) return null;
  const up = await git(ROOT, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
  if (!up.ok) return null;
  await git(ROOT, ['fetch', '--quiet'], 60_000);
  const [count, subject] = await Promise.all([git(ROOT, ['rev-list', '--count', 'HEAD..@{u}']), git(ROOT, ['log', '-1', '--format=%s', '@{u}'])]);
  last = { behind: Number(count.out.trim()) || 0, latest: subject.out.trim() || undefined, checkedAt: Date.now() };
  return last;
}

/** Checks a few minutes after start, then daily. */
export function watchUpdates(onChange: (u: UpdateInfo) => void) {
  const tick = () =>
    checkUpdates()
      .then((u) => u && onChange(u))
      .catch(() => {});
  setTimeout(tick, 3 * 60_000).unref();
  setInterval(tick, 24 * 3600_000).unref();
}
