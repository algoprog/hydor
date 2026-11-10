import { logger } from '../logger.mjs';

// Old style was log('info', ...) at every call site; there is a logger with one method per level now.

export function logResult(label, value) {
  const text = `${label}: ${value}`;
  logger.info(text);
  return text;
}

export function money(cents) {
  if (!Number.isInteger(cents)) {
    logger.warn('money() wants whole cents', cents);
    cents = Math.round(cents);
  }
  return `${(cents / 100).toFixed(2)} EUR`;
}
