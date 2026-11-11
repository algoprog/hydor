// Settings → Notifications: notices on this device when a session finishes, fails or needs you, and their sound.
import { useEffect, useState } from 'react';
import { post } from '../../lib/api';
import { toast, toastError } from '../../lib/store';
import { Button, Switch, Throbber } from '../../components/ui';
import { chime, desktopSystem, disablePush, enablePush, notifyPrefs, pushState, setNotifyPrefs, type PushState } from '../../lib/notify';
import { Group, Row, Stack } from './kit';

/** Notices when a session finishes, fails or needs you: pushed to this device, with or without a chime. */
export function NotificationSettings() {
  const [state, setState] = useState<PushState | null>(null);
  const [sound, setSound] = useState(() => notifyPrefs().sound);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    pushState()
      .then(setState)
      .catch(() => setState('unsupported'));
  }, []);
  const appleNotInstalled = /iPhone|iPad|iPod/.test(navigator.userAgent) && !(navigator as Navigator & { standalone?: boolean }).standalone;
  const toggle = async (on: boolean) => {
    setBusy(true);
    try {
      setState(on ? await enablePush() : await disablePush());
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const hint =
    state === 'app'
      ? desktopSystem === 'windows'
        ? 'The app shows them itself while it runs, even with its window closed (it stays in the notification area).'
        : desktopSystem === 'linux'
          ? 'The app shows them itself while it runs, even with its window closed (it stays in the system tray).'
          : 'The Mac app shows them itself while it runs, even with its window closed (it stays in the menu bar).'
      : state === 'unsupported'
      ? appleNotInstalled
        ? 'On iPhone or iPad: Share → Add to Home Screen, open Hydor from there, then turn this on.'
        : 'This browser cannot receive notifications here.'
      : state === 'denied'
        ? 'Blocked for this site in the browser settings; allow notifications there first.'
        : 'Even with the app closed, like on a phone in your pocket. Each device turns it on for itself.';
  return (
    <Stack>
      <Group title="This device">
        <Row
          label="Notify this device"
          hint={hint}
          control={state === null || busy ? <Throbber className="text-fg-3" /> : <Switch on={state === 'on' || state === 'app'} disabled={state === 'unsupported' || state === 'denied' || state === 'app'} onChange={toggle} label="Notify this device" />}
        />
        <Row
          label="Sound"
          hint="A short chime with each notice while the app is open"
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
      </Group>
    </Stack>
  );
}
