// Settings → General: theme, language, how sessions behave, starting and updating the app, the tour and tips, and
// what version this is.
import { useEffect, useState, type ReactNode } from 'react';
import { CircleHelp } from 'lucide-react';
import { isLang, LANGS } from '@shared/i18n';
import type { RetentionSettings, StartupState, UpdateState } from '@shared/types';
import { api, post, put } from '../../lib/api';
import { ago, MOD } from '../../lib/format';
import { toast, toastError, useApp, useUI } from '../../lib/store';
import { Button, cx, Throbber, Segmented, Switch } from '../../components/ui';
import { currentLang, setLang } from '../../i18n';
import { LOCALE } from '../../i18n/locale';
import { restartToUpdate, updateLater } from '../../components/UpdateNotice';
import { followUpPref, type FollowUp } from '../session/Composer';
import { startTour } from '../tour/Tour';
import { setTipsOn, useTips } from '../tips/state';
import { ThemeMode, ThemePicker } from './Themes';
import { CPU_CHOICES, MEMORY_CHOICES, type SessionLimits, type SessionResources } from '../system/sessionUse';
import { openReleaseNotes } from './Releases';
import { Group, Row, Select, Stack } from './kit';

export function GeneralSettings() {
  const termSuggest = useUI((s) => s.termSuggest);
  const [follow, setFollow] = useState<FollowUp>(followUpPref);
  return (
    <Stack>
      <Group title="Appearance" actions={<ThemeMode />}>
        <ThemePicker />
        <Row label="Language" hint="Shown in the app; agents write to you in it too" control={<LanguageSelect />} />
      </Group>
      <Group title="Sessions">
        <Row
          label="Sending while an agent works"
          hint={follow === 'steer' ? `Enter joins the running turn; ${MOD}Enter waits for it to end` : `Enter waits for the turn to end; ${MOD}Enter joins it`}
          control={
            <Segmented<FollowUp>
              size="sm"
              value={follow}
              onChange={(x) => {
                setFollow(x);
                try {
                  localStorage.setItem('wa.followUp', x);
                } catch {}
              }}
              options={[
                { value: 'steer', label: 'Join the turn' },
                { value: 'queue', label: 'Wait for it' },
              ]}
            />
          }
        />
        <AutoResumeSetting />
        <DeleteInactiveSetting />
        <SessionLimitsSetting />
      </Group>
      <Group title="Terminals">
        <Row
          label="Terminal suggestions"
          hint="Grey text after the cursor with the likeliest rest of the command"
          info="→ takes the suggestion. Ctrl+Space lists more either way."
          control={<Switch on={termSuggest} label="Terminal suggestions" onChange={(v) => useUI.getState().set({ termSuggest: v })} />}
        />
      </Group>
      <Group title="Startup and updates">
        <StartupSetting />
        <AutoUpdateSetting />
        <VersionRow />
      </Group>
      <Group title="Help">
        <Row
          label="Welcome tour"
          hint="Connect your subscriptions and see what each part does"
          control={
            <Button size="sm" variant="secondary" icon={<CircleHelp size={14} />} onClick={() => startTour()}>
              Take the tour
            </Button>
          }
        />
        <TipsSetting />
      </Group>
    </Stack>
  );
}

/** Each language by its own name, never translated. */
function LanguageSelect() {
  return (
    <Select
      label="Language"
      width={220}
      value={currentLang()}
      options={LANGS.map((l) => ({ value: l.id, label: <span translate="no">{l.name}</span> }))}
      onChange={(v) => isLang(v) && setLang(v)}
    />
  );
}

const PHASE: Record<NonNullable<UpdateState['running']>['phase'], string> = {
  pull: 'Getting the new version',
  download: 'Downloading the new version',
  install: 'Installing packages',
  build: 'Building',
  restart: 'Restarting, this page reconnects by itself',
};

