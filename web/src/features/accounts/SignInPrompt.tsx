// The app needs a Claude Code, Codex or Grok Build account that is signed out, and nothing else could do the work: a card
// asks to sign in again (SignInPrompt, above the toasts on every page; Not now hides it for an hour), and a session it
// stopped says so in its message box (SignInBanner), whatever Not now said. Both open the same sign-in (LoginDialog).
import { useCallback, useEffect, useState } from 'react';
import { KeyRound, LogIn } from 'lucide-react';
import type { SignInNeed } from '@shared/types';
import { ACCOUNT_AGENT_NAMES } from '@shared/grok';
import { del, post } from '../../lib/api';
import { go } from '../../lib/nav';
import { toastError, useApp, useSessions } from '../../lib/store';
import { Button, cx } from '../../components/ui';
import { LoginDialog } from '../settings/AccountSettings';
import { needId, needQuery, useSignIn } from './signin';

/** Signing in again for one need: the dialog to render, what opens it, and what follows a finished sign-in. */
export function useSignInAction(need: SignInNeed) {
  const [open, setOpen] = useState(false);
  const account = useApp((s) => (need.account ? s.boot?.accounts.find((a) => a.id === need.account) : undefined));
  const q = needQuery(need);
  const agent = need.agent;
  const name = need.name;
  // The server reads the account's status and clears the need when it is signed in; sessions it stopped carry on by
  // themselves. (The dialog itself says it is signed in.)
  const onDone = useCallback(() => {
    post<{ signedIn: boolean; needs: SignInNeed[] }>(`/api/accounts/sign-in/${agent}/check${q}`).then(
      (r) => {
        useSignIn.getState().set(r.needs);
        if (!r.signedIn) toastError(new Error(`${name} is not signed in yet`));
      },
      toastError,
    );
  }, [agent, q, name]);
  const onClose = useCallback(() => setOpen(false), []);
  // An added account that is gone (removed meanwhile) has nothing to sign in to: never the program's own sign-in instead.
  const node = need.account && !account ? null : <LoginDialog agent={agent} account={account} open={open} onClose={onClose} onDone={onDone} />;
  return { start: () => setOpen(true), node };
}

const program = (n: SignInNeed) => ACCOUNT_AGENT_NAMES[n.agent];

/** The account's name to start a line with: the app's own "your main Claude account" (no email known yet) capitalised. */
const lead = (name: string) => (name.startsWith('your ') ? `Y${name.slice(1)}` : name);

/** Why it is asked: background work no other account could do, and the sessions it stopped. */
function Why({ need }: { need: SignInNeed }) {
  const byKey = useSessions((s) => s.byKey);
  const first = need.sessions[0] ? byKey[need.sessions[0]]?.title : undefined;
  const more = need.sessions.length - 1;
  return (
    <>
      {need.background && (
        <div className="mt-1 text-[12.5px] leading-snug text-fg-2">
          {need.task ? `Background work needs it (${need.task}), and no other account or Custom model could do it.` : 'Background work needs it (titles, memory and the helper model’s other jobs), and no other account or Custom model could do it.'}
        </div>
      )}
      {need.sessions.length > 0 && (
        <div className="mt-1 flex gap-1 text-[12.5px] leading-snug text-fg-2">
          {first ? (
            <>
              <span translate="no" className="min-w-0 truncate font-medium text-fg">
                {first}
              </span>
              <span className="shrink-0">{more > 0 ? `and ${more} more continue once you sign in.` : 'continues once you sign in.'}</span>
            </>
          ) : (
            <span>{need.sessions.length > 1 ? `${need.sessions.length} sessions continue once you sign in.` : 'A session continues once you sign in.'}</span>
          )}
        </div>
      )}
    </>
  );
}

