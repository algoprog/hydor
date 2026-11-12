// `hydor memory`: the Memory page. Notes agents keep (about you, about a project, about a session): list, search, show,
// add, edit, forget (and restore), and the profile every agent starts with. Notes are named by their number.
import { enc } from '../client.ts';
import { timeAgo } from '../term.ts';
import { fields, flag, markdown, mark, pickOne, str, table, UsageError, type Area, type Ctx, type Values } from './kit.ts';

/** A note as the API returns it (what the commands show of it). */
interface Note {
  id: number;
  scope: 'global' | 'repo' | 'session';
  scopeKey: string;
  kind: 'note' | 'topic' | 'profile';
  text: string;
  title?: string;
  basis?: 'user' | 'checked' | 'inferred';
  status: 'active' | 'deleted';
  createdAt: number;
  updatedAt: number;
  expiresAt?: number;
  usedAt?: number;
  uses: number;
  hits: number;
  source: 'user' | 'agent' | 'auto';
  scopeLabel: string;
  sessionTitle?: string;
}

const note = { name: 'note', kind: 'note' } as const;
const NOTE_HINT = 'hydor memory lists them';
const SCOPES = ['global', 'project', 'session'];

/** The place options every verb that lists or adds takes. */
const PLACE = {
  scope: { type: 'string', value: 'global|project|session', desc: 'Where the notes belong: you, a project, a session', values: SCOPES },
  project: { type: 'string', value: '<project>', desc: 'The project, by folder or name (implies --scope project)', kind: 'text' },
  session: { type: 'string', value: '<session>', desc: 'The session’s key (implies --scope session)', kind: 'session' },
} as const;

const cut = (s: string, n: number) => {
  const one = s.replace(/\s+/g, ' ').trim();
  return one.length > n ? `${one.slice(0, n - 1)}…` : one;
};
const day = (ms?: number) => (ms ? new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : undefined);

/** The place the options name: scope and, for a project or a session, its key (a project as memory has it: its folder). */
async function placeOf(ctx: Ctx, v: Values, forAdd = false): Promise<{ scope?: 'global' | 'repo' | 'session'; key?: string }> {
  let scope = str(v, 'scope');
  if (scope !== undefined && !SCOPES.includes(scope)) throw new UsageError(`--scope takes ${SCOPES.join(', ')} (it was “${scope}”)`);
  const project = str(v, 'project');
  const session = str(v, 'session');
  if (project && session) throw new UsageError('Name a project or a session, not both');
  if (project) scope ??= 'project';
  if (session) scope ??= 'session';
  if (!scope) return {};
  if (scope === 'global') return { scope: 'global' };
  if (scope === 'project') {
    if (!project) throw new UsageError('Say which project: --project <folder or name>');
    const { entries } = await ctx.conn.api<{ entries: Note[] }>('GET', '/api/memory/entries?scope=repo&status=all');
    const places = [...new Map(entries.map((e) => [e.scopeKey, e.scopeLabel])).entries()].map(([key, label]) => ({ key, label }));
    const base = (k: string) => k.split('/').filter(Boolean).pop() ?? k;
    const hit = places.filter((p) => p.key === project || p.label.toLowerCase() === project.toLowerCase() || base(p.key).toLowerCase() === project.toLowerCase());
    if (hit.length === 1) return { scope: 'repo', key: hit[0].key };
    if (hit.length > 1) throw new UsageError(`“${project}” fits ${hit.length} places: ${hit.map((h) => h.key).join(', ')}. Give its whole folder.`);
    if (forAdd && /^[/~]/.test(project)) return { scope: 'repo', key: ctx.conn.here ? project.replace(/^~(?=\/|$)/, ctx.look.home) : project };
    if (forAdd) throw new UsageError(`No project “${project}” has notes yet: give its folder as memory keys it (the root of its Git repository, a full path) to start one`);
    throw new UsageError(`No project “${project}” has notes: hydor memory lists them with the project each belongs to`);
  }
  if (!session) throw new UsageError('Say which session: --session <key> (hydor sessions lists them)');
  return { scope: 'session', key: session };
}

const query = (o: Record<string, string | undefined>) => {
  const q = Object.entries(o)
    .filter(([, x]) => x !== undefined)
    .map(([k, x]) => `${k}=${enc(x!)}`)
    .join('&');
  return q ? `?${q}` : '';
};

/** The notes the options ask for. */
async function loadNotes(ctx: Ctx, v: Values, extra: Record<string, string | undefined> = {}): Promise<Note[]> {
  const place = await placeOf(ctx, v);
  const status = flag(v, 'deleted') ? 'deleted' : undefined;
  const { entries } = await ctx.conn.api<{ entries: Note[] }>(
    'GET',
    `/api/memory/entries${query({ scope: place.scope, key: place.key, status, stale: flag(v, 'stale') ? '1' : undefined, ...extra })}`,
  );
  return entries;
}

