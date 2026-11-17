// Settings → App → Use on your phone: the app on your own phone, privately, through Tailscale (server/phone). On the
// computer: whether Tailscale is here and signed in, one button that publishes the app over HTTPS to your own devices
// only (Tailscale Serve, never Funnel), its address with Copy and a QR code, and what stands in the way with the one
// thing to do. On the phone (the QR code opens this page there): Add to Home Screen, Notify this device, Send a test.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Bell, Check, ExternalLink, House, RefreshCw, ShieldCheck, Smartphone } from 'lucide-react';
import { api, ApiError, post } from '../../lib/api';
import { toast, toastError } from '../../lib/store';
import { enablePush, disablePush, pushState, testThisDevice, type PushState } from '../../lib/notify';
import { canInstall, installApp, onInstallChange, phoneKind, runningInstalled } from '../../lib/install';
import { qrCode, qrPath } from '../../lib/qr';
import { LOCALE } from '../../i18n/locale';
import { tr } from '../../i18n/runtime';
import { Button, cx, Switch, Throbber } from '../../components/ui';
import { CopyButton } from '../../components/Markdown';
import { PHONE_PATH, type PhoneProblem, type PhoneState } from '@shared/phone';
import { Group, Notice, Row, Stack } from './kit';

/** Where HTTPS certificates and MagicDNS are turned on in a tailnet. */
const DNS_ADMIN = 'https://login.tailscale.com/admin/dns';

type Problem = PhoneProblem & { message: string };

/** A link out, as a small button. */
function LinkButton({ href, children, primary }: { href: string; children: ReactNode; primary?: boolean }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={cx(
        'inline-flex h-8 items-center justify-center gap-1.5 rounded-[10px] px-3 text-[13px] font-medium whitespace-nowrap transition duration-150 select-none active:scale-[0.97]',
        primary ? 'bg-accent text-accent-fg hover:opacity-90' : 'bg-bg-2 text-fg ring-1 ring-line-2 ring-inset hover:bg-bg-3',
      )}
    >
      {children}
      <ExternalLink size={12} className="opacity-70" />
    </a>
  );
}

/** A command to type, with Copy. */
function Command({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2">
      <code translate="no" className="min-w-0 flex-1 truncate rounded-md bg-bg-2 px-2 py-1 font-mono text-[12px] text-fg" title={text}>
        {text}
      </code>
      <CopyButton text={text} label="Copy the command" />
    </div>
  );
}

/** The address as a QR code, dark on light whatever the theme, with the quiet zone a reader needs. */
function AddressCode({ text }: { text: string }) {
  const code = useMemo(() => {
    try {
      return qrCode(text, { level: 'M' });
    } catch {
      return null;
    }
  }, [text]);
  if (!code) return null;
  return (
    <svg viewBox={`-4 -4 ${code.size + 8} ${code.size + 8}`} width={176} height={176} role="img" aria-label="The address as a QR code" className="shrink-0 rounded-xl" shapeRendering="crispEdges">
      <rect x={-4} y={-4} width={code.size + 8} height={code.size + 8} fill="#ffffff" />
      <path d={qrPath(code)} fill="#000000" />
    </svg>
  );
}

