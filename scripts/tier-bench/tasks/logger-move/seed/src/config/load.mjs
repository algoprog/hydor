import { log } from '../log.mjs';
import { withDefaults } from './defaults.mjs';

export function loadConfig(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    log('error', `config is not valid JSON: ${err.name}`);
    parsed = {};
  }
  if (parsed.port !== undefined && parsed.port < 1024) {
    log('warn', 'privileged port requested', parsed.port);
  }
  log(
    'info',
    'config loaded',
    { keys: Object.keys(parsed) },
  );
  return withDefaults(parsed);
}
