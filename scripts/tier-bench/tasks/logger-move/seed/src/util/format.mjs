import { log } from '../log.mjs';

// Old style was log('info', ...) at every call site; there is a logger with one method per level now.

export function logResult(label, value) {
  const text = `${label}: ${value}`;
  log('info', text);
  return text;
}

export function money(cents) {
  if (!Number.isInteger(cents)) {
    log('warn', 'money() wants whole cents', cents);
    cents = Math.round(cents);
  }
  return `${(cents / 100).toFixed(2)} EUR`;
}
