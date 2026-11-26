// "Is this new?": what the prior_work tool found, in the conversation. The verdict as a quiet chip, what exists and
// what does not seem to, the closest papers (each a link to its source) with what is the same and what differs, and
// the note that finding nothing is not proof. While it checks, or when it failed, a step like any other.
import { useState } from 'react';
import { SearchCheck } from 'lucide-react';
import type { PriorPaper, PriorVerdict, PriorWork } from '@shared/prior-work';
import type { ToolInfo, ToolItem } from '@shared/types';
import { Badge } from '../../components/ui';
import { StepRow } from '../automations/StepRow';

/** As many papers as the card shows before asking. */
const FIRST = 3;

/** The check's answer, from the tool's output (which may have a note after it), or null. */
function priorOf(t: ToolInfo): PriorWork | null {
  const out = t.status === 'error' ? '' : (t.output?.trim() ?? '');
  if (!out.startsWith('{')) return null;
  try {
    const w = JSON.parse(out.slice(0, out.lastIndexOf('}') + 1)) as PriorWork;
    return typeof w?.summary === 'string' && Array.isArray(w.closest) ? w : null;
  } catch {
    return null;
  }
}

function Verdict({ verdict }: { verdict: PriorVerdict }) {
  if (verdict === 'new') return <Badge tone="ok">Looks new</Badge>;
  if (verdict === 'partly') return <Badge tone="warn">Partly known</Badge>;
  if (verdict === 'known') return <Badge tone="info">Already known</Badge>;
  return <Badge>Not judged</Badge>;
}

function Paper({ p }: { p: PriorPaper }) {
  const about = [p.authors, p.year, p.venue].filter(Boolean).join(' · ');
  return (
    <li className="py-1.5">
      {/^https?:\/\//i.test(p.url) ? (
        <a href={p.url} target="_blank" rel="noopener noreferrer" translate="no" className="text-[13px] leading-snug font-medium break-words text-accent hover:underline">
          {p.title}
        </a>
      ) : (
        <span translate="no" className="text-[13px] leading-snug font-medium break-words">
          {p.title}
        </span>
      )}
      {about && (
        <div translate="no" className="text-[12px] leading-snug break-words text-fg-3">
          {about}
        </div>
      )}
      {p.same && (
        <div className="text-[12.5px] leading-snug text-fg-2">
          <span className="text-fg-3">Same:</span> <span translate="no">{p.same}</span>
        </div>
      )}
      {p.differs && (
        <div className="text-[12.5px] leading-snug text-fg-2">
          <span className="text-fg-3">Differs:</span> <span translate="no">{p.differs}</span>
        </div>
      )}
    </li>
  );
}

export function PriorWorkCard({ item, sessionKey }: { item: ToolItem; sessionKey: string }) {
  const [all, setAll] = useState(false);
  const w = priorOf(item.tool);
  if (!w) return <StepRow item={item} sessionKey={sessionKey} />;
  const shown = all ? w.closest : w.closest.slice(0, FIRST);
  return (
    <div className="my-2 rounded-xl border border-line bg-panel px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <SearchCheck size={15} className="shrink-0 text-fg-3" />
        <span className="text-[13.5px] font-medium">Is this new?</span>
        <Verdict verdict={w.verdict} />
      </div>
      <p translate="no" className="mt-1 text-[13px] leading-relaxed break-words text-fg-2">
        {w.summary}
      </p>
      {shown.length > 0 && (
        <ul className="mt-1.5 divide-y divide-line border-t border-line">
          {shown.map((p) => (
            <Paper key={p.url + p.title} p={p} />
          ))}
        </ul>
      )}
      {w.closest.length > FIRST && (
        <button type="button" onClick={() => setAll((a) => !a)} className="py-1 text-[12.5px] font-medium text-accent hover:underline">
          {all ? 'Show fewer' : `Show ${w.closest.length - FIRST} more`}
        </button>
      )}
      <p translate="no" className="mt-1 text-[11.5px] leading-snug text-fg-3">
        {w.note}
      </p>
    </div>
  );
}
