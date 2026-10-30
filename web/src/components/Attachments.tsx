import { FileText, X } from 'lucide-react';
import type { Attachment } from '../lib/attachments';
import { bytes } from '../lib/format';
import { cx } from './ui';
import { openLightbox } from './Lightbox';

function Remove({ name, onClick }: { name: string; onClick: () => void }) {
  return (
    <button className="absolute -top-1.5 -right-1.5 rounded-full bg-fg p-0.5 text-bg" onClick={onClick} aria-label={`Remove ${name}`}>
      <X size={10} />
    </button>
  );
}

/** Thumbnails for images, name and size chips for other files, each removable. */
export function AttachmentList({ items, onRemove, className }: { items: Attachment[]; onRemove: (a: Attachment) => void; className?: string }) {
  if (!items.length) return null;
  return (
    <div className={cx('flex flex-wrap gap-2', className)}>
      {items.map((a) =>
        a.image ? (
          <div key={a.id} className="relative" title={`${a.name} · ${bytes(a.size)}`}>
            <button
              type="button"
              onClick={() => {
                const imgs = items.filter((x) => x.image);
                openLightbox(
                  imgs.map((x) => ({ src: x.url!, name: x.name })),
                  imgs.indexOf(a),
                );
              }}
              className="block cursor-zoom-in"
              aria-label={`Show ${a.name} large`}
            >
              <img src={a.url} className="h-14 w-14 rounded-lg border border-line object-cover" alt={a.name} />
            </button>
            <Remove name={a.name} onClick={() => onRemove(a)} />
          </div>
        ) : (
          <div key={a.id} className="relative flex h-14 max-w-[220px] items-center gap-2 rounded-lg border border-line bg-bg-1 pr-3 pl-2.5" title={a.name}>
            <FileText size={18} className="shrink-0 text-fg-3" />
            <span className="min-w-0">
              <span className="block truncate text-[12.5px] font-medium">{a.name}</span>
              <span className="block text-[11px] text-fg-3">{bytes(a.size)}</span>
            </span>
            <Remove name={a.name} onClick={() => onRemove(a)} />
          </div>
        ),
      )}
    </div>
  );
}
