// Tools → Compare versions in the LaTeX editor: pick an earlier version of the document and see, file by file, the
// lines added since and taken out, side by side or one under the other, against what is in the editor now (changes
// not saved yet included). A file can be brought back as it was in that version (it is changed in the editor, not
// saved, so Undo takes it back); files that are only in one of the two say so, and so do pictures added or taken out.
import { useEffect, useMemo, useRef, useState } from 'react';
import { History, Pencil, RotateCcw } from 'lucide-react';
import { TEX_MAIN, texFileText, type TexDoc } from '@shared/latex';
import { VERSION_NAME_MAX, type PageVersion } from '@shared/pages';
import { DiffStat, DiffView } from '../../../components/DiffView';
import { Button, cx, Dialog, IconButton, inputCls, Segmented, Throbber, useMediaQuery } from '../../../components/ui';
import { tr } from '../../../i18n/runtime';
import { LOCALE } from '../../../i18n/locale';
import { api, enc } from '../../../lib/api';
import { toastError } from '../../../lib/store';
import { loadModelVersion } from '../kinds';
import { lineDiff } from './linediff';
import { nameVersion } from './api';

const BY: Record<PageVersion['by'], string> = { agent: 'by the agent', user: 'kept by you', restore: 'brought back', edit: 'changed by you', made: 'made by you' };
const SPLIT_KEY = 'wa.tex.compare.split';
const when = (t: number) => new Date(t).toLocaleString(LOCALE, { dateStyle: 'medium', timeStyle: 'short' });

