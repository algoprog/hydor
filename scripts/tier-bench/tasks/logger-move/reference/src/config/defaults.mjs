import { logger } from '../logger.mjs';

export const DEFAULTS = { port: 8080, retries: 2, region: 'eu' };

export function withDefaults(config = {}) {
  const merged = { ...DEFAULTS, ...config };
  logger.info('config merged', Object.keys(merged).length);
  return merged;
}
