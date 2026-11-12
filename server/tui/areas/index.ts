// The areas of the `hydor` command: one import and one entry a line. Help, Tab completion and the parser read this
// list, so an area is only its file plus its line here (see kit.ts for what an area is). An area named like a command
// that exists already (sessions, agents, tasks, open…) takes over only the verbs it names; the command's own code
// still answers the rest until it is moved into the area.
import { agents } from './agents.ts';
import { keys } from './keys.ts';
import { mcp } from './mcp.ts';
import { memory } from './memory.ts';
import { plugins } from './plugins.ts';
import { projects } from './projects.ts';
import { skills } from './skills.ts';
import type { Area, Verb } from './kit.ts';

export const AREAS: Area[] = [projects, agents, memory, skills, plugins, mcp, keys];

/** An area by its name or an alias of it. */
export const areaByName = (name: string): Area | undefined => AREAS.find((a) => a.name === name || a.aliases?.includes(name));

/** The verb a list of words begins with: two words first (`files add`), then one. `used` is how many words it took. */
export function findVerb(area: Area, words: string[]): { verb: Verb; used: number } | null {
  const named = (v: Verb, w: string) => v.name === w || !!v.aliases?.includes(w);
  if (words.length > 1) {
    const two = `${words[0]} ${words[1]}`;
    const v = area.verbs.find((x) => named(x, two));
    if (v) return { verb: v, used: 2 };
  }
  const v = words.length ? area.verbs.find((x) => named(x, words[0]) && !x.name.includes(' ')) : undefined;
  return v ? { verb: v, used: 1 } : null;
}

/** The verb that runs when none is named. */
export const defaultVerb = (area: Area): Verb => area.verbs.find((v) => v.name === (area.default ?? 'list')) ?? area.verbs[0];
