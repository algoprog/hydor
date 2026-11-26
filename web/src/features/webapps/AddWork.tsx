// "Add agents' work", on a web app's Overview: a starting recipe, or one of the agent apps that is free, linked to the web app through its
// flows folder. Ends on the app's Flows tab.
import { useEffect, useState } from 'react';
import { Bot } from 'lucide-react';
import type { FlowsOffer, WebApp } from '@shared/webapps';
import { tr } from '../../i18n/runtime';
import { api, enc, post } from '../../lib/api';
import { go } from '../../lib/nav';
import { toast, toastError } from '../../lib/store';
import { Button, cx, Dialog, Throbber } from '../../components/ui';
import { AppIcon } from '../apps/AppIcon';
import { Fold } from './Overview';
import { typeWord } from './join';
import { webAppPath } from './api';

function Part({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line py-3.5 first:border-t-0 first:pt-1">
      <h3 className="mb-2 text-[12px] font-semibold tracking-wide text-fg-3 uppercase">{title}</h3>
      {children}
    </section>
  );
}

export function AddWork({ app, open, onClose, onDone }: { app: WebApp; open: boolean; onClose: () => void; onDone: () => void }) {
  const [offer, setOffer] = useState<FlowsOffer | null>(null);
  const [problem, setProblem] = useState('');
  const [pick, setPick] = useState<string>('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setOffer(null);
    setProblem('');
    setPick('');
    api<FlowsOffer>(`/api/webapps/${enc(app.id)}/flows/offer`).then(
      (o) => {
        setOffer(o);
        setProblem(o.problem ?? '');
      },
      (e: unknown) => setProblem((e as Error).message),
    );
  }, [open, app.id]);
  const add = async () => {
    setBusy(true);
    try {
      const r = await post<{ flows: { app: { name: string } } }>(`/api/webapps/${enc(app.id)}/flows`, pick ? { app: pick } : {});
      toast(tr(`${r.flows.app.name} is the work of ${app.name} now`), 'ok');
      onDone();
      onClose();
      go(webAppPath(app.id, 'flows'), true);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const flow = pick ? offer?.apps.find((a) => a.id === pick)?.flows[0] : offer?.starting.flow;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={tr("Add agents' work")}
      width={540}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!offer || !!offer.problem || busy} onClick={() => void add()}>
            {tr("Add agents' work")}
          </Button>
        </>
      }
    >
      {!offer && !problem && (
        <div className="flex justify-center py-10 text-fg-3">
          <Throbber size={24} />
        </div>
      )}
      {problem && (
        <p translate="no" className="py-4 text-[13.5px] text-err">
          {problem}
        </p>
      )}
      {offer && !offer.problem && (
        <div data-add-work>
          <p className="pb-3 text-[13.5px] leading-snug text-fg-2">
            {tr('Hydor’s agents do work for this app, and its pages start it and follow it.')} {tr('The work keeps its steps, its address, its keys and its schedules.')}
          </p>
          <Part title={tr('Where the work comes from')}>
            <div role="radiogroup" className="space-y-1.5">
              {[{ id: '', name: offer.starting.name, description: tr('A small starting recipe: one question, one agent step, at most $0.50 a run.'), icon: 'bot', color: 'indigo' }, ...offer.apps].map((a) => (
                <button
                  key={a.id || 'starting'}
                  type="button"
                  role="radio"
                  aria-checked={pick === a.id}
                  onClick={() => setPick(a.id)}
                  className={cx('flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors', pick === a.id ? 'border-accent bg-accent/8' : 'border-line hover:bg-bg-2')}
                >
                  {a.id ? <AppIcon icon={a.icon} color={a.color} size={26} /> : <Bot size={22} className="text-fg-3" />}
                  <span className="min-w-0 flex-1">
                    <span translate={a.id ? 'no' : undefined} className="block truncate text-[14px] font-medium">
                      {a.id ? a.name : tr('A new one, from a starting recipe')}
                    </span>
                    <span translate={a.id ? 'no' : undefined} className="block truncate text-[12.5px] text-fg-3">
                      {a.description}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </Part>
          {flow && (
            <Part title={tr('What its pages will ask')}>
              <Fold label={tr(`${flow.form.length} questions and what it answers with`)}>
                <dl className="space-y-1 text-[13px]">
                  {flow.form.map((q) => (
                    <div key={q.id} className="flex items-baseline justify-between gap-4">
                      <dt translate="no" className="min-w-0 text-fg-2">
                        {q.label}
                      </dt>
                      <dd translate="no" className="min-w-0 text-right text-fg-3">
                        {typeWord(q.type)}
                      </dd>
                    </div>
                  ))}
                  {flow.answer.map((x) => (
                    <div key={`a-${x.id}`} className="contents">
                      <dt translate="no" className="text-fg-3">
                        → {x.label}
                      </dt>
                      <dd translate="no" className="min-w-0 text-right text-fg-3">
                        {typeWord(x.type)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </Fold>
            </Part>
          )}
          <p className="mt-1 text-[12.5px] leading-snug text-fg-3">{tr('The app’s pages start the work with a key of its own: ask the agent to add them.')}</p>
        </div>
      )}
    </Dialog>
  );
}
