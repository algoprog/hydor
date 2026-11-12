// In a session's options (the message box's chip): the account it runs as, when its agent has more than one
// (Settings → Accounts). Another moves its history there, and its agent starts there with the next message.
import { useMemo } from 'react';
import type { SessionSummary } from '@shared/types';
import { enc, post } from '../../lib/api';
import { toast, toastError, useApp } from '../../lib/store';
import { AccountPicker } from '../home/AccountPicker';

export function SessionAccount({ s }: { s: SessionSummary }) {
  const all = useApp((x) => x.boot?.accounts);
  const accounts = useMemo(() => (all ?? []).filter((a) => a.agent === s.agent), [all, s.agent]);
  if (!accounts.length || (s.agent !== 'claude' && s.agent !== 'codex')) return null;
  const move = (id: string) => {
    if (id === (s.account ?? '')) return;
    const name = accounts.find((a) => a.id === id)?.name ?? 'your sign-in';
    post(`/api/sessions/${enc(s.key)}/account`, { account: id })
      .then(() => toast(`This session runs as ${name} from your next message`))
      .catch(toastError);
  };
  return <AccountPicker agent={s.agent} accounts={accounts} value={s.account ?? ''} onChange={move} />;
}
