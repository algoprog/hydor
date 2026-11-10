import { logger } from './logger.mjs';
import { loadConfig } from './config/load.mjs';
import { buildRequest, parseStatus } from './net/http.mjs';
import { withRetry } from './net/retry.mjs';
import { Store } from './db/store.mjs';
import { migrate } from './db/migrate.mjs';
import { logResult } from './util/format.mjs';
import { login } from './services/auth.mjs';
import { charge } from './services/billing.mjs';
import { buildReport } from './services/report.mjs';
import { notify } from './services/notify.mjs';

export function runApp() {
  logger.info('app starting');
  const config = loadConfig('{"port": 80, "region": "us"}');
  loadConfig('not json');

  buildRequest('GET', 'https://example.test/api');
  buildRequest('POST', 'http://example.test/api');
  const statuses = [200, 404, 503].map(parseStatus);

  let calls = 0;
  const flaky = withRetry((n) => {
    calls++;
    if (n < 3) throw new Error(`try ${n}`);
    return 'done';
  });
  try {
    withRetry(() => {
      throw new Error('always');
    }, 2);
  } catch (err) {
    logger.warn('gave up', err.message);
  }

  const store = new Store();
  store.set('a', 1);
  store.set('a', 2);
  store.get('b');
  store.remove('a');
  migrate(store, {
    one: (s) => s.set('x', 1),
    two: () => {
      throw new Error('boom');
    },
  });

  logResult('statuses', statuses.join(','));
  const ok = [login('ada', 'lovelace'), login('ada', 'nope'), login('bob', 'x')];
  charge('acct-1', 2550);
  charge('acct-2', 0);
  charge('acct-3', 250000);
  buildReport('ada');
  notify('ada', 'hello');
  notify('ada', '');

  logger.info('app finished');
  return { port: config.port, flaky, calls, ok };
}
