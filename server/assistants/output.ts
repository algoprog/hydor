// What an agent hands back, and where it goes. An agent with an output (fields to fill in, places to send each result)
// gets hand_back in its sessions: the result is checked against its fields as an app's answer is (the agent fixes what
// the check says and calls again), then written to a file in its folder, kept as a page in the Library, posted to a
// webhook (signed with a key from the vault, only to the hosts the key is allowed for) and sent as a notification, as
// its output says. The last results are kept with the agent, for its page.
import fs from 'node:fs';
import path from 'node:path';
import { hasOutput, outputFields, type AgentResult, type Assistant, type OutputTarget } from '../../shared/assistants.ts';
import { answerSchema, checkAnswer, type AnswerField } from '../../shared/apps.ts';
import type { Agent, NotifyEvent } from '../../shared/types.ts';
import { httpCall } from '../connections/http.ts';
import { readSecret, touchSecret } from '../connections/vault.ts';
import { kvGet, kvSet, type DB } from '../db.ts';
import type { Deps, RunCtx, RunTool } from '../features/types.ts';
import { createPage } from '../pages/store.ts';
import { sessionExtra } from '../sessionExtra.ts';
import { findAssistant } from './store.ts';

const KEEP = 20;
const resultsKey = (id: string) => `assistants.results.${id}`;

