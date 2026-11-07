// Which editor each kind of page opens in (a page of HTML opens in the Studio; a notebook in the notebook page's view). Each loads the first time a page
// of its kind opens (the Pages library asks for them once it shows), so the app itself starts no slower for them.
import { lazy, Suspense, useEffect, useState, type ComponentType } from 'react';
import type { PageInfo } from '@shared/pages';
import { Throbber } from '../../components/ui';
import type { ModelEditorProps } from './kinds';

export type Kind = NonNullable<PageInfo['kind']>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EditorProps = ModelEditorProps<any> & { startPresent?: boolean };
type Load = () => Promise<{ default: ComponentType<EditorProps> }>;

const LOADS: Partial<Record<Kind, Load>> = {
  slides: () => import('./slides/SlidesEditor').then((m) => ({ default: m.SlidesEditor })),
  doc: () => import('./docs/DocEditor').then((m) => ({ default: m.DocEditor })),
  sheet: () => import('./sheets/SheetEditor').then((m) => ({ default: m.SheetEditor })),
  tex: () => import('./latex/LatexEditor').then((m) => ({ default: m.LatexEditor })),
  notebook: () => import('./notebook/NotebookEditor').then((m) => ({ default: m.NotebookEditor })),
  diagram: () => import('./diagram/DiagramEditor').then((m) => ({ default: m.DiagramEditor })),
};

/** A spinner only when loading takes a moment (most times the editor is there before it would show). */
function Loading() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShow(true), 400);
    return () => clearTimeout(t);
  }, []);
  return <div className="flex h-full min-h-40 flex-1 items-center justify-center text-fg-3">{show && <Throbber size={30} />}</div>;
}

function lazyEditor(load: Load, kind: string): ComponentType<EditorProps> {
  const Editor = lazy(load);
  return function KindEditor(p: EditorProps) {
    return (
      <Suspense fallback={<Loading />}>
        {/* Its kind, for the words that mean something else in it (i18n/runtime.ts). */}
        <div data-i18n={kind} className="contents">
          <Editor {...p} />
        </div>
      </Suspense>
    );
  };
}

export const EDITORS: Partial<Record<Kind, ComponentType<EditorProps>>> = Object.fromEntries(
  Object.entries(LOADS).map(([k, load]) => [k, lazyEditor(load, k)]),
);

let preloaded = false;
/** Loads every editor while nothing else is going on, so the first page opened shows at once. */
export function preloadEditors() {
  if (preloaded) return;
  preloaded = true;
  const go = () => Object.values(LOADS).forEach((load) => void load().catch(() => (preloaded = false)));
  if ('requestIdleCallback' in window) window.requestIdleCallback(go, { timeout: 4000 });
  else setTimeout(go, 1500);
}
