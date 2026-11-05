// The templates a new LaTeX document can start from, in the Library's New dialog: an article, a report, a book or
// thesis, a letter, beamer slides, a CV, a problem set, a two-column paper and a poster (shared/latex-templates.ts),
// each with a line on what it has. Those needing a class or package this computer's TeX lacks are left out (all are
// offered when that is not known, or there is no TeX here to typeset any of them).
import { useEffect, useState } from 'react';
import { TEX_TEMPLATES, type TexTemplate, type TexTemplateId } from '@shared/latex-templates';
import type { TexSetup } from '@shared/latex';
import { cx } from '../../../components/ui';
import { texSetup } from './api';

/** The templates this computer can typeset. */
export function useTexTemplates(): TexTemplate[] {
  const [setup, setSetup] = useState<TexSetup | null>(null);
  useEffect(() => {
    texSetup().then(setSetup, () => {});
  }, []);
  const have = setup?.installed && !setup.missing ? new Set(setup.installed) : null;
  return TEX_TEMPLATES.filter((t) => !have || t.needs.every((n) => have.has(n)));
}

export function TexTemplatePicker({ value, onChange }: { value: TexTemplateId; onChange: (t: TexTemplate) => void }) {
  const list = useTexTemplates();
  return (
    <div className="grid grid-cols-3 gap-2 max-sm:grid-cols-2" role="radiogroup" aria-label="Start from">
      {list.map((t) => (
        <button
          key={t.id}
          type="button"
          role="radio"
          aria-checked={value === t.id}
          onClick={() => onChange(t)}
          className={cx('rounded-xl border px-3 py-2 text-left transition-colors', value === t.id ? 'border-accent/60 bg-accent-soft' : 'border-line hover:border-line-2 hover:bg-bg-1')}
        >
          <span className="block text-[13px] font-medium text-fg">{t.label}</span>
          <span className="block text-[11.5px] leading-snug text-fg-3">{t.hint}</span>
        </button>
      ))}
    </div>
  );
}
