// The browser coming back from a sign-in (?flow=…) to a page that started one: Apps → Connected apps, and Settings →
// MCP servers (a server's own sign-in).
import { useEffect } from 'react';
import { api, enc } from '../../lib/api';
import { go } from '../../lib/nav';
import { toast } from '../../lib/store';
import { FLOW_KEY } from './ConnectDialog';

/** Says how the sign-in went, then tidies the address. `page`: where this is; `signedIn`: what to say when it worked. */
export function useSignInReturn(onDone: () => void, page: '/apps/connected' | '/settings' = '/apps/connected', signedIn = (name: string) => `${name} is connected`) {
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const flow = q.get('flow');
    if (!flow) return;
    // In the small sign-in window: the page that opened it is told, and this window closes.
    if (window.opener && window.name === 'naget-sign-in') {
      try {
        window.opener.postMessage({ type: 'naget-connections-flow', flow }, location.origin);
      } catch {}
      window.close();
    }
    sessionStorage.removeItem(FLOW_KEY);
    q.delete('flow');
    // (An old address of Connected apps was Settings: its section means nothing there.)
    if (page === '/apps/connected') q.delete('s');
    go(`${page}${q.size ? `?${q}` : ''}`, true);
    api<{ result: { app: string; name: string; ok: boolean; error?: string } | null }>(`/api/connections/flows/${enc(flow)}`)
      .then((r) => {
        if (!r.result) return;
        const name = r.result.name;
        if (r.result.ok) toast(signedIn(name), 'ok');
        else toast(`${name}: ${r.result.error ?? 'signing in did not finish'}`, 'error');
        onDone();
      })
      .catch(() => {});
  }, []);
}
