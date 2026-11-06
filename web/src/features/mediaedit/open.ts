// The picture editor opened from the places that have pictures: a file (Files: saved over it, or a copy beside it) and
// the editors' own pictures (a slide's, a document's, a page's: the new picture takes the old one's place).
import type { Saved } from '@shared/mediaedit';
import { showInFiles } from '../../lib/nav';
import { openEditor, pageName, type EditorHandle } from './host';

/** Pictures the editor opens (the kinds a browser shows). */
export const EDITABLE = /\.(png|jpe?g|webp|gif|bmp|avif|svg)$/i;

const nameOf = (p: string) => p.split(/[\\/]/).pop() || p;

/** A picture file in the editor: Save writes over it (its old version to the Trash), Save a copy puts one beside it. */
export function editFile(path: string, o: { label?: string; after?: (r: Saved) => void } = {}): EditorHandle {
  return openEditor({
    kind: 'image',
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
 * A picture of a deck, a document or a page in the editor: Save keeps the new picture (naget-asset:…) and `put` puts it
 * in place of the old one (one step to undo there). `label`: the deck's or document's name, for the first tab.
 */
export function editKept(src: string, o: { title?: string; label: string; put: (r: Saved) => void }): EditorHandle {
  return openEditor({ kind: 'image', src, title: o.title || 'Picture', from: { label: o.label }, to: { asset: true }, copy: true, save: (r) => o.put(r) });
}
