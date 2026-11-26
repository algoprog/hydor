// A message the app itself sends a session as a notice, not the person: Experiments' that runs ended, and the goal
// loop's. What goes with a person's message because of what it says (memory's notes and the wiki's articles that bear
// on it, the app that does what it asks) does not go with these.
import { experimentNoticeOf } from './experiments.ts';
import { goalMessageOf } from './goals.ts';

export const isAppNotice = (text: string): boolean => !!experimentNoticeOf(text.trimStart()) || !!goalMessageOf(text.trimStart());