/** Why a desktop app cannot update itself where it is (as the server says when you try). */
function cannotUpdate(update: UpdateState): string {
  switch (update.format) {
    case 'app':
      return 'Move Hydor to your Applications folder to update it.';
    case 'appimage':
      return 'Put the AppImage in a folder you can write to (your home folder, say) to update it.';
    case 'deb':
      return 'Updating the .deb needs pkexec: install the new version from the Releases page.';
    default:
      return 'This copy does not update itself: install the new version from the Releases page.';
  }
}

/**
 * Which version this is, and what the updates say: whether a newer one is out (for copies installed from git, and the
 * desktop apps), updating to it, restarting into a downloaded one, and how the last update went.
 */
function VersionRow() {
  const version = useApp((s) => s.boot?.version);
  const update = useApp((s) => s.boot?.update);
  const [busy, setBusy] = useState(false);
  const [acting, setActing] = useState(false);
  const check = async () => {
    setBusy(true);
    try {
      const r = await post<{ update: UpdateState | null }>('/api/update-check');
      const boot = useApp.getState().boot;
      if (boot) useApp.getState().set({ boot: { ...boot, update: r.update ?? undefined } });
      if (!r.update) toast('This copy was not installed from git with an upstream, so it cannot check', 'info');
      else if (r.update.kind === 'app' && !r.update.error && !(r.update.behind > 0)) toast('You have the newest version', 'info');
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const updateNow = async () => {
    // This tab reloads into the new version once the server is back with it.
    try {
      sessionStorage.setItem('wa.updating', '1');
    } catch {}
    try {
      await post('/api/update');
    } catch (e) {
      try {
        sessionStorage.removeItem('wa.updating');
      } catch {}
      toastError(e);
    }
  };
  const act = async (fn: () => Promise<void>) => {
    setActing(true);
    await fn();
    setActing(false);
  };
  const at = (ms: number) => new Date(ms).toLocaleTimeString(LOCALE, { hour: 'numeric', minute: '2-digit' });
  const checkButton = (
    <Button size="sm" variant="secondary" disabled={busy} onClick={check}>
      {busy ? 'Checking…' : 'Check now'}
    </Button>
  );
  const notes = (
    <Button size="sm" variant="ghost" onClick={() => openReleaseNotes(version)}>
      Release notes
    </Button>
  );
  const last = update && update.last && !update.running && Date.now() - update.last.at < 7 * 86_400_000 ? update.last : undefined;
  const about = (
    <p>
      Sessions run as your user through the installed Claude Code and Codex. History comes from <span className="font-mono text-[12px]">~/.claude/projects</span> and <span className="font-mono text-[12px]">~/.codex/sessions</span>. Terminals live in
      a private tmux server and survive reloads.
    </p>
  );

  let hint: ReactNode;
  let control: ReactNode;
  let detail: string | undefined;
  if (!update) {
    hint = 'Updates are checked daily for copies installed from git';
    control = (
      <>
        {checkButton}
        {notes}
      </>
    );
  } else if (update.running) {
    hint = (
      <span className="inline-flex items-center gap-2 text-fg-2">
        <Throbber className="text-fg-3" /> {update.kind === 'app' && update.running.phase === 'restart' ? 'Opening the new version, this page reconnects by itself' : PHASE[update.running.phase]}…
      </span>
    );
    control = notes;
  } else if (update.ready) {
    const ready = update.ready;
    hint = <span className="font-medium text-fg">{`Version ${ready.version} is ready to install`}</span>;
    detail =
      ready.installIn != null ? 'It restarts into it within a minute; running agents carry on.' : ready.later ? `It asks again at ${at(ready.later)}; running agents carry on through the restart.` : 'Running agents carry on through the restart.';
    control = (
      <>
        <Button size="sm" variant="primary" disabled={acting} onClick={() => act(restartToUpdate)}>
          Restart now
        </Button>
        {ready.installIn != null && (
          <Button size="sm" variant="secondary" disabled={acting} onClick={() => act(updateLater)}>
            Later
          </Button>
        )}
        {notes}
      </>
    );
  } else if (update.behind > 0) {
    hint =
      update.kind === 'app' ? (
        <span className="font-medium text-fg">{`Version ${update.latest} is out`}</span>
      ) : (
        <>
          <span className="font-medium text-fg">
            {update.behind} update{update.behind === 1 ? '' : 's'} out
          </span>
          {update.latest && <span> · latest: {update.latest}</span>}
        </>
      );
    detail =
      update.kind === 'app'
        ? update.canRestart
          ? update.format === 'deb'
            ? 'It downloads the new version and installs it once you give your password; running agents carry on.'
            : 'It downloads the new version and opens it in place of this one; running agents carry on.'
          : cannotUpdate(update)
        : update.canRestart
          ? 'It pulls, builds and restarts; running agents carry on.'
          : 'It pulls and builds; restart the server afterwards to use it.';
    control = (
      <>
        <Button size="sm" variant="primary" onClick={updateNow}>
          Update now
        </Button>
        {notes}
      </>
    );
  } else {
    hint = <span className={cx(update.error && 'text-warn')}>{update.error ? `Could not check for updates: ${update.error}` : `Up to date · checked ${ago(update.checkedAt)}`}</span>;
    control = (
      <>
        {checkButton}
        {notes}
      </>
    );
  }
  return (
    <Row label={`Hydor ${version ?? ''}`.trim()} hint={hint} info={about} control={control}>
      {(detail || last) && (
        <div className="space-y-1 text-[12.5px] leading-snug text-fg-3">
          {detail && <p>{detail}</p>}
          {last && (
            <p className={cx(!last.ok && 'text-warn')}>
              {!last.ok
                ? `The ${last.auto ? 'automatic ' : ''}update ${ago(last.at)} failed: ${last.error}`
                : last.from && last.from === last.to
                  ? `Already up to date when it last tried, ${ago(last.at)}`
                  : `Updated${last.auto ? ' by itself' : ''} ${ago(last.at)}${last.from && last.to ? ` (${last.from} → ${last.to})` : ''}${last.needsRestart ? ': restart the server to use it' : ''}`}
            </p>
          )}
        </div>
      )}
    </Row>
  );
}

/** Tips after the tour (features/tips): on until skipped, the same on every device. */
function TipsSetting() {
  const on = useTips((s) => s.on);
  return <Row label="Tips" hint="Points out a part of the app the first time you come to it" control={<Switch on={on} label="Tips" onChange={setTipsOn} />} />;
}

/**
 * New versions install themselves, for a copy that can restart itself: from git while you are away; the Mac app as
 * soon as one is out, after a minute's notice.
 */
function AutoUpdateSetting() {
  const update = useApp((s) => s.boot?.update);
  if (!update) return null;
  const hint = update.canRestart ? (update.kind === 'app' ? 'Downloads new versions as soon as they are out' : 'After 5 hours without a message from you, at most once a day') : update.kind === 'app' ? 'Not possible where it is now' : 'This server cannot restart itself';
  const info = update.canRestart
    ? update.kind === 'app'
      ? update.format === 'deb'
        ? 'Downloads a new version as soon as it is out; Restart to Update installs it, once you give your password. Running agents carry on.'
        : 'Downloads a new version as soon as it is out, says so, and restarts into it a minute later (Later puts it off). Running agents carry on.'
      : 'After 5 hours without a message from you, at most once a day. Running agents carry on.'
    : update.kind === 'app'
      ? cannotUpdate(update)
      : 'This server cannot restart itself. Run it as a service (install.sh) or with Docker to update automatically.';
  return (
    <Row
      label="Update automatically"
      hint={hint}
      info={info}
      control={<Switch on={update.auto && update.canRestart} disabled={!update.canRestart} label="Update automatically" onChange={(on) => put('/api/update/auto', { on }).catch(toastError)} />}
    />
  );
}

/** The app comes back after this computer restarts (on by default): a service of your user, a system
 * service, or Docker's restart policy; whichever runs it says what can change. */
function StartupSetting() {
  // undefined while it loads; null when the server could not say (the row stays out).
  const [st, setSt] = useState<StartupState | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<StartupState>('/api/startup')
      .then(setSt)
      .catch(() => setSt(null));
  }, []);
  if (st === null) return null;
  let hint: string | undefined;
  let info: string | undefined;
  if (st) {
    if (st.how === 'login-item') {
      const where = st.platform === 'windows' ? 'you sign in to Windows' : st.platform === 'linux' ? 'you log in' : 'you log in to this Mac';
      const tray = st.platform === 'windows' ? 'in the notification area of the taskbar' : st.platform === 'linux' ? 'in the system tray' : 'from your menu bar';
      hint = st.on ? 'Opens in the background when you log in' : 'Does not open by itself when you log in';
      info = st.on ? `Opens in the background when ${where}, ${tray}.` : `Does not open by itself when ${where}.`;
    } else if (st.how === 'docker') {
      hint = 'Docker’s restart policy brings it back';
      info = 'In Docker its restart policy brings it back: restart: unless-stopped in compose.yaml.';
    } else if (st.how === 'system-service') {
      hint = `${st.unit} ${st.on ? 'starts it at boot' : 'is off: it does not start at boot'}`;
      info = `The system service ${st.unit} ${st.on ? 'starts it at boot' : 'is off: it does not start at boot'}. Changing it needs root on this computer.`;
    } else if (st.how === 'user-service') {
      hint = st.on ? (st.linger ? 'A service of your user, even before anyone logs in' : 'A service of your user, once you log in') : 'Set up, but does not start at boot';
      info = st.on
        ? st.linger
          ? `As ${st.unit}, a service of your user, even before anyone logs in. It also comes back if it stops.`
          : `As ${st.unit}, a service of your user, once you log in. To start it before anyone logs in: sudo loginctl enable-linger ${'$'}USER`
        : `${st.unit} is set up but does not start at boot.`;
    } else if (st.can) {
      hint = 'Sets it up as a service of your user';
      info = 'Sets it up as a service of your user that starts at boot and comes back if it stops.';
    } else {
      hint = 'Not available here';
      info = 'Not available here (no systemd for your user): start it with your system’s own tools, or run it in Docker.';
    }
  }
  return (
    <Row
      label="Start when this computer starts"
      hint={hint}
      info={info}
      control={
        !st || busy ? (
          <Throbber className="text-fg-3" />
        ) : (
          <Switch
            on={st.on}
            disabled={!st.can}
            label="Start when this computer starts"
            onChange={async (on) => {
              setBusy(true);
              try {
                setSt(await put<StartupState>('/api/startup', { on }));
              } catch (e) {
                toastError(e);
              } finally {
                setBusy(false);
              }
            }}
          />
        )
      }
    />
  );
}

