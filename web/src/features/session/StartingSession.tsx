// A session's page while the session starts (lib/starting.ts): shown the moment you send from the start page as the
// session's own page shows a turn under way (its header, your message, the agent at work, the message box), nothing
// of its own in between, so it simply becomes the session once the server has started it. Should the session not
// start, it says why, and the start page has your message back.
import { useEffect } from 'react';
import { ArrowLeft, ArrowUp, ChevronRight, FileText, TriangleAlert } from 'lucide-react';
import { AgentIcon } from '../../components/AgentIcon';
import { Button, cx } from '../../components/ui';
import { basename, clockTime, tildify } from '../../lib/format';
import { go, sessionPath } from '../../lib/nav';
import { forget, useStarting } from '../../lib/starting';
import { useApp } from '../../lib/store';
import { NavButton } from '../layout/PageHeader';
import { isTouch, workingPlaceholder } from './Composer';
import { dayLabel, DayLine, LiveHead } from './Timeline';

export function StartingSession({ id }: { id: string }) {
  const st = useStarting((x) => x.byId[id]);
  const home = useApp((x) => x.boot?.home);
  // Started and ready: the session itself, in this page's place (Back goes to the start page). Unknown (the app
  // was reloaded while it started): the start page; the session, if it started, is in the list.
  useEffect(() => {
    if (!st) go('/', true);
    else if (st.ready && st.key) go(sessionPath(st.key), true);
  }, [st]);
  if (!st) return null;
  const failed = !!st.error;
  const pictures = st.atts.filter((a) => a.image && a.url);
  const files = st.atts.filter((a) => !(a.image && a.url));
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-line pt-[var(--safe-top)]">
        <div className="flex min-h-14 items-center gap-2 px-3 py-2 sm:px-5">
          <NavButton />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <AgentIcon agent={st.agent} name={st.acpName} size={16} />
              <span translate="no" className="min-w-0 truncate text-[15px] font-semibold tracking-tight">
                {st.title}
              </span>
            </div>
            <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[12.5px] text-fg-3">
              <span className={cx('inline-flex h-5.5 max-w-[60%] min-w-0 shrink-0 items-center gap-1.5 rounded-full bg-bg-2 px-2 text-[12px] font-medium', failed ? 'text-err' : 'text-busy')}>
                <span className={cx('h-1.5 w-1.5 shrink-0 rounded-full', failed ? 'bg-err' : 'breathe bg-busy')} />
                <span className="truncate">{failed ? 'Did not start' : 'Working'}</span>
              </span>
              {st.cwd && (
                <span translate="no" className="min-w-0 truncate" title={st.cwd}>
                  {tildify(st.cwd, home)}
                </span>
              )}
            </div>
          </div>
        </div>
      </header>
      <div className="relative min-h-0 flex-1">
        <div className="absolute inset-x-0 top-px bottom-px overflow-x-hidden overflow-y-auto [scrollbar-gutter:stable_both-edges]">
          <div className="mx-auto w-full max-w-[848px] space-y-8 px-3 pt-6 pb-10 sm:px-6">
            <DayLine day={dayLabel(st.at)} />
            <section className="space-y-2">
              <div className="group/u flex flex-col items-end gap-1.5">
                {pictures.length > 0 && (
                  <div className="flex flex-wrap justify-end gap-1.5">
                    {pictures.map((a) => (
                      <img key={a.id} src={a.url} alt="" className="h-24 max-w-[220px] rounded-xl border border-line object-cover" />
                    ))}
                  </div>
                )}
                {(st.text || files.length > 0) && (
                  <div className="max-w-full rounded-[20px] bg-bg-2 px-4 py-2.5">
                    {st.text && (
                      <div translate="no" className="max-h-[6lh] overflow-hidden text-[15px] leading-relaxed break-words whitespace-pre-wrap">
                        {st.text}
                      </div>
                    )}
                    {files.length > 0 && (
                      <div className={cx('flex flex-wrap gap-1.5', st.text && 'mt-2')}>
                        {files.map((a) => (
                          <span key={a.id} className="inline-flex max-w-full items-center gap-1.5 rounded-lg bg-bg-1 px-2 py-1 text-[12px] text-fg-2">
                            <FileText size={12} className="shrink-0" />
                            <span translate="no" className="truncate">
                              {a.path ? basename(a.path) : a.name}
                            </span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {/* Its time on hover, as the session shows it under your message (with "Edit from here"), in the same room. */}
                <div className="mt-1 mr-2 flex items-center gap-1.5 text-[11.5px] text-fg-3 opacity-0 transition-opacity group-hover/u:opacity-100">
                  <span>{clockTime(st.at)}</span>
                </div>
              </div>
              {failed ? (
                <div className="rounded-2xl border border-err/30 bg-err/8 px-4 py-3">
                  <div className="flex items-center gap-2 text-[13.5px] font-medium text-fg">
                    <TriangleAlert size={15} className="shrink-0 text-err" />
                    The session did not start
                  </div>
                  <div className="mt-1 text-[13px] leading-relaxed break-words text-fg-2">{st.error}</div>
                  <div className="mt-3">
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<ArrowLeft size={14} />}
                      onClick={() => {
                        forget(id);
                        go('/', true);
                      }}
                    >
                      Back to the start page
                    </Button>
                  </div>
                </div>
              ) : (
                // The agent at work, as the head of the session's turn shows it (Timeline.tsx). Its time shows once the
                // agent has the message: the session counts the turn from then.
                <div className="flex min-h-9 w-full items-center gap-2 rounded-xl px-2 text-[13.5px]">
                  <LiveHead agent={st.agent} name={st.acpName} live={{ status: 'working' }} />
                  <span className="ml-auto flex shrink-0 items-center gap-2.5 text-[12px] text-fg-3">
                    <ChevronRight size={15} className="rotate-90" />
                  </span>
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
      {/* The message box, as the session's own is while the agent works: it takes messages once the session has started. */}
      <div className="shrink-0 px-3 pb-[max(10px,var(--safe-bottom))] sm:px-6 sm:pb-5">
        <div className="mx-auto max-w-[800px]">
          <div className="relative rounded-[22px] border border-line-2 bg-panel shadow-[0_8px_30px_rgba(0,0,0,0.10)]">
            <textarea
              disabled
              rows={1}
              aria-label="Message"
              placeholder={failed ? 'The session did not start' : workingPlaceholder(isTouch())}
              className="block min-h-[48px] w-full resize-none bg-transparent px-5 pt-3.5 pb-1 text-[15px] leading-relaxed outline-none placeholder:text-fg-3 disabled:cursor-not-allowed"
            />
            <div className="flex items-center gap-1 px-2.5 pt-0.5 pb-2.5">
              <span className="flex-1" />
              <span className="ml-1 inline-flex h-9 w-9 items-center justify-center rounded-full bg-bg-3 text-fg-3" aria-hidden>
                <ArrowUp size={16} strokeWidth={2.4} />
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
