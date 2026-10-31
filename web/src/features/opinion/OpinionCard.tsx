// A second opinion under the turn it checked: while the reviewer works, how long it has been at it;
// then its verdict, its summary and its findings, worst first (minor ones folded), each with "Send to
// agent", which puts it in the message box. All of them can go at once, or wait for the turn running.
import { useMemo, useState } from 'react';
import { ChevronRight, CircleCheck, RotateCcw, ScanSearch, Send, TriangleAlert, X } from 'lucide-react';
import type { SessionNote } from '@shared/features';
import { findingsMessage, SEVERITY_LABEL, type Finding, type OpinionNote } from '@shared/opinion';
import { Badge, Button, cx, IconButton, Throbber } from '../../components/ui';
import { activityOf, isBusy } from '../../lib/activity';
import { del, enc, post } from '../../lib/api';
import { composeInsert } from '../../lib/featureEvents';
import { openFile } from '../../lib/nav';
import { toast, toastError, useSessions } from '../../lib/store';
import { Elapsed } from '../session/items';
import { askOpinion } from './OpinionDialog';

const TONE = { critical: 'err', important: 'warn', minor: 'neutral' } as const;

/** A finding's file, opened in the file view (relative paths are the session's folder's). */
function FileLink({ f, cwd }: { f: Finding; cwd?: string }) {
  if (!f.file) return null;
  const abs = f.file.startsWith('/') ? f.file : cwd ? `${cwd.replace(/\/+$/, '')}/${f.file.replace(/^\.\//, '')}` : null;
  const label = `${f.file}${f.line ? `:${f.line}` : ''}`;
  return abs ? (
    <button type="button" onClick={() => openFile(abs, f.line)} className="max-w-full truncate font-mono text-[11.5px] text-fg-3 underline-offset-2 hover:text-fg hover:underline">
      {label}
    </button>
  ) : (
    <span className="truncate font-mono text-[11.5px] text-fg-3">{label}</span>
  );
}

function FindingRow({ f, onSend, cwd }: { f: Finding; onSend: () => void; cwd?: string }) {
  return (
    <li className="group px-4 py-2.5">
      <div className="flex items-start gap-2">
        <Badge tone={TONE[f.severity]} className="mt-[3px]">
          {SEVERITY_LABEL[f.severity]}
        </Badge>
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] leading-snug font-medium text-fg">{f.title}</div>
          <FileLink f={f} cwd={cwd} />
          {f.detail && <div className="mt-0.5 text-[13px] leading-snug whitespace-pre-wrap text-fg-2">{f.detail}</div>}
        </div>
        <IconButton size="sm" label="Send to agent: put it in the message box" onClick={onSend} className="-my-1 shrink-0">
          <Send size={14} />
        </IconButton>
      </div>
    </li>
  );
}

