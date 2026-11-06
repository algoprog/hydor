// The sound editor opened from the places that have sounds: a file (Files: saved over it, or a copy beside it), a
// Library sound (saved in its place, or as a new one), a sound of the conversation (saved as a new one in the Library,
// noted as from its session), and a video's sound for the video editor (it keeps the video's length, and Save hands
// back a sound the app keeps, "naget-sound:<sha>", for the video to play).
import type { Saved } from '@shared/mediaedit';
import type { MediaItem } from '@shared/media';
import { showInFiles } from '../../../lib/nav';
import { toast } from '../../../lib/store';
import { tr } from '../../../i18n/runtime';
import { openEditor, pageName, type EditorHandle } from '../host';

/** Sounds the editor opens; and videos, for their sound. */
export const EDITABLE_SOUND = /\.(mp3|wav|m4a|aac|ogg|oga|opus|flac|weba)$/i;
export const SOUND_OF_VIDEO = /\.(mp4|m4v|mov|webm|mkv)$/i;

const nameOf = (p: string) => p.split(/[\\/]/).pop() || p;

/**
 * A sound file in the editor: Save writes over it (its old version to the Trash), Save a copy puts one beside it. A
 * video file: its sound, saved as a sound file beside the video.
 */
export function editSoundFile(path: string, o: { label?: string; after?: (r: Saved) => void } = {}): EditorHandle {
  return openEditor({
    kind: 'audio',
    src: path,
    title: nameOf(path),
    from: { label: o.label || pageName() },
    to: { file: path },
    copy: EDITABLE_SOUND.test(path),
    save: (r) => {
      o.after?.(r);
      if (!o.after && r.path && !r.replaced) showInFiles(r.path);
    },
  });
}

/** A Library sound in the editor: Save puts the new one in its place, Save a copy keeps both. A Library video: its sound, saved as a new sound. */
export function editLibrarySound(m: Pick<MediaItem, 'id' | 'title' | 'kind'>, o: { src?: string; label?: string; after?: (r: Saved) => void } = {}): EditorHandle {
  return openEditor({
    kind: 'audio',
    src: o.src ?? `/api/media/${m.id}/file`,
    title: m.title,
    from: { label: o.label || pageName() },
    ...(m.kind === 'audio' ? { to: { media: m.id }, copy: true } : {}),
    save: (r) => o.after?.(r),
  });
}

/** A sound of the conversation in the editor: saved as a new sound in the Library, noted as from its session. */
export function editSessionSound(path: string, session: string): EditorHandle {
  return openEditor({
    kind: 'audio',
    src: path,
    title: nameOf(path),
    from: { label: pageName() },
    session,
    save: (r) => void (r.media && toast(tr('Saved to your Library; a title and a description are being written for it'), 'ok')),
  });
}

/**
 * A video's sound in the editor, for the video editor's "Edit the sound". `video`: the video (a deck's "naget-video:…",
 * a Library item's file, a file's path), its name, and how long it is in seconds (the edited sound keeps exactly this
 * length). `o.sound`: a sound edited before ("naget-sound:…"), to go on from it instead of the video's own. The editor
 * keeps the length: a deletion leaves silence, a paste goes over what is there, nothing changes speed. Save makes the
 * sound (an M4A) and hands `o.put` a Saved `{ kind: 'audio', src: "naget-sound:<sha>", seconds, mime }`; on the server,
 * keptSoundFile(src) (server/mediaedit/audio-store.ts) gives its file, kept 30 days after its last use. `o.label`: the
 * video editor's tab name, for the first tab.
 */
export function editVideoSound(video: { src: string; title?: string; length: number }, o: { label: string; sound?: string; put: (r: Saved) => void | Promise<void> }): EditorHandle {
  return openEditor({
    kind: 'audio',
    src: o.sound ?? video.src,
    title: video.title || tr('The video’s sound'),
    from: { label: o.label },
    to: { sound: true },
    length: video.length,
    save: (r) => o.put(r),
  });
}
