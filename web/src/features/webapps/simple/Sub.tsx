// Reads and does what the pages behind More show (SubViews.tsx draws them).
import { useCallback, useEffect, useState } from 'react';
import type { AppServicesView, ServicesCardView } from '@shared/services';
import type { AppKey, RunBackup, WebAppDataPage, WebAppDataTables, WebAppDetail, WebAppLaunchView, WebAppMailPage, WebAppStep, WebAppSteps } from '@shared/webapps';
import { tr } from '../../../i18n/runtime';
import { api, enc, post, put } from '../../../lib/api';
import { go } from '../../../lib/nav';
import { toast, toastError } from '../../../lib/store';
import { Dialog, Throbber, useConfirm } from '../../../components/ui';
import { useLoaded, webAppPath, type WebTab } from '../api';
import { KeysDialog, useAppKeys, type KeysAsk } from '../AppKeys';
import type { ChecksState } from '../Checks';
import { Flows } from '../Flows';
import { MailUse } from '../MailUse';
import { ServicesCard } from '../ServicesCard';
import { checkedLine, fixAllMessage, onlineAddress } from './plain';
import { useContinue } from './sessions';
import { BackupsView, ChecksView, DataView, dayAndTime, KeysView, SubFrame, VersionsView } from './SubViews';

function Data({ app }: { app: WebAppDetail }) {
  const base = `/api/webapps/${enc(app.id)}/data`;
  const tables = useLoaded<WebAppDataTables>(app.shape.database?.sqlite ? base : null);
  const [open, setOpen] = useState('');
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<WebAppDataPage | null>(null);
  useEffect(() => {
    setPage(null);
    if (!open) return;
    api<WebAppDataPage>(`${base}/${enc(open)}?offset=${offset}&limit=10`).then(setPage, toastError);
  }, [base, open, offset]);
  if (app.shape.database?.sqlite && !tables.data) return <Throbber size={22} />;
  return <DataView tables={tables.data?.tables ?? []} open={open} page={page} onOpen={(n) => (setOpen(n), setOffset(0))} onPage={setOffset} />;
}

function Backups({ app }: { app: WebAppDetail }) {
  const launch = useLoaded<WebAppLaunchView>(`/api/webapps/${enc(app.id)}/launch`);
  const server = launch.data?.envs.find((e) => e.env === 'production') ?? launch.data?.envs[0];
  const where = server ? 'server' : launch.data?.hydor.launched ? 'here' : 'none';
  const base = `/api/webapps/${enc(app.id)}/run/${enc(server?.env ?? 'hydor')}/backups`;
  const list = useLoaded<{ backups: RunBackup[] }>(launch.data && where !== 'none' ? base : null);
  const [busy, setBusy] = useState<string | null>(null);
  const [ask, confirmNode] = useConfirm();
  const act = async (what: string, f: () => Promise<unknown>) => {
    setBusy(what);
    try {
      await f();
      await list.reload();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
    }
  };
  if (!launch.data || (where !== 'none' && !list.data && !list.error)) return <Throbber size={22} />;
  return (
    <>
      <BackupsView
        where={where}
        backups={list.data?.backups ?? []}
        busy={busy}
        onNow={() => void act('now', async () => (await post(base, {}), toast(tr('A copy is made'), 'ok')))}
        onRestore={(b) =>
          void (async () => {
            const ok = await ask({
              title: tr(`Put back the copy from ${dayAndTime(b.at)}?`),
              body: 'The app stops for a moment. Everything it keeps is replaced by what this copy holds: what people added since then is lost. A copy of how it is now is made first.',
              confirm: tr('Put it back'),
              danger: true,
            });
            if (ok) await act(b.id, async () => (await post(`${base}/${enc(b.id)}/restore`, {}), toast(tr('It is back'), 'ok')));
          })()
        }
      />
      {confirmNode}
    </>
  );
}