function Card({ need }: { need: SignInNeed }) {
  const { start, node } = useSignInAction(need);
  const notNow = () => {
    // Gone at once; the server's answer (with hiddenUntil) is what stays.
    const hiddenUntil = Date.now() + 3_600_000;
    const was = useSignIn.getState().needs;
    useSignIn.getState().set(was.map((n) => (needId(n) === needId(need) ? { ...n, hiddenUntil } : n)));
    del<{ needs: SignInNeed[] }>(`/api/accounts/sign-in/${need.agent}${needQuery(need)}`).then(
      (r) => useSignIn.getState().set(r.needs),
      (e) => (useSignIn.getState().set(was), toastError(e)),
    );
  };
  return (
    <div role="alert" className="anim-pop pointer-events-auto w-[min(92vw,360px)] rounded-2xl border border-warn/35 bg-elevated text-fg shadow-lg">
      <div className="rounded-2xl bg-warn/8 px-3.5 py-3 text-[13px]">
        <div className="flex gap-2.5">
          <KeyRound size={15} className="mt-[3px] shrink-0 text-warn" />
          <div className="min-w-0 flex-1">
            <div className="text-[13.5px] leading-snug font-medium">{`Sign in to ${program(need)} again`}</div>
            <div className="mt-0.5 flex gap-1 text-[12.5px] leading-snug text-fg-2">
              <span translate="no" className="min-w-0 truncate font-medium text-fg">
                {lead(need.name)}
              </span>
              <span className="shrink-0">is signed out.</span>
            </div>
            <Why need={need} />
            <div className="mt-2.5 flex items-center gap-2">
              <Button size="sm" variant="primary" icon={<LogIn size={14} />} onClick={start}>
                Sign in
              </Button>
              <Button size="sm" variant="ghost" onClick={notNow}>
                Not now
              </Button>
            </div>
          </div>
        </div>
      </div>
      {node}
    </div>
  );
}

const MAX_CARDS = 2;

/**
 * The cards, newest first, at most two (then a link to the accounts). Mounted in the stack above the toasts, so they never
 * cover one: bottom right on a computer, the width of the screen above the message box on a phone.
 */
export function SignInPrompt() {
  const needs = useSignIn((s) => s.needs);
  // Not now hides a card until its hour is up: it comes back by itself then.
  const [now, setNow] = useState(() => Date.now());
  const next = needs.reduce((m, n) => (n.hiddenUntil && n.hiddenUntil > now ? Math.min(m, n.hiddenUntil) : m), Infinity);
  useEffect(() => {
    if (next === Infinity) return;
    const t = setTimeout(() => setNow(Date.now()), Math.min(next - Date.now() + 500, 2 ** 31 - 1));
    return () => clearTimeout(t);
  }, [next]);
  const shown = needs.filter((n) => !n.hiddenUntil || n.hiddenUntil <= now).sort((a, b) => b.at - a.at);
  if (!shown.length) return null;
  const rest = shown.length - MAX_CARDS;
  return (
    <>
      {shown.slice(0, MAX_CARDS).map((n) => (
        <Card key={needId(n)} need={n} />
      ))}
      {rest > 0 && (
        <button type="button" onClick={() => go('/settings?s=accounts')} className={cx('pointer-events-auto rounded-md px-1 text-[12.5px] font-medium text-accent hover:underline')}>
          {`+${rest} more`}
        </button>
      )}
    </>
  );
}

/** In a session's message box: the account it runs on is signed out, and the session continues once it is signed in again. */
export function SignInBanner({ need, className }: { need: SignInNeed; className?: string }) {
  const { start, node } = useSignInAction(need);
  return (
    <div className={cx('anim-expand flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-2xl border border-warn/30 bg-warn/8 px-4 py-2.5 text-[13.5px]', className)} role="status">
      <KeyRound size={15} className="shrink-0 text-warn" />
      <span className="min-w-[min(100%,15rem)] flex-1 leading-snug">
        <span className="block font-medium">
          <span translate="no">{lead(need.name)}</span> is signed out
        </span>
        <span className="block text-[12.5px] text-fg-2">This session continues once you sign in again.</span>
      </span>
      <Button size="sm" variant="primary" icon={<LogIn size={14} />} onClick={start}>
        Sign in
      </Button>
      {node}
    </div>
  );
}
