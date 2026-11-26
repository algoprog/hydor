// A web app's own page (/apps/web/<id>, its tab in the address as ?tab=): in the layout of an agent app's page, with its Overview,
// Preview, Data, Checks, Keys, Launch and Run. Rename and Forget are in its More menu.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Archive, Code, Database, History, KeyRound, ListChecks, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import type { WebAppDetail, WebAppKeys, WebAppLaunchView } from '@shared/webapps';
import { tr } from '../../i18n/runtime';
import { api, ApiError, del, enc, post, put } from '../../lib/api';
import { useFeatureEvent } from '../../lib/featureEvents';
import { go } from '../../lib/nav';
import { toast, toastError, useUI } from '../../lib/store';
import { Button, Dialog, Empty, IconButton, inputCls, MenuItem, MenuSep, Popover, Tabs, Throbber, useConfirm } from '../../components/ui';
import { PageHeader } from '../layout/PageHeader';
import { AppIcon } from '../apps/AppIcon';
import { busy, openWebApp, webAppPath, type WebTab } from './api';
import { Checks, useChecks } from './Checks';
import { Data } from './Data';
import { placeName } from '../connections/KeysCard';
import { Flows } from './Flows';
import { Launch } from './Launch';
import { Run } from './Run';
import { Overview } from './Overview';
import { Preview } from './Preview';
import { readable, statusOf } from './status';
import { KeysTab } from './AppKeys';
import { SimpleHome } from './simple/Home';
import { SimpleSub } from './simple/Sub';
import { Online } from './simple/Online';
import { keyTitle } from './simple/plain';

/** Where the list of web apps is on the Apps page. */
export const WEB_APPS_PLACE = '/apps?place=web';

function RenameDialog({ app, open, onClose, onDone }: { app: WebAppDetail; open: boolean; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(app.name);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) setName(app.name);
  }, [open, app.name]);
  const save = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      await put(`/api/webapps/${enc(app.id)}`, { name });
      onDone();
      onClose();
    } catch (e) {
      toastError(e);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Rename"
      width={420}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!name.trim() || saving} onClick={() => void save()}>
            Rename
          </Button>
        </>
      }
    >
      <input
        className={inputCls}
        translate="no"
        aria-label="Name"
        value={name}
        maxLength={80}
        autoFocus
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && void save()}
      />
    </Dialog>
  );
}

