// Sharing a project with people (server/spaces/share.ts): who it is shared with, each with what they may do (View
// and comment, or Edit documents), until when and what they did last; and Invite someone: their name, what they may
// do and for how long, which makes their own link, shown once (copy it, or show it as a QR code for a phone). Each
// person's menu changes what they may do or until when, makes them a new link, or stops sharing with them; at the
// bottom, the name they see your comments under. The project's menu (on its page and its card) and its overview's
// "Shared with" open it.
import { useEffect, useMemo, useRef, useState } from 'react';
import { create } from 'zustand';
import { Link2, MoreHorizontal, Pencil, QrCode, RefreshCw, UserMinus } from 'lucide-react';
import { initials, SHARE_ROLES, type ProjectShare, type ShareActivity, type ShareRole } from '@shared/share';
import type { Space } from '@shared/spaces';
import { CopyButton } from '../../components/Markdown';
import { Button, cx, Dialog, IconButton, inputCls, MenuItem, MenuLabel, MenuSep, Popover, Segmented, Throbber, useConfirm } from '../../components/ui';
import { tr } from '../../i18n/runtime';
import { LOCALE } from '../../i18n/locale';
import { api, del, enc, patch, post, put } from '../../lib/api';
import { ago } from '../../lib/format';
import { onFeatureEvent } from '../../lib/featureEvents';
import { machineBase } from '../../lib/machine';
import { qrCode, qrPath } from '../../lib/qr';
import { toastError } from '../../lib/store';

type Days = '7' | '30' | '0';
const DAYS: { value: Days; label: string }[] = [
  { value: '7', label: 'A week' },
  { value: '30', label: 'A month' },
  { value: '0', label: 'Until you stop it' },
];

/** The people a project is shared with, and the name they see the owner under; kept up to date with the server's news. */
export function useShares(space: string | undefined): { shares: ProjectShare[] | null; owner: string; reload: () => void } {
  const [data, setData] = useState<{ shares: ProjectShare[]; owner: string } | null>(null);
  const load = useMemo(
    () => () => {
      if (!space) return;
      api<{ shares: ProjectShare[]; owner: string }>(`/api/projects/${enc(space)}/shares`).then(setData, () => {});
    },
    [space],
  );
  useEffect(() => {
    setData(null);
    load();
    return onFeatureEvent('sharing', load);
  }, [load]);
  return { shares: data?.shares ?? null, owner: data?.owner ?? 'Owner', reload: load };
}

