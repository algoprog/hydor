// `/hydor <command…>` in the chat: any area command of `hydor` (`/hydor projects show thesis`, `/hydor memory search
// docker`) run without leaving the chat. The words are split as a shell would and parsed as `hydor <words>` would (area,
// verb, arguments, options); the verb runs with a Ctx the chat gives (its lines printed above the region, its
// questions answered in the chat's own picker and input line, its editor given the terminal); and the completion menu
// after `/hydor ` lists the areas, their verbs, the arguments (from areas/loaders.ts, the same as Tab completion in a
// shell) and the options. Nothing here touches the terminal: the chat passes a `Host` for that.
import path from 'node:path';
import { commandDef, didYouMean, helpText, parseArgv, ALL_COMMAND_NAMES, routeOf, type Opts } from './args.ts';
import { AREAS, defaultVerb } from './areas/index.ts';
import { Cancelled, runVerb, UsageError, usageLine, type Ctx, type PickItem } from './areas/kit.ts';
import { ApiError, type Conn } from './client.ts';
import { candidates } from './completion.ts';
import type { Item } from './complete.ts';
import type { Look } from './lines.ts';

/** What the chat gives a command to work with. */
export interface Host {
  conn: Conn;
  /** The look at the width now. */
  look(): Look;
  /** There is a terminal and a region (not the plain mode of a pipe). */
  interactive: boolean;
  /** Lines printed for good above the region; `first` is the first of this command (it gets a blank line before it). */
  print(lines: string[], first: boolean): void;
  /** A list to pick from; null when they back out. */
  pick(title: string, items: PickItem[]): Promise<string | null>;
  /** One line typed in the input line (hidden: shown as •); null when they back out. */
  ask(question: string, hidden: boolean): Promise<string | null>;
  /** Hands the terminal over for the time `fn` takes (an editor), and takes it back. */
  handOver<T>(fn: () => Promise<T>): Promise<T>;
  open(url: string): void;
}

// ---- the words -----------------------------------------------------------------------------------------------

/** Words split as a shell does: by spaces, with 'single' and "double" quotes (which may hold spaces) and \ before a character. */
export function splitWords(s: string): string[] {
  const out: string[] = [];
  let cur = '';
  let has = false;
  let quote = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      if (c === quote) quote = '';
      else if (c === '\\' && quote === '"' && i + 1 < s.length && /["\\$`]/.test(s[i + 1])) cur += s[++i];
      else cur += c;
    } else if (c === '"' || c === "'") {
      quote = c;
      has = true;
    } else if (c === '\\' && i + 1 < s.length) {
      cur += s[++i];
      has = true;
    } else if (/\s/.test(c)) {
      if (cur || has) out.push(cur);
      cur = '';
      has = false;
    } else cur += c;
  }
  if (cur || has) out.push(cur);
  return out;
}

/** What to say for a command of the old kind (it has a slash command in the chat, or runs in a shell). */
const SLASH_FOR: Record<string, string> = {
  sessions: '/sessions',
  resume: '/sessions',
  models: '/model',
  tiers: '/tiers',
  usage: '/usage',
  stop: '/stop',
  show: '/sessions or /subagents',
  send: 'the input line (type the message)',
  run: 'the input line (type the message)',
  chat: 'the input line (type the message)',
};

/** The note for a word that is no area: the chat's own way, a shell for the others, or what it may have meant. */
export function legacyNote(word: string): string {
  const slash = SLASH_FOR[word];
  if (slash) return `In the chat, use ${slash}, or run it in a shell: hydor ${word}`;
  if (commandDef(word)) return `In the chat, run it in a shell: hydor ${word}`;
  const mean = didYouMean(word, ALL_COMMAND_NAMES, (w) => `/hydor ${w}`);
  return `Unknown command: ${word}.${mean || ' /hydor lists the areas.'}`;
}

// ---- running one ---------------------------------------------------------------------------------------------

/** The chat's Ctx for a verb. */
async function ctxFor(host: Host, o: Opts, usage: string, say: (lines: string[]) => void): Promise<Ctx> {
  const { terminalCtx } = await import('./areas/terminal.ts');
  // The terminal's own Ctx gives the editor (its temporary file and $VISUAL/$EDITOR, which `!` hands over to as well).
  const base = terminalCtx(host.conn, host.look(), o, usage);
  const interactive = host.interactive;
  const nobody = (what: string) => new UsageError(`${what}: there is no terminal for it here`);
  const edit = (text: string, ext?: string) => host.handOver(() => base.edit(text, ext));
  return {
    conn: host.conn,
    look: host.look(),
    usage,
    interactive,
    fit: true,
    o,
    out: (lines) => say(Array.isArray(lines) ? lines : lines.split('\n')),
    json: (value) => say(JSON.stringify(value, null, 2).split('\n')),
    async confirm(question) {
      if (o.yes) return true;
      if (!interactive) throw nobody(question.replace(/\?$/, ''));
      // No first, so that Enter alone is the safe answer.
      return (
        (await host.pick(question, [
          { label: 'No', value: 'no' },
          { label: 'Yes', value: 'yes' },
        ])) === 'yes'
      );
    },
    edit,
    async readText({ file, current = '', ext }) {
      if (file === '-') throw new UsageError('There is no stdin in the chat: give the text with --file <path>, or leave it out to write it in the editor');
      if (file) return base.readText({ file });
      if (!interactive) throw nobody('The editor');
      return edit(current, ext);
    },
    async pick(title, items) {
      if (!interactive) throw nobody('A list to pick from');
      return host.pick(title, items);
    },
    async ask(question, { hidden = false } = {}) {
      if (!interactive) throw nobody(question.replace(/[:?]\s*$/, ''));
      return host.ask(question, hidden);
    },
    page: async (lines) => say(lines),
    open: (url) => host.open(url),
  };
}

