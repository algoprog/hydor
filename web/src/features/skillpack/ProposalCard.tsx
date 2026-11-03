// A skill an agent proposed (skill_save) or a change it proposed to one (skill_patch), as a card in the
// conversation: why it is worth keeping, when it applies, the text or the change, and anything in it
// that needs a look. Nothing is saved until you approve it here (or in Settings → Skills); you
// can edit it first, or dismiss it with a note. In a space, you pick whether it is kept for every
// session or for the space alone. Your answer goes back to the agent as a message.
import { useEffect, useState } from 'react';
import { BookPlus, Check, ChevronRight, FilePen, TriangleAlert, X } from 'lucide-react';
import { parseSkill, type SkillProposal } from '@shared/skillpack';
import type { ToolItem } from '@shared/types';
import { api, enc, post } from '../../lib/api';
import { useFeatureEvent } from '../../lib/featureEvents';
import { go } from '../../lib/nav';
import { toastError } from '../../lib/store';
import { DiffStat, DiffView } from '../../components/DiffView';
import { Markdown } from '../../components/Markdown';
import { Badge, Button, cx, Dialog, Segmented, Throbber, useConfirm } from '../../components/ui';
import { StepLine, ToolDetail } from '../session/items';
import { Triggers } from './SkillView';

const STATUS: Record<SkillProposal['status'], { badge: string; tone: 'info' | 'ok' | 'neutral' }> = {
  pending: { badge: 'Waiting for you', tone: 'info' },
  approved: { badge: 'Saved', tone: 'ok' },
  dismissed: { badge: 'Dismissed', tone: 'neutral' },
  replaced: { badge: 'Replaced', tone: 'neutral' },
};

/** The skill tool's own row, for a proposal that never was one (refused: a secret, a name in use…). */
function PlainRow({ item, sessionKey }: { item: ToolItem; sessionKey: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="tl-item">
      <button type="button" onClick={() => setOpen((o) => !o)} className={cx('group flex min-h-8 w-full items-center gap-2.5 rounded-lg px-2 py-1 text-left transition-colors hover:bg-bg-2', open && 'bg-bg-2')}>
        <StepLine item={item} />
        <ChevronRight size={14} className={cx('shrink-0 text-fg-3 opacity-0 transition group-hover:opacity-100', open && 'rotate-90 opacity-100')} />
      </button>
      {open && <ToolDetail t={item.tool} item={item} sessionKey={sessionKey} />}
    </div>
  );
}

