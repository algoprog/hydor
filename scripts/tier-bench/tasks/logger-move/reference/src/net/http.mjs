import { logger } from '../logger.mjs';

export function buildRequest(method, url, headers = {}) {
  logger.info(`${method} ${url}`);
  if (!url.startsWith('https://')) {
    logger.warn(`insecure url: ${url}`, { method });
  }
  return { method, url, headers };
}

export function parseStatus(code) {
  if (code >= 500) {
    logger.error(`server error ${code}`);
    return 'error';
  }
  if (code >= 400) {
    logger.warn(`client error ${code}`, code === 404 ? 'not found' : 'rejected');
    return 'rejected';
  }
  return 'ok';
}
