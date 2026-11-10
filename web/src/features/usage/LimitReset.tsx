import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowRightLeft, Clock3, RotateCcw } from 'lucide-react';
import type { Agent, AgentUsage, LimitReset, LimitResetResult } from '@shared/types';
import { del, enc, post, put } from '../../lib/api';
import { pct, untilText } from '../../lib/format';
import { toast, toastError, useApp, useAppSettings, usedUp, useUsage } from '../../lib/store';
import { agentName } from '../../components/AgentIcon';
import { Button, cx, useConfirm } from '../../components/ui';
import { LOCALE } from '../../i18n/locale';

const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;

/** Resets that work right now, soonest to expire first. */
export function usableResets(u: AgentUsage | null | undefined): LimitReset[] {
  return (u?.resetCredits?.items ?? []).filter((r) => r.usableNow);
}

/** Asks first, then spends one limit reset (of the agent's own sign-in, or an added account) and shows how it went. */
export function useLimitReset(agent: Agent, account?: string) {
  const u = useUsage((s): AgentUsage | null => (account ? (s.accounts[account] ?? null) : agent === 'acp' ? null : s[agent]));
  const [confirm, confirmNode] = useConfirm();
  const [busy, setBusy] = useState(false);

  const use = async (item?: LimitReset) => {
    const pick = item ?? usableResets(u)[0];
    if (!pick || busy) return;
    const n = u?.resetCredits?.available ?? 1;
    const top = (u?.windows ?? []).reduce<{ label: string; usedPercent: number | null } | null>((a, w) => ((w.usedPercent ?? 0) > (a?.usedPercent ?? -1) ? w : a), null);
    const ok = await confirm({
      title: `Use a ${agentName(agent)} limit reset?`,
      body: (
        <div className="space-y-2">
          <div>
            This clears the {agentName(agent)} usage limits now instead of waiting for them to reset. It uses <b className="font-medium text-fg">{pick.title}</b>
            {pick.expiresAt ? `, which expires ${untilText(pick.expiresAt)}` : ''}; {n > 1 ? `${plural(n - 1, 'reset')} will be left.` : 'it is the last one.'}
          </div>
          {!u?.limited && top && (
            <div className="rounded-lg bg-warn/10 px-3 py-2 text-[13px] text-warn">
              You are not at a limit right now ({top.label}: {pct(top.usedPercent)} used).
            </div>
          )}
        </div>
      ),
      confirm: 'Use reset',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await post<LimitResetResult>(`/api/usage/${enc(agent)}/reset`, { id: pick.id, account });
      useUsage.getState().set(account ? { accounts: { [account]: r.usage } } : { [agent]: r.usage });
      toast(r.message, r.ok ? 'ok' : 'info');
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return { use, busy, node: confirmNode };
}

/** Another signed-in account of the agent (its own sign-in or an added one) with usage left; null when none. */
function useSpareAccount(agent: Agent, account: string | undefined): { id: string | undefined; name: string } | null {
  const added = useApp((s) => s.boot?.accounts);
  const usage = useUsage();
  if (agent === 'acp') return null;
  const pool: { id: string | undefined; name: string }[] = [{ id: undefined, name: usage[agent]?.account?.email ?? `your main ${agentName(agent)} account` }, ...(added ?? []).filter((a) => a.agent === agent).map((a) => ({ id: a.id, name: a.name }))];
  return pool.find((a) => a.id !== account && !usedUp(a.id ? usage.accounts[a.id] : usage[agent])) ?? null;
}

/**
 * Whose usage limit it is, in words: the agent's when you have one account of it; when you have several, all of
 * them, or the one at its limit by name while another still has usage left (`spare`).
 */
function useLimitTitle(agent: Agent, account: string | undefined, spare: { id: string | undefined } | null): string {
  const added = useApp((s) => s.boot?.accounts);
  const email = useUsage((s) => (agent === 'acp' ? undefined : s[agent]?.account?.email));
  const others = (added ?? []).filter((a) => a.agent === agent);
  if (agent === 'acp' || !others.length) return `You've hit the ${agentName(agent)} usage limit`;
  if (!spare) return `All your ${agentName(agent)} accounts have hit their usage limit`;
  const name = account ? others.find((a) => a.id === account)?.name : email;
  return name ? `${name} has hit its usage limit` : `Your main ${agentName(agent)} account has hit its usage limit`;
}

/** Renders again every `ms` while `on`, so "in 1 h 31 min" keeps counting down. */
function useTicking(on: boolean, ms = 30_000) {
  const [, set] = useState(0);
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => set((x) => x + 1), ms);
    return () => clearInterval(t);
  }, [on, ms]);
}