/**
 * Runs `/hydor <words>`: false when the words name no area command (the note is printed), true when one ran. A wrong
 * use or an answer of the server is printed in red; nothing here ends the chat.
 */
export async function runHydor(host: Host, line: string): Promise<void> {
  let first = true;
  const say = (lines: string[]) => {
    if (!lines.length) return;
    host.print(lines, first);
    first = false;
  };
  const { p } = host.look();
  const fail = (message: string) => {
    const [head, ...more] = message.split('\n');
    say([p.red(`✗ ${head}`), ...more]);
  };
  const words = splitWords(line);
  try {
    if (!words.length) return say(helpText(p)!.split('\n'));
    let o: Opts;
    try {
      o = parseArgv(words);
    } catch (e) {
      if (!(e instanceof UsageError)) throw e;
      return fail(e.message);
    }
    if (o.help) {
      const topic = o.route ? o.route.area.name : o.cmd === 'help' ? o.args[0] : o.cmd !== 'chat' ? o.cmd : undefined;
      const sub = o.route ? (o.route.verb ? o.route.verb.name.split(' ') : []) : o.cmd === 'help' ? o.args.slice(1) : [];
      const text = helpText(p, topic, sub);
      return say(text === null ? [p.yellow(legacyNote(topic!))] : text.split('\n'));
    }
    if (o.cmd !== 'area' || !o.route) return say([p.yellow(legacyNote(words.find((w) => !w.startsWith('-')) ?? ''))]);
    const verb = o.route.verb ?? defaultVerb(o.route.area);
    const ctx = await ctxFor(host, o, usageLine(o.route.area, verb).replace(/^hydor /, '/hydor '), say);
    await runVerb(ctx, o.route.area, verb, o.args, o.route.values);
  } catch (e) {
    // Backing out says nothing; everything else is told, and the chat goes on.
    if (e instanceof Cancelled) return;
    if (e instanceof UsageError || e instanceof ApiError) return fail(e.message);
    fail((e as Error)?.message ?? String(e));
  }
}

// ---- the menu --------------------------------------------------------------------------------------------------

/** Entries of a folder on this computer for a file argument: the words typed so far name the folder and the start of the name. */
async function localEntries(cwd: string, typed: string, dirsOnly: boolean): Promise<[string, string?][]> {
  const fsp = await import('node:fs/promises');
  const slash = typed.lastIndexOf('/');
  const dirPart = slash >= 0 ? typed.slice(0, slash + 1) : '';
  const dir = path.resolve(cwd, dirPart.startsWith('~/') ? path.join(process.env.HOME ?? '', dirPart.slice(2)) : dirPart || '.');
  try {
    const list = await fsp.readdir(dir, { withFileTypes: true });
    return list
      .filter((e) => !e.name.startsWith('.') || typed.slice(slash + 1).startsWith('.'))
      .filter((e) => !dirsOnly || e.isDirectory())
      .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name))
      .slice(0, 300)
      .map((e): [string, string?] => [`${dirPart}${e.name}${e.isDirectory() ? '/' : ''}`]);
  } catch {
    return [];
  }
}

/**
 * What can come next after the words before the word being typed: the areas, an area's verbs, the argument's
 * candidates (what Tab completion lists), or the options when the word starts with `-`. All of them, not only those
 * that start with the word: the menu matches loosely.
 */
export async function hydorItems(before: string[], query: string, conn: Conn, cwd: string): Promise<Item[]> {
  const api = (p: string) => conn.api('GET', p, undefined, { timeoutMs: 700 });
  const option = query.startsWith('-');
  const words = [...before, option ? '-' : ''];
  let found = await candidates(words, api);
  if (found === ':files' || found === ':dirs') found = await localEntries(cwd, query, found === ':dirs');
  if (!before.length) found = found.filter(([v]) => AREAS.some((a) => a.name === v));
  return found.map(([value, desc]) => ({ label: value, hint: desc, value, kind: 'value' as const }));
}

/**
 * What Enter on a row of the menu does at this word: 'run' when the line is then whole (the last argument a verb needs,
 * or the area's or verb's own name where nothing more is needed), else 'insert' (the word goes in and the next menu opens).
 * `exact`: the row is what was typed whole.
 */
export function stepAfter(before: string[], value: string, exact: boolean): 'run' | 'insert' {
  // An option or a folder goes in; the line goes on.
  if (value.startsWith('-') || value.endsWith('/')) return 'insert';
  const words = [...before, value];
  const route = routeOf(words);
  if (!route || route.unknown) return 'insert';
  // Only the area's name so far.
  if (words.length === 1) {
    if (!route.area.bare && !route.verb) {
      const v = defaultVerb(route.area);
      return exact && !v.args.some((a) => !a.optional) ? 'run' : 'insert';
    }
  }
  const verb = route.verb ?? (route.area.bare ? defaultVerb(route.area) : undefined);
  if (!verb) return 'insert';
  // The words that are no options (nor an option's value) after the area's and verb's own.
  let o: Opts;
  try {
    o = parseArgv(words);
  } catch {
    return 'insert';
  }
  const need = verb.args.filter((a) => !a.optional).length;
  const given = o.args.length;
  // The verb's name just chosen: it runs only when typed whole and it needs nothing.
  if (words.length === route.words && !route.area.bare) return exact && need === 0 ? 'run' : 'insert';
  return given >= need ? 'run' : 'insert';
}
