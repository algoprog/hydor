// Every capability of the app, in the order they register.
import { apps } from '../apps/index.ts';
import { arena } from '../arena/index.ts';
import { assistants } from '../assistants/index.ts';
import { automations } from '../automations/index.ts';
import { browser } from '../browser/index.ts';
import { budget } from '../budget/index.ts';
import { children } from '../children/index.ts';
import { cleanup } from '../cleanup/index.ts';
import { commits } from '../commits/index.ts';
import { computer } from '../computer/index.ts';
import { connections } from '../connections/index.ts';
import { custom } from '../custom/index.ts';
import { documents } from '../documents/index.ts';
import { fileAsk } from '../fileask/index.ts';
import { find } from '../find/index.ts';
import { formatting } from '../formatting/index.ts';
import { guide } from '../guide/index.ts';
import { guidelines } from '../guidelines/index.ts';
import { images } from '../images/index.ts';
import { keep } from '../keep/index.ts';
import { knowledge } from '../knowledge/index.ts';
import { language } from '../language/index.ts';
import { media } from '../media/index.ts';
import { memory } from '../memory/index.ts';
import { profile } from '../memory/profile.ts';
import { opinion } from '../opinion/index.ts';
import { pages } from '../pages/index.ts';
import { plugins } from '../plugins/index.ts';
import { releaseNotes } from '../releases/index.ts';
import { research } from '../research/index.ts';
import { search } from '../search/index.ts';
import { shots } from '../shots/index.ts';
import { signatures } from '../signatures/index.ts';
import { sidebar } from '../sidebar/index.ts';
import { tips } from '../tips/index.ts';
import { skillpack } from '../skillpack/index.ts';
import { spaces } from '../spaces/index.ts';
import { swarm } from '../swarm/index.ts';
import { voice } from '../voice/index.ts';
import type { Feature } from './types.ts';

// The user's guidelines lead what an agent is told, their profile right after them; how to format replies follows the
// pages it may show instead.
export const FEATURES: Feature[] = [guidelines, profile, pages, formatting, shots, search, browser, computer, memory, knowledge, spaces, children, swarm, research, opinion, commits, budget, documents, fileAsk, images, media, connections, signatures, automations, voice, assistants, apps, plugins, skillpack, cleanup, custom, arena, language, guide, keep, find, releaseNotes, sidebar, tips];