export function CompareDialog({
  open,
  onClose,
  pageId,
  current,
  dirty,
  readOnly,
  label,
  onRestore,
}: {
  open: boolean;
  onClose: () => void;
  pageId: string;
  /** What is in the editor now. */
  current: TexDoc;
  /** It has changes not saved yet (then the latest version is worth comparing with). */
  dirty: boolean;
  readOnly?: boolean;
  /** A file's name as the tabs show it. */
  label: (name: string) => string;
  /** A file as it was: its text (null: it was not there, so it goes). */
  onRestore: (name: string, text: string, version: number) => void;
}) {
  const wide = useMediaQuery('(min-width: 900px)');
  const [versions, setVersions] = useState<PageVersion[] | null>(null);
  const [pick, setPick] = useState<number | null>(null);
  const [old, setOld] = useState<{ v: number; doc: TexDoc } | null>(null);
  const [loading, setLoading] = useState(false);
  const [split, setSplit] = useState(() => localStorage.getItem(SPLIT_KEY) !== '0');
  const [naming, setNaming] = useState<{ version: number; name: string } | null>(null);
  const cache = useRef(new Map<number, TexDoc>());
  useEffect(() => {
    if (!open) return;
    let alive = true;
    api<{ versions: PageVersion[] }>(`/api/pages/${enc(pageId)}`).then(
      (r) => {
        if (!alive) return;
        setVersions(r.versions);
        setPick((p) => p ?? (dirty ? r.versions[0]?.version : (r.versions[1]?.version ?? r.versions[0]?.version)) ?? null);
      },
      (e) => alive && toastError(e),
    );
    return () => {
      alive = false;
    };
  }, [open, pageId]);
  useEffect(() => {
    if (!open || pick === null) return;
    const hit = cache.current.get(pick);
    if (hit) return setOld({ v: pick, doc: hit });
    let alive = true;
    setLoading(true);
    loadModelVersion<TexDoc>(enc(pageId), pick)
      .then(
        (r) => {
          cache.current.set(pick, r.model);
          if (alive) setOld({ v: pick, doc: r.model });
        },
        (e) => alive && toastError(e),
      )
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [open, pick, pageId]);
  useEffect(() => localStorage.setItem(SPLIT_KEY, split ? '1' : '0'), [split]);

  const files = useMemo(() => {
    if (!old || old.v !== pick) return null;
    const names = [TEX_MAIN, ...current.files.map((f) => f.name)];
    for (const f of old.doc.files) if (!names.includes(f.name)) names.push(f.name);
    return names.map((name) => {
      const was = texFileText(old.doc, name);
      const now = texFileText(current, name);
      return { name, was, now, ...lineDiff(was ?? '', now ?? '', name) };
    });
  }, [old, current, pick]);
  const pictures = useMemo(() => {
    if (!old) return { added: [], removed: [] };
    const was = new Set(old.doc.pictures.map((p) => p.name));
    const now = new Set(current.pictures.map((p) => p.name));
    return { added: [...now].filter((n) => !was.has(n)), removed: [...was].filter((n) => !now.has(n)) };
  }, [old, current]);
  const changed = files?.filter((f) => f.diff) ?? [];
  const same = files?.filter((f) => !f.diff) ?? [];
  const showSplit = split && wide;

  /** A version named ("Sent to ICML"), or its name taken away. */
  const saveName = async (version: number, name: string) => {
    setNaming(null);
    try {
      setVersions((await nameVersion(pageId, version, name)).versions);
    } catch (e) {
      toastError(e);
    }
  };
  const list = (
    <nav className="min-h-0 overflow-y-auto overscroll-contain">
      {versions?.map((v, i) =>
        naming?.version === v.version ? (
          <form
            key={v.version}
            onSubmit={(e) => {
              e.preventDefault();
              void saveName(v.version, naming.name);
            }}
            className="flex items-center gap-1 px-1.5 py-1"
          >
            <input
              autoFocus
              value={naming.name}
              onChange={(e) => setNaming({ version: v.version, name: e.target.value })}
              onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), setNaming(null))}
              onBlur={() => void saveName(v.version, naming.name)}
              placeholder={tr('Sent to ICML')}
              maxLength={VERSION_NAME_MAX}
              aria-label={tr(`A name for version ${v.version}`)}
              className={cx(inputCls, 'h-8 text-[13px]')}
            />
          </form>
        ) : (
          <div key={v.version} className={cx('group/v flex items-start rounded-lg transition-colors hover:bg-bg-2', pick === v.version && 'bg-bg-2')}>
            <button type="button" onClick={() => setPick(v.version)} className="flex min-w-0 flex-1 items-start gap-2 py-1.5 pl-2.5 text-left">
              <span className="w-8 shrink-0 pt-px font-mono text-[12px] text-fg-3">v{v.version}</span>
              <span className="min-w-0 flex-1">
                {v.name && (
                  <span translate="no" className="block truncate text-[13px] font-medium text-fg">
                    {v.name}
                  </span>
                )}
                <span className={cx('block truncate', v.name ? 'text-[11.5px] text-fg-3' : 'text-[13px] text-fg')}>{i === 0 ? 'The latest' : when(v.createdAt)}</span>
                <span className="block truncate text-[11.5px] text-fg-3">{i === 0 ? `${when(v.createdAt)} · ${tr(BY[v.by] ?? v.by)}` : BY[v.by]}</span>
              </span>
            </button>
            {!readOnly && (
              <IconButton label={v.name ? 'Rename this version' : 'Name this version'} size="sm" onClick={() => setNaming({ version: v.version, name: v.name ?? '' })} className="mt-1 mr-1 opacity-0 group-hover/v:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100">
                <Pencil size={13} />
              </IconButton>
            )}
          </div>
        ),
      )}
    </nav>
  );

  return (
    <Dialog open={open} onClose={onClose} title="Compare versions" width={1180}>
      <div className={cx('grid gap-3', wide ? 'h-[min(74dvh,720px)] grid-cols-[220px_minmax(0,1fr)]' : 'grid-cols-1')}>
        {wide ? (
          <div className="flex min-h-0 flex-col border-r border-line pr-2">
            <div className="flex items-center gap-1.5 px-2.5 pb-1.5 text-[11.5px] font-medium text-fg-3">
              <History size={13} />
              Compare with
            </div>
            {versions ? list : <Throbber className="m-3 h-5 w-5" />}
          </div>
        ) : (
          <label className="block space-y-1">
            <span className="text-[12.5px] font-medium text-fg-2">Compare with</span>
            <select value={pick ?? ''} onChange={(e) => setPick(Number(e.target.value))} className={inputCls}>
              {versions?.map((v, i) => (
                <option key={v.version} value={v.version}>
                  {`v${v.version} · ${v.name ? `${v.name} · ` : ''}${i === 0 ? tr('The latest') : when(v.createdAt)} · ${tr(BY[v.by] ?? v.by)}`}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="flex min-h-0 flex-col">
          <div className="flex shrink-0 flex-wrap items-center gap-2 pb-2">
            <span className="min-w-0 flex-1 text-[12.5px] text-fg-2">{pick !== null ? `Version ${pick}, against what is in the editor now${dirty ? ' (with changes not saved yet)' : ''}.` : ''}</span>
            {wide && (
              <Segmented
                size="sm"
                value={split ? 'split' : 'inline'}
                onChange={(v) => setSplit(v === 'split')}
                options={[
                  { value: 'split', label: 'Side by side' },
                  { value: 'inline', label: 'One under the other' },
                ]}
              />
            )}
          </div>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain">
            {loading || !files ? (
              <div className="flex justify-center py-10">
                <Throbber size={24} />
              </div>
            ) : !changed.length && !pictures.added.length && !pictures.removed.length ? (
              <p className="py-10 text-center text-[13px] text-fg-3">Nothing differs from that version.</p>
            ) : (
              <>
                {changed.map((f) => (
                  <section key={f.name} className="overflow-hidden rounded-xl border border-line">
                    <header className="flex flex-wrap items-center gap-2 border-b border-line bg-panel px-3 py-1.5">
                      <span translate="no" className="font-mono text-[12.5px] font-medium text-fg">
                        {label(f.name)}
                      </span>
                      <DiffStat added={f.added} removed={f.removed} />
                      <span className="text-[12px] text-fg-3">{f.was === null ? 'new since that version' : f.now === null ? 'not in the document now' : ''}</span>
                      <span className="flex-1" />
                      {!readOnly && f.was !== null && pick !== null && (
                        <Button size="sm" variant="ghost" icon={<RotateCcw size={13} />} className="h-7 px-2 text-[12.5px]" onClick={() => onRestore(f.name, f.was!, pick)}>
                          Bring it back
                        </Button>
                      )}
                    </header>
                    <div translate="no" className="max-h-[60vh] overflow-auto text-[12px]">
                      <DiffView diff={f.diff} split={showSplit} />
                    </div>
                  </section>
                ))}
                {(pictures.added.length > 0 || pictures.removed.length > 0) && (
                  <p className="text-[12.5px] text-fg-2">
                    {pictures.added.length > 0 && (
                      <span className="block">
                        Pictures added since: <span translate="no">{pictures.added.join(', ')}</span>
                      </span>
                    )}
                    {pictures.removed.length > 0 && (
                      <span className="block">
                        Pictures taken out since: <span translate="no">{pictures.removed.join(', ')}</span>
                      </span>
                    )}
                  </p>
                )}
              </>
            )}
            {same.length > 0 && files && !loading && (
              <p className="text-[12px] text-fg-3">
                The same as in that version: <span translate="no">{same.map((f) => label(f.name)).join(', ')}</span>
              </p>
            )}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
