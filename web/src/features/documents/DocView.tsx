// A document read on the server (blocks, sheets, slides) drawn as a page: text documents as paper,
// sheets as a grid with their tabs, slides as cards with their notes. All of it is the document's
// text as React text: nothing in a document runs, and only web and mail links become links.
import { Fragment, useState, type ReactNode } from 'react';
import { EyeOff, ImageIcon, Info } from 'lucide-react';
import type { Block, DocModel, DocPart, SheetCells, Span } from '@shared/documents';
import { cx } from '../../components/ui';

const LINK = /^(https?:|mailto:)/i;

function Text({ s }: { s: Span[] }) {
  return (
    <>
      {s.map((x, i) => {
        let el: ReactNode = x.t;
        if (x.href && LINK.test(x.href))
          el = (
            <a href={x.href} target="_blank" rel="noopener noreferrer nofollow" className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent">
              {el}
            </a>
          );
        if (x.i) el = <em>{el}</em>;
        if (x.b) el = <strong className="font-semibold">{el}</strong>;
        return <Fragment key={i}>{el}</Fragment>;
      })}
    </>
  );
}

const HEAD = ['', 'text-[1.6em] font-semibold leading-tight mt-2 mb-3', 'text-[1.3em] font-semibold leading-snug mt-6 mb-2', 'text-[1.12em] font-semibold mt-5 mb-1.5', 'text-[1em] font-semibold mt-4 mb-1', 'text-[0.95em] font-semibold mt-3 mb-1', 'text-[0.9em] font-semibold uppercase tracking-wide text-fg-2 mt-3 mb-1'];

function Picture({ alt }: { alt?: string }) {
  return (
    <div className="my-2 inline-flex max-w-full items-center gap-2 rounded-lg border border-dashed border-line-2 bg-bg-1 px-3 py-2 text-[12.5px] text-fg-3">
      <ImageIcon size={14} className="shrink-0" />
      <span className="min-w-0 truncate">{alt || 'Picture'}</span>
    </div>
  );
}

