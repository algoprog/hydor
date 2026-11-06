// Find what broke it: where it last worked (a tag or commit), where it is broken (HEAD to start), what is broken,
// and a command that tells, if you have one. Start opens a new session in a worktree of the repository whose agent
// finds the first bad commit with git bisect and says why it broke things (the request is shared/engineering.ts's
// bisectRequest; the method, the git-bisect skill). Each end shows the commit it stands for as you type.
import { useEffect, useState } from 'react';
import { SearchCode } from 'lucide-react';
import { bisectRequest } from '@shared/engineering';
import type { Agent, GitCommit, GitRepoDetail } from '@shared/types';
import { api } from '../../lib/api';
import { timeAgo } from '../../lib/format';
import { agentKey, lastAgent, startSettings } from '../../lib/start';
import { startSession } from '../../lib/starting';
import { useApp } from '../../lib/store';
import { useCatalog } from '../../components/AgentPickers';
import { Button, cx, Dialog, inputCls } from '../../components/ui';
import { AgentPicker } from '../home/AgentPicker';
import { Field } from '../automations/parts';
import { short } from './parts';

type Tagged = GitCommit & { name: string };

const small = cx(inputCls, 'h-9 text-[13.5px]');

/** The commit a name stands for, asked a moment after typing stops: undefined while it is asked, null for none. */
function useResolved(repo: string, ref: string): GitCommit | null | undefined {
  const [got, setGot] = useState<{ ref: string; commit: GitCommit | null } | null>(null);
  const want = ref.trim();
  useEffect(() => {
    if (!want) return;
    let alive = true;
    const t = setTimeout(
      () =>
        api<{ commit: GitCommit | null }>(`/api/git/resolve?path=${encodeURIComponent(repo)}&ref=${encodeURIComponent(want)}`).then(
          (r) => alive && setGot({ ref: want, commit: r.commit }),
          () => alive && setGot({ ref: want, commit: null }),
        ),
      300,
    );
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [repo, want]);
  if (!want) return null;
  return got?.ref === want ? got.commit : undefined;
}

/** The commit under a field: its short hash, message and age; or that there is none by that name. */
function Resolved({ value, commit }: { value: string; commit: GitCommit | null | undefined }) {
  if (!value.trim() || commit === undefined) return <span className="block h-4" />;
  if (!commit) return <span className="block text-[12px] text-err">No commit or tag by that name</span>;
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-[12px] text-fg-3">
      <span className="shrink-0 font-mono text-fg-2">{short(commit.hash)}</span>
      <span translate="no" className="min-w-0 truncate">
        {commit.subject}
      </span>
      <span className="shrink-0">· {timeAgo(commit.ts)}</span>
    </span>
  );
}

/** What a session started here runs with: the agent picked, and the model, permissions and account it last ran with on the start page. */
function useRun(agent: Agent, acp: string | null) {
  const boot = useApp((s) => s.boot);
  const cat = useCatalog(agent, acp ?? undefined);
  const r = startSettings().runs?.[agentKey(agent, acp)] ?? {};
  const p = cat?.prefs ?? {};
  // As the start page does: Codex's default must be named, or it takes a model a ChatGPT sign-in may not allow.
  const model = (r.model !== undefined ? r.model : p.model) ?? (agent === 'codex' ? (cat?.models.find((x) => x.isDefault)?.value ?? null) : null);
  const mode = (r.mode !== undefined ? r.mode : p.mode) ?? null;
  const account = (r.account !== undefined ? r.account : p.account) ?? '';
  return {
    model,
    mode,
    account: boot?.accounts.some((a) => a.id === account && a.agent === agent) ? account : undefined,
    acpName: agent === 'acp' ? boot?.acpAgents.find((a) => a.id === acp)?.name : undefined,
  };
}