/** A list of notes as lines. */
function noteLines(ctx: Ctx, list: Note[], n: number): string[] {
  const { p } = ctx.look;
  const shown = list.slice(0, n);
  const rows = shown.map((e) => [
    e.status === 'deleted' ? mark(p, 'error') : e.kind === 'topic' ? mark(p, 'attention') : mark(p, 'on'),
    p.dim(String(e.id)),
    p.dim(e.scope === 'global' ? 'About you' : e.scopeLabel),
    cut(e.title ? `${e.title}: ${e.text}` : e.text, 400),
    p.dim(timeAgo(e.updatedAt)),
  ]);
  const out = table(ctx, rows, { head: ['', 'NOTE', 'ABOUT', 'TEXT', 'CHANGED'], grow: 3, fixed: [1], drop: [2, 4] });
  if (list.length > shown.length) out.push(p.dim(`… ${list.length - shown.length} more (-n <number>, or --all)`));
  return out;
}

/** The note named: its number, or the start of its text or title (among the active ones). */
async function findNote(ctx: Ctx, given: string | undefined, status?: 'deleted'): Promise<Note> {
  if (!given) throw new UsageError(`Say which note: ${ctx.usage} (${NOTE_HINT})`);
  if (/^\d+$/.test(given)) {
    const { entries } = await ctx.conn.api<{ entries: Note[] }>('GET', `/api/memory/entries?ids=${given}`);
    if (!entries.length) throw new UsageError(`No note ${given}: ${NOTE_HINT}`);
    return entries[0];
  }
  const { entries } = await ctx.conn.api<{ entries: Note[] }>('GET', `/api/memory/entries${query({ status })}`);
  return pickOne(entries, given, { id: (e) => String(e.id), names: (e) => [e.title, e.text], what: 'note', hint: NOTE_HINT });
}

/** An end date: a day (2027-03-01), or a time from now (30d, 6w, 3m, 1y); the milliseconds since 1970. */
function endDate(s: string): number {
  const rel = /^(\d+)\s*([dwmy])$/i.exec(s.trim());
  if (rel) return Date.now() + Number(rel[1]) * { d: 1, w: 7, m: 30, y: 365 }[rel[2].toLowerCase() as 'd'] * 86_400_000;
  const t = Date.parse(s);
  if (!Number.isFinite(t)) throw new UsageError(`--expires takes a day (2027-03-01) or a time from now (30d, 6w, 3m, 1y), or none (it was “${s}”)`);
  return t;
}

const labelOf = (e: Note) => (e.scope === 'global' ? 'About you' : e.scope === 'session' ? `session “${e.sessionTitle ?? e.scopeLabel}”` : e.scopeLabel);

