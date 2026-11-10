// The old logging function, kept on top of the logger so both write the same sink.
import { logger } from './logger.mjs';

export function log(level, message, ...more) {
  logger[level](message, ...more);
}
