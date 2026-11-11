// Settings → Source control: the GitHub and Gitea accounts pull requests are opened with. Tokens go to
// the server and stay there; this page only shows who each account signs in as.
import { useEffect, useState } from 'react';
import { ExternalLink, Plus, Trash2 } from 'lucide-react';
import { api, del, post } from '../../lib/api';
import { toast, toastError } from '../../lib/store';
import { Button, cx, Dialog, Throbber, inputCls, MenuItem, MenuSep, Segmented, useConfirm } from '../../components/ui';
import { EmptyRow, Group, MoreMenu, Notice, Row, Stack } from './kit';

interface AccountView {
  id: string;
  provider: 'github' | 'gitea';
  web: string;
  login?: string;
  useGh?: boolean;
}

export function ScmSettings() {
  const [list, setList] = useState<AccountView[] | null>(null);
  const [gh, setGh] = useState(false);
  const [adding, setAdding] = useState(false);
  const [confirm, confirmNode] = useConfirm();
  const load = () =>
    api<{ accounts: AccountView[]; gh: boolean }>('/api/scm/accounts')
      .then((r) => (setList(r.accounts), setGh(r.gh)))
      .catch(toastError);
  useEffect(() => {
    load();
  }, []);
  const remove = async (a: AccountView) => {
    if (!(await confirm({ title: `Remove ${a.login || a.web}?`, body: 'Pull requests already linked to sessions stay linked, but their status stops updating.', confirm: 'Remove', danger: true }))) return;
    await del(`/api/scm/accounts/${a.id}`).catch(toastError);
    load();
  };
  return (
    <Stack>
      <Group
        title="Accounts"
        hint="Pull requests open with these; each covers the repositories on its server"
        info="Pushing uses this machine’s own git setup (SSH keys or credential helper); the account is for opening the pull request and following its checks."
        actions={
          <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => setAdding(true)}>
            Add an account
          </Button>
        }
      >
        {!list ? (
          <div className="px-4 py-5">
            <Throbber className="text-fg-3" />
          </div>
        ) : !list.length ? (
          <EmptyRow>None yet. Add your GitHub account{gh ? ' (the GitHub CLI on this machine is signed in, so that takes one click)' : ''}, or a Gitea server with an access token.</EmptyRow>
        ) : (
          list.map((a) => (
            <Row
              key={a.id}
              icon={<span className="text-[11px] font-semibold">{a.provider === 'github' ? 'GH' : 'Gt'}</span>}
              label={
                <>
                  <span translate="no">{a.login || 'Signed in'}</span> <span className="text-fg-3">· {a.provider === 'github' ? 'GitHub' : 'Gitea'}</span>
                </>
              }
              hint={
                <span translate="no">
                  {a.web}
                  {a.useGh && ' · through the GitHub CLI'}
                </span>
              }
              control={
                <MoreMenu width={220}>
                  {(close) => (
                    <>
                      <MenuItem icon={<ExternalLink size={14} />} onClick={() => (close(), window.open(a.web, '_blank', 'noreferrer'))}>
                        Open the server
                      </MenuItem>
                      <MenuSep />
                      <MenuItem icon={<Trash2 size={14} />} danger onClick={() => (close(), remove(a))}>
                        Remove
                      </MenuItem>
                    </>
                  )}
                </MoreMenu>
              }
            />
          ))
        )}
      </Group>
      <AddAccount open={adding} gh={gh} onClose={() => setAdding(false)} onAdded={load} />
      {confirmNode}
    </Stack>
  );
}

function AddAccount({ open, gh, onClose, onAdded }: { open: boolean; gh: boolean; onClose: () => void; onAdded: () => void }) {
  const [provider, setProvider] = useState<'github' | 'gitea'>('github');
  const [web, setWeb] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) (setWeb(''), setToken(''));
  }, [open]);
  const save = async (useGh = false) => {
    setBusy(true);
    try {
      const r = await post<{ account: AccountView }>('/api/scm/accounts', { provider, web: provider === 'gitea' ? web : web || undefined, token: useGh ? undefined : token, useGh });
      toast(`Added ${r.account.login || r.account.web}`, 'ok');
      onAdded();
      onClose();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const tokenUrl = provider === 'github' ? 'https://github.com/settings/personal-access-tokens/new' : web ? `${web.replace(/\/+$/, '')}/user/settings/applications` : '';
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add an account"
      width={480}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => save()} disabled={busy || !token.trim() || (provider === 'gitea' && !web.trim())}>
            {busy ? 'Checking…' : 'Add'}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-[13px]">
        <Segmented
          value={provider}
          onChange={setProvider}
          options={[
            { value: 'github', label: 'GitHub' },
            { value: 'gitea', label: 'Gitea' },
          ]}
        />
        {provider === 'github' && gh && (
          <Notice
            action={
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => save(true)}>
                Use its sign-in
              </Button>
            }
          >
            The GitHub CLI on this machine is signed in.
          </Notice>
        )}
        {provider === 'gitea' && (
          <label className="block">
            <span className="mb-1 block text-fg-2">Server address</span>
            <input value={web} onChange={(e) => setWeb(e.target.value)} placeholder="https://gitea.example.com" className={inputCls} autoFocus />
          </label>
        )}
        {provider === 'github' && (
          <label className="block">
            <span className="mb-1 block text-fg-2">Server address (GitHub Enterprise only)</span>
            <input value={web} onChange={(e) => setWeb(e.target.value)} placeholder="https://github.com" className={inputCls} />
          </label>
        )}
        <label className="block">
          <span className="mb-1 block text-fg-2">Access token</span>
          <input value={token} onChange={(e) => setToken(e.target.value)} type="password" autoComplete="off" placeholder="Paste it here" className={cx(inputCls, 'font-mono')} />
        </label>
        <p className="leading-relaxed text-fg-3">
          {provider === 'github'
            ? 'A fine-grained token with Pull requests (read and write), Contents (read) and Commit statuses (read) on your repositories.'
            : 'In Gitea: Settings → Applications → Generate token, with repository read and write.'}{' '}
          {tokenUrl && (
            <a href={tokenUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline">
              Make one
            </a>
          )}
        </p>
      </div>
    </Dialog>
  );
}
