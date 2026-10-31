import { CheckCircle2, CircleSlash, Upload, X, XCircle } from 'lucide-react';
import { bytes, tildify } from '../../lib/format';
import { useApp } from '../../lib/store';
import { cancelUpload, resolveConflict, useUploads, type UploadBatch } from '../../lib/upload';
import { Button, cx, Throbber } from '../../components/ui';

function Batch({ b }: { b: UploadBatch }) {
  const home = useApp((s) => s.boot?.home);
  const dismiss = useUploads((s) => s.dismiss);
  const total = b.items.reduce((a, i) => a + (i.status === 'skipped' ? 0 : i.size), 0);
  const sent = b.items.reduce((a, i) => a + (i.status === 'skipped' ? 0 : Math.min(i.sent, i.size)), 0);
  const pct = total ? Math.round((sent / total) * 100) : b.status === 'done' ? 100 : 0;
  const done = b.items.filter((i) => i.status === 'done').length;
  const failed = b.items.filter((i) => i.status === 'error');
  const active = b.status === 'running' || b.status === 'checking';
  const current = b.items.find((i) => i.status === 'uploading');
  return (
    <div className="border-b border-line px-3 py-2.5 last:border-0">
      <div className="flex items-center gap-2">
        {b.status === 'done' ? (
          <CheckCircle2 size={15} className="shrink-0 text-ok" />
        ) : b.status === 'error' ? (
          <XCircle size={15} className="shrink-0 text-err" />
        ) : b.status === 'cancelled' ? (
          <CircleSlash size={15} className="shrink-0 text-fg-3" />
        ) : (
          <Upload size={15} className="shrink-0 text-accent" />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12.5px]">
            {b.items.length === 1 ? b.items[0].rel : `${b.items.length} files`}
            <span className="text-fg-3"> → {tildify(b.dir, home)}</span>
          </div>
          <div className="tnum text-[11px] text-fg-3">
            {b.status === 'checking' && 'Checking for existing files…'}
            {b.status === 'running' && `${bytes(sent)} of ${bytes(total)} · ${done}/${b.items.length} files`}
            {b.status === 'done' && `Uploaded ${done} file${done === 1 ? '' : 's'} · ${bytes(total)}`}
            {b.status === 'cancelled' && `Cancelled · ${done} uploaded`}
            {b.status === 'error' && `${failed.length} failed: ${failed[0]?.error ?? ''}`}
            {b.status === 'conflict' && `${b.conflicts.length} already exist${b.conflicts.length === 1 ? 's' : ''}`}
          </div>
        </div>
        {active ? (
          <Button size="sm" variant="ghost" onClick={() => cancelUpload(b.id)}>
            Cancel
          </Button>
        ) : b.status !== 'conflict' ? (
          <button className="rounded p-1 text-fg-3 hover:text-fg" onClick={() => dismiss(b.id)} aria-label="Dismiss">
            <X size={14} />
          </button>
        ) : null}
      </div>
      {(active || b.status === 'done') && (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-accent/15">
          <div className={cx('h-full rounded-full transition-[width] duration-200', b.status === 'done' ? 'bg-ok' : 'bg-accent')} style={{ width: `${pct}%` }} />
        </div>
      )}
      {current && <div className="mt-1 truncate text-[11px] text-fg-3">{current.rel}</div>}
      {b.status === 'checking' && (
        <div className="mt-1 text-fg-3">
          <Throbber />
        </div>
      )}
      {b.status === 'conflict' && (
        <div className="mt-2">
          <div className="mb-2 max-h-20 overflow-auto font-mono text-[11px] text-fg-3">
            {b.conflicts.slice(0, 8).map((c) => (
              <div key={c} className="truncate">
                {tildify(c, home)}
              </div>
            ))}
            {b.conflicts.length > 8 && <div>…and {b.conflicts.length - 8} more</div>}
          </div>
          <div className="flex gap-1.5">
            <Button size="sm" variant="primary" onClick={() => resolveConflict(b.id, 'replace')}>
              Replace
            </Button>
            <Button size="sm" onClick={() => resolveConflict(b.id, 'skip')}>
              Skip existing
            </Button>
            <Button size="sm" variant="ghost" onClick={() => resolveConflict(b.id, 'cancel')}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function UploadsPanel() {
  const batches = useUploads((s) => s.batches);
  if (!batches.length) return null;
  return (
    <div className="anim-pop fixed right-3 bottom-[calc(76px+var(--safe-bottom))] z-40 w-[min(92vw,360px)] overflow-hidden rounded-xl border border-line-2 bg-panel shadow-pop md:bottom-4">
      <div className="border-b border-line px-3 py-1.5 text-[11px] font-medium tracking-wide text-fg-3 uppercase">Uploads</div>
      <div className="max-h-[50vh] overflow-y-auto">
        {batches.map((b) => (
          <Batch key={b.id} b={b} />
        ))}
      </div>
    </div>
  );
}
