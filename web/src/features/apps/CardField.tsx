// A card in an app's answer (an answer field of type "ui"): drawn by its answer UI, as a card in a reply is
// (components/answer), with what a card in a chat has on it: its data, Copy as text, Full screen, Pin to a board (to
// the run it came from) and the card as a picture. The cards' views and their catalog load the first time one shows.
import { lazy, Suspense, useMemo } from 'react';
import type { CardSource } from '@shared/boards';
import { MdCtx, type MdInfo } from '../../components/Markdown';

const AnswerBlock = lazy(() => import('../../components/answer/AnswerUi').then((m) => ({ default: m.AnswerBlock })));

/**
 * `from`: the run it is pinned from (its session is where the card's own buttons and kept ticks belong); `publicView`:
 * an app's public page, where nothing is pinned or kept; `demo`: a made-up answer (the builder's preview).
 */
export function CardField({ ui, data, from, publicView, demo }: { ui: string; data: unknown; from?: CardSource; publicView?: boolean; demo?: boolean }) {
  const code = useMemo(() => JSON.stringify(data && typeof data === 'object' ? data : {}), [data]);
  const md = useMemo<MdInfo>(() => ({ src: '', streaming: false, rich: true, sessionKey: publicView ? undefined : from?.session, pinFrom: from }), [from, publicView]);
  return (
    <div className="md [&>.aui]:my-0 [&>.aui-wait]:my-0">
      <MdCtx.Provider value={md}>
        <Suspense fallback={<div className="aui-wait my-3" />}>
          <AnswerBlock name={ui} code={code} done demo={demo || publicView} noPin={publicView || demo} />
        </Suspense>
      </MdCtx.Provider>
    </div>
  );
}
