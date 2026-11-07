// A picture, a video or a sound shared alone, as the person at the link opens it (server/spaces/portal-media.ts): the
// picture with its comments' pins, or the video or the sound with their marks, and the comments beside it (under it on
// a phone): theirs under their name, the owner's under the owner's. They add one on a spot they click, at the moment
// the player is at, or on the whole of it, and answer and resolve any. Download saves its file. With Edit, Edit opens
// the picture, video or sound editor on the whole page (without its AI tools, or anything of the owner's to add), and
// Save puts the new one in its place; the owner keeps the one before.
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Download, SlidersHorizontal } from 'lucide-react';
import { clipLength } from '@shared/media';
import type { MediaComment, MediaCommentOp } from '@shared/media-comments';
import type { PortalMediaView, PortalView } from '@shared/share';
import { Logo } from '../../components/Logo';
import { Button, IconButton, Throbber, useMediaQuery } from '../../components/ui';
import { tr } from '../../i18n/runtime';
import { toast } from '../../lib/store';
import { EditorAlone, type OpenEditor } from '../mediaedit/host';
import { MediaCommentsPanel, MediaStage, useMediaReview } from '../media/MediaComments';
import { BASE, papi } from './api';
import { Me } from './PortalPage';

const KIND = { image: 'A picture', video: 'A video', audio: 'A sound' } as const;

export function PortalMedia({ v, id, onChanged }: { v: PortalView; id: string; onChanged: () => void }) {
  const [it, setIt] = useState<PortalMediaView | null>(null);
  const [comments, setComments] = useState<MediaComment[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const wide = useMediaQuery('(min-width: 1024px)');
  const load = useCallback(
    () =>
      papi<PortalMediaView>(`/media/${encodeURIComponent(id)}`).then(
        (r) => {
          setIt(r);
          setComments(r.comments);
          setErr(null);
        },
        (e) => setErr((e as Error).message),
      ),
    [id],
  );
  useEffect(() => {
    void load();
  }, [load]);
  // Kept up to date as the portal is (its comments too): every minute while in view, unless it is being edited.
  useEffect(() => {
    const t = setInterval(() => document.visibilityState === 'visible' && !editing && void load(), 60_000);
    return () => clearInterval(t);
  }, [load, editing]);
  useEffect(() => {
    if (it) document.title = `${it.item.title} · Hydor`;
  }, [it?.item.title]);
  const review = useMediaReview(
    it?.item ?? { id, kind: 'image', title: '' },
    comments,
    (ops: MediaCommentOp[]) => papi<{ comments: MediaComment[] }>(`/media/${encodeURIComponent(id)}/comments`, { body: { ops } }).then((r) => r.comments),
    setComments,
  );

  if (!it)
    return (
      <div className="flex h-full flex-col bg-bg">
        <Top v={v} title={v.thing?.title ?? ''} />
        <div className="flex flex-1 items-center justify-center px-6 text-center text-[14px] text-fg-3">{err ?? <Throbber size={28} />}</div>
      </div>
    );
  const m = it.item;
  const file = `${BASE}/media/${encodeURIComponent(m.id)}/file?v=${m.updatedAt}`;
  if (editing) {
    // The editor asks the link's own routes (web/src/lib/machine.ts) for this item and what they add from their device.
    const ext = /\b(webm|quicktime)\b/.exec(m.mime)?.[1];
    const o: OpenEditor = {
      kind: m.kind,
      src: `/api/media/${m.id}/file?v=${m.updatedAt}`,
      title: m.title,
      from: { label: m.title },
      to: { media: m.id },
      copy: false,
      ...(m.kind === 'video' ? { fileKind: ext === 'webm' ? 'WebM' : ext === 'quicktime' ? 'MOV' : 'MP4' } : {}),
      save: async () => {
        toast(tr(`Saved: ${v.owner} keeps the one before`), 'ok');
        await load();
        onChanged();
      },
    };
    return (
      <div className="h-full bg-bg">
        <EditorAlone
          o={o}
          onClose={() => setEditing(false)}
          lead={
            <IconButton label={tr('Back, without saving')} onClick={() => setEditing(false)}>
              <ArrowLeft size={18} />
            </IconButton>
          }
        />
      </div>
    );
  }
  const facts = [tr(KIND[m.kind]), m.duration ? clipLength(m.duration) : m.width && m.height ? `${m.width} × ${m.height}` : ''].filter(Boolean).join(' · ');
  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      <Top v={v} title={m.title} sub={`${facts} · ${tr(`Shared with you by ${v.owner}`)}`}>
        {it.editable && (
          <Button size="sm" variant="secondary" icon={<SlidersHorizontal size={14} />} onClick={() => setEditing(true)} aria-label={tr('Edit')}>
            <span className="max-sm:hidden">Edit</span>
          </Button>
        )}
        <a
          href={`${BASE}/media/${encodeURIComponent(m.id)}/file?download=1`}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-bg-1 px-2.5 text-[13px] font-medium text-fg-2 transition-colors hover:bg-bg-2 hover:text-fg"
          aria-label={tr('Download')}
        >
          <Download size={14} />
          <span className="max-sm:hidden">Download</span>
        </a>
      </Top>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={wide ? 'mx-auto grid max-w-[1280px] grid-cols-[minmax(0,1fr)_340px] gap-5 px-6 py-5' : 'space-y-4 px-3 py-4'}>
          <div className="flex min-w-0 flex-col items-center gap-2">
            <MediaStage r={review} src={file} poster={m.kind === 'video' ? `${BASE}/media/${encodeURIComponent(m.id)}/still?v=${m.updatedAt}` : undefined} downloadUrl={`${BASE}/media/${encodeURIComponent(m.id)}/file?download=1`} />
            {m.description && (
              <p translate="no" className="max-w-[720px] text-center text-[13px] leading-relaxed text-fg-3">
                {m.description}
              </p>
            )}
          </div>
          <aside className="min-w-0">
            <div className="mb-2 px-1 text-[12.5px] font-medium text-fg-2">Comments</div>
            <MediaCommentsPanel r={review} />
          </aside>
        </div>
      </div>
    </div>
  );
}

/** The page's top: the app's mark, its name, what it is, what goes at the end, and who they are. */
function Top({ v, title, sub, children }: { v: PortalView; title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <header className="flex shrink-0 items-center gap-1.5 border-b border-line px-2 pt-[calc(var(--safe-top)+8px)] pb-2 sm:px-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center" title={tr(`Shared with you by ${v.owner}, from Hydor`)}>
        <Logo size={24} />
      </span>
      <div className="ml-0.5 min-w-0 flex-1">
        <h1 translate="no" className="truncate text-[15px] font-semibold tracking-tight">
          {title}
        </h1>
        {sub && <div className="truncate text-[11.5px] text-fg-3">{sub}</div>}
      </div>
      {children}
      <Me v={v} />
    </header>
  );
}
