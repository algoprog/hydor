// The editors' frame, as Photoshop, Affinity Photo and Pixelmator lay theirs out, built from the shell's parts:
//   EditorShell   on a computer: the top bar (the page's way back, the menus, the actions such as Undo and Save), the
//                 options bar of the tool in use, the tool rail down the left, the stage in the middle, the dock of
//                 panels on the right and the status bar at the foot. On a phone the editor fills the screen: the top
//                 bar (back, the name, one Menus button, Save), the stage, the tool's options as a row to swipe, and the
//                 tools along the bottom with a Panels button that opens them in a sheet.
//   OptionsBar    the row of a tool's settings (OptionsSep between groups, OptionsLabel for a word before a control).
//   StatusBar     the row of facts at the foot (StatusItem each).
import type { ReactNode } from 'react';
import { cx } from '../../../components/ui';

export function OptionsBar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('flex h-10 shrink-0 items-center gap-2 overflow-x-auto border-b border-line bg-bg-1 px-2.5 text-[12px] text-fg-2 [&::-webkit-scrollbar]:hidden', className)}>{children}</div>;
}

export const OptionsSep = () => <span aria-hidden className="mx-0.5 h-5 w-px shrink-0 bg-line" />;

export const OptionsLabel = ({ children }: { children: ReactNode }) => <span className="shrink-0 text-[12px] text-fg-3">{children}</span>;

export function StatusBar({ children }: { children: ReactNode }) {
  return <div className="flex h-7 shrink-0 items-center gap-4 overflow-hidden border-t border-line bg-bg-1 px-3 text-[11.5px] whitespace-nowrap text-fg-3 tnum">{children}</div>;
}

export function StatusItem({ children, title, className, onClick }: { children: ReactNode; title?: string; className?: string; onClick?: () => void }) {
  if (onClick)
    return (
      <button type="button" title={title} onClick={onClick} className={cx('flex h-5 min-w-0 shrink-0 items-center gap-1.5 rounded px-1 hover:bg-bg-2 hover:text-fg', className)}>
        {children}
      </button>
    );
  return (
    <span title={title} className={cx('flex min-w-0 shrink-0 items-center gap-1.5', className)}>
      {children}
    </span>
  );
}

export function EditorShell({
  mobile,
  top,
  options,
  rail,
  stage,
  dock,
  status,
  phoneTools,
  phoneSheet,
}: {
  mobile: boolean;
  /** The top bar's content (its height and safe area are the shell's). */
  top: ReactNode;
  options?: ReactNode;
  rail?: ReactNode;
  stage: ReactNode;
  dock?: ReactNode;
  status?: ReactNode;
  /** On a phone: the tools' bar along the bottom, and the panels' sheet when it is open (over the stage's foot). */
  phoneTools?: ReactNode;
  phoneSheet?: ReactNode;
}) {
  if (mobile)
    return (
      <div className="flex h-full min-h-0 flex-col bg-bg">
        <header className="shrink-0 border-b border-line bg-bg pt-[var(--safe-top)]">
          <div className="flex h-12 items-center gap-1 px-1.5">{top}</div>
        </header>
        <div className="relative min-h-0 flex-1">
          {stage}
          {phoneSheet}
        </div>
        {options}
        {phoneTools && <nav className="shrink-0 border-t border-line bg-bg pb-[var(--safe-bottom)]">{phoneTools}</nav>}
      </div>
    );
  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      <header className="shrink-0 border-b border-line bg-bg pt-[var(--safe-top)]">
        <div className="flex h-11 items-center gap-1 px-1.5">{top}</div>
      </header>
      {options}
      <div className="flex min-h-0 flex-1">
        {rail && <div className="flex shrink-0 border-r border-line bg-bg-1">{rail}</div>}
        <div className="relative min-w-0 flex-1">{stage}</div>
        {dock}
      </div>
      {status}
    </div>
  );
}
