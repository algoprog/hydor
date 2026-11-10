import { logger } from '../logger.mjs';

const sent = [];

export function notify(user, text) {
  if (text.length === 0) {
    logger.warn('empty notification skipped', user);
    return false;
  }
  sent.push({ user, text });
  logger.info(`notified ${user}`, text.length);
  return true;
}

export function sentCount() {
  return sent.length;
}
