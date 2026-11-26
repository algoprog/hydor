// Reads what the path to put an app online needs and does what its buttons say (onlinePath.ts picks the screen,
// OnlineView.tsx draws it). What only the person can say is kept on this device, so they can leave at any screen and come
// back to it.
import { useCallback, useEffect, useRef, useState } from 'react';
import { webappSlug, type LaunchHost, type LaunchHostOffer, type LaunchJob, type LaunchKey, type WebAppDetail, type WebAppLaunchView, type WebAppOnlineHelp } from '@shared/webapps';
import { stillMissing } from '@shared/keys';
import { tr } from '../../../i18n/runtime';
import { api, del, enc, post } from '../../../lib/api';
import { go } from '../../../lib/nav';
import { toast, toastError } from '../../../lib/store';
import { Throbber, useConfirm } from '../../../components/ui';
import { openWebApp, useLoaded, webAppPath } from '../api';
import { KeysDialog, useAppKeys, type KeysAsk } from '../AppKeys';
import { envFor } from '../serverPlace';
import { back, cleanServer, dataOf, hostName, jobOf, keyLine, missingOnServer, screenOf, testAddress, type OnlineSaved, type ScreenId } from './onlinePath';
import { OnlineView, type OnlineActions } from './OnlineView';
import { checkProblem, launchFailedMessage, shortAddress } from './plain';
import { useContinue } from './sessions';

const KEY = 'wa.webapps.online.v1';
const read = (id: string): OnlineSaved => {
  try {
    return (JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, OnlineSaved>)[id] ?? {};
  } catch {
    return {};
  }
};
const write = (id: string, s: OnlineSaved) => {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, OnlineSaved>;
    all[id] = s;
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {}
};

/** What a failed connection means to the person. */
const NOT_REACHED = () => tr('Hydor could not reach it yet. A new server takes a minute or two: check the address, then try again.');

