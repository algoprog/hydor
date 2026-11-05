// Tools → Check before submitting, in the LaTeX editor: pick where the paper goes (its rules said in a line, with a
// link to the venue's call, as venues change them each year; Other has a page limit and anonymity of its own), and
// Check typesets it, reads its PDF and looks its references up online, showing what it finds as it comes. Findings
// are grouped (References, Anonymity, Format, Required parts, Numbers), each with how serious it is, Show (to its
// line), and Fix where a change is safe (a reference's entry as listed online, the bold moved to the best value, a
// table of Experiments' updated, the template made anonymous…) or else Ask the agent. Add as comments puts the open
// ones on their words as the document's comments (and resolves those the check no longer finds); checking again says
// what is fixed since. The venue is remembered for the document, and what was found stays while the editor is open.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Code2, ExternalLink, LocateFixed, MessageSquarePlus, Sparkles, Wrench } from 'lucide-react';
import { TEX_MAIN, type TexComment, type TexDoc } from '@shared/latex';
import { newCommentId } from '@shared/comments';
import { CHECK_GROUPS, LEVEL_LABEL, VENUES, venueSummary, venueWith, type CheckEdit, type CheckFinding, type CheckLevel, type CheckState, type OtherRules } from '@shared/latex-submit';
import { Button, cx, Dialog, inputCls, Switch, Throbber } from '../../../components/ui';
import { tr } from '../../../i18n/runtime';
import { toast, toastError } from '../../../lib/store';
import { checkState, lastFound, rememberFound, rememberVenue, startCheck, stopCheck, venueFor } from './paper';

/** How a comment the check wrote begins (so checking again finds its own). */
const PREFIX = 'Check before submitting: ';
const ORDER: Record<CheckLevel, number> = { must: 0, check: 1, info: 2 };
const DOT: Record<CheckLevel, string> = { must: 'bg-err', check: 'bg-warn', info: 'bg-fg-3/60' };

const textIn = (d: TexDoc, name: string) => (name === TEX_MAIN ? d.main : (d.files.find((f) => f.name === name)?.text ?? null));