/** Tailscale on this computer: found, running, signed in, and this machine's name. */
function TailscaleRow({ st, busy, onCheck }: { st: PhoneState; busy: boolean; onCheck: () => void }) {
  const t = st.tailscale;
  const linux = st.platform === 'linux';
  const check = (
    <Button size="sm" variant="ghost" icon={busy ? <Throbber size={13} /> : <RefreshCw size={13} />} disabled={busy} onClick={onCheck}>
      Check again
    </Button>
  );
  const ready = t.state === 'ready';
  const hint =
    t.state === 'missing'
      ? 'Not installed on this computer. Tailscale is free for your own devices: install it, sign in, then check again.'
      : t.state === 'not-running'
        ? linux
          ? 'Installed, but not running. Start it (sudo systemctl start tailscaled), then check again.'
          : 'Installed, but not running. Open the Tailscale app, then check again.'
        : t.state === 'signed-out'
          ? linux
            ? 'Not signed in. Run tailscale up in a terminal and sign in, then check again.'
            : 'Not signed in. Sign in from the Tailscale app, then check again.'
          : t.state === 'stopped'
            ? linux
              ? 'Turned off. Run tailscale up in a terminal, then check again.'
              : 'Turned off. Turn it on in the Tailscale app, then check again.'
            : t.state === 'needs-approval'
              ? 'Waiting for an admin of your tailnet to approve this computer, in Tailscale’s admin console. Then check again.'
              : t.state === 'too-old'
                ? `Version ${t.version} is too old to serve the app. Update it, then check again.`
                : null;
  return (
    <Row
      icon={<ShieldCheck size={16} />}
      label="Tailscale on this computer"
      hint={
        ready ? (
          <span>
            <Check size={13} className="mr-1 inline -translate-y-px text-ok" />
            {t.tailnet ? `Signed in. This computer is ${t.machine} on ${t.tailnet}.` : `Signed in. This computer is ${t.machine}.`}
          </span>
        ) : (
          hint
        )
      }
      info={
        t.path ? (
          <>
            <p className="break-all">{t.version ? `Tailscale ${t.version}, at ${t.path}.` : `Tailscale, at ${t.path}.`}</p>
            {t.detail && <p translate="no">{t.detail}</p>}
          </>
        ) : (
          'Tailscale links your own devices in a private network of their own, called a tailnet. Nothing on it is open to the internet.'
        )
      }
      control={
        <>
          {(t.state === 'missing' || t.state === 'too-old') && (
            <LinkButton href={st.download} primary>
              Get Tailscale
            </LinkButton>
          )}
          {t.state === 'signed-out' && t.loginUrl && <LinkButton href={t.loginUrl}>Sign in</LinkButton>}
          {check}
        </>
      }
    />
  );
}

/** What stood in the way of Serve it or Stop serving, and the one thing to do. */
function ProblemNotice({ p, busy, onServe, onCheck }: { p: Problem; busy: boolean; onServe: (port?: number) => void; onCheck: () => void }) {
  const again = (
    <Button size="sm" variant="secondary" disabled={busy} onClick={() => onServe()}>
      Try again
    </Button>
  );
  if (p.kind === 'enable')
    return (
      <Notice
        tone="warn"
        action={
          <>
            <LinkButton href={p.link ?? DNS_ADMIN} primary>
              Turn them on
            </LinkButton>
            {again}
          </>
        }
      >
        Serve and HTTPS certificates aren’t turned on in your tailnet yet. Turn them on once (Tailscale asks you to sign in), then come back and try again.
      </Notice>
    );
  if (p.kind === 'operator')
    return (
      <Notice tone="warn" action={again}>
        <div className="space-y-2">
          <div>On Linux, Tailscale lets only its operator change what it serves. Run this once in a terminal, then try again:</div>
          {p.command && <Command text={p.command} />}
        </div>
      </Notice>
    );
  if (p.kind === 'port-taken')
    return (
      <Notice
        tone="warn"
        action={
          p.port ? (
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => onServe(p.port)}>
              {`Serve on port ${p.port}`}
            </Button>
          ) : undefined
        }
      >
        Something else is already published at that address, so Hydor won’t replace it.
      </Notice>
    );
  if (p.kind === 'not-ready')
    return (
      <Notice
        tone="warn"
        action={
          <Button size="sm" variant="secondary" disabled={busy} onClick={onCheck}>
            Check again
          </Button>
        }
      >
        Tailscale isn’t ready on this computer yet: its row above says what to do. Then check again.
      </Notice>
    );
  return (
    <Notice tone="err" action={p.kind === 'stop-failed' ? undefined : again}>
      {/* Translate the known failure pattern while leaving diagnostic values and commands literal. */}
      <span translate="no">{tr(p.message)}</span>
    </Notice>
  );
}

