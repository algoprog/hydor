// A finding, whole (shared/findings.ts): the statement, its verdict, what was learned, its evidence as links, what it
// replaces, and whether the code under it changed since; Change opens its verdict and words to put right by hand. The
// note view (NoteDialog.tsx) shows this in place of a note's text.
import { useEffect, useState } from 'react';
import { ExternalLink, Pencil } from 'lucide-react';
import { FINDING_VERDICTS, MAX_LEARNED, MAX_STATEMENT, type FindingData, type FindingVerdict } from '@shared/findings';
import type { MemoryListEntry } from '@shared/memory';
import { Badge, Button, cx, inputCls, Segmented } from '../../components/ui';
import { api, patch } from '../../lib/api';
import { ago } from '../../lib/format';
import { go, openFile } from '../../lib/nav';
import { toastError } from '../../lib/store';
import { tr, trIn } from '../../i18n/runtime';
import { shortDay } from './common';
import { evidenceName, evidenceTarget } from './findingLinks';

/** A verdict in a word, in the reader's language. */
export const verdictLabel = (v: FindingVerdict) => (v === 'supported' ? tr('Supported') : v === 'refuted' ? tr('Refuted') : v === 'unclear' ? tr('Unclear') : trIn('findings', 'Open'));
const TONE = { supported: 'ok', refuted: 'err', unclear: 'warn', open: 'neutral' } as const;

/** The verdict as a small pill: its word, in the app's colours for good, bad and neutral. */
export function VerdictPill({ verdict, className }: { verdict: FindingVerdict; className?: string }) {
  return (
    <Badge tone={TONE[verdict]} className={cx('!rounded-full px-2', className)}>
      {verdictLabel(verdict)}
    </Badge>
  );
}

const KIND = () => ({ run: trIn('findings', 'Run'), score: tr('Score'), table: tr('Table'), commit: tr('Commit'), file: tr('File'), paper: tr('Paper'), session: tr('Session') });

