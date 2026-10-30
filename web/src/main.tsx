import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { App } from './App';

// A read-only link (/g/<token>, or /m/<machine>/g/<token> for another machine's session) opens the
// shared session alone, without signing in.
const GuestPage = lazy(() => import('./features/guest/GuestPage'));
const guest = /^(?:\/m\/[a-z0-9-]+)?\/g\/([^/]+)\/?$/.exec(location.pathname);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {guest ? (
      <Suspense fallback={null}>
        <GuestPage token={decodeURIComponent(guest[1])} />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
);
