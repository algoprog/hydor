// Tab completion for `hydor` in bash, zsh and fish. `hydor completion [shell]` prints a script that asks the command
// itself for candidates (`hydor __complete -- <the words after hydor, the last being the one under the cursor>`),
// one a line as `value<TAB>description` (or the one line `:dirs`: complete folders), so options, session keys, models
// and agents come from the running Hydor. `hydor completion install` puts the script where the shell finds it. The
// hidden __complete never starts the server, prints no errors, and answers within about 800 ms.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ALL_COMMAND_NAMES, commandDef, describeCommand, didYouMean, optionDef, OPTION_TABLE, programOf, routeOf, UsageError, verbOptions, type Route } from './args.ts';
import { areaByName, defaultVerb } from './areas/index.ts';
import { LOADERS, type Candidate, type Loaded } from './areas/loaders.ts';
import { makePaint, truncate } from './term.ts';

export type Shell = 'bash' | 'zsh' | 'fish';
export const SHELLS: Shell[] = ['bash', 'zsh', 'fish'];

const MARK = '# hydor completion';

// ---- the scripts -----------------------------------------------------------------------------------------------

const BASH = `# Tab completion for hydor (bash): it asks the command itself. Set up with: hydor completion install
_hydor() {
  local IFS=$'\\n' prog=\${COMP_WORDS[0]} out line
  local -a w
  w=("\${COMP_WORDS[@]:1:COMP_CWORD}")
  [[ \${w[\${#w[@]}-1]} == = ]] && w[\${#w[@]}-1]=''
  out=$("$prog" __complete -- "\${w[@]}" 2>/dev/null)
  COMPREPLY=()
  if [[ $out == :dirs ]]; then
    COMPREPLY=($(compgen -d -- "\${COMP_WORDS[COMP_CWORD]}"))
    compopt -o filenames 2>/dev/null
    return 0
  fi
  if [[ $out == :files ]]; then
    COMPREPLY=($(compgen -f -- "\${COMP_WORDS[COMP_CWORD]}"))
    compopt -o filenames 2>/dev/null
    return 0
  fi
  [[ -n $out ]] || return 0
  while IFS= read -r line; do COMPREPLY+=("\${line%%$'\\t'*}"); done <<< "$out"
}
complete -F _hydor hydor
`;

const ZSH = `#compdef hydor
# Tab completion for hydor (zsh): it asks the command itself. Set up with: hydor completion install
(( $+functions[compdef] )) || { autoload -Uz compinit && compinit -i; }
_hydor() {
  local out line value desc
  local -a items
  out=$("$words[1]" __complete -- "\${(@)words[2,CURRENT]}" 2>/dev/null)
  if [[ $out == ':dirs' ]]; then
    _files -/
    return
  fi
  if [[ $out == ':files' ]]; then
    _files
    return
  fi
  for line in "\${(@f)out}"; do
    [[ -n $line ]] || continue
    value=\${line%%$'\\t'*}
    if [[ $line == *$'\\t'* ]]; then desc=\${line#*$'\\t'}; else desc=''; fi
    items+=("\${value//:/\\\\:}\${desc:+:$desc}")
  done
  (( $#items )) && _describe -t hydor-values 'hydor' items
}
compdef _hydor hydor
`;

const FISH = `# Tab completion for hydor (fish): it asks the command itself. Set up with: hydor completion install
function __hydor_complete
    set -l words (commandline -opc)
    set -l cur (commandline -ct)
    set -l out ($words[1] __complete -- $words[2..-1] "$cur" 2>/dev/null)
    if test "$out" = ':dirs'
        __fish_complete_directories "$cur"
    else if test "$out" = ':files'
        __fish_complete_path "$cur"
    else
        printf '%s\\n' $out
    end
end
complete -c hydor -f -a '(__hydor_complete)'
`;

/** The script for a shell. */
export const completionScript = (shell: Shell) => (shell === 'bash' ? BASH : shell === 'zsh' ? ZSH : FISH);

/** The shell named by $SHELL (its program's name), when it is one of the three. */
export function shellOf(env: NodeJS.ProcessEnv = process.env): Shell | undefined {
  const name = path.basename(env.SHELL ?? '');
  return SHELLS.find((s) => s === name);
}