/** A person's mark: their initials in a circle. */
export function PersonMark({ name, size = 28, className }: { name: string; size?: number; className?: string }) {
  return (
    <span
      translate="no"
      className={cx('inline-flex shrink-0 items-center justify-center rounded-full bg-info/15 font-semibold text-info ring-2 ring-panel', className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
    >
      {initials(name)}
    </span>
  );
}

/** What someone did last, in a few words, or when they last opened it. */
export function activityText(sh: ProjectShare): string {
  const a: ShareActivity | undefined = sh.activity;
  if (a) {
    const t = a.title ?? '';
    const what = a.what === 'comment' ? tr(`Commented on “${t}”`) : a.what === 'reply' ? tr(`Replied on “${t}”`) : a.what === 'edit' ? tr(`Changed “${t}”`) : tr(`Read “${t}”`);
    return `${what} · ${ago(a.at)}`;
  }
  return sh.seenAt ? tr(`Opened it ${ago(sh.seenAt)}`) : 'Not opened yet';
}

const until = (sh: ProjectShare) =>
  !sh.expiresAt ? '' : sh.expiresAt < Date.now() ? tr('ended') : tr(`until ${new Date(sh.expiresAt).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' })}`);

// ---- opening it from anywhere ------------------------------------------------------------------------------------

const useOpen = create<{ space: Space | null }>(() => ({ space: null }));
export const openShareDialog = (s: Space) => useOpen.setState({ space: s });

/** The dialog, on each page that offers it (a project's page, the list of projects). */
export function ShareDialogHost() {
  const s = useOpen((x) => x.space);
  return s ? <ShareDialog s={s} onClose={() => useOpen.setState({ space: null })} /> : null;
}

// ---- the dialog -----------------------------------------------------------------------------------------------

/** A link made now, shown once. */
interface Made {
  name: string;
  url: string;
}

function ShareDialog({ s, onClose }: { s: Space; onClose: () => void }) {
  const { shares, owner, reload } = useShares(s.id);
  const [name, setName] = useState('');
  const [role, setRole] = useState<ShareRole>('comment');
  const [days, setDays] = useState<Days>('30');
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<Made | null>(null);
  const linkOf = (token: string) => `${location.origin}${machineBase}/p/${token}`;
  const invite = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const r = await post<{ share: ProjectShare; token: string }>(`/api/projects/${enc(s.id)}/shares`, { name: name.trim(), role, days: Number(days) || null });
      setMade({ name: r.share.name, url: linkOf(r.token) });
      setName('');
      reload();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onClose={onClose} title={<span translate="no">{tr(`Share ${s.name}`)}</span>} width={560}>
      <div className="space-y-4 text-[13.5px]">
        <p className="leading-relaxed text-fg-3">
          Each person you invite gets a link of their own. Without your password, they see this project’s documents, sessions, runs and reading list, and comment under their name; with Edit documents they
          change its documents too. Never your agents, your files, your settings or your other projects.
        </p>
        {made ? (
          <MadeLink made={made} onDone={() => setMade(null)} />
        ) : (
          <div className="space-y-3 rounded-xl border border-line bg-bg-1 px-3.5 py-3">
            <div className="text-[12.5px] font-medium text-fg-2">Invite someone</div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void invite()}
              placeholder={tr('Their name')}
              aria-label={tr('Their name')}
              maxLength={60}
              className={cx(inputCls, 'h-9')}
            />
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <Segmented<ShareRole>
                size="sm"
                value={role}
                onChange={setRole}
                options={[
                  { value: 'comment', label: SHARE_ROLES.comment },
                  { value: 'edit', label: SHARE_ROLES.edit },
                ]}
              />
              <Segmented<Days> size="sm" value={days} onChange={setDays} options={DAYS} />
            </div>
            <div className="flex justify-end">
              <Button size="sm" variant="primary" icon={<Link2 size={14} />} disabled={busy || !name.trim()} onClick={() => void invite()}>
                Make their link
              </Button>
            </div>
          </div>
        )}
        {shares === null ? (
          <Throbber className="text-fg-3" />
        ) : shares.length ? (
          <div className="space-y-1 border-t border-line pt-3">
            <div className="text-[12px] font-medium text-fg-3">Shared with</div>
            {shares.map((sh) => (
              <PersonRow key={sh.id} s={s} sh={sh} onLink={(token) => setMade({ name: sh.name, url: linkOf(token) })} reload={reload} />
            ))}
          </div>
        ) : null}
        <OwnerName owner={owner} />
      </div>
    </Dialog>
  );
}

/** A link just made: to copy and send, or to show as a QR code. It is not shown again. */
function MadeLink({ made, onDone }: { made: Made; onDone: () => void }) {
  const [qr, setQr] = useState(false);
  const code = useMemo(() => (qr ? qrCode(made.url) : null), [qr, made.url]);
  return (
    <div className="space-y-2.5 rounded-xl border border-accent/30 bg-accent-soft px-3.5 py-3">
      <div className="text-[12.5px] font-medium text-fg-2">{tr(`${made.name}’s link: send it to them. It is shown only now; you can make a new one any time.`)}</div>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md bg-bg-1 px-2 py-1 font-mono text-[12px]" title={made.url}>
          {made.url}
        </code>
        <CopyButton text={made.url} label="Copy the link" />
        <IconButton label={qr ? 'Hide the QR code' : 'Show as a QR code'} size="sm" active={qr} onClick={() => setQr((x) => !x)}>
          <QrCode size={15} />
        </IconButton>
      </div>
      {code && (
        <div className="flex flex-col items-center gap-1.5 pt-1">
          {/* Dark on light whatever the theme, with the quiet zone a reader needs. */}
          <svg viewBox={`-4 -4 ${code.size + 8} ${code.size + 8}`} width={196} height={196} role="img" aria-label={tr('The link as a QR code')} className="rounded-lg" shapeRendering="crispEdges">
            <rect x={-4} y={-4} width={code.size + 8} height={code.size + 8} fill="#ffffff" />
            <path d={qrPath(code)} fill="#000000" />
          </svg>
          <span className="text-[12px] text-fg-3">Point a phone’s camera at it</span>
        </div>
      )}
      <div className="flex justify-end">
        <Button size="sm" variant="ghost" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  );
}

