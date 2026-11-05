// The keys an app needs (an API key, a token), where it asks for them: on its form before a run, on the card that
// installs it, and on its card in a session when an agent runs it. A key the vault has shows as saved (its masked
// end), with Change; a missing one gets a field, hidden as it is typed, with where to get one. Values go to the vault
// (Apps → Connected apps → Keys), never into the app or its file; agents use them by name and never see them.
import { useState } from 'react';
import { ExternalLink, KeyRound, LockKeyhole, TriangleAlert } from 'lucide-react';
import type { AppSecretState } from '@shared/app-secrets';
import { enc, post } from '../../lib/api';
import { toast, toastError } from '../../lib/store';
import { Button, cx, inputCls, Throbber } from '../../components/ui';

/** A key as the pages get it (GET /api/apps/:id/secrets): whether the vault has it, and what it does not allow yet. */
export type KeyState = Pick<AppSecretState, 'name' | 'label' | 'help' | 'url' | 'optional' | 'flows'> & { have?: boolean; hint?: string; blocked?: string[]; noCommands?: boolean };

/** The keys a flow needs ("run", the main one, unless said): those that name no flows, and those that name it. */
export const keysFor = (keys: KeyState[] | undefined, flow = 'run') => (keys ?? []).filter((k) => !k.flows?.length || k.flows.includes(flow));

/** What the person typed, by key name, and the saved keys they let go to the app's hosts too. */
export interface KeyInput {
  values: Record<string, string>;
  allow: string[];
}

export const emptyKeys = (): KeyInput => ({ values: {}, allow: [] });

/** The keys still missing once what was typed counts (those it can do without left out). */
export const keysMissing = (keys: KeyState[], input: KeyInput) => keys.filter((k) => !k.have && !k.optional && !input.values[k.name]?.trim());

/** What a request sends of them: only what was typed, and what was allowed. */
export const keysBody = (input: KeyInput) => {
  const values = Object.fromEntries(Object.entries(input.values).filter(([, v]) => v.trim()));
  return { ...(Object.keys(values).length ? { secrets: values } : {}), ...(input.allow.length ? { allow: input.allow } : {}) };
};

function KeyRow({ k, input, onChange, error, disabled, own }: { k: KeyState; input: KeyInput; onChange: (next: KeyInput) => void; error?: string; disabled?: boolean; own?: boolean }) {
  const [changing, setChanging] = useState(false);
  const typed = input.values[k.name] ?? '';
  const ask = !k.have || changing;
  const allowed = input.allow.includes(k.name);
  const words = own ? 'no' : undefined;
  return (
    <div className="py-2.5">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-[13.5px] font-medium" translate={words}>
          {k.label}
        </span>
        <span className="font-mono text-[11.5px] text-fg-3" translate="no">
          {k.name}
        </span>
        {k.optional && <span className="text-[12px] text-fg-3">optional</span>}
        <span className="flex-1" />
        {k.have && !changing && (
          <span className="inline-flex items-center gap-2 text-[12.5px] text-fg-3">
            <span className="inline-flex items-center gap-1 text-ok">
              <LockKeyhole size={12} />
              Saved
            </span>
            {k.hint && (
              <span className="font-mono" translate="no">
                {k.hint}
              </span>
            )}
            {!disabled && (
              <button type="button" className="text-accent hover:underline" onClick={() => setChanging(true)}>
                Change
              </button>
            )}
          </span>
        )}
      </div>
      {k.help && (
        <p className="mt-0.5 text-[12.5px] leading-snug text-fg-3" translate={words}>
          {k.help}
        </p>
      )}
      {ask && (
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            className={cx(inputCls, 'min-w-[220px] flex-1 font-mono text-[13px]', error && 'border-err')}
            placeholder={k.have ? 'A new value' : 'Paste it here'}
            value={typed}
            disabled={disabled}
            aria-label={k.label}
            onChange={(e) => onChange({ ...input, values: { ...input.values, [k.name]: e.target.value } })}
          />
          {k.url && (
            <a href={k.url} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1 text-[12.5px] text-accent hover:underline">
              Get one <ExternalLink size={12} />
            </a>
          )}
          {k.have && changing && (
            <button type="button" className="shrink-0 text-[12.5px] text-fg-3 hover:text-fg" onClick={() => (setChanging(false), onChange({ ...input, values: { ...input.values, [k.name]: '' } }))}>
              Keep the saved one
            </button>
          )}
        </div>
      )}
      {error && <div className="mt-1 text-[12.5px] text-err">{error}</div>}
      {k.have && (k.blocked?.length || k.noCommands) && (
        <label className="mt-1.5 flex cursor-pointer items-start gap-2 rounded-lg bg-warn/10 px-2.5 py-1.5 text-[12.5px] leading-snug">
          <TriangleAlert size={13} className="mt-0.5 shrink-0 text-warn" />
          <span className="min-w-0 flex-1">
            {k.blocked?.length ? (
              <>
                {'Your saved key may not go to '}
                <span translate="no">{k.blocked.join(', ')}</span>
                {', where this app sends it.'}
              </>
            ) : (
              'Your saved key is not allowed in commands, which this app runs with it.'
            )}
          </span>
          <input type="checkbox" className="mt-0.5 accent-[var(--accent)]" checked={allowed} disabled={disabled} onChange={() => onChange({ ...input, allow: allowed ? input.allow.filter((x) => x !== k.name) : [...input.allow, k.name] })} />
          <span className="shrink-0">Allow it</span>
        </label>
      )}
    </div>
  );
}

