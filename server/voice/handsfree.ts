// Hands-free: talking to the app while walking. Each thing the user says comes here as text (the page heard
// it), the helper model turns it into one thing to do (start a session, steer one, say how they all are,
// read one's latest reply, answer its approval, stop it, or just answer), the app does it, and the page
// says the answer aloud. Without a helper model, plain words are understood ("status", "approve", "stop").
// The answer is in the language the user reads the app in. Confidential sessions (server/confidential) stay out of
// it: never in what the helper reads, never read aloud; what is said while one is the focus goes to it by plain words.
import { isConfidential } from '../../shared/confidential.ts';
import { LANGS } from '../../shared/i18n.ts';
import { quickAnswer } from '../../shared/inbox.ts';
import type { Agent, SessionSummary, TimelineItem } from '../../shared/types.ts';
import { makeTaskFolder, dayIn } from '../assistants/taskFolder.ts';
import { taskRoot } from '../assistants/store.ts';
import { config } from '../config.ts';
import type { Deps } from '../features/types.ts';
import { helper, type HelperAsk } from '../helper.ts';
import { userLang } from '../language/index.ts';
import { startSettings } from '../startSettings.ts';
import { userTimezone } from '../userPrefs.ts';

export interface VoiceReply {
  /** What to say back. */
  say: string;
  /** The session the conversation is about now (a new one, or the one asked about). */
  focus?: string;
  /** What was done, in a word, for the page: started, sent, read, approved, denied, stopped, status, answer. */
  did: string;
}

type Action = 'start' | 'send' | 'status' | 'read' | 'approve' | 'deny' | 'stop' | 'focus' | 'answer';

interface Plan {
  action: Action;
  session?: string | null;
  text?: string;
  say?: string;
}

