// The OpenRouter key, asked for in a tool's own dialog when what was pressed needs a model through OpenRouter and no
// key is set: a line saying so (and where to get one), the key in a masked field, Save the key (it goes to Settings →
// Models, as that page saves it, and nowhere else: not into a prompt, a note or a log; then the tool goes on with what
// was pressed) and Skip (it does not run, and nothing is spent). Beside them, a way that needs no key, where there is one.
import { useState } from 'react';
import { ExternalLink, KeyRound } from 'lucide-react';
import { put } from '../../../lib/api';
import { Button } from '../../../components/ui';
import { SecretInput } from '../../connections/ConnectDialog';

export function KeyAsk({ onSaved, onSkip, instead }: { onSaved: () => void; onSkip: () => void; instead?: { label: string; run: () => void } }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    const key = value.trim();
    if (!key || busy) return;
    setBusy(true);
    setError(null);
    try {
      await put('/api/models', { openrouterKey: key });
      setValue('');
      onSaved();
    } catch (e) {
      // The server's words about it, never the key.
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2.5 rounded-xl border border-accent/35 bg-accent-soft px-3.5 py-3">
      <div className="flex items-start gap-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] bg-accent text-accent-fg">
          <KeyRound size={15} />
        </span>
        <p className="min-w-0 flex-1 text-[13px] leading-snug text-fg-2">
          This uses a model through OpenRouter, which needs your OpenRouter key: get one at{' '}
          <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-medium text-accent hover:underline">
            openrouter.ai/keys
            <ExternalLink size={11} />
          </a>
        </p>
      </div>
      <SecretInput value={value} onChange={setValue} placeholder="sk-or-…" autoFocus onEnter={() => void save()} />
      {error && <p className="text-[12.5px] leading-snug text-err">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="primary" disabled={!value.trim() || busy} onClick={() => void save()}>
          {busy ? 'Saving it' : 'Save the key'}
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={onSkip}>
          Skip
        </Button>
        {instead && (
          <>
            <span className="flex-1" />
            <span className="text-[12px] text-fg-3">Or, with no key:</span>
            <Button size="sm" variant="secondary" disabled={busy} onClick={instead.run}>
              {instead.label}
            </Button>
          </>
        )}
      </div>
      <p className="text-[12px] leading-snug text-fg-3">It is kept in Settings → Models. Skip it, and this is not made: nothing is spent.</p>
    </div>
  );
}
