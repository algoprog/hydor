// `hydor settings`: every option of the Settings page, read and changed from the terminal. List shows them as the page
// groups them (App, Agents, Capabilities) with their values, get and set read and change one, run presses a button
// (Send a test, Check now), open prints the page's address, and with no verb on a terminal the options are browsed: a
// section, then an option, and Enter changes it. The options and how each is read and changed are in one table
// (server/tui/settings-table.ts), loaded only when a verb runs.
import { makePaint } from '../term.ts';
import { Cancelled, choose, fields, flag, str, table, UsageError, type Area, type Ctx } from './kit.ts';
import type { Read, Row, Value } from '../settings-table.ts';

const OPTION_HINT = 'hydor settings list shows them';

type Table = typeof import('../settings-table.ts');
const loadTable = (): Promise<Table> => import('../settings-table.ts');

/** The option named loosely (its id, a section and the start of its words, or the words), or picked on a terminal. */
async function option(ctx: Ctx, t: Table, given: string | undefined): Promise<Row> {
  if (given) return t.findRow(given);
  return choose(ctx, t.ROWS, undefined, { id: (r) => r.id, names: (r) => [r.label], what: 'option', hint: OPTION_HINT, label: (r) => r.label, detail: (r) => r.id });
}

/** A value as one plain word or line, as `get` prints it for a script and `set` takes it back. */
function plain(r: Row, v: Value | undefined): string {
  if (v === undefined || v === null) return '';
  if (r.kind === 'secret') return v ? 'set' : 'not set';
  if (typeof v === 'boolean') return r.states ? r.states[v ? 0 : 1] : v ? 'on' : 'off';
  return Array.isArray(v) ? v.join(',') : String(v);
}

/** What an option's value reads as on a screen: its value, or why it has none here. */
function shown(ctx: Pick<Ctx, 'look'>, t: Table, r: Row, rd: Read | undefined, colour = true): string {
  const p = colour ? ctx.look.p : makePaint(false);
  if (rd?.error) return p.red('unavailable');
  if (r.device && !r.device.terminal) return p.dim('in each browser');
  const v = rd?.value;
  if (v === undefined) return p.dim(r.kind === 'page' ? 'page' : r.kind === 'command' ? r.command! : r.kind === 'action' ? 'button' : r.kind === 'device' ? '' : '–');
  const text = t.showValue(r, v).replace(/\s+/g, ' ');
  if (r.kind === 'switch' || typeof v === 'boolean') return v ? p.green(text) : p.dim(text);
  if (r.kind === 'page' || r.kind === 'command') return p.dim(text);
  return text.length > 60 ? `${text.slice(0, 59)}…` : text;
}

/** What an option takes, in words. */
function takes(t: Table, r: Row): string | undefined {
  switch (r.kind) {
    case 'switch':
      return 'on or off';
    case 'number':
      return `a whole number from ${r.range!.min} to ${r.range!.max}`;
    case 'choice':
      return r.free
        ? `one of ${r.choices?.map((c) => c.value).join(', ') || 'its values'}, or any id`
        : `one of ${r.choices?.map((c) => c.value).join(', ') || 'what the server offers (Tab lists them)'}`;
    case 'list':
      return `a list, with commas: ${r.items}`;
    case 'text':
      return r.readonly ? undefined : r.multiline ? 'a text (--file <path>, or your editor)' : 'text';
    case 'secret':
      return 'a key or token, typed hidden (--clear removes it)';
    case 'device':
      return r.device?.terminal ? (r.device.key === 'enter' ? 'join or queue' : 'on or off') : undefined;
    default:
      return undefined;
  }
}

/** Presses a button: asks its question first, says what it did. */
async function pressed(ctx: Ctx, t: Table, r: Row, arg?: string): Promise<void> {
  const q = r.act?.question;
  if (q && !(await ctx.confirm(q))) return ctx.out('Not done.');
  if (r.act?.arg && !arg) {
    if (!ctx.interactive) throw new UsageError(`${r.label} needs ${r.act.arg}: ${ctx.usage} <${r.act.arg}>`);
    arg = (await ctx.ask(`${r.act.arg[0].toUpperCase()}${r.act.arg.slice(1)}: `)) ?? undefined;
    if (!arg) throw new Cancelled();
  }
  if (r.act?.slow) ctx.out(ctx.look.p.dim('This can take a minute…'));
  const lines = await t.runAction(ctx.conn, r, arg);
  if (ctx.o.json) return ctx.json({ id: r.id, say: lines });
  ctx.out(lines);
}

const option_ = { name: 'option', kind: 'setting', pick: true } as const;

