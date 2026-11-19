// A project's details, in a window over the page that is open (the shell holds it once). It opens from the Projects page's
// cards, the sessions sidebar (a project's name, its ⋯ menu), the search box and every link to an old address of a project's page
// (`/projects/<id>/<tab>`: lib/nav.ts's go() sends them here, so the page stays), and holds what the project's page
// held (SpacePage.tsx: its header, its tabs). Escape, its Close or a click outside closes it, and so does going to
// another page (a document opened from its Files, say). On a phone it fills the screen.
import { lazy, Suspense, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'wouter';
import { Throbber } from '../../components/ui';
import { closeProject, openProject, useProjectWindow } from '../../lib/nav';

// Opens a project's window (the store is in lib/nav.ts, which go() uses without loading the window itself).
export { closeProject, openProject };

const SpacePage = lazy(() => import('./SpacePage').then((m) => ({ default: m.SpacePage })));

/** The window, wherever it was opened from. */
export function ProjectDialogHost() {
  const at = useProjectWindow((s) => s.at);
  const [loc] = useLocation();
  const root = useRef<HTMLDivElement>(null);
  const pressed = useRef(false);
  // Another page (a link, the browser's Back) takes the window away with the page it was opened over; where it
  // opened is the address at that moment.
  const opened = useRef({ n: 0, loc });
  if (at && opened.current.n !== at.n) opened.current = { n: at.n, loc };
  useEffect(() => {
    if (at && loc !== opened.current.loc) closeProject();
  }, [loc, at]);

  // Escape closes it, unless a menu, a dialog or a file over it (they are all role="dialog") takes the key.
  const open = !!at;
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      for (const d of document.querySelectorAll('[role="dialog"]:not([data-tip-card])')) if (d !== root.current) return;
      closeProject();
    };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [open]);

  const dim = useCallback((e: React.PointerEvent) => void (pressed.current = e.target === e.currentTarget), []);
  if (!at) return null;
  return createPortal(
    // A press that began in the window (selecting text) and ended on the dimmed page does not close it.
    <div className="scrim holds fixed inset-0 z-50 flex items-stretch justify-center sm:items-center sm:p-6" onPointerDown={dim} onClick={(e) => pressed.current && e.target === e.currentTarget && closeProject()}>
      <div
        ref={root}
        role="dialog"
        aria-modal
        aria-label="Project details"
        className="anim-modal flex h-dvh w-full flex-col overflow-hidden bg-bg shadow-lg sm:h-[min(860px,calc(100dvh-48px))] sm:w-[min(1120px,calc(100vw-48px))] sm:rounded-[20px] sm:border sm:border-line"
      >
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center text-fg-3">
              <Throbber size={28} />
            </div>
          }
        >
          <SpacePage key={at.n} id={at.id} tab={at.tab} part={at.part} share={at.share} req={at.req} />
        </Suspense>
      </div>
    </div>,
    document.body,
  );
}
