// The list of a page's versions, to pick one to compare it with (the latest, the one open, left out): the document's
// Compare with a version and the spreadsheet's (each says what showing one does).
import { useEffect, useState } from 'react';
import type { PageVersion } from '@shared/pages';
import { api } from '../../../lib/api';
import { ago } from '../../../lib/format';
import { Dialog, Throbber } from '../../../components/ui';

const BY: Record<PageVersion['by'], string> = { agent: 'by the agent', user: 'kept by you', restore: 'brought back', edit: 'changed by you', made: 'made by you' };

export function VersionsDialog({
  open,
  pageId,
  onClose,
  onPick,
  hint = 'Pick a version: the document shows what changed since it.',
  skip,
}: {
  open: boolean;
  pageId: string;
  onClose: () => void;
  onPick: (v: PageVersion) => void;
  /** What showing one does. */
  hint?: string;
  /** The version open (left out besides the latest). */
  skip?: number;
}) {
  const [list, setList] = useState<PageVersion[] | null>(null);
  const [latest, setLatest] = useState(0);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    setList(null);
    setError('');
    api<{ page: { version: number }; versions: PageVersion[] }>(`/api/pages/${encodeURIComponent(pageId)}`).then(
      (r) => {
        setLatest(r.page.version);
        setList(r.versions);
      },
      (e) => setError((e as Error).message),
    );
  }, [open, pageId]);
  const older = (list ?? []).filter((v) => v.version !== latest && v.version !== skip);
  return (
    <Dialog open={open} onClose={onClose} title="Compare with a version" width={420}>
      <p className="mb-2 text-[12.5px] text-fg-3">{hint}</p>
      {!list && !error && (
        <div className="flex justify-center py-6 text-fg-3">
          <Throbber />
        </div>
      )}
      {error && <p className="py-2 text-[13px] text-err">{error}</p>}
      {list && !older.length && <p className="py-4 text-center text-[13px] text-fg-3">There is no older version yet: each save makes one.</p>}
      {older.length > 0 && (
        <div className="max-h-[min(52vh,420px)] divide-y divide-line overflow-y-auto rounded-xl border border-line">
          {older.map((v) => (
            <button key={v.version} type="button" onClick={() => onPick(v)} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-bg-2">
              <span className="w-9 shrink-0 font-mono text-[12px] text-fg-3">v{v.version}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] text-fg" translate="no">
                  {v.name || v.title}
                </span>
                <span className="block truncate text-[11.5px] text-fg-3">
                  {ago(v.createdAt)} · {v.who ? <span translate="no">{v.who}</span> : (BY[v.by] ?? v.by)}
                  {v.steps ? ` · ${v.steps} saves` : ''}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </Dialog>
  );
}
