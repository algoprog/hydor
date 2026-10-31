// Second opinion: another company's model checks a turn's work against what was asked: the user's
// request, the agent's final reply, the commands it ran and the diff of the files the turn changed (or
// the answer itself, for work that changed no files). Its findings, rated Critical, Important or Minor,
// show in a note under the turn, each a click away from the message box.
import fs from 'node:fs';
import type { OpinionNote, OpinionOptions, Reviewer } from '../../shared/opinion.ts';
import type { AgentModel, SessionSummary } from '../../shared/types.ts';
import { HttpError } from '../auth.ts';
import type { DB } from '../db.ts';
import type { Deps, Feature } from '../features/types.ts';
import { AGENT_FILE } from '../models/config.ts';
import { addNote, getNote, removeNote, updateNote } from '../notes.ts';
import { buildOpinionPrompt, parseOpinion } from './prompt.ts';
import { askReviewer } from './run.ts';
import { findTurn, turnsOf, type Turn } from './turns.ts';

function customModels(): AgentModel[] {
  try {
    return JSON.parse(fs.readFileSync(AGENT_FILE, 'utf8')).models ?? [];
  } catch {
    return [];
  }
}

const MAKERS: [RegExp, string][] = [
  [/anthropic|claude/, 'anthropic'],
  [/openai|gpt|codex|(^|[/:])o[134](-|$)/, 'openai'],
  [/google|gemini|gemma/, 'google'],
  [/meta-llama|llama/, 'meta'],
  [/qwen|qwq/, 'qwen'],
  [/deepseek/, 'deepseek'],
  [/mistral|mixtral|codestral|devstral|magistral/, 'mistral'],
  [/x-ai|grok/, 'xai'],
  [/moonshot|kimi/, 'moonshot'],
  [/z-ai|zhipu|glm/, 'zhipu'],
];

