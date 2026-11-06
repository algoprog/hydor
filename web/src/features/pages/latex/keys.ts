// The source's keys (View → Keys): Normal (the app's own), Vim or Emacs, kept on this device. Vim's and Emacs's keys come
// from @replit/codemirror-vim and @replit/codemirror-emacs, loaded the first time they are picked; they go before the
// editor's own keys (Ctrl+Enter still typesets), and :w in Vim, C-x C-s in Emacs, save.
import { Prec, type Extension } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

export type KeysMode = 'normal' | 'vim' | 'emacs';
const KEY = 'wa.tex.keys';

export const savedKeys = (): KeysMode => {
  const v = localStorage.getItem(KEY);
  return v === 'vim' || v === 'emacs' ? v : 'normal';
};
export const saveKeys = (m: KeysMode) => localStorage.setItem(KEY, m);

/** What saves the file each editor shows (Vim's :w and Emacs's C-x C-s find it by its view). */
const savers = new WeakMap<EditorView, () => void>();
export const saverFor = (view: EditorView, save: () => void) => savers.set(view, save);

let vim: Promise<Extension> | null = null;
let emacs: Promise<Extension> | null = null;

/** The keys' extension (loaded once; none for Normal). */
export function keysExtension(mode: KeysMode): Promise<Extension> {
  if (mode === 'vim')
    return (vim ??= import('@replit/codemirror-vim').then((m) => {
      m.Vim.defineEx('write', 'w', (cm) => savers.get(cm.cm6 as EditorView)?.());
      return Prec.highest(m.vim({ status: true }));
    }));
  if (mode === 'emacs')
    return (emacs ??= import('@replit/codemirror-emacs').then((m) => {
      m.EmacsHandler.bindKey('C-x C-s', (view: EditorView) => savers.get(view)?.());
      return Prec.highest(m.emacs());
    }));
  return Promise.resolve([]);
}
