// Moving a conversation to another agent (Claude Code ⇄ Codex): a new session on the other agent,
// in the same folder, whose first message carries a budgeted selection of the conversation so far.
// Selected messages keep their full text and order; the first request always comes along, then the
// most recent ones that fit. The transcript stays on disk and the context says where, so the agent
// can read whatever was left out.
import type { Agent, FileChange, HandoffInfo, SessionSummary, TimelineItem } from '../shared/types.ts';

/** Characters of history carried over (about 15K tokens). */
export const HANDOFF_BUDGET = 60_000;

const AGENT_NAME: Record<Agent, string> = { claude: 'Claude Code', codex: 'Codex', acp: 'an ACP agent' };
const BLOCK = /^<conversation-handoff((?:\s+[a-z]+="[^"]*")*)>\n([\s\S]*?)\n<\/conversation-handoff>\n*/;

const attr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/\n/g, ' ');
const unattr = (s: string) => s.replace(/&lt;/g, '<').replace(/&quot;/g, '"').replace(/&amp;/g, '&');

interface Msg {
  role: 'user' | 'assistant';
  text: string;
  ts?: number;
}

function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const keep = Math.floor((max - 60) / 2);
  return `${text.slice(0, keep)}\n\n[… ${(text.length - 2 * keep).toLocaleString('en-US')} characters left out …]\n\n${text.slice(-keep)}`;
}

const render = (m: Msg) => `### ${m.role === 'user' ? 'User' : 'Assistant'}${m.ts ? ` · ${new Date(m.ts).toISOString().slice(0, 16).replace('T', ' ')}` : ''}\n${m.text.trim()}\n`;

/** The context block that opens the new session's first message. */
export function buildHandoff(from: SessionSummary, items: TimelineItem[], transcript: string | null, model?: string): string {
  const msgs: Msg[] = [];
  const changed = new Set<string>();
  for (const it of items) {
    if (it.kind === 'user' && (!it.meta || it.meta === 'queued') && it.text.trim()) msgs.push({ role: 'user', text: it.text, ts: it.ts });
    else if (it.kind === 'assistant' && it.text.trim()) msgs.push({ role: 'assistant', text: it.text, ts: it.ts });
    else if (it.kind === 'tool') for (const f of (it.tool.files ?? []) as FileChange[]) changed.add(f.path);
  }

  // The first request always; then from the newest back, whole messages while they fit.
  const first = msgs.findIndex((m) => m.role === 'user');
  const picked = new Set<number>();
  let used = 0;
  if (first >= 0) {
    msgs[first] = { ...msgs[first], text: clip(msgs[first].text, HANDOFF_BUDGET / 4) };
    used += render(msgs[first]).length;
    picked.add(first);
  }
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (picked.has(i)) continue;
    const m = { ...msgs[i], text: clip(msgs[i].text, HANDOFF_BUDGET / 2) };
    const n = render(m).length;
    if (used + n > HANDOFF_BUDGET) break;
    msgs[i] = m;
    used += n;
    picked.add(i);
  }
  const order = [...picked].sort((a, b) => a - b);
  const omitted = msgs.length - order.length;

  const parts: string[] = [];
  order.forEach((i, k) => {
    if (k > 0 && i !== order[k - 1] + 1) parts.push(`[… ${i - order[k - 1] - 1} messages left out …]\n`);
    parts.push(render(msgs[i]));
  });
  const files = [...changed];
  const intro = [
    `This conversation started in ${AGENT_NAME[from.agent]}${model ? ` (${model})` : ''} and continues here, in the same folder. Its messages so far, oldest first:`,
    omitted ? `${omitted} messages were left out to keep this short.${transcript ? ` The whole conversation is in ${transcript} (JSON lines) if you need them.` : ''}` : '',
  ]
    .filter(Boolean)
    .join(' ');
  const tail = files.length ? `\nFiles changed in that session: ${files.slice(0, 60).join(', ')}${files.length > 60 ? `, and ${files.length - 60} more` : ''}\n` : '';
  const head = `<conversation-handoff from="${from.agent}" session="${attr(from.key)}" title="${attr(from.title)}" messages="${order.length}" omitted="${omitted}"${transcript ? ` transcript="${attr(transcript)}"` : ''}>`;
  return `${head}\n${intro}\n\n${parts.join('\n')}${tail}\n</conversation-handoff>\n\n`;
}

/** Splits a first message into the carried-over context and the request that follows it. */
export function splitHandoff(text: string): { handoff: HandoffInfo; request: string } | null {
  if (!text.startsWith('<conversation-handoff')) return null;
  const m = BLOCK.exec(text);
  if (!m) return null;
  const a: Record<string, string> = {};
  for (const [, k, v] of m[1].matchAll(/([a-z]+)="([^"]*)"/g)) a[k] = unattr(v);
  return {
    handoff: {
      agent: a.from === 'codex' ? 'codex' : 'claude',
      key: a.session || undefined,
      title: a.title || undefined,
      messages: Number(a.messages) || 0,
      omitted: Number(a.omitted) || 0,
      context: m[2],
    },
    request: text.slice(m[0].length),
  };
}