/** Sessions stopped by a plan's usage limit continue by themselves once it lifts. Kept on the server. */
function AutoResumeSetting() {
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    api<{ autoResume: boolean }>('/api/app-settings')
      .then((r) => setOn(r.autoResume))
      .catch(() => setOn(false));
  }, []);
  return (
    <Row
      label="Resume after usage limits"
      hint="Continues a minute after a plan’s limit resets"
      info="When a turn stops because a plan's usage ran out, the session continues by itself a minute after the limit resets."
      control={
        on === null ? (
          <Throbber className="text-fg-3" />
        ) : (
          <Switch
            on={on}
            label="Resume after usage limits"
            onChange={(v) => {
              setOn(v);
              put('/api/app-settings', { autoResume: v }).catch((e) => (setOn(!v), toastError(e)));
            }}
          />
        )
      }
    />
  );
}

/** How long a session may stay inactive before the app deletes it. */
const AGES: [number, string][] = [
  [90, '3 months'],
  [182, '6 months'],
  [365, '1 year'],
  [730, '2 years'],
  [1825, '5 years'],
];

/**
 * The most memory and processors one session (its agent and everything it runs) may use, from its agent's next start:
 * a systemd scope of its own (Linux, with the user's systemd; server/resources.ts). Elsewhere the menus are off, saying why.
 */
