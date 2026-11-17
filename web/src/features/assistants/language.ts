import type { Assistant } from '@shared/assistants';

/** Built-in agents (General, Researcher…) are translated in every language; the agents you made keep your own words. */
export const assistantTranslate = (a: Pick<Assistant, 'builtin'>): 'no' | undefined => (a.builtin ? undefined : 'no');