export function BisectDialog({ repo, open, good: from, onClose }: { repo: GitRepoDetail; open: boolean; good?: string; onClose: () => void }) {
  const acpList = useApp((s) => s.boot?.acpAgents);
  const [tags, setTags] = useState<Tagged[]>([]);
  const [good, setGood] = useState('');
  const [bad, setBad] = useState('HEAD');
  const [broken, setBroken] = useState('');
  const [check, setCheck] = useState('');
  const [who, setWho] = useState(lastAgent);
  const run = useRun(who.agent, who.acp);
  // Each time it opens: the commit it was opened from, else the latest tag, as where it worked.
  useEffect(() => {
    if (!open) return;
    setBad('HEAD');
    setBroken('');
    setCheck('');
    setGood(from ?? '');
    let alive = true;
    api<{ tags: Tagged[] }>(`/api/git/tags?path=${encodeURIComponent(repo.path)}`).then(
      (r) => {
        if (!alive) return;
        setTags(r.tags);
        if (!from && r.tags[0]) setGood((g) => g || r.tags[0].name);
      },
      () => alive && setTags([]),
    );
    return () => {
      alive = false;
    };
  }, [open, repo.path, from]);
  const goodAt = useResolved(repo.path, good);
  const badAt = useResolved(repo.path, bad);
  const same = !!goodAt && !!badAt && goodAt.hash === badAt.hash;
  const ready = !!broken.trim() && !!goodAt && !!badAt && !same;

  const start = () => {
    if (!ready) return;
    const prompt = bisectRequest({ good, goodAt: goodAt.hash, bad: bad.trim() || 'HEAD', badAt: badAt.hash, broken, check });
    const s = startSettings();
    onClose();
    // The session's page opens at once; should it not start, the request waits in the start page's box.
    startSession(
      { agent: who.agent, acpName: run.acpName, title: prompt.slice(0, 300), text: prompt, atts: [], cwd: repo.path },
      async () => ({
        agent: who.agent,
        acpAgent: who.agent === 'acp' ? who.acp : undefined,
        prompt,
        model: run.model ?? undefined,
        mode: run.mode ?? undefined,
        account: run.account,
        cwd: repo.path,
        worktree: true,
      }),
      { text: prompt, files: [], extra: {}, folder: { cwd: repo.path, over: JSON.stringify([s.cwd ?? null, s.task ?? null, s.space ?? null]) }, from: '' },
    );
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      width={500}
      title={
        <span className="flex items-center gap-2">
          <SearchCode size={16} className="text-fg-3" />
          Find what broke it
        </span>
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={start} disabled={!ready}>
            Start
          </Button>
        </>
      }
    >
      <p className="mb-3 text-[13px] leading-relaxed text-fg-3">An agent tries the commits between the two, in a worktree of its own (git bisect), and names the first one that broke it, with why. Your own copy stays as it is.</p>
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Worked at">
            <input value={good} onChange={(e) => setGood(e.target.value)} list="bisect-refs" placeholder="v1.2.0, or a commit" spellCheck={false} autoComplete="off" className={cx(small, 'font-mono')} />
            <Resolved value={good} commit={goodAt} />
          </Field>
          <Field label="Broken at">
            <input value={bad} onChange={(e) => setBad(e.target.value)} list="bisect-refs" placeholder="HEAD" spellCheck={false} autoComplete="off" className={cx(small, 'font-mono')} />
            <Resolved value={bad} commit={badAt} />
          </Field>
          <datalist id="bisect-refs">
            {tags.map((t) => (
              <option key={t.name} value={t.name}>
                {t.subject}
              </option>
            ))}
          </datalist>
        </div>
        {same && <p className="text-[12px] text-err">Both are the same commit: pick where it last worked.</p>}
        <Field label="What is broken">
          <textarea value={broken} onChange={(e) => setBroken(e.target.value)} rows={3} placeholder="Exporting a document with pictures to PDF fails with “image too large”" className={cx(inputCls, 'h-auto py-1.5 text-[13.5px] leading-relaxed')} />
        </Field>
        <Field label="How to check (optional)" hint="A command that fails while it is broken. Without one, the agent writes a check of its own.">
          <input value={check} onChange={(e) => setCheck(e.target.value)} placeholder="npm test -- export" spellCheck={false} autoComplete="off" className={cx(small, 'font-mono')} />
        </Field>
        <Field label="Run by">
          <div>
            <AgentPicker agent={who.agent} acpId={who.acp} acpList={acpList ?? []} onPick={(agent, acp) => setWho({ agent, acp })} />
          </div>
        </Field>
      </div>
    </Dialog>
  );
}