export const settings: Area = {
  name: 'settings',
  summary: 'Read and change every setting',
  help: 'The options are the page’s, in its three tabs (App, Agents, Capabilities) and their sections, each with an id such as general.resume-after-usage-limits. Name one by its id, by its section and the start of its words (general.resume), or by its words alone when only one fits. What the app keeps in each browser (theme, language, sound) cannot be changed from here: those say so and give the page’s address.',
  group: 'this',
  default: 'browse',
  verbs: [
    {
      name: 'browse',
      args: [],
      summary: 'Pick a section, then an option to change',
      examples: ['hydor settings'],
      help: 'The default on a terminal: ↑↓ and typing to find a section or an option, Enter to open or change it (a switch flips, a choice offers its values, a number or text is typed, a button asks first, an option only the page can change prints its address), Esc to go back. Piped, it lists every option.',
      async run(ctx) {
        if (!ctx.interactive || ctx.o.json) return listAll(ctx, []);
        const t = await loadTable();
        let section: string | null = null;
        for (;;) {
          if (!section) {
            section = await ctx.pick(
              'Settings: which section?',
              t.SECTION_LIST.map((s) => ({ label: s.label, hint: `${s.group} · ${s.sub}`, value: s.id })),
            );
            if (!section) return;
          }
          const rows = t.rowsOf(section);
          const reads = await t.readAll(ctx.conn, rows);
          const sec = t.SECTION_LIST.find((s) => s.id === section)!;
          const id = await ctx.pick(
            `${sec.group} › ${sec.label}`,
            rows.map((r) => ({ label: r.label, hint: shown(ctx, t, r, reads.get(r.id), false), value: r.id })),
          );
          if (!id) {
            section = null;
            continue;
          }
          try {
            await change(
              ctx,
              t,
              rows.find((r) => r.id === id)!,
              reads.get(id),
            );
          } catch (e) {
            if (!(e instanceof Cancelled)) throw e;
          }
        }
      },
    },
    {
      name: 'list',
      aliases: ['ls'],
      args: [{ name: 'section', kind: 'settings-section', optional: true }],
      summary: 'Every option with its value',
      help: 'With a section, only its options. --json gives { id: value } for the options that have a value (a key or token only as set or not).',
      examples: ['hydor settings list', 'hydor settings list memory', 'hydor settings list --json'],
      async run(ctx, [given]) {
        return listAll(ctx, given ? [given] : []);
      },
    },
    {
      name: 'get',
      args: [{ name: 'option', kind: 'setting' }],
      summary: 'One option’s value and what it takes',
      help: 'Piped, only the value (on, off, a word, a list with commas; a key or token as set or not set). Options the app keeps in each browser, or only the page can show, say so and give the address.',
      examples: ['hydor settings get general.resume-after-usage-limits', 'hydor settings get memory.notes'],
      async run(ctx, [given]) {
        const t = await loadTable();
        const r = await option(ctx, t, given);
        const rd = await t.readAll(ctx.conn, [r]).then((m) => m.get(r.id)!);
        if (rd.error) throw new Error(rd.error);
        const where = t.explain(r, ctx.conn.base);
        if (ctx.o.json) return ctx.json(t.jsonValue(r, rd.value) ?? null);
        if (!ctx.interactive) return ctx.out(rd.value === undefined ? (where.length ? where : ['']) : plain(r, rd.value));
        const sec = t.SECTION_LIST.find((s) => s.id === r.section)!;
        ctx.out(
          fields(ctx, [
            [r.label, rd.value === undefined ? undefined : shown(ctx, t, r, rd)],
            ['id', r.id],
            ['where', `${sec.group} › ${sec.label}`],
            ['takes', takes(t, r)],
            ['note', r.note],
            ['command', r.command],
            ['page', r.kind === 'page' || r.device ? `${ctx.conn.base}${t.settingsAddress(r)}` : undefined],
            ['button', r.kind === 'action' ? `hydor settings run ${r.id}${r.act?.arg ? ` <${r.act.arg}>` : ''}` : undefined],
          ]),
        );
        if (rd.value === undefined && !where.length && r.kind !== 'action') ctx.out(ctx.look.p.dim('It has no value to show.'));
      },
    },
    {
      name: 'set',
      args: [option_, { name: 'value', kind: 'value', optional: true, rest: true }],
      options: { file: { type: 'string', value: '<path>', desc: 'A long text, or a key, from a file (- is stdin)', kind: 'file' }, clear: { type: 'boolean', desc: 'Empty it, or remove the key' } },
      summary: 'Change an option',
      help: 'A switch takes on or off, a choice one of its values (Tab lists them; a model by its id), a number a whole number, a list its items with commas (none empties it). A key or token is asked for hidden, or comes from --file - on stdin: it is never printed back. A long text comes from --file or your editor. A button runs (after its question), as hydor settings run does. Options kept in each browser, or changed only on the page or with a command of its own, say so (exit code 2).',
      examples: [
        'hydor settings set general.resume-after-usage-limits on',
        'hydor settings set memory.notes 20',
        'hydor settings set models.openrouter',
        'hydor settings set search.providers duckduckgo,naget',
        'hydor settings set guidelines.for-every-session --file rules.md',
      ],
      async run(ctx, [given, ...rest], v) {
        const t = await loadTable();
        const r = await option(ctx, t, given);
        const word = rest.join(' ');
        if (r.kind === 'action') return pressed(ctx, t, r, word || undefined);
        const moved = t.explain(r, ctx.conn.base);
        if (moved.length) throw new UsageError(moved.join('\n'));
        if (!r.write && !r.device) throw new UsageError(`${r.label} only shows a value: hydor settings get ${r.id}`);
        let text: string | undefined = word || undefined;
        const file = str(v, 'file');
        if (flag(v, 'clear')) text = r.kind === 'list' ? 'none' : '';
        else if (file) text = (await ctx.readText({ file })) ?? undefined;
        else if (text === undefined) {
          if (r.kind === 'secret') {
            if (!ctx.interactive) throw new UsageError(`Give the ${r.label} on stdin with --file -, or run it at a prompt to type it hidden`);
            text = (await ctx.ask(`${r.label} (typed hidden): `, { hidden: true })) ?? undefined;
            if (!text) throw new Cancelled();
          } else if (r.multiline && ctx.interactive) {
            const cur = await t.readAll(ctx.conn, [r]).then((m) => m.get(r.id)?.value);
            text = (await ctx.readText({ current: typeof cur === 'string' ? cur : '', ext: 'md' })) ?? undefined;
            if (text === undefined) return ctx.out('Left as it was.');
          } else if (ctx.interactive && (r.kind === 'switch' || r.kind === 'choice' || r.device)) {
            text = (await chooseValue(ctx, t, r)) ?? undefined;
            if (text === undefined) throw new Cancelled();
          } else {
            const how = takes(t, r);
            throw new UsageError(`Say the value${how ? ` (${how})` : ''}: ${ctx.usage}`);
          }
        }
        if (text === undefined) throw new UsageError(`Say the value: ${ctx.usage}`);
        const d = await t.setRow(ctx.conn, r, text, { confirm: (q) => ctx.confirm(q), base: ctx.conn.base });
        if (ctx.o.json) return ctx.json({ id: r.id, changed: d.changed, value: t.jsonValue(r, d.value) ?? null });
        ctx.out(d.say);
      },
    },
    {
      name: 'run',
      args: [option_, { name: 'argument', kind: 'text', optional: true, rest: true }],
      summary: 'Press a button (Send a test, Check now…)',
      help: 'The options of the page that are buttons. Ones that take something away, or download a lot, ask first (-y says yes).',
      examples: ['hydor settings run notifications.send-a-test', 'hydor settings run general.check-now', 'hydor settings run memory.tidy-up-now'],
      async run(ctx, [given, ...rest]) {
        const t = await loadTable();
        const r = await option(ctx, t, given);
        if (r.kind !== 'action') throw new UsageError(`${r.label} is not a button${r.write ? `: hydor settings set ${r.id} <value> changes it` : ` (hydor settings get ${r.id})`}`);
        return pressed(ctx, t, r, rest.join(' ') || undefined);
      },
    },
    {
      name: 'open',
      args: [{ name: 'section', kind: 'settings-section', optional: true }],
      summary: 'The address of a section or an option',
      help: 'Prints it; --browser opens it in your browser too.',
      examples: ['hydor settings open', 'hydor settings open memory', 'hydor settings open --browser general.new-theme'],
      async run(ctx, [given]) {
        const t = await loadTable();
        let path = '/settings';
        if (given) {
          const sec = t.findSection(given);
          path = sec ? `/settings?s=${sec.id}` : t.settingsAddress(t.findRow(given));
        }
        const url = `${ctx.conn.base}${path}`;
        if (ctx.o.json) return ctx.json({ url });
        ctx.out(url);
        if (ctx.o.browser) (await import('../commands.ts')).openBrowser(url);
      },
    },
  ],
};