export function OpinionCard({ note, sessionKey }: { note: SessionNote; sessionKey: string }) {
  const d = note.data as OpinionNote;
  const s = useSessions((x) => x.byKey[sessionKey]);
  const working = isBusy(activityOf(s));
  const findings = d.findings ?? [];
  const major = findings.filter((f) => f.severity !== 'minor');
  const minor = findings.filter((f) => f.severity === 'minor');
  const [open, setOpen] = useState(d.verdict === 'issues' || d.status === 'failed');
  const [showMinor, setShowMinor] = useState(false);
  const shown = useMemo(() => (showMinor || !major.length ? findings : major), [showMinor, findings, major]);
  const send = (list: Finding[]) => composeInsert(findingsMessage(d.reviewerLabel, list), sessionKey);
  const queue = (list: Finding[]) =>
    post(`/api/sessions/${enc(sessionKey)}/queue`, { text: findingsMessage(d.reviewerLabel, list) })
      .then(() => toast('Queued: it goes to the agent when this turn ends'))
      .catch(toastError);
  const dismiss = () => del(`/api/opinion/note/${enc(note.id)}`).catch(toastError);
  const again = () => askOpinion(sessionKey, { turn: d.turn, reviewer: d.reviewer }).catch(toastError);

  const counts = (['critical', 'important', 'minor'] as const)
    .map((k) => [k, findings.filter((f) => f.severity === k).length] as const)
    .filter(([, n]) => n)
    .map(([k, n]) => `${n} ${SEVERITY_LABEL[k].toLowerCase()}`)
    .join(' · ');
  const head =
    d.status === 'running' ? (
      <span className="flex min-w-0 items-center gap-1.5 text-busy">
        <Throbber className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">Checking the work</span>
        <span className="shrink-0">
          · <Elapsed since={d.startedAt} />
        </span>
      </span>
    ) : d.status === 'failed' ? (
      <span className="flex min-w-0 items-center gap-1.5 text-err">
        <TriangleAlert size={13} className="shrink-0" />
        <span className="truncate">No answer</span>
      </span>
    ) : d.verdict === 'issues' ? (
      <span className="truncate text-warn">{counts}</span>
    ) : d.verdict === 'good' ? (
      <span className="flex min-w-0 items-center gap-1.5 text-ok">
        <CircleCheck size={13} className="shrink-0" />
        <span className="truncate">Looks good{minor.length ? ` · ${minor.length} minor` : ''}</span>
      </span>
    ) : (
      <span className="truncate text-fg-3">No clear verdict</span>
    );

  return (
    <div className="anim-in mt-3 overflow-hidden rounded-2xl border border-line bg-panel">
      <div className="flex items-center gap-1 py-1 pr-1.5 pl-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          disabled={d.status === 'running'}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-bg-2 disabled:hover:bg-transparent"
        >
          <ScanSearch size={15} className="shrink-0 text-fg-3" />
          {/* On a phone the verdict goes under the title, so neither is cut off. */}
          <span className="min-w-0 flex-1 sm:flex sm:items-center sm:gap-2">
            <span className="flex min-w-0 items-baseline gap-1.5">
              <span className="shrink-0 font-medium">Second opinion</span>
              <span className="truncate text-fg-3">· {d.reviewerLabel}</span>
            </span>
            <span className="block min-w-0 truncate text-[12.5px] sm:flex-1 sm:text-[13px]">{head}</span>
          </span>
          {d.status !== 'running' && <ChevronRight size={14} className={cx('ml-auto shrink-0 text-fg-3 transition-transform', open && 'rotate-90')} />}
        </button>
        {d.status !== 'running' && (
          <IconButton size="sm" label="Dismiss" onClick={dismiss}>
            <X size={15} />
          </IconButton>
        )}
      </div>
      {d.status === 'running' && (
        <div className="border-t border-line px-4 py-2.5 text-[12.5px] text-fg-3">
          {d.reviewerLabel} is reading what you asked, {d.files ? `the changes to ${d.files} file${d.files === 1 ? '' : 's'}` : 'the reply'} and the commands it ran. This takes a minute or two.
        </div>
      )}
      {open && d.status === 'failed' && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-2.5 text-[13px]">
          <span className="min-w-0 flex-1 text-fg-2">{d.error ?? 'The reviewer did not answer.'}</span>
          <Button size="sm" variant="secondary" icon={<RotateCcw size={13} />} onClick={again}>
            Try again
          </Button>
        </div>
      )}
      {open && d.status === 'done' && (
        <div className="border-t border-line">
          {d.summary && <p className="px-4 pt-2.5 pb-1 text-[13.5px] leading-relaxed text-fg-2">{d.summary}</p>}
          {shown.length > 0 && (
            <ul className="divide-y divide-line">
              {shown.map((f, i) => (
                <FindingRow key={i} f={f} cwd={s?.cwd} onSend={() => send([f])} />
              ))}
            </ul>
          )}
          {findings.length > 0 || d.trimmed ? (
            <div className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-2">
              {minor.length > 0 && major.length > 0 && (
                <Button size="sm" variant="ghost" onClick={() => setShowMinor((m) => !m)}>
                  {showMinor ? 'Hide minor ones' : `Show ${minor.length} minor`}
                </Button>
              )}
              {d.trimmed && <span className="text-[12px] text-fg-3">Part of the diff was left out to fit.</span>}
              <span className="flex-1" />
              {shown.length > 0 && working && (
                <Button size="sm" variant="ghost" onClick={() => queue(shown)}>
                  {shown.length > 1 ? 'Queue all' : 'Queue it'}
                </Button>
              )}
              {shown.length > 1 && (
                <Button size="sm" variant="secondary" icon={<Send size={13} />} onClick={() => send(shown)}>
                  Send all to agent
                </Button>
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
