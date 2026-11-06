// The card a tool shows when it needs a model that runs through OpenRouter (a picture, a drawing, a video, a sound)
// and no OpenRouter key is set (server/connections/openrouter-key.ts): the person pastes their key, which goes from
// here straight to Settings → Models → OpenRouter (checked with OpenRouter first; never into the conversation), and
// the tool goes on; or they skip it, and that model does not run. Shown in the tool's own place in the conversation
// while it waits, and for an agent's request_secret of the same key.
import { useCallback, useEffect, useState } from 'react';
import { CircleCheck, ExternalLink, KeyRound } from 'lucide-react';
import type { SecretRequestView } from '@shared/connections';
import { api, enc, post } from '../../lib/api';
import { toastError } from '../../lib/store';
import { useFeatureEvent } from '../../lib/featureEvents';
import { Button, cx } from '../../components/ui';
import { SecretInput } from './ConnectDialog';

/** The request's name, as the server's openrouter-key.ts gives it. */
export const OPENROUTER_REQUEST = 'OPENROUTER_API_KEY';

/** The session's request for the OpenRouter key, kept up to date; null while there is none. */
function useKeyRequest(sessionKey: string): [SecretRequestView | null | undefined, () => void] {
  const [r, setR] = useState<SecretRequestView | null | undefined>(undefined);
  const load = useCallback(() => {
    api<{ request: SecretRequestView | null }>(`/api/connections/requests?key=${enc(sessionKey)}&name=${OPENROUTER_REQUEST}`)
      .then((x) => setR(x.request))
      .catch(() => setR(null));
  }, [sessionKey]);
  useEffect(load, [load]);
  useFeatureEvent('connections', (e) => (!e.key || e.key === sessionKey) && load());
  return [r, load];
}

/**
 * The card, while the session's request for the OpenRouter key waits for an answer (`always`: also once it was saved or
 * skipped, as request_secret's own card shows it). Nothing otherwise.
 */
export function OpenRouterKeyCard({ sessionKey, always }: { sessionKey: string; always?: boolean }) {
  const [r, load] = useKeyRequest(sessionKey);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  if (!r) return null;
  const shell = (body: React.ReactNode, tone?: 'ok' | 'muted') => (
    <div className={cx('tl-item my-1.5 rounded-2xl border px-3.5 py-3', tone === 'ok' ? 'border-ok/25 bg-ok/6' : tone === 'muted' ? 'border-line bg-bg-1' : 'border-accent/35 bg-accent-soft')}>{body}</div>
  );
  if (r.state !== 'pending') {
    if (!always) return null;
    return r.state === 'saved'
      ? shell(
          <div className="flex items-center gap-2 text-[13px] text-fg-2">
            <CircleCheck size={15} className="shrink-0 text-ok" />
            <span>Your OpenRouter key is saved in Settings → Models.</span>
          </div>,
          'ok',
        )
      : shell(<div className="text-[13px] text-fg-3">You did not give an OpenRouter key.</div>, 'muted');
  }
  const save = async () => {
    if (!value.trim() || busy) return;
    setBusy(true);
    try {
      await post(`/api/connections/requests/${enc(r.id)}`, { value: value.trim() });
      setValue('');
      load();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const skip = async () => {
    setBusy(true);
    await post(`/api/connections/requests/${enc(r.id)}/dismiss`).catch(toastError);
    setBusy(false);
    load();
  };
  return shell(
    <div className="space-y-3">
      <div className="flex items-start gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-accent text-accent-fg">
          <KeyRound size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-medium">This needs an OpenRouter key</div>
          {r.why && (
            <div translate="no" className="mt-0.5 text-[13px] leading-relaxed whitespace-pre-wrap text-fg-2">
              {r.why}
            </div>
          )}
          <div className="mt-1 text-[12.5px] leading-snug text-fg-3">It is kept in Settings → Models → OpenRouter, never in the conversation. Skip it, and this is not made.</div>
        </div>
      </div>
      <SecretInput value={value} onChange={setValue} placeholder="sk-or-…" onEnter={() => void save()} />
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => void save()} disabled={!value.trim() || busy}>
          Save the key
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void skip()} disabled={busy}>
          Skip
        </Button>
        <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-[12.5px] text-accent hover:underline">
          Get a key <ExternalLink size={12} />
        </a>
      </div>
    </div>,
  );
}