/** `list`'s work, shared with `browse` when nobody is there to pick. */
async function listAll(ctx: Ctx, args: string[]): Promise<void> {
  const t = await loadTable();
  const sec = args[0] ? t.findSection(args[0]) : null;
  if (args[0] && !sec) throw new UsageError(`No section “${args[0]}”: ${t.SECTION_LIST.map((s) => s.id).join(', ')}`);
  const sections = sec ? [sec] : t.SECTION_LIST;
  const reads = await t.readAll(ctx.conn, sec ? t.rowsOf(sec.id) : t.ROWS);
  if (ctx.o.json) {
    const out: Record<string, unknown> = {};
    for (const r of t.ROWS) {
      const x = reads.get(r.id);
      if (x && x.value !== undefined) out[r.id] = t.jsonValue(r, x.value);
    }
    return ctx.json(out);
  }
  const { p } = ctx.look;
  const out: string[] = [];
  for (const g of t.GROUPS) {
    for (const s of sections.filter((x) => x.group === g)) {
      if (out.length) out.push('');
      out.push(p.bold(`${g} › ${s.label}`));
      const rows = t.rowsOf(s.id).map((r) => [r.label, shown(ctx, t, r, reads.get(r.id)), p.dim(r.id)]);
      out.push(...table(ctx, rows, { grow: 1, indent: 2 }));
    }
  }
  ctx.out(out);
}