const BUSY = new Set(['working', 'waiting', 'starting']);
const ago = (t?: number) => {
  if (!t) return '';
  const m = Math.round((Date.now() - t) / 60_000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
};

/** A session as a line for the helper: its key, agent, what it is doing (and what it asks), its name. */
function line(d: Pick<Deps, 'sessions'>, s: SessionSummary): string {
  const st = s.live?.status ?? s.external?.status ?? 'idle';
  const asks = st === 'waiting' ? d.sessions.inbox().find((x) => x.key === s.key)?.title : undefined;
  const agent = s.agent === 'acp' ? (s.acpName ?? 'agent') : s.agent === 'claude' ? 'Claude Code' : 'Codex';
  return `- ${s.key} · ${agent} · ${st}${asks ? ` (asks: ${asks})` : ''} · "${s.title}" · ${ago(s.updatedAt)}`;
}

/** The sessions worth talking about: those at work or waiting, then the latest (confidential ones are not talked about). */
function recent(d: Pick<Deps, 'sessions'>, n = 12): SessionSummary[] {
  const all = d.sessions.list({ limit: 200 }).sessions.filter((s) => !s.archived && !isConfidential(s.extra));
  const busy = all.filter((s) => BUSY.has(s.live?.status ?? s.external?.status ?? ''));
  const rest = all.filter((s) => !busy.includes(s)).sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  return [...busy, ...rest].slice(0, n);
}

/** The latest reply of a session, as plain words to say. */
async function lastReply(d: Pick<Deps, 'sessions'>, key: string): Promise<string> {
  const tl = await d.sessions.timeline(key);
  const items: TimelineItem[] = tl.parser.items;
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (it.kind === 'assistant' && it.text.trim())
      return it.text
        .replace(/```[\s\S]*?```/g, ' (code) ')
        .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/[*_`#>|]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
  }
  return '';
}

/** Plain words, for when there is no helper model. */
function byWords(text: string, focus?: string): Plan {
  const t = text.toLowerCase();
  if (/\b(status|how are|what'?s (going on|happening)|anything new|update)\b/.test(t)) return { action: 'status' };
  if (/\b(approve|yes|go ahead|allow|do it)\b/.test(t)) return { action: 'approve', session: focus };
  if (/\b(deny|no\b|don'?t|reject)\b/.test(t)) return { action: 'deny', session: focus };
  if (/\b(stop|cancel|halt)\b/.test(t)) return { action: 'stop', session: focus };
  if (/\b(read|what did it say|the answer|result)\b/.test(t)) return { action: 'read', session: focus };
  const start = /^(?:please\s+)?(?:start|begin|new session|ask an agent to|can you)\s*(?:a session\s*)?(?:to|that|and|:)?\s*(.+)$/.exec(text.trim());
  if (start) return { action: 'start', text: start[1] };
  return focus ? { action: 'send', session: focus, text } : { action: 'start', text };
}

const SYSTEM = (lang: string) =>
  [
    'You turn what a person says aloud to Hydor (an app that runs AI agents, each in a session) into one action, as JSON. They are walking and listening, not looking at a screen.',
    'Actions: "start" (a new session doing a task: text is the task, in their words, complete enough for an agent), "send" (a message to a session: text), "status" (how the sessions are doing), "read" (say a session’s latest reply), "approve" / "deny" (answer what a session asks), "stop" (stop a session’s work), "focus" (talk about another session from now on), "answer" (just reply: a question about the app, or something unclear: ask them back briefly).',
    'session: the key of the session meant (from the list; "it" or "that" means the focus), or null.',
    `say: what to say back, in ${lang}, short and natural for listening (one or two sentences, no lists, no markdown, no keys). For status, say it from the list: what is working, what needs them and what it asks, what finished lately. For start, send, approve, deny and stop, confirm briefly. For read, leave it empty.`,
    'Reply with the JSON object only: {"action": …, "session": …, "text": …, "say": …}.',
  ].join('\n');

/**
 * What the user said, done: the helper decides what it means (or plain words do), the app does it. `ask`
 * is the helper model (a stand-in in tests).
 */
export async function handsFree(d: Pick<Deps, 'db' | 'sessions'>, text: string, focus?: string, ask: (q: HelperAsk) => Promise<string> = (q) => helper(d.db, q)): Promise<VoiceReply> {
  const lang = LANGS.find((l) => l.id === userLang(d.db))!.english;
  const list = recent(d);
  const focused = focus ? d.sessions.summary(focus) : null;
  const secret = (k?: string | null) => !!k && isConfidential(d.sessions.summary(k)?.extra);
  let plan: Plan;
  try {
    // Talking to a confidential session: its words go to it alone, not to the helper model.
    if (secret(focus)) throw new Error('confidential');
    const raw = await ask({
      system: SYSTEM(lang),
      prompt: `Sessions (busy first):\n${list.map((s) => line(d, s)).join('\n') || '(none)'}\n\nFocus: ${focused ? `${focused.key} ("${focused.title}")` : 'none'}\n\nThey said: "${text}"`,
      maxTokens: 600,
      timeoutMs: 45_000,
    });
    plan = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)) as Plan;
    if (!plan?.action) throw new Error('no action');
  } catch {
    plan = byWords(text, focus);
  }
  const key = plan.session && d.sessions.summary(plan.session) ? plan.session : focus;
  const named = (k?: string) => (k ? (secret(k) ? 'the confidential session' : (d.sessions.summary(k)?.title ?? 'the session')) : 'the session');
  switch (plan.action) {
    case 'start': {
      const task = (plan.text || text).trim();
      const st = startSettings(d.db);
      const agentKey = st.agent ?? 'claude';
      const agent: Agent = agentKey.startsWith('acp:') ? 'acp' : (agentKey as Agent);
      const run = st.runs?.[agentKey] ?? {};
      const cwd = st.task !== false || !st.cwd ? makeTaskFolder(taskRoot(d.db), task, dayIn(userTimezone(d.db))) : st.cwd || config.defaultCwd;
      const k = await d.sessions.create({
        agent,
        acpAgent: agent === 'acp' ? agentKey.slice(4) : undefined,
        cwd,
        prompt: task,
        model: run.model ?? undefined,
        effort: agent === 'acp' ? undefined : (run.effort ?? undefined),
        mode: run.mode ?? undefined,
        remember: false,
        extra: { ...(st.assistant ? { assistant: st.assistant } : {}), ...(st.space ? { space: st.space } : {}) },
      });
      return { say: plan.say || 'Started. I will tell you when it is done.', focus: k, did: 'started' };
    }
    case 'send': {
      if (!key) return { say: plan.say || 'Which session should I tell?', did: 'answer' };
      await d.sessions.deliverOrQueue(key, (plan.text || text).trim());
      return { say: plan.say || `Sent to ${named(key)}.`, focus: key, did: 'sent' };
    }
    case 'approve':
    case 'deny': {
      const waiting = d.sessions.inbox().filter((x) => x.approval && (!key || x.key === key) && !secret(x.key));
      const item = waiting[0];
      if (!item?.approval || !item.key) return { say: 'Nothing is waiting for an answer.', focus: key, did: 'answer' };
      const q = quickAnswer(item.approval);
      if (!q) return { say: `${named(item.key)} asks something you need to answer on the screen: ${item.title}.`, focus: item.key, did: 'answer' };
      await d.sessions.answer(item.key, q.id, { decision: plan.action === 'approve' ? q.approve.id : q.deny.id });
      return { say: plan.say || (plan.action === 'approve' ? 'Approved.' : 'Denied.'), focus: item.key, did: plan.action === 'approve' ? 'approved' : 'denied' };
    }
    case 'stop': {
      if (!key) return { say: 'Which session should I stop?', did: 'answer' };
      await d.sessions.interrupt(key);
      return { say: plan.say || `Stopped ${named(key)}.`, focus: key, did: 'stopped' };
    }
    case 'read': {
      const k = key ?? list[0]?.key;
      if (!k) return { say: 'There is nothing to read yet.', did: 'answer' };
      if (secret(k)) return { say: 'That session is confidential: its replies stay on the screen.', focus: k, did: 'answer' };
      const reply = await lastReply(d, k);
      if (!reply) return { say: `${named(k)} has not replied yet.`, focus: k, did: 'read' };
      // Long replies, or ones in another language than theirs: the gist, for listening.
      if (reply.length <= 500 && lang === 'English') return { say: reply, focus: k, did: 'read' };
      const gist = await ask({
        system: `Say the gist of an AI agent's reply for someone listening while walking: in ${lang}, three to five plain spoken sentences, no lists or markdown; the result first, then anything they need to do.`,
        prompt: reply.slice(0, 12_000),
        maxTokens: 500,
        timeoutMs: 45_000,
      }).catch(() => reply.slice(0, 600));
      return { say: gist.trim(), focus: k, did: 'read' };
    }
    case 'focus':
      return { say: plan.say || `Now talking about ${named(key)}.`, focus: key, did: 'answer' };
    case 'status': {
      if (plan.say) return { say: plan.say, did: 'status' };
      const busy = list.filter((s) => BUSY.has(s.live?.status ?? ''));
      return { say: busy.length ? `${busy.length} session${busy.length === 1 ? ' is' : 's are'} at work: ${busy.map((s) => s.title).join(', ')}.` : 'Nothing is working right now.', did: 'status' };
    }
    default:
      return { say: plan.say || 'Sorry, I did not get that.', focus: key, did: 'answer' };
  }
}
