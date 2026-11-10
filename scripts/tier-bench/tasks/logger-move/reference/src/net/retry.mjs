import { logger } from '../logger.mjs';

export function withRetry(fn, attempts = 3) {
  let lastError;
  for (let i = 1; i <= attempts; i++) {
    try {
      const value = fn(i);
      logger.info(`attempt ${i} ok`);
      return value;
    } catch (err) {
      const level = i === attempts ? 'error' : 'warn';
      logger[level](`attempt ${i} failed: ${err.message}`);
      lastError = err;
    }
  }
  throw lastError;
}