/** The company that made a model, as far as its id tells; an unknown model is a maker of its own. */
export function makerOf(model: string): string {
  // Custom's ids start with where the model runs (ollama/…, endpoint/<id>/…), which says nothing of its maker.
  const m = model.toLowerCase().replace(/^(ollama|vllm|openrouter)\//, '').replace(/^endpoint\/[^/]+\//, '');
  return MAKERS.find(([re]) => re.test(m))?.[1] ?? `model:${m}`;
}

/** Whose work a session is: Claude Code's is Anthropic's, Codex's OpenAI's, Custom's its model's maker. */
const workMaker = (s: Pick<SessionSummary, 'agent' | 'model'>) => (s.agent === 'claude' ? 'anthropic' : s.agent === 'codex' ? 'openai' : makerOf(s.model ?? ''));

/** Who may check a session's work, the suggested one first: only other companies' models. */
export function reviewersFor(s: Pick<SessionSummary, 'agent' | 'model'>, models: AgentModel[]): Reviewer[] {
  const maker = workMaker(s);
  const claude: Reviewer = { id: 'claude', label: 'Claude', detail: 'Sonnet, through Claude Code' };
  const codex: Reviewer = { id: 'codex', label: 'Codex', detail: 'Through the Codex CLI' };
  const out = maker === 'anthropic' ? [codex] : maker === 'openai' ? [claude] : [claude, codex];
  for (const m of models) if (makerOf(m.id) !== maker && makerOf(m.model) !== maker) out.push({ id: m.id, label: m.label, detail: `One of Custom's models (${m.provider})` });
  return out;
}

const agentLabel = (s: SessionSummary) => (s.agent === 'claude' ? 'Claude Code' : s.agent === 'codex' ? 'Codex' : [s.acpName ?? 'an agent', s.model].filter(Boolean).join(' · '));
const running = (s: SessionSummary) => !!s.live && ['starting', 'working', 'waiting'].includes(s.live.status);

/** Where a turn's note goes: under its end, else its last word. */
function anchorOf(t: Turn): string {
  const end = t.items.find((i) => i.kind === 'turn');
  if (end) return end.id;
  const said = [...t.items].reverse().find((i) => i.kind === 'assistant');
  return (said ?? t.last).id;
}

/** The user's earlier messages that set the scene: the session's first, and the one before this turn. */
function earlierOf(all: Turn[], t: Turn): string[] {
  const i = all.indexOf(t);
  const before = all.slice(0, Math.max(0, i)).filter((x) => x.prompt?.text.trim());
  const pick = [before[0], before[before.length - 1]].filter((x, k, a): x is Turn => !!x && a.indexOf(x) === k);
  return pick.map((x) => x.prompt!.text);
}

export async function opinionOptions(d: Deps, key: string): Promise<OpinionOptions> {
  const s = d.sessions.summary(key);
  if (!s) throw new HttpError(404, 'Unknown session');
  const items = (await d.sessions.timeline(key)).parser.items;
  const all = turnsOf(items).filter((t) => t.prompt);
  const done = running(s) ? all.slice(0, -1) : all;
  return {
    reviewers: reviewersFor(s, customModels()),
    turns: done
      .slice(-12)
      .reverse()
      .map((t) => ({ id: t.prompt!.id, text: t.prompt!.text.replace(/\s+/g, ' ').trim().slice(0, 140) || '(no text)', at: t.prompt!.ts, files: new Set(t.files.map((f) => f.path)).size })),
  };
}

type Ask = (db: DB, reviewer: string, q: { system: string; prompt: string }, cwd?: string) => Promise<string>;

/** Starts a second opinion on a turn (the latest finished one by default): its note shows at once, then fills in. */
export async function startOpinion(d: Deps, key: string, o: { reviewer?: string; turn?: string }, ask: Ask = askReviewer) {
  const s = d.sessions.summary(key);
  if (!s) throw new HttpError(404, 'Unknown session');
  const items = (await d.sessions.timeline(key)).parser.items;
  const all = turnsOf(items).filter((t) => t.prompt);
  const turn = findTurn(items, o.turn, running(s));
  if (!turn?.prompt) throw new HttpError(404, o.turn ? 'That turn is not in this session' : 'There is no finished turn to check yet');
  if (running(s) && turn.prompt.id === all.at(-1)?.prompt?.id) throw new HttpError(409, 'That turn is still running: ask once it ends');
  const models = customModels();
  const options = reviewersFor(s, models);
  const r = o.reviewer ? options.find((x) => x.id === o.reviewer) : options[0];
  if (!r) throw new HttpError(400, o.reviewer ? 'That reviewer is not offered for this session: it would be the same company checking its own work' : 'There is no reviewer from another company');
  const model = models.find((m) => m.id === r.id);
  const q = buildOpinionPrompt({
    agent: agentLabel(s),
    turn,
    earlier: earlierOf(all, turn),
    cwd: model ? undefined : s.cwd,
    // A Custom model gets what fits half its context.
    maxChars: model?.contextLength ? model.contextLength * 2 : undefined,
  });
  const data: OpinionNote = {
    status: 'running',
    reviewer: r.id,
    reviewerLabel: r.label,
    turn: turn.prompt.id,
    request: turn.prompt.text.replace(/\s+/g, ' ').trim().slice(0, 160),
    startedAt: Date.now(),
    files: q.files,
    trimmed: q.trimmed || undefined,
  };
  const note = addNote(d.db, { key, kind: 'opinion', anchor: anchorOf(turn), data });
  const done = (patch: Partial<OpinionNote>) => {
    const cur = getNote(d.db, note.id);
    if (cur) updateNote(d.db, note.id, { ...(cur.data as OpinionNote), ...patch, endedAt: Date.now() });
  };
  const work = ask(d.db, r.id, q, s.cwd).then(
    (raw) => done({ status: 'done', ...parseOpinion(raw) }),
    (e) => done({ status: 'failed', error: String((e as Error)?.message ?? e).slice(0, 500) }),
  );
  return { note, work };
}

export const opinion: Feature = {
  id: 'opinion',

  routes(d) {
    const keyOf = (req: { params: unknown }) => (req.params as { key: string }).key;
    d.app.get('/api/opinion/:key', async (req) => opinionOptions(d, keyOf(req)));
    d.app.post('/api/opinion/:key', async (req) => {
      const b = (req.body ?? {}) as { reviewer?: unknown; turn?: unknown };
      const { note } = await startOpinion(d, keyOf(req), { reviewer: typeof b.reviewer === 'string' ? b.reviewer : undefined, turn: typeof b.turn === 'string' ? b.turn : undefined });
      return { note };
    });
    /** Dismisses a second opinion. */
    d.app.delete('/api/opinion/note/:id', async (req) => {
      const n = getNote(d.db, (req.params as { id: string }).id);
      if (!n || n.kind !== 'opinion') throw new HttpError(404, 'That second opinion is gone');
      removeNote(d.db, n.id);
      return { ok: true };
    });
  },

  start(d) {
    // Opinions still out when the app stopped will not come back.
    for (const r of d.db.prepare("select id, data from session_notes where kind = 'opinion'").all() as { id: string; data: string }[]) {
      try {
        const data = JSON.parse(r.data) as OpinionNote;
        if (data.status === 'running') updateNote(d.db, r.id, { ...data, status: 'failed', error: 'The app restarted before the answer came back: ask again.', endedAt: Date.now() });
      } catch {}
    }
  },
};
