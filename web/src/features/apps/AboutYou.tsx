// Settings → Apps → About you: the one record apps start their questions from (shared/app-me.ts), so they don't ask
// the same things every run. A row a field, in three groups; the two later ones folded until opened. What is not set
// and can be worked out (the country from the time zone, units and currency from the country, the language from the
// app's) shows greyed with where it came from, and setting the field overrides it. Each change is saved as it is made.
import { useEffect, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { ME_FIELDS, ME_GROUPS, type AboutMe, type MeField, type MeGroup, type MeId, type MeSource } from '@shared/app-me';
import { api, put } from '../../lib/api';
import { tr } from '../../i18n/runtime';
import { currentLang } from '../../i18n/locale';
import { toastError } from '../../lib/store';
import { cx, Throbber } from '../../components/ui';
import { Group, Row } from '../settings/kit';

export interface MeView {
  me: AboutMe;
  values: AboutMe;
  derived: Partial<Record<MeId, MeSource>>;
}

const SOURCE: Record<MeSource, string> = { timezone: 'From your time zone', country: 'From your country', app: 'From the language you use Hydor in' };

/** Countries, currencies and languages by their names in the page's language ("GR" → "Greece"). */
function nameOf(kind: 'region' | 'currency' | 'language', code: string): string {
  try {
    return new Intl.DisplayNames([currentLang()], { type: kind }).of(code) || code;
  } catch {
    return code;
  }
}

/** A field's value as text, as the page shows it. */
function shown(f: MeField, v: AboutMe[MeId] | undefined): string {
  if (v === undefined || v === null) return '';
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'object') return v.name;
  if (f.id === 'country') return nameOf('region', String(v));
  if (f.id === 'currency') return `${nameOf('currency', String(v))} (${v})`;
  if (f.id === 'language') return nameOf('language', String(v));
  if (f.id === 'units') return v === 'imperial' ? tr('Imperial') : tr('Metric');
  return String(v);
}

const box = 'h-8 rounded-lg border border-line-2 bg-bg-1 px-2.5 text-[13.5px] outline-none transition-colors placeholder:text-fg-3 focus:border-accent/60 focus:ring-3 focus:ring-accent/15';

/** A box that saves when it is left (or on Enter), and shows the saved value again when it changes elsewhere. */
function TextBox({ value, onSave, placeholder, label, className, numeric }: { value: string; onSave: (v: string) => void; placeholder?: string; label: string; className?: string; numeric?: boolean }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const done = () => v.trim() !== value.trim() && onSave(v.trim());
  return (
    <input
      aria-label={label}
      className={cx(box, className)}
      value={v}
      inputMode={numeric ? 'numeric' : undefined}
      placeholder={placeholder ? tr(placeholder) : undefined}
      onChange={(e) => setV(e.target.value)}
      onBlur={done}
      onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
      autoComplete="off"
    />
  );
}

