// A template an agent builds, beside its conversation: each save leaves a card in the conversation, and on
// a wide screen the newest opens the template's editor beside it (as a page being written opens), where it
// changes as the agent saves and what you save reaches the agent with your next message. app_try leaves how
// each try went; app_screen, the screen it gave.
import { useEffect } from 'react';
import { create } from 'zustand';
import { ExternalLink, FlaskConical, LayoutGrid, PanelRight, X } from 'lucide-react';
import type { SessionSummary, ToolItem } from '@shared/types';
import { enc } from '../../lib/api';
import { go } from '../../lib/nav';
import { cx, IconButton, Throbber, useMediaQuery } from '../../components/ui';
import { closeCanvas, Grip } from '../pages/Canvas';
import { CANVAS_MEDIA, useCanvas } from '../pages/state';
import { appPath, money, runPath } from './api';
import { BuilderPage } from './Builder';

/** Wide enough for the editor beside the conversation (as for pages). */
const WIDE = CANVAS_MEDIA;

export const useAppSide = create<{ open: Record<string, string>; show: (key: string, app: string) => void; close: (key: string) => void }>((set) => ({
  open: {},
  show: (key, app) => set((s) => ({ open: { ...s.open, [key]: app } })),
  close: (key) => set((s) => ({ open: Object.fromEntries(Object.entries(s.open).filter(([k]) => k !== key)) })),
}));

export function useAppSideOpen(key: string): boolean {
  const open = !!useAppSide((x) => x.open[key]);
  const wide = useMediaQuery(WIDE);
  return open && wide;
}
export const closeAppSide = (key: string) => useAppSide.getState().close(key);

/** Opens a template beside a session's conversation where there is room, else its editor's own page. */
function openTemplate(key: string, app: string) {
  if (!matchMedia(WIDE).matches) return go(`${appPath(app)}/edit`);
  closeCanvas(key);
  useAppSide.getState().show(key, app);
}

/** The template beside the conversation: its editor, as you would change it yourself. */
export function AppSide({ s }: { s: SessionSummary }) {
  const id = useAppSide((x) => x.open[s.key]);
  const width = useCanvas((x) => x.width);
  if (!id) return null;
  return (
    <aside style={{ width: `${width * 100}%` }} className="relative flex min-h-0 shrink-0 flex-col border-l border-line bg-bg">
      <Grip />
      <div className="flex shrink-0 items-center justify-end gap-1 border-b border-line px-2 py-1.5">
        <IconButton label="Open its page" size="sm" onClick={() => go(appPath(id))}>
          <ExternalLink size={14} />
        </IconButton>
        <IconButton label="Close" size="sm" onClick={() => closeAppSide(s.key)}>
          <X size={15} />
        </IconButton>
      </div>
      <div className="min-h-0 flex-1">
        <BuilderPage key={id} id={id} embedded session={s.key} />
      </div>
    </aside>
  );
}