/** The evidence, one a line: what kind it is, and its name, which opens it. `root`: the project's folder. */
function Evidence({ list, root }: { list: FindingData['evidence']; root: string }) {
  const kinds = KIND();
  const link = 'min-w-0 text-left break-words text-accent underline-offset-2 hover:underline';
  return (
    <ul className="space-y-1">
      {list.map((e, i) => {
        const t = evidenceTarget(e, root);
        const name = <span translate="no">{evidenceName(e)}</span>;
        return (
          <li key={i} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3">
            <span className="text-fg-3">{kinds[e.kind]}</span>
            {!t ? (
              <span className="min-w-0 break-words text-fg-2">{name}</span>
            ) : t.type === 'web' ? (
              <a href={t.href} target="_blank" rel="noreferrer" className={link}>
                {name} <ExternalLink size={11} className="inline align-[-1px]" aria-hidden />
              </a>
            ) : (
              <button type="button" className={link} onClick={() => (t.type === 'page' ? go(t.to) : openFile(t.path, t.line))}>
                {name}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

const Part = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="mt-3.5">
    <h4 className="mb-1 text-[12px] font-medium text-fg-3">{title}</h4>
    <div className="text-[13.5px] leading-relaxed text-fg-2">{children}</div>
  </section>
);

/** The finding a later one replaced, as it stood. */
function Replaced({ id, root }: { id: number; root: string }) {
  const [old, setOld] = useState<MemoryListEntry | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    setOld(undefined);
    api<{ entries: MemoryListEntry[] }>(`/api/memory/entries?ids=${id}`).then(
      (r) => live && setOld(r.entries[0] ?? null),
      () => live && setOld(null),
    );
    return () => {
      live = false;
    };
  }, [id]);
  const f = old?.finding;
  if (old === undefined) return null;
  return (
    <Part title={tr('Replaces')}>
      <div className="border-l-2 border-line pl-3">
        {f ? (
          <>
            <div className="flex items-center gap-2 text-[12px] text-fg-3">
              <VerdictPill verdict={f.verdict} />
              <span>{shortDay(old!.createdAt)}</span>
            </div>
            <div translate="no" className="mt-1 break-words">
              {f.statement}
            </div>
            {f.learned && (
              <div translate="no" className="break-words text-fg-3">
                {f.learned}
              </div>
            )}
            {!!f.evidence.length && (
              <div className="mt-1.5 text-[12.5px]">
                <Evidence list={f.evidence} root={root} />
              </div>
            )}
          </>
        ) : (
          <span className="text-fg-3">An earlier finding, no longer kept</span>
        )}
      </div>
    </Part>
  );
}

/** Its verdict, statement and what was learned, to put right by hand. */
function Change({ e, onSaved, onCancel }: { e: MemoryListEntry; onSaved: () => void; onCancel: () => void }) {
  const f = e.finding!;
  const [verdict, setVerdict] = useState(f.verdict);
  const [statement, setStatement] = useState(f.statement);
  const [learned, setLearned] = useState(f.learned ?? '');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!statement.trim() || busy) return;
    setBusy(true);
    try {
      await patch(`/api/memory/entries/${e.id}`, { finding: { verdict, statement: statement.trim(), learned: learned.trim() } });
      onSaved();
    } catch (x) {
      toastError(x);
    } finally {
      setBusy(false);
    }
  };
  const area = cx(inputCls, '!h-auto resize-y py-2 leading-snug');
  return (
    <div
      className="space-y-3"
      onKeyDown={(k) => {
        if (k.key === 'Escape') {
          k.preventDefault();
          k.stopPropagation();
          onCancel();
        } else if (k.key === 'Enter' && (k.ctrlKey || k.metaKey)) void save();
      }}
    >
      <div className="max-w-full overflow-x-auto">
        <Segmented size="sm" value={verdict} onChange={setVerdict} options={FINDING_VERDICTS.map((v) => ({ value: v, label: verdictLabel(v) }))} />
      </div>
      <label className="block">
        <span className="mb-1 block text-[12px] font-medium text-fg-3">Statement</span>
        <textarea autoFocus rows={3} maxLength={MAX_STATEMENT} value={statement} onChange={(x) => setStatement(x.target.value)} className={area} />
      </label>
      <label className="block">
        <span className="mb-1 block text-[12px] font-medium text-fg-3">What was learned</span>
        <textarea rows={3} maxLength={MAX_LEARNED} value={learned} onChange={(x) => setLearned(x.target.value)} className={area} />
      </label>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" variant="primary" disabled={busy || !statement.trim()} onClick={() => void save()}>
          Save
        </Button>
      </div>
    </div>
  );
}

/** The finding in the note view. `onSaved`: a change by hand went through. */
export function FindingView({ e, heading, onSaved }: { e: MemoryListEntry; heading: boolean; onSaved: () => void }) {
  const f = e.finding!;
  const [editing, setEditing] = useState(false);
  useEffect(() => setEditing(false), [e.id]);
  const deleted = e.status === 'deleted';
  const root = e.scope === 'repo' ? e.scopeKey : '';
  if (editing) return <Change e={e} onCancel={() => setEditing(false)} onSaved={() => (setEditing(false), onSaved())} />;
  return (
    <>
      <div className={cx('text-[16px] leading-snug font-semibold break-words', deleted && 'text-fg-2')}>
        {heading && <VerdictPill verdict={f.verdict} className="mr-1.5 align-[2px]" />}
        <span translate="no">{f.statement}</span>
      </div>
      {e.drift && !deleted && (
        <div className="mt-2.5 rounded-lg bg-warn/12 px-3 py-2 text-[12.5px] leading-snug text-fg-2">
          <span className="font-medium text-warn">The code under this has changed since.</span> <span translate="no">{e.drift.paths.join(', ')}</span> <span>{tr(`(seen ${ago(e.drift.at)})`)}</span>
        </div>
      )}
      <Part title={tr('What was learned')}>
        {f.learned ? (
          <span translate="no" className="break-words">
            {f.learned}
          </span>
        ) : (
          <span className="text-fg-3">{f.verdict === 'open' ? 'Not tested yet' : 'Nothing written'}</span>
        )}
      </Part>
      <Part title={tr('Evidence')}>{f.evidence.length ? <Evidence list={f.evidence} root={root} /> : <span className="text-fg-3">None given</span>}</Part>
      {f.replaces != null && <Replaced id={f.replaces} root={root} />}
      {!deleted && (
        <Button size="sm" variant="ghost" icon={<Pencil size={14} />} onClick={() => setEditing(true)} className="mt-3 -ml-2.5">
          {trIn('findings', 'Change')}
        </Button>
      )}
    </>
  );
}
