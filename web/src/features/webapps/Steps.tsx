// An app's steps (each a saved state of its folder): the last few with how long ago and "Back to before this", the rest folded under
// "Show all", what is not in a step yet with a way to save it as one, and going back (which asks first, saying what happens).
import { useState, type ReactNode } from 'react';
import { FileDiff, History, RotateCcw } from 'lucide-react';
import type { WebApp, WebAppDetail, WebAppStep, WebAppSteps } from '@shared/webapps';
import { tr } from '../../i18n/runtime';
import { enc, post } from '../../lib/api';
import { toast, toastError, useUI } from '../../lib/store';
import { Button, Dialog, inputCls, Section, Throbber, useConfirm } from '../../components/ui';
import { useLoaded } from './api';
import { filesText, goBackSentences, listComplete } from './map';
import { ago } from './time';

/** The steps shown at first; the rest are behind "Show all". */
export const FIRST_STEPS = 6;
/** How many "Show all" asks for. */
const ALL_STEPS = 200;

/** The app's steps, newest first: `limit` of them, one more is asked for to know whether there are others. */
export const useSteps = (id: string, limit: number) => useLoaded<WebAppSteps>(`/api/webapps/${enc(id)}/steps?limit=${limit + 1}`);

/** The steps as a list. `oldest`: the last one is the app's first step, which cannot be gone back from. */
/** With Technical details on: the commit a step is, and its changes on demand. */
function StepDiff({ app, step }: { app: string; step: WebAppStep }) {
  const [open, setOpen] = useState(false);
  const diff = useLoaded<{ diff: string; cut: boolean }>(open ? `/api/webapps/${enc(app)}/steps/${enc(step.sha)}/diff` : null);
  return (
    <>
      <Button size="sm" variant="ghost" aria-expanded={open} icon={<FileDiff size={13} />} onClick={() => setOpen((o) => !o)}>
        <code translate="no" className="text-[12px]">
          {step.sha.slice(0, 8)}
        </code>
      </Button>
      {open && (
        <pre translate="no" className="order-last max-h-96 w-full overflow-auto rounded-lg bg-bg-2 px-3 py-2 font-mono text-[11.5px] leading-snug text-fg-2" data-step-diff>
          {diff.data ? `${diff.data.diff.trim() || '(no change to its files)'}${diff.data.cut ? '\n…' : ''}` : (diff.error ?? '…')}
        </pre>
      )}
    </>
  );
}