/** A choice from a list: what is set, or (greyed) what is worked out, or nothing. */
function Choice({ f, view, onSave }: { f: MeField; view: MeView; onSave: (v: string | null) => void }) {
  const set = view.me[f.id] as string | undefined;
  const derived = view.derived[f.id] ? (view.values[f.id] as string) : undefined;
  const opts = (f.options ?? []).map((o) => ({ value: o, label: shown(f, o) }));
  // Names in alphabetical order for the long lists, in the page's language.
  if (f.id !== 'units' && f.id !== 'language') opts.sort((a, b) => a.label.localeCompare(b.label, currentLang()));
  // A value set that is not among the options (a language the list lacks) stays offered.
  if (set && !opts.some((o) => o.value === set)) opts.unshift({ value: set, label: shown(f, set) });
  return (
    <select aria-label={tr(f.label)} className={cx(box, 'w-[15rem] max-w-full pr-7', !set && 'text-fg-3')} value={set ?? ''} onChange={(e) => onSave(e.target.value || null)}>
      <option value="">{derived ? shown(f, derived) : tr('Not set')}</option>
      {opts.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function FieldRow({ f, view, onSave }: { f: MeField; view: MeView; onSave: (patch: Partial<Record<MeId, unknown>>) => void }) {
  const source = !view.me[f.id] ? view.derived[f.id] : undefined;
  const v = view.me[f.id];
  let control: ReactNode;
  if (f.kind === 'choice') control = <Choice f={f} view={view} onSave={(x) => onSave({ [f.id]: x })} />;
  else if (f.id === 'author') {
    const a = view.me.author;
    control = (
      <div className="flex w-[15rem] max-w-full flex-col gap-1.5">
        <TextBox label={tr(f.label)} value={a?.name ?? ''} placeholder={f.placeholder} onSave={(name) => onSave({ author: name ? { name, id: a?.id } : null })} />
        <TextBox label={tr('ORCID or OpenAlex id')} value={a?.id ?? ''} placeholder="ORCID or OpenAlex id" onSave={(id) => a?.name && onSave({ author: { name: a.name, id } })} />
      </div>
    );
  } else control = <TextBox label={tr(f.label)} value={shown(f, v)} placeholder={f.placeholder} numeric={f.kind === 'number'} className={f.kind === 'number' ? 'w-[6rem]' : 'w-[15rem] max-w-full'} onSave={(x) => onSave({ [f.id]: x || null })} />;
  return <Row label={tr(f.label)} hint={source ? tr(SOURCE[source]) : undefined} control={control} />;
}

/** A group's line when it is folded: what it holds (the person's own words), or that nothing is set. */
function summary(fields: MeField[], view: MeView): ReactNode {
  const set = fields.map((f) => shown(f, view.me[f.id])).filter(Boolean);
  return set.length ? <span translate="no">{set.join(' · ')}</span> : tr('Nothing yet');
}

export function AboutYou() {
  const [view, setView] = useState<MeView | null>(null);
  const [open, setOpen] = useState<Set<MeGroup>>(new Set(['You']));
  useEffect(() => {
    let live = true;
    api<MeView>('/api/apps/me')
      .then((r) => live && setView(r))
      .catch(toastError);
    return () => {
      live = false;
    };
  }, []);
  const save = async (patch: Partial<Record<MeId, unknown>>) => {
    try {
      setView(await put<MeView>('/api/apps/me', patch));
    } catch (e) {
      toastError(e);
    }
  };
  return (
    <Group
      title="About you"
      hint="What apps start their questions from, so they don’t ask every time."
      info="Apps that ask about you (your units, your currency, where you live, your research fields…) fill those questions in from here, and their steps can read it. Only you change it: an agent that wants to asks you first. What you leave empty is worked out where it can be, and public pages never see any of it."
    >
      {!view ? (
        <div className="flex justify-center px-4 py-5">
          <Throbber className="text-fg-3" />
        </div>
      ) : (
        ME_GROUPS.map((g) => {
          const fields = ME_FIELDS.filter((f) => f.group === g);
          const shownNow = g === 'You' || open.has(g);
          return (
            <div key={g} className="divide-y divide-line">
              {g !== 'You' && (
                <button
                  type="button"
                  aria-expanded={shownNow}
                  onClick={() => setOpen((s) => new Set(s.has(g) ? [...s].filter((x) => x !== g) : [...s, g]))}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors outline-none hover:bg-bg-1 focus-visible:bg-bg-1"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] leading-snug text-fg">{tr(g)}</span>
                    {!shownNow && (
                      <span className="mt-0.5 block truncate text-[12.5px] leading-snug text-fg-3">{summary(fields, view)}</span>
                    )}
                  </span>
                  <ChevronDown size={16} className={cx('shrink-0 text-fg-3 transition-transform duration-200', shownNow && 'rotate-180')} />
                </button>
              )}
              {shownNow && fields.map((f) => <FieldRow key={f.id} f={f} view={view} onSave={save} />)}
            </div>
          );
        })
      )}
    </Group>
  );
}
