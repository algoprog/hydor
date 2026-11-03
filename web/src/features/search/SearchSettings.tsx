// Settings → Search: the providers agents search the web with, in the order they are tried (the first
// one on is the default), their keys and addresses, a test of each, Naget Search's free allowance,
// and how many results a search brings.
import { useCallback, useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Check, ExternalLink, KeyRound, Play, X } from 'lucide-react';
import type { NagetCredits, SearchEvent, SearchProviderView, SearchSettingsView, SearchTestResult } from '@shared/search';
import { siteOf } from '@shared/search';
import { api, post, put } from '../../lib/api';
import { useFeatureEvent } from '../../lib/featureEvents';
import { ago, duration, untilText } from '../../lib/format';
import { toastError } from '../../lib/store';
import { Badge, Button, cx, IconButton, inputCls, Section, Segmented, Switch, Throbber } from '../../components/ui';

type Patch = { order?: string[]; defaultK?: number; provider?: { id: string; enabled?: boolean; key?: string | null; url?: string | null } };

export function SearchSettings() {
  const [st, setSt] = useState<SearchSettingsView | null>(null);
  const load = useCallback(() => api<SearchSettingsView>('/api/search/settings').then(setSt, toastError), []);
  useEffect(() => {
    void load();
  }, [load]);
  useFeatureEvent('search', (e) => {
    const d = e.data as SearchEvent;
    if (d?.kind === 'credits') setSt((s) => s && { ...s, credits: d.credits });
    else void load();
  });
  const save = (p: Patch) => put<SearchSettingsView>('/api/search/settings', p).then(setSt, (e) => (toastError(e), Promise.reject(e)));
  if (!st)
    return (
      <div className="flex justify-center py-10 text-fg-3">
        <Throbber size={28} />
      </div>
    );
  const ids = st.providers.map((p) => p.id);
  const first = st.providers.find((p) => p.enabled)?.id;
  const move = (id: string, to: number) => {
    const next = ids.filter((x) => x !== id);
    next.splice(Math.max(0, Math.min(to, next.length)), 0, id);
    void save({ order: next }).catch(() => {});
  };
  return (
    <div className="space-y-4">
      <p className="text-[13px] leading-relaxed text-fg-3">
        Every agent can search the web and read pages, whatever its model. The first provider that is on answers; when it can’t (no key yet, a limit reached), the next one does.
      </p>
      <Section title="Providers" sub="Tried from the top. The first one that is on is the default.">
        <div className="-my-1 divide-y divide-line">
          {st.providers.map((p, i) => (
            <ProviderRow
              key={p.id}
              p={p}
              isDefault={p.id === first}
              credits={p.id === 'naget' ? st.credits : undefined}
              up={i > 0 ? () => move(p.id, i - 1) : undefined}
              down={i < ids.length - 1 ? () => move(p.id, i + 1) : undefined}
              makeDefault={() => move(p.id, 0)}
              save={save}
            />
          ))}
        </div>
      </Section>
      <Section
        title="Results per search"
        sub="Agents get this many unless they ask for more: up to 100, for deeper searches such as finding papers."
        actions={
          <Segmented
            size="sm"
            value={String(st.defaultK)}
            options={['10', '20', '50', '100'].map((v) => ({ value: v, label: v }))}
            onChange={(v) => void save({ defaultK: Number(v) }).catch(() => {})}
          />
        }
      >
        <p className="text-[12.5px] leading-relaxed text-fg-3">More results cost an agent more reading. With filtered snippets each result brings the sentences of its page that answer the search.</p>
      </Section>
      <p className="px-1 text-[12.5px] leading-relaxed text-fg-3">
        Search results and pages are outside data: agents are told to use them as information, never as instructions. Another provider can be added in one file:{' '}
        <a className="text-accent hover:underline" href="https://github.com/algoprog/hydor/blob/main/docs/search-providers.md" target="_blank" rel="noreferrer">
          how to add a provider
        </a>
        .
      </p>
    </div>
  );
}

