import express from 'express';
import { fileURLToPath } from 'node:url';
import { accounts as accountsFor } from './accounts.js';
import { crews as crewsFor } from './crews.js';
import { records as recordsFor } from './records.js';
import { api } from './api.js';
import { pages } from './pages.js';
import { Refusal } from './input.js';
import { sessionToken, fromElsewhere } from './web.js';
import { layout, messagePage } from './views.js';

export function createApp(db) {
  const accounts = accountsFor(db);
  const crews = crewsFor(db);
  const records = recordsFor(db, crews);
  const services = { accounts, crews, records };

  const app = express();
  app.disable('x-powered-by');

  app.use((req, res, next) => {
    res.set({
      'Content-Security-Policy': "default-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'",
      'X-Content-Type-Options': 'nosniff',
      // Invitation links must not leak to other sites through the Referer header.
      'Referrer-Policy': 'same-origin',
    });
    next();
  });
  app.use(express.static(fileURLToPath(new URL('../public', import.meta.url)), { index: false }));

  app.use((req, res, next) => {
    // Nothing about a crew is kept by the browser, so it is gone as soon as access is.
    res.set('Cache-Control', 'no-store');
    if (fromElsewhere(req)) throw new Refusal(403, 'That request came from another website, so it was refused.');
    next();
  });
  app.use(express.json({ limit: '200kb' }));
  app.use(express.urlencoded({ extended: false, limit: '200kb' }));
  app.use((req, res, next) => {
    req.user = accounts.userFor(sessionToken(req));
    next();
  });

  app.use('/api', api(services));
  app.use(pages(services));
  app.use(() => { throw new Refusal(404, 'There is nothing at that address.'); });

  app.use((error, req, res, next) => {
    let status = error instanceof Refusal ? error.status : error.status ?? error.statusCode ?? 500;
    let message = error instanceof Refusal ? error.message
      : error.type === 'entity.too.large' ? 'That is too much to send at once.'
      : status < 500 ? 'The request could not be read.'
      : 'Something went wrong. Please try again.';
    if (status >= 500) console.error(error);
    if (res.headersSent) return next(error);
    if (req.originalUrl.startsWith('/api')) return res.status(status).json({ error: message });
    const title = status === 404 ? 'Not found' : status === 403 ? 'Not allowed' : 'Sorry';
    res.status(status).type('html').send(layout({ title, user: req.user, content: messagePage(title, message) }));
  });

  return app;
}