/** The results an agent handed back lately, newest first. */
export function resultsOf(db: DB, id: string): AgentResult[] {
  try {
    const v = JSON.parse(kvGet(db, resultsKey(id)) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function keepResult(db: DB, id: string, r: AgentResult) {
  // Kept short: the list shows a line, and a big table is in the places it went.
  const small = JSON.stringify(r.value).length > 20_000 ? { note: 'Too long to keep here: see where it went.' } : r.value;
  kvSet(db, resultsKey(id), JSON.stringify([{ ...r, value: small }, ...resultsOf(db, id)].slice(0, KEEP)));
}

// ---- in words ----------------------------------------------------------------------------------------------

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const asText = (v: unknown): string => (v === null || v === undefined ? '' : typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : JSON.stringify(v));

/** A result as Markdown: each field under its label (a lone Markdown result as it is). */
export function resultMarkdown(fields: AnswerField[], v: Record<string, unknown>): string {
  if (fields.length === 1 && fields[0].type === 'markdown') return asText(v[fields[0].id]).trim();
  const out: string[] = [];
  for (const f of fields) {
    const x = v[f.id];
    out.push(`## ${f.label}`, '');
    if (f.type === 'list' && Array.isArray(x)) out.push(...x.map((i) => `- ${asText(i)}`));
    else if (f.type === 'table' && Array.isArray(x)) {
      const cols = f.columns?.length ? f.columns : Object.keys((x[0] as Record<string, unknown>) ?? {}).map((id) => ({ id, label: id }));
      out.push(`| ${cols.map((c) => c.label).join(' | ')} |`, `| ${cols.map(() => '---').join(' | ')} |`);
      for (const row of x as Record<string, unknown>[]) out.push(`| ${cols.map((c) => asText(row?.[c.id]).replace(/\|/g, '\\|').replace(/\n/g, ' ')).join(' | ')} |`);
    } else if (f.type === 'yesno') out.push(x === true ? 'Yes' : x === false ? 'No' : '');
    else if (f.type === 'media' && Array.isArray(x)) out.push(...x.map((m) => `![](${asText((m as { url?: unknown })?.url ?? m)})`));
    else out.push(asText(x));
    out.push('');
  }
  return out.join('\n').trim();
}

/** A little Markdown as HTML: headings, lists, tables, paragraphs, bold, italics, code and links. */
export function markdownHtml(md: string): string {
  const inline = (s: string) =>
    esc(s)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
      .replace(/!\[([^\]]*)\]\((https?:[^)\s]+|data:[^)\s]+|\/[^)\s]*)\)/g, '<img alt="$1" src="$2">')
      .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2">$1</a>');
  const out: string[] = [];
  const lines = md.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const h = /^(#{1,4})\s+(.*)$/.exec(l);
    if (h) {
      out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`);
      continue;
    }
    if (/^\s*([-*]|\d+[.)])\s+/.test(l)) {
      const ordered = /^\s*\d/.test(l);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*]|\d+[.)])\s+/.test(lines[i])) items.push(`<li>${inline(lines[i++].replace(/^\s*([-*]|\d+[.)])\s+/, ''))}</li>`);
      i--;
      out.push(`<${ordered ? 'ol' : 'ul'}>${items.join('')}</${ordered ? 'ol' : 'ul'}>`);
      continue;
    }
    if (/^\|.*\|$/.test(l.trim()) && i + 1 < lines.length && /^\|[\s|:-]+\|$/.test(lines[i + 1].trim())) {
      const cells = (row: string) =>
        row
          .trim()
          .replace(/^\||\|$/g, '')
          .split(/(?<!\\)\|/)
          .map((c) => inline(c.trim().replace(/\\\|/g, '|')));
      const head = cells(l);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && /^\|.*\|$/.test(lines[i].trim())) rows.push(cells(lines[i++]));
      i--;
      out.push(`<table><thead><tr>${head.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      continue;
    }
    if (!l.trim()) continue;
    const para: string[] = [l];
    while (i + 1 < lines.length && lines[i + 1].trim() && !/^(#{1,4}\s|\s*([-*]|\d+[.)])\s|\|)/.test(lines[i + 1])) para.push(lines[++i]);
    out.push(`<p>${para.map(inline).join('<br>')}</p>`);
  }
  return out.join('\n');
}

// ---- where it goes -----------------------------------------------------------------------------------------

const stamp = (now: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return { date: `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`, time: `${p(now.getHours())}${p(now.getMinutes())}` };
};

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'agent';

/** The path a file target names, its placeholders filled in, inside `dir`; null when it would lead out of it. */
export function targetPath(dir: string, pattern: string, a: Pick<Assistant, 'name'>, now = new Date()): string | null {
  const t = stamp(now);
  const rel = pattern.replaceAll('{date}', t.date).replaceAll('{time}', t.time).replaceAll('{agent}', slug(a.name));
  const full = path.resolve(dir, rel);
  return full === dir || full.startsWith(dir + path.sep) ? full : null;
}

interface Delivery {
  db: DB;
  deps: Pick<Deps, 'broadcast'> & { sessions: { emit: (e: string, v: unknown) => boolean } };
  agent: Assistant;
  /** The program the session runs (Claude Code, Codex…), for its notification. */
  program: Agent;
  key: string;
  cwd: string;
  space?: string;
  fields: AnswerField[];
  value: Record<string, unknown>;
  markdown: string;
}

async function deliver(t: OutputTarget, x: Delivery): Promise<string> {
  const now = new Date();
  if (t.kind === 'file') {
    const file = targetPath(x.cwd, t.path, x.agent, now);
    if (!file) throw new Error(`${t.path} leads out of the folder it works in`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, file.endsWith('.json') ? `${JSON.stringify(x.value, null, 2)}\n` : `${x.markdown}\n`);
    return file;
  }
  if (t.kind === 'library') {
    const title = `${x.agent.name} · ${stamp(now).date}`;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title></head><body class="n-page"><h1>${esc(title)}</h1>\n${markdownHtml(x.markdown)}</body></html>`;
    const p = createPage(x.db, { title, html, by: 'agent', sessionKey: x.key, space: x.space ?? null, description: `What ${x.agent.name} handed back on ${stamp(now).date}` });
    x.deps.broadcast({ t: 'feature', id: 'pages', data: { what: 'pages' } });
    return `the Library, as "${p.title}"`;
  }
  if (t.kind === 'webhook') {
    const body = JSON.stringify({ agent: { id: x.agent.id, name: x.agent.name }, session: x.key, at: now.toISOString(), result: x.value });
    let auth: Parameters<typeof httpCall>[0]['auth'];
    if (t.secret) {
      const s = readSecret(x.db, t.secret);
      if (!s) throw new Error(`there is no key ${t.secret} in the vault`);
      auth = { name: t.secret, value: s.value, domains: s.view.domains };
      touchSecret(x.db, t.secret);
    }
    const r = await httpCall({ method: 'POST', url: t.url, headers: { 'content-type': 'application/json' }, body, ...(auth ? { auth } : {}) }, { timeoutMs: 30_000, maxBytes: 200_000 });
    if (r.status >= 400) throw new Error(`${new URL(t.url).host} answered ${r.status} ${r.statusText}`);
    return `${new URL(t.url).host} (${r.status})`;
  }
  const line = x.markdown.split('\n').find((l) => l.trim() && !l.startsWith('#')) ?? 'A new result';
  x.deps.sessions.emit('notify', {
    key: x.key,
    kind: 'done',
    title: x.agent.name,
    body: line
      .replace(/[#*`|]/g, '')
      .trim()
      .slice(0, 200),
    agent: x.program,
    at: Date.now(),
  } satisfies NotifyEvent);
  return 'a notification';
}

