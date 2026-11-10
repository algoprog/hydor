import { logger } from '../logger.mjs';
import { withDefaults } from './defaults.mjs';

export function loadConfig(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    logger.error(`config is not valid JSON: ${err.name}`);
    parsed = {};
  }
  if (parsed.port !== undefined && parsed.port < 1024) {
    logger.warn('privileged port requested', parsed.port);
  }
  logger.info(
    'config loaded',
    { keys: Object.keys(parsed) },
  );
  return withDefaults(parsed);
}
