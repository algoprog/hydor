// What to do when a copy of Hydor from before 0.78.0 cannot update itself: Hydor's history on GitHub was rewritten
// then, and that copy's updater only fast-forwards ("Not possible to fast-forward, aborting."). It is updated once on
// that machine itself (the installer again, or by hand as the guide says), and from then on updates from here again.
// Shown on an older machine's page (MachineOld.tsx) and in its Settings → General (GeneralSettings.tsx).
import { CopyButton } from '../../components/Markdown';
import { BY_HAND, INSTALL_AGAIN } from '../../lib/updates';

export function BeforeRewrite({ name, className }: { name: string; className?: string }) {
  return (
    <div className={className ?? 'mt-2 space-y-2 text-[13px] leading-relaxed text-fg-2'}>
      <p>{`Hydor's history on GitHub was rewritten in version 0.78.0, and copies older than that can't update themselves past it. Update it once on ${name} itself; after that, it updates from here again. If you installed it with the installer, run it again there:`}</p>
      <div className="flex items-center gap-2 rounded-lg border border-line bg-bg py-1.5 pl-3 pr-1.5">
        <code className="min-w-0 flex-1 break-all font-mono text-[12px] leading-snug text-fg" translate="no">
          {INSTALL_AGAIN}
        </code>
        <CopyButton text={INSTALL_AGAIN} />
      </div>
      <p>
        In Docker, or from a git clone of your own:{' '}
        <a href={BY_HAND} className="text-accent hover:underline">
          update an older copy by hand
        </a>
        .
      </p>
    </div>
  );
}
