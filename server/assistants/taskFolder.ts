// A new folder for a task, for people who do not think in folders: under the root set in Settings →
// Assistants (~/Hydor by default), named by the day and a few words of the prompt, such as
// 2026-10-31-plan-trip-lisbon. A name already taken gets -2, -3…
import fs from 'node:fs';
import path from 'node:path';

/** Words that say little about the task. */
const SKIP = new Set(
  'a an the and or but to of in on at for with from by about into as is are be can could would should will shall may might please help me my i we us our you your it its this that these those some any need want like do make get'.split(' '),
);

/** A few words of the prompt for a folder name: letters and digits of any script, accents dropped, at most 40 characters. */
export function slugOf(prompt: string): string {
  const words = prompt
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/^\s*\/\S+/, ' ')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(' ')
    .filter((w) => w && !SKIP.has(w))
    .slice(0, 5);
  let slug = '';
  for (const w of words) {
    const next = slug ? `${slug}-${w}` : w;
    if ([...next].length > 40) {
      if (!slug) slug = [...w].slice(0, 40).join('');
      break;
    }
    slug = next;
  }
  return slug || 'task';
}

/** The day in the user's time zone, as 2026-10-31. */
export const dayIn = (tz: string, at = Date.now()) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);

export const taskFolderName = (prompt: string, day: string) => `${day}-${slugOf(prompt)}`;

/** Makes the task's folder under `root` and returns its path. */
export function makeTaskFolder(root: string, prompt: string, day: string): string {
  fs.mkdirSync(root, { recursive: true });
  const name = taskFolderName(prompt, day);
  for (let i = 1; i < 1000; i++) {
    const dir = path.join(root, i === 1 ? name : `${name}-${i}`);
    try {
      fs.mkdirSync(dir);
      return dir;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
    }
  }
  throw new Error('Could not find a free name for the task folder');
}