/** The proposal's content and its buttons: in the conversation's card, and in Settings. */
export function ProposalPanel({ p, onChange, framed = true }: { p: SkillProposal; onChange: (p: SkillProposal) => void; framed?: boolean }) {
  const [busy, setBusy] = useState<'yes' | 'no' | null>(null);
  const [editing, setEditing] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [note, setNote] = useState('');
  const [view, setView] = useState<'changes' | 'skill'>(p.kind === 'patch' ? 'changes' : 'skill');
  // Where it goes: the library, or the session's space alone (a skill of the space's own stays there).
  const [scope, setScope] = useState<SkillProposal['scope']>(p.scope);
  const [confirm, confirmNode] = useConfirm();
  const pending = p.status === 'pending';
  const toSpace = (pending ? scope : p.scope) === 'space' && p.space;
  const final = p.saved ?? p.after;
  const fm = parseSkill(final);
  const before = p.before ? parseSkill(p.before) : null;
  const answer = async (yes: boolean, text?: string) => {
    if (yes && p.findings.length && text === undefined) {
      const ok = await confirm({
        title: 'Save it with these warnings?',
        body: 'Every agent here will read this skill when it applies. Make sure the flagged lines are what you want agents to follow.',
        confirm: 'Save it',
      });
      if (!ok) return;
    }
    setBusy(yes ? 'yes' : 'no');
    try {
      const r = await post<{ proposal: SkillProposal }>(`/api/skillpack/proposals/${enc(p.id)}/${yes ? 'approve' : 'dismiss'}`, yes ? { ...(text !== undefined ? { text } : {}), scope } : { note });
      onChange(r.proposal);
      setEditing(false);
      setDismissing(false);
    } catch (e) {
      toastError(e);
      throw e;
    } finally {
      setBusy(null);
    }
  };
  return (
    <>
      <div className={cx('space-y-3', framed && 'px-4 py-3', !pending && 'opacity-80')}>
        {p.reason && (
          <p className="text-[13px] leading-relaxed text-fg-2">
            <span className="text-fg-3">Why: </span>
            {p.reason}
          </p>
        )}
        {fm.description && (!before || before.description !== fm.description) && (
          <p className="text-[13px] leading-relaxed">
            <span className="text-fg-3">When it applies: </span>
            {before?.description ? <span className="mr-1.5 text-fg-3 line-through decoration-fg-3/50">{before.description}</span> : null}
            {fm.description}
          </p>
        )}
        {fm.triggers.length > 0 && (!before || before.triggers.join('\n') !== fm.triggers.join('\n')) && <Triggers list={fm.triggers} max={8} />}
        {p.findings.length > 0 && (
          <div className="rounded-lg border border-warn/40 bg-warn/8 px-3 py-2 text-[12.5px]">
            <div className="mb-1 flex items-center gap-1.5 font-medium text-warn">
              <TriangleAlert size={14} /> Look at these lines before approving
            </div>
            <ul className="space-y-1">
              {p.findings.map((f, i) => (
                <li key={i} className="min-w-0">
                  <span className="text-fg-2">
                    Line {f.line}: {f.what}
                  </span>
                  <code className="mt-0.5 block truncate rounded bg-bg-2 px-1.5 py-0.5 font-mono text-[11.5px] text-fg-3">{f.excerpt}</code>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="overflow-hidden rounded-lg border border-line">
          <div className="flex items-center gap-2 border-b border-line bg-bg-1 px-2 py-1.5">
            <Segmented
              size="sm"
              value={view}
              onChange={setView}
              options={[
                { value: 'changes', label: p.kind === 'patch' ? 'Changes' : 'Text' },
                { value: 'skill', label: 'Skill' },
              ]}
            />
            <span className="flex-1" />
            <DiffStat added={p.added} removed={p.removed} />
          </div>
          {/* Skills are prose: their long lines wrap rather than scroll sideways. */}
          <div className="max-h-[360px] overflow-auto [&_.diff_table]:min-w-0! [&_.diff_td]:whitespace-pre-wrap! [&_.diff_td]:[overflow-wrap:anywhere]!">
            {view === 'changes' ? <DiffView diff={p.diff} /> : <Markdown text={fm.body} className="px-4 py-3 text-[13.5px]" />}
          </div>
        </div>
        {p.space && pending && !p.spaceSkill && (
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <span className="text-[12.5px] text-fg-3">Keep it for</span>
            <Segmented
              size="sm"
              value={scope}
              onChange={setScope}
              options={[
                { value: 'library', label: 'Every session' },
                { value: 'space', label: <span translate="no">{p.space.name}</span> },
              ]}
            />
          </div>
        )}
        {p.saved && <p className="text-[12px] text-fg-3">You edited it before saving; this is the saved version.</p>}
        {p.spaceSkill && p.space && pending && <p className="text-[12px] text-fg-3">{`A skill of the project ${p.space.name}: the change stays in it.`}</p>}
        {p.kind === 'patch' && !p.spaceSkill && toSpace && pending && <p className="text-[12px] text-fg-3">Saved as the project’s own version; other sessions keep the library’s as it is.</p>}
        {p.bundled && pending && !toSpace && <p className="text-[12px] text-fg-3">A built-in skill: approving saves your own version in its place. The original stays with the app.</p>}
        {p.note && <p className="text-[12.5px] text-fg-3">Your note: {p.note}</p>}
        {dismissing && (
          <textarea
            autoFocus
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Optional: tell the agent why"
            className="w-full resize-none rounded-lg border border-line bg-bg-1 px-2.5 py-1.5 text-[13px] outline-none focus:border-accent/60"
          />
        )}
      </div>
      <div className={cx('flex flex-wrap items-center gap-2', framed && 'border-t border-line px-4 py-2.5')}>
        {pending ? (
          dismissing ? (
            <>
              <Button size="sm" variant="danger" icon={busy === 'no' ? <Throbber /> : <X size={14} />} disabled={!!busy} onClick={() => answer(false).catch(() => {})}>
                Dismiss
              </Button>
              <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => setDismissing(false)}>
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="primary" icon={busy === 'yes' ? <Throbber /> : <Check size={14} />} disabled={!!busy} onClick={() => answer(true).catch(() => {})}>
                Approve
              </Button>
              <Button size="sm" disabled={!!busy} onClick={() => setEditing(true)}>
                Edit…
              </Button>
              <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => setDismissing(true)}>
                Dismiss…
              </Button>
              <span className="ml-auto text-[11.5px] text-fg-3 max-sm:hidden">The agent hears your answer.</span>
            </>
          )
        ) : (
          <>
            <span className="text-[12.5px] text-fg-3">
              {p.status === 'approved' && toSpace ? (
                `In the skills of ${p.space!.name}: its sessions can use it.`
              ) : p.status === 'approved' ? (
                'In your skill library: every agent can use it.'
              ) : p.status === 'replaced' ? (
                'A newer proposal took its place.'
              ) : (
                'Nothing was saved.'
              )}
            </span>
            {p.status === 'approved' && (
              <button type="button" onClick={() => go(toSpace ? `/spaces/${p.space!.id}/skills` : '/settings?s=skills')} className="text-[12.5px] text-accent hover:underline">
                {toSpace ? 'The project’s skills' : 'Your skills'}
              </button>
            )}
          </>
        )}
      </div>
      {editing && <EditDialog p={p} busy={busy === 'yes'} onClose={() => setEditing(false)} onSave={(text) => answer(true, text).catch(() => {})} />}
      {confirmNode}
    </>
  );
}

/** The whole SKILL.md as proposed, to change before saving it. */
function EditDialog({ p, busy, onClose, onSave }: { p: SkillProposal; busy: boolean; onClose: () => void; onSave: (text: string) => void }) {
  const [text, setText] = useState(p.after);
  return (
    <Dialog
      open
      onClose={onClose}
      width={760}
      title={`Edit ${p.name} before saving`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy || !text.trim()} onClick={() => onSave(text)} icon={busy ? <Throbber /> : <Check size={14} />}>
            Save and approve
          </Button>
        </>
      }
    >
      <p className="mb-2 text-[12.5px] leading-relaxed text-fg-3">
        The frontmatter at the top keeps its name; its description says when agents should use the skill. Everything below it is the guide they follow.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
        className="h-[min(56dvh,520px)] w-full resize-y rounded-lg border border-line bg-bg-1 px-3 py-2 font-mono text-[12.5px] leading-relaxed outline-none focus:border-accent/60"
      />
    </Dialog>
  );
}

/** The card in the conversation, for skill_save and skill_patch. */
export function ProposalCard({ item, sessionKey }: { item: ToolItem; sessionKey: string }) {
  const t = item.tool;
  const id = /\(proposal (\w+)\)/.exec(t.output ?? '')?.[1];
  const [p, setP] = useState<SkillProposal | null>(null);
  const [gone, setGone] = useState(false);
  useEffect(() => {
    if (!id) return;
    let alive = true;
    api<{ proposal: SkillProposal }>(`/api/skillpack/proposals/${enc(id)}`).then(
      (r) => alive && setP(r.proposal),
      () => alive && setGone(true),
    );
    return () => {
      alive = false;
    };
  }, [id]);
  // Answered on another device, or in Settings: the card follows.
  useFeatureEvent('skillpack', (e) => {
    const x = (e.data as { proposal?: SkillProposal } | undefined)?.proposal;
    if (x && x.id === id) setP(x);
  });
  const running = t.status === 'running' || t.status === 'pending';
  if ((!id && !running) || gone) return <PlainRow item={item} sessionKey={sessionKey} />;
  if (!p)
    return (
      <div className="tl-item my-1.5 flex items-center gap-2.5 rounded-2xl border border-line bg-panel px-4 py-3 text-[13px] text-fg-3">
        <Throbber /> Preparing the skill…
      </div>
    );
  const pending = p.status === 'pending';
  const Icon = p.kind === 'new' ? BookPlus : FilePen;
  const s = STATUS[p.status];
  return (
    <div data-tip={pending ? 'skill' : undefined} className="tl-item my-1.5 overflow-hidden rounded-2xl border border-line bg-panel">
      <div className="flex items-center gap-3 px-4 pt-3">
        <span className={cx('flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]', pending ? 'bg-accent-soft text-accent' : 'bg-bg-2 text-fg-3')}>
          <Icon size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-medium text-fg-3">{p.kind === 'new' ? 'Keep this as a skill?' : p.bundled ? 'Improve this built-in skill?' : 'Improve this skill?'}</div>
          <div className="truncate text-[14.5px] font-semibold tracking-tight">{p.name}</div>
        </div>
        <Badge tone={s.tone}>{s.badge}</Badge>
      </div>
      <ProposalPanel p={p} onChange={setP} />
    </div>
  );
}
