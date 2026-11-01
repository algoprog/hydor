// A skill in the pages: the chip where an agent loads one ("Using skill research"), the note where
// your words brought one into Custom's turn, and a dialog to read a skill (of the library, or a space's
// own) and its history of changes.
import { useEffect, useState } from 'react';
import { ChevronRight, History, Sparkles } from 'lucide-react';
import { parseSkill, skillLoaded, type SkillChange, type SkillDoc } from '@shared/skillpack';
import type { SessionNote } from '@shared/features';
import type { ToolItem } from '@shared/types';
import { api, enc } from '../../lib/api';
import { ago, tildify } from '../../lib/format';
import { go } from '../../lib/nav';
import { useApp } from '../../lib/store';
import { DiffStat, DiffView } from '../../components/DiffView';
import { Markdown } from '../../components/Markdown';
import { Badge, Button, cx, Dialog, Tabs, Throbber } from '../../components/ui';

export type { SkillDoc };

const ACTION: Record<SkillChange['action'], string> = { create: 'Saved', update: 'Changed', remove: 'Removed', restore: 'Brought back' };

/** One change in a skill's history, opening to its diff. */
function Change({ c, first }: { c: SkillChange; first: boolean }) {
  const [open, setOpen] = useState(first);
  return (
    <div className="overflow-hidden rounded-lg border border-line">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-bg-2">
        <ChevronRight size={14} className={cx('shrink-0 text-fg-3 transition-transform', open && 'rotate-90')} />
        <span className="font-medium">{ACTION[c.action]}</span>
        <span className="text-fg-3">{ago(c.at)}</span>
        <span className="flex-1" />
        <DiffStat added={c.added} removed={c.removed} />
      </button>
      {open && (
        <div className="max-h-[320px] overflow-auto border-t border-line [&_.diff_table]:min-w-0! [&_.diff_td]:whitespace-pre-wrap! [&_.diff_td]:[overflow-wrap:anywhere]!">
          <DiffView diff={c.diff} />
        </div>
      )}
    </div>
  );
}

/**
 * A skill: what it says, and every change approved for it. The library's, a space's own (`space`, its
 * id), or the one a session's agent read (`sessionKey`: in a space, its own before the library's).
 * `onChange`: a button to change a space's skill.
 */
export function SkillDialog({ name, onClose, history, space, sessionKey, onChange }: { name: string; onClose: () => void; history?: boolean; space?: string; sessionKey?: string; onChange?: () => void }) {
  const home = useApp((s) => s.boot?.home);
  const [doc, setDoc] = useState<SkillDoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'skill' | 'history'>(history ? 'history' : 'skill');
  useEffect(() => {
    let alive = true;
    api<SkillDoc>(space ? `/api/spaces/${enc(space)}/skills/${enc(name)}` : `/api/skillpack/skills/${enc(name)}${sessionKey ? `?key=${enc(sessionKey)}` : ''}`).then(
      (d) => alive && setDoc(d),
      (e: Error) => alive && setError(e.message),
    );
    return () => {
      alive = false;
    };
  }, [name, space, sessionKey]);
  const fm = doc ? parseSkill(doc.text) : null;
  const ofSpace = doc?.source === 'space' ? doc.space : undefined;
  return (
    <Dialog
      open
      onClose={onClose}
      width={720}
      title={
        <span className="flex items-center gap-2">
          <Sparkles size={16} className="shrink-0 text-accent" />
          <span className="truncate">{name}</span>
          {doc && (
            <Badge tone={doc.source === 'bundled' ? 'neutral' : doc.source === 'learned' ? 'ok' : 'info'}>
              {ofSpace ? <span translate="no">{ofSpace.name}</span> : doc.source === 'learned' ? 'Learned' : 'Built in'}
            </Badge>
          )}
        </span>
      }
      footer={
        <>
          {ofSpace && onChange && (
            <Button variant="ghost" onClick={onChange}>
              Change
            </Button>
          )}
          {ofSpace && !onChange && (
            <Button variant="ghost" onClick={() => (onClose(), go(`/spaces/${ofSpace.id}/skills`))}>
              The space’s skills
            </Button>
          )}
          <Button onClick={onClose}>Close</Button>
        </>
      }
    >
      {error ? (
        <p className="py-3 text-[13.5px] leading-relaxed text-fg-2">
          {/no skill named/i.test(error) ? 'This skill is not in the app’s library: it comes from your own or the project’s skills folder.' : error}
        </p>
      ) : !doc || !fm ? (
        <div className="flex justify-center py-10">
          <Throbber size={26} />
        </div>
      ) : (
        <div className="space-y-3 pb-2">
          {fm.description && <p className="text-[13.5px] leading-relaxed text-fg-2">{fm.description}</p>}
          {fm.triggers.length > 0 && <Triggers list={fm.triggers} />}
          <Tabs
            value={tab}
            onChange={setTab}
            className="border-b border-line"
            options={[
              { value: 'skill', label: 'Skill' },
              { value: 'history', label: 'History', count: doc.history.length },
            ]}
          />
          {tab === 'skill' ? (
            <div className="rounded-lg border border-line px-4 py-3">
              <Markdown text={fm.body} className="text-[13.5px]" />
            </div>
          ) : doc.history.length ? (
            <div className="space-y-2">
              {doc.history.map((c, i) => (
                <Change key={c.id} c={c} first={i === 0} />
              ))}
            </div>
          ) : (
            <p className="flex items-center gap-2 py-2 text-[13px] text-fg-3">
              <History size={14} /> {doc.source !== 'bundled' ? 'No changes recorded yet.' : 'Built in, as it came with the app. Changes you approve are saved as your own version.'}
            </p>
          )}
          <p className="truncate font-mono text-[11.5px] text-fg-3" title={doc.file}>
            {tildify(doc.file, home)}
          </p>
        </div>
      )}
    </Dialog>
  );
}

