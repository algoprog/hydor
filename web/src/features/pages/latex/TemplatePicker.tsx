// The templates a new LaTeX document can start from, in the Library's New dialog: an article, a report, a book or
// thesis, a letter, beamer slides, a CV, a problem set, a conference paper and a poster (shared/latex-templates.ts),
// each with a line on what it has; a paper's style (two columns, or as IEEE, ACM or Springer's LNCS ask) is picked
// under the cards. Those needing a class or package this computer's TeX lacks are left out (all are offered when that
// is not known, when there is no TeX here to typeset any of them, and with MiKTeX, which installs what they need by
// itself), and a line under the cards names them and what to run to add them.
import { useEffect, useState } from 'react';
import { TEX_TEMPLATES, texTemplate, type TexTemplate, type TexTemplateId } from '@shared/latex-templates';
import type { TexSetup } from '@shared/latex';
import { cx, Segmented } from '../../../components/ui';
import { tr } from '../../../i18n/runtime';
import { texSetup } from './api';

/** The templates this computer can typeset, those it cannot, and the command that adds what they need. */
export function useTexTemplates(): { list: TexTemplate[]; missing: TexTemplate[]; add?: string } {
  const [setup, setSetup] = useState<TexSetup | null>(null);
  useEffect(() => {
    texSetup().then(setSetup, () => {});
  }, []);
  const have = setup?.installed && !setup.missing && !setup.add?.auto ? new Set(setup.installed) : null;
  const can = (t: TexTemplate) => !have || t.needs.every((n) => have.has(n));
  return { list: TEX_TEMPLATES.filter(can), missing: TEX_TEMPLATES.filter((t) => !can(t)), add: setup?.add?.cmd };
}

export function TexTemplatePicker({ value, onChange }: { value: TexTemplateId; onChange: (t: TexTemplate) => void }) {
  const { list, missing, add } = useTexTemplates();
  const picked = texTemplate(value);
  // A family (the papers) is one card: the style picked, else its first one here.
  const styles = picked?.family ? list.filter((t) => t.family === picked.family) : [];
  const cards = list.filter((t) => !t.family || t === list.find((x) => x.family === t.family));
  const isOn = (t: TexTemplate) => value === t.id || (!!t.family && t.family === picked?.family);
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2 max-sm:grid-cols-2" role="radiogroup" aria-label="Start from">
        {cards.map((t) => {
          // The family's card says what the family is: the first of it (the plain paper) has those words.
          const face = t.family ? (TEX_TEMPLATES.find((x) => x.family === t.family) ?? t) : t;
          return (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={isOn(t)}
              onClick={() => (isOn(t) ? undefined : onChange(t))}
              className={cx('rounded-xl border px-3 py-2 text-left transition-colors', isOn(t) ? 'border-accent/60 bg-accent-soft' : 'border-line hover:border-line-2 hover:bg-bg-1')}
            >
              <span className="block text-[13px] font-medium text-fg">{face.label}</span>
              <span className="block text-[11.5px] leading-snug text-fg-3">{face.hint}</span>
            </button>
          );
        })}
      </div>
      {styles.length > 1 && (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <span className="text-[12.5px] font-medium text-fg-2">Paper style</span>
          <Segmented size="sm" value={value} onChange={(id) => onChange(texTemplate(id)!)} options={styles.map((t) => ({ value: t.id, label: t.style ?? t.label }))} />
        </div>
      )}
      {missing.length > 0 && (
        <p className="text-[12px] leading-relaxed text-fg-3">
          <span>{`Not on this computer yet: ${missing.map((t) => tr(t.label)).join(', ')}.`}</span>{' '}
          {add ? (
            <>
              <span>{missing.length === 1 ? 'To add it, run this on the computer the app runs on:' : 'To add them, run this on the computer the app runs on:'}</span>{' '}
              <code translate="no" className="rounded bg-bg-2 px-1 py-px font-mono text-[11.5px] break-all text-fg-2 select-all">
                {add}
              </code>
            </>
          ) : (
            <span>{missing.length === 1 ? 'Your TeX can add what it needs.' : 'Your TeX can add what they need.'}</span>
          )}
        </p>
      )}
    </div>
  );
}