/** Someone it is shared with: who, what they may do, until when, what they did last, and their menu. */
function PersonRow({ s, sh, onLink, reload }: { s: Space; sh: ProjectShare; onLink: (token: string) => void; reload: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const [confirm, confirmNode] = useConfirm();
  const base = `/api/projects/${enc(s.id)}/shares/${enc(sh.id)}`;
  const change = async (b: { role?: ShareRole; days?: number | null }) => {
    setOpen(false);
    try {
      await patch(base, b);
      reload();
    } catch (e) {
      toastError(e);
    }
  };
  const again = async () => {
    setOpen(false);
    if (!(await confirm({ title: tr(`A new link for ${sh.name}?`), body: 'The link they have now stops working at once. Send them the new one.', confirm: 'Make a new link' }))) return;
    try {
      const r = await post<{ token: string }>(`${base}/link`);
      onLink(r.token);
      reload();
    } catch (e) {
      toastError(e);
    }
  };
  const stop = async () => {
    setOpen(false);
    if (!(await confirm({ title: tr(`Stop sharing with ${sh.name}?`), body: 'Their link stops working at once. What they wrote stays, under their name.', confirm: 'Stop sharing', danger: true }))) return;
    try {
      await del(base);
      reload();
    } catch (e) {
      toastError(e);
    }
  };
  const ended = !!sh.expiresAt && sh.expiresAt < Date.now();
  const left = sh.expiresAt ? Math.max(0, Math.round((sh.expiresAt - Date.now()) / 86_400_000)) : null;
  return (
    <div className="flex items-center gap-3 py-1.5">
      <PersonMark name={sh.name} size={30} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline gap-1.5">
          <span translate="no" className="min-w-0 truncate font-medium">
            {sh.name}
          </span>
          <span className={cx('shrink-0 text-[12px]', ended ? 'text-err' : 'text-fg-3')}>
            {SHARE_ROLES[sh.role]}
            {until(sh) && ` · ${until(sh)}`}
          </span>
        </div>
        <div className="truncate text-[12px] text-fg-3">{activityText(sh)}</div>
      </div>
      <IconButton ref={ref} label="More" size="sm" active={open} onClick={() => setOpen((o) => !o)}>
        <MoreHorizontal size={15} />
      </IconButton>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} align="end" width={250} title={<span translate="no">{sh.name}</span>}>
        <MenuLabel>What they may do</MenuLabel>
        <MenuItem checked={sh.role === 'comment'} onClick={() => void change({ role: 'comment' })}>
          {SHARE_ROLES.comment}
        </MenuItem>
        <MenuItem checked={sh.role === 'edit'} onClick={() => void change({ role: 'edit' })}>
          {SHARE_ROLES.edit}
        </MenuItem>
        <MenuSep />
        <MenuLabel>Their link works</MenuLabel>
        <MenuItem checked={left !== null && !ended && left <= 7} onClick={() => void change({ days: 7 })}>
          For a week from now
        </MenuItem>
        <MenuItem checked={left !== null && !ended && left > 7} onClick={() => void change({ days: 30 })}>
          For a month from now
        </MenuItem>
        <MenuItem checked={!sh.expiresAt} onClick={() => void change({ days: null })}>
          Until you stop it
        </MenuItem>
        <MenuSep />
        <MenuItem icon={<RefreshCw size={14} />} onClick={() => void again()}>
          Make a new link
        </MenuItem>
        <MenuItem icon={<UserMinus size={14} />} danger onClick={() => void stop()}>
          Stop sharing
        </MenuItem>
      </Popover>
      {confirmNode}
    </div>
  );
}

/** The name people see the owner's comments under, to change. */
function OwnerName({ owner }: { owner: string }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(owner);
  useEffect(() => setValue(owner), [owner]);
  const save = async () => {
    try {
      await put('/api/projects/sharing', { owner: value.trim() });
      setEditing(false);
    } catch (e) {
      toastError(e);
    }
  };
  return (
    <div className="flex min-h-8 flex-wrap items-center gap-2 border-t border-line pt-3 text-[12.5px] text-fg-3">
      {editing ? (
        <>
          <span>They see your comments as</span>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void save();
              if (e.key === 'Escape') setEditing(false);
            }}
            maxLength={60}
            autoFocus
            aria-label={tr('Your name, as they see it')}
            className={cx(inputCls, 'h-7 w-40 text-[12.5px]')}
          />
          <Button size="sm" variant="secondary" onClick={() => void save()} className="h-7">
            Save
          </Button>
        </>
      ) : (
        <>
          <span>
            They see your comments as{' '}
            <span translate="no" className="font-medium text-fg-2">
              {owner}
            </span>
          </span>
          <button type="button" onClick={() => setEditing(true)} className="inline-flex items-center gap-1 text-fg-3 hover:text-fg">
            <Pencil size={12} /> Change
          </button>
        </>
      )}
    </div>
  );
}

