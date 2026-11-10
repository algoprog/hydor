import { log } from '../log.mjs';

export function buildRequest(method, url, headers = {}) {
  log('info', `${method} ${url}`);
  if (!url.startsWith('https://')) {
    log('warn', `insecure url: ${url}`, { method });
  }
  return { method, url, headers };
}

export function parseStatus(code) {
  if (code >= 500) {
    log('error', `server error ${code}`);
    return 'error';
  }
  if (code >= 400) {
    log('warn', `client error ${code}`, code === 404 ? 'not found' : 'rejected');
    return 'rejected';
  }
  return 'ok';
}