// ---- installing ------------------------------------------------------------------------------------------------

const BASH_COMPLETION = ['/usr/share/bash-completion/bash_completion', '/etc/bash_completion', '/opt/homebrew/etc/profile.d/bash_completion.sh', '/usr/local/etc/profile.d/bash_completion.sh'];

/** A line added to a shell's startup file, once: false when its marker was there already. */
function addLine(file: string, line: string): boolean {
  let text = '';
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {}
  if (text.includes(MARK)) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${text}${text && !text.endsWith('\n') ? '\n' : ''}${line}\n`);
  return true;
}

/** Writes a script to a file (making its folders), as the shell's. */
function writeScript(file: string, shell: Shell) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, completionScript(shell));
}

/**
 * Puts the completion where the shell finds it, and says what it did. Where it goes comes from `env` (HOME,
 * XDG_DATA_HOME, ZDOTDIR); `exists` says whether a file is there (to see whether bash-completion is installed).
 */
export function installCompletion(shell: Shell, env: NodeJS.ProcessEnv = process.env, exists: (f: string) => boolean = fs.existsSync): string[] {
  const home = env.HOME || os.homedir();
  const data = env.XDG_DATA_HOME || path.join(home, '.local/share');
  const tilde = (f: string) => (f.startsWith(`${home}${path.sep}`) ? `~${f.slice(home.length)}` : f);
  const out: string[] = [];
  if (shell === 'fish') {
    const file = path.join(env.XDG_CONFIG_HOME || path.join(home, '.config'), 'fish/completions/hydor.fish');
    writeScript(file, 'fish');
    out.push(`Wrote ${tilde(file)}: fish finds it by itself.`);
  } else if (shell === 'bash') {
    const file = path.join(data, 'bash-completion/completions/hydor');
    writeScript(file, 'bash');
    out.push(`Wrote ${tilde(file)}.`);
    if (BASH_COMPLETION.some(exists)) out.push('bash-completion loads it when you complete a hydor command.');
    else {
      const rc = path.join(home, '.bashrc');
      out.push(addLine(rc, `[ -f "${file}" ] && . "${file}"  ${MARK}`) ? `bash-completion is not installed, so one line in ${tilde(rc)} loads it.` : `${tilde(rc)} loads it already.`);
    }
  } else {
    const file = path.join(data, 'hydor/completion.zsh');
    writeScript(file, 'zsh');
    out.push(`Wrote ${tilde(file)}.`);
    const rc = path.join(env.ZDOTDIR || home, '.zshrc');
    out.push(addLine(rc, `[ -f "${file}" ] && source "${file}"  ${MARK}`) ? `One line in ${tilde(rc)} loads it.` : `${tilde(rc)} loads it already.`);
  }
  out.push(`Tab completion for ${shell} is ready: open a new terminal to use it.`);
  return out;
}

/** `hydor completion [bash|zsh|fish|install]`: its exit code. */
export function completionCommand(args: string[], env: NodeJS.ProcessEnv = process.env): number {
  const [first, second] = args;
  const named = (w: string | undefined) => SHELLS.find((s) => s === w);
  try {
    if (first === 'install') {
      const shell = named(second) ?? (second ? undefined : shellOf(env));
      if (!shell) throw new UsageError(second ? shellMessage(second) : `Which shell? Your $SHELL (${env.SHELL || 'not set'}) is not bash, zsh or fish: hydor completion install bash|zsh|fish`);
      process.stdout.write(`${installCompletion(shell, env).join('\n')}\n`);
      return 0;
    }
    const shell = first ? named(first) : shellOf(env);
    if (!shell) throw new UsageError(first ? shellMessage(first) : `Which shell? Your $SHELL (${env.SHELL || 'not set'}) is not bash, zsh or fish: hydor completion bash|zsh|fish`);
    process.stdout.write(completionScript(shell));
    return 0;
  } catch (e) {
    if (!(e instanceof UsageError)) throw e;
    process.stderr.write(`${e.message}\n`);
    return 2;
  }
}

/** What to say about a shell that is none of the three (or a word that is none of the second words). */
function shellMessage(word: string): string {
  const mean = didYouMean(word, [...SHELLS, 'install'], (w) => `hydor completion ${w}`);
  return `Unknown shell: ${word}.${mean} Tab completion works in bash, zsh and fish: hydor completion bash|zsh|fish, or hydor completion install`;
}

// ---- the candidates --------------------------------------------------------------------------------------------

export type { Candidate };

/** Reads the server's API (a GET), or fails: how the candidates that come from the running Hydor are fetched. */
export type Api = (path: string) => Promise<any>;

/** The line `__complete` prints for a candidate, in one line. */
const lineOf = ([v, d]: Candidate) => (d ? `${v}\t${d.replace(/[\t\r\n]+/g, ' ').trim()}` : v);

const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
const MODES: Candidate[] = [
  ['ask', 'Asks before it changes anything'],
  ['edits', 'Edits files without asking, asks for the rest'],
  ['plan', 'Plans only, changes nothing'],
  ['full', 'Does everything without asking'],
];
const PROGRAMS: Candidate[] = [
  ['claude', 'Claude Code'],
  ['codex', 'Codex'],
  ['custom', 'The custom agent'],
];

/** What `hydor __complete` found on the line before the word under the cursor. */
interface Line {
  /** The command (its first word), when it is one. */
  cmd?: string;
  /** The words that are not options or their values, after the command. */
  rest: string[];
  /** The options named, by long name, with their values when they have them. */
  opts: Map<string, string | undefined>;
  /** The option whose value the word under the cursor is. */
  wants?: string;
  /** Whether the first word is not a command (a message for the chat). */
  message: boolean;
  /** The area's verb the words name, when the first word is an area. */
  route: Route | null;
  /** An option by its long or short name, as this line's command (or area verb) takes it. */
  find(key: string): { name: string; value: boolean } | undefined;
}

/** Reads the words before the cursor. */
function scan(before: string[]): Line {
  const words = before.filter((w, i) => !(w === '=' && i > 0 && before[i - 1].startsWith('--')));
  const route = routeOf(words);
  const find = (key: string) => {
    if (route) {
      const o = verbOptions(route.area, route.verb).find((x) => x.name === key || (x.short && x.short === key));
      return o && { name: o.name, value: o.spec ? o.spec.type !== 'boolean' : !!o.def?.value };
    }
    const d = optionDef(key);
    return d && { name: d.name, value: !!d.value };
  };
  const line: Line = { rest: [], opts: new Map(), message: false, route, find };
  const pos: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w === '--') {
      pos.push(...words.slice(i + 1));
      break;
    }
    if (w.startsWith('-') && w.length > 1) {
      const eq = w.startsWith('--') ? w.indexOf('=') : -1;
      const def = find(eq > 0 ? w.slice(2, eq) : w.startsWith('--') ? w.slice(2) : w.slice(1));
      if (!def) continue;
      if (eq > 0) line.opts.set(def.name, w.slice(eq + 1));
      else if (def.value) {
        if (i + 1 < words.length) line.opts.set(def.name, words[++i]);
        else (line.opts.set(def.name, undefined), (line.wants = def.name));
      } else line.opts.set(def.name, undefined);
    } else pos.push(w);
  }
  if (pos.length && ALL_COMMAND_NAMES.includes(pos[0])) {
    line.cmd = pos[0];
    line.rest = pos.slice(1);
  } else line.message = pos.length > 0;
  return line;
}

/** Candidates that start with the word under the cursor. */
const startingWith = (list: Candidate[], cur: string) => list.filter(([v]) => v.startsWith(cur));

/** The first words of an area's verbs (`files` for `files add`), each with what it does. */
function verbWords(area: NonNullable<ReturnType<typeof areaByName>>): Candidate[] {
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const v of area.verbs) {
    const w = v.name.split(' ')[0];
    if (seen.has(w)) continue;
    seen.add(w);
    out.push([w, (area.verbs.find((x) => x.name === w) ?? v).summary]);
  }
  return out;
}

/** What follows an area's name: its verbs, then the arguments of the verb (by kind) and the second words of its family. */
async function areaWords(line: Line, cur: string, get: <T>(p: string) => Promise<T | null>): Promise<Loaded> {
  const { area, verb } = line.route!;
  const rest = line.rest;
  if (!area.bare && !verb) return rest.length ? [] : startingWith(verbWords(area), cur);
  const v = verb ?? defaultVerb(area);
  const args = area.bare ? rest : rest.slice(line.route!.words - 1);
  const extra: Candidate[] = [];
  if (!args.length && verb && !verb.name.includes(' ')) for (const x of area.verbs) if (x.name.startsWith(`${verb.name} `)) extra.push([x.name.slice(verb.name.length + 1), x.summary]);
  const last = v.args[v.args.length - 1];
  const a = v.args[args.length] ?? (last?.rest ? last : undefined);
  const found: Loaded = a ? await LOADERS[a.kind]({ get, cur, opts: line.opts, args }) : [];
  if (typeof found === 'string') return found;
  return startingWith([...extra, ...found], cur);
}

/** The candidates for the word under the cursor, from what the line says (the server asked through `api`). */
export async function candidates(words: string[], api: Api): Promise<Loaded> {
  const cur = words.length ? words[words.length - 1] : '';
  const before = words.slice(0, -1);
  const line = scan(before);
  const get = async <T>(p: string): Promise<T | null> => {
    try {
      return (await api(p)) as T;
    } catch {
      return null;
    }
  };

  // The word is an option's value (--model <here>, or --model=<here>).
  let name = line.wants;
  let value = cur;
  let prefix = '';
  const eq = /^--([a-z-]+)=(.*)$/s.exec(cur);
  if (eq && line.find(eq[1])?.value) ((name = line.find(eq[1])!.name), (value = eq[2]), (prefix = `--${eq[1]}=`));
  if (name) {
    const list = await valuesOf(name, line, { get, cur: value });
    if (typeof list === 'string') return list;
    return startingWith(list, value).map(([v, d]) => [prefix + v, d]);
  }

  // An option.
  if (cur.startsWith('-')) {
    const list: Candidate[] = line.route
      ? verbOptions(line.route.area, line.route.verb)
          .filter((o) => !line.opts.has(o.name) || o.spec?.type === 'strings')
          .map((o) => [`--${o.name}`, o.spec?.desc ?? o.def?.desc ?? ''])
      : OPTION_TABLE.filter((o) => !line.opts.has(o.name) && o.name !== 'print' && o.name !== 'version').map((o) => [`--${o.name}`, o.desc]);
    return startingWith(list, cur);
  }

  // The command.
  if (!line.cmd) {
    if (line.message) return [];
    return startingWith(
      ALL_COMMAND_NAMES.map((n) => [n, describeCommand(n)] as Candidate),
      cur,
    );
  }

  // The words of an area's verb.
  if (line.route) return areaWords(line, cur, get);

  // What follows a command; one named like an area gets that area's verbs too.
  const found = await afterCommand(line, cur, get);
  const area = areaByName(line.cmd);
  if (area && !area.bare && line.rest.length === 0 && typeof found !== 'string') {
    const have = new Set(found.map(([v]) => v));
    return [...found, ...startingWith(verbWords(area), cur).filter(([v]) => !have.has(v))];
  }
  return found;
}

/** What follows one of the commands that existed before the areas (and `help`). */
async function afterCommand(line: Line, cur: string, get: <T>(p: string) => Promise<T | null>): Promise<Loaded> {
  const n = line.rest.length;
  const subs = (c: string) => (commandDef(c)?.subs ?? []).map(([s, d]) => [s, d] as Candidate);
  switch (line.cmd) {
    case 'show':
    case 'send':
    case 'stop':
    case 'open':
    case 'resume':
      return n === 0 ? startingWith((await LOADERS.session({ get, cur, opts: line.opts, args: [] })) as Candidate[], cur) : [];
    case 'models':
      return n === 0 ? startingWith(PROGRAMS, cur) : [];
    case 'tiers':
      if (n === 0) return startingWith([['show', 'Show the tiers'], ...subs('tiers')], cur);
      if (line.rest[0] === 'set')
        return n === 1
          ? startingWith(PROGRAMS, cur)
          : n === 2
            ? startingWith(
                ['quick', 'standard', 'best', 'max'].map((t) => [t] as Candidate),
                cur,
              )
            : [];
      if ((line.rest[0] === 'team' || line.rest[0] === 'hard') && n === 1) return startingWith([['on'], ['off']], cur);
      return [];
    case 'app': {
      if (n === 0) return startingWith(subs('app'), cur);
      if (n !== 1 || !['folder', 'dev', 'try', 'export'].includes(line.rest[0])) return [];
      return startingWith((await LOADERS.app({ get, cur, opts: line.opts, args: [] })) as Candidate[], cur);
    }
    case 'service':
    case 'completion':
      return n === 0 ? startingWith(subs(line.cmd), cur) : [];
    case 'help': {
      if (n === 0)
        return startingWith(
          ALL_COMMAND_NAMES.map((c) => [c, describeCommand(c)] as Candidate),
          cur,
        );
      const area = areaByName(line.rest[0]);
      return n === 1 && area ? startingWith(verbWords(area), cur) : [];
    }
    default:
      return [];
  }
}

/** The values an option takes (what is not here, a free word: none). */
async function valuesOf(name: string, line: Line, c: { get: <T>(p: string) => Promise<T | null>; cur: string }): Promise<Loaded> {
  const { get } = c;
  // An option of an area's verb: its fixed values, or what its kind lists.
  const spec = line.route ? (line.route.verb ?? defaultVerb(line.route.area)).options?.[name] : undefined;
  if (spec) {
    if (spec.values) return spec.values.map((v) => [v] as Candidate);
    return spec.kind ? LOADERS[spec.kind]({ get, cur: c.cur, opts: line.opts, args: [] }) : [];
  }
  if (line.route) return [];
  switch (name) {
    case 'agent': {
      const boot = await get<{ acpAgents?: { id: string; name?: string }[] }>('/api/bootstrap');
      return [...PROGRAMS, ...(boot?.acpAgents ?? []).filter((a) => a.id !== 'console').map((a) => [a.id, a.name] as Candidate)];
    }
    case 'model': {
      const prog = programOf(line.opts.get('agent')) ?? { agent: 'claude' as const };
      // As start.ts's catalogOf asks for it.
      const cat = await get<{ models?: { value: string; label: string }[] }>(`/api/catalog/${prog.agent}${prog.agent === 'acp' ? `?acp=${encodeURIComponent(prog.acpAgent ?? 'console')}` : ''}`);
      return [['auto', 'Automatic: the team’s tiers choose'], ...(cat?.models ?? []).map((m) => [m.value, m.label] as Candidate)];
    }
    case 'effort':
      return EFFORTS.map((e) => [e] as Candidate);
    case 'mode':
      return MODES;
    case 'as':
      return LOADERS.agent({ get, cur: c.cur, opts: line.opts, args: [] });
    case 'cwd':
      return ':dirs';
    default:
      return [];
  }
}

/** The lines `hydor __complete` prints for the words (the last is the one under the cursor). */
export async function completeWords(words: string[], api: Api): Promise<string[]> {
  const found = await candidates(words, api);
  return typeof found === 'string' ? [found] : found.map(lineOf);
}

/** The API of the Hydor running here (or the one named on the line): one connection, never starting the server. */
function liveApi(words: string[]): Api {
  const line = scan(words.slice(0, -1));
  let conn: Promise<import('./client.ts').Conn> | undefined;
  return async (p) => {
    const { connect } = await import('./client.ts');
    conn ??= connect({ server: line.opts.get('server'), token: line.opts.get('token'), start: false });
    return (await conn).api('GET', p, undefined, { timeoutMs: 700 });
  };
}

/** `hydor __complete -- <words…>`: prints the candidates and exits. Quick, quiet, and always exit code 0. */
export async function completeCommand(argv: string[]): Promise<never> {
  const at = argv.indexOf('--');
  const words = at >= 0 ? argv.slice(at + 1) : argv;
  let lines: string[] = [];
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    process.stdout.write(lines.length ? `${lines.join('\n')}\n` : '', () => process.exit(0));
  };
  // Whatever is slow does not hold the prompt: what there is by then is printed.
  const timer = setTimeout(finish, 800);
  try {
    const api = liveApi(words);
    const quick: Api = (p) => Promise.race([api(p), new Promise<never>((_, no) => setTimeout(() => no(new Error('slow')), 700).unref())]);
    lines = await completeWords(words, quick);
  } catch {}
  clearTimeout(timer);
  finish();
  return new Promise<never>(() => {});
}