function Table({ rows, compact }: { rows: string[][]; compact?: boolean }) {
  const width = Math.max(0, ...rows.map((r) => r.length));
  return (
    <div className="my-3 max-w-full overflow-x-auto rounded-lg border border-line">
      <table className={cx('w-full border-collapse', compact ? 'text-[12.5px]' : 'text-[0.93em]')}>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={cx(i === 0 && 'bg-bg-1 font-medium', 'border-b border-line last:border-b-0')}>
              {Array.from({ length: width }, (_, k) => (
                <td key={k} className="border-r border-line px-2.5 py-1.5 align-top whitespace-pre-wrap last:border-r-0">
                  {r[k] ?? ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Blocks({ blocks, compact }: { blocks: Block[]; compact?: boolean }) {
  return (
    <>
      {blocks.map((b, i) => {
        switch (b.k) {
          case 'h':
            return (
              <div key={i} role="heading" aria-level={Math.min(b.level, 6)} className={HEAD[Math.min(Math.max(b.level, 1), 6)]}>
                <Text s={b.s} />
              </div>
            );
          case 'p':
            return (
              <p key={i} className="my-2 whitespace-pre-wrap">
                <Text s={b.s} />
              </p>
            );
          case 'li':
            return (
              <div key={i} className="my-1 flex gap-2 whitespace-pre-wrap" style={{ paddingLeft: `${b.level * 1.4}em` }}>
                <span className={cx('shrink-0 text-fg-3 tabular-nums', b.n ? 'min-w-[1.4em] text-right' : '')}>{b.n ?? '•'}</span>
                <span className="min-w-0">
                  <Text s={b.s} />
                </span>
              </div>
            );
          case 'table':
            return <Table key={i} rows={b.rows} compact={compact} />;
          case 'img':
            return (
              <div key={i}>
                <Picture alt={b.alt} />
              </div>
            );
          case 'pre':
            return (
              <pre key={i} className="my-3 overflow-x-auto rounded-lg bg-code-bg px-3 py-2 font-mono text-[12.5px] whitespace-pre">
                {b.text}
              </pre>
            );
        }
      })}
    </>
  );
}

function colName(i: number): string {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

const NUMERIC = /^[-+(]?[$€£¥]?\s?[\d.,]+(?:E[+-]?\d+)?\s?(%|[$€£¥]|k|\))?$/i;

function Grid({ cells }: { cells: SheetCells }) {
  const width = Math.max(1, ...cells.rows.map((r) => r.c.length));
  if (!cells.rows.length) return <div className="px-4 py-10 text-center text-[13px] text-fg-3">This sheet is empty.</div>;
  return (
    <table className="border-separate border-spacing-0 font-sans text-[12.5px]">
      <thead>
        <tr>
          <th className="sticky top-0 left-0 z-20 h-6 min-w-10 border-r border-b border-line bg-bg-2" />
          {Array.from({ length: width }, (_, k) => (
            <th key={k} className="sticky top-0 z-10 h-6 min-w-16 border-r border-b border-line bg-bg-2 px-2 text-[11px] font-medium text-fg-3">
              {colName(cells.col + k)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {cells.rows.map((r) => (
          <tr key={r.n}>
            <th className="sticky left-0 z-10 border-r border-b border-line bg-bg-2 px-2 text-right text-[11px] font-medium text-fg-3 tabular-nums">{r.n}</th>
            {Array.from({ length: width }, (_, k) => {
              const v = r.c[k] ?? '';
              return (
                <td key={k} title={v.length > 40 ? v : undefined} className={cx('max-w-[22rem] truncate border-r border-b border-line bg-panel px-2 py-1 align-top', NUMERIC.test(v) && 'text-right tabular-nums', v.startsWith('=') && 'font-mono text-[11.5px] text-fg-3')}>
                  {v}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Sheets({ parts }: { parts: DocPart[] }) {
  const [at, setAt] = useState(() => Math.max(0, parts.findIndex((p) => !p.hidden)));
  const p = parts[at] ?? parts[0];
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-auto overscroll-contain bg-bg-1">
        {p?.cells ? <Grid cells={p.cells} /> : <div className="p-6">{p && <Blocks blocks={p.blocks} />}</div>}
      </div>
      {parts.length > 1 && (
        <div role="tablist" className="flex shrink-0 gap-1 overflow-x-auto border-t border-line bg-bg-1 px-2 py-1.5 [&::-webkit-scrollbar]:hidden">
          {parts.map((s, i) => (
            <button
              key={i}
              role="tab"
              aria-selected={i === at}
              onClick={() => setAt(i)}
              className={cx('flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[12.5px] font-medium transition-colors', i === at ? 'bg-panel text-fg shadow-sm ring-1 ring-line' : 'text-fg-3 hover:bg-bg-2 hover:text-fg-2')}
            >
              {s.hidden && <EyeOff size={12} />}
              {s.title || `Sheet ${i + 1}`}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Slides({ parts }: { parts: DocPart[] }) {
  return (
    <div className="mx-auto max-w-[900px] space-y-5 px-3 py-5 sm:px-6">
      {parts.map((p, i) => (
        <section key={i} aria-label={`Slide ${i + 1}`}>
          <div className="mb-1.5 flex items-center gap-2 px-1 text-[12px] text-fg-3">
            <span className="font-medium tabular-nums">Slide {i + 1}</span>
            {p.hidden && (
              <span className="inline-flex items-center gap-1">
                <EyeOff size={12} /> hidden
              </span>
            )}
          </div>
          <div className={cx('aspect-video overflow-hidden rounded-xl border border-line bg-panel shadow-sm', p.hidden && 'opacity-70')}>
            <div className="h-full overflow-y-auto px-5 py-4 text-[13.5px] sm:px-9 sm:py-7 sm:text-[15px]">
              {p.title && <div className="mb-3 text-[1.45em] leading-tight font-semibold whitespace-pre-wrap">{p.title}</div>}
              <Blocks blocks={p.blocks} compact />
              {!p.title && !p.blocks.length && <div className="flex h-full items-center justify-center text-fg-3">No text on this slide</div>}
            </div>
          </div>
          {p.notes && p.notes.length > 0 && (
            <div className="mt-2 rounded-lg bg-bg-2 px-3.5 py-2 text-[12.5px] text-fg-2">
              <div className="mb-0.5 text-[11px] font-medium tracking-wide text-fg-3 uppercase">Notes</div>
              <Blocks blocks={p.notes} compact />
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

function Paper({ doc }: { doc: DocModel }) {
  return (
    <div className="px-0 py-0 sm:px-6 sm:py-6">
      <article className="mx-auto max-w-[820px] bg-panel px-5 py-6 text-[14.5px] leading-relaxed text-fg sm:rounded-xl sm:border sm:border-line sm:px-14 sm:py-12 sm:shadow-sm">
        {doc.parts.map((p, i) => (
          <Fragment key={i}>
            {p.kind === 'extra' && p.title && <div className="mt-8 mb-2 border-t border-line pt-4 text-[1.05em] font-semibold">{p.title}</div>}
            <Blocks blocks={p.blocks} />
          </Fragment>
        ))}
        {!doc.parts.some((p) => p.blocks.length) && <p className="text-fg-3">There is no text in it.</p>}
      </article>
    </div>
  );
}

export function Notes({ notes }: { notes: string[] }) {
  if (!notes.length) return null;
  return (
    <div className="flex items-start gap-2 border-b border-line bg-bg-1 px-3 py-2 text-[12.5px] text-fg-2">
      <Info size={14} className="mt-0.5 shrink-0 text-fg-3" />
      <span>{notes.join(' ')}</span>
    </div>
  );
}

/** The whole document, in the layout its kind wants; fills its box (sheets scroll inside it). */
export function DocView({ doc }: { doc: DocModel }) {
  const sheets = doc.parts.length > 0 && doc.parts.every((p) => p.kind === 'sheet');
  const slides = doc.parts.length > 0 && doc.parts.every((p) => p.kind === 'slide');
  if (sheets) return <Sheets parts={doc.parts} />;
  return <div className="h-full overflow-y-auto overscroll-contain bg-bg-1">{slides ? <Slides parts={doc.parts} /> : <Paper doc={doc} />}</div>;
}
