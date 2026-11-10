import { logger } from '../logger.mjs';

export function migrate(store, steps) {
  let applied = 0;
  for (const [name, step] of Object.entries(steps)) {
    try {
      step(store);
      applied++;
      logger.info(`migration ${name} applied`);
    } catch (err) {
      logger.error(`migration ${name} failed`, err.message);
      break;
    }
  }
  logger.info(`${applied} of ${Object.keys(steps).length} migrations applied`);
  return applied;
}