/** On the phone itself: Add to Home Screen, Notify this device, Send a test. */
function OnThisPhone() {
  const kind = phoneKind();
  const [installed, setInstalled] = useState(runningInstalled);
  const [offer, setOffer] = useState(canInstall);
  const [push, setPush] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => onInstallChange(() => (setOffer(canInstall()), setInstalled(runningInstalled()))), []);
  useEffect(() => {
    pushState()
      .then(setPush)
      .catch(() => setPush('unsupported'));
  }, []);
  const homeHint = installed
    ? 'Done: you opened Hydor from its icon.'
    : kind === 'ios'
      ? 'In Safari, tap Share (the square with an arrow), then Add to Home Screen. Open Hydor from its new icon from then on: an iPhone sends notifications only to the app opened that way.'
      : offer
        ? 'Hydor opens full screen, with its own icon, like any other app.'
        : 'In Chrome’s menu (⋮), tap Install app or Add to Home screen. Then open Hydor from its icon.';
  const pushHint =
    push === 'on'
      ? 'On: a notice comes when a session finishes, fails or needs you, even with the app closed.'
      : push === 'denied'
        ? 'Blocked for this site in the phone’s settings: allow notifications for it there first.'
        : push === 'unsupported'
          ? kind === 'ios' && !installed
            ? 'Add it to your Home Screen first (above), open it from there, then turn this on.'
            : 'This browser can’t receive notifications here.'
          : 'Turn it on and allow notifications when the phone asks.';
  const toggle = async (on: boolean) => {
    setBusy(true);
    try {
      setPush(on ? await enablePush() : await disablePush());
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Group title="On this phone" hint="Two steps, and agents can reach you here.">
      <Row
        icon={<House size={16} />}
        label="Add to Home Screen"
        hint={homeHint}
        control={
          installed ? (
            <Check size={16} className="text-ok" />
          ) : offer ? (
            <Button size="sm" variant="primary" onClick={() => void installApp().then((yes) => yes && setInstalled(true))}>
              Install
            </Button>
          ) : undefined
        }
      />
      <Row
        icon={<Bell size={16} />}
        label="Notify this device"
        hint={pushHint}
        control={push === null || busy ? <Throbber className="text-fg-3" /> : <Switch on={push === 'on'} disabled={push === 'unsupported' || push === 'denied'} onChange={toggle} label="Notify this device" />}
      />
      {push === 'on' && (
        <Row
          label="Send a test"
          hint="A notice to this phone only. It shows when the app is not in view: lock the phone or switch apps."
          control={
            <Button
              size="sm"
              variant="secondary"
              onClick={async () => {
                const sent = await testThisDevice().catch((e) => (toastError(e), null));
                if (sent !== null) toast(sent ? 'Sent. It shows when the app is not in view.' : 'This phone didn’t get it: turn Notify this device off and on again.', sent ? 'ok' : 'error');
              }}
            >
              Send a test
            </Button>
          }
        />
      )}
    </Group>
  );
}

