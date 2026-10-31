// A session's own browser settings: which profile it uses (a fresh one, or one that keeps logins) and
// the sites it may or may not visit beyond Settings → Browser's lists.
import { useEffect, useState } from 'react';
import { UserRound } from 'lucide-react';
import type { BrowserProfile, BrowserSettingsState, SessionBrowserOptions } from '@shared/browser';
import { api, patch } from '../../lib/api';
import { toastError } from '../../lib/store';
import { Button, Dialog, MenuItem, MenuLabel } from '../../components/ui';
import { bpath, useBrowser } from './store';

export async function setOptions(key: string, o: Partial<SessionBrowserOptions>) {
  try {
    const r = await patch<{ options: SessionBrowserOptions }>(bpath(key, '/options'), o);
    useBrowser.setState((s) => ({ options: { ...s.options, [key]: r.options } }));
  } catch (e) {
    toastError(e);
  }
}

/** Menu items to pick the session's profile (picking another closes its browser, which opens again in it). */
export function ProfilePicker({ k, onPicked }: { k: string; onPicked: () => void }) {
  const [list, setList] = useState<BrowserProfile[] | null>(null);
  const cur = useBrowser((s) => s.options[k]?.profile ?? '');
  useEffect(() => {
    api<BrowserSettingsState>('/api/browser/settings')
      .then((r) => setList(r.profiles))
      .catch(() => setList([]));
  }, []);
  if (!list?.length) return null;
  const pick = (id: string) => {
    onPicked();
    if (id !== cur) void setOptions(k, { profile: id || undefined });
  };
  return (
    <>
      <MenuLabel>Profile (another one restarts the browser)</MenuLabel>
      <MenuItem icon={<UserRound size={14} />} checked={!cur} onClick={() => pick('')}>
        Fresh, no logins
      </MenuItem>
      {list.map((p) => (
        <MenuItem key={p.id} icon={<UserRound size={14} />} checked={cur === p.id} onClick={() => pick(p.id)}>
          {p.name}
        </MenuItem>
      ))}
    </>
  );
}

const lines = (v: string) =>
  v
    .split(/[\s,]+/)
    .map((x) => x.trim())
    .filter(Boolean);

/** The sites a session's browser may visit (only these, when listed) and never visits. */
export function SessionSites({ k, open, onClose }: { k: string; open: boolean; onClose: () => void }) {
  const o = useBrowser((s) => s.options[k]);
  const [allow, setAllow] = useState('');
  const [block, setBlock] = useState('');
  useEffect(() => {
    if (!open) return;
    setAllow((o?.allow ?? []).join('\n'));
    setBlock((o?.block ?? []).join('\n'));
  }, [open, o]);
  const save = async () => {
    await setOptions(k, { allow: lines(allow), block: lines(block) });
    onClose();
  };
  const area = 'min-h-[84px] w-full resize-y rounded-[10px] border border-line-2 bg-bg-1 px-3 py-2 font-mono text-[12.5px] outline-none focus:border-accent/60';
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Sites for this session"
      width={460}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-[13px]">
        <p className="text-fg-3">One site per line, like example.com (its subdomains count too). These add to the lists in Settings → Browser.</p>
        <label className="block">
          <span className="mb-1 block font-medium">Only these sites</span>
          <textarea value={allow} onChange={(e) => setAllow(e.target.value)} placeholder="Any site when empty" className={area} />
        </label>
        <label className="block">
          <span className="mb-1 block font-medium">Never these sites</span>
          <textarea value={block} onChange={(e) => setBlock(e.target.value)} className={area} />
        </label>
        {(o?.local?.length ?? 0) > 0 && (
          <div>
            <div className="mb-1 font-medium">Allowed on this machine or its network</div>
            <div className="flex flex-wrap gap-1.5">
              {o!.local!.map((h) => (
                <span key={h} className="inline-flex items-center gap-1 rounded-md bg-bg-2 px-2 py-0.5 font-mono text-[12px]">
                  {h}
                  <button className="text-fg-3 hover:text-err" title="Not any more" onClick={() => setOptions(k, { local: o!.local!.filter((x) => x !== h) })}>
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
