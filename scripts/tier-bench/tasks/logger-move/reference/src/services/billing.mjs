import { logger } from '../logger.mjs';
import { money } from '../util/format.mjs';

export function charge(account, cents) {
  if (cents <= 0) {
    logger.error(
      `invalid amount for ${account}`,
      cents,
    );
    return null;
  }
  const label = money(cents);
  logger.info(`charged ${account} ${label}`);
  if (cents > 100000) {
    logger.warn(`large charge for ${account}`, { cents, label });
  }
  return { account, cents };
}