/** Naget Search's allowance, from its latest answer. */
function Allowance({ c, keyed }: { c?: NagetCredits; keyed: boolean }) {
  if (!c) return null;
  const reset = c.resetAt ? Date.parse(c.resetAt) : NaN;
  const resets = Number.isFinite(reset) && reset > Date.now() ? ` · more ${untilText(reset)}` : '';
  if (c.exhausted)
    return (
      <div className="mt-1.5 text-[12px] text-warn">
        Today’s {keyed ? 'credits are' : 'free allowance is'} used up{resets}. The next provider answers meanwhile.
      </div>
    );
  if (c.remaining == null) return null;
  const n = (v: number) => Math.round(v).toLocaleString();
  const share = c.limit ? Math.max(0, Math.min(1, c.remaining / c.limit)) : null;
  return (
    <div className="mt-1.5 max-w-sm">
      <div className="flex items-baseline justify-between gap-2 text-[12px] text-fg-3">
        <span>
          {keyed ? 'Credits left' : 'Free allowance left today'}: <span className="tnum text-fg-2">{n(c.remaining)}</span>
          {c.limit ? <span className="tnum"> of {n(c.limit)}</span> : null}
        </span>
        <span className="shrink-0">{resets.replace(' · ', '')}</span>
      </div>
      {share != null && (
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-fg/10">
          <div className={cx('h-full rounded-full transition-[width] duration-500', share < 0.1 ? 'bg-warn' : 'bg-accent')} style={{ width: `${share * 100}%` }} />
        </div>
      )}
    </div>
  );
}

/** What a provider can keep a search to, in a few words. */
function abilities(p: SearchProviderView): string {
  const c = p.caps;
  const out = [`up to ${c.maxK} results`];
  if (c.categories) out.push('categories');
  if (c.dates) out.push('dates');
  if (c.homepagesOnly) out.push('home pages');
  if (c.filteredSnippets) out.push('the parts of pages that answer');
  return out.join(' · ').replace(/^u/, 'U');
}

