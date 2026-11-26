// Reads what the simple page of a web app shows and does what its buttons say (HomeView.tsx draws it).
import { useCallback, useEffect, useRef, useState } from 'react';
import { Copy, ExternalLink } from 'lucide-react';
import type { WebAppDetail, WebAppGuide, WebAppLaunchView, WebAppRunView, WebAppSteps } from '@shared/webapps';
import { tr } from '../../../i18n/runtime';
import { enc, post, put } from '../../../lib/api';
import { go, openSession } from '../../../lib/nav';
import { toast, toastError } from '../../../lib/store';
import { Button, Dialog, useConfirm } from '../../../components/ui';
import { openWebApp, useLoaded, webAppPath } from '../api';
import { KeysDialog, useAppKeys, type KeysAsk } from '../AppKeys';
import type { ChecksState } from '../Checks';
import { MailUse } from '../MailUse';
import type { Pointed } from '../point';
import { Preview } from '../Preview';
import { HomeView, type Need } from './HomeView';
import { fixAllMessage, homeOf, onlineAddress, plainPoint, shortAddress } from './plain';
import { useAppSessions, useContinue } from './sessions';

const FIXING_KEY = 'wa.webapps.fixing.v1';
const readFixing = (id: string): number => {
  try {
    return Number((JSON.parse(localStorage.getItem(FIXING_KEY) ?? '{}') as Record<string, number>)[id]) || 0;
  } catch {
    return 0;
  }
};
const keepFixing = (id: string, at: number) => {
  try {
    const all = JSON.parse(localStorage.getItem(FIXING_KEY) ?? '{}') as Record<string, number>;
    all[id] = at;
    localStorage.setItem(FIXING_KEY, JSON.stringify(all));
  } catch {}
};

