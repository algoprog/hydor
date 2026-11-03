// Agent Guidelines in the pages: one text every agent follows (Claude Code, Codex, Custom and the others), for
// every session, a space or one session. Settings → Agents → Agent Guidelines holds every session's (and the
// files Claude Code and Codex read on their own, folded away); a session's menu and the start page's Options
// open the three levels in one dialog.
import { useEffect, useState, type ReactNode } from 'react';
import { ChevronRight, ScrollText } from 'lucide-react';
import { MAX_GUIDELINES, type GuidelinesPut, type GuidelinesView } from '@shared/guidelines';
import type { SessionExtra } from '@shared/features';
import { api, enc, put } from '../../lib/api';
import { useFeatureEvent } from '../../lib/featureEvents';
import { go } from '../../lib/nav';
import { toast, toastError } from '../../lib/store';
import { Button, cx, Dialog, inputCls, Section, Segmented, SettingChip, Throbber } from '../../components/ui';
import { useSpaces } from '../spaces/state';

/** Ways to talk to you, to add with a click. */
const TONES = ['Plain English, short answers, explain jargon', 'Warm and encouraging: I am new to this', 'Brief and technical'];

const PLACEHOLDER = 'How you like to work, what agents should always or never do, how to talk to you: “Answer in plain English. Ask before deleting anything. Keep what you make in ~/Work.”';

