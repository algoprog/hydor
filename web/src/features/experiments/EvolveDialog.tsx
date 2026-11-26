// Starting an evolution, from an evaluation's page (Evolve…): which files it may change (the app suggests some), what
// to try for, how many tries and when it works (Start: at once, or at night), with the rest under More. Without a
// baseline it offers to measure it first. What the server refuses (a protected file, changes not committed…) is shown
// as it says it.
import { useEffect, useState, type ReactNode } from 'react';
import { ChevronDown, Plus, X } from 'lucide-react';
import type { Evaluation } from '@shared/evaluations';
import type { Evolution } from '@shared/evolve';
import type { ExperimentsSettings } from '@shared/experiments';
import { api, post } from '../../lib/api';
import { folderName } from '../../lib/folderNames';
import { useApp } from '../../lib/store';
import { Button, cx, Dialog, IconButton, inputCls, Segmented, Throbber } from '../../components/ui';
import { loadSettings } from './api';
import { evolveStartUrl, suggestUrl } from './evolveApi';
import { EVOLVE_ABOUT } from './evolveWords';
import { StartChoice, type StartAt } from './StartChoice';

/** Files it may change, at most, and how many tries a number of your own may be (as the server says too). */
const MOST_FILES = 8;
const FEWEST_TRIES = 10;
const MOST_TRIES = 2000;
const TRIES = ['50', '100', '200'];

interface Props {
  open: boolean;
  evaluation: Evaluation;
  /** Whether the baseline is there: without it nothing can start. */
  baseline: 'measured' | 'measuring' | 'none';
  onMeasure: () => void;
  onClose: () => void;
  onStarted: (e: Evolution) => void;
}

export function EvolveDialog(props: Props) {
  // A window opened again starts empty.
  return props.open ? <Form {...props} /> : null;
}

function Label({ children }: { children: ReactNode }) {
  return <span className="mb-1.5 block text-fg-2">{children}</span>;
}

