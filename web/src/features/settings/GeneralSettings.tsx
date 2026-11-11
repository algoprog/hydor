// Settings → General: theme, language, how sessions behave, starting and updating the app, the tour and tips, and
// what version this is.
import { useEffect, useState } from 'react';
import { CircleHelp } from 'lucide-react';
import { isLang, LANGS } from '@shared/i18n';
import type { RetentionSettings, StartupState, UpdateState } from '@shared/types';
import { api, post, put } from '../../lib/api';
import { ago, MOD } from '../../lib/format';
import { toast, toastError, useApp, useUI } from '../../lib/store';
import { Button, cx, Throbber, inputCls, Section, Segmented, Switch } from '../../components/ui';
import { currentLang, setLang } from '../../i18n';
import { LOCALE } from '../../i18n/locale';
import { restartToUpdate, updateLater } from '../../components/UpdateNotice';
import { followUpPref, type FollowUp } from '../session/Composer';
import { startTour } from '../tour/Tour';
import { setTipsOn, useTips } from '../tips/state';
import { ThemeSettings } from './Themes';
import { CPU_CHOICES, MEMORY_CHOICES, type SessionLimits, type SessionResources } from '../system/sessionUse';
import { openReleaseNotes } from './Releases';
import { SettingRow } from './legacy';

export function GeneralSettings() {
  const boot = useApp((s) => s.boot);
  const termSuggest = useUI((s) => s.termSuggest);
  const [follow, setFollow] = useState<FollowUp>(followUpPref);
  return (
    <div className="space-y-4">
      <ThemeSettings />
      <Section>
        <div className="-my-2 divide-y divide-line">
          <SettingRow label="Language" hint="The language the app is shown in. Agents write to you in it too.">
            {/* Each language by its own name, never translated. */}
            <select translate="no" className={cx(inputCls, 'h-8.5 max-w-[220px] pr-8 text-[13px]')} value={currentLang()} onChange={(e) => isLang(e.target.value) && setLang(e.target.value)} aria-label="Language">
              {LANGS.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </SettingRow>
          <SettingRow
            label="Sending while an agent works"
            hint={
              follow === 'steer'
                ? `Enter adds your message to the turn in progress. ${MOD}Enter waits for the turn to end instead.`
                : `Enter waits for the turn to end, then sends. ${MOD}Enter adds it to the turn in progress instead.`
            }
          >
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
          </SettingRow>
          <SettingRow label="Terminal suggestions" hint="Grey text after the cursor with the likeliest rest of the command; → takes it. Ctrl+Space lists more either way.">
            <Switch on={termSuggest} label="Terminal suggestions" onChange={(v) => useUI.getState().set({ termSuggest: v })} />
          </SettingRow>
          <AutoResumeSetting />
          <DeleteInactiveSetting />
          <SessionLimitsSetting />
        </div>
      </Section>
      <Section>
        <div className="-my-2 divide-y divide-line">
          <StartupSetting />
          <AutoUpdateSetting />
          <SettingRow label="Welcome tour" hint="Connect your subscriptions and see what each part of the app does">
            <Button size="sm" variant="secondary" icon={<CircleHelp size={14} />} onClick={() => startTour()}>
              Take the tour
            </Button>
          </SettingRow>
          <TipsSetting />
        </div>
      </Section>
      <Section title="About">
        <div className="space-y-1.5 text-[13px] leading-relaxed text-fg-3">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <span className="text-fg-2">Hydor {boot?.version}</span>
            <button onClick={() => openReleaseNotes(boot?.version)} className="text-accent hover:underline">
              Release notes
            </button>
          </div>
          <UpdateLine />
          <div>
            Sessions run as your user through the installed Claude Code and Codex. History comes from <span className="font-mono text-[12px]">~/.claude/projects</span> and{' '}
            <span className="font-mono text-[12px]">~/.codex/sessions</span>. Terminals live in a private tmux server and survive reloads.
          </div>
        </div>
      </Section>
    </div>
  );
}

const PHASE: Record<NonNullable<UpdateState['running']>['phase'], string> = {
  pull: 'Getting the new version',
  download: 'Downloading the new version',
  install: 'Installing packages',
  build: 'Building',
  restart: 'Restarting, this page reconnects by itself',
};

/** The Mac app's new version, downloaded and waiting: Restart now, and while it counts down, Later. */
function ReadyLine({ ready }: { ready: NonNullable<UpdateState['ready']> }) {
  const [busy, setBusy] = useState(false);
  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    await fn();
    setBusy(false);
  };
  const at = (ms: number) => new Date(ms).toLocaleTimeString(LOCALE, { hour: 'numeric', minute: '2-digit' });
  return (
    <div className="space-y-2 rounded-xl border border-accent/30 bg-accent-soft px-3 py-2.5 text-fg-2">
      <div>
        <span className="font-medium text-fg">{`Version ${ready.version} is ready to install`}</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <Button size="sm" variant="primary" disabled={busy} onClick={() => act(restartToUpdate)}>
          Restart now
        </Button>
        {ready.installIn != null && (
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => act(updateLater)}>
            Later
          </Button>
        )}
        <span className="text-[12px] text-fg-3">
          {ready.installIn != null
            ? 'It restarts into it within a minute; running agents carry on.'
            : ready.later
              ? `It asks again at ${at(ready.later)}; running agents carry on through the restart.`
              : 'Running agents carry on through the restart.'}
        </span>
      </div>
    </div>
  );
}

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

