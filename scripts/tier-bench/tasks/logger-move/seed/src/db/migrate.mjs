import { log } from '../log.mjs';

export function migrate(store, steps) {
  let applied = 0;
  for (const [name, step] of Object.entries(steps)) {
    try {
      step(store);
      applied++;
      log('info', `migration ${name} applied`);
    } catch (err) {
      log('error', `migration ${name} failed`, err.message);
      break;
    }
  }
  log('info', `${applied} of ${Object.keys(steps).length} migrations applied`);
  return applied;
}
