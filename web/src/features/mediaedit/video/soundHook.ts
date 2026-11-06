// "Edit the sound…": the video editor hands a clip's or a track's sound to the sound editor (../audio, opened here by
// default; setSoundEditor puts another in its place), and takes back what it saves. The sound it gets is the clip's own
// (its video file, whose sound the sound editor reads) or the sound used in its place; what comes back (a Library sound
// "media:<id>", a sound kept by the editors "naget-sound:…", or a sound file's path) is used in place of the clip's own
// sound with the same timing (its second t stands for the source's second t: VideoClip.sound), or as the music or
// voice-over item's sound.

import { tr } from '../../../i18n/runtime';
import { toastError } from '../../../lib/store';

export interface SoundEdit {
  /** The sound to edit: a video (its sound), a Library sound, a kept sound or a file. */
  src: string;
  /** Its name, for the sound editor's tab. */
  title: string;
  /** The part of it the edit uses, in seconds of it, when not all of it (the sound editor may show it). */
  from?: number;
  to?: number;
  /** Where it was opened from (the video editor's tab name). */
  label: string;
  /** Takes the edited sound back: a source as above, of the same length and timing as `src`. */
  save(src: string): void;
}

/**
 * The app's own sound editor (../audio), loaded the first time a sound is edited: it reads the sound's whole length
 * first, which the sound editor then keeps (a deletion becomes silence), so the edit stays in time with the video.
 */
async function openSoundEditor(o: SoundEdit): Promise<void> {
  try {
    const [{ editVideoSound }, { soundFacts }] = await Promise.all([import('../audio/open'), import('../audio/api')]);
    const facts = await soundFacts(o.src);
    if (!facts.duration) throw new Error(tr('That has no sound to edit'));
    const put = (r: { src?: string }) => {
      if (r.src) o.save(r.src);
    };
    editVideoSound({ src: o.src, title: o.title, length: facts.duration }, { label: o.label, put });
  } catch (e) {
    toastError(e);
  }
}

let opener: ((o: SoundEdit) => void) | null = (o) => void openSoundEditor(o);

/** The sound editor says it is there: the video editor's "Edit the sound…" opens it. */
export function setSoundEditor(open: ((o: SoundEdit) => void) | null) {
  opener = open;
}

/** The sound editor, when there is one. */
export const soundEditor = () => opener;
