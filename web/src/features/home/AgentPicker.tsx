// Which agent a new session runs: Claude Code, Codex, Custom (any model) or another agent that speaks
// ACP, all in one list, none ahead of the others. The last one used is picked next time. A confidential
// session runs on Custom alone, with a model on this computer. A Claude Code or Codex not signed in here
// is listed as Not set up, with the way to set it up; one picked before stays picked, and says so.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronDown, Plus, SlidersHorizontal } from 'lucide-react';
import { PROGRAM_IDS, PROGRAM_LABEL, programUsable, type Program } from '@shared/programs';
import type { AcpAgentDef, Agent } from '@shared/types';
import { api } from '../../lib/api';
import { go } from '../../lib/nav';
import { useApp } from '../../lib/store';
import { AgentIcon } from '../../components/AgentIcon';
import { cx, MenuItem, MenuSep, OptionRow, Popover, SettingChip } from '../../components/ui';

const HINT: Record<'claude' | 'codex', string> = {
  claude: 'Anthropic · Claude plan or API key',
  codex: 'OpenAI · ChatGPT plan or API key',
};

/** A program that is not signed in here: greyed, not to be picked, with the way to where it is set up. */
function NotSetUpRow({ program, selected, onSetUp }: { program: Program; selected: boolean; onSetUp: () => void }) {
  return (
    <div className={cx('flex w-full items-start gap-2 rounded-lg px-2.5 py-1.5', selected && 'bg-bg-2')} aria-disabled="true">
      <span className="mt-0.5 shrink-0 text-fg-3 opacity-50">
        <AgentIcon agent={program} size={15} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] text-fg-3">{PROGRAM_LABEL[program]}</span>
        <span className="block truncate text-[11.5px] text-warn">Not set up</span>
      </span>
      <button type="button" onClick={onSetUp} className="shrink-0 self-center rounded-md px-1 text-[12px] font-medium text-accent hover:underline">
        Set up
      </button>
      {selected && <Check size={14} className="mt-1 shrink-0 text-fg-3" strokeWidth={2.5} />}
    </div>
  );
}

/** With `label`, a setting among the start page's others ("Agent  Claude Code"); else a pill of its own. `localOnly`: Custom alone (Confidential). */
export function AgentPicker({
  agent,
  acpId,
  acpList,
  onPick,
  label,
  localOnly,
}: {
  agent: Agent;
  acpId: string | null;
  acpList: AcpAgentDef[];
  onPick: (agent: Agent, acpId: string | null) => void;
  label?: string;
  localOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const acp = agent === 'acp' ? acpList.find((a) => a.id === acpId) : undefined;
  const name = agent === 'claude' ? 'Claude Code' : agent === 'codex' ? 'Codex' : (acp?.name ?? 'Agent');
  const programs = useApp((s) => s.boot?.programs);
  const unusable = !programUsable(programs, agent);
  const pick = (a: Agent, id: string | null = null) => {
    onPick(a, id);
    setOpen(false);
  };
  // Signed in from a terminal meanwhile: opened with one not set up, the accounts are read again.
  const someOut = PROGRAM_IDS.some((p) => !programUsable(programs, p));
  useEffect(() => {
    if (open && someOut) api('/api/accounts').catch(() => {});
  }, [open]);
  const row = (p: Program): ReactNode =>
    programUsable(programs, p) ? (
      <OptionRow icon={<AgentIcon agent={p} size={15} />} label={PROGRAM_LABEL[p]} hint={HINT[p]} selected={agent === p} onClick={() => pick(p)} />
    ) : (
      <NotSetUpRow program={p} selected={agent === p} onSetUp={() => (setOpen(false), go('/settings?s=accounts'))} />
    );
  return (
    <>
      {label ? (
        <SettingChip
          ref={ref}
          label={label}
          title="Which program runs the session: Claude Code, Codex, Custom or another"
          open={open}
          onClick={() => setOpen((o) => !o)}
          value={
            <span className="inline-flex items-center gap-1.5">
              <AgentIcon agent={agent} name={acp?.name} size={13} className="shrink-0" />
              {name}
              {unusable && <span className="text-warn">· Not set up</span>}
            </span>
          }
        />
      ) : (
        <button
          ref={ref}
          type="button"
          onClick={() => setOpen((o) => !o)}
          title="Which program runs the session: Claude Code, Codex, Custom or another"
          className={cx('inline-flex h-9 shrink-0 items-center gap-2 rounded-[10px] bg-bg-2 px-3 text-[13.5px] font-medium text-fg ring-1 ring-line transition-colors hover:bg-bg-3', open && 'bg-bg-3')}
        >
          <AgentIcon agent={agent} name={acp?.name} size={15} />
          <span className="max-w-[160px] truncate">{name}</span>
          {unusable && <span className="text-[12px] font-normal text-warn">Not set up</span>}
          <ChevronDown size={14} className={cx('text-fg-3 transition-transform duration-200', open && 'rotate-180')} />
        </button>
      )}
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={300} title="Runs on">
        {localOnly && <div className="px-2.5 pt-1 pb-1.5 text-[12px] leading-snug text-fg-3">Confidential: only Custom, with a model on this computer.</div>}
        {!localOnly && row('claude')}
        {!localOnly && row('codex')}
        {acpList.filter((a) => !localOnly || a.builtin).map((a) => (
          <OptionRow
            key={a.id}
            icon={<AgentIcon agent="acp" name={a.name} size={15} />}
            label={a.name}
            hint={a.builtin ? 'Any model: OpenRouter, Ollama, vLLM' : `ACP agent · ${a.command}`}
            selected={agent === 'acp' && a.id === acpId}
            onClick={() => pick('acp', a.id)}
          />
        ))}
        <MenuSep />
        <MenuItem icon={<SlidersHorizontal size={14} />} onClick={() => (setOpen(false), go('/settings?s=models'))}>Models for Custom</MenuItem>
        <MenuItem icon={<Plus size={14} />} onClick={() => (setOpen(false), go('/settings?s=agents'))}>Add or manage agents</MenuItem>
      </Popover>
    </>
  );
}