/** `app`: the app's id, given to show each step as the commit it is, with its changes. */
export function StepList({ steps, oldest, onBack, working, app }: { steps: WebAppStep[]; oldest: boolean; onBack: (s: WebAppStep) => void; working: string | null; app?: string }) {
  return (
    <ul className="divide-y divide-line">
      {steps.map((s, i) => (
        <li key={s.sha} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5 first:pt-0 last:pb-0">
          <div className="min-w-0 flex-1 max-sm:basis-full">
            <div translate="no" className="text-[13.5px] leading-snug break-words">
              {s.message}
            </div>
            <div className="mt-0.5 text-[12.5px] text-fg-3">
              <span className="tnum">{ago(s.at)}</span>
              {s.files > 0 && <span className="tnum">{` · ${filesText(s.files)}`}</span>}
            </div>
          </div>
          {app && <StepDiff app={app} step={s} />}
          {!(oldest && i === steps.length - 1) && (
            <Button size="sm" variant="ghost" icon={working === s.sha ? <Throbber size={12} /> : <RotateCcw size={13} />} disabled={working !== null} onClick={() => onBack(s)}>
              Back to before this
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * Going back to before a step: asks first (the files, the steps that stay, the rebuild, and what is saved first), then does it and
 * lets the page read again. `node` goes in the page.
 */
export function useGoBack(app: Pick<WebApp, 'id'>, unsaved: number, after: () => Promise<void> | void): { back: (s: WebAppStep) => void; working: string | null; node: ReactNode } {
  const [ask, node] = useConfirm();
  const [working, setWorking] = useState<string | null>(null);
  const back = (s: WebAppStep) => {
    void (async () => {
      const ok = await ask({
        title: tr('Go back to before this step?'),
        body: (
          <div className="space-y-2.5">
            <p translate="no" className="rounded-lg bg-bg-2 px-3 py-2 text-[13.5px] text-fg break-words">
              {s.message}
            </p>
            <ul className="list-disc space-y-1.5 pl-5">
              {goBackSentences(unsaved).map((t) => (
                <li key={t}>{tr(t)}</li>
              ))}
            </ul>
          </div>
        ),
        confirm: tr('Go back'),
      });
      if (!ok) return;
      setWorking(s.sha);
      try {
        await post<{ app: WebAppDetail }>(`/api/webapps/${enc(app.id)}/steps/${enc(s.sha)}/back`);
        toast(tr('Went back to before that step'), 'ok');
      } catch (e) {
        toastError(e);
      } finally {
        setWorking(null);
        await after();
      }
    })();
  };
  return { back, working, node };
}

/** What was changed by hand, saved as a step: a small dialog for the words that go with it. */
export function SaveStepDialog({ app, open, onClose, onDone }: { app: Pick<WebApp, 'id'>; open: boolean; onClose: () => void; onDone: () => void }) {
  const [message, setMessage] = useState('Changes made by hand');
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!message.trim() || saving) return;
    setSaving(true);
    try {
      await post(`/api/webapps/${enc(app.id)}/steps`, { message: message.trim() });
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
      title="Save as a step"
      width={420}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!message.trim() || saving} onClick={() => void save()}>
            Save
          </Button>
        </>
      }
    >
      <input
        className={inputCls}
        translate="no"
        aria-label="What changed"
        value={message}
        maxLength={200}
        autoFocus
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && void save()}
      />
    </Dialog>
  );
}

/** "What changed": the last steps, what is not saved yet, and the rest under "Show all". */
export function StepsSection({ app, reload }: { app: Pick<WebApp, 'id'>; reload: () => Promise<void> }) {
  const technical = useUI((s) => s.technicalDetails);
  const [all, setAll] = useState(false);
  const [saving, setSaving] = useState(false);
  const limit = all ? ALL_STEPS : FIRST_STEPS;
  const { data, error, reload: again } = useSteps(app.id, limit);
  const refresh = async () => {
    await Promise.all([again(), reload()]);
  };
  const { back, working, node } = useGoBack(app, data?.unsaved ?? 0, refresh);
  if (!data) return error ? <p translate="no" className="text-[13px] text-fg-3">{error}</p> : null;
  if (!data.repo)
    return (
      <p className="flex items-center gap-2 text-[13px] text-fg-3">
        <History size={14} aria-hidden className="shrink-0" />
        Steps are not kept for this app: its folder is not a repository.
      </p>
    );
  const shown = data.steps.slice(0, limit);
  const more = data.steps.length > limit;
  const oldest = listComplete(data.steps, limit + 1);
  return (
    <>
      <Section title="What changed">
        {data.unsaved > 0 && (
          <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-warn/10 px-3 py-2.5 ${shown.length ? 'mb-3' : ''}`}>
            <span className="min-w-0 flex-1 text-[13.5px] max-sm:basis-full">{tr(`${data.unsaved} ${data.unsaved === 1 ? 'file' : 'files'} changed since the last step`)}</span>
            <Button size="sm" variant="secondary" onClick={() => setSaving(true)}>
              Save as a step
            </Button>
          </div>
        )}
        {shown.length === 0 ? <p className="text-[13.5px] text-fg-3">No steps yet.</p> : <StepList steps={shown} oldest={oldest} onBack={back} working={working} app={technical ? app.id : undefined} />}
        {!all && more && (
          <div className="mt-2.5">
            <Button size="sm" variant="ghost" onClick={() => setAll(true)}>
              Show all
            </Button>
          </div>
        )}
      </Section>
      <SaveStepDialog app={app} open={saving} onClose={() => setSaving(false)} onDone={() => void refresh()} />
      {node}
    </>
  );
}