export const memory: Area = {
  name: 'memory',
  summary: 'What agents remember about you',
  help: 'Notes are things agents keep about you, a project or a session. Name a note by its number (hydor memory lists them). Forgotten notes stay restorable for 30 days. Your profile is what every agent reads first.',
  group: 'tools',
  verbs: [
    {
      name: 'list',
      args: [],
      options: { ...PLACE, deleted: { type: 'boolean', desc: 'The forgotten notes (restorable for 30 days)' }, stale: { type: 'boolean', desc: 'Notes no agent needed for 120 days' } },
      summary: 'Your notes, the last changed first',
      examples: ['hydor memory', 'hydor memory --scope global', 'hydor memory --project thesis -n 50', 'hydor memory --deleted'],
      async run(ctx, _a, v) {
        const all = await loadNotes(ctx, v);
        if (ctx.o.json) return ctx.json({ entries: all });
        const list = all.filter((e) => !(e.kind === 'profile' && e.scope === 'global'));
        if (!list.length) return ctx.out(flag(v, 'deleted') ? 'No forgotten notes.' : 'No notes yet: hydor memory add <text> makes one.');
        ctx.out(noteLines(ctx, list, ctx.o.all ? Infinity : (ctx.o.limit ?? 25)));
      },
    },
    {
      name: 'search',
      args: [{ name: 'words', kind: 'text', rest: true }],
      options: { ...PLACE, deleted: { type: 'boolean', desc: 'Search the forgotten notes too' } },
      summary: 'Find notes by words, and by meaning',
      examples: ['hydor memory search short answers', 'hydor memory search editor --project thesis'],
      async run(ctx, words, v) {
        const place = await placeOf(ctx, v);
        const { entries } = await ctx.conn.api<{ entries: Note[] }>(
          'GET',
          `/api/memory/entries${query({ q: words.join(' '), scope: place.scope, key: place.key, status: flag(v, 'deleted') ? 'all' : undefined })}`,
        );
        if (ctx.o.json) return ctx.json({ entries });
        if (!entries.length) return ctx.out(`No notes fit “${words.join(' ')}”.`);
        ctx.out(noteLines(ctx, entries, ctx.o.all ? Infinity : (ctx.o.limit ?? 25)));
      },
    },
    {
      name: 'show',
      args: [note],
      options: { history: { type: 'boolean', desc: 'Its history of changes too' } },
      summary: 'One note, whole',
      examples: ['hydor memory show 42', 'hydor memory show 42 --history', 'hydor memory show 42 --json'],
      async run(ctx, [given], v) {
        const e = await findNote(ctx, given);
        const history = flag(v, 'history')
          ? (await ctx.conn.api<{ history: { at: number; action: string; source: string; why?: string }[] }>('GET', `/api/memory/entries/${e.id}/history`)).history
          : undefined;
        if (ctx.o.json) return ctx.json(history ? { entry: e, history } : { entry: e });
        const { p } = ctx.look;
        ctx.out([
          p.bold(e.title ?? `Note ${e.id}`) + (e.status === 'deleted' ? p.red(' (forgotten)') : ''),
          ...fields(ctx, [
            ['Number', String(e.id)],
            ['About', labelOf(e)],
            ['Kind', e.kind === 'note' ? undefined : e.kind],
            ['Known', e.basis === 'user' ? 'you said so' : e.basis === 'checked' ? 'checked' : e.basis === 'inferred' ? 'not checked yet' : undefined],
            ['Written by', e.source === 'user' ? 'you' : e.source === 'agent' ? 'an agent' : 'the tidy-up'],
            ['Written', day(e.createdAt)],
            ['Changed', day(e.updatedAt)],
            ['Ends', day(e.expiresAt)],
            ['Needed', e.uses ? `${e.uses} times${e.usedAt ? `, last ${timeAgo(e.usedAt)}` : ''}` : undefined],
          ]),
          '',
          ...markdown(ctx, e.text),
        ]);
        if (history?.length)
          ctx.out([
            '',
            p.bold('History'),
            ...table(
              ctx,
              history.map((h) => [p.dim(day(h.at) ?? ''), h.action, p.dim(h.source), p.dim(h.why ?? '')]),
              { grow: 3 },
            ),
          ]);
      },
    },
    {
      name: 'add',
      aliases: ['new', 'create'],
      args: [{ name: 'text', kind: 'text', rest: true, optional: true }],
      options: {
        ...PLACE,
        file: { type: 'string', value: '<path>', desc: 'The note from a file (- is stdin)', kind: 'file' },
        expires: { type: 'string', value: '<when>', desc: 'When it stops being true: 2027-03-01, or 30d, 6w, 3m, 1y' },
      },
      summary: 'Add a note (about you, unless you say where)',
      help: 'The note is kept as one paragraph, up to 500 characters; one that looks like a password, key or card number is refused. A project’s note goes to a project that has notes already (or give its full folder).',
      examples: [
        'hydor memory add I prefer short answers',
        'hydor memory add "Uses pnpm" --project thesis',
        'hydor memory add --file note.txt',
        'hydor memory add The grant ends in June --expires 2027-06-30',
      ],
      async run(ctx, words, v) {
        const place = await placeOf(ctx, v, true);
        let text = words.join(' ').trim();
        if (!text) text = ((await ctx.readText({ file: str(v, 'file'), current: '', ext: 'txt' })) ?? '').trim();
        if (!text) throw new UsageError(`Say what to remember: ${ctx.usage}`);
        const body: Record<string, unknown> = { text, scope: place.scope ?? 'global', ...(place.key ? { key: place.key } : {}) };
        if (str(v, 'expires') !== undefined) body.expiresAt = endDate(str(v, 'expires')!);
        const r = await ctx.conn.api<{ entry: Note }>('POST', '/api/memory/entries', body);
        if (ctx.o.json) return ctx.json(r);
        ctx.out(`Remembered, note ${r.entry.id} (${labelOf(r.entry)}).`);
      },
    },
    {
      name: 'edit',
      aliases: ['set'],
      args: [note, { name: 'text', kind: 'text', rest: true, optional: true }],
      options: {
        file: { type: 'string', value: '<path>', desc: 'The new text from a file (- is stdin)', kind: 'file' },
        expires: { type: 'string', value: '<when>', desc: 'A new end date: 2027-03-01, 30d, 6w…; none removes it' },
      },
      summary: 'Change a note’s text or end date',
      help: 'With no new text named, on a terminal, the note opens in your editor: saving it unchanged changes nothing. Editing a forgotten note brings it back.',
      examples: ['hydor memory edit 42 I prefer short answers, with code', 'hydor memory edit 42', 'hydor memory edit 42 --expires none'],
      async run(ctx, [given, ...words], v) {
        const e = await findNote(ctx, given);
        const body: Record<string, unknown> = {};
        if (words.length) body.text = words.join(' ');
        else if (str(v, 'file')) body.text = await ctx.readText({ file: str(v, 'file') });
        if (str(v, 'expires') !== undefined) body.expiresAt = str(v, 'expires') === 'none' ? null : endDate(str(v, 'expires')!);
        if (!Object.keys(body).length) {
          const text = await ctx.readText({ current: e.text, ext: 'txt' });
          if (text === null) return ctx.out('Nothing changed.');
          body.text = text.trim();
        }
        const r = await ctx.conn.api<{ entry: Note }>('PATCH', `/api/memory/entries/${e.id}`, body);
        if (ctx.o.json) return ctx.json(r);
        ctx.out(`Changed note ${r.entry.id}.`);
      },
    },
    {
      name: 'forget',
      aliases: ['remove', 'delete', 'rm'],
      args: [note],
      options: { forever: { type: 'boolean', desc: 'Erase it and its history at once (no 30 days to restore it)' } },
      summary: 'Forget a note (restorable for 30 days)',
      examples: ['hydor memory forget 42', 'hydor memory forget 42 -y', 'hydor memory forget 42 --forever -y'],
      async run(ctx, [given], v) {
        const e = await findNote(ctx, given);
        const forever = flag(v, 'forever');
        if (!(await ctx.confirm(`${forever ? 'Erase' : 'Forget'} “${cut(e.title ?? e.text, 60)}”${forever ? ' for good' : ''}?`))) return ctx.out('Not forgotten.');
        const r = await ctx.conn.api('DELETE', `/api/memory/entries/${e.id}${forever ? '?forever=1' : ''}`);
        if (ctx.o.json) return ctx.json(r);
        ctx.out(forever ? `Erased note ${e.id}.` : `Forgot note ${e.id}. hydor memory restore ${e.id} brings it back for 30 days.`);
      },
    },
    {
      name: 'restore',
      args: [note],
      summary: 'Bring back a forgotten note',
      examples: ['hydor memory restore 42'],
      async run(ctx, [given]) {
        const e = await findNote(ctx, given, 'deleted');
        const r = await ctx.conn.api<{ entry: Note }>('POST', `/api/memory/entries/${e.id}/restore`);
        if (ctx.o.json) return ctx.json(r);
        ctx.out(`Restored note ${e.id}.`);
      },
    },
    {
      name: 'profile',
      aliases: ['profile show'],
      args: [],
      summary: 'Your profile: what every agent reads first',
      examples: ['hydor memory profile', 'hydor memory profile --json'],
      async run(ctx) {
        const r = await ctx.conn.api<{ profile: Note | null; maxWords: number }>('GET', '/api/memory/profile');
        if (ctx.o.json) return ctx.json(r);
        if (!r.profile?.text) return ctx.out('Your profile is empty: hydor memory profile edit writes it.');
        const { p } = ctx.look;
        ctx.out([p.dim(`${r.profile.text.split(/\s+/).filter(Boolean).length} of ${r.maxWords} words · changed ${timeAgo(r.profile.updatedAt)}`), '', ...markdown(ctx, r.profile.text)]);
      },
    },
    {
      name: 'profile edit',
      args: [],
      options: {
        file: { type: 'string', value: '<path>', desc: 'The whole profile from a file (- is stdin)', kind: 'file' },
        clear: { type: 'boolean', desc: 'Empty it (it stays among the forgotten notes for 30 days)' },
      },
      summary: 'Write your profile',
      help: 'On a terminal it opens in your editor with what is there; saving it unchanged changes nothing. A profile over its word limit is kept as written and shortened by the helper model in the background; one that looks like a password or key is refused.',
      examples: ['hydor memory profile edit', 'hydor memory profile edit --file profile.md', 'hydor memory profile edit --clear -y'],
      async run(ctx, _a, v) {
        let text: string | null;
        if (flag(v, 'clear')) {
          if (!(await ctx.confirm('Empty your profile?'))) return ctx.out('Not emptied.');
          text = '';
        } else {
          const current = (await ctx.conn.api<{ profile: Note | null }>('GET', '/api/memory/profile')).profile?.text ?? '';
          text = await ctx.readText({ file: str(v, 'file'), current });
          if (text === null) return ctx.out('Nothing changed.');
        }
        const r = await ctx.conn.api<{ profile: Note | null; fitting: boolean }>('PUT', '/api/memory/profile', { text });
        if (ctx.o.json) return ctx.json(r);
        ctx.out(text ? `Saved your profile${r.fitting ? ' (it is over its word limit: the helper model shortens it in the background)' : ''}.` : 'Emptied your profile.');
      },
    },
  ],
};
