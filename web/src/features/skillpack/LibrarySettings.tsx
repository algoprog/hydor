// Settings → Skill library: skills agents proposed that wait for you, the skills they learned with your
// approval (how often each is used, its history, removing and bringing back), the built-in ones, and
// how each agent gets them.
import { useCallback, useEffect, useState } from 'react';
import { BookPlus, FilePen, History, RotateCcw, Sparkles, Trash2 } from 'lucide-react';
import type { LibrarySkill, SkillLibrary, SkillProposal } from '@shared/skillpack';
import { api, enc, post, put } from '../../lib/api';
import { useFeatureEvent } from '../../lib/featureEvents';
import { ago, tildify } from '../../lib/format';
import { go, openSession } from '../../lib/nav';
import { toast, toastError, useApp, useSessions } from '../../lib/store';
import { Badge, Button, Dialog, IconButton, Section, Switch, Throbber, useConfirm } from '../../components/ui';
import { ProposalPanel } from './ProposalCard';
import { SkillDialog } from './SkillView';

const used = (s: LibrarySkill) => (s.uses ? `Used ${s.uses === 1 ? 'once' : `${s.uses} times`}${s.lastUsed ? `, last ${ago(s.lastUsed)}` : ''}` : 'Not used yet');

function SkillRow({ s, onOpen, onHistory, onRemove }: { s: LibrarySkill; onOpen: () => void; onHistory?: () => void; onRemove?: () => void }) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={onOpen} className="min-w-0 truncate text-left text-[14px] font-medium hover:underline">
            {s.name}
          </button>
          {s.overrides && <Badge tone="info">Your version of a built-in skill</Badge>}
        </div>
        {s.description && <div className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-fg-3">{s.description}</div>}
        <div className="mt-1 text-[11.5px] text-fg-3">
          {used(s)}
          {s.updatedAt ? ` · saved ${ago(s.updatedAt)}` : ''}
          {s.triggers.length ? ` · Custom brings it in on “${s.triggers.slice(0, 3).join('”, “')}”${s.triggers.length > 3 ? '…' : ''}` : ''}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        {onHistory && (
          <IconButton label="History" size="sm" onClick={onHistory}>
            <History size={14} />
          </IconButton>
        )}
        {onRemove && (
          <IconButton label="Remove" size="sm" onClick={onRemove}>
            <Trash2 size={14} />
          </IconButton>
        )}
      </div>
    </div>
  );
}

/** A proposal waiting for an answer: from which conversation, and when. */
function PendingRow({ p, onOpen }: { p: SkillProposal; onOpen: () => void }) {
  const title = useSessions((x) => x.byKey[p.key]?.title);
  const Icon = p.kind === 'new' ? BookPlus : FilePen;
  return (
    <div className="flex items-center gap-3 py-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-accent-soft text-accent">
        <Icon size={15} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-medium">
          {p.kind === 'new' ? 'New skill' : 'Change to'} {p.name}
        </div>
        <div className="truncate text-[12px] text-fg-3">
          {ago(p.createdAt)} ·{' '}
          <button type="button" onClick={() => openSession(p.key)} className="hover:text-fg hover:underline">
            {title || 'its conversation'}
          </button>
          {p.findings.length ? ' · has warnings' : ''}
        </div>
      </div>
      <Button size="sm" variant="primary" onClick={onOpen}>
        Review
      </Button>
    </div>
  );
}

