// Agent Guidelines in the pages: one text every agent follows (Claude Code, Codex, Custom and the others), for
// every session, a space or one session. Settings → Agents → Agent Guidelines holds every session's (and the
// files Claude Code and Codex read on their own, folded away); a session's menu and the start page's Options
// open the three levels in one dialog.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, FolderKanban, ScrollText } from 'lucide-react';
import { MAX_GUIDELINES, type GuidelinesPut, type GuidelinesView } from '@shared/guidelines';
import type { SessionExtra } from '@shared/features';
import { api, enc, put } from '../../lib/api';
import { useFeatureEvent } from '../../lib/featureEvents';
import { go } from '../../lib/nav';
import { toast, toastError } from '../../lib/store';
import { Button, cx, Dialog, inputCls, MenuItem, Popover, Segmented, SettingChip, Throbber } from '../../components/ui';
import { EmptyRow, Group, Row, Stack } from '../settings/kit';
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

/** "Start from…": adds one of the ready-made ways to talk to you to the text. */
function StartFrom({ onPick }: { onPick: (tone: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <Button ref={ref} size="sm" variant="ghost" title="Add how agents talk to you" onClick={() => setOpen((o) => !o)}>
        Start from…
        <ChevronDown size={14} className={cx('transition-transform duration-200', open && 'rotate-180')} />
      </Button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={300} title="Start from…">
        {TONES.map((t) => (
          <MenuItem
            key={t}
            onClick={() => {
              setOpen(false);
              onPick(t);
            }}
          >
            {t}
          </MenuItem>
        ))}
      </Popover>
    </>
  );
}

/** How many projects show before "Show all". */
const PROJECTS_SHOWN = 6;

export function GuidelinesSettings({ files }: { files: ReactNode }) {
  const [v] = useGuidelines({});
  const [text, setText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filesOpen, setFilesOpen] = useState(false);
  const [allProjects, setAllProjects] = useState(false);
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
  const shown = allProjects ? withText : withText.slice(0, PROJECTS_SHOWN);
  const dirty = !!v && text !== null && text !== v.global;
  return (
    <Stack>
      <Group title="For every session" hint="Every agent follows these, in every session">
        {!v ? (
          <div className="flex justify-center py-8 text-fg-3">
            <Throbber />
          </div>
        ) : (
          <>
            <div className="px-1.5 pt-1.5">
              <textarea
                rows={9}
                maxLength={MAX_GUIDELINES}
                value={cur}
                onChange={(e) => setText(e.target.value)}
                placeholder={PLACEHOLDER}
                aria-label="Guidelines for every session"
                className="block w-full resize-y rounded-lg bg-transparent px-2.5 py-2 text-[13.5px] leading-relaxed text-fg outline-none placeholder:text-fg-3 focus:bg-bg-1"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 px-2.5 py-2">
              <StartFrom onPick={(t) => setText(`${cur.trim() ? `${cur.trimEnd()}\n` : ''}How to talk to me: ${t}.`)} />
              {cur.length > MAX_GUIDELINES * 0.8 && (
                <span className="text-[11.5px] text-fg-3">
                  {cur.length.toLocaleString()} of {MAX_GUIDELINES.toLocaleString()}
                </span>
              )}
              <span className="ml-auto flex items-center gap-2">
                {dirty && (
                  <Button size="sm" variant="ghost" onClick={() => setText(null)}>
                    Undo changes
                  </Button>
                )}
                <Button size="sm" variant="primary" disabled={busy || !dirty} onClick={save}>
                  Save
                </Button>
              </span>
            </div>
          </>
        )}
      </Group>
      <Group title="For a project" hint="Each project’s own guidelines, which its sessions follow too">
        {!spaces ? (
          <div className="flex justify-center py-6 text-fg-3">
            <Throbber />
          </div>
        ) : !withText.length ? (
          <EmptyRow
            action={
              <Button size="sm" variant="secondary" onClick={() => go('/projects')}>
                Open Projects
              </Button>
            }
          >
            None of your projects has guidelines yet
          </EmptyRow>
        ) : (
          <>
            {shown.map((s) => (
              <Row
                key={s.id}
                icon={<FolderKanban size={16} />}
                label={<span translate="no">{s.name}</span>}
                hint={
                  <span translate="no" className="line-clamp-1">
                    {s.instructions!.trim().split('\n')[0]}
                  </span>
                }
                onClick={() => go(`/projects/${enc(s.id)}`)}
              />
            ))}
            {withText.length > PROJECTS_SHOWN && (
              <button type="button" onClick={() => setAllProjects((a) => !a)} className="w-full rounded-b-[11px] px-4 py-2.5 text-left text-[13px] text-fg-3 transition-colors hover:bg-bg-1 hover:text-fg">
                {allProjects ? 'Show fewer' : `Show all ${withText.length}`}
              </button>
            )}
          </>
        )}
      </Group>
      <Group title="For one session" info="Where two levels disagree, the more specific one wins: a session’s over its project’s, a project’s over the ones for every session. What you ask in the conversation comes first of all.">
        <Row label="On the start page" hint="Options → Guidelines" />
        <Row label="In a session" hint="Its menu → Guidelines" />
      </Group>
      <div>
        <Group>
          <Row
            label="Instruction files"
            hint="CLAUDE.md and AGENTS.md in a project’s folder"
            info="Claude Code and Codex read these files on their own, for people who keep them in a repository. The guidelines above work for every agent."
            control={<ChevronDown size={16} className={cx('text-fg-3 transition-transform duration-200', filesOpen && 'rotate-180')} />}
            onClick={() => setFilesOpen((o) => !o)}
          />
        </Group>
        {filesOpen && <div className="mt-3">{files}</div>}
      </div>
    </Stack>
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
