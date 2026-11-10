import { log } from '../log.mjs';

export const DEFAULTS = { port: 8080, retries: 2, region: 'eu' };

export function withDefaults(config = {}) {
  const merged = { ...DEFAULTS, ...config };
  log('info', 'config merged', Object.keys(merged).length);
  return merged;
}
