// Deep research: on the start page, an option under Options (with its breadth, depth, search budget and what
// it delivers); in the lead's session, a bar over the message box with what it is doing, the searches used and
// its report once delivered; in a researcher's, whose research it is part of.
import { useEffect, useRef, useState } from 'react';
import { Telescope } from 'lucide-react';
import type { SessionExtra } from '@shared/features';
import { cleanResearch, RESEARCH_DEFAULTS, RESEARCH_LIMITS, researchOf, type ResearchSettings, type ResearchState } from '@shared/research';
import type { SessionSummary } from '@shared/types';
import { OptionRow, Popover, Segmented, SettingChip } from '../../components/ui';
import { activityOf, isBusy } from '../../lib/activity';
import { api, enc } from '../../lib/api';
import { useFeatureEvent } from '../../lib/featureEvents';
import { go, openFile, openSession } from '../../lib/nav';
import { useApp, useSessions, useTimeline } from '../../lib/store';
import { resolveIn } from '../documents/fileTypes';
import { usePagesStore } from '../pages/state';
import { nagetTool, type WebFeature } from '../registry';

const DOCK = 'mx-3 mb-2 flex items-center gap-2 rounded-xl border border-line bg-bg-1 px-3 py-1.5 text-[12.5px] sm:mx-auto sm:w-[calc(100%-48px)] sm:max-w-[800px]';
/** The settings picked last, for the next research (the mode itself is picked each time: it costs more). */
const LAST = 'naget.research.v1';
const last = (): ResearchSettings => {
  try {
    return cleanResearch(JSON.parse(localStorage.getItem(LAST) ?? 'null') ?? RESEARCH_DEFAULTS);
  } catch {
    return RESEARCH_DEFAULTS;
  }
};

/** The report once the lead has delivered it: its page in Pages, or the Word document it handed over. */
function useReport(s: SessionSummary, r: ResearchSettings): { open: () => void } | null {
  const pages = usePagesStore((x) => x.pages);
  const items = useTimeline((x) => x.byKey[s.key]?.items);
  const home = useApp((x) => x.boot?.home);
  useEffect(() => {
    if (r.format === 'page' && !usePagesStore.getState().pages) usePagesStore.getState().loadPages().catch(() => {});
  }, [r.format]);
  if (r.format === 'page') {
    const page = pages?.filter((p) => p.sessionKey === s.key).sort((a, b) => b.updatedAt - a.updatedAt)[0];
    return page ? { open: () => go(`/pages/${page.id}`) } : null;
  }
  for (let i = (items?.length ?? 0) - 1; i >= 0; i--) {
    const it = items![i];
    if (it.kind !== 'tool' || nagetTool(it.tool.name) !== 'present_files') continue;
    const files = (it.tool.input as { files?: unknown } | undefined)?.files;
    const doc = (Array.isArray(files) ? files : []).map((f) => (typeof f === 'string' ? f : (f as { path?: unknown } | null)?.path)).find((p): p is string => typeof p === 'string' && /\.docx$/i.test(p));
    if (doc) return { open: () => openFile(resolveIn(doc, s.cwd, home)) };
  }
  return null;
}

/** In the lead's session: what the research is doing now, the searches it has used, and its report once it is there. */
function LeadDock({ s, r }: { s: SessionSummary; r: ResearchSettings }) {
  const [st, setSt] = useState<ResearchState | null>(null);
  useEffect(() => {
    api<ResearchState>(`/api/research/${enc(s.key)}`).then(setSt, () => {});
  }, [s.key]);
  useFeatureEvent('research', (e) => e.key === s.key && setSt(e.data as ResearchState));
  // A count, not a list: a selector that makes a new array on every call never settles, and React gives up (a blank page).
  const keys = st?.researchers ?? [];
  const working = useSessions((x) => keys.filter((k) => isBusy(activityOf(x.byKey[k]))).length);
  const report = useReport(s, r);
  const leading = isBusy(activityOf(s));
  const rounds = st?.rounds ?? 0;
  // Whole sentences, so that each translates as one.
  const now = working
    ? rounds > r.depth
      ? `Checking the sources · ${working} researcher${working === 1 ? '' : 's'} at work`
      : `Round ${rounds} of ${r.depth} · ${working} researcher${working === 1 ? '' : 's'} at work`
    : report && !leading
      ? 'Report ready'
      : !rounds
        ? 'Planning'
        : leading
          ? rounds >= r.depth
            ? 'Writing the report'
            : 'Reading the reports'
          : `Round ${Math.min(rounds, r.depth)} of ${r.depth}`;
  return (
    <div
      className={DOCK}
      title={
        r.format === 'document'
          ? `${r.breadth} researchers at a time, ${r.depth} rounds and at most ${r.queries} searches. The report comes as a Word document.`
          : `${r.breadth} researchers at a time, ${r.depth} rounds and at most ${r.queries} searches. The report comes as a page in Pages.`
      }
    >
      <Telescope size={14} className="shrink-0 text-fg-3" />
      <span className="min-w-0 flex-1 truncate text-fg-2">
        <span className="font-medium text-fg">Deep research</span> · {now}
        <span className="text-fg-3">
          {' '}
          · {st?.used ?? 0} of {r.queries} searches
        </span>
      </span>
      {report && (
        <button type="button" onClick={report.open} className="shrink-0 font-medium text-accent hover:underline">
          Open report
        </button>
      )}
    </div>
  );
}