export function SimpleHome({ app, checks, reload }: { app: WebAppDetail; checks: ChecksState; reload: () => Promise<void> }) {
  const base = `/api/webapps/${enc(app.id)}`;
  const launch = useLoaded<WebAppLaunchView>(`${base}/launch`);
  const guide = useLoaded<WebAppGuide>(`${base}/guide`);
  const steps = useLoaded<WebAppSteps>(`${base}/steps?limit=3`);
  const address = onlineAddress(launch.data);
  const env = launch.data?.envs.find((e) => e.address === address)?.env ?? 'hydor';
  const keys = useAppKeys(app.id, env);
  // For an app that is launched, whether it answers there (asked of its server, which takes a moment) and what the
  // weekly check found.
  const run = useLoaded<WebAppRunView>(address || app.mode.launched ? `${base}/run` : null);
  const down = run.data?.places.some((x) => x.kind === 'server' && x.place === env && x.up === false);
  const facts = useAppSessions(app);
  const carry = useContinue(app);
  const [ask, confirmNode] = useConfirm();
  const [keysAsk, setKeysAsk] = useState<KeysAsk | null>(null);
  const [mail, setMail] = useState(false);
  const [share, setShare] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [pointing, setPointing] = useState(false);
  const [pointed, setPointed] = useState<Pointed | null>(null);
  const [fixAt, setFixAt] = useState(() => readFixing(app.id));
  const box = useRef<HTMLTextAreaElement>(null);
  const closeKeys = useCallback(() => {
    setKeysAsk(null);
    keys.load();
  }, [keys]);

  // A check Hydor or the agent runs is seen as it goes.
  useEffect(() => {
    if (!checks.data?.running) return;
    const t = setInterval(() => void checks.reload(), 3000);
    return () => clearInterval(t);
  }, [checks]);

  const { state, strip, line, fixing, needs: needFacts, undo } = homeOf({ app, view: launch.data, checks: checks.data, checking: checks.running, guide: guide.data, steps: steps.data?.steps ?? [], keys: keys.data?.keys ?? [], session: { working: facts.working, waiting: !!facts.waiting }, fixAt, now: Date.now(), down, run: run.data });
  const act = async (what: () => Promise<unknown>) => {
    try {
      await what();
      await reload();
    } catch (e) {
      toastError(e);
    }
  };
  const goOnline = () => go(webAppPath(app.id, 'launch'));
  const needs: Need[] = needFacts.map((n) => ({
    ...n,
    go: () => {
      if (n.id === 'waiting') openSession(facts.waiting!);
      else if (n.id === 'fix') void carry(state.fix!);
      else if (n.id.startsWith('key:')) setKeysAsk({ env, skippable: env === 'hydor' });
      else if (n.id === 'models') void act(() => put(base, { settings: { tiers: app.ai!.asks } }));
      else if (n.id === 'mail') setMail(true);
      else if (n.id.startsWith('weekly:backup-'))
        void act(async () => {
          await post(`${base}/run/${enc(n.id.slice('weekly:backup-'.length))}/backups`, {});
          toast(tr('Copy made'), 'ok');
          run.reload();
        });
      else if (n.id.startsWith('weekly:')) void carry(`${tr('The weekly check of my app says:')} ${n.title}. ${tr('Please find out why and fix it.')}`);
      else goOnline();
    },
  }));

  const undoLast = async () => {
    if (!undo) return;
    const ok = await ask({
      title: tr('Undo the last change?'),
      body: (
        <div className="space-y-2 text-[13.5px] leading-snug">
          <p translate="no" className="rounded-lg bg-bg-2 px-3 py-2 text-fg">
            {undo.message}
          </p>
          <p>The app goes back to how it was before this. What people saved in it stays. You can undo this too.</p>
        </div>
      ),
      confirm: tr('Undo it'),
    });
    if (!ok) return;
    setUndoing(true);
    try {
      await post(`${base}/steps/${enc(undo.sha)}/back`);
      toast(tr('Undone'), 'ok');
      await Promise.all([steps.reload(), reload()]);
    } catch (e) {
      toastError(e);
    } finally {
      setUndoing(false);
    }
  };

  const tryResult = (id: string, result: 'works' | 'wrong', note?: string) => act(async () => void (await put(`${base}/guide/try`, { id, result, ...(note ? { note } : {}) })));
  const wrong = (id: string, what: string) => {
    const item = guide.data?.try.find((t) => t.id === id);
    const part = pointed ? plainPoint(pointed) : '';
    void tryResult(id, 'wrong', what);
    setPointed(null);
    void carry(`${tr(`I tried “${item?.text ?? ''}” and something is wrong.`)}\n${tr('What happened:')} ${what}${part ? `\n${part}` : ''}`);
  };
  const fix = () => {
    const at = Date.now();
    setFixAt(at);
    keepFixing(app.id, at);
    void carry(fixAllMessage(checks.data?.lines ?? []), true);
    toast(tr('The agent is on it'), 'ok');
  };
  const canShow = app.shape.ok && (app.build.exists || app.mode.runsAs === 'dev');

  return (
    <>
      <HomeView
        state={state}
        strip={strip}
        needs={needs}
        onOpen={canShow ? () => void openWebApp(app.id, undefined, 'preview') : undefined}
        preview={<Preview app={app} simple control={{ pointing, onPointed: setPointed }} onBuild={() => void post(`${base}/build`).then(() => reload(), toastError)} />}
        actions={{
          online: !!address,
          undo: undo ? { message: undo.message, isUndo: !!undo.back } : null,
          undoing,
          boxRef: box,
          onChange: (what) => void carry(what),
          onOnline: () => (address ? setShare(true) : goOnline()),
          onUndo: () => void undoLast(),
        }}
        tryIt={{
          items: guide.data?.try ?? [],
          onWorks: (id) => void tryResult(id, 'works'),
          onWrong: wrong,
          point: canShow ? { on: pointing, picked: pointed ? plainPoint(pointed) : '', toggle: () => (setPointing((p) => !p), pointing && setPointed(null)) } : undefined,
        }}
        checked={{ line, fixing, onFix: fix, onAgain: app.shape.ok ? () => void checks.run() : undefined }}
      />
      <KeysDialog app={app} ask={keysAsk} onClose={closeKeys} />
      <Dialog open={mail} onClose={() => setMail(false)} title={tr('Mail')} width={640}>
        <MailUse app={app} reload={reload} />
      </Dialog>
      <Dialog
        open={share}
        onClose={() => setShare(false)}
        title={tr('Share it')}
        width={460}
        footer={
          <>
            <Button variant="ghost" onClick={() => (setShare(false), goOnline())}>
              Change where it runs
            </Button>
            <Button variant="primary" icon={<Copy size={14} />} onClick={() => void navigator.clipboard?.writeText(address).then(() => toast(tr('Copied'), 'ok'), () => {})}>
              Copy the address
            </Button>
          </>
        }
      >
        <p className="text-[13.5px] leading-relaxed text-fg-2">Send this address to the people who should use it.</p>
        <a href={address} target="_blank" rel="noopener noreferrer" translate="no" className="mt-3 flex items-center gap-2 rounded-xl border border-line bg-bg-2 px-3 py-2.5 text-[15px] font-medium break-all text-accent hover:underline">
          {shortAddress(address)}
          <ExternalLink size={14} className="shrink-0" />
        </a>
      </Dialog>
      {confirmNode}
    </>
  );
}
