import { useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { Blocks, KeyRound, Lock } from 'lucide-react';
import { post } from '../../lib/api';
import { useApp } from '../../lib/store';
import { Button, cx, inputCls } from '../../components/ui';
import { AgentIcon } from '../../components/AgentIcon';
import { Aurora, HeroMark, setupDone, TOUR_SETUP_STEPS, TourProgress } from '../tour/Tour';

const n = (i: number) => ({ '--i': i }) as CSSProperties;

/** The sign-in screens: the mark draws itself over soft drifting light, then the card rises in. */
function Shell({ title, sub, leaving, children }: { title: string; sub: ReactNode; leaving?: boolean; children: ReactNode }) {
  return (
    <div className="relative flex min-h-full items-center justify-center bg-bg px-4 py-10">
      <Aurora className="aurora-page" />
      <div className="relative w-full max-w-[380px]">
        <div className="mb-7 flex flex-col items-center gap-3.5 text-center">
          <HeroMark size={52} />
          <div className="tour-rise">
            <h1 className="text-[20px] font-semibold tracking-tight" style={n(3)}>
              {title}
            </h1>
            <p className="mt-1 text-[14px] text-fg-3" style={n(4)}>
              {sub}
            </p>
          </div>
        </div>
        <div className={cx('auth-card rounded-[20px] border border-line bg-panel p-6 shadow-lg', leaving && 'tour-card-out')}>{children}</div>
        <div className="stagger mt-6 flex flex-wrap items-center justify-center gap-x-3.5 gap-y-1.5 text-[12.5px] text-fg-3">
          <span className="flex items-center gap-1.5" style={n(16)}>
            <AgentIcon agent="claude" size={14} /> Claude Code
          </span>
          <span className="flex items-center gap-1.5" style={n(17)}>
            <AgentIcon agent="codex" size={14} /> Codex
          </span>
          <span className="flex items-center gap-1.5" style={n(18)}>
            <AgentIcon agent="acp" name="Custom" size={14} /> Any model
          </span>
          <span className="flex items-center gap-1.5" style={n(19)}>
            <Blocks size={13} /> More agents
          </span>
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
    <Shell title="Naget Agent" sub="Sign in to continue.">
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
  const [leaving, setLeaving] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pw !== pw2) return setErr('The passwords differ');
    setBusy(true);
    setErr('');
    try {
      await post('/api/auth/setup', { token, password: pw });
      // The card fades away, then the app comes in and the tour goes on.
      setLeaving(true);
      setTimeout(() => {
        history.replaceState(null, '', '/');
        setupDone();
        useApp.getState().set({ auth: 'ok' });
      }, 280);
    } catch (e2) {
      setErr((e2 as Error).message);
      setBusy(false);
    }
  };
  return (
    <Shell title="Welcome to Naget Agent" sub="Let’s get you set up. It takes about a minute." leaving={leaving}>
      <div className="mb-4 flex items-center gap-3">
        <TourProgress at={0} total={TOUR_SETUP_STEPS} />
        <span className="ml-auto text-[12px] text-fg-3">Step 1</span>
      </div>
      <h2 className="text-[15.5px] font-semibold tracking-tight">Choose a password</h2>
      <p className="mt-1 mb-4 text-[13px] leading-relaxed text-fg-3">It keeps this app private, and you sign in with it on any device. You can change it later in Settings.</p>
      <form onSubmit={submit} className="space-y-3">
        {!linked && (
          <div>
            <div className="relative">
              <KeyRound size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-3" />
              <input className={`${input} pl-9 font-mono text-[13px]`} placeholder="Setup token" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" autoFocus />
            </div>
            <p className="mt-1.5 text-[11.5px] leading-snug text-fg-3">
              Shows that you run this computer. It is in <span className="font-mono">setup-token</span> in the app’s data folder (<span className="font-mono">~/.naget-agent</span>), and in the link the server printed when it started.
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