export function Online({ app, reload }: { app: WebAppDetail; reload: () => Promise<void> }) {
  const base = `/api/webapps/${enc(app.id)}`;
  const view = useLoaded<WebAppLaunchView>(`${base}/launch`);
  const help = useLoaded<WebAppOnlineHelp>('/api/webapps/online-help');
  const [saved, setSaved] = useState(() => read(app.id));
  const keep = useCallback(
    (s: OnlineSaved) => {
      write(app.id, s);
      setSaved(s);
    },
    [app.id],
  );
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [line, setLine] = useState('');
  const [block, setBlock] = useState('');
  const [offer, setOffer] = useState<LaunchHostOffer | null>(null);
  const [looked, setLooked] = useState<{ what: string; ok: boolean | null }[]>([]);
  const [points, setPoints] = useState<boolean | null>(null);
  const [serverKeys, setServerKeys] = useState<LaunchKey[] | null>(null);
  const [keysAsk, setKeysAsk] = useState<KeysAsk | null>(null);
  const [ask, confirmNode] = useConfirm();
  const carry = useContinue(app);

  const v = view.data;
  const host: LaunchHost | undefined = v?.hosts.find((h) => h.name === saved.host);
  const serverEnv = v ? envFor(v.envs, saved.host ?? '') : 'production';
  const env = saved.where === 'here' ? 'hydor' : serverEnv;
  const hereKeys = useAppKeys(app.id, saved.where === 'here' ? 'hydor' : null);
  const placeKeys = useAppKeys(app.id, saved.where === 'internet' && saved.host ? serverEnv : null);
  const readServerKeys = useCallback(() => {
    if (saved.where !== 'internet' || !saved.host) return;
    api<{ keys: LaunchKey[] }>(`${base}/launch/keys?env=${enc(env)}&host=${enc(saved.host)}`).then((r) => setServerKeys(r.keys), () => setServerKeys(null));
  }, [base, env, saved.host, saved.where]);
  useEffect(readServerKeys, [readServerKeys]);

  const missing = saved.where === 'here' ? (hereKeys.data?.keys ?? []).filter(stillMissing).map(keyLine) : missingOnServer(serverKeys, placeKeys.data?.keys);
  const facts = v ? { app, view: v, missingKeys: missing.length } : null;
  const screen: ScreenId | null = facts ? screenOf(facts, saved) : null;
  const job: LaunchJob | null = facts ? jobOf(facts, saved) : null;

  const going = !!job && (job.state === 'running' || job.state === 'asking');
  useEffect(() => {
    if (!going) return;
    const t = setInterval(() => void view.reload(), 1500);
    return () => clearInterval(t);
  }, [going, view]);
  // A launch that ended well: the path is behind the person, and the app's page is read again.
  useEffect(() => {
    if (job?.state === 'done' && saved.where) {
      keep({ job: job.id });
      void reload();
    }
  }, [job?.state, job?.id, saved.where, keep, reload]);
  // The key to paste, made when its screen shows.
  useEffect(() => {
    if (screen !== 'paste' || line) return;
    api<{ line: string }>(`${base}/server-key`).then((r) => setLine(r.line), (e: Error) => setProblem(e.message));
  }, [screen, line, base]);
  // The text for a new server, made when its screen shows (again each time: a used one is made anew).
  useEffect(() => {
    if (screen !== 'create' || !saved.text) return;
    setBlock('');
    api<{ text: string }>(`${base}/server-text`).then((r) => setBlock(r.text), (e: Error) => setProblem(e.message));
  }, [screen, saved.text, base]);
  // Connecting to a server created with the text: it is taken only if it shows what the text gave it. An answer that
  // comes after the person went back is dropped.
  const turn = useRef(0);
  const connectText = useCallback(
    async (address: string) => {
      const next = { ...saved };
      delete next.starting;
      delete next.mismatch;
      delete next.unsafe;
      const mine = turn.current;
      try {
        const r = await post<{ state: 'ready' | 'starting' | 'unfinished' | 'other' | 'unsafe'; why?: 'make' | 'swap' | 'again'; host?: string; looked?: { what: string; ok: boolean | null }[] }>(`${base}/server-connect`, { address });
        if (mine !== turn.current) return;
        setProblem('');
        if (r.state === 'other') keep({ ...next, mismatch: true });
        else if (r.state === 'unsafe') keep({ ...next, unsafe: { why: r.why ?? 'make', address } });
        else if (r.state === 'starting') keep({ ...next, starting: address });
        else {
          setLooked(r.looked ?? []);
          await view.reload();
          keep({ ...next, host: r.host });
        }
      } catch (e) {
        if (mine !== turn.current) return;
        setProblem(e instanceof Error ? e.message : NOT_REACHED());
        if (saved.starting) keep(next);
      }
    },
    [base, saved, keep, view],
  );
  const poll = useRef(connectText);
  poll.current = connectText;
  // Every answer of "still starting" is kept anew, which asks again after a while.
  useEffect(() => {
    if (screen !== 'starting' || !saved.starting) return;
    const t = setTimeout(() => void poll.current(saved.starting!), 10_000);
    return () => clearTimeout(t);
  }, [screen, saved]);
  // The server's code, asked for when its screen shows.
  const connect = useCallback(
    async (name: string) => {
      setProblem('');
      setOffer(null);
      try {
        const o = await post<LaunchHostOffer>(`/api/webapps/hosts/${enc(name)}/connect`, {});
        if (o.offered.length) setOffer(o);
        else setProblem(NOT_REACHED());
      } catch {
        setProblem(NOT_REACHED());
      }
    },
    [],
  );
  useEffect(() => {
    if (screen === 'compare' && saved.host) void connect(saved.host);
  }, [screen, saved.host, connect]);
  // Whether the address leads to the server yet: asked every few seconds while that screen shows.
  useEffect(() => {
    if (screen !== 'record' || !saved.domain || !saved.host) return;
    let alive = true;
    const look = () =>
      api<{ points: boolean }>(`/api/webapps/dns?name=${enc(saved.domain!)}&host=${enc(saved.host!)}`).then(
        (r) => alive && setPoints(r.points),
        () => alive && setPoints(false),
      );
    setPoints(null);
    void look();
    const t = setInterval(() => void look(), 8000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [screen, saved.domain, saved.host]);

  if (!v || !screen) return <div className="flex justify-center py-16 text-fg-3">{view.error ? <span translate="no">{view.error}</span> : <Throbber size={26} />}</div>;

  const act = async (what: () => Promise<unknown>) => {
    setBusy(true);
    setProblem('');
    try {
      await what();
      await view.reload();
    } catch (e) {
      toastError(e);
      await view.reload();
    } finally {
      setBusy(false);
    }
  };
  const deployed = v.envs.find((e) => e.env === 'production') ?? v.envs[0];
  const startLaunch = async (what: () => Promise<{ job: LaunchJob }>) =>
    act(async () => {
      const r = await what();
      keep({ ...saved, job: r.job.id });
    });
  const launchServer = async (h: string, e: string, address: string) => startLaunch(() => post<{ job: LaunchJob }>(`${base}/launch/server`, { host: h, env: e, address }));
  const launchHere = () => startLaunch(() => post<{ job: LaunchJob }>(`${base}/launch/hydor`, {}));
  const here = job ? job.place === 'hydor' : !v.envs.length;
  const data = dataOf({ app, view: v, help: help.data, saved, missing, offer, looked, points, line, block, busy, problem });

  const actions: OnlineActions = {
    back: () => {
      turn.current++;
      setProblem('');
      setOffer(null);
      setLooked([]);
      keep(back(screen, saved));
    },
    leave: () => go(webAppPath(app.id)),
    where: (w) => keep({ where: w }),
    provider: (id) => keep({ ...saved, provider: id, text: !!help.data?.providers.find((p) => p.id === id)?.server?.text }),
    useServer: (name) => keep({ ...saved, provider: 'own', text: false, host: name }),
    created: () => keep({ ...saved, created: true }),
    pasted: () => keep({ ...saved, pasted: true }),
    copy: (text) => void navigator.clipboard?.writeText(text).then(() => toast(tr('Copied'), 'ok'), () => {}),
    connect: (ssh) =>
      void act(async () => {
        const target = cleanServer(ssh, 'root');
        if (saved.text) return connectText(target);
        const same = v.hosts.find((h) => h.ssh === target || `${h.ssh}:22` === target);
        if (same) return keep({ ...saved, host: same.name });
        try {
          const r = await post<{ host: LaunchHost }>('/api/webapps/hosts', { name: hostName(v.hosts.map((h) => h.name)), ssh: target, key: app.id });
          keep({ ...saved, host: r.host.name });
        } catch {
          setProblem(tr('That does not look like a server’s address.'));
        }
      }),
    match: () =>
      void act(async () => {
        if (saved.host && offer?.offered[0]) await post(`/api/webapps/hosts/${enc(saved.host)}/accept`, { fingerprint: offer.offered[0].fingerprint });
      }),
    noMatch: () =>
      void act(async () => {
        if (saved.host) await del(`/api/webapps/hosts/${enc(saved.host)}`);
        keep({ ...saved, mismatch: true });
      }),
    setup: () =>
      void (async () => {
        setBusy(true);
        setProblem('');
        try {
          const url = `/api/webapps/hosts/${enc(saved.host!)}/check`;
          let r = await post<{ ok: boolean; looked: { what: string; ok: boolean | null }[] }>(url, {});
          if (!r.ok) r = await post(url, { prepare: true });
          setLooked(r.looked);
        } catch {
          setProblem(tr('Hydor could not set it up. A new server may still be starting: try again in a minute.'));
        } finally {
          setBusy(false);
          await view.reload();
        }
      })(),
    web: (w) => (w === 'test' ? keep({ ...saved, web: w, address: testAddress(webappSlug(app.name), host?.address ?? '') }) : keep({ ...saved, web: w })),
    registrar: (id) => keep({ ...saved, registrar: id }),
    domain: (d) => keep({ ...saved, domain: d }),
    useAddress: () => keep({ ...saved, address: `https://${saved.domain}` }),
    addKeys: () => setKeysAsk({ env, ...(saved.where === 'internet' ? { names: (serverKeys ?? []).filter((k) => k.state === 'missing').map((k) => k.name) } : {}) }),
    launch: () => void (saved.where === 'here' ? launchHere() : launchServer(saved.host!, env, saved.address!)),
    fixFirst: () =>
      void act(async () => {
        const stops = job?.ask?.kind === 'override' ? job.ask.stops : [];
        await post(`${base}/launch/answer`, { cancel: true });
        await carry(`${tr('Please fix this before it goes online:')}\n${[...new Set(stops.map((s) => checkProblem(s.id)))].map((x) => `- ${x}`).join('\n')}`);
      }),
    anyway: () =>
      void (async () => {
        const ok = await ask({ title: tr('Put it online with these not fixed?'), body: tr('It goes online as it is. What the checks found stays written down with this version.'), confirm: tr('Put it online anyway'), danger: true });
        if (ok) await act(() => post(`${base}/launch/answer`, { override: job?.ask?.kind === 'override' ? job.ask.stops.map((s) => s.id) : [] }));
      })(),
    fix: () => void carry(job?.state === 'failed' ? launchFailedMessage(job) : tr('Please get it ready to go online.')),
    again: () => {
      if (screen === 'compare' && saved.host) return void connect(saved.host);
      if (screen === 'unsafe' && saved.unsafe) return void act(() => connectText(saved.unsafe!.address));
      const next = { ...saved };
      delete next.job;
      keep(next);
    },
    open: () => {
      if (here) return void openWebApp(app.id, undefined, 'launched');
      if (data.address) window.open(data.address, '_blank', 'noopener');
    },
    update: () => void (here ? launchHere() : launchServer(deployed!.host, deployed!.env, deployed!.address)),
    takeDown: () =>
      void (async () => {
        const ok = await ask({ title: tr(`Take it off ${shortAddress(deployed?.address ?? '')}?`), body: tr('Nobody is answered at that address any more. What it keeps stays on your server. Your server is still billed until you delete it.'), confirm: tr('Take it off'), danger: true });
        if (ok)
          await act(async () => {
            await post(`${base}/launch/takedown`, { env: deployed!.env });
            keep({});
            await reload();
          });
      })(),
    goBack: () =>
      void (async () => {
        const ok = await ask({ title: tr('Go back to the version before?'), body: tr('The version before is put back for people. What they saved stays. Going back again comes forward.'), confirm: tr('Go back') });
        if (ok) await startLaunch(() => post<{ job: LaunchJob }>(`${base}/launch/back`, here ? {} : { place: 'server', env: deployed!.env }));
      })(),
    askAccounts: () => void carry(tr('I want to put it on the internet. Please give it accounts of its own, so each person signs in.')),
  };

  return (
    <>
      <OnlineView screen={screen} d={data} act={actions} />
      <KeysDialog
        app={app}
        ask={keysAsk}
        onClose={() => {
          setKeysAsk(null);
          hereKeys.load();
          readServerKeys();
        }}
      />
      {confirmNode}
    </>
  );
}