function Keys({ app, reload }: { app: WebAppDetail; reload: () => Promise<void> }) {
  const base = `/api/webapps/${enc(app.id)}`;
  const launch = useLoaded<WebAppLaunchView>(`${base}/launch`);
  const address = onlineAddress(launch.data);
  const env = launch.data?.envs.find((e) => e.address === address)?.env ?? 'hydor';
  const keys = useAppKeys(app.id, env);
  const services = useLoaded<AppServicesView>(`${base}/services`);
  const mailPage = useLoaded<WebAppMailPage>(app.mail ? `${base}/mail` : null);
  const [ask, setAsk] = useState<KeysAsk | null>(null);
  const [card, setCard] = useState<ServicesCardView | null>(null);
  const [mail, setMail] = useState(false);
  const [work, setWork] = useState(false);
  const close = useCallback(() => {
    setAsk(null);
    keys.load();
  }, [keys]);
  const closeCard = () => {
    setCard(null);
    void services.reload();
  };
  const allow = (on: boolean) => void put(base, { settings: { tiers: on ? app.ai!.asks : [] } }).then(reload, toastError);
  return (
    <>
      <KeysView
        keys={keys.data?.keys ?? []}
        onServer={env !== 'hydor'}
        onAdd={(k: AppKey, replace) => setAsk({ env, names: [k.name], replace, skippable: env === 'hydor' })}
        services={(services.data?.chosen ?? []).map((c) => ({ need: c.need, needName: c.needName, name: c.name }))}
        onService={(need) => void post<{ card: ServicesCardView }>(`${base}/services/cards`, { need }).then((r) => setCard(r.card), toastError)}
        models={app.ai && app.ai.asks.length ? { allowed: app.ai.allowed.length > 0, usdPerDay: app.ai.capUsd, spentUsd: app.ai.spentUsd, allow } : null}
        mail={app.mail ? { on: (mailPage.data?.mail.state ?? app.mail.state) === 'allowed', choose: () => setMail(true) } : null}
        work={app.flows ? { name: app.flows.app.name, open: () => setWork(true) } : null}
      />
      <KeysDialog app={app} ask={ask} onClose={close} />
      <Dialog open={mail} onClose={() => setMail(false)} title={tr('Mail')} width={640}>
        <MailUse app={app} reload={reload} />
      </Dialog>
      <Dialog open={work} onClose={() => setWork(false)} title={tr('Work agents do for it')} width={760}>
        <Flows app={app} reload={reload} />
      </Dialog>
      {card && (
        <Dialog open onClose={closeCard} bare width={card.need.services.length >= 3 ? 880 : 640} label={tr(`Services for ${app.name}`)}>
          <ServicesCard key={card.id} id={card.id} initial={card} embedded onClose={closeCard} />
        </Dialog>
      )}
    </>
  );
}

function Checks({ app, checks }: { app: WebAppDetail; checks: ChecksState }) {
  const carry = useContinue(app);
  const [fixAt, setFixAt] = useState(0);
  useEffect(() => {
    if (!checks.data?.running) return;
    const t = setInterval(() => void checks.reload(), 3000);
    return () => clearInterval(t);
  }, [checks]);
  const line = checkedLine(checks.data, checks.running);
  const fixing = !!fixAt && (!checks.data?.at || checks.data.at < fixAt);
  return (
    <ChecksView
      checked={{
        line,
        fixing,
        onFix: () => {
          setFixAt(Date.now());
          void carry(fixAllMessage(checks.data?.lines ?? []), true);
          toast(tr('The agent is on it'), 'ok');
        },
      }}
      at={checks.data?.ran ? checks.data.at : null}
      onAgain={() => void checks.run()}
    />
  );
}

function Versions({ app, reload }: { app: WebAppDetail; reload: () => Promise<void> }) {
  const steps = useLoaded<WebAppSteps>(`/api/webapps/${enc(app.id)}/steps?limit=30`);
  const [working, setWorking] = useState<string | null>(null);
  const [ask, confirmNode] = useConfirm();
  const back = async (s: WebAppStep) => {
    const ok = await ask({
      title: tr('Go back to before this?'),
      body: (
        <div className="space-y-2 text-[13.5px] leading-snug">
          <p translate="no" className="rounded-lg bg-bg-2 px-3 py-2 text-fg">
            {s.message}
          </p>
          <p>The app goes back to how it was before this change. What people saved in it stays, and you can come forward again.</p>
        </div>
      ),
      confirm: tr('Go back'),
    });
    if (!ok) return;
    setWorking(s.sha);
    try {
      await post(`/api/webapps/${enc(app.id)}/steps/${enc(s.sha)}/back`);
      toast(tr('Went back'), 'ok');
      await Promise.all([steps.reload(), reload()]);
    } catch (e) {
      toastError(e);
    } finally {
      setWorking(null);
    }
  };
  if (!steps.data) return <Throbber size={22} />;
  return (
    <>
      <VersionsView steps={steps.data.steps} working={working} onBack={(s) => void back(s)} />
      {confirmNode}
    </>
  );
}

export const SIMPLE_SUBS = ['data', 'backups', 'run', 'keys', 'checks', 'versions', 'flows'] as const;

export function SimpleSub({ app, tab, checks, reload }: { app: WebAppDetail; tab: WebTab; checks: ChecksState; reload: () => Promise<void> }) {
  const back = () => go(webAppPath(app.id));
  const [title, line, body] =
    tab === 'data'
      ? [tr('What it keeps'), tr('To look at only: nothing here changes it.'), <Data key="d" app={app} />]
      : tab === 'backups' || tab === 'run'
        ? [tr('Backups'), undefined, <Backups key="b" app={app} />]
        : tab === 'keys' || tab === 'flows'
          ? [tr('Keys and services'), undefined, <Keys key="k" app={app} reload={reload} />]
          : tab === 'checks'
            ? [tr('Checks'), undefined, <Checks key="c" app={app} checks={checks} />]
            : [tr('Earlier versions'), undefined, <Versions key="v" app={app} reload={reload} />];
  return (
    <SubFrame title={title} line={line} onBack={back}>
      {body}
    </SubFrame>
  );
}
