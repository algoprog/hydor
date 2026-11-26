// Beside the conversation with Technical details off: the app, and under it the things to try, with pointing at a part.
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { WebApp, WebAppGuide } from '@shared/webapps';
import { tr } from '../../../i18n/runtime';
import { enc, post, put } from '../../../lib/api';
import { toastError } from '../../../lib/store';
import { cx } from '../../../components/ui';
import { useLoaded } from '../api';
import type { Pointed } from '../point';
import { Preview } from '../Preview';
import { TryView } from './HomeView';
import { plainPoint } from './plain';

export function SideTry({ app, session, onBuild }: { app: WebApp; session: string; onBuild: () => void }) {
  const guide = useLoaded<WebAppGuide>(`/api/webapps/${enc(app.id)}/guide`);
  const [open, setOpen] = useState(true);
  const [pointing, setPointing] = useState(false);
  const [pointed, setPointed] = useState<Pointed | null>(null);
  const [streamed, setStreamed] = useState(false);
  const items = guide.data?.try ?? [];
  const keep = (id: string, result: 'works' | 'wrong', note?: string) => void put(`/api/webapps/${enc(app.id)}/guide/try`, { id, result, ...(note ? { note } : {}) }).then(() => guide.reload(), toastError);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1">
        <Preview app={app} simple control={{ pointing, onPointed: setPointed, onStreamed: setStreamed }} onBuild={onBuild} />
      </div>
      {items.length > 0 && (
        <div className="flex max-h-[45%] shrink-0 flex-col border-t border-line">
          <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex min-h-9 items-center gap-1.5 px-3 text-left text-[13px] font-medium">
            <ChevronDown size={14} className={cx('text-fg-3 transition-transform', !open && '-rotate-90')} />
            Try it
          </button>
          {open && (
            <div className="min-h-0 overflow-y-auto px-3 pb-3">
              <TryView
                items={items}
                onWorks={(id) => keep(id, 'works')}
                onWrong={(id, what) => {
                  const item = items.find((t) => t.id === id);
                  const part = pointed ? plainPoint(pointed) : '';
                  keep(id, 'wrong', what);
                  setPointed(null);
                  void post(`/api/sessions/${enc(session)}/message`, { text: `${tr(`I tried “${item?.text ?? ''}” and something is wrong.`)}\n${tr('What happened:')} ${what}${part ? `\n${part}` : ''}` }).catch(toastError);
                }}
                point={streamed ? undefined : { on: pointing, picked: pointed ? plainPoint(pointed) : '', toggle: () => (setPointing((p) => !p), pointing && setPointed(null)) }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
