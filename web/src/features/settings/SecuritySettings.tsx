// Settings → Password: changing the app’s password, and signing out of this browser.
import { useState } from 'react';
import { KeyRound, LogOut } from 'lucide-react';
import { api, post } from '../../lib/api';
import { toast, toastError } from '../../lib/store';
import { Button, inputCls, Section } from '../../components/ui';
import { SettingRow } from './legacy';

function PasswordForm() {
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const field = inputCls;
  return (
    <form
      className="grid gap-2 sm:grid-cols-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (next !== again) return toast('The new passwords differ', 'error');
        setBusy(true);
        try {
          await post('/api/auth/password', { current: cur, next });
          toast('Password changed. Other browsers were signed out.', 'ok');
          setCur('');
          setNext('');
          setAgain('');
        } catch (err) {
          toastError(err);
        } finally {
          setBusy(false);
        }
      }}
    >
      <input className={field} type="password" placeholder="Current password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} />
      <input className={field} type="password" placeholder="New password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
      <input className={field} type="password" placeholder="Repeat new password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
      <div className="sm:col-span-3">
        <Button size="sm" variant="secondary" icon={<KeyRound size={14} />} disabled={busy || !cur || next.length < 10}>
          Change password
        </Button>
      </div>
    </form>
  );
}

export function SecuritySettings() {
  return (
    <div className="space-y-4">
      <Section title="Change password" sub="Changing it signs out every other browser">
        <PasswordForm />
      </Section>
      <Section>
        <div className="-my-2">
          <SettingRow label="Sign out of this browser" hint="You will need the password to come back">
            <Button
              size="sm"
              variant="secondary"
              icon={<LogOut size={14} />}
              onClick={async () => {
                await post('/api/auth/logout').catch(() => {});
                location.reload();
              }}
            >
              Sign out
            </Button>
          </SettingRow>
        </div>
      </Section>
    </div>
  );
}
