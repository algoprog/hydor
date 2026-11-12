// `hydor guidelines`: Agent Guidelines, what every agent follows: in every session, in a project, or in one session.
import { enc } from '../client.ts';
import { flag, markdown, pickOne, str, UsageError, type Area, type Ctx, type Values } from './kit.ts';
import { findSession } from './sessions.ts';

interface Guidelines {
  global: string;
  space?: { id: string; name: string; text: string };
  session?: { key: string; text: string };
}

/** Which level the options name: a project's, a session's, or every session's. */
async function level(ctx: Ctx, v: Values): Promise<{ kind: 'global' | 'space' | 'session'; id?: string; label: string }> {
  const project = str(v, 'project');
  const session = str(v, 'session');
  if (project && session) throw new UsageError('Pick one of --project and --session');
  if (project) {
    const { spaces } = await ctx.conn.api<{ spaces: { id: string; name: string }[] }>('GET', '/api/projects');
    const p = pickOne(spaces, project, { id: (x) => x.id, names: (x) => [x.name], what: 'project', hint: 'hydor projects lists them' });
    return { kind: 'space', id: p.id, label: `the project “${p.name}”` };
  }
  if (session) {
    const s = await findSession(ctx, session);
    return { kind: 'session', id: s.key, label: `the session “${s.title || s.firstPrompt || s.key}”` };
  }
  return { kind: 'global', label: 'every session' };
}

const read = (ctx: Ctx, l: Awaited<ReturnType<typeof level>>) =>
  ctx.conn.api<Guidelines>('GET', `/api/guidelines${l.kind === 'space' ? `?space=${enc(l.id!)}` : l.kind === 'session' ? `?key=${enc(l.id!)}` : ''}`);

const scope = {
  project: { type: 'string', value: '<project>', desc: 'A project’s guidelines', kind: 'project' },
  session: { type: 'string', value: '<session>', desc: 'One session’s guidelines', kind: 'session' },
} as const;

export const guidelines: Area = {
  name: 'guidelines',
  aliases: ['guideline'],
  summary: 'What every agent follows: all sessions, a project, a session',
  help: 'Guidelines are plain words the agent is told when a session starts. They apply to every session, to a project’s sessions, or to one session; a session follows all three.',
  group: 'work',
  default: 'show',
  verbs: [
    {
      name: 'show',
      args: [],
      options: { ...scope },
      summary: 'Show guidelines (every session’s by default)',
      examples: ['hydor guidelines', 'hydor guidelines show --project thesis', 'hydor guidelines show --session 3f9a'],
      async run(ctx, _args, v) {
        const l = await level(ctx, v);
        const g = await read(ctx, l);
        if (ctx.o.json) return ctx.json(g);
        const { p } = ctx.look;
        const part = (title: string, text: string | undefined) => [p.bold(title), ...(text ? markdown(ctx, text) : [p.dim('None.')])];
        const out =
          l.kind === 'global'
            ? part('Every session', g.global)
            : l.kind === 'space'
              ? [...part(`Every session`, g.global), '', ...part(`In ${l.label}`, g.space?.text)]
              : [...part('Every session', g.global), ...(g.space ? ['', ...part(`In the project “${g.space.name}”`, g.space.text)] : []), '', ...part(`In ${l.label}`, g.session?.text)];
        ctx.out(out);
      },
    },
    {
      name: 'edit',
      args: [],
      options: { ...scope, file: { type: 'string', value: '<path>', desc: 'The new text from a file (- is stdin)', kind: 'file' }, clear: { type: 'boolean', desc: 'Clear them' } },
      summary: 'Change them in your editor, or from a file',
      help: 'Without --file, the current text opens in your editor ($VISUAL, $EDITOR, else nano or vi): saving it unchanged changes nothing. A session follows its new guidelines from its next message.',
      examples: [
        'hydor guidelines edit',
        'hydor guidelines edit --project thesis --file guidelines.md',
        'echo "Answer briefly." | hydor guidelines edit --file -',
        'hydor guidelines edit --session 3f9a --clear',
      ],
      async run(ctx, _args, v) {
        const l = await level(ctx, v);
        let text: string | null;
        if (flag(v, 'clear')) text = '';
        else {
          const g = await read(ctx, l);
          const current = l.kind === 'global' ? g.global : l.kind === 'space' ? (g.space?.text ?? '') : (g.session?.text ?? '');
          text = await ctx.readText({ file: str(v, 'file'), current });
        }
        if (text === null) return ctx.out('Nothing changed.');
        const body = l.kind === 'global' ? { global: text } : l.kind === 'space' ? { space: { id: l.id, text } } : { session: { key: l.id, text } };
        const r = await ctx.conn.api('PUT', '/api/guidelines', body);
        if (ctx.o.json) return ctx.json(r);
        ctx.out(text ? `Changed the guidelines for ${l.label}.` : `Cleared the guidelines for ${l.label}.`);
      },
    },
  ],
};
