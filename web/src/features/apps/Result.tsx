// A run as its person sees it: where it stands (with the latest steps while it works), the structured
// result (short fields as a card, long text, lists, and tables that scroll sideways on a phone), and
// the agent's own reply. The owner's pages and the public page show the same.
import { useEffect, useState, type ReactNode } from 'react';
import { Check, ChevronRight, CircleAlert, Clock, Copy, Download, Hand, Square } from 'lucide-react';
import type { AnswerField, AppRun, RunProgress } from '@shared/apps';
import { cellText, isActive, toCsv } from '@shared/apps';
import { duration } from '../../lib/format';
import { Markdown } from '../../components/Markdown';
import { cx, Throbber } from '../../components/ui';
import { money } from './api';

const humanize = (k: string) => (k.charAt(0).toUpperCase() + k.slice(1)).replace(/_/g, ' ');

function Value({ v, type }: { v: unknown; type?: string }) {
  if (v === null || v === undefined || v === '') return <span className="text-fg-3">—</span>;
  if (typeof v === 'boolean') return <span className={cx('inline-flex h-5 items-center rounded px-1.5 text-[12px] font-medium', v ? 'bg-ok/15 text-ok' : 'bg-bg-3 text-fg-2')}>{v ? 'Yes' : 'No'}</span>;
  if (type === 'url' || (typeof v === 'string' && /^https?:\/\/\S+$/.test(v))) {
    const s = String(v);
    let host = s;
    try {
      host = new URL(s).hostname.replace(/^www\./, '');
    } catch {}
    return (
      <a href={s} target="_blank" rel="noopener noreferrer" className="break-all text-accent hover:underline">
        {host}
      </a>
    );
  }
  if (type === 'date' && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const d = new Date(`${v}T12:00:00`);
    return <span>{d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>;
  }
  if (typeof v === 'number') return <span className="tnum">{v.toLocaleString()}</span>;
  return <span className="whitespace-pre-wrap">{cellText(v)}</span>;
}

function copyText(text: string) {
  navigator.clipboard?.writeText(text).catch(() => {});
}

function download(name: string, text: string, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function SmallButton({ icon, children, onClick }: { icon: ReactNode; children: ReactNode; onClick: () => void }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        onClick();
        setDone(true);
        setTimeout(() => setDone(false), 1400);
      }}
      className="inline-flex h-7 items-center gap-1.5 rounded-lg px-2 text-[12px] text-fg-3 transition-colors hover:bg-bg-2 hover:text-fg"
    >
      {done ? <Check size={13} /> : icon}
      {children}
    </button>
  );
}

