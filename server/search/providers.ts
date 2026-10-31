// Every search provider, in their default order. The first one that is on is the default; when one
// cannot answer (no key, a limit reached, out of reach), the next one gets the query. Settings →
// Search changes the order and turns them on and off. To add a provider, write its file (see
// docs/search-providers.md) and list it here.
import { brave } from './brave.ts';
import { duckduckgo } from './duckduckgo.ts';
import { naget } from './naget.ts';
import { searxng } from './searxng.ts';
import type { SearchProvider } from './types.ts';

export const PROVIDERS: SearchProvider[] = [naget, searxng, brave, duckduckgo];