/**
 * The keys an app needs, as a part of a form or a card: a heading, a line on where they are kept, and a row each.
 * `later`: on the card that installs it, where they may wait for its first run. `own`: the names are someone's own words.
 */
export function AppKeys({ keys, input, onChange, errors, disabled, later, own, className }: { keys: KeyState[]; input: KeyInput; onChange: (next: KeyInput) => void; errors?: Record<string, string>; disabled?: boolean; later?: boolean; own?: boolean; className?: string }) {
  if (!keys.length) return null;
  const missing = keys.filter((k) => !k.have);
  return (
    <section className={className}>
      <div className="flex items-center gap-2">
        <KeyRound size={15} className="shrink-0 text-accent" />
        <h3 className="text-[13.5px] font-semibold">{keys.length === 1 ? 'A key it needs' : 'Keys it needs'}</h3>
      </div>
      <p className="mt-0.5 text-[12.5px] leading-snug text-fg-3">
        {later && missing.length
          ? keys.length === 1
            ? 'Add it now, or when the app first runs. It is kept in your vault, never in the app or its file, and agents use it without seeing it.'
            : 'Add them now, or when the app first runs. They are kept in your vault, never in the app or its file, and agents use them without seeing them.'
          : keys.length === 1
            ? 'Kept in your vault, never in the app or its file: agents use it without seeing it.'
            : 'Kept in your vault, never in the app or its file: agents use them without seeing them.'}
      </p>
      <div className="mt-1 divide-y divide-line">
        {keys.map((k) => (
          <KeyRow key={k.name} k={k} input={input} onChange={onChange} error={errors?.[k.name]} disabled={disabled} own={own} />
        ))}
      </div>
    </section>
  );
}

/**
 * The keys an app still needs, on the page of an app that opens on a screen or a view of its own (no form to run it
 * from there): given and saved here, before its screen runs it.
 */
export function AppKeysCard({ appId, keys, own, onSaved }: { appId: string; keys: KeyState[]; own?: boolean; onSaved: (keys: KeyState[]) => void }) {
  const [input, setInput] = useState<KeyInput>(emptyKeys);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  if (!keys.some((k) => !k.have && !k.optional)) return null;
  const save = async () => {
    const lacking = keysMissing(keys, input);
    setErrors(Object.fromEntries(lacking.map((k) => [k.name, 'Needed to run it'])));
    if (lacking.length) return;
    setBusy(true);
    try {
      const r = await post<{ secrets: KeyState[] }>(`/api/apps/${enc(appId)}/secrets`, { values: input.values, allow: input.allow });
      toast('Saved in your vault', 'ok');
      setInput(emptyKeys());
      onSaved(r.secrets);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="rounded-2xl border border-warn/40 bg-panel px-4 py-3.5">
      <AppKeys keys={keys} input={input} onChange={setInput} errors={errors} disabled={busy} own={own} />
      <div className="mt-2 flex justify-end">
        <Button variant="primary" size="sm" onClick={save} disabled={busy} icon={busy ? <Throbber /> : undefined}>
          Save
        </Button>
      </div>
    </div>
  );
}