/** The words that bring a skill into Custom's turn; past `max`, how many more. */
export function Triggers({ list, max = 99 }: { list: string[]; max?: number }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[11.5px] text-fg-3">Custom brings it in when you say</span>
      {list.slice(0, max).map((t) => (
        <span key={t} className="rounded-md bg-bg-2 px-1.5 py-0.5 text-[11.5px] text-fg-2">
          {t}
        </span>
      ))}
      {list.length > max && <span className="text-[11.5px] text-fg-3">and {list.length - max} more</span>}
    </div>
  );
}

/** The pill itself: a skill at work in this turn. */
function Pill({ name, why, busy, onOpen }: { name: string; why?: string; busy?: boolean; onOpen: () => void }) {
  return (
    <div className="tl-item flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 px-1 py-0.5">
      <button
        type="button"
        onClick={onOpen}
        title={`Read the skill ${name}`}
        className="inline-flex h-7 min-w-0 max-w-full items-center gap-1.5 rounded-full border border-accent/30 bg-accent/8 px-2.5 text-[12.5px] text-fg-2 transition-colors hover:border-accent/50 hover:bg-accent/12"
      >
        {busy ? <Throbber className="h-3.5 shrink-0" /> : <Sparkles size={13} className="shrink-0 text-accent" />}
        <span className="shrink-0">Using skill</span>
        <span className="truncate font-medium text-fg">{name}</span>
      </button>
      {why && <span className="min-w-0 truncate text-[12px] text-fg-3">{why}</span>}
    </div>
  );
}

/** An agent loaded a skill: Claude Code's Skill tool, Custom's skill tool, a SKILL.md read. In a space, its own may be the one. */
export function SkillChip({ item, sessionKey }: { item: ToolItem; sessionKey: string }) {
  const [open, setOpen] = useState(false);
  const name = skillLoaded(item.tool) ?? 'a skill';
  const busy = item.tool.status === 'running' || item.tool.status === 'pending';
  return (
    <>
      <Pill name={name} busy={busy} onOpen={() => setOpen(true)} />
      {open && <SkillDialog name={name} sessionKey={sessionKey} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Your message used a skill's keywords, so Custom got the skill with it. */
export function TriggerNote({ note, sessionKey }: { note: SessionNote; sessionKey: string }) {
  const [open, setOpen] = useState(false);
  const d = (note.data ?? {}) as { skill?: string; trigger?: string };
  if (!d.skill) return null;
  return (
    <>
      <Pill name={d.skill} why={d.trigger ? `brought in by “${d.trigger.replace(/\*$/, '…')}” in your message` : undefined} onOpen={() => setOpen(true)} />
      {open && <SkillDialog name={d.skill} sessionKey={sessionKey} onClose={() => setOpen(false)} />}
    </>
  );
}
