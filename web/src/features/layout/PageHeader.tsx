import type { ReactNode } from 'react';
import type { TipId } from '@shared/tips';
import { ArrowLeft, Menu, PanelLeftOpen } from 'lucide-react';
import { MOD } from '../../lib/format';
import { useUI } from '../../lib/store';
import { cx, IconButton, useIsMobile } from '../../components/ui';

/** Opens the navigation: the drawer on phones, the hidden sidebar on desktop. */
export function NavButton() {
  const mobile = useIsMobile();
  const sideOpen = useUI((s) => s.sideOpen);
  if (!mobile && sideOpen) return null;
  return mobile ? (
    <IconButton label="Menu" onClick={() => useUI.getState().set({ drawerOpen: true })}>
      <Menu size={19} />
    </IconButton>
  ) : (
    <IconButton label={`Show sidebar (${MOD}B)`} onClick={() => useUI.getState().set({ sideOpen: true })}>
      <PanelLeftOpen size={18} />
    </IconButton>
  );
}

/** The way back from a page that opened from another (an app's editor, a section of Settings on a phone): its arrow. */
export function BackButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <IconButton label={label} onClick={onClick}>
      <ArrowLeft size={18} />
    </IconButton>
  );
}

/**
 * The top bar of a page: title, optional subtitle and actions, optional tabs underneath. `tip`: the tip that says
 * what the page is for, the first time it opens (features/tips), pointing at its title. `back`: an arrow before
 * the title, to the page it came from (beside the title, not in it, so nothing cuts it off).
 */
export function PageHeader({
  title,
  sub,
  actions,
  children,
  className,
  tip,
  back,
}: {
  title: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  tip?: TipId;
  back?: { label: string; onClick: () => void };
}) {
  return (
    <header className={cx('shrink-0 border-b border-line bg-bg pt-[var(--safe-top)]', className)}>
      <div className="flex h-14 items-center gap-2 px-3 sm:px-6">
        <NavButton />
        {back && <BackButton label={back.label} onClick={back.onClick} />}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[16px] font-semibold tracking-tight">
            {tip ? (
              <span data-tip={tip} className="inline-block max-w-full truncate align-top">
                {title}
              </span>
            ) : (
              title
            )}
          </h1>
          {sub && <div className="truncate text-[12.5px] text-fg-3">{sub}</div>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
      </div>
      {children && <div className="-mb-px px-2 sm:px-4">{children}</div>}
    </header>
  );
}
