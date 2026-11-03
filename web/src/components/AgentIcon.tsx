import { useId } from 'react';
import type { Agent } from '@shared/types';
import { MARK_BOX, WaterOmega } from './Logo';
import { cx } from './ui';

/** Custom, the app's own agent: the app's mark without its tile, the Ω full of water; it ebbs and flows while it works. */
function CustomMark({ size, className, working }: { size: number; className?: string; working?: boolean }) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox={MARK_BOX} className={cx('shrink-0 text-fg-2', className)} aria-label="Custom" role="img">
      <WaterOmega id={id} water={working ? 'throbber-water' : undefined} />
    </svg>
  );
}

/** Small agent marks: a starburst for Claude Code, a knot for Codex; `spinning` turns it slowly while it works. */
export function AgentIcon({ agent, size = 16, className, spinning, name }: { agent: Agent; size?: number; className?: string; spinning?: boolean; name?: string }) {
  // Custom was once called Console.
  if (agent === 'acp' && (name === 'Custom' || name === 'Console')) return <CustomMark size={size} className={className} working={spinning} />;
  if (agent === 'acp') {
    // Another agent (Gemini CLI, OpenCode…): its first letter on a rounded tile.
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" className={cx('shrink-0 text-info', spinning && 'spin-gentle', className)} aria-label={name ?? 'Agent'} role="img">
        <rect x="3" y="3" width="18" height="18" rx="5.5" fill="none" stroke="currentColor" strokeWidth="2" />
        <text x="12" y="16.2" textAnchor="middle" fontSize="11" fontWeight="700" fill="currentColor" fontFamily="ui-sans-serif, system-ui, sans-serif">
          {(name?.trim()[0] ?? 'A').toUpperCase()}
        </text>
      </svg>
    );
  }
  if (agent === 'claude') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" className={cx('shrink-0 text-claude', spinning && 'spin-gentle', className)} aria-label="Claude Code" role="img">
        <g stroke="currentColor" strokeWidth="2.3" strokeLinecap="round">
          <path d="M12 3.2v5.1M12 15.7v5.1M3.2 12h5.1M15.7 12h5.1M5.8 5.8l3.6 3.6M14.6 14.6l3.6 3.6M18.2 5.8l-3.6 3.6M9.4 14.6l-3.6 3.6" />
        </g>
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={cx('shrink-0 text-codex', spinning && 'spin-gentle', className)} aria-label="Codex" role="img">
      <path
        d="M12 2.8 19.8 7.3v9.4L12 21.2 4.2 16.7V7.3Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="m9 10 2.4 2L9 14M13 14.2h2.6" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** An agent's name; an ACP session's comes with it (`acpName`). */
export const agentName = (a: Agent, acpName?: string) => (a === 'claude' ? 'Claude Code' : a === 'codex' ? 'Codex' : (acpName ?? 'Agent'));