/** Whether a newer version is out (for copies installed from git), updating to it, and how the last update went. */
function UpdateLine() {
  const update = useApp((s) => s.boot?.update);
  const [busy, setBusy] = useState(false);
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
  const checkButton = (
    <button onClick={check} disabled={busy} className="text-accent hover:underline disabled:opacity-50">
      {busy ? 'Checking…' : 'Check now'}
    </button>
  );
  if (!update)
    return (
      <div className="flex items-center gap-2">
        <span>Updates are checked daily for copies installed from git.</span>
        {checkButton}
      </div>
    );
  const last = update.last && !update.running && Date.now() - update.last.at < 7 * 86_400_000 ? update.last : undefined;
  return (
    <div className="space-y-1.5">
      {update.running ? (
        <div className="anim-in flex items-center gap-2 text-fg-2">
          <Throbber className="text-fg-3" /> {update.kind === 'app' && update.running.phase === 'restart' ? 'Opening the new version, this page reconnects by itself' : PHASE[update.running.phase]}…
        </div>
      ) : update.ready ? (
        <ReadyLine ready={update.ready} />
      ) : update.behind > 0 ? (
        <div className="space-y-2 rounded-xl border border-accent/30 bg-accent-soft px-3 py-2.5 text-fg-2">
          <div>
            {update.kind === 'app' ? (
              <span className="font-medium text-fg">{`Version ${update.latest} is out`}</span>
            ) : (
              <>
                <span className="font-medium text-fg">
                  {update.behind} update{update.behind === 1 ? '' : 's'} out
                </span>
                {update.latest && <span> · latest: {update.latest}</span>}
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <Button size="sm" variant="primary" onClick={updateNow}>
              Update now
            </Button>
            <span className="text-[12px] text-fg-3">
              {update.kind === 'app'
                ? update.canRestart
                  ? update.format === 'deb'
                    ? 'It downloads the new version and installs it once you give your password; running agents carry on.'
                    : 'It downloads the new version and opens it in place of this one; running agents carry on.'
                  : cannotUpdate(update)
                : update.canRestart
                  ? 'It pulls, builds and restarts; running agents carry on.'
                  : 'It pulls and builds; restart the server afterwards to use it.'}
            </span>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className={cx(update.error && 'text-warn')}>{update.error ? `Could not check for updates: ${update.error}` : `Up to date · checked ${ago(update.checkedAt)}`}</span>
          {checkButton}
        </div>
      )}
      {last && (
        <div className={cx('text-[12px]', last.ok ? 'text-fg-3' : 'text-warn')}>
          {!last.ok
            ? `The ${last.auto ? 'automatic ' : ''}update ${ago(last.at)} failed: ${last.error}`
            : last.from && last.from === last.to
              ? `Already up to date when it last tried, ${ago(last.at)}`
              : `Updated${last.auto ? ' by itself' : ''} ${ago(last.at)}${last.from && last.to ? ` (${last.from} → ${last.to})` : ''}${last.needsRestart ? ': restart the server to use it' : ''}`}
        </div>
      )}
    </div>
  );
}

/** Tips after the tour (features/tips): on until skipped, the same on every device. */
function TipsSetting() {
  const on = useTips((s) => s.on);
  return (
    <SettingRow label="Tips" hint="Points out a part of the app the first time you come to it, after the welcome tour">
      <Switch on={on} label="Tips" onChange={setTipsOn} />
    </SettingRow>
  );
}

/**
 * New versions install themselves, for a copy that can restart itself: from git while you are away; the Mac app as
 * soon as one is out, after a minute's notice.
 */
function AutoUpdateSetting() {
  const update = useApp((s) => s.boot?.update);
  if (!update) return null;
  return (
    <SettingRow
      label="Update automatically"
      hint={
        update.canRestart
          ? update.kind === 'app'
            ? update.format === 'deb'
              ? 'Downloads a new version as soon as it is out; Restart to Update installs it, once you give your password. Running agents carry on.'
              : 'Downloads a new version as soon as it is out, says so, and restarts into it a minute later (Later puts it off). Running agents carry on.'
            : 'After 5 hours without a message from you, at most once a day. Running agents carry on.'
          : update.kind === 'app'
            ? cannotUpdate(update)
            : 'This server cannot restart itself. Run it as a service (install.sh) or with Docker to update automatically.'
      }
    >
      <Switch on={update.auto && update.canRestart} disabled={!update.canRestart} label="Update automatically" onChange={(on) => put('/api/update/auto', { on }).catch(toastError)} />
    </SettingRow>
  );
}

/** The app comes back after this computer restarts (on by default): a service of your user, a system
 * service, or Docker's restart policy; whichever runs it says what can change. */
function StartupSetting() {
  const [st, setSt] = useState<StartupState | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<StartupState>('/api/startup')
      .then(setSt)
      .catch(() => setSt(null));
  }, []);
  if (!st) return null;
  const hint =
    st.how === 'login-item'
      ? st.platform === 'windows'
        ? st.on
          ? 'Opens in the background when you sign in to Windows, in the notification area of the taskbar.'
          : 'Does not open by itself when you sign in to Windows.'
        : st.platform === 'linux'
          ? st.on
            ? 'Opens in the background when you log in, in the system tray.'
            : 'Does not open by itself when you log in.'
          : st.on
            ? 'Opens in the background when you log in to this Mac, from your menu bar.'
            : 'Does not open by itself when you log in to this Mac.'
      : st.how === 'docker'
      ? 'In Docker its restart policy brings it back: restart: unless-stopped in compose.yaml.'
      : st.how === 'system-service'
        ? `The system service ${st.unit} ${st.on ? 'starts it at boot' : 'is off: it does not start at boot'}. Changing it needs root on this computer.`
        : st.how === 'user-service'
          ? st.on
            ? st.linger
              ? `As ${st.unit}, a service of your user, even before anyone logs in. It also comes back if it stops.`
              : `As ${st.unit}, a service of your user, once you log in. To start it before anyone logs in: sudo loginctl enable-linger ${'$'}USER`
            : `${st.unit} is set up but does not start at boot.`
          : st.can
            ? 'Sets it up as a service of your user that starts at boot and comes back if it stops.'
            : 'Not available here (no systemd for your user): start it with your system’s own tools, or run it in Docker.';
  return (
    <SettingRow label="Start when this computer starts" hint={hint}>
      {busy ? (
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
      )}
    </SettingRow>
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
    <SettingRow label="Resume after usage limits" hint="When a turn stops because a plan's usage ran out, the session continues by itself a minute after the limit resets">
      {on === null ? (
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
      )}
    </SettingRow>
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
 * Sessions nobody used for a while are deleted, a year by default; their numbers stay in Activity. Until
 * then the app keeps every conversation, whatever the agent's own program deletes. Kept on the server.
 */
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
    <SettingRow
      label="Limit each session"
      hint={
        r && off
          ? `${r.support.why} What each session uses still shows in System → Monitor.`
          : 'The most memory and processors one session (its agent and everything it runs) may use, from the next time its agent starts. Over its memory, the program that asked for more is stopped, not the app or another session.'
      }
    >
      {!r ? (
        <Throbber className="text-fg-3" />
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Memory" disabled={off} value={r.limits.memoryMb ?? 0} onChange={(e) => save({ memoryMb: Number(e.target.value) || null })} className={cx(inputCls, '!h-8 w-auto pr-8 text-[13px] disabled:opacity-50')}>
            <option value={0}>No memory limit</option>
            {MEMORY_CHOICES.map((m) => (
              <option key={m} value={m}>
                {`${m / 1024} GB of memory`}
              </option>
            ))}
          </select>
          <select aria-label="Processors" disabled={off} value={r.limits.cpus ?? 0} onChange={(e) => save({ cpus: Number(e.target.value) || null })} className={cx(inputCls, '!h-8 w-auto pr-8 text-[13px] disabled:opacity-50')}>
            <option value={0}>No processor limit</option>
            {CPU_CHOICES.map((n) => (
              <option key={n} value={n}>
                {n === 1 ? '1 processor' : `${n} processors`}
              </option>
            ))}
          </select>
        </div>
      )}
    </SettingRow>
  );
}

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
    <SettingRow
      label="Delete inactive sessions"
      hint="Sessions nobody used for this long are deleted; pinned ones, and ones at work or waiting, stay. Their numbers stay in Activity. Until then every conversation is kept, whatever the agent’s own program deletes."
    >
      {!r ? (
        <Throbber className="text-fg-3" />
      ) : (
        <div className="flex items-center gap-2.5">
          <select aria-label="After how long" disabled={!r.on} value={r.days} onChange={(e) => save({ days: Number(e.target.value) })} className={cx(inputCls, '!h-8 w-auto pr-8 text-[13px] disabled:opacity-50')}>
            {ages.map(([d, label]) => (
              <option key={d} value={d}>
                After {label}
              </option>
            ))}
          </select>
          <Switch on={r.on} label="Delete inactive sessions" onChange={(v) => save({ on: v })} />
        </div>
      )}
    </SettingRow>
  );
}
