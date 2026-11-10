import { log } from '../log.mjs';

const sent = [];

export function notify(user, text) {
  if (text.length === 0) {
    log('warn', 'empty notification skipped', user);
    return false;
  }
  sent.push({ user, text });
  log('info', `notified ${user}`, text.length);
  return true;
}

export function sentCount() {
  return sent.length;
}
