// Settings → Notifications: notices on this device when a session finishes, fails or needs you, and their sound.
import { useEffect, useState } from 'react';
import { post } from '../../lib/api';
import { toast, toastError } from '../../lib/store';
import { Button, Switch, Throbber } from '../../components/ui';
import { chime, desktopSystem, disablePush, enablePush, notifyPrefs, pushState, setNotifyPrefs, systemNoticeSettings, systemNotices, systemNoticesState, testSystemNotice, turnOnSystemNotices, whenBack, type PushState, type SystemNotices } from '../../lib/notify';
import { Group, Row, Stack } from './kit';

/** Notices when a session finishes, fails or needs you: pushed to this device, with or without a chime. */
export function NotificationSettings() {
  const [state, setState] = useState<PushState | null>(null);
  const [sound, setSound] = useState(() => notifyPrefs().sound);
  const [busy, setBusy] = useState(false);
  // In a desktop app: whether the system shows its notifications (false: not allowed in the system's settings).
  const [system, setSystem] = useState<SystemNotices | null>(null);
  // The system's settings are open to allow them: back from there, a test one says whether they show now.
  const [allowing, setAllowing] = useState(false);
  useEffect(() => {
    pushState()
      .then(setState)
      .catch(() => setState('unsupported'));
    if (systemNotices) void systemNoticesState().then(setSystem);
  }, []);
  useEffect(() => {
    if (!allowing) return;
    return whenBack(async () => {
      const r = await testSystemNotice();
      setSystem(await systemNoticesState());
      if (r?.ok) setAllowing(false);
    });
  }, [allowing]);
  /** The system does not show the desktop app's notifications (it refused one). */
  const systemOff = state === 'app' && system?.shows === false;
  const appleNotInstalled = /iPhone|iPad|iPod/.test(navigator.userAgent) && !(navigator as Navigator & { standalone?: boolean }).standalone;
  const toggle = async (on: boolean) => {
    setBusy(true);
    try {
      // In a desktop app, turning it on is the system's to allow: a test one, else its settings where you allow them.
      if (state === 'app') {
        if ((await turnOnSystemNotices()) === 'settings') setAllowing(true);
        setSystem(await systemNoticesState());
        return;
      }
      setState(on ? await enablePush() : await disablePush());
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const hint =
    state === 'app'
      ? system?.shows === false
        ? allowing
          ? desktopSystem === 'windows'
            ? 'In Settings, turn on notifications for Hydor, then come back here.'
            : 'In System Settings, turn on Allow notifications for Hydor, then come back here.'
          : desktopSystem === 'windows'
          ? 'Windows isn’t showing them, so they show inside the app'
          : desktopSystem === 'linux'
            ? 'Your desktop isn’t showing them, so they show inside the app'
            : 'macOS isn’t showing them, so they show inside the app'
        : desktopSystem === 'windows'
          ? 'As Windows notifications, even with the window closed'
          : desktopSystem === 'linux'
            ? 'As your desktop’s notifications, even with the window closed'
            : 'As Mac notifications, even with the window closed'
      : state === 'unsupported'
      ? appleNotInstalled
        ? 'On iPhone or iPad: Share → Add to Home Screen, open Hydor from there, then turn this on.'
        : 'This browser cannot receive notifications here.'
      : state === 'denied'
        ? 'Blocked for this site in the browser settings; allow notifications there first.'
        : 'Even with the app closed, like on a phone in your pocket. Each device turns it on for itself.';
  // In a desktop app, the longer story: where the app goes when its window closes, and where the system's settings are.
  const appInfo =
    state !== 'app'
      ? undefined
      : desktopSystem === 'windows'
        ? 'The app keeps running in the notification area when you close its window, and its notifications keep coming. To allow them or change how they show: Settings → System → Notifications → Hydor.'
        : desktopSystem === 'linux'
          ? 'The app keeps running in the system tray when you close its window, and its notifications keep coming. Your desktop’s settings say how they show.'
          : 'The app keeps running in the menu bar when you close its window, and its notifications keep coming. To allow them or change how they show: System Settings → Notifications → Hydor.';
  return (
    <Stack>
      <Group title="This device">
        <Row
          label="Notify this device"
          hint={hint}
          info={appInfo}
          control={state === null || busy ? <Throbber className="text-fg-3" /> : <Switch on={state === 'on' || (state === 'app' && !systemOff)} disabled={state === 'unsupported' || state === 'denied' || (state === 'app' && !(systemOff && systemNoticeSettings))} onChange={toggle} label="Notify this device" />}
        />
        <Row
          label="Sound"
          hint="A short chime with each notice while the app is open"
          info={systemNotices ? 'Only with notices the app shows inside its window: the system’s notifications make their own sound.' : undefined}
          control={
            <Switch
              on={sound}
              onChange={(v) => {
                setSound(v);
                setNotifyPrefs({ sound: v });
                if (v) chime('done');
              }}
              label="Sound"
            />
          }
        />
        {state === 'on' && (
          <Row
            label="Try it"
            hint="It shows on this device when the app is not in view"
            control={
              <Button
                size="sm"
                variant="secondary"
                onClick={async () => {
                  const r = await post<{ sent: number }>('/api/push/test').catch((e) => (toastError(e), null));
                  if (r) toast(r.sent ? `Sent to ${r.sent} device${r.sent === 1 ? '' : 's'}. It shows when the app is not in view.` : 'No device got it.', r.sent ? 'ok' : 'error');
                }}
              >
                Send a test
              </Button>
            }
          />
        )}
        {state === 'app' && systemNotices && (
          <Row
            label="Try it"
            hint="Shows a notification on this computer right away"
            control={
              <Button
                size="sm"
                variant="secondary"
                onClick={async () => {
                  const r = await testSystemNotice();
                  setSystem(await systemNoticesState());
                  if (r && !r.ok) toast('It didn’t show. Allow notifications for Hydor in the system’s settings.', 'error');
                }}
              >
                Send a test
              </Button>
            }
          />
        )}
      </Group>
    </Stack>
  );
}
