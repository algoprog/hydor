import { lazy, StrictMode, Suspense, useLayoutEffect, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { App } from './App';
import { startLanguage } from './i18n';
import { startHoverScroll } from './lib/hoverScroll';
import { endBoot } from './lib/boot';

// A read-only link (/g/<token>, or /m/<machine>/g/<token> for another machine's session) opens the
// shared session alone, without signing in.
const GuestPage = lazy(() => import('./features/guest/GuestPage'));
const guest = /^(?:\/m\/[a-z0-9-]+)?\/g\/([^/]+)\/?$/.exec(location.pathname);
// An app's public page (/a/<slug>): its form, for anyone with the link.
const PublicAppPage = lazy(() => import('./features/apps/PublicPage'));
const publicApp = /^\/a\/([^/]+)\/?$/.exec(location.pathname);
// A project shared with someone, at their own link (/p/<token>, or another machine's /m/<machine>/p/<token>): its
// documents, sessions, runs and reading list, without signing in.
const PortalPage = lazy(() => import('./features/portal/PortalPage'));
const portal = /^(?:\/m\/[a-z0-9-]+)?\/p\/([^/]+)\/?$/.test(location.pathname);

// Text cut short with an ellipsis scrolls while a mouse rests on it, so all of it can be read.
startHoverScroll();

/** A page of its own (a shared session or project, an app's public page): the logo shown while loading goes once it is here. */
function Arrived({ children }: { children: ReactNode }) {
  useLayoutEffect(endBoot, []);
  return children;
}

// The pages in the user's language (English needs nothing), its dictionary there before the first paint.
void startLanguage().then(() =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      {guest ? (
        <Suspense fallback={null}>
          <Arrived>
            <GuestPage token={decodeURIComponent(guest[1])} />
          </Arrived>
        </Suspense>
      ) : publicApp ? (
        <Suspense fallback={null}>
          <Arrived>
            <PublicAppPage slug={decodeURIComponent(publicApp[1])} />
          </Arrived>
        </Suspense>
      ) : portal ? (
        <Suspense fallback={null}>
          <Arrived>
            <PortalPage />
          </Arrived>
        </Suspense>
      ) : (
        <App />
      )}
    </StrictMode>,
  ),
);
