import { log } from '../log.mjs';
import { catalog } from '../util/catalog.mjs';

export function buildReport(user) {
  const sections = catalog('info');
  log('info', `report for ${user}`, sections.length);
  for (const section of sections) {
    log('info', `  section: ${section}`);
  }
  if (catalog('warn').length > 0) {
    log('warn', `${user} has ${catalog('warn').length} warning section(s)`);
  }
  return sections;
}