/** The venues, by their groups, in a list to pick from (a phone's own picker on a phone). */
export function VenueSelect({
  label,
  value,
  onChange,
  disabled,
  without,
  extra = [],
}: {
  label: string;
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  without?: string[];
  /** More to pick from, after the venues (other templates). */
  extra?: { id: string; label: string; group: string }[];
}) {
  const list = [...VENUES.filter((x) => !without?.includes(x.id)), ...extra];
  return (
    <label className="flex flex-wrap items-center gap-2 text-[13px] text-fg-2">
      <span className="shrink-0">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} className={cx(inputCls, 'h-9 min-w-0 flex-1 text-[13.5px] sm:max-w-sm')}>
        {[...new Set(list.map((x) => x.group))].map((g) => (
          <optgroup key={g} label={g}>
            {list
              .filter((x) => x.group === g)
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}
const commentText = (f: CheckFinding) => `${PREFIX}${f.title}.${f.detail ? ` ${f.detail}` : ''}`.slice(0, 3900);

export function CheckDialog({
  open,
  onClose,
  doc,
  docKey,
  page,
  folder,
  base,
  label,
  readOnly,
  canComment,
  onShow,
  onFix,
  onAsk,
  onComments,
  onShowComments,
}: {
  open: boolean;
  onClose: () => void;
  /** The document as it is in the editor (saved or not). */
  doc: TexDoc;
  /** What the venue and the last check are remembered by. */
  docKey: string;
  page?: string;
  folder?: string;
  base?: string;
  label: (file: string) => string;
  readOnly?: boolean;
  canComment: boolean;
  onShow: (file: string, line: number) => void;
  /** Makes a fix's changes in the editor (so Undo takes them back): false when the text changed since. */
  onFix: (edits: CheckEdit[]) => boolean;
  onAsk?: (text: string) => void;
  onComments: (f: (cs: TexComment[]) => TexComment[]) => void;
  onShowComments: () => void;
}) {
  const [venue, setVenue] = useState(() => venueFor(docKey, doc.main));
  const [state, setState] = useState<CheckState | null>(null);
  const [since, setSince] = useState<{ fixed: number; left: number; added: number } | null>(null);
  const [fixed, setFixed] = useState<Set<string>>(new Set());
  const [shown, setShown] = useState<string | null>(null);
  const running = !!state && !state.done;
  const job = useRef<string | null>(null);
  const v = venueWith(venue.venue, venue.other);

  // A check followed as it goes; stopped when the editor goes.
  useEffect(() => {
    const id = state && !state.done ? state.id : null;
    if (!id) return;
    let alive = true;
    const t = setInterval(() => {
      checkState(id).then(
        (s) => {
          if (!alive || job.current !== id) return;
          setState(s);
          if (s.done) {
            const now = s.findings.filter((f) => f.level !== 'info').map((f) => f.id);
            const before = lastFound(docKey);
            if (before) setSince({ fixed: before.filter((x) => !now.includes(x)).length, left: now.filter((x) => before.includes(x)).length, added: now.filter((x) => !before.includes(x)).length });
            rememberFound(docKey, now);
          }
        },
        (e) => {
          if (!alive) return;
          setState((x) => (x ? { ...x, done: true, error: (e as Error).message } : x));
        },
      );
    }, 700);
    return () => {
      alive = false;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.id, running]);
  useEffect(
    () => () => {
      if (job.current) void stopCheck(job.current);
    },
    [],
  );

  const run = async () => {
    rememberVenue(docKey, venue.venue, venue.other);
    setSince(null);
    setFixed(new Set());
    setShown(null);
    try {
      const s = await startCheck({ model: doc, venue: venue.venue, other: venue.other, page, folder, base });
      job.current = s.id;
      setState(s);
    } catch (e) {
      toastError(e);
    }
  };
  const stop = () => {
    if (job.current) void stopCheck(job.current);
    setState((x) => (x ? { ...x, done: true } : x));
  };

  const findings = state?.findings ?? [];
  const counts = { must: 0, check: 0, info: 0 };
  for (const f of findings) counts[f.level]++;
  const open_ = findings.filter((f) => f.level !== 'info' && !fixed.has(f.id));

  const fix = (f: CheckFinding) => {
    if (!f.fix) return;
    if (onFix(f.fix.edits)) {
      setFixed((s) => new Set(s).add(f.id));
      toast(`${f.fix.label}: done (not saved yet)`, 'ok');
    } else toast('The text there changed since the check: check again', 'error');
  };
  const show = (f: CheckFinding) => {
    if (!f.file || !f.line) return;
    onClose();
    onShow(f.file, f.line);
  };
  const ask = (text: string) => {
    if (!onAsk) return;
    onClose();
    onAsk(`${text} `);
  };
  const askAll = () => {
    const list = open_.filter((f) => !f.fix && f.ask);
    if (!list.length) return;
    ask(`Fix what the pre-submission check found in this LaTeX paper (for ${v.id === 'other' ? 'its venue' : v.label}):\n${list.map((f, i) => `${i + 1}. ${f.ask}`).join('\n')}\n`);
  };

  /** The open findings on their words, as comments; the check's own comments it no longer finds, resolved. */
  const addComments = () => {
    const now = Date.now();
    const wanted = open_.filter((f) => f.file);
    let added = 0;
    let missed = 0;
    let resolved = 0;
    onComments((cs) => {
      const mine = new Set(cs.filter((c) => !c.resolved && c.text.startsWith(PREFIX)).map((c) => c.text));
      const fresh: TexComment[] = [];
      for (const f of wanted) {
        const text = commentText(f);
        if (mine.has(text)) continue;
        const body = textIn(doc, f.file!);
        if (body === null) {
          missed++;
          continue;
        }
        // The words it is on, where they are now (the nearest to where they were).
        const quote = (f.quote ?? '').slice(0, 300);
        let at = quote ? (body.slice(f.from ?? 0, (f.from ?? 0) + quote.length) === quote ? (f.from ?? 0) : -1) : (f.from ?? 0);
        if (at < 0 && quote) for (let i = body.indexOf(quote); i >= 0; i = body.indexOf(quote, i + 1)) if (at < 0 || Math.abs(i - (f.from ?? 0)) < Math.abs(at - (f.from ?? 0))) at = i;
        if (at < 0) {
          missed++;
          continue;
        }
        // On the words themselves, without the spaces around them.
        const lead = quote.length - quote.trimStart().length;
        const words = quote.trim();
        fresh.push({ id: newCommentId(), by: 'user', text, at: now, quote: words || undefined, file: f.file!, from: at + lead, to: at + lead + words.length });
      }
      added = fresh.length;
      const still = new Set(wanted.map(commentText));
      const next = cs.map((c) => {
        if (c.resolved || !c.text.startsWith(PREFIX) || still.has(c.text)) return c;
        resolved++;
        return { ...c, resolved: true, replies: [...(c.replies ?? []), { id: newCommentId(), by: 'user' as const, text: 'Fixed: the check no longer finds this.', at: now }] };
      });
      return [...next, ...fresh];
    });
    onShowComments();
    onClose();
    const parts = [added ? tr(`Added ${added} comment${added === 1 ? '' : 's'}`) : tr('No new comments'), resolved ? tr(`resolved ${resolved} the check no longer finds`) : ''].filter(Boolean);
    toast(`${parts.join(', ')}${missed ? tr(` (${missed} could not be placed: their words changed)`) : ''}`, 'ok');
  };

  const groups = useMemo(
    () =>
      CHECK_GROUPS.map((g) => ({ ...g, list: findings.filter((f) => f.group === g.id).sort((a, b) => ORDER[a.level] - ORDER[b.level]) })).filter((g) => g.list.length),
    [findings],
  );

  const setOther = (o: OtherRules) => setVenue((x) => ({ ...x, other: { ...x.other, ...o } }));

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Check before submitting"
      width={760}
      footer={
        <>
          {running ? (
            <Button variant="ghost" onClick={stop}>
              Stop
            </Button>
          ) : (
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
          )}
          <Button variant="primary" onClick={() => void run()} disabled={running}>
            {running ? <Throbber className="h-4 w-4" /> : null}
            {running ? 'Checking' : state ? 'Check again' : 'Check'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="space-y-1.5">
          <VenueSelect label="Where it goes" value={venue.venue} onChange={(id) => setVenue({ venue: id })} disabled={running} />
          {v.id === 'other' && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-fg-2">
              <label className="flex items-center gap-2">
                Pages allowed before the references
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={venue.other?.pages ?? ''}
                  onChange={(e) => setOther({ pages: e.target.value ? Number(e.target.value) : undefined })}
                  placeholder="None"
                  className={cx(inputCls, 'h-8 w-20 text-[13px]')}
                />
              </label>
              <label className="flex items-center gap-2">
                <Switch label="Reviewed anonymously" on={!!venue.other?.anonymous} onChange={(on) => setOther({ anonymous: on })} />
                Reviewed anonymously
              </label>
            </div>
          )}
          <p className="text-[12.5px] leading-relaxed text-fg-3">
            {venueSummary(v)}.{v.note ? ` ${v.note}` : ''}{' '}
            {v.call && (
              <>
                Venues change their rules each year:{' '}
                <a href={v.call} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-accent hover:underline">
                  check the call for papers
                  <ExternalLink size={11} />
                </a>
                .
              </>
            )}
          </p>
        </div>

        {!state && (
          <p className="rounded-xl bg-bg-2 px-3 py-2.5 text-[12.5px] leading-relaxed text-fg-2">
            It typesets the paper, reads its PDF, and looks its references up in Crossref, arXiv, OpenAlex, Semantic Scholar and DBLP (only their titles, DOIs and ids are sent). Nothing in the paper
            changes unless you press Fix.
          </p>
        )}

        {state && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-line pt-3 text-[13px]">
            <span className="flex min-w-0 flex-1 items-center gap-2 text-fg-2">
              {running ? (
                <>
                  <Throbber className="h-4 w-4 shrink-0" />
                  <span className="truncate">
                    {state.stage ?? 'Checking'}
                    {state.online && state.stage?.includes('online') ? ` · ${state.online.done} of ${state.online.of}` : ''}
                  </span>
                </>
              ) : state.error ? (
                <span className="text-err">{state.error}</span>
              ) : (
                <span>
                  {[
                    findings.length ? '' : tr('It found nothing to fix'),
                    counts.must && tr(`${counts.must} to fix`),
                    counts.check && tr(`${counts.check} to check`),
                    counts.info && tr(`${counts.info} for your information`),
                    state.pages &&
                      (state.pages.limit !== undefined && state.pages.counted !== undefined
                        ? tr(`${state.pages.counted} of ${state.pages.limit} pages`)
                        : tr(`${state.pages.total} page${state.pages.total === 1 ? '' : 's'}`)),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              )}
            </span>
            {!running && open_.length > 0 && (
              <span className="flex shrink-0 items-center gap-1">
                {canComment && !readOnly && (
                  <Button size="sm" variant="ghost" icon={<MessageSquarePlus size={14} />} onClick={addComments}>
                    Add as comments
                  </Button>
                )}
                {!!onAsk && !readOnly && open_.some((f) => !f.fix && f.ask) && (
                  <Button size="sm" variant="ghost" icon={<Sparkles size={14} className="text-accent" />} onClick={askAll}>
                    Ask the agent to fix them
                  </Button>
                )}
              </span>
            )}
          </div>
        )}
        {since && !running && (
          <p className="text-[12.5px] text-fg-3">
            Since the last check: {since.fixed} fixed, {since.left} left, {since.added} new.
          </p>
        )}

        {groups.map((g) => (
          <section key={g.id}>
            <h3 className="mb-1 px-0.5 text-[12px] font-medium text-fg-3">
              {g.label} <span className="font-normal tabular-nums">· {g.list.length}</span>
            </h3>
            <ul className="divide-y divide-line rounded-xl border border-line">
              {g.list.map((f) => {
                const done = fixed.has(f.id);
                return (
                  <li key={f.id} className={cx('px-3 py-2.5', done && 'opacity-60')}>
                    <div className="flex items-start gap-2.5">
                      <span className={cx('mt-[7px] h-2 w-2 shrink-0 rounded-full', DOT[f.level])} />
                      <div className="min-w-0 flex-1">
                        <div className="text-[13.5px] leading-snug font-medium text-fg">{f.title}</div>
                        {f.detail && <div className="mt-0.5 text-[12.5px] leading-relaxed text-fg-3">{f.detail}</div>}
                        <div className="mt-1.5 flex flex-wrap items-center gap-1">
                          <span className="mr-1 text-[11.5px] text-fg-3">{LEVEL_LABEL[f.level]}</span>
                          {f.file && f.line ? (
                            <Button size="sm" variant="ghost" icon={<LocateFixed size={13} />} className="h-7 px-2 text-[12px]" onClick={() => show(f)}>
                              <span translate="no" className="font-mono text-[11.5px]">
                                {label(f.file)}:{f.line}
                              </span>
                            </Button>
                          ) : null}
                          {f.fix?.shows && (
                            <Button size="sm" variant="ghost" icon={<Code2 size={13} />} className="h-7 px-2 text-[12px]" aria-pressed={shown === f.id} onClick={() => setShown(shown === f.id ? null : f.id)}>
                              {shown === f.id ? 'Hide the entry' : 'The entry'}
                            </Button>
                          )}
                          {f.fix && !readOnly && (
                            <Button size="sm" variant="secondary" icon={<Wrench size={13} />} className="h-7 px-2 text-[12px]" disabled={done} onClick={() => fix(f)}>
                              {done ? 'Done' : f.fix.label}
                            </Button>
                          )}
                          {!f.fix && f.ask && !!onAsk && !readOnly && (
                            <Button size="sm" variant="ghost" icon={<Sparkles size={13} className="text-accent" />} className="h-7 px-2 text-[12px]" onClick={() => ask(f.ask!)}>
                              Ask the agent
                            </Button>
                          )}
                        </div>
                        {shown === f.id && f.fix?.shows && (
                          <pre translate="no" className="mt-2 overflow-x-auto rounded-lg bg-bg-2 px-3 py-2 font-mono text-[11.5px] leading-relaxed text-fg-2">
                            {f.fix.shows}
                          </pre>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

        {state && state.notes.length > 0 && !running && (
          <p className="text-[12px] leading-relaxed text-fg-3">
            <span className="font-medium text-fg-2">Not checked: </span>
            {state.notes.join(' ')}
          </p>
        )}
      </div>
    </Dialog>
  );
}
