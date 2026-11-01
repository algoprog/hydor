import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { App } from './App';
import { startLanguage } from './i18n';

// A read-only link (/g/<token>, or /m/<machine>/g/<token> for another machine's session) opens the
// shared session alone, without signing in.
const GuestPage = lazy(() => import('./features/guest/GuestPage'));
const guest = /^(?:\/m\/[a-z0-9-]+)?\/g\/([^/]+)\/?$/.exec(location.pathname);
// An app's public page (/a/<slug>): its form, for anyone with the link.
const PublicAppPage = lazy(() => import('./features/apps/PublicPage'));
const publicApp = /^\/a\/([^/]+)\/?$/.exec(location.pathname);

// The pages in the user's language (English needs nothing), its dictionary there before the first paint.
void startLanguage().then(() =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      {guest ? (
        <Suspense fallback={null}>
          <GuestPage token={decodeURIComponent(guest[1])} />
        </Suspense>
      ) : publicApp ? (
        <Suspense fallback={null}>
          <PublicAppPage slug={decodeURIComponent(publicApp[1])} />
        </Suspense>
      ) : (
        <App />
      )}
    </StrictMode>,
  ),
);