function ResearchDock({ s }: { s: SessionSummary }) {
  const own = researchOf(s.extra);
  const parent = typeof s.extra?.parent === 'string' ? s.extra.parent : undefined;
  const lead = useSessions((x) => (parent ? x.byKey[parent] : undefined));
  if (own) return <LeadDock s={s} r={own} />;
  if (!lead || !researchOf(lead.extra)) return null;
  return (
    <div className={DOCK}>
      <Telescope size={14} className="shrink-0 text-fg-3" />
      <span className="min-w-0 flex-1 truncate text-fg-2">
        Researching for <span className="text-fg">{lead.title}</span>
        <span className="max-sm:hidden">: its report goes there</span>
      </span>
      <button type="button" onClick={() => openSession(lead.key)} className="shrink-0 font-medium text-accent hover:underline">
        Lead
      </button>
    </div>
  );
}

/** One of the numbers: a minus, the value and a plus, within its limits. */
function Stepper({ label, hint, value, step = 1, limits, onChange }: { label: string; hint: string; value: number; step?: number; limits: readonly [number, number]; onChange: (v: number) => void }) {
  const btn = 'flex h-7 w-7 items-center justify-center rounded-md text-[15px] text-fg-2 ring-1 ring-line-2 ring-inset hover:bg-bg-2 hover:text-fg disabled:opacity-40';
  return (
    <div className="flex items-center gap-2 px-2 py-1.5">
      <div className="min-w-0 flex-1">
        <div className="text-[13px]">{label}</div>
        <div className="text-[11.5px] leading-snug text-fg-3">{hint}</div>
      </div>
      <button type="button" className={btn} disabled={value <= limits[0]} onClick={() => onChange(Math.max(limits[0], value - step))} aria-label={`Fewer: ${label}`}>
        −
      </button>
      <span className="tnum w-8 text-center text-[13.5px] font-medium">{value}</span>
      <button type="button" className={btn} disabled={value >= limits[1]} onClick={() => onChange(Math.min(limits[1], value + step))} aria-label={`More: ${label}`}>
        +
      </button>
    </div>
  );
}

/** On the start page, under Options: one agent answering, or a deep research with its settings. Not kept for the next start. */
function ResearchStartOption({ value, onChange }: { value: SessionExtra; onChange: (patch: Partial<SessionExtra>) => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const r = researchOf(value);
  const set = (next: ResearchSettings | undefined) => {
    if (next) localStorage.setItem(LAST, JSON.stringify(next));
    // A research and a swarm both lead child sessions: one or the other.
    onChange(next ? { research: next, swarm: undefined } : { research: undefined });
  };
  const cur = r ?? last();
  return (
    <>
      <SettingChip
        ref={ref}
        label="Research"
        value={r ? `Deep · ${r.queries} searches` : 'Off'}
        on={!!r}
        open={open}
        onClick={() => setOpen((o) => !o)}
        title={r ? `Deep research: ${r.breadth} researchers at a time, ${r.depth} rounds, at most ${r.queries} searches, a cited ${r.format === 'document' ? 'Word document' : 'page'}` : 'One agent answers'}
      />
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={320} title="Deep research">
        <OptionRow label="Off" hint="One agent answers, searching as it needs" selected={!r} onClick={() => (set(undefined), setOpen(false))} />
        <OptionRow label="Deep research" hint="Searches widely, checks the sources, cites them" selected={!!r} onClick={() => set(cur)} />
        {r && (
          <div className="mx-1 mt-1 border-t border-line pt-1">
            <Stepper label="Researchers at a time" hint="How wide each round searches" value={r.breadth} limits={RESEARCH_LIMITS.breadth} onChange={(breadth) => set({ ...r, breadth })} />
            <Stepper label="Rounds" hint="How deep it digs into what is left open" value={r.depth} limits={RESEARCH_LIMITS.depth} onChange={(depth) => set({ ...r, depth })} />
            <Stepper label="Searches in all" hint="The budget for the whole research" value={r.queries} step={10} limits={RESEARCH_LIMITS.queries} onChange={(queries) => set({ ...r, queries })} />
            <div className="flex items-center gap-2 px-2 py-1.5">
              <span className="min-w-0 flex-1 text-[13px]">The report</span>
              <Segmented
                size="sm"
                value={r.format}
                onChange={(format) => set({ ...r, format })}
                options={[
                  { value: 'page', label: 'Page' },
                  { value: 'document', label: 'Word' },
                ]}
              />
            </div>
          </div>
        )}
        <div className="mx-1 mt-1 border-t border-line px-2 pt-2 pb-1 text-[12px] leading-snug text-fg-3">
          The agent splits your question into parts, sends a researcher after each, digs into what they leave open, has the key claims checked against two sources, and
          delivers a report with every source cited. It costs several times what one answer does: a spending cap keeps it in hand.
        </div>
      </Popover>
    </>
  );
}

export const researchFeature: WebFeature = {
  id: 'research',
  SessionDock: ResearchDock,
  StartOptions: ResearchStartOption,
};