export function LibrarySettings() {
  const home = useApp((s) => s.boot?.home);
  const [lib, setLib] = useState<SkillLibrary | null>(null);
  const [open, setOpen] = useState<{ name: string; history?: boolean } | null>(null);
  const [review, setReview] = useState<SkillProposal | null>(null);
  const [confirm, confirmNode] = useConfirm();
  const load = useCallback(() => api<SkillLibrary>('/api/skillpack').then(setLib, toastError), []);
  useEffect(() => {
    load();
  }, [load]);
  // A proposal answered in a conversation, a new one, a skill saved: the lists follow.
  useFeatureEvent('skillpack', () => {
    load();
  });
  if (!lib)
    return (
      <div className="flex justify-center py-10 text-fg-3">
        <Throbber size={28} />
      </div>
    );
  const learned = lib.skills.filter((s) => s.source === 'learned');
  const bundled = lib.skills.filter((s) => s.source === 'bundled');
  const remove = async (s: LibrarySkill) => {
    const ok = await confirm({
      title: `Remove ${s.name}?`,
      body: s.overrides ? 'Agents go back to the built-in version. You can bring yours back from this page.' : 'Agents stop seeing it. You can bring it back from this page.',
      confirm: 'Remove',
      danger: true,
    });
    if (!ok) return;
    try {
      await post(`/api/skillpack/skills/${enc(s.name)}/remove`);
      toast(`Removed ${s.name}`, 'ok');
    } catch (e) {
      toastError(e);
    }
    load();
  };
  const restore = async (name: string) => {
    try {
      await post(`/api/skillpack/skills/${enc(name)}/restore`);
      toast(`${name} is back`, 'ok');
    } catch (e) {
      toastError(e);
    }
    load();
  };
  const setTriggers = (on: boolean) => {
    setLib({ ...lib, triggers: on });
    put('/api/skillpack/settings', { triggers: on }).catch((e) => (toastError(e), load()));
  };
  return (
    <div className="space-y-4">
      {lib.pending.length > 0 && (
        <Section title="Waiting for you" sub="Skills agents proposed after hard tasks. Nothing is saved until you approve.">
          <div className="-my-1 divide-y divide-line">
            {lib.pending.map((p) => (
              <PendingRow key={p.id} p={p} onOpen={() => setReview(p)} />
            ))}
          </div>
        </Section>
      )}
      <Section title="Learned" sub={learned.length ? `${learned.length} skill${learned.length === 1 ? '' : 's'} you approved, for every agent` : 'Skills you approved, for every agent'}>
        {learned.length ? (
          <div className="-my-1 divide-y divide-line">
            {learned.map((s) => (
              <SkillRow key={s.name} s={s} onOpen={() => setOpen({ name: s.name })} onHistory={() => setOpen({ name: s.name, history: true })} onRemove={() => remove(s)} />
            ))}
          </div>
        ) : (
          <p className="text-[13px] leading-relaxed text-fg-3">
            None yet. After a task that took real effort, an agent can propose keeping its method as a skill, or improving one it followed. You approve, edit or dismiss each one in the conversation or here.
          </p>
        )}
        {lib.removed.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-2.5 text-[12.5px] text-fg-3">
            <span>Removed:</span>
            {lib.removed.map((r) => (
              <button key={r.name} type="button" onClick={() => restore(r.name)} className="inline-flex items-center gap-1 hover:text-fg" title={`Removed ${ago(r.at)}`}>
                <RotateCcw size={12} /> {r.name}
              </button>
            ))}
          </div>
        )}
      </Section>
      <Section title="Built in" sub="Come with the app and update with it. Agents load each one when a task calls for it.">
        <div className="-my-1 divide-y divide-line">
          {bundled.map((s) => (
            <SkillRow key={s.name} s={s} onOpen={() => setOpen({ name: s.name })} />
          ))}
        </div>
      </Section>
      <Section title="How agents get them">
        <div className="space-y-3 text-[12.5px] leading-relaxed text-fg-3">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-medium text-fg">Bring skills in by keywords</div>
              For Custom: when your message uses a skill’s keywords, the skill comes with it, for models that rarely load skills by themselves. It shows as a note in the conversation.
            </div>
            <Switch on={lib.triggers} onChange={setTriggers} label="Bring skills in by keywords" className="mt-1" />
          </div>
          <p>
            <Sparkles size={12} className="mr-1 inline text-accent" />
            Every session this app starts gets the library: Claude Code as its plugin “naget” (the skills show as naget:research and so on), Codex as an extra skills folder, Custom in its skills list. Your
            own and your projects’ skills of the same name come first. Sessions started outside the app (a terminal, VS Code) do not see these.
          </p>
          <p>
            Your own skills for every agent can go in <span className="font-mono text-fg-2">{tildify(lib.folders.learned, home)}</span>, one folder per skill with its SKILL.md.
          </p>
          <p>
            A space can have skills of its own too, which only its sessions get: on the space’s page, its Skills tab.{' '}
            <button type="button" onClick={() => go('/spaces')} className="font-medium text-accent hover:underline">
              Spaces
            </button>
          </p>
        </div>
      </Section>
      {open && <SkillDialog name={open.name} history={open.history} onClose={() => setOpen(null)} />}
      {review && (
        <Dialog open onClose={() => setReview(null)} width={760} title={`${review.kind === 'new' ? 'New skill' : 'Change to'} ${review.name}`}>
          <ProposalPanel
            p={review}
            framed={false}
            onChange={(p) => {
              setReview(p.status === 'pending' ? p : null);
              load();
            }}
          />
          <div className="h-3" />
        </Dialog>
      )}
      {confirmNode}
    </div>
  );
}