/** Picks a switch's, a choice's or a terminal setting's value; null when they back out. */
async function chooseValue(ctx: Ctx, t: Table, r: Row, current?: Value): Promise<string | null> {
  const cs =
    r.kind === 'switch' || r.device?.key === 'suggestions'
      ? [
          { value: 'on', label: 'On' },
          { value: 'off', label: 'Off' },
        ]
      : await t.choicesOf(ctx.conn, r);
  const cur = r.kind === 'switch' || r.device?.key === 'suggestions' ? (current ? 'on' : 'off') : typeof current === 'string' ? current : undefined;
  return ctx.pick(
    r.label,
    cs.map((c) => ({ label: c.label, hint: c.value === cur ? 'now' : c.label === c.value ? undefined : c.value, value: c.value })),
  );
}

/** Enter on an option in the browser: what changing it takes. */
async function change(ctx: Ctx, t: Table, r: Row, rd: Read | undefined): Promise<void> {
  const say = (lines: string[]) => ctx.out(lines);
  const cur = rd?.value;
  if (r.kind === 'action') return pressed(ctx, t, r);
  const moved = t.explain(r, ctx.conn.base);
  if (moved.length) return say(moved);
  if (!r.write && !r.device) return say([`${r.label}: ${shown({ look: ctx.look }, t, r, rd)}`, ...(r.note ? [r.note] : [])]);
  const set = async (text: string) => say((await t.setRow(ctx.conn, r, text, { confirm: (q) => ctx.confirm(q), base: ctx.conn.base })).say);
  switch (r.kind) {
    case 'switch': {
      return set(cur ? 'off' : 'on');
    }
    case 'choice':
    case 'device': {
      const next = await chooseValue(ctx, t, r, cur);
      if (next === null) throw new Cancelled();
      return set(next);
    }
    case 'secret': {
      if (cur) {
        const what = await ctx.pick(r.label, [
          { label: 'Replace it', value: 'replace' },
          { label: 'Remove it', value: 'remove' },
        ]);
        if (!what) throw new Cancelled();
        if (what === 'remove') return set('');
      }
      const key = await ctx.ask(`${r.label} (typed hidden): `, { hidden: true });
      if (!key) throw new Cancelled();
      return set(key);
    }
    case 'text': {
      if (r.multiline) {
        const next = await ctx.readText({ current: typeof cur === 'string' ? cur : '', ext: 'md' });
        if (next === null) return say(['Left as it was.']);
        return set(next);
      }
      const next = await ctx.ask(`${r.label}${typeof cur === 'string' && cur ? ` [${cur}]` : ''} (empty keeps it, - empties it): `);
      if (next === null || next === '') throw new Cancelled();
      return set(next === '-' ? '' : next);
    }
    case 'number': {
      const next = await ctx.ask(`${r.label} (${r.range!.min} to ${r.range!.max}${cur !== undefined ? `, now ${cur}` : ''}): `);
      if (!next) throw new Cancelled();
      return set(next);
    }
    case 'list': {
      const next = await ctx.ask(`${r.label} (${r.items}; none empties it${Array.isArray(cur) && cur.length ? `; now ${cur.join(',')}` : ''}): `);
      if (!next) throw new Cancelled();
      return set(next);
    }
    default:
      return say([`${r.label}: nothing to change here.`]);
  }
}