export function WebAppPage({ id, tab }: { id: string; tab: WebTab }) {
  const technical = useUI((s) => s.technicalDetails);
  const [app, setApp] = useState<WebAppDetail | null>(null);
  const [err, setErr] = useState<{ message: string; missing: boolean } | null>(null);
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const more = useRef<HTMLButtonElement>(null);
  const [ask, confirmNode] = useConfirm();
  const checks = useChecks(id);
  const load = useCallback(
    () =>
      api<{ app: WebAppDetail }>(`/api/webapps/${enc(id)}`).then(
        (r) => {
          setApp(r.app);
          setErr(null);
        },
        (e: unknown) => setErr({ message: (e as Error).message, missing: e instanceof ApiError && e.status === 404 }),
      ),
    [id],
  );
  useEffect(() => void load(), [load]);
  useFeatureEvent('webapps', () => void load());
  const going = !!app && busy(app);
  useEffect(() => {
    if (!going) return;
    const t = setInterval(() => void load(), 2000);
    return () => clearInterval(t);
  }, [going, load]);

  const forget = async () => {
    setMenu(false);
    if (!app) return;
    // Its own keys go with it: said first, by name and place.
    const keys = await api<WebAppKeys>(`/api/webapps/${enc(app.id)}/keys?env=all`).then(
      (v) => v.keys.map((k) => ({ name: technical ? k.name : keyTitle(k), places: (k.places ?? []).filter((p) => p.set).map((p) => placeName(p.env, v.servers.length === 1 && v.servers[0] === p.env)) })).filter((k) => k.places.length),
      () => [],
    );
    // What runs on a server of the owner's keeps running: said too, with where.
    const servers = await api<WebAppLaunchView>(`/api/webapps/${enc(app.id)}/launch`).then(
      (v) => v.envs,
      () => [],
    );
    const ok = await ask({
      title: tr(`Forget ${app.name}?`),
      body: (
        <>
          {technical ? (
            <>
              It stops and leaves this list. Its folder and the data it kept stay where they are, so you can add it again:{' '}
              <code translate="no" className="rounded bg-bg-2 px-1 py-0.5 text-[12.5px] break-all">
                {app.folder}
              </code>
            </>
          ) : (
            'It stops and leaves this list. What it is made of and what it keeps stay on this computer.'
          )}
          {servers.length > 0 && (
            <span className="mt-2 block" data-forget="servers">
              <span className="block">{technical ? 'What runs on a server of yours keeps running there: Hydor only forgets it. To stop it, take it off on the Launch tab first.' : 'What is online on your server keeps running there: Hydor only forgets it. To stop it, take it off under Put it online first.'}</span>
              {servers.map((x) => (
                <span key={x.env} translate="no" className="block text-[13px] break-all text-fg-3">
                  {`${x.address} (${x.host})`}
                </span>
              ))}
            </span>
          )}
          {keys.length > 0 && (
            <span className="mt-2 block" data-forget="keys">
              <span className="mb-1.5 block">Its keys are removed from your vault. Add it again and you give them again; the ones Hydor made are made anew.</span>
              {keys.map((k) => (
                <span key={k.name} className="block text-[13px] text-fg-3">
                  {technical ? <code translate="no">{k.name}</code> : <span translate="no">{k.name}</span>} ({k.places.join(', ')})
                </span>
              ))}
            </span>
          )}
        </>
      ),
      confirm: 'Forget',
      danger: true,
    });
    if (!ok) return;
    try {
      await del(`/api/webapps/${enc(app.id)}`);
      toast(tr(`Forgot ${app.name}`), 'ok');
      go(WEB_APPS_PLACE);
    } catch (e) {
      toastError(e);
    }
  };

  if (err)
    return (
      <div className="flex h-full min-h-0 flex-col">
        <PageHeader title="Web app" back={{ label: 'Web apps', onClick: () => go(WEB_APPS_PLACE) }} />
        <Empty title={err.missing ? 'This web app is not here' : 'This web app could not be opened'}>
          <span translate="no" className="block">{err.message}</span>
        </Empty>
      </div>
    );
  const canOpen = !!app && readable(app) && (app.build.exists || app.mode?.runsAs === 'dev') && app.build.state !== 'building';
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        back={{ label: 'Web apps', onClick: () => go(WEB_APPS_PLACE) }}
        title={
          app ? (
            <span className="flex min-w-0 items-center gap-2.5">
              <AppIcon icon="app-window" color="indigo" size={26} />
              <span translate="no" className="truncate">
                {app.name}
              </span>
            </span>
          ) : (
            'Web app'
          )
        }
        actions={
          app && (
            <>
              {technical && (
                <Button size="sm" variant="primary" disabled={!canOpen} onClick={() => void openWebApp(app.id)}>
                  Open
                </Button>
              )}
              {technical ? (
                <IconButton label="More" ref={more} onClick={() => setMenu((m) => !m)}>
                  <MoreHorizontal size={17} />
                </IconButton>
              ) : (
                <Button ref={more} size="sm" variant="secondary" icon={<MoreHorizontal size={15} />} aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
                  More
                </Button>
              )}
              <Popover anchor={more} open={menu} onClose={() => setMenu(false)} align="end" width={240}>
                {!technical && (
                  <>
                    {(
                      [
                        ['data', <Database key="d" size={15} />, 'What it keeps'],
                        ['backups', <Archive key="b" size={15} />, 'Backups'],
                        ['keys', <KeyRound key="k" size={15} />, 'Keys and services'],
                        ['checks', <ListChecks key="c" size={15} />, 'Checks'],
                        ['versions', <History key="v" size={15} />, 'Earlier versions'],
                      ] as const
                    ).map(([to, icon, label]) => (
                      <MenuItem key={to} icon={icon} onClick={() => (setMenu(false), go(webAppPath(id, to)))}>
                        {label}
                      </MenuItem>
                    ))}
                    <MenuSep />
                  </>
                )}
                <MenuItem icon={<Code size={15} />} checked={technical} onClick={() => (setMenu(false), useUI.getState().set({ technicalDetails: !technical }))}>
                  Technical details
                </MenuItem>
                <MenuItem icon={<Pencil size={15} />} onClick={() => (setMenu(false), setRenaming(true))}>
                  Rename
                </MenuItem>
                <MenuItem icon={<Trash2 size={15} />} danger onClick={() => void forget()}>
                  Forget this app
                </MenuItem>
              </Popover>
            </>
          )
        }
      >
        {app && technical && (
          <Tabs
            value={tab === 'backups' ? 'run' : tab === 'versions' ? 'overview' : tab}
            onChange={(t) => go(webAppPath(id, t), true)}
            options={[
              { value: 'overview', label: 'Overview' },
              { value: 'preview', label: 'Preview' },
              ...(app.flows ? [{ value: 'flows' as const, label: tr('Flows') }] : []),
              ...(app.shape.database?.sqlite ? [{ value: 'data' as const, label: 'Data' }] : []),
              { value: 'checks', label: 'Checks', count: checks.data?.lines.filter((l) => l.state === 'failed').length || undefined },
              { value: 'keys', label: tr('Keys'), count: app.shape.keys || undefined },
              { value: 'launch', label: 'Launch' },
              ...(app.mode?.launched || app.mode?.servers?.length || app.stage === 'run' ? [{ value: 'run' as const, label: tr('Run') }] : []),
            ]}
          />
        )}
      </PageHeader>
      {!app ? (
        <div className="flex justify-center py-20 text-fg-3">
          <Throbber size={28} />
        </div>
      ) : !technical ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {tab === 'overview' || tab === 'preview' ? (
            <SimpleHome app={app} checks={checks} reload={load} />
          ) : tab === 'launch' ? (
            <Online app={app} reload={load} />
          ) : (
            <SimpleSub app={app} tab={tab} checks={checks} reload={load} />
          )}
        </div>
      ) : tab === 'preview' ? (
        <div className="min-h-0 flex-1">
          <Preview app={app} onBuild={() => void post(`/api/webapps/${enc(app.id)}/build`).then(load, toastError)} />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {(tab === 'overview' || tab === 'versions') && <Overview app={app} reload={load} onForget={() => void forget()} checks={checks.data} />}
          {tab === 'flows' && <Flows app={app} reload={load} />}
          {tab === 'data' && <Data app={app} />}
          {tab === 'checks' && <Checks app={app} checks={checks} />}
          {tab === 'keys' && <KeysTab app={app} />}
          {tab === 'launch' && <Launch app={app} reload={load} />}
          {(tab === 'run' || tab === 'backups') && <Run app={app} />}
        </div>
      )}
      {app && <RenameDialog app={app} open={renaming} onClose={() => setRenaming(false)} onDone={() => void load()} />}
      {confirmNode}
    </div>
  );
}
