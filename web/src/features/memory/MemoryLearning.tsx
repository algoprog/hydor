// Settings → Memory → Learning: learning from conversations and the tidy-up, by itself about once a day: when it
// last ran, what it changed (each change undoable), and running it now.
import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { MessageSquare, Sparkles, Undo2 } from 'lucide-react';
import type { MemoryChange, MemoryState } from '@shared/memory';
import { changeSummary } from '@shared/memory';
import { Badge, Button, cx, Dialog, IconButton, Switch, Throbber } from '../../components/ui';
import { post, put } from '../../lib/api';
import { ago } from '../../lib/format';
import { go, sessionPath } from '../../lib/nav';
import { toast, toastError } from '../../lib/store';
import { Group, Row } from '../settings/kit';
import { dayOf, reloadState, when } from './common';
import { ChangeBadge } from './parts';
import { placeName, useMemoryState } from './state';

const set = (p: Record<string, unknown>) => put('/api/memory', p).then(reloadState).catch(toastError);

/** "2 added, 1 removed": each count a piece of its own, so each is translated. */
function Counts({ changes }: { changes: MemoryChange[] }) {
  return changeSummary(changes)
    .split(', ')
    .map((p, i) => (
      <Fragment key={i}>
        {i > 0 && ', '}
        <span>{p}</span>
      </Fragment>
    ));
}

function TidyChange({ c, onUndo }: { c: MemoryChange; onUndo: () => void }) {
  return (
    <div className={cx('px-5 py-2.5', c.undone && 'opacity-60')}>
      <div className="flex min-h-7 items-center gap-2">
        <ChangeBadge c={c} />
        {c.kind && c.kind !== 'note' && <Badge>{c.kind === 'topic' ? 'Topic' : 'Profile'}</Badge>}
        <span translate="no" className="min-w-0 truncate text-[12px] text-fg-3">
          {placeName(c.scope, c.scopeKey)}
          {c.why && ` · ${c.why}`}
        </span>
        <span className="flex-1" />
        {c.session && (
          <IconButton size="sm" label="Open the conversation" onClick={() => go(sessionPath(c.session!))}>
            <MessageSquare size={14} />
          </IconButton>
        )}
        {!c.undone && (
          <IconButton size="sm" label="Undo this change" onClick={onUndo}>
            <Undo2 size={14} />
          </IconButton>
        )}
      </div>
      <div translate="no" className="mt-1 space-y-0.5 text-[13.5px] leading-snug break-words">
        {c.before && c.action !== 'expiry' && <div className="text-fg-3 line-through decoration-fg-3/60">{c.before}</div>}
        {c.after && <div className="text-fg">{c.after}</div>}
        {c.action === 'expiry' && c.expiresAt && <div className="text-[12px] text-fg-3">Until {dayOf(c.expiresAt)}</div>}
      </div>
    </div>
  );
}

/** How the latest tidy-up went, in one short line. */
function tidyHint(r: MemoryState['tidy']): ReactNode {
  if (!r) return 'Not tidied up yet';
  if (r.running)
    return (
      <span className="inline-flex items-center gap-1.5">
        <Throbber /> Tidying up…
      </span>
    );
  return (
    <>
      <span title={when(r.at)}>{ago(r.at)}</span>
      {r.error ? (
        <span className="text-warn">: {r.error}</span>
      ) : r.changesAt ? (
        <>
          : nothing to change. Before that, <span title={when(r.changesAt)}>{ago(r.changesAt)}</span>: <Counts changes={r.changes} />.
        </>
      ) : r.changes.length ? (
        <>
          : <Counts changes={r.changes} />.
        </>
      ) : (
        `: nothing to change (${r.checked === 1 ? '1 note' : `${r.checked} notes`} looked at).`
      )}
      {!r.error && r.sessions ? <> {r.sessions === 1 ? 'It read 1 conversation.' : `It read ${r.sessions} conversations.`}</> : null}
    </>
  );
}

export function LearningGroup() {
  const st = useMemoryState();
  const r = st?.tidy;
  const [open, setOpen] = useState(false);
  // While it runs, look again every few seconds.
  useEffect(() => {
    if (!r?.running) return;
    const t = setInterval(reloadState, 3000);
    return () => clearInterval(t);
  }, [r?.running]);
  const off = !!st && !st.enabled;
  const now = () =>
    post('/api/memory/tidy')
      .then(() => (toast('Tidying up: this takes a minute or two'), reloadState()))
      .catch(toastError);
  const undo = (i: number) => post('/api/memory/tidy/undo', { index: i }).then(reloadState).catch(toastError);
  return (
    <Group title="Learning">
      {!st ? (
        <div className="flex justify-center py-5">
          <Throbber className="text-fg-3" />
        </div>
      ) : (
        <>
          <Row
            label="Learn from conversations"
            hint="Once a day, fix what conversations show wrong and keep what agents missed"
            info="With the tidy-up, the helper model reads the conversations since the last one (not those with memory off): it corrects the notes they show wrong, checks the notes not checked yet, and keeps at most a few things a day that no agent saved."
            disabled={off}
            control={<Switch on={st.enabled && st.learnOn} disabled={off} label="Learn from conversations" onChange={(on) => void set({ learn: on })} />}
          />
          <Row
            label="Tidy up automatically"
            hint="Once a day, merge notes that say the same thing and sum related ones up"
            info="About once a day, when there is something new and you have paused for a few minutes: the helper model merges notes that say the same thing, sums related ones up, and gives each a title for the index agents start with."
            disabled={off}
            control={<Switch on={st.enabled && st.tidyOn} disabled={off} label="Tidy up automatically" onChange={(on) => void set({ tidy: on })} />}
          />
          <Row
            label="Last tidy-up"
            hint={tidyHint(r)}
            disabled={off}
            control={
              <>
                {r && r.changes.length > 0 && (
                  <Button size="sm" variant="ghost" disabled={off} onClick={() => setOpen(true)}>
                    What changed
                  </Button>
                )}
                <Button size="sm" variant="secondary" icon={<Sparkles size={14} />} disabled={off || r?.running} onClick={() => void now()}>
                  Tidy up now
                </Button>
              </>
            }
          >
            {r?.learnError && r.learnError !== r.error && !r.running && <div className="text-[12.5px] leading-snug text-warn">Learning from conversations stopped: {r.learnError}</div>}
          </Row>
        </>
      )}
      <Dialog open={open && !!r} onClose={() => setOpen(false)} title="What the last tidy-up changed" width={560}>
        <div className="-mx-5 divide-y divide-line">
          {r?.changes.map((c, i) => (
            <TidyChange key={`${c.entry}-${i}`} c={c} onUndo={() => void undo(i)} />
          ))}
        </div>
      </Dialog>
    </Group>
  );
}
