import { logger } from '../logger.mjs';
import { catalog } from '../util/catalog.mjs';

export function buildReport(user) {
  const sections = catalog('info');
  logger.info(`report for ${user}`, sections.length);
  for (const section of sections) {
    logger.info(`  section: ${section}`);
  }
  if (catalog('warn').length > 0) {
    logger.warn(`${user} has ${catalog('warn').length} warning section(s)`);
  }
  return sections;
}
