// The areas of the `hydor` command: one import and one entry a line. Help, Tab completion and the parser read this
// list, so an area is only its file plus its line here (see kit.ts for what an area is). An area named like a command
// that exists already (sessions, agents, tasks, open…) takes over only the verbs it names; the command's own code
// still answers the rest until it is moved into the area.
import { accounts } from './accounts.ts';
import { agents } from './agents.ts';
import { api } from './api.ts';
import { apps } from './apps.ts';
import { connections } from './connections.ts';
import { experiments } from './experiments.ts';
import { find } from './find.ts';
import { guide } from './guide.ts';
import { guidelines } from './guidelines.ts';
import { inbox } from './inbox.ts';
import { keys } from './keys.ts';
import { library } from './library.ts';
import { machines } from './machines.ts';
import { mcp } from './mcp.ts';
import { memory } from './memory.ts';
import { open } from './open.ts';
import { plugins } from './plugins.ts';
import { projects } from './projects.ts';
import { sessions } from './sessions.ts';
import { settings } from './settings.ts';
import { skills } from './skills.ts';
import { tasks } from './tasks.ts';
import type { Area, Verb } from './kit.ts';

// The order help lists them in, within their groups.
export const AREAS: Area[] = [projects, tasks, apps, library, experiments, sessions, inbox, agents, accounts, memory, guidelines, skills, plugins, mcp, connections, keys, settings, find, guide, open, api, machines];

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
