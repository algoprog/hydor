// Settings → Password: changing the app’s password, and signing out of this browser.
import { useState } from 'react';
import { KeyRound, LogOut } from 'lucide-react';
import { post } from '../../lib/api';
import { toast, toastError } from '../../lib/store';
import { Button, Dialog, inputCls } from '../../components/ui';
import { Group, Row, Stack } from './kit';

/** The three fields of a password change, in a dialog. Closing it forgets what was typed. */
function ChangePassword({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const close = () => {
    setCur('');
    setNext('');
    setAgain('');
    onClose();
  };
  const submit = async () => {
    if (next !== again) return toast('The new passwords differ', 'error');
    setBusy(true);
    try {
      await post('/api/auth/password', { current: cur, next });
      toast('Password changed. Other browsers were signed out.', 'ok');
      close();
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  };
  const ready = !busy && !!cur && next.length >= 10;
  return (
    <Dialog
      open={open}
      onClose={close}
      title="Change password"
      width={420}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!ready} onClick={submit}>
            Change password
          </Button>
        </>
      }
    >
      <form
        className="space-y-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) void submit();
        }}
      >
        <input className={inputCls} type="password" placeholder="Current password" aria-label="Current password" autoComplete="current-password" autoFocus value={cur} onChange={(e) => setCur(e.target.value)} />
        <input className={inputCls} type="password" placeholder="New password" aria-label="New password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        <input className={inputCls} type="password" placeholder="Repeat new password" aria-label="Repeat new password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
        <p className="text-[12.5px] text-fg-3">At least 10 characters.</p>
        <button type="submit" className="hidden" />
      </form>
    </Dialog>
  );
}

export function SecuritySettings() {
  const [changing, setChanging] = useState(false);
  return (
    <Stack>
      <Group title="Password">
        <Row
          icon={<KeyRound size={16} />}
          label="Change password"
          hint="Changing it signs out every other browser"
          control={
            <Button size="sm" variant="secondary" onClick={() => setChanging(true)}>
              Change…
            </Button>
          }
        />
      </Group>
      <Group title="This browser">
        <Row
          icon={<LogOut size={16} />}
          label="Sign out of this browser"
          hint="You will need the password to come back"
          control={
            <Button
              size="sm"
              variant="secondary"
              onClick={async () => {
                await post('/api/auth/logout').catch(() => {});
                location.reload();
              }}
            >
              Sign out
            </Button>
          }
        />
      </Group>
      <ChangePassword open={changing} onClose={() => setChanging(false)} />
    </Stack>
  );
}