/** What a tool call said, when it was one of the builder's: the template it saved, and the line it began with. */
const savedOf = (out: string) => /^(Made|Saved) “(.+?)” \(id ([a-z0-9]+)/.exec(out);

/** app_save in the conversation: the template made or changed (opening beside it while it is new), or why it was not saved. */
function SavedRow({ item, sessionKey }: { item: ToolItem; sessionKey: string }) {
  const t = item.tool;
  const out = t.output ?? '';
  const running = t.status === 'running' || t.status === 'pending';
  const m = savedOf(out);
  const why = typeof (t.input as { why?: unknown } | undefined)?.why === 'string' ? (t.input as { why: string }).why : '';
  // A save as it happens opens the template beside the conversation.
  useEffect(() => {
    if (!m || !item.ts || Date.now() - item.ts > 20_000 || !matchMedia(WIDE).matches) return;
    if (!useAppSide.getState().open[sessionKey]) openTemplate(sessionKey, m[3]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m?.[3]]);
  if (running) return <Line icon={<Throbber className="h-3.5" />} text="Saving the app…" />;
  if (!m)
    return (
      <div className="my-2 rounded-xl bg-bg-2 px-3 py-2 text-[12.5px] whitespace-pre-wrap text-fg-2" translate="no">
        {out.slice(0, 1200)}
      </div>
    );
  return (
    <div className="my-2 flex items-center gap-3 rounded-xl border border-line bg-panel px-3 py-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-bg-2 text-fg-2">
        <LayoutGrid size={15} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-medium" translate="no">
          {m[2]}
        </span>
        <span className="block truncate text-[12px] text-fg-3">
          <span>{m[1] === 'Made' ? 'A new app' : 'Changed'}</span>
          {why && <span translate="no"> · {why}</span>}
        </span>
      </span>
      <IconButton label="Open beside" size="sm" onClick={() => openTemplate(sessionKey, m[3])}>
        <PanelRight size={15} />
      </IconButton>
      <IconButton label="Open its page" size="sm" onClick={() => go(appPath(m[3]))}>
        <ExternalLink size={14} />
      </IconButton>
    </div>
  );
}

function Line({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="my-1.5 flex items-center gap-2 text-[13px] text-fg-2">
      <span className="flex w-4 justify-center text-fg-3">{icon}</span>
      {text}
    </div>
  );
}

interface Tried {
  run: string;
  example?: string;
  status: string;
  error?: string;
  checks?: { rule: string; ok: boolean }[];
  costUsd?: number;
  seconds?: number;
}

/** app_try in the conversation: how each try went. */
function TriedRow({ item }: { item: ToolItem; sessionKey: string }) {
  const t = item.tool;
  if (t.status === 'running' || t.status === 'pending') return <Line icon={<Throbber className="h-3.5" />} text="Trying the app…" />;
  let runs: Tried[] = [];
  try {
    runs = (JSON.parse(t.output ?? '') as { runs?: Tried[] }).runs ?? [];
  } catch {}
  if (!runs.length)
    return (
      <div className="my-2 rounded-xl bg-bg-2 px-3 py-2 text-[12.5px] whitespace-pre-wrap text-fg-2" translate="no">
        {(t.output ?? '').slice(0, 1200)}
      </div>
    );
  return (
    <div className="my-2 rounded-xl border border-line bg-panel px-3 py-2">
      {runs.map((r) => {
        const failed = (r.checks ?? []).filter((c) => !c.ok).length;
        const good = r.status === 'done' && !failed;
        return (
          <button key={r.run} type="button" onClick={() => go(runPath(r.run))} className="flex w-full items-center gap-2.5 rounded-lg py-1 text-left hover:bg-bg-2">
            <FlaskConical size={14} className={cx('shrink-0', good ? 'text-ok' : r.status === 'done' || r.status === 'failed' ? 'text-err' : 'text-fg-3')} />
            <span className="min-w-0 flex-1 truncate text-[13px]" translate="no">
              {r.example ?? 'A try'}
            </span>
            <span className={cx('shrink-0 text-[12px]', good ? 'text-ok' : 'text-err')}>
              {r.status === 'done' ? (failed ? `${failed} of ${r.checks!.length} checks failed` : 'Passed') : r.status === 'failed' ? 'Did not finish' : 'Still running'}
            </span>
            <span className="shrink-0 text-[12px] text-fg-3">
              {r.seconds !== undefined ? `${r.seconds} s` : ''}
              {r.costUsd ? ` · ${money(r.costUsd)}` : ''}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** app_screen in the conversation: the screen it gave a template. */
function ScreenRow({ item }: { item: ToolItem; sessionKey: string }) {
  const t = item.tool;
  if (t.status === 'running' || t.status === 'pending') return <Line icon={<Throbber className="h-3.5" />} text="Making its screen…" />;
  const m = /\/apps\/([a-z0-9]+)/.exec(t.output ?? '');
  return (
    <div className="my-2 flex items-center gap-3 text-[13px]">
      <span className="min-w-0 flex-1 text-fg-2" translate="no">
        {(t.output ?? '').split(':')[0]}
      </span>
      {m && (
        <button type="button" className="shrink-0 text-[12.5px] text-accent hover:underline" onClick={() => go(`/apps/${enc(m[1])}`)}>
          Open it
        </button>
      )}
    </div>
  );
}

export const BUILDER_VIEWS = {
  app_save: { place: 'answer' as const, Row: SavedRow },
  app_try: { place: 'answer' as const, Row: TriedRow },
  app_screen: { place: 'answer' as const, Row: ScreenRow },
};