export function ResultTable({ f, rows }: { f: AnswerField; rows: Record<string, unknown>[] }) {
  const cols = f.columns?.length ? f.columns : Object.keys(rows[0] ?? {}).map((id) => ({ id, label: humanize(id), type: 'text' as const }));
  if (!rows.length) return <div className="text-[13px] text-fg-3">Nothing here.</div>;
  return (
    <div className="-mx-1 overflow-x-auto px-1 pb-1">
      <table className="w-full min-w-[520px] border-separate border-spacing-0 text-[13px]">
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c.id} className="border-b border-line px-2.5 py-2 text-left text-[12px] font-medium whitespace-nowrap text-fg-3 first:pl-0">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="align-top">
              {cols.map((c) => (
                <td key={c.id} className={cx('border-b border-line px-2.5 py-2 leading-snug first:pl-0', c.type === 'number' && 'text-right', (c.type === 'number' || c.type === 'date') && 'whitespace-nowrap')}>
                  <Value v={r[c.id]} type={c.type} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const SHORT = new Set(['text', 'number', 'yesno', 'date', 'url']);

/** The answer fields: short ones together as a card, the rest each under its heading. */
export function ResultView({ answer, result, name }: { answer: AnswerField[]; result: Record<string, unknown>; name?: string }) {
  // Fields the recipe does not name (an agent's extra keys) are left out; a result from an older recipe shows by its keys.
  const fields: AnswerField[] = answer.length ? answer : Object.keys(result).map((id) => ({ id, label: humanize(id), type: Array.isArray(result[id]) ? (typeof (result[id] as unknown[])[0] === 'object' ? 'table' : 'list') : 'text' }));
  const short = fields.filter((f) => SHORT.has(f.type) && !(typeof result[f.id] === 'string' && (result[f.id] as string).length > 160));
  const long = fields.filter((f) => !short.includes(f));
  return (
    <div className="space-y-3">
      {short.length > 0 && (
        <div className="rounded-2xl border border-line bg-panel px-4 py-1">
          {short.map((f) => (
            <div key={f.id} className="flex flex-col gap-0.5 border-b border-line py-2.5 last:border-0 sm:flex-row sm:gap-4">
              <div className="shrink-0 text-[12.5px] text-fg-3 sm:w-44 sm:pt-px">{f.label}</div>
              <div className="min-w-0 flex-1 text-[14px]">
                <Value v={result[f.id]} type={f.type} />
              </div>
            </div>
          ))}
        </div>
      )}
      {long.map((f) => {
        const v = result[f.id];
        const rows = Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
        return (
          <section key={f.id} className="rounded-2xl border border-line bg-panel px-4 pt-3 pb-3.5">
            <div className="mb-2 flex items-center gap-2">
              <h3 className="min-w-0 flex-1 text-[13.5px] font-semibold">{f.label}</h3>
              {f.type === 'table' && rows.length > 0 && (
                <>
                  <SmallButton icon={<Copy size={13} />} onClick={() => copyText(toCsv([(f.columns ?? []).map((c) => c.label), ...rows.map((r) => (f.columns ?? []).map((c) => r[c.id]))]).replace(/\r\n/g, '\n'))}>
                    Copy
                  </SmallButton>
                  <SmallButton icon={<Download size={13} />} onClick={() => download(`${(name ?? 'result').replace(/[^\w-]+/g, '-')}-${f.id}.csv`, `﻿${toCsv([(f.columns ?? []).map((c) => c.label), ...rows.map((r) => (f.columns ?? []).map((c) => r[c.id]))])}`)}>
                    CSV
                  </SmallButton>
                </>
              )}
              {(f.type === 'markdown' || f.type === 'text') && typeof v === 'string' && v && (
                <SmallButton icon={<Copy size={13} />} onClick={() => copyText(v)}>
                  Copy
                </SmallButton>
              )}
            </div>
            {f.type === 'table' ? (
              <ResultTable f={f} rows={rows} />
            ) : f.type === 'list' ? (
              Array.isArray(v) && v.length ? (
                <ul className="list-disc space-y-1 pl-5 text-[14px] leading-relaxed marker:text-fg-3">
                  {(v as unknown[]).map((x, i) => (
                    <li key={i}>{cellText(x)}</li>
                  ))}
                </ul>
              ) : (
                <div className="text-[13px] text-fg-3">Nothing here.</div>
              )
            ) : typeof v === 'string' && v ? (
              <Markdown text={v} className="text-[14px]" />
            ) : (
              <Value v={v} type={f.type} />
            )}
          </section>
        );
      })}
    </div>
  );
}

function Elapsed({ from }: { from: number }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return <span className="tnum">{duration(Date.now() - from)}</span>;
}

/** Where a run stands, in a line, with its latest steps while it works. */
export function RunStatusCard({ run, progress, publicView, children }: { run: AppRun; progress?: RunProgress; publicView?: boolean; children?: ReactNode }) {
  const active = isActive(run.status);
  const took = run.endedAt && (run.startedAt ?? run.createdAt) ? duration(run.endedAt - (run.startedAt ?? run.createdAt)) : '';
  const head = (() => {
    switch (run.status) {
      case 'queued':
        return { icon: <Clock size={16} className="text-fg-3" />, text: 'Waiting its turn', tone: '' };
      case 'starting':
        return { icon: <Throbber className="text-[17px] text-fg-2" />, text: 'Starting…', tone: '' };
      case 'running':
        return {
          icon: <Throbber className="text-[17px] text-fg-2" />,
          text: (
            <>
              Working · <Elapsed from={run.startedAt ?? run.createdAt} />
            </>
          ),
          tone: '',
        };
      case 'waiting':
        return { icon: <Hand size={16} className="text-warn" />, text: progress?.waiting ?? 'Waiting for you', tone: 'text-warn' };
      case 'done':
        return { icon: <Check size={16} className="text-ok" strokeWidth={2.6} />, text: `Done${took ? ` in ${took}` : ''}`, tone: '' };
      case 'stopped':
        return { icon: <Square size={13} className="text-fg-3" />, text: 'Stopped', tone: 'text-fg-2' };
      default:
        return { icon: <CircleAlert size={16} className="text-err" />, text: 'It did not finish', tone: 'text-err' };
    }
  })();
  return (
    <div className="rounded-2xl border border-line bg-panel px-4 py-3">
      <div className="flex min-h-7 flex-wrap items-center gap-x-3 gap-y-1">
        <span className="flex h-5 w-5 items-center justify-center">{head.icon}</span>
        <span className={cx('min-w-0 flex-1 text-[14px] font-medium', head.tone)}>{head.text}</span>
        {!publicView && run.costUsd != null && !active && <span className="tnum text-[12.5px] text-fg-3">{money(run.costUsd)}</span>}
        {children}
      </div>
      {run.error && (run.status === 'failed' || run.status === 'stopped' || run.status === 'done') && <div className={cx('mt-1.5 pl-8 text-[13px] leading-snug', run.status === 'done' ? 'text-fg-3' : 'text-err')}>{run.error}</div>}
      {active && progress && (progress.steps.length > 0 || progress.said) && (
        <div className="mt-2.5 space-y-1 border-t border-line pt-2.5 pl-8">
          {progress.steps.map((s, i) => (
            <div key={i} className="flex items-center gap-2 text-[12.5px]">
              <span className={cx('h-1.5 w-1.5 shrink-0 rounded-full', s.status === 'running' ? 'bg-busy' : s.status === 'error' ? 'bg-err' : 'bg-fg-3/50')} />
              <span className={cx('min-w-0 truncate', s.status === 'running' ? 'shine text-fg' : 'text-fg-2')}>{s.title}</span>
            </div>
          ))}
          {progress.said && <div className="line-clamp-2 pt-1 text-[12.5px] leading-snug text-fg-3 italic">“{progress.said}”</div>}
        </div>
      )}
    </div>
  );
}

/** The agent's reply: open when it is all there is, folded under the result otherwise. */
export function ReplyBlock({ text, folded }: { text: string; folded: boolean }) {
  const [open, setOpen] = useState(!folded);
  return (
    <section className="rounded-2xl border border-line bg-panel px-4 pt-3 pb-3.5">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 text-left">
        <ChevronRight size={15} className={cx('shrink-0 text-fg-3 transition-transform', open && 'rotate-90')} />
        <h3 className="min-w-0 flex-1 text-[13.5px] font-semibold">{folded ? 'The agent’s reply' : 'Answer'}</h3>
        {open && (
          <span onClick={(e) => e.stopPropagation()}>
            <SmallButton icon={<Copy size={13} />} onClick={() => copyText(text)}>
              Copy
            </SmallButton>
          </span>
        )}
      </button>
      {open && <Markdown text={text} className="mt-2 text-[14px]" />}
    </section>
  );
}

/** Everything about a run below its header: status, result, reply. */
export function RunBody({ run, progress, answer, publicView, name, statusExtra }: { run: AppRun; progress?: RunProgress; answer: AnswerField[]; publicView?: boolean; name?: string; statusExtra?: ReactNode }) {
  const hasResult = !!run.result && Object.keys(run.result).length > 0;
  return (
    <div className="space-y-3">
      <RunStatusCard run={run} progress={progress} publicView={publicView}>
        {statusExtra}
      </RunStatusCard>
      {hasResult && <ResultView answer={answer} result={run.result!} name={name} />}
      {run.reply && (!isActive(run.status) || !hasResult) && <ReplyBlock key={`${run.id}-${hasResult}`} text={run.reply} folded={hasResult} />}
    </div>
  );
}
