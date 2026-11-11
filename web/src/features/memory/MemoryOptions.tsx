// Settings → Memory → What agents get (search by meaning, how many notes each agent starts with, how long the
// profile may be) and Your data (bring in, export, clear).
import { useEffect } from 'react';
import { Check, RotateCw, TriangleAlert } from 'lucide-react';
import type { MemoryState } from '@shared/memory';
import { PROFILE_WORDS_CHOICES, TOP_K_CHOICES } from '@shared/memory';
import { Button, cx, Segmented, Switch, Throbber, useConfirm } from '../../components/ui';
import { del, put } from '../../lib/api';
import { mu } from '../../lib/machine';
import { toast, toastError } from '../../lib/store';
import { Group, Row, Select } from '../settings/kit';
import { LOCALE } from '../../i18n/locale';
import { reloadState } from './common';
import { useMemoryState } from './state';

const set = (p: Record<string, unknown>) => put('/api/memory', p).then(reloadState).catch(toastError);

/** The choices a setting offers, and the value it has now when it is none of them. */
const withCurrent = (choices: number[], now: number) => (choices.includes(now) ? choices : [...choices, now].sort((a, b) => a - b));

/** How search by meaning is doing: getting ready, ready (how many notes have their vectors), or stopped. */
function MeaningStatus({ m }: { m: MemoryState['meaning'] }) {
  const busy = m.status === 'setting-up' || m.status === 'starting';
  // While it sets up or loads, look again every few seconds.
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(reloadState, 3000);
    return () => clearInterval(t);
  }, [busy]);
  if (m.status === 'failed')
    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] leading-snug text-warn">
        <TriangleAlert size={14} className="shrink-0" />
        <span className="min-w-0">{m.detail ?? 'It stopped.'}</span>
        <button type="button" onClick={() => void set({ retry: true })} className="inline-flex items-center gap-1 font-medium text-fg-2 underline-offset-2 hover:underline">
          <RotateCw size={12} /> Try again
        </button>
      </div>
    );
  return (
    <div className="flex items-start gap-2 text-[12.5px] leading-snug text-fg-2">
      {busy ? <Throbber className="mt-0.5 shrink-0" /> : <Check size={14} className="mt-0.5 shrink-0 text-ok" />}
      <span className="min-w-0">
        {m.detail ?? (busy ? 'Getting ready' : 'Ready')}
        {m.total > 0 && !busy && (
          <>
            {' '}
            · {m.embedded === m.total ? `all ${m.total} notes` : `${m.embedded} of ${m.total} notes`} found by meaning{m.embedded < m.total && ' (the rest soon)'}
          </>
        )}
      </span>
    </div>
  );
}

export function AgentsGetGroup() {
  const st = useMemoryState();
  return (
    <Group title="What agents get">
      {!st ? (
        <div className="flex justify-center py-5">
          <Throbber className="text-fg-3" />
        </div>
      ) : (
        <>
          <Row
            label="Search by meaning"
            hint="Find notes by what they mean, with a model on this computer (about 500 MB)"
            info="Finds notes, what the Library holds and more by what they mean as well as by their words, with a model that runs on this computer. It sets itself up once: about 500 MB."
            disabled={!st.enabled}
            control={<Switch on={st.enabled && st.meaning.on} disabled={!st.enabled} label="Search by meaning" onChange={(on) => void set({ meaning: on })} />}
          >
            {st.enabled && st.meaning.on && <MeaningStatus m={st.meaning} />}
          </Row>
          <Row
            label="Notes each agent starts with"
            hint="Besides your profile: the ones that bear on what you ask"
            info="At most this many of the notes about you and the project that bear on what you ask, found by their words and, with search by meaning on, by what they mean, and the titles of the rest, which agents look up when they need them. A place with only a few notes is given whole."
            control={
              <Segmented
                size="sm"
                value={String(st.topK)}
                options={withCurrent(TOP_K_CHOICES, st.topK).map((k) => ({ value: String(k), label: String(k) }))}
                onChange={(v) => void set({ topK: Number(v) })}
              />
            }
          />
          <Row
            label="Profile length"
            hint="Longer, the helper model shortens it"
            control={
              <Select
                label="Profile length"
                width={200}
                value={String(st.profileWords)}
                options={withCurrent(PROFILE_WORDS_CHOICES, st.profileWords).map((w) => ({ value: String(w), label: `${w.toLocaleString(LOCALE)} words` }))}
                onChange={(v) => void set({ profileWords: Number(v) })}
              />
            }
          />
        </>
      )}
    </Group>
  );
}

export function YourDataGroup({ onBringIn }: { onBringIn: () => void }) {
  const st = useMemoryState();
  const [confirm, confirmNode] = useConfirm();
  const c = st?.counts;
  const total = c ? c.global + c.repo + c.session : 0;
  const get = (format: 'md' | 'json') => {
    location.href = mu(`/api/memory/export?format=${format}`);
  };
  const clear = async () => {
    const ok = await confirm({
      title: 'Clear all memory?',
      body: 'Every note about you, your projects and your sessions goes, with its history. This cannot be undone; export first to keep a copy.',
      confirm: 'Clear all',
      danger: true,
    });
    if (!ok) return;
    del<{ cleared: number }>('/api/memory', { confirm: 'all' })
      .then((r) => (toast(`Cleared ${r.cleared} note${r.cleared === 1 ? '' : 's'}`), reloadState()))
      .catch(toastError);
  };
  return (
    <Group title="Your data">
      <Row
        label="Bring in from other assistants"
        hint="What Claude Code, Codex, ChatGPT and others know about you, and your skills"
        control={
          <Button size="sm" variant="secondary" onClick={onBringIn}>
            Bring in…
          </Button>
        }
      />
      <Row
        label="Export"
        hint="Every note, to read or as data with its history"
        control={
          <>
            <Button size="sm" variant="secondary" onClick={() => get('md')}>
              Markdown
            </Button>
            <Button size="sm" variant="secondary" onClick={() => get('json')}>
              JSON
            </Button>
          </>
        }
      />
      <Row
        label="Clear all memory"
        hint="Every note and its history. It cannot be undone."
        control={
          <Button size="sm" variant="secondary" disabled={!total} onClick={() => void clear()} className={cx('!text-err')}>
            Clear all…
          </Button>
        }
      />
      {confirmNode}
    </Group>
  );
}
