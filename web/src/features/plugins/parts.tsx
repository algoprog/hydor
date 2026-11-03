// Pieces the plugin pages share: a plugin's tile and where it comes from, what it brings in a few words,
// and a job (adding one, setting it up, updating it) as it runs.
import { useState } from 'react';
import {
  BookOpen,
  BrainCircuit,
  CalendarDays,
  ChartColumn,
  Check,
  ChevronRight,
  Code2,
  Database,
  Film,
  Globe,
  Image,
  Mail,
  Mic,
  NotebookPen,
  Puzzle,
  ScanText,
  Search,
  Sparkles,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { PluginJob, PluginView } from '@shared/plugins';
import { cx, Throbber } from '../../components/ui';

/** The icons a plugin can name in its manifest ("icon": "mic"). */
export const PLUGIN_ICONS: Record<string, LucideIcon> = {
  puzzle: Puzzle,
  database: Database,
  chart: ChartColumn,
  film: Film,
  mic: Mic,
  notes: NotebookPen,
  book: BookOpen,
  scan: ScanText,
  code: Code2,
  globe: Globe,
  image: Image,
  mail: Mail,
  calendar: CalendarDays,
  search: Search,
  wrench: Wrench,
  sparkles: Sparkles,
  ai: BrainCircuit,
};

const TONE: Record<string, string> = {
  data: 'bg-ok/12 text-ok',
  creative: 'bg-claude/12 text-claude',
  documents: 'bg-info/12 text-info',
  research: 'bg-info/12 text-info',
  planning: 'bg-warn/12 text-warn',
  coding: 'bg-codex/12 text-codex',
  writing: 'bg-accent/14 text-accent',
  ai: 'bg-accent/14 text-accent',
};

export function PluginTile({ p, size = 38 }: { p: Pick<PluginView, 'icon' | 'category'>; size?: number }) {
  const Icon = (p.icon && PLUGIN_ICONS[p.icon]) || Puzzle;
  return (
    <span className={cx('flex shrink-0 items-center justify-center rounded-[11px]', (p.category && TONE[p.category]) || 'bg-bg-3 text-fg-2')} style={{ width: size, height: size }}>
      <Icon size={Math.round(size * 0.47)} />
    </span>
  );
}

/** Where a plugin comes from, in a few words. */
export function sourceLabel(p: PluginView): string {
  const s = p.source;
  if (s.kind === 'builtin') return 'Comes with the app';
  if (s.kind === 'git') return `Added from ${s.url.replace(/^https:\/\//, '').replace(/\.git$/, '')}${s.subdir ? `/${s.subdir}` : ''}`;
  if (s.kind === 'file') return `Added from the file ${s.file}`;
  return s.mine ? 'Made here' : 'From a folder on this computer';
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** What a plugin gives agents, in a few words: "2 skills · 1 tool server · instructions". */
export function brings(p: PluginView): string {
  const parts: string[] = [];
  if (p.skills.length) parts.push(plural(p.skills.length, 'skill'));
  const servers = p.servers.filter((s) => !s.problem).length;
  if (servers) parts.push(plural(servers, 'tool server'));
  if (p.instructions) parts.push('instructions');
  if (p.files.length) parts.push(plural(p.files.length, 'file'));
  return parts.join(' · ');
}

/** What stops a plugin from working fully, if anything, for its card. */
export function trouble(p: PluginView, titles: Record<string, string>): { tone: 'warn' | 'err' | 'note'; text: string } | null {
  if (p.problems.length && !p.skills.length && !p.servers.length) return { tone: 'err', text: p.problems[0] };
  // Not added yet: the plugins it needs come with it.
  if (!p.installed) return p.missing.plugins.length ? { tone: 'note', text: `Comes with ${p.missing.plugins.map((n) => titles[n] ?? n).join(', ')}` } : p.missing.commands.length ? { tone: 'warn', text: `Needs ${p.missing.commands.join(', ')} on this computer` } : null;
  if (p.setup.state === 'failed') return { tone: 'err', text: `Setting it up failed${p.setup.error ? `: ${p.setup.error}` : ''}` };
  if (p.setup.state === 'outdated' && p.installed) return { tone: 'warn', text: 'Needs setting up again' };
  if (p.missing.plugins.length) return { tone: 'err', text: `Needs ${p.missing.plugins.map((n) => titles[n] ?? n).join(', ')}` };
  if (p.missing.commands.length) return { tone: 'warn', text: `Needs ${p.missing.commands.join(', ')} on this computer` };
  if (p.missing.keys.length) return { tone: 'warn', text: `Needs the key ${p.missing.keys.join(', ')}` };
  return null;
}

/** What a job is doing, as one sentence each (so each translates whole). */
function jobTitle(job: PluginJob, t: string): string {
  if (job.state === 'done') return `${t} is ready`;
  if (job.state === 'running') return job.action === 'install' ? `Adding ${t}…` : job.action === 'update' ? `Updating ${t}…` : `Setting up ${t}…`;
  return job.action === 'install' ? `Adding ${t} failed` : job.action === 'update' ? `Updating ${t} failed` : `Setting up ${t} failed`;
}

/** A job running or just done: its steps, and its log on demand. */
export function JobView({ job, title }: { job: PluginJob; title?: string }) {
  const [log, setLog] = useState(false);
  return (
    <div className={cx('rounded-xl border px-3.5 py-3', job.state === 'failed' ? 'border-err/35 bg-err/5' : 'border-line bg-bg-1')}>
      <div className="flex items-center gap-2 text-[13.5px] font-medium">
        {job.state === 'running' ? <Throbber /> : job.state === 'done' ? <Check size={15} className="text-ok" /> : <X size={15} className="text-err" />}
        <span className="min-w-0 flex-1 truncate">{jobTitle(job, title ?? job.plugin)}</span>
      </div>
      {job.steps.length > 0 && (
        <ol className="mt-2 space-y-1 pl-0.5">
          {job.steps.map((s, n) => (
            <li key={n} className="flex items-center gap-2 text-[12.5px] text-fg-2">
              <span className="flex w-4 shrink-0 justify-center">
                {s.state === 'running' ? <Throbber className="h-3" /> : s.state === 'done' ? <Check size={13} className="text-ok" /> : s.state === 'failed' ? <X size={13} className="text-err" /> : <span className="h-1.5 w-1.5 rounded-full bg-fg-3" />}
              </span>
              <span className="min-w-0 truncate">{s.label}</span>
            </li>
          ))}
        </ol>
      )}
      {job.error && <p className="mt-2 text-[12.5px] leading-snug break-words text-err">{job.error}</p>}
      {job.log.trim() && (
        <div className="mt-2">
          <button type="button" onClick={() => setLog((o) => !o)} className="flex items-center gap-1 text-[12px] text-fg-3 hover:text-fg">
            <ChevronRight size={13} className={cx('transition-transform', log && 'rotate-90')} />
            {log ? 'Hide what it printed' : 'Show what it printed'}
          </button>
          {log && <pre className="mt-1.5 max-h-56 overflow-auto rounded-lg bg-bg-2 p-2.5 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-fg-2">{job.log.slice(-12_000)}</pre>}
        </div>
      )}
    </div>
  );
}
