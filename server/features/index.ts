// Every capability of the app, in the order they register.
import { apps } from '../apps/index.ts';
import { arena } from '../arena/index.ts';
import { assistants } from '../assistants/index.ts';
import { automations } from '../automations/index.ts';
import { browser } from '../browser/index.ts';
import { budget } from '../budget/index.ts';
import { children } from '../children/index.ts';
import { cleanup } from '../cleanup/index.ts';
import { connections } from '../connections/index.ts';
import { custom } from '../custom/index.ts';
import { documents } from '../documents/index.ts';
import { find } from '../find/index.ts';
import { guide } from '../guide/index.ts';
import { guidelines } from '../guidelines/index.ts';
import { images } from '../images/index.ts';
import { keep } from '../keep/index.ts';
import { knowledge } from '../knowledge/index.ts';
import { language } from '../language/index.ts';
import { memory } from '../memory/index.ts';
import { opinion } from '../opinion/index.ts';
import { pages } from '../pages/index.ts';
import { releaseNotes } from '../releases/index.ts';
import { research } from '../research/index.ts';
import { search } from '../search/index.ts';
import { shots } from '../shots/index.ts';
import { sidebar } from '../sidebar/index.ts';
import { skillpack } from '../skillpack/index.ts';
import { spaces } from '../spaces/index.ts';
import { swarm } from '../swarm/index.ts';
import { voice } from '../voice/index.ts';
import type { Feature } from './types.ts';

// The user's guidelines lead what an agent is told.
export const FEATURES: Feature[] = [guidelines, pages, shots, search, browser, memory, knowledge, spaces, children, swarm, research, opinion, budget, documents, images, connections, automations, voice, assistants, apps, skillpack, cleanup, custom, arena, language, guide, keep, find, releaseNotes, sidebar];