function SessionLimitsSetting() {
  const [r, setR] = useState<{ limits: SessionLimits; support: { ok: boolean; why?: string } } | null>(null);
  useEffect(() => {
    api<SessionResources>('/api/sessions/resources').then((x) => setR({ limits: x.limits, support: x.support }), () => {});
  }, []);
  const save = (p: { memoryMb?: number | null; cpus?: number | null }) => put<{ limits: SessionLimits; support: { ok: boolean; why?: string } }>('/api/sessions/limits', p).then(setR, toastError);
  const off = !r?.support.ok;
  return (
    <Row
      label="Limit each session"
      hint={r && off ? 'Not available on this computer' : 'The most memory and processors one session may use'}
      info={
        r && off
          ? `${r.support.why} What each session uses still shows in System → Monitor.`
          : 'The most memory and processors one session (its agent and everything it runs) may use, from the next time its agent starts. Over its memory, the program that asked for more is stopped, not the app or another session.'
      }
      control={
        !r ? (
          <Throbber className="text-fg-3" />
        ) : (
          <>
            <Select
              label="Memory"
              disabled={off}
              value={String(r.limits.memoryMb ?? 0)}
              onChange={(v) => save({ memoryMb: Number(v) || null })}
              options={[{ value: '0', label: 'No memory limit' }, ...MEMORY_CHOICES.map((m) => ({ value: String(m), label: `${m / 1024} GB of memory` }))]}
            />
            <Select
              label="Processors"
              disabled={off}
              value={String(r.limits.cpus ?? 0)}
              onChange={(v) => save({ cpus: Number(v) || null })}
              options={[{ value: '0', label: 'No processor limit' }, ...CPU_CHOICES.map((n) => ({ value: String(n), label: n === 1 ? '1 processor' : `${n} processors` }))]}
            />
          </>
        )
      }
    />
  );
}

