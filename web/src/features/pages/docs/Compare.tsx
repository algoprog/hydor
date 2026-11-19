// A document compared with one of its versions, as Word's Compare and Google Docs' version history show it: the
// document with what changed since that version marked in its words (words added green and underlined, words taken out
// red and struck, a new look dotted under, paragraphs and blocks added or taken out with a bar at their side), each
// change listed beside it (a click goes to it), Restore this version (the page's restore: it comes back as a new
// version) and the way back to the document. The versions to compare with are picked from a list of them. Nothing here
// changes the document; the comparison itself is shared/doc-changes.ts's.
import { useMemo, useRef, useState } from 'react';
import { ArrowLeft, History, RotateCcw } from 'lucide-react';
import { changesOf } from '@shared/doc-changes';
import { blockHtml, docCss, listInfo, pageMargins, PAPERS, tocEntries, type Doc, type MathDraw } from '@shared/docs';
import { ago } from '../../../lib/format';
import { Button, cx } from '../../../components/ui';
import { ChangeLines } from './Suggestions';

/** What was added and what was taken out, in the colours Word's Compare uses. */
const ADDED = '#188038';
const REMOVED = '#c5221f';

/** The list of versions to pick one from (shared with the spreadsheet's Compare). */
export { VersionsDialog } from '../common/VersionsDialog';

/** A document's margins as CSS padding: top, right, bottom, left. */
const marginsCss = (d: Doc) => {
  const m = pageMargins(d.page);
  return `${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm`;
};

/** The document compared with a version: `merged` is compareDocs(that version, the document). */
export function CompareView({
  merged,
  version,
  at,
  src,
  math,
  phone,
  onRestore,
  onBack,
  backLabel,
}: {
  merged: Doc;
  version: number;
  /** When the version was saved. */
  at?: number;
  src: (s: string) => string;
  math: MathDraw;
  phone: boolean;
  onRestore?: () => void;
  onBack?: () => void;
  backLabel?: string;
}) {
  const paper = useRef<HTMLDivElement>(null);
  const changes = useMemo(() => changesOf(merged), [merged]);
  const [active, setActive] = useState<string | null>(null);
  const html = useMemo(() => {
    const { labels } = listInfo(merged.blocks);
    const toc = tocEntries(merged);
    return merged.blocks.map((b, i) => blockHtml(b, labels[i], { src, math, toc })).join('');
  }, [merged, src, math]);
  const css = useMemo(
    () =>
      [
        docCss(merged, '.nd-cmp'),
        // Added green, taken out red, whoever did it; the change picked shaded.
        `.nd-cmp [data-s]{--sc:${ADDED}}`,
        `.nd-cmp del.nd-del,.nd-cmp .nd-sdel{--sc:${REMOVED}}`,
        `.nd-cmp .nd-fmt{--sc:#1a73e8}`,
        active ? `.nd-cmp [data-s="${CSS.escape(active)}"]:is(ins,del,span){background:color-mix(in srgb,var(--sc) 15%,transparent)}` : '',
      ].join('\n'),
    [merged, active],
  );
  const go = (id: string) => {
    setActive(id);
    const el = paper.current?.querySelector(`[data-s="${CSS.escape(id)}"]`);
    el?.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior });
  };
  const list = (
    <div className="space-y-2">
      {changes.map((c) => (
        <button key={c.id} type="button" onClick={() => go(c.id)} className={cx('block w-full rounded-xl border bg-elevated p-2.5 text-left', active === c.id ? 'border-accent/60 shadow-md' : 'border-line hover:border-line-2')}>
          <ChangeLines c={c} color={ADDED} removedColor={REMOVED} past />
        </button>
      ))}
      {!changes.length && <p className="px-1 py-4 text-center text-[12.5px] text-fg-3">Nothing changed since this version.</p>}
    </div>
  );
  return (
    <div className="absolute inset-0 z-20 flex min-h-0 flex-col bg-bg">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-panel px-3 py-2 text-[12.5px]">
        <History size={15} className="shrink-0 text-fg-3" />
        <span className="min-w-0 flex-1 text-fg-2">
          <span>{`What changed since version ${version}`}</span>
          {at ? <span className="text-fg-3">{` · ${ago(at)}`}</span> : null}
          <span className="text-fg-3">{` · ${changes.length} change${changes.length === 1 ? '' : 's'}`}</span>
        </span>
        {onRestore && (
          <Button size="sm" variant="primary" icon={<RotateCcw size={14} />} onClick={onRestore} className="h-7">
            Restore this version
          </Button>
        )}
        {onBack && (
          <Button size="sm" variant="ghost" icon={<ArrowLeft size={14} />} onClick={onBack} className="h-7">
            {backLabel ?? 'Back to the document'}
          </Button>
        )}
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="min-h-0 min-w-0 flex-1 overflow-auto bg-bg-2">
          <style>{css}</style>
          {phone && <div className="border-b border-line bg-panel p-3">{list}</div>}
          <div className={phone ? '' : 'px-6 pt-6 pb-[30vh]'}>
            <div
              ref={paper}
              translate="no"
              className={cx('nd-cmp mx-auto bg-white', phone ? 'px-[18px] py-5' : 'rounded-[2px] shadow-[0_1px_3px_rgba(0,0,0,.12),0_8px_28px_rgba(0,0,0,.08)]')}
              style={phone ? undefined : { width: `${PAPERS[merged.page.size]?.w ?? 210}mm`, minHeight: '120mm', padding: marginsCss(merged) }}
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </div>
        </div>
        {!phone && <aside className="w-[300px] shrink-0 overflow-y-auto border-l border-line bg-panel p-3">{list}</aside>}
      </div>
    </div>
  );
}
