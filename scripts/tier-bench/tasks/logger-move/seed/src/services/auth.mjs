import { log } from '../log.mjs';

const USERS = { ada: 'lovelace', alan: 'turing' };

export function login(user, password) {
  if (!(user in USERS)) {
    log('warn', `unknown user ${user}`);
    return false;
  }
  if (USERS[user] !== password) {
    log('error', `bad password for ${user}`, { attempts: 1 });
    return false;
  }
  log('info', `${user} logged in`);
  return true;
}
