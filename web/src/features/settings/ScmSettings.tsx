// Settings → Source control: the GitHub and Gitea accounts pull requests are opened with. Tokens go to
// the server and stay there; this page only shows who each account signs in as.
import { useEffect, useState } from 'react';
import { ExternalLink, GitPullRequest, Trash2 } from 'lucide-react';
import { api, del, post } from '../../lib/api';
import { toast, toastError } from '../../lib/store';
import { Button, cx, Dialog, Dots, IconButton, inputCls, Section, Segmented, useConfirm } from '../../components/ui';

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
    <div className="space-y-4">
      <Section
        title="Accounts"
        sub="Pull requests open with these. Each covers the repositories on its server."
        actions={
          <Button size="sm" variant="secondary" icon={<GitPullRequest size={14} />} onClick={() => setAdding(true)}>
            Add an account
          </Button>
        }
      >
        {!list ? (
          <Dots className="text-fg-3" />
        ) : !list.length ? (
          <p className="text-[13px] leading-relaxed text-fg-3">
            None yet. Add your GitHub account{gh ? ' (the GitHub CLI on this machine is signed in, so that takes one click)' : ''}, or a Gitea server with an access token.
          </p>
        ) : (
          <div className="-my-1 divide-y divide-line">
            {list.map((a) => (
              <div key={a.id} className="flex items-center gap-3 py-2.5">
                <span className={cx('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-semibold', a.provider === 'github' ? 'bg-fg text-bg' : 'bg-ok/15 text-ok')}>
                  {a.provider === 'github' ? 'GH' : 'Gt'}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] text-fg">
                    {a.login || 'Signed in'} <span className="text-fg-3">· {a.provider === 'github' ? 'GitHub' : 'Gitea'}</span>
                  </div>
                  <div className="truncate text-[12px] text-fg-3">
                    {a.web}
                    {a.useGh && ' · through the GitHub CLI'}
                  </div>
                </div>
                <a href={a.web} target="_blank" rel="noreferrer" className="rounded-md p-1.5 text-fg-3 hover:bg-bg-2 hover:text-fg" title="Open the server">
                  <ExternalLink size={14} />
                </a>
                <IconButton label="Remove" size="sm" onClick={() => remove(a)}>
                  <Trash2 size={14} />
                </IconButton>
              </div>
            ))}
          </div>
        )}
      </Section>
      <p className="px-1 text-[12.5px] leading-relaxed text-fg-3">
        Pushing uses this machine’s own git setup (SSH keys or credential helper); the account is for opening the pull request and following its checks.
      </p>
      <AddAccount open={adding} gh={gh} onClose={() => setAdding(false)} onAdded={load} />
      {confirmNode}
    </div>
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
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-bg-1 px-3 py-2.5">
            <span className="min-w-0 flex-1 text-fg-2">The GitHub CLI on this machine is signed in.</span>
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => save(true)}>
              Use its sign-in
            </Button>
          </div>
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
