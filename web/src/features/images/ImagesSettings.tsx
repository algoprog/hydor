// Settings → Images: whether agents can make images, and with which of OpenRouter's image models
// (its catalog filtered to models whose output includes images). They use the OpenRouter key from
// Settings → Models; without one, this says where to add it.
import { useEffect, useState, type CSSProperties } from 'react';
import { Check, ExternalLink, KeyRound, PenLine, Search, Sparkles, Type, X } from 'lucide-react';
import type { ImageModel, ImagesState } from '@shared/images';
import { api, put } from '../../lib/api';
import { go } from '../../lib/nav';
import { toastError } from '../../lib/store';
import { Button, cx, inputCls, Section, Segmented, Switch, Throbber } from '../../components/ui';

const DAY = 86_400_000;
export const aboutPrice = (n?: number) => (n == null ? undefined : `about $${n >= 0.1 ? n.toFixed(2) : n.toPrecision(1)} an image`);

function Mark({ m }: { m: ImageModel }) {
  const name = m.org ?? m.id.split('/')[0];
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return (
    <span className="org-mark flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] text-[13px] font-semibold" style={{ '--h': h } as CSSProperties} aria-hidden>
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

function Tag({ children, icon, title, tone }: { children: React.ReactNode; icon?: React.ReactNode; title?: string; tone?: 'accent' }) {
  return (
    <span title={title} className={cx('inline-flex items-center gap-1 rounded-md px-1.5 py-px text-[11px] leading-[17px] font-medium whitespace-nowrap', tone === 'accent' ? 'bg-accent-soft text-accent' : 'bg-bg-2 text-fg-2 ring-1 ring-line')}>
      {icon}
      {children}
    </span>
  );
}

function ModelRow({ m, selected, onPick }: { m: ImageModel; selected?: boolean; onPick?: () => void }) {
  const fresh = !!m.created && Date.now() - m.created < 30 * DAY;
  const body = (
    <>
      <Mark m={m} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
          <span className="text-[13.5px] leading-5 font-medium text-fg">{m.label}</span>
          {fresh && <Tag tone="accent">New</Tag>}
          {m.edits && (
            <Tag icon={<PenLine size={11} />} title="Takes pictures to change or follow">
              Edits
            </Tag>
          )}
          {m.textOut && (
            <Tag icon={<Type size={11} />} title="Writes text with its images">
              <span className="max-sm:hidden">Text too</span>
            </Tag>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap gap-x-3 text-[12px] text-fg-3">
          {m.org && <span className="text-fg-2">{m.org}</span>}
          {aboutPrice(m.perImage) && <span title="For one image of about a megapixel; OpenRouter bills by image tokens">{aboutPrice(m.perImage)}</span>}
          {m.created && <span>{new Date(m.created).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</span>}
        </div>
        <div className="mt-0.5 truncate font-mono text-[11px] text-fg-3/80">{m.id}</div>
      </div>
      {selected && <Check size={16} strokeWidth={2.5} className="mt-1 shrink-0 text-accent" />}
    </>
  );
  return onPick ? (
    <button type="button" onClick={onPick} aria-pressed={selected} className={cx('flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-bg-1', selected && 'bg-accent-soft/60')}>
      {body}
    </button>
  ) : (
    <div className="flex items-start gap-3 px-3 py-2.5">{body}</div>
  );
}

export function ImagesSettings() {
  const [st, setSt] = useState<ImagesState | null>(null);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'new' | 'price'>('new');
  const [list, setList] = useState<ImageModel[] | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<ImagesState>('/api/images/settings').then(setSt, toastError);
  }, []);
  useEffect(() => {
    let alive = true;
    setBusy(true);
    const t = setTimeout(
      () =>
        api<{ models: ImageModel[] }>(`/api/images/models?${new URLSearchParams({ q: q.trim(), sort })}`)
          .then((r) => alive && setList(r.models), (e) => alive && (setList([]), toastError(e)))
          .finally(() => alive && setBusy(false)),
      q ? 220 : 0,
    );
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q, sort]);
  const save = (body: Partial<Pick<ImagesState, 'enabled' | 'model'>>) => put<ImagesState>('/api/images/settings', body).then(setSt, toastError);
  if (!st)
    return (
      <div className="flex justify-center py-10 text-fg-3">
        <Throbber size={28} />
      </div>
    );
  const current = st.usingInfo ?? list?.find((m) => m.id === st.using);
  return (
    <div className="space-y-4">
      <p className="text-[13px] leading-relaxed text-fg-3">
        Ask any agent for a picture (“make a logo for my bakery”, “turn this photo into a watercolour”) and it makes it with an image model, saves it in the session’s folder and shows it with its reply.
      </p>
      <Section
        title="Making images"
        sub="Agents get a tool for it. Each image is paid for with your OpenRouter key."
        actions={<Switch on={st.enabled} onChange={(on) => void save({ enabled: on })} label="Let agents make images" />}
      >
        {!st.keySet ? (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-warn/40 bg-warn/10 px-3 py-2.5">
            <KeyRound size={16} className="shrink-0 text-warn" />
            <div className="min-w-[12rem] flex-1 text-[12.5px] leading-snug text-fg-2">
              Image models are reached through OpenRouter, and no key is set yet.{' '}
              <a className="inline-flex items-center gap-0.5 text-accent hover:underline" href="https://openrouter.ai/keys" target="_blank" rel="noreferrer">
                Get one at openrouter.ai <ExternalLink size={11} />
              </a>
            </div>
            <Button size="sm" variant="primary" onClick={() => go('/settings?s=models')}>
              Add the key
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-[12.5px] text-fg-3">
            <Check size={14} className="text-ok" strokeWidth={2.6} />
            {st.enabled ? 'On: agents can make images with your OpenRouter key.' : 'Off: agents are not offered the tool.'}
          </div>
        )}
      </Section>
      <Section title="Image model" sub={st.model ? 'The one you picked.' : 'The app’s choice, until you pick one.'}>
        {current ? (
          <div className="overflow-hidden rounded-xl border border-line">
            <ModelRow m={current} />
          </div>
        ) : (
          <div className="rounded-xl border border-line px-3 py-2.5 font-mono text-[12.5px] text-fg-2">{st.using}</div>
        )}
        {st.model && (
          <button type="button" onClick={() => void save({ model: '' })} className="mt-2 inline-flex items-center gap-1 text-[12.5px] text-accent hover:underline">
            <Sparkles size={12} /> Let the app choose instead
          </button>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[12rem] flex-1">
            <Search size={14} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-3" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search image models: flux, gemini, recraft…" spellCheck={false} className={cx(inputCls, 'pr-9 pl-9')} />
            {busy ? (
              <Throbber className="absolute top-1/2 right-3 -translate-y-1/2 text-fg-3" />
            ) : (
              q && (
                <button type="button" aria-label="Clear" onClick={() => setQ('')} className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1 text-fg-3 hover:bg-bg-2 hover:text-fg">
                  <X size={13} />
                </button>
              )
            )}
          </div>
          <Segmented
            size="sm"
            value={sort}
            onChange={setSort}
            options={[
              { value: 'new', label: 'Newest' },
              { value: 'price', label: 'Cheapest' },
            ]}
          />
        </div>
        {list && (
          <div className="mt-2.5 max-h-[min(520px,60vh)] divide-y divide-line overflow-y-auto overscroll-contain rounded-xl border border-line">
            {list.length ? (
              list.map((m) => <ModelRow key={m.id} m={m} selected={m.id === st.using} onPick={() => void save({ model: m.id })} />)
            ) : (
              <div className="px-3 py-6 text-center text-[12.5px] text-fg-3">{q ? 'No image model matches.' : 'OpenRouter’s list could not be loaded.'}</div>
            )}
          </div>
        )}
      </Section>
    </div>
  );
}
