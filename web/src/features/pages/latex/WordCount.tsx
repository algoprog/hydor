// Tools → Word count in the LaTeX editor: the words of the running text, of the headings, and of the captions and
// footnotes, how many headings, figures and tables, and how many formulas (in the text, and on lines of their own),
// counted roughly as texcount does (shared/latex-count.ts), for the file in view or the whole document as main.tex
// reads it.
import { useMemo, useState } from 'react';
import { TEX_MAIN, type TexDoc } from '@shared/latex';
import { texCount, totalWords } from '@shared/latex-count';
import { Button, Dialog, Segmented } from '../../../components/ui';
import { LOCALE } from '../../../i18n/locale';

export function WordCountDialog({ open, onClose, doc, file, label }: { open: boolean; onClose: () => void; doc: TexDoc | null; file: string; label: (name: string) => string }) {
  const [scope, setScope] = useState<'file' | 'doc'>('doc');
  const isTex = /\.(tex|ltx)$/i.test(file);
  const c = useMemo(() => (doc && open ? texCount(doc, scope === 'file' && isTex ? file : undefined) : null), [doc, open, scope, file, isTex]);
  const n = (x: number) => x.toLocaleString(LOCALE);
  const rows: [string, number, boolean?][] = c
    ? [
        ['Words in the text', c.words],
        ['Words in headings', c.headingWords],
        ['Words in captions and footnotes', c.otherWords],
        ['Words in all', totalWords(c), true],
        ['Headings', c.headings],
        ['Figures and tables', c.floats],
        ['Formulas in the text', c.inline],
        ['Formulas on lines of their own', c.display],
      ]
    : [];
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Word count"
      width={440}
      footer={
        <Button variant="primary" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="space-y-3">
        {isTex && file !== TEX_MAIN ? (
          <Segmented
            size="sm"
            value={scope}
            onChange={setScope}
            options={[
              { value: 'doc', label: 'The whole document' },
              { value: 'file', label: 'This file' },
            ]}
          />
        ) : isTex ? (
          <Segmented
            size="sm"
            value={scope}
            onChange={setScope}
            options={[
              { value: 'doc', label: 'The whole document' },
              { value: 'file', label: 'main.tex alone' },
            ]}
          />
        ) : null}
        {scope === 'file' && isTex && (
          <p translate="no" className="font-mono text-[12px] text-fg-3">
            {label(file)}
          </p>
        )}
        <dl className="divide-y divide-line rounded-xl border border-line">
          {rows.map(([what, v, strong]) => (
            <div key={what} className="flex items-center justify-between gap-3 px-3 py-2 text-[13.5px]">
              <dt className={strong ? 'font-medium text-fg' : 'text-fg-2'}>{what}</dt>
              <dd className={strong ? 'font-semibold text-fg tabular-nums' : 'text-fg tabular-nums'}>{n(v)}</dd>
            </div>
          ))}
        </dl>
        <p className="text-[12px] leading-relaxed text-fg-3">
          Counted as texcount counts: the preamble, commands, labels, references and maths are not words; what \textbf and the like hold is. The whole document counts the files main.tex reads, where it reads them.
        </p>
      </div>
    </Dialog>
  );
}
