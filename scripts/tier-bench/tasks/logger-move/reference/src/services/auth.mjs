import { logger } from '../logger.mjs';

const USERS = { ada: 'lovelace', alan: 'turing' };

export function login(user, password) {
  if (!(user in USERS)) {
    logger.warn(`unknown user ${user}`);
    return false;
  }
  if (USERS[user] !== password) {
    logger.error(`bad password for ${user}`, { attempts: 1 });
    return false;
  }
  logger.info(`${user} logged in`);
  return true;
}
