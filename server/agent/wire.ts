// The conversation as a model is sent it. Images are read from the session's folder, only the latest
// few (older ones, and all of them for a model that does not see, become a line of text). This turn's
// reasoning goes back where the server takes it, so a thinking model keeps its train of thought between
// tool calls. Tool-call ids take the form Mistral's servers insist on. A call left without a result (a
// stopped turn) gets one, so servers do not refuse the request. For a model that takes no tools, earlier
// calls and results are written as text; and messages from one side in a row are joined, since some
// chat templates refuse them otherwise.
import type { AgentModel } from '../../shared/types.ts';
import { isToolResult } from './compact.ts';
import { callId, type Family } from './families.ts';
import type { ChatMessage, Part } from './llm.ts';
import { dataUrl } from './media.ts';

const imageLine = (url: string, why: string) => ({ type: 'text' as const, text: `[an image${url.startsWith('file://') ? ` (${url.slice(7)})` : ''}: ${why}]` });

export function wire(system: string, messages: ChatMessage[], o: { m: AgentModel; family: Family; textMode: boolean; images: number }): ChatMessage[] {
  // This turn starts at the user's latest own message.
  let turn = 0;
  for (let i = messages.length - 1; i >= 0; i--)
    if (messages[i].role === 'user' && !messages[i].note && !isToolResult(messages[i])) {
      turn = i;
      break;
    }
  const lastThinking = new Set(
    messages
      .map((m, i) => ({ m, i }))
      .filter((x) => x.i > turn && x.m.role === 'assistant' && (x.m.reasoning || x.m.reasoning_details))
      .slice(-3)
      .map((x) => x.i),
  );
  const mistral = o.family.id === 'mistral';
  const id = (s: string) => (mistral ? callId(s) : s);
  // Images are counted from the end: only the latest few are sent.
  const total = messages.reduce((n, x) => n + (Array.isArray(x.content) ? x.content.filter((q) => q.type === 'image_url').length : 0), 0);
  let seen = 0;
  const names = new Map<string, string>();
  const out: ChatMessage[] = [{ role: 'system', content: system }];
  // Calls still waiting for their result: a stopped turn may have left some without one.
  let open: string[] = [];
  const settle = () => {
    for (const c of open) out.push({ role: 'tool', tool_call_id: c, content: '(no result: the step was stopped before this call finished)' });
    open = [];
  };
  const push = (m: ChatMessage) => {
    if (m.role === 'tool') open = open.filter((c) => c !== m.tool_call_id);
    else settle();
    const prev = out[out.length - 1];
    // Two user messages in a row become one.
    if (m.role === 'user' && prev.role === 'user' && out.length > 1) {
      const parts = (c: ChatMessage['content']): Part[] => (typeof c === 'string' ? (c ? [{ type: 'text', text: c }] : []) : (c ?? []));
      prev.content = typeof prev.content === 'string' && typeof m.content === 'string' ? `${prev.content}\n\n${m.content}` : [...parts(prev.content), ...parts(m.content)];
      return;
    }
    out.push(m);
  };
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    let content = m.content;
    if (Array.isArray(content)) {
      content = content.map((p): Part => {
        if (p.type !== 'image_url') return p;
        seen++;
        if (!o.m.vision) return imageLine(p.image_url.url, 'this model does not see images');
        if (total - seen >= o.images) return imageLine(p.image_url.url, 'left out to save room; read_file shows it again');
        const url = dataUrl(p.image_url.url);
        if (!url) return imageLine(p.image_url.url, 'no longer available');
        return { type: 'image_url', image_url: { url } };
      });
    }
    if (m.role === 'assistant') {
      const calls = m.tool_calls ?? [];
      for (const c of calls) names.set(c.id, c.function.name);
      if (o.textMode && calls.length) {
        const written = calls.map((c) => `<tool_call>\n{"name": ${JSON.stringify(c.function.name)}, "arguments": ${c.function.arguments || '{}'}}\n</tool_call>`).join('\n');
        push({ role: 'assistant', content: `${typeof content === 'string' && content ? `${content}\n` : ''}${written}` });
        continue;
      }
      const a: ChatMessage = { role: 'assistant', content: content ?? (calls.length ? null : '') };
      if (calls.length) a.tool_calls = calls.map((c) => ({ ...c, id: id(c.id), function: { name: c.function.name, arguments: c.function.arguments || '{}' } }));
      if (lastThinking.has(i)) {
        if (o.m.provider === 'openrouter') {
          if (m.reasoning_details?.length) a.reasoning_details = m.reasoning_details;
          else if (m.reasoning) a.reasoning = m.reasoning;
        } else if ((o.m.provider === 'vllm' || o.m.provider === 'ollama') && m.reasoning) a.reasoning_content = m.reasoning;
      }
      push(a);
      if (!o.textMode) open = (a.tool_calls ?? []).map((c) => c.id);
      continue;
    }
    if (m.role === 'tool') {
      if (o.textMode || !names.has(m.tool_call_id ?? '')) {
        push({ role: 'user', content: `<tool_response name="${names.get(m.tool_call_id ?? '') ?? 'tool'}">\n${typeof content === 'string' ? content : ''}\n</tool_response>` });
        continue;
      }
      push({ role: 'tool', tool_call_id: id(m.tool_call_id!), content: typeof content === 'string' ? content : JSON.stringify(content) });
      continue;
    }
    push({ role: m.role, content });
  }
  settle();
  return out;
}
