// The video editor opened from the places that have videos: a file (Files: saved over it, or a copy beside it), a Library
// video (saved in its place, or as a new one), a video of the conversation (saved as a new one in the Library, noted as
// from its session) and a slide's video (the new video and its still take the old one's place).
import type { Saved } from '@shared/mediaedit';
import type { MediaItem } from '@shared/media';
import { showInFiles } from '../../../lib/nav';
import { toast } from '../../../lib/store';
import { tr } from '../../../i18n/runtime';
import { openEditor, pageName, type EditorHandle } from '../host';

/** Videos the editor opens (the kinds the app keeps). */
export const EDITABLE_VIDEO = /\.(mp4|m4v|mov|webm)$/i;

const nameOf = (p: string) => p.split(/[\\/]/).pop() || p;

/** A video file in the editor: Save writes over it (its old version to the Trash), Save a copy puts one beside it. */
export function editVideoFile(path: string, o: { label?: string; after?: (r: Saved) => void } = {}): EditorHandle {
  return openEditor({
    kind: 'video',
    src: path,
    title: nameOf(path),
    from: { label: o.label || pageName() },
    to: { file: path },
    copy: true,
    save: (r) => {
      o.after?.(r);
      // A copy beside it shows in its folder.
      if (!o.after && r.path && !r.replaced) showInFiles(r.path);
    },
  });
}

/**
 * A Library video in the editor: Save puts the new one in its place, Save a copy keeps both. `src`: its file's address as
 * the Library gives it (with its version, so one written over before is not played from the browser's cache).
 */
export function editLibraryVideo(m: Pick<MediaItem, 'id' | 'title'>, o: { src?: string; label?: string; after?: (r: Saved) => void } = {}): EditorHandle {
  return openEditor({ kind: 'video', src: o.src ?? `/api/media/${m.id}/file`, title: m.title, from: { label: o.label || pageName() }, to: { media: m.id }, copy: true, save: (r) => o.after?.(r) });
}

/** A video of the conversation in the editor: saved as a new video in the Library, noted as from its session. */
export function editSessionVideo(path: string, session: string): EditorHandle {
  return openEditor({
    kind: 'video',
    src: path,
    title: nameOf(path),
    from: { label: pageName() },
    session,
    save: (r) => void (r.media && toast(tr('Saved to your Library; a title and a description are being written for it'), 'ok')),
  });
}

/**
 * A slide's video (one the app keeps, "naget-video:…") in the editor: Save keeps the new video and its still, and `put`
 * puts them in place of the old ones (one step to undo there). `label`: the deck's name, for the first tab.
 */
export function editKeptVideo(src: string, o: { title?: string; label: string; put: (r: Saved) => void }): EditorHandle {
  return openEditor({ kind: 'video', src, title: o.title || 'Video', from: { label: o.label }, to: { asset: true }, copy: true, save: (r) => o.put(r) });
}
