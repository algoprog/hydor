import type { Assistant } from '@shared/assistants';
import { currentLang } from '../../i18n/locale';

/** German keeps the built-in agent identities in English; authored agents are never translated. */
export const assistantTranslate = (a: Pick<Assistant, 'builtin'>): 'no' | undefined =>
  a.builtin && currentLang() !== 'de' ? undefined : 'no';