/**
 * Sessions nobody used for a while are deleted, a year by default; their numbers stay in Activity. Until
 * then the app keeps every conversation, whatever the agent's own program deletes. Kept on the server.
 */
function DeleteInactiveSetting() {
  const [r, setR] = useState<RetentionSettings | null>(null);
  useEffect(() => {
    api<RetentionSettings>('/api/retention').then(setR, () => {});
  }, []);
  const save = (p: Partial<RetentionSettings>) => {
    const was = r;
    setR({ ...r!, ...p });
    put<RetentionSettings>('/api/retention', p).then(setR, (e) => (setR(was), toastError(e)));
  };
  const ages = r && !AGES.some(([d]) => d === r.days) ? [...AGES, [r.days, `${r.days} days`] as [number, string]] : AGES;
  return (
    <Row
      label="Delete inactive sessions"
      hint="Sessions nobody used for this long are deleted"
      info="Pinned sessions, and ones at work or waiting, stay. Their numbers stay in Activity. Until then every conversation is kept, whatever the agent’s own program deletes."
      control={
        !r ? (
          <Throbber className="text-fg-3" />
        ) : (
          <>
            <Select label="After how long" disabled={!r.on} value={String(r.days)} onChange={(v) => save({ days: Number(v) })} options={ages.map(([d, label]) => ({ value: String(d), label: `After ${label}` }))} />
            <Switch on={r.on} label="Delete inactive sessions" onChange={(v) => save({ on: v })} />
          </>
        )
      }
    />
  );
}
