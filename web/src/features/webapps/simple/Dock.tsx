// Above the message box of a conversation about a web app: the progress strip, what the conversation has cost when Hydor
// knows it, and, once there is something to say, the one line of the checks (with Fix them) and how far Try it is.
import { useEffect, useMemo, useState } from 'react';
import type { SessionSummary } from '@shared/types';
import type { WebAppDetail, WebAppGuide, WebAppSteps } from '@shared/webapps';
import { enc, post } from '../../../lib/api';
import { go } from '../../../lib/nav';
import { toastError, useTimeline } from '../../../lib/store';
import { busy, useLoaded, webAppPath } from '../api';
import { useChecks } from '../Checks';
import { latestWebApp } from '../side.ts';
import { DockView } from './DockView';
import { checkedLine, fixAllMessage, stripOf } from './plain';

function DockFor({ s, id }: { s: SessionSummary; id: string }) {
  const app = useLoaded<{ app: WebAppDetail }>(`/api/webapps/${enc(id)}`);
  const guide = useLoaded<WebAppGuide>(`/api/webapps/${enc(id)}/guide`);
  const steps = useLoaded<WebAppSteps>(`/api/webapps/${enc(id)}/steps?limit=1`);
  const checks = useChecks(id);
  const [fixAt, setFixAt] = useState(0);
  const a = app.data?.app;
  const going = (!!a && busy(a)) || !!checks.data?.running;
  useEffect(() => {
    if (!going) return;
    const t = setInterval(() => void Promise.all([app.reload(), checks.reload()]), 3000);
    return () => clearInterval(t);
  }, [going, app, checks]);
  if (!a) return null;
  const waiting = (s.live?.pendingApprovals ?? 0) > 0;
  const working = s.live?.status === 'working' || s.live?.status === 'starting';
  const strip = stripOf({
    stage: a.stage,
    decisions: a.decisions,
    working,
    waiting,
    doing: guide.data?.doing?.text,
    last: steps.data?.steps[0]?.message,
    online: a.mode.launched || !!a.mode.servers?.length,
    checking: checks.running,
  });
  const line = checkedLine(checks.data, checks.running);
  // The checks and the things to try are said once there is something to try.
  const built = strip.at >= 3;
  const items = built ? (guide.data?.try ?? []) : [];
  return (
    <DockView
      strip={strip}
      cost={s.stats?.costUsd}
      line={built && (line.state === 'ok' || line.state === 'fix') ? line : null}
      fixing={!!fixAt && (!checks.data?.at || checks.data.at < fixAt)}
      onFix={() => {
        setFixAt(Date.now());
        void post(`/api/sessions/${enc(s.key)}/message`, { text: fixAllMessage(checks.data?.lines ?? []) }).catch(toastError);
      }}
      tried={items.length ? { done: items.filter((i) => i.result === 'works' && !i.again).length, of: items.length } : null}
      onApp={() => go(webAppPath(id))}
    />
  );
}

export function WebDock({ s }: { s: SessionSummary }) {
  const items = useTimeline((x) => x.byKey[s.key]?.items);
  const latest = useMemo(() => latestWebApp(items), [items]);
  const id = s.extra?.webKind?.app ?? latest?.app;
  return id && !s.subagentOf ? <DockFor key={id} s={s} id={id} /> : null;
}