/** The levels as the server has them now; read again when any of them changes. */
function useGuidelines(o: { key?: string; space?: string }): [GuidelinesView | null, () => void] {
  const [v, setV] = useState<GuidelinesView | null>(null);
  const q = new URLSearchParams({ ...(o.key ? { key: o.key } : {}), ...(o.space ? { space: o.space } : {}) }).toString();
  const load = () => {
    api<GuidelinesView>(`/api/guidelines${q ? `?${q}` : ''}`).then(setV, toastError);
  };
  useEffect(load, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  useFeatureEvent('guidelines', load);
  return [v, load];
}

function Editor({ value, onChange, rows = 9, autoFocus }: { value: string; onChange: (v: string) => void; rows?: number; autoFocus?: boolean }) {
  return (
    <div>
      <textarea
        rows={rows}
        autoFocus={autoFocus}
        maxLength={MAX_GUIDELINES}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={PLACEHOLDER}
        className={cx(inputCls, 'h-auto resize-y py-2 text-[13.5px] leading-relaxed')}
      />
      {value.length > MAX_GUIDELINES * 0.8 && (
        <div className="mt-1 text-right text-[11.5px] text-fg-3">
          {value.length.toLocaleString()} of {MAX_GUIDELINES.toLocaleString()} characters
        </div>
      )}
    </div>
  );
}

// ---- Settings → Agents → Agent Guidelines ---------------------------------------------------------------

export function GuidelinesSettings({ files }: { files: ReactNode }) {
  const [v] = useGuidelines({});
  const [text, setText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filesOpen, setFilesOpen] = useState(false);
  const spaces = useSpaces();
  const cur = text ?? v?.global ?? '';
  const save = async () => {
    setBusy(true);
    try {
      await put('/api/guidelines', { global: cur } satisfies GuidelinesPut);
      setText(null);
      toast('Saved: every new message follows them', 'ok');
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const withText = (spaces ?? []).filter((s) => s.instructions?.trim());
  return (
    <div className="space-y-4">
      <Section title="For every session" sub="Claude Code, Codex, Custom and every other agent follow these, in every session">
        {!v ? (
          <div className="flex justify-center py-6 text-fg-3">
            <Throbber />
          </div>
        ) : (
          <>
            <Editor value={cur} onChange={setText} rows={10} />
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {TONES.map((t) => (
                <button
                  key={t}
                  type="button"
                  title="Add how agents talk to you"
                  onClick={() => setText(`${cur.trim() ? `${cur.trimEnd()}\n` : ''}How to talk to me: ${t}.`)}
                  className="h-7 rounded-full bg-bg-2 px-2.5 text-[12px] text-fg-2 transition-colors hover:bg-bg-3 hover:text-fg"
                >
                  {t}
                </button>
              ))}
            </div>
            <div className="mt-2.5 flex items-center justify-end gap-2">
              {text !== null && text !== v.global && (
                <Button size="sm" variant="ghost" onClick={() => setText(null)}>
                  Undo changes
                </Button>
              )}
              <Button size="sm" variant="primary" disabled={busy || text === null || text === v.global} onClick={save}>
                Save
              </Button>
            </div>
          </>
        )}
      </Section>
      <Section title="For a project" sub="Each project has guidelines of its own, which its sessions follow as well">
        {!withText.length ? (
          <p className="text-[13px] leading-relaxed text-fg-3">
            None of your projects has guidelines yet. Open a project in{' '}
            <button className="text-accent hover:underline" onClick={() => go('/spaces')}>
              Projects
            </button>{' '}
            to give it some.
          </p>
        ) : (
          <div className="-mx-2 divide-y divide-line">
            {withText.map((s) => (
              <button key={s.id} onClick={() => go(`/spaces/${enc(s.id)}`)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-bg-1">
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-medium">{s.name}</span>
                  <span translate="no" className="block truncate text-[12.5px] text-fg-3">
                    {s.instructions!.trim().split('\n')[0]}
                  </span>
                </span>
                <ChevronRight size={15} className="shrink-0 text-fg-3" />
              </button>
            ))}
          </div>
        )}
      </Section>
      <Section title="For one session" sub="On the start page: Options → Guidelines. In a session: its menu → Guidelines">
        <p className="text-[13px] leading-relaxed text-fg-3">Where two levels disagree, the more specific one wins: a session’s over its project’s, a project’s over these. What you ask in the conversation comes first of all.</p>
      </Section>
      <div className="rounded-2xl border border-line">
        <button onClick={() => setFilesOpen((o) => !o)} aria-expanded={filesOpen} className="flex w-full items-center gap-2.5 px-5 py-3.5 text-left">
          <ChevronRight size={15} className={cx('shrink-0 text-fg-3 transition-transform', filesOpen && 'rotate-90')} />
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-medium">Files Claude Code and Codex read too</span>
            <span className="block text-[12.5px] text-fg-3">CLAUDE.md and AGENTS.md in a project’s folder, for people who keep them there. The guidelines above work for every agent.</span>
          </span>
        </button>
        {filesOpen && <div className="border-t border-line px-5 pt-4 pb-5">{files}</div>}
      </div>
    </div>
  );
}

// ---- the three levels in one dialog --------------------------------------------------------------------

type Level = 'session' | 'space' | 'global';

/**
 * Every level a session follows, one at a time. `session` is a running session's key; on the start page,
 * `start` holds the new session's own text (kept in its start options until it starts).
 */
export function GuidelinesDialog({
  open,
  onClose,
  sessionKey,
  spaceId,
  start,
}: {
  open: boolean;
  onClose: () => void;
  sessionKey?: string;
  spaceId?: string;
  start?: { value: string; onChange: (v: string) => void };
}) {
  const [v] = useGuidelines({ key: sessionKey, space: spaceId });
  const [level, setLevel] = useState<Level>('session');
  const [draft, setDraft] = useState<Partial<Record<Level, string>>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setDraft({});
      setLevel('session');
    }
  }, [open]);
  const saved: Record<Level, string> = { session: start ? start.value : (v?.session?.text ?? ''), space: v?.space?.text ?? '', global: v?.global ?? '' };
  const text = (l: Level) => draft[l] ?? saved[l];
  const changed = (['session', 'space', 'global'] as Level[]).filter((l) => draft[l] !== undefined && draft[l] !== saved[l]);
  const save = async () => {
    setBusy(true);
    try {
      if (start && changed.includes('session')) start.onChange(text('session'));
      const body: GuidelinesPut = {
        ...(changed.includes('global') ? { global: text('global') } : {}),
        ...(changed.includes('space') && v?.space ? { space: { id: v.space.id, text: text('space') } } : {}),
        ...(changed.includes('session') && sessionKey ? { session: { key: sessionKey, text: text('session') } } : {}),
      };
      if (Object.keys(body).length) await put('/api/guidelines', body);
      onClose();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  // A dot on each level that has some.
  const tab = (l: Level, name: ReactNode) => (
    <span className="inline-flex items-center gap-1.5">
      {name}
      {text(l).trim() && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />}
    </span>
  );
  const options: { value: Level; label: ReactNode }[] = [
    { value: 'session', label: tab('session', 'This session') },
    ...(v?.space ? [{ value: 'space' as const, label: tab('space', <span translate="no">{v.space.name}</span>) }] : []),
    { value: 'global', label: tab('global', 'Every session') },
  ];
  const sub: Record<Level, string> = {
    session: start ? 'Only the session you are starting follows these.' : 'Only this session follows these. A change takes effect from your next message.',
    space: `Every session in ${v?.space?.name ?? 'this project'} follows these.`,
    global: 'Every agent follows these, in every session.',
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      width={620}
      title="Agent Guidelines"
      footer={
        <>
          <Button size="sm" variant="ghost" className="mr-auto" onClick={() => (onClose(), go('/guide/guidelines'))}>
            How they work
          </Button>
          <Button size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" variant="primary" disabled={busy || !changed.length} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      {!v ? (
        <div className="flex justify-center py-8 text-fg-3">
          <Throbber />
        </div>
      ) : (
        <div className="space-y-3">
          <Segmented size="sm" value={level} onChange={setLevel} options={options} />
          <p className="text-[12.5px] leading-snug text-fg-3">{sub[level]} Where levels disagree, the more specific one wins.</p>
          <Editor key={level} value={text(level)} onChange={(x) => setDraft((d) => ({ ...d, [level]: x }))} autoFocus />
        </div>
      )}
    </Dialog>
  );
}

// ---- a session's menu, and the start page --------------------------------------------------------------

/** On the start page, under Options: the new session's own guidelines (and the others, to look at). */
export function GuidelinesStartOption({ value, onChange }: { value: SessionExtra; onChange: (patch: Partial<SessionExtra>) => void }) {
  const [open, setOpen] = useState(false);
  const own = typeof value.guidelines === 'string' ? value.guidelines : '';
  return (
    <>
      <SettingChip
        label="Guidelines"
        icon={<ScrollText size={14} />}
        value={own.trim() ? 'For this session' : 'As usual'}
        on={!!own.trim()}
        open={open}
        onClick={() => setOpen(true)}
        title="What the agent follows: your guidelines for every session and the project’s, and any for this session alone"
      />
      <GuidelinesDialog
        open={open}
        onClose={() => setOpen(false)}
        spaceId={typeof value.space === 'string' ? value.space : undefined}
        start={{ value: own, onChange: (g) => onChange({ guidelines: g.trim() ? g : undefined }) }}
      />
    </>
  );
}

export const hasGuidelines = (x?: SessionExtra) => typeof x?.guidelines === 'string' && !!x.guidelines.trim();