/** Hands a checked result on to every place its agent's output names; what happened at each. */
export async function handOn(x: Delivery): Promise<AgentResult['sent']> {
  const sent: AgentResult['sent'] = [];
  for (const t of x.agent.output?.to ?? []) {
    try {
      sent.push({ kind: t.kind, ok: true, detail: await deliver(t, x) });
    } catch (e) {
      sent.push({ kind: t.kind, ok: false, detail: (e as Error).message || 'it failed' });
    }
  }
  return sent;
}

// ---- the tool ----------------------------------------------------------------------------------------------

const PLACE: Record<OutputTarget['kind'], string> = { file: 'a file', library: 'the Library', webhook: 'a webhook', notify: 'a notification' };

/** What an agent with an output is told, in its instructions. */
export function outputNote(a: Assistant): string {
  if (!hasOutput(a)) return '';
  const fields = outputFields(a.output);
  const to = (a.output?.to ?? []).map((t) => (t.kind === 'file' ? `the file ${t.path}` : PLACE[t.kind]));
  return [
    `When you finish a task, hand back its result with hand_back: ${fields.map((f) => `${f.id} (${f.label}, ${f.type}${f.required ? ', required' : ''})`).join('; ')}.`,
    'It is checked: when it answers with problems, fix them and call it again with every field.',
    to.length ? `It then goes to ${to.join(', ')}, as the user set it up.` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

/** hand_back, in a session that works as an agent with an output. */
export function handBackTool(ctx: RunCtx): RunTool | null {
  const a = findAssistant(ctx.deps.db, sessionExtra(ctx.deps.db, ctx.key).assistant);
  if (!a || !hasOutput(a)) return null;
  const fields = outputFields(a.output);
  return {
    name: 'hand_back',
    description: `Hand back the result of your task as ${a.name}: one object with its fields. It is checked; if it answers with problems, fix them and call again. It then goes where the user set ${a.name}'s results to go${a.output?.to?.length ? ` (${a.output.to.map((t) => PLACE[t.kind]).join(', ')})` : ''}.`,
    inputSchema: answerSchema(fields),
    async run(args, c) {
      const now = findAssistant(c.deps.db, sessionExtra(c.deps.db, c.key).assistant);
      if (!now || !hasOutput(now)) return { text: 'This session no longer works as an agent with results to hand back.', isError: true };
      const fs2 = outputFields(now.output);
      let raw: unknown = args;
      const ids = new Set(fs2.map((f) => f.id));
      const keys = Object.keys(args ?? {});
      // Some agents wrap the fields in one more object.
      if (keys.length === 1 && !ids.has(keys[0]) && args[keys[0]] && typeof args[keys[0]] === 'object') raw = args[keys[0]];
      const checked = checkAnswer(fs2, raw);
      if (!checked.ok)
        return { text: `The result does not fit ${now.name}'s fields yet:\n${checked.errors.map((e) => `- ${e}`).join('\n')}\nFix these and call hand_back again with every field.`, isError: true };
      const x = sessionExtra(c.deps.db, c.key);
      const markdown = resultMarkdown(fs2, checked.value);
      const sent = await handOn({
        db: c.deps.db,
        deps: c.deps as Delivery['deps'],
        agent: now,
        program: c.agent,
        key: c.key,
        cwd: c.cwd,
        space: typeof x.space === 'string' ? x.space : now.projects?.length === 1 ? now.projects[0] : undefined,
        fields: fs2,
        value: checked.value,
        markdown,
      });
      keepResult(c.deps.db, now.id, { at: Date.now(), key: c.key, line: (markdown.split('\n').find((l) => l.trim() && !l.startsWith('#')) ?? '').slice(0, 200), value: checked.value, sent });
      c.deps.broadcast({ t: 'feature', id: 'assistants', data: { results: now.id } });
      const bad = sent.filter((s) => !s.ok);
      return [
        sent.length
          ? `Handed back. It went to ${
              sent
                .filter((s) => s.ok)
                .map((s) => s.detail)
                .join(', ') || 'nowhere'
            }.`
          : 'Handed back.',
        bad.length ? `It could not go to: ${bad.map((s) => `${PLACE[s.kind]} (${s.detail})`).join('; ')}. Say so in your reply.` : '',
        'Finish with a short reply; no need to repeat the result.',
      ]
        .filter(Boolean)
        .join(' ');
    },
  };
}