/**
 * Shown where you work with an agent whose usage is used up: when it comes back, and a reset if there is
 * one. In a session (`session` given) it also says when the session continues by itself (the server keeps
 * that on the limit's reset time as it moves), or offers to. One banner: the text has the width, and its
 * buttons go under it when there is no room beside it.
 */
export function LimitBanner({ agent, account, className, session }: { agent: Agent; account?: string; className?: string; session?: { key: string; resumeAt?: number; busy?: boolean } }) {
  const u = useUsage((s): AgentUsage | null => (account ? (s.accounts[account] ?? null) : agent === 'acp' ? null : s[agent]));
  const reset = useLimitReset(agent, account);
  const spare = useSpareAccount(agent, account);
  const title = useLimitTitle(agent, account, spare);
  const autoSwitch = useAppSettings((s) => s.autoSwitch);
  const autoResume = useAppSettings((s) => s.autoResume);
  useEffect(() => void useAppSettings.getState().load(), []);
  // Another account has usage left and Switch accounts at a limit is on: the session (or a new one) just moves there.
  const lim = session?.busy || (spare && autoSwitch) ? null : u?.limited;
  const resumeAt = session?.resumeAt;
  useTicking(!!lim || !!resumeAt);
  if (!lim && !resumeAt) return null;
  const cancel = () => del(`/api/sessions/${enc(session!.key)}/resume-at`).catch(toastError);
  const usable = usableResets(u);
  // In a session with Resume after usage limits on, a turn the limit stopped continues by itself: no warning,
  // only whose limit it hit, which one, and when it continues (and a reset, if there is one). Not known yet
  // whether it is on: nothing, rather than a flash.
  if (session && autoResume !== false) {
    if (!resumeAt || autoResume === null) return null;
    return (
      <div className={cx('flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-2xl border border-line-2 bg-panel px-4 py-2.5 text-[13.5px]', className)} role="status">
        <Clock3 size={15} className={cx('shrink-0 text-busy', lim && 'mt-[3px] self-start')} />
        <span className="min-w-0 flex-1 leading-snug">
          {lim && <span className="block font-medium">{title}</span>}
          <span className={cx('block', lim && 'text-[12.5px] text-fg-2')}>
            {lim && (
              <>
                {lim.label}
                {' · '}
              </>
            )}
            Continues by itself <span className="font-medium text-fg">{untilText(resumeAt)}</span>.
          </span>
        </span>
        <span className="flex items-center gap-1">
          {lim && usable.length > 0 && (
            <Button size="sm" variant="secondary" icon={<RotateCcw size={14} />} disabled={reset.busy} onClick={() => reset.use()}>
              {reset.busy ? 'Resetting…' : 'Use a reset'}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={cancel}>
            Cancel
          </Button>
        </span>
        {reset.node}
      </div>
    );
  }
  const turnOnSwitch = async () => {
    useAppSettings.getState().set({ autoSwitch: true });
    try {
      await put('/api/app-settings', { autoSwitch: true });
      toast('Switch accounts at a limit is on', 'ok');
    } catch (e) {
      useAppSettings.getState().set({ autoSwitch: false });
      toastError(e);
    }
  };
  // Usage is back (or the session is going again): only the continue still to come.
  if (!lim)
    return (
      <div className={cx('flex items-center gap-3 rounded-2xl border border-line-2 bg-panel px-4 py-2.5 text-[13.5px]', className)} role="status">
        <Clock3 size={15} className="shrink-0 text-busy" />
        <span className="min-w-0 flex-1">
          Continues by itself <span className="font-medium">{untilText(resumeAt)}</span>.
        </span>
        <Button size="sm" variant="ghost" onClick={cancel}>
          Cancel
        </Button>
      </div>
    );
  const left = u?.resetCredits?.available ?? 0;
  // The server continues a minute after the reset; told apart only when the two disagree.
  const withReset = !!resumeAt && !!lim.resetsAt && Math.abs(resumeAt - lim.resetsAt - 60_000) < 3 * 60_000;
  return (
    <div data-tip={session ? 'limit' : undefined} className={cx('anim-expand flex gap-3 rounded-2xl border border-warn/30 bg-warn/8 px-4 py-2.5 text-[13.5px]', className)} role="status">
      <AlertTriangle size={15} className="mt-[3px] shrink-0 text-warn" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="min-w-[min(100%,15rem)] flex-1 leading-snug">
            <div className="font-medium">{title}</div>
            <div className="text-[12.5px] text-fg-2">
              {lim.label}
              {lim.resetsAt ? ` · resets ${untilText(lim.resetsAt)}` : ''}
            </div>
          </div>
          {((session && !resumeAt && lim.resetsAt) || usable.length > 0) && (
            <div className="flex flex-wrap items-center gap-2">
              {session && !resumeAt && lim.resetsAt && (
                <Button
                  size="sm"
                  variant={usable.length ? 'secondary' : 'primary'}
                  icon={<Clock3 size={14} />}
                  onClick={() => post(`/api/sessions/${enc(session.key)}/resume-at`, { at: lim.resetsAt! + 60_000 }).catch(toastError)}
                  title="Sends “Continue where you left off.” a minute after the limit resets"
                >
                  Resume at reset
                </Button>
              )}
              {usable.length > 0 && (
                <span className="flex items-center gap-2">
                  <span className="text-[12.5px] whitespace-nowrap text-fg-3">{plural(left, 'reset')} available</span>
                  <Button size="sm" variant="primary" icon={<RotateCcw size={14} />} disabled={reset.busy} onClick={() => reset.use()}>
                    {reset.busy ? 'Resetting…' : 'Use a reset'}
                  </Button>
                </span>
              )}
            </div>
          )}
        </div>
        {spare && autoSwitch === false && (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-warn/20 pt-2 text-[12.5px] text-fg-2">
            <ArrowRightLeft size={13} className="shrink-0 text-fg-3" />
            <span className="min-w-0 flex-1">
              {session ? `${spare.name} still has usage left. Turn on Switch accounts at a limit and this session carries on there.` : `${spare.name} still has usage left. Turn on Switch accounts at a limit and new sessions start there.`}
            </span>
            <Button size="sm" variant="secondary" onClick={() => turnOnSwitch()}>
              Turn on
            </Button>
          </div>
        )}
        {resumeAt && (
          <div className="mt-2 flex items-center gap-1.5 border-t border-warn/20 pt-2 text-[12.5px] text-fg-2">
            <Clock3 size={13} className="shrink-0 text-busy" />
            <span className="min-w-0 flex-1">
              This session continues by itself <span className="font-medium text-fg">{withReset ? 'when it resets' : untilText(resumeAt)}</span>.
            </span>
            <button onClick={cancel} className="-my-1 shrink-0 rounded-md px-2 py-1 text-fg-3 transition-colors hover:bg-bg-2 hover:text-fg">
              Cancel
            </button>
          </div>
        )}
      </div>
      {reset.node}
    </div>
  );
}

/** The resets an account holds, each usable from here. */
export function ResetList({ u, account }: { u: AgentUsage; account?: string }) {
  const reset = useLimitReset(u.agent, account);
  const rc = u.resetCredits;
  if (!rc) return null;
  return (
    <div className="mt-4">
      <div className="mb-1.5 flex items-baseline gap-2">
        <span className="text-[11.5px] font-medium tracking-wide text-fg-3 uppercase">Limit resets</span>
        <span className="tnum text-[11.5px] text-fg-3">{rc.available}</span>
      </div>
      {rc.items.length ? (
        <div className="divide-y divide-line overflow-hidden rounded-xl border border-line">
          {rc.items.map((r) => {
            const soon = !!r.expiresAt && r.expiresAt - Date.now() < 24 * 3600_000;
            return (
              <div key={r.id} className="flex items-center gap-3 px-3 py-2.5">
                <RotateCcw size={14} className="shrink-0 text-fg-3" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] leading-snug [overflow-wrap:anywhere]">
                    {r.title}
                    {r.left && r.left > 1 ? <span className="text-fg-3"> · {r.left} left</span> : null}
                  </span>
                  <span className="mt-0.5 block text-[11.5px] leading-snug text-fg-3 [overflow-wrap:anywhere]" title={[r.detail, r.note].filter(Boolean).join(' · ') || undefined}>
                    {r.expiresAt ? <span className={cx(soon && 'text-warn')}>Expires {untilText(r.expiresAt)}</span> : 'Does not expire'}
                    {r.note ? ` · ${r.note}` : ''}
                    {r.note && r.usableAt && r.usableAt > Date.now()
                      ? ` (usable ${untilText(r.usableAt)}, ${new Date(r.usableAt).toLocaleString(LOCALE, { weekday: 'short', hour: 'numeric', minute: '2-digit' })})`
                      : ''}
                  </span>
                </span>
                <Button size="sm" variant={u.limited ? 'primary' : 'secondary'} disabled={!r.usableNow || reset.busy} onClick={() => reset.use(r)}>
                  Use
                </Button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-[12.5px] text-fg-3">
          No limit resets right now
          {rc.nextAvailableAt ? `; the next one comes ${untilText(rc.nextAvailableAt)}` : ''}
          {rc.cooldownUntil && rc.cooldownUntil > Date.now() ? `; resets cool down until ${new Date(rc.cooldownUntil).toLocaleString(LOCALE)}` : ''}.
        </div>
      )}
      {reset.node}
    </div>
  );
}