export function PhoneSettings() {
  const [st, setSt] = useState<PhoneState | null>(null);
  const [busy, setBusy] = useState<'check' | 'serve' | 'stop' | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const onPhone = phoneKind() !== null;
  const load = async (quiet = false) => {
    if (!quiet) setBusy('check');
    try {
      setSt(await api<PhoneState>('/api/phone'));
      if (!quiet) setProblem((p) => (p?.kind === 'not-ready' ? null : p));
    } catch (e) {
      if (!quiet) toastError(e);
    } finally {
      if (!quiet) setBusy(null);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const act = async (what: 'serve' | 'stop', port?: number) => {
    setBusy(what);
    setProblem(null);
    try {
      setSt(await post<PhoneState>(`/api/phone/${what}`, port ? { port } : {}));
    } catch (e) {
      if (e instanceof ApiError && e.data?.problem) setProblem({ ...(e.data.problem as PhoneProblem), message: e.message });
      else toastError(e);
      void load(true);
    } finally {
      setBusy(null);
    }
  };
  const serve = (port?: number) => void act('serve', port);

  if (!st)
    return (
      <Stack>
        {onPhone && <OnThisPhone />}
        <div className="flex justify-center py-10">
          <Throbber className="text-fg-3" />
        </div>
      </Stack>
    );

  const t = st.tailscale;
  const ready = t.state === 'ready';
  const s = st.serving;
  const port = st.taken?.free ?? undefined;
  const address = ready && t.dnsName ? `https://${t.dnsName}` : null;
  const safety = 'Only phones and computers signed in to your Tailscale account can open it, never the public internet, and the app still asks for its password.';

  return (
    <Stack>
      {onPhone && <OnThisPhone />}

      {/* On a phone that reached it this way, the computer's side is done: only its address and Stop serving are left. */}
      {!(onPhone && s) && (
        <Group title="Tailscale" hint="A free app that links your own devices privately. Install it on this computer and on your phone, signed in to the same account.">
          <TailscaleRow st={st} busy={busy === 'check'} onCheck={() => void load()} />
        </Group>
      )}

      <Group title="Serve it on my devices" hint={safety}>
        {s ? (
          <>
            <Row
              icon={<Smartphone size={16} />}
              label="Address"
              hint={
                <span translate="no" className="font-medium break-all text-fg-2">
                  {s.url}
                </span>
              }
              control={
                <>
                  <CopyButton text={s.url} label="Copy" />
                  <LinkButton href={s.url}>Open</LinkButton>
                </>
              }
            />
            <Row
              label="Served on your tailnet"
              hint={s.servedHere && s.at ? `Since ${new Date(s.at).toLocaleString(LOCALE, { dateStyle: 'medium', timeStyle: 'short' })}` : 'Set up outside this page, with Tailscale itself'}
              control={
                <Button size="sm" variant="secondary" disabled={!!busy} icon={busy === 'stop' ? <Throbber size={13} /> : undefined} onClick={() => void act('stop')}>
                  Stop serving
                </Button>
              }
            />
          </>
        ) : (
          <Row
            icon={<Smartphone size={16} />}
            label="Serve it on my devices"
            hint={
              address ? (
                <span className="break-all">{`Publishes this app at ${port && st.taken ? `${address}:${port}` : address}, over HTTPS.`}</span>
              ) : (
                'Once Tailscale is ready on this computer, this publishes the app at an address of its own, over HTTPS.'
              )
            }
            control={
              <Button size="sm" variant="primary" disabled={!ready || !!busy} icon={busy === 'serve' ? <Throbber size={13} /> : undefined} onClick={() => serve(st.taken ? (port ?? undefined) : undefined)}>
                {st.taken && port ? `Serve on port ${port}` : 'Serve it on my devices'}
              </Button>
            }
          />
        )}
      </Group>

      {!s && st.taken && !problem && (
        <Notice tone="warn">
          <span className="break-all">{`Something else is already published at ${address} (${st.taken.target}), so Hydor won’t replace it.`}</span>{' '}
          {port ? `It can use port ${port} instead.` : 'Stop that one first: tailscale serve status shows it.'}
        </Notice>
      )}
      {problem && <ProblemNotice p={problem} busy={!!busy} onServe={serve} onCheck={() => void load()} />}
      {s && !st.accepted && (
        <Notice
          tone="warn"
          action={
            <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => serve()}>
              Accept it
            </Button>
          }
        >
          The app doesn’t accept this address yet, so signing in from it won’t work.
        </Notice>
      )}
      {s?.funnel && (
        <Notice tone="err">
          <div className="space-y-2">
            <div>Funnel is on for this address: anyone on the internet can reach it, not only your devices. Turn it off in a terminal:</div>
            <Command text={`tailscale funnel --https=${s.port} off`} />
          </div>
        </Notice>
      )}
      {s && ready && t.https === false && (
        <Notice tone="warn" action={<LinkButton href={DNS_ADMIN}>Turn them on</LinkButton>}>
          HTTPS certificates are off in your tailnet, so phones can’t open the address yet. Turn on MagicDNS and HTTPS Certificates in Tailscale’s DNS settings.
        </Notice>
      )}

      {s && !onPhone && (
        <Group title="Open it on your phone">
          <div className="flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-start">
            <AddressCode text={`${s.url}${PHONE_PATH}`} />
            <div className="min-w-0 flex-1 space-y-3">
              <p className="text-[13.5px] leading-snug text-fg">Scan it with your phone’s camera. The phone needs the Tailscale app, signed in to the same account.</p>
              <ol className="list-decimal space-y-1.5 pl-5 text-[13px] leading-snug text-fg-2 marker:text-fg-3">
                <li>
                  On the phone, install Tailscale and sign in with the same account.{' '}
                  <a href={st.download} target="_blank" rel="noreferrer" className="text-accent underline-offset-2 hover:underline">
                    Get Tailscale
                  </a>
                </li>
                <li>Scan the code, or type the address in the phone’s browser.</li>
                <li>Sign in with this app’s password.</li>
                <li>The page that opens walks you through Add to Home Screen and Notify this device.</li>
              </ol>
            </div>
          </div>
        </Group>
      )}
    </Stack>
  );
}
