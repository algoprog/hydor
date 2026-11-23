// Word suggestions' one text box controller (suggester.ts) joined to this app: the request to the server, the
// switches from the stores, and this tab's id (a new request cancels the tab's one before, on the server too).
import type { SuggestRequest, SuggestResponse } from '@shared/suggest';
import { api } from '../../lib/api';
import { Suggester, type Adapter } from './suggester';
import { gateNow } from './store';
import { recordUsage } from './usage';
import type { Grey } from './logic';

export type { Adapter } from './suggester';

export const CLIENT = (() => {
  const b = new Uint8Array(8);
  crypto.getRandomValues(b);
  return `t-${Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')}`;
})();

/** POST /api/suggest: an answer, or null when there is nothing to show (204). */
export const askServer = (req: SuggestRequest, signal: AbortSignal) => api<SuggestResponse | null>('/api/suggest', { method: 'POST', body: req, signal });

/** A controller for the box `adapter` reaches; `on` is told what to show after the caret (null: nothing). */
export const makeSuggester = (adapter: Adapter, on: (g: Grey | null) => void) => new Suggester(adapter, on, { send: askServer, gate: gateNow, client: CLIENT, count: recordUsage });
