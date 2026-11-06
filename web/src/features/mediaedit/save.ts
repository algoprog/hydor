// Where the picture editor saves, in words and as POST /api/mediaedit/image takes it: back where it came from (a deck's,
// a document's or a page's picture; over a Library item; over a file), as a copy (in the Library, or a file beside the
// one it came from), or, when it came from nowhere it can go back to, into the Library.
import type { ImageFormat, SaveImageAnswer, SaveImageAsk } from '@shared/mediaedit';
import { formatOfName, IMAGE_FORMATS } from '@shared/mediaedit';
import { post } from '../../lib/api';
import type { OpenEditor } from './host';

export const saveImage = (a: SaveImageAsk) => post<SaveImageAnswer>('/api/mediaedit/image', a);

export interface SavePlan {
  label: string;
  to: SaveImageAsk['to'];
  /** What it does, in a sentence for the save options. */
  says: string;
}

const extOf = (f: ImageFormat) => IMAGE_FORMATS.find((x) => x.id === f)!.ext;
const nameOf = (p: string) => p.split(/[\\/]/).pop() ?? p;
const stemOf = (p: string) => nameOf(p).replace(/\.[^.]+$/, '');

/** What Save does, and Save a copy (when offered), for a picture opened as `o` and saved as `format`. */
export function savePlans(o: OpenEditor, detached: boolean, format: ImageFormat): { main: SavePlan; copy: SavePlan | null } {
  const lib: SavePlan = { label: 'Save to Library', to: { as: 'copy', title: o.title }, says: 'It is kept in your Library as a new picture.' };
  if (detached || !o.to) return { main: detached ? { ...lib, says: 'Where it came from is closed, so it is kept in your Library as a new picture.' } : lib, copy: null };
  const to = o.to;
  if ('file' in to) {
    const file = to.file;
    const beside: SavePlan = { label: 'Save a copy', to: { file, as: 'copy' }, says: `A copy is saved beside it, “${stemOf(file)} (edited).${extOf(format)}”.` };
    // Written over only as the same kind of file: another kind is a copy beside it.
    if (formatOfName(file) !== format) return { main: beside, copy: null };
    return { main: { label: 'Save', to: { file, as: 'replace' }, says: `Save writes over ${nameOf(file)}; its old version goes to the Trash.` }, copy: o.copy ? beside : null };
  }
  const copy: SavePlan | null = o.copy ? { label: 'Save a copy', to: { ...('media' in to ? { media: to.media } : {}), as: 'copy', title: o.title }, says: 'Save a copy keeps it in your Library as a new picture.' } : null;
  if ('media' in to) return { main: { label: 'Save', to: { media: to.media, as: 'replace' }, says: 'Save puts it in the Library in place of the picture it was.' }, copy };
  return { main: { label: 'Save', to: { asset: true }, says: `Save puts it back in ${o.from.label || 'the page'} in place of the picture it was.` }, copy };
}
