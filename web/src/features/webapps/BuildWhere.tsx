// Where a build of the app runs, said before one is started (server/webapps/build-box.ts): in the sandbox with only the
// package registry to reach, in the sandbox with the network as it is, or, where there is no sandbox, with the owner's
// own access, which is a warning. After a build that wanted something from elsewhere, it says so and what to do.
import { ShieldAlert, ShieldCheck } from 'lucide-react';
import type { BuildBox } from '@shared/webapps';
import { tr } from '../../i18n/runtime';
import { cx } from '../../components/ui';

export function BuildWhere({ box, refused, className }: { box: BuildBox | undefined; refused?: string[]; className?: string }) {
  if (!box) return null;
  const own = box.access === 'own';
  const Icon = own ? ShieldAlert : ShieldCheck;
  const where = (
    <p data-build-where={box.access} className={cx('flex items-start gap-1.5 text-[12.5px] leading-snug', own ? 'text-warn' : 'text-fg-3', !refused?.length && className)}>
      <Icon size={13} className="mt-[2px] shrink-0" />
      <span>
        {own ? (
          tr('There is no sandbox on this computer: a build runs with your own access to your files and the network.')
        ) : box.access === 'open' ? (
          tr('A build runs in a sandbox that keeps it to the app’s folder. This computer’s sandbox cannot limit the network, so a build can use it.')
        ) : box.registries.length ? (
          <>
            {tr('A build runs in a sandbox: it reaches only the app’s folder and the package registry')} (<span translate="no">{box.registries.join(', ')}</span>).
          </>
        ) : (
          tr('A build runs in a sandbox: it reaches only the app’s folder, and no network.')
        )}
      </span>
    </p>
  );
  if (!refused?.length) return where;
  const hosts = refused.join(', ');
  return (
    <div className={cx('space-y-1.5', className)}>
      <p data-build-refused role="status" className="flex items-start gap-1.5 text-[12.5px] leading-snug text-warn">
        <ShieldAlert size={13} className="mt-[2px] shrink-0" />
        <span className="min-w-0 break-words">
          {tr(`This build tried to reach ${hosts}; builds may only reach the package registry.`)} {tr('Take what it needs from the registry or put the file in the app’s folder, or turn that download off in the build (many tools have a variable for it).')}
        </span>
      </p>
      {where}
    </div>
  );
}
