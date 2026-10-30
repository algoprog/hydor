// Which account a new session runs as, when an agent has more than one (Settings → Accounts):
// the CLI's own sign-in, or an added one.
import { useRef, useState } from 'react';
import { ChevronDown, UserRound } from 'lucide-react';
import type { Agent, AgentAccount } from '@shared/types';
import { go } from '../../lib/nav';
import { MenuItem, MenuSep, OptionRow, Popover } from '../../components/ui';

export function AccountPicker({ agent, accounts, value, onChange }: { agent: Agent; accounts: AgentAccount[]; value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const current = accounts.find((a) => a.id === value);
  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="The account this session runs as"
        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[13px] text-fg-2 transition-colors hover:bg-bg-2 hover:text-fg"
      >
        <UserRound size={14} className="text-fg-3" />
        <span className="max-w-[120px] truncate">{current?.name ?? 'Your sign-in'}</span>
        <ChevronDown size={13} className="text-fg-3" />
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={240}>
        <OptionRow label="Your sign-in" hint={`The ${agent === 'claude' ? 'Claude Code' : 'Codex'} CLI's own account`} selected={!current} onClick={() => (onChange(''), setOpen(false))} />
        {accounts.map((a) => (
          <OptionRow key={a.id} label={a.name} selected={a.id === value} onClick={() => (onChange(a.id), setOpen(false))} />
        ))}
        <MenuSep />
        <MenuItem onClick={() => (setOpen(false), go('/settings?s=accounts'))}>Manage accounts…</MenuItem>
      </Popover>
    </>
  );
}
