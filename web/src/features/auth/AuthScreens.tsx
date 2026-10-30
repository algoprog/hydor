import { useState, type FormEvent, type ReactNode } from 'react';
import { KeyRound, Lock } from 'lucide-react';
import { post } from '../../lib/api';
import { useApp } from '../../lib/store';
import { Button, inputCls } from '../../components/ui';
import { Logo } from '../../components/Logo';
import { AgentIcon } from '../../components/AgentIcon';
import { setupDone, TOUR_STEP_COUNT, TourProgress } from '../tour/Tour';

function Shell({ title, sub, children }: { title: string; sub: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-full items-center justify-center bg-bg px-4 py-10">
      <div className="anim-pop w-full max-w-[380px]">
        <div className="mb-7 flex flex-col items-center gap-3 text-center">
          <Logo size={40} />
          <div>
            <h1 className="text-[20px] font-semibold tracking-tight">{title}</h1>
            <p className="mt-1 text-[14px] text-fg-3">{sub}</p>
          </div>
        </div>
        <div className="rounded-[20px] border border-line bg-panel p-6 shadow-lg">{children}</div>
        <div className="mt-6 flex items-center justify-center gap-2 text-[12.5px] text-fg-3">
          <AgentIcon agent="claude" size={14} /> Claude Code <span className="opacity-50">·</span> <AgentIcon agent="codex" size={14} /> Codex
        </div>
      </div>
    </div>
  );
}

const input = inputCls.replace('h-9.5', 'h-10');

export function Login() {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await post('/api/auth/login', { password: pw });
      useApp.getState().set({ auth: 'ok' });
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Shell title="Agent Console" sub="Sign in to continue.">
      <form onSubmit={submit} className="space-y-3">
        <div className="relative">
          <Lock size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-3" />
          <input className={`${input} pl-9`} type="password" autoComplete="current-password" autoFocus placeholder="Password" value={pw} onChange={(e) => setPw(e.target.value)} />
        </div>
        {err && <div className="text-[12.5px] text-err">{err}</div>}
        <Button variant="primary" className="h-10 w-full" disabled={!pw || busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </Shell>
  );
}

/** A new install: choosing the password is the first step of the welcome tour, which goes on from there. */
export function Setup() {
  const linked = new URLSearchParams(location.search).get('token') ?? '';
  const [token, setToken] = useState(linked);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pw !== pw2) return setErr('The passwords differ');
    setBusy(true);
    setErr('');
    try {
      await post('/api/auth/setup', { token, password: pw });
      history.replaceState(null, '', '/');
      setupDone();
      useApp.getState().set({ auth: 'ok' });
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Shell title="Welcome to Agent Console" sub="Let’s get you set up. It takes about a minute.">
      <div className="mb-4 flex items-center gap-3">
        <TourProgress at={0} />
        <span className="ml-auto text-[12px] text-fg-3">
          Step 1 of {TOUR_STEP_COUNT}
        </span>
      </div>
      <h2 className="text-[15.5px] font-semibold tracking-tight">Choose a password</h2>
      <p className="mt-1 mb-4 text-[13px] leading-relaxed text-fg-3">It keeps this console private, and you sign in with it on any device. You can change it later in Settings.</p>
      <form onSubmit={submit} className="space-y-3">
        {!linked && (
          <div>
            <div className="relative">
              <KeyRound size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-3" />
              <input className={`${input} pl-9 font-mono text-[13px]`} placeholder="Setup token" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" autoFocus />
            </div>
            <p className="mt-1.5 text-[11.5px] leading-snug text-fg-3">
              Shows that you run this computer. It is in <span className="font-mono">~/.web-agent/setup-token</span>, and in the link the server printed when it started.
            </p>
          </div>
        )}
        <input className={input} type="password" placeholder="Password (10 or more characters)" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus={!!linked} />
        <input className={input} type="password" placeholder="Repeat the password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
        {err && <div className="text-[12.5px] text-err">{err}</div>}
        <Button variant="primary" className="h-10 w-full" disabled={!token || pw.length < 10 || !pw2 || busy}>
          {busy ? 'Saving…' : 'Continue'}
        </Button>
      </form>
    </Shell>
  );
}