function Form({ evaluation, baseline, onMeasure, onClose, onStarted }: Props) {
  const home = useApp((s) => s.boot?.home) ?? '';
  const [files, setFiles] = useState<string[]>([]);
  const [text, setText] = useState('');
  const [suggested, setSuggested] = useState<string[]>([]);
  const [aim, setAim] = useState('');
  const [tries, setTries] = useState('100');
  const [own, setOwn] = useState('');
  const [more, setMore] = useState(false);
  const [hours, setHours] = useState('');
  const [atOnce, setAtOnce] = useState('2');
  const [stall, setStall] = useState('40');
  const [startAt, setStartAt] = useState<StartAt>('free');
  const [night, setNight] = useState<ExperimentsSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    api<{ files: string[] }>(suggestUrl(evaluation.id))
      .then((r) => live && setSuggested(r.files))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [evaluation.id]);

  useEffect(() => {
    loadSettings()
      .then(setNight)
      .catch(() => setNight(null));
  }, []);

  const typed = text.trim().replace(/^(\.\/)+/, '');
  const add = (file: string) => {
    if (!file) return;
    setError('');
    setFiles((f) => (f.includes(file) || f.length >= MOST_FILES ? f : [...f, file]));
  };
  const addTyped = () => {
    add(typed);
    setText('');
  };
  const offered = suggested.filter((s) => !files.includes(s)).slice(0, 8);
  const candidates = Number(tries === 'own' ? own : tries);
  const inRange = candidates >= FEWEST_TRIES && candidates <= MOST_TRIES;
  // A file typed and not added yet counts too.
  const all = typed && !files.includes(typed) ? [...files, typed] : files;

  const start = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await post<{ evolution: Evolution }>(evolveStartUrl, {
        evaluation: evaluation.id,
        files: all,
        ...(aim.trim() ? { aim: aim.trim() } : {}),
        candidates,
        ...(hours.trim() ? { hours: Number(hours) } : {}),
        atOnce: Number(atOnce),
        ...(stall.trim() ? { stallAfter: Number(stall) } : {}),
        ...(startAt === 'night' ? { when: 'night' } : {}),
      });
      onStarted(r.evolution);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const needsBaseline = baseline !== 'measured';
  return (
    <Dialog
      part="experiments"
      open
      onClose={onClose}
      title="Evolve"
      width={520}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {needsBaseline ? (
            <Button variant="primary" onClick={onMeasure} disabled={baseline === 'measuring'}>
              {baseline === 'measuring' ? 'Measuring the baseline…' : 'Measure the baseline'}
            </Button>
          ) : (
            <Button variant="primary" onClick={() => void start()} disabled={busy || !all.length || !inRange}>
              Start
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4 text-[13px]">
        <p className="leading-relaxed text-fg-2">{EVOLVE_ABOUT}</p>

        <div>
          <Label>What may it change?</Label>
          {files.length > 0 && (
            <ul className="mb-2 divide-y divide-line rounded-xl border border-line bg-panel">
              {files.map((f) => (
                <li key={f} className="flex items-center gap-2 py-1 pr-1.5 pl-3">
                  <span translate="no" className="min-w-0 flex-1 font-mono text-[12.5px] break-all text-fg">
                    {f}
                  </span>
                  <IconButton label="Remove" size="sm" onClick={() => (setError(''), setFiles((x) => x.filter((y) => y !== f)))}>
                    <X size={14} />
                  </IconButton>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <input
              value={text}
              onChange={(e) => (setText(e.target.value), setError(''))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addTyped();
                }
              }}
              aria-label="A file it may change"
              placeholder={`A file in ${folderName(evaluation.cwd, home)}`}
              spellCheck={false}
              autoCapitalize="off"
              disabled={files.length >= MOST_FILES}
              className={cx(inputCls, 'min-w-0 flex-1 font-mono text-[12.5px]')}
            />
            <Button variant="secondary" onClick={addTyped} disabled={!typed || files.length >= MOST_FILES}>
              Add
            </Button>
          </div>
          {offered.length > 0 && files.length < MOST_FILES && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[12px] text-fg-3">Suggested</span>
              {offered.map((s) => (
                <button key={s} type="button" onClick={() => add(s)} className="flex max-w-full items-center gap-1 rounded-full border border-line-2 py-1 pr-2.5 pl-2 text-left text-fg transition-colors hover:bg-bg-2">
                  <Plus size={12} className="shrink-0 text-fg-3" />
                  <span translate="no" className="min-w-0 font-mono text-[11.5px] break-all">
                    {s}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <label className="block">
          <Label>What should it try?</Label>
          <textarea value={aim} onChange={(e) => setAim(e.target.value)} rows={2} maxLength={2000} placeholder="Make the reranker faster without losing nDCG@10" className={cx(inputCls, 'h-auto min-h-[64px] py-2 leading-relaxed')} />
        </label>

        <div>
          <Label>How many tries</Label>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented value={tries} onChange={setTries} options={[...TRIES.map((v) => ({ value: v, label: v })), { value: 'own', label: 'Other' }]} />
            {tries === 'own' && (
              <input
                value={own}
                onChange={(e) => (setOwn(e.target.value.replace(/\D/g, '').slice(0, 4)), setError(''))}
                inputMode="numeric"
                autoFocus
                aria-label="Number of tries"
                placeholder="10 to 2000"
                aria-invalid={!!own && !inRange}
                className={cx(inputCls.replace('w-full', ''), 'tnum h-8 w-28 text-[13px]')}
              />
            )}
            {tries === 'own' && own.length > 1 && !inRange && <span className="text-[12px] text-warn">From 10 to 2000</span>}
          </div>
        </div>

        {/* An evaluation always runs on this computer. */}
        <StartChoice value={startAt} onChange={setStartAt} night={night} where="local" labelClass="mb-1.5" />

        <div>
          <button type="button" aria-expanded={more} onClick={() => setMore((m) => !m)} className="flex min-h-8 items-center gap-1 font-medium text-fg-2 hover:text-fg">
            More <ChevronDown size={14} className={cx(more && 'rotate-180')} />
          </button>
          {more && (
            <div className="mt-2 space-y-3">
              <label className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-fg-2">Stop after (hours)</span>
                <input value={hours} onChange={(e) => setHours(e.target.value.replace(/[^\d.]/g, '').slice(0, 6))} inputMode="decimal" placeholder="No limit" className={cx(inputCls.replace('w-full', ''), 'tnum h-8 w-24 text-[13px]')} />
              </label>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-fg-2">How many at once</span>
                <Segmented size="sm" value={atOnce} onChange={setAtOnce} options={['1', '2', '3', '4'].map((v) => ({ value: v, label: v }))} />
              </div>
              <label className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0 flex-1 text-fg-2">Stop when this many in a row brought nothing better</span>
                <input value={stall} onChange={(e) => setStall(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" placeholder="40" className={cx(inputCls.replace('w-full', ''), 'tnum h-8 w-24 text-[13px]')} />
              </label>
            </div>
          )}
        </div>

        {needsBaseline && (
          <p className="flex items-start gap-2 rounded-xl border border-line bg-panel px-3 py-2.5 text-fg-2">
            {baseline === 'measuring' && <Throbber size={14} />}
            <span>This evaluation has no baseline yet, and every try is compared with it. Measure it first.</span>
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-lg bg-err/10 px-3 py-2 break-words text-err">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