function ProviderRow({
  p,
  isDefault,
  credits,
  up,
  down,
  makeDefault,
  save,
}: {
  p: SearchProviderView;
  isDefault: boolean;
  credits?: NagetCredits;
  up?: () => void;
  down?: () => void;
  makeDefault: () => void;
  save: (p: Patch) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState('');
  const [url, setUrl] = useState(p.url?.value ?? '');
  const [test, setTest] = useState<SearchTestResult | 'busy' | null>(null);
  useEffect(() => setUrl(p.url?.value ?? ''), [p.url?.value]);
  const takesKey = p.key !== 'none';
  const urlChanged = !!p.url && url.trim() !== (p.url.value ?? '');
  const run = () => {
    setTest('busy');
    post<SearchTestResult>('/api/search/test', { id: p.id, key: key.trim() || undefined, url: urlChanged ? url.trim() : undefined }).then(setTest, (e) => setTest({ ok: false, ms: 0, error: (e as Error).message }));
  };
  const saveSetup = () =>
    save({ provider: { id: p.id, ...(key.trim() ? { key: key.trim() } : {}), ...(urlChanged ? { url: url.trim() || null } : {}) } }).then(() => {
      setKey('');
      setOpen(false);
    }, () => {});
  // Naget Search refused without a key: say so plainly, the next provider answers meanwhile.
  const needsKeyNow = p.id === 'naget' && !p.keyHint && p.lastError?.kind === 'auth';
  const setupLabel = takesKey ? (p.keyHint ? 'Change the key' : 'Add a key') : p.url?.value ? 'Change the address' : 'Set the address';
  return (
    <div className="py-3">
      <div className="flex items-start gap-2.5">
        <div className="-my-0.5 flex shrink-0 flex-col">
          <IconButton label="Try earlier" size="sm" disabled={!up} onClick={up}>
            <ArrowUp size={13} />
          </IconButton>
          <IconButton label="Try later" size="sm" disabled={!down} onClick={down}>
            <ArrowDown size={13} />
          </IconButton>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={cx('text-[13.5px] font-medium', !p.enabled && 'text-fg-2')}>{p.name}</span>
            {isDefault && <Badge tone="ok">Default</Badge>}
            {p.missing && <Badge tone="warn">{p.missing}</Badge>}
          </div>
          <p className="mt-0.5 text-[12.5px] leading-snug text-fg-3">{p.description}</p>
          <p className="mt-0.5 text-[11.5px] text-fg-3/90">{abilities(p)}</p>
          {p.keyHint && (
            <div className="mt-1 flex items-center gap-1.5 text-[12px] text-fg-3">
              <KeyRound size={12} />
              <span className="font-mono text-[11.5px]">{p.keyHint}</span>
            </div>
          )}
          {p.id === 'naget' && <Allowance c={credits} keyed={!!p.keyHint} />}
          {needsKeyNow ? (
            <div className="mt-1.5 text-[12px] leading-snug text-warn">Naget Search needs a key for now. Until it has one, the next provider answers.</div>
          ) : (
            p.lastError &&
            p.enabled && (
              <div className="mt-1.5 text-[12px] leading-snug text-err">
                {p.lastError.message} <span className="text-fg-3">· {ago(p.lastError.at) || 'just now'}</span>
              </div>
            )
          )}
          <div className="mt-1.5 -ml-2 flex flex-wrap items-center gap-0.5">
            {(takesKey || p.url) && (
              <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)}>
                {open ? 'Close' : setupLabel}
              </Button>
            )}
            <Button size="sm" variant="ghost" icon={<Play size={12} />} disabled={test === 'busy'} onClick={run}>
              Test
            </Button>
            {p.enabled && !isDefault && (
              <Button size="sm" variant="ghost" onClick={makeDefault}>
                Make default
              </Button>
            )}
          </div>
          {open && (
            <form
              className="mt-2 space-y-2 rounded-xl border border-line bg-bg-1 p-3"
              onSubmit={(e) => {
                e.preventDefault();
                void saveSetup();
              }}
            >
              {takesKey && (
                <div>
                  <label className="mb-1 block text-[12px] font-medium text-fg-2" htmlFor={`key-${p.id}`}>
                    {p.keyHint ? 'A new key' : 'Key'}
                    {p.key === 'optional' && <span className="font-normal text-fg-3"> · optional, for more searches</span>}
                  </label>
                  <input id={`key-${p.id}`} type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Paste the key" autoComplete="off" className={inputCls} />
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-fg-3">
                    {p.keyUrl && (
                      <a className="inline-flex items-center gap-0.5 text-accent hover:underline" href={p.keyUrl} target="_blank" rel="noreferrer">
                        Get one at {siteOf(p.keyUrl)} <ExternalLink size={11} />
                      </a>
                    )}
                    {p.keyHint && (
                      <button type="button" className="text-fg-3 hover:text-err" onClick={() => void save({ provider: { id: p.id, key: null } }).catch(() => {})}>
                        Remove the saved key
                      </button>
                    )}
                  </div>
                </div>
              )}
              {p.url && (
                <div>
                  <label className="mb-1 block text-[12px] font-medium text-fg-2" htmlFor={`url-${p.id}`}>
                    Address
                    {!p.url.required && p.url.default && <span className="font-normal text-fg-3"> · {p.url.default} unless set</span>}
                  </label>
                  <input id={`url-${p.id}`} value={url} onChange={(e) => setUrl(e.target.value)} placeholder={p.url.placeholder} autoComplete="off" spellCheck={false} className={inputCls} />
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" variant="primary" disabled={!key.trim() && !urlChanged}>
                  Save
                </Button>
              </div>
            </form>
          )}
          {test && (
            <div className="mt-2 rounded-xl border border-line px-3 py-2 text-[12.5px]">
              {test === 'busy' ? (
                <span className="flex items-center gap-2 text-fg-3">
                  <Throbber /> Searching with {p.name}…
                </span>
              ) : test.ok ? (
                <>
                  <div className="flex items-center gap-1.5 text-ok">
                    <Check size={13} strokeWidth={2.6} />
                    Works: {test.count} result{test.count === 1 ? '' : 's'} in {duration(test.ms)}
                  </div>
                  {test.sample?.map((r) => (
                    <a key={r.url} href={r.url} target="_blank" rel="noopener noreferrer" className="mt-0.5 block truncate text-fg-3 hover:text-accent">
                      <span translate="no">{r.title}</span> <span className="text-fg-3/70">· {siteOf(r.url)}</span>
                    </a>
                  ))}
                </>
              ) : (
                <div className="flex items-start gap-1.5 text-err">
                  <X size={13} className="mt-[2px] shrink-0" />
                  <span>{test.error}</span>
                </div>
              )}
            </div>
          )}
        </div>
        <Switch on={p.enabled} label={`Use ${p.name}`} onChange={(on) => void save({ provider: { id: p.id, enabled: on } }).catch(() => {})} />
      </div>
    </div>
  );
}
