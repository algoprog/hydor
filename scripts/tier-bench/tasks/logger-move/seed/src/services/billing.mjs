import { log } from '../log.mjs';
import { money } from '../util/format.mjs';

export function charge(account, cents) {
  if (cents <= 0) {
    log(
      'error',
      `invalid amount for ${account}`,
      cents,
    );
    return null;
  }
  const label = money(cents);
  log('info', `charged ${account} ${label}`);
  if (cents > 100000) {
    log('warn', `large charge for ${account}`, { cents, label });
  }
  return { account, cents };
}
