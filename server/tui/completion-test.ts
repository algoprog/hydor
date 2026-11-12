// Checks for `hydor`'s help, "did you mean" and Tab completion: the candidates for each kind of word (from a fake
// server's answers), the three shells' scripts, the bash one run for real against a stand-in command, the help fitting
// 80 columns, and `completion install` writing its files under a scratch HOME (and adding no second line). Build and
// run with a scratch folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/tui/completion-test.ts && DATA_DIR=/tmp/hydor-test-completion node dist/dev/completion-test.js
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ALL_COMMAND_NAMES, CMD_TABLE, COMMANDS, editDistance, helpText, MAINTENANCE, OPTION_TABLE, parseArgv, subCommandError, suggest, USAGE, UsageError } from './args.ts';
import { completeWords, completionScript, installCompletion, shellOf, type Api } from './completion.ts';
import { makePaint, stripAnsi } from './term.ts';

const DATA = process.env.DATA_DIR ?? '';
if (!DATA.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
fs.rmSync(DATA, { recursive: true, force: true });
fs.mkdirSync(DATA, { recursive: true });
process.env.CUDA_VISIBLE_DEVICES = '';

let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

/** What the fake server answers. */
const answers: Record<string, unknown> = {
  '/api/sessions?limit=40': {
    sessions: [
      { id: 'aaaa1111-0000', key: 'claude:aaaa1111-0000', title: 'Fix the tests', live: { status: 'working' } },
      { id: 'bbbb2222-0000', key: 'claude:bbbb2222-0000', title: 'A helper', extra: { parent: 'claude:aaaa1111-0000' } },
      { id: 'cccc3333-0000', key: 'codex:cccc3333-0000', title: 'Plan\tthe\nmove', live: { status: 'waiting' } },
    ],
  },
  '/api/bootstrap': {
    acpAgents: [
      { id: 'gemini', name: 'Gemini' },
      { id: 'console', name: 'Custom' },
    ],
  },
  '/api/catalog/claude': {
    models: [
      { value: 'opus', label: 'Opus 5.5' },
      { value: 'sonnet', label: 'Sonnet 5.5' },
    ],
  },
  '/api/catalog/codex': { models: [{ value: 'gpt-x', label: 'GPT X' }] },
  '/api/catalog/acp?acp=gemini': { models: [{ value: 'g-1', label: 'Gemini One' }] },
  '/api/assistants': {
    assistants: [
      { id: 'researcher', name: 'Researcher' },
      { id: 'coder', name: 'Coder' },
    ],
  },
  '/api/tasks': { tasks: [{ id: 't1', name: 'Daily brief' }] },
  '/api/apps': { apps: [{ slug: 'reading-list', name: 'Reading list' }] },
};
const asked: string[] = [];
const api: Api = async (p) => {
  asked.push(p);
  if (!(p in answers)) throw new Error('404');
  return answers[p];
};
/** The candidates for the words (the last is the one under the cursor), as `value` or `value<TAB>desc` lines. */
const complete = (...words: string[]) => completeWords(words, api);
const values = async (...words: string[]) => (await complete(...words)).map((l) => l.split('\t')[0]);

// ---- candidates ------------------------------------------------------------------------------------------------

test('complete: the first word is a command, with its description', async () => {
  const all = await complete('');
  assert.deepEqual(
    all.map((l) => l.split('\t')[0]),
    ALL_COMMAND_NAMES,
  );
  assert.ok(all.includes('sessions\tThe latest sessions and what each is doing'));
  assert.ok(
    all.every((l) => l.split('\t').length === 2 && !l.startsWith('__')),
    'a value and a description, none hidden',
  );
  assert.deepEqual(await values('se'), ['sessions', 'send', 'serve', 'set-password', 'setup-token', 'service', 'settings']);
  assert.deepEqual(await complete('zzz'), []);
  assert.equal(asked.length, 0, 'commands need no server');
});

test('complete: options start with a dash, those already given left out', async () => {
  const v = await values('-');
  assert.ok(v.includes('--model') && v.includes('--json') && v.includes('--help'));
  assert.ok(!v.includes('--print') && !v.includes('--version'));
  assert.deepEqual(await values('--mo'), ['--model', '--mode']);
  assert.deepEqual(await values('--model', 'opus', '--mo'), ['--mode']);
  assert.deepEqual(await values('sessions', '--l'), ['--limit']);
  assert.ok((await complete('--json', '--j')).length === 0, 'an option is offered once');
  assert.ok((await complete('--model', '')).every((l) => !l.startsWith('--')));
});

test('complete: static values of options', async () => {
  assert.deepEqual(await values('--effort', ''), ['low', 'medium', 'high', 'xhigh', 'max']);
  assert.deepEqual(await values('--effort', 'm'), ['medium', 'max']);
  assert.deepEqual(await values('run', 'hi', '--mode', ''), ['ask', 'edits', 'plan', 'full']);
  assert.deepEqual(await complete('--cwd', ''), [':dirs']);
  assert.deepEqual(await complete('--title', ''), []);
  assert.deepEqual(await complete('--cap', ''), []);
  assert.deepEqual(await values('--effort=h'), ['--effort=high']);
  assert.deepEqual(await values('--effort', '=', 'x'), ['xhigh'], 'a typed = is left out');
});

test('complete: --agent, --model and --as come from the server', async () => {
  assert.deepEqual(await values('--agent', ''), ['claude', 'codex', 'custom', 'gemini']);
  assert.deepEqual(await values('--model', ''), ['auto', 'opus', 'sonnet']);
  assert.deepEqual(await values('--agent', 'codex', '--model', ''), ['auto', 'gpt-x']);
  assert.deepEqual(await values('-m', ''), ['auto', 'opus', 'sonnet']);
  assert.deepEqual(await values('--model', 'o', '--agent', 'gemini', '--model', 'g'), ['g-1'], 'the last --agent counts');
  assert.deepEqual(await values('--agent', 'gemini', '--model', ''), ['auto', 'g-1']);
  assert.ok(asked.includes('/api/catalog/acp?acp=gemini'));
  assert.deepEqual(await complete('--as', ''), ['researcher\tResearcher', 'coder\tCoder']);
  assert.deepEqual(await values('--as', 'r'), ['researcher']);
  const down: Api = async () => {
    throw new Error('down');
  };
  assert.deepEqual(await completeWords(['--model', ''], down), ['auto\tAutomatic: the team’s tiers choose'], 'a server that does not answer leaves the fixed ones');
  assert.deepEqual(await completeWords(['show', ''], down), []);
});

test('complete: after a command', async () => {
  const keys = await complete('show', '');
  assert.deepEqual(keys, ['aaaa1111\tFix the tests · Working', 'cccc3333\tPlan the move · Needs you'], 'helpers left out, a title on one line');
  for (const c of ['send', 'stop', 'resume']) assert.equal((await values(c, '')).length, 2, c);
  assert.deepEqual(await values('send', 'aaaa1111', ''), [], 'only the first word is a key');
  assert.deepEqual(await values('show', 'cc'), ['cccc3333']);
  assert.deepEqual(await values('models', ''), ['claude', 'codex', 'custom']);
  assert.deepEqual(await values('tiers', ''), ['show', 'set', 'reset', 'team', 'hard']);
  assert.deepEqual(await values('tiers', 'set', ''), ['claude', 'codex', 'custom']);
  assert.deepEqual(await values('tiers', 'set', 'claude', ''), ['quick', 'standard', 'best', 'max']);
  assert.deepEqual(await values('tiers', 'team', ''), ['on', 'off']);
  assert.deepEqual(await values('service', ''), ['install', 'uninstall', 'status', 'logs']);
  assert.deepEqual(await values('service', 'st'), ['status']);
  assert.deepEqual(await values('app', ''), ['list', 'new', 'folder', 'dev', 'try', 'export', 'import']);
  assert.deepEqual(await values('app', 'try', ''), ['reading-list']);
  assert.deepEqual(await values('completion', ''), ['bash', 'zsh', 'fish', 'install']);
  assert.deepEqual(await values('help', 'st'), ['stop', 'status']);
  assert.deepEqual(await values('help', ''), [...ALL_COMMAND_NAMES, 'options']);
  assert.deepEqual(await values('fix', 'the', ''), [], 'a message has none');
  assert.ok((await values('sessions', '')).includes('search') && (await values('sessions', '')).includes('queue'), 'the verbs of the sessions area');
});

// ---- the scripts -----------------------------------------------------------------------------------------------

test('scripts: each names its function, asks the typed program, and handles folders', () => {
  const bash = completionScript('bash');
  assert.match(bash, /^_hydor\(\) \{$/m);
  assert.match(bash, /complete -F _hydor hydor/);
  assert.match(bash, /prog=\$\{COMP_WORDS\[0\]\}/);
  assert.match(bash, /"\$prog" __complete -- /);
  assert.match(bash, /compgen -d/);
  const zsh = completionScript('zsh');
  assert.match(zsh, /^#compdef hydor$/m);
  assert.ok(zsh.includes('(( $+functions[compdef] )) || { autoload -Uz compinit && compinit -i; }'));
  assert.ok(zsh.indexOf('compinit -i') < zsh.indexOf('compdef _hydor hydor'), 'compinit comes before compdef');
  assert.match(zsh, /"\$words\[1\]" __complete -- /);
  assert.match(zsh, /_describe/);
  assert.match(zsh, /_files -\//);
  assert.match(zsh, /\$\{value\/\/:\/\\\\:\}/, 'colons in values are escaped');
  const fish = completionScript('fish');
  assert.match(fish, /function __hydor_complete/);
  assert.match(fish, /commandline -opc/);
  assert.match(fish, /__fish_complete_directories/);
  assert.match(fish, /complete -c hydor -f -a '\(__hydor_complete\)'/);
  for (const s of [bash, zsh, fish]) assert.ok(s.endsWith('\n') && !s.includes('\r'));
});

test('scripts: the bash one, run in bash against a stand-in command', () => {
  try {
    execFileSync('bash', ['--version'], { stdio: 'ignore' });
  } catch {
    return;
  }
  const dir = path.join(DATA, 'bashtest');
  fs.mkdirSync(path.join(dir, 'bin'), { recursive: true });
  // The stand-in prints what the real one would for three lines, recording the words it was asked with.
  const shim = path.join(dir, 'bin/hydor');
  fs.writeFileSync(
    shim,
    `#!/bin/sh
printf '%s|' "$@" >> ${dir}/asked
printf '\\n' >> ${dir}/asked
case "$*" in
  *"--cwd "*) printf ':dirs\\n' ;;
  *"-- show "*) printf 'aaaa1111\\tFix the tests\\ncccc3333\\tPlan: the move\\n' ;;
  *"-- nothing "*) ;;
  *) printf 'sessions\\tList\\nsend\\tSend\\n' ;;
esac
`,
    { mode: 0o755 },
  );
  fs.mkdirSync(path.join(dir, 'sub dir'), { recursive: true });
  const script = `
source ${path.join(dir, 'bash.sh')}
t() { COMP_WORDS=("$@"); COMP_CWORD=$(( $# - 1 )); COMPREPLY=(); _hydor; printf '%s\\n' "[$*] -> \${COMPREPLY[*]}"; }
t hydor se
t ${shim} ''
t hydor show ''
t hydor nothing ''
t hydor --cwd ${dir}/su
t hydor --agent =
`;
  fs.writeFileSync(path.join(dir, 'bash.sh'), completionScript('bash'));
  const out = execFileSync('bash', ['--norc', '-c', script], { encoding: 'utf8', env: { ...process.env, PATH: `${path.join(dir, 'bin')}:${process.env.PATH}` } }).split('\n');
  assert.equal(out[0], '[hydor se] -> sessions send', 'only the values, not the descriptions');
  assert.equal(out[1], `[${shim} ] -> sessions send`);
  assert.equal(out[2], '[hydor show ] -> aaaa1111 cccc3333');
  assert.equal(out[3], '[hydor nothing ] -> ');
  assert.equal(out[4], `[hydor --cwd ${dir}/su] -> ${dir}/sub dir`, 'folders (with a space in one)');
  const asked = fs.readFileSync(path.join(dir, 'asked'), 'utf8').split('\n');
  assert.equal(asked[0], '__complete|--|se|', 'the words after hydor, the last being under the cursor');
  assert.equal(asked[1], '__complete|--||', 'an empty word under the cursor is passed as an empty word');
  assert.equal(asked[5], '__complete|--|--agent||', 'a typed = is left out, the word is empty');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('scripts: the shell of $SHELL', () => {
  assert.equal(shellOf({ SHELL: '/usr/bin/zsh' }), 'zsh');
  assert.equal(shellOf({ SHELL: '/opt/homebrew/bin/fish' }), 'fish');
  assert.equal(shellOf({ SHELL: '/bin/bash' }), 'bash');
  assert.equal(shellOf({ SHELL: '/bin/tcsh' }), undefined);
  assert.equal(shellOf({}), undefined);
});

// ---- did you mean ----------------------------------------------------------------------------------------------

test('did you mean: commands, options, second words', () => {
  assert.deepEqual(suggest('sesions', ALL_COMMAND_NAMES), ['sessions']);
  assert.deepEqual(suggest('sessoins', ALL_COMMAND_NAMES), ['sessions'], 'two letters swapped');
  assert.deepEqual(suggest('stat', ALL_COMMAND_NAMES), ['status'], 'the start of one command');
  assert.deepEqual(suggest('tier', ALL_COMMAND_NAMES), ['tiers']);
  assert.deepEqual(suggest('compleshun', ALL_COMMAND_NAMES), [], 'too far');
  assert.deepEqual(suggest('refactor', ALL_COMMAND_NAMES), []);
  assert.deepEqual(suggest('banana', ALL_COMMAND_NAMES), []);
  assert.deepEqual(
    suggest(
      'modle',
      OPTION_TABLE.map((o) => o.name),
    ),
    ['model'],
    'the nearest in length of the equally near',
  );
  assert.deepEqual(suggest('stirct', ['strict', 'string']).length >= 1, true);
  assert.equal(editDistance('abc', 'acb'), 1);
  assert.equal(editDistance('kitten', 'sitting'), 3);
  assert.throws(
    () => parseArgv(['--modle', 'x']),
    (e: Error) => e instanceof UsageError && e.message === "Unknown option '--modle'. Did you mean --model?",
  );
  assert.throws(
    () => parseArgv(['--frobnicate']),
    (e: Error) => e instanceof UsageError && e.message === "Unknown option '--frobnicate'",
    'no close match: the plain message',
  );
  assert.equal(subCommandError('service', 'instal').split('\n')[0], 'Unknown service command: instal. Did you mean hydor service install?');
  assert.equal(subCommandError('service', 'frobnicate').split('\n')[0], 'Unknown service command: frobnicate.');
  assert.equal(subCommandError('service', undefined), 'usage: hydor service install | uninstall | status | logs');
  assert.match(subCommandError('completion', 'fsh'), /Did you mean hydor completion fish\?/);
});

// ---- the tables and the help -----------------------------------------------------------------------------------

test('tables: every command and option is in them', () => {
  const names = CMD_TABLE.map((c) => c.name);
  for (const c of COMMANDS) assert.ok(names.includes(c), `${c} is in the table`);
  for (const m of ['set-password', 'setup-token', 'access-token', 'service', 'update', 'app', 'completion']) assert.ok(MAINTENANCE.includes(m), m);
  assert.equal(new Set(names).size, names.length);
  for (const c of CMD_TABLE) {
    assert.ok(c.desc && c.help && c.examples.length >= 1 && c.examples.length <= 4, `${c.name} is described`);
    for (const o of c.options ?? [])
      assert.ok(
        OPTION_TABLE.some((x) => x.name === o),
        `${c.name}: --${o}`,
      );
  }
  assert.equal(new Set(OPTION_TABLE.map((o) => o.short).filter(Boolean)).size, OPTION_TABLE.filter((o) => o.short).length);
  assert.equal(parseArgv(['-m', 'opus', '-n', '3', '-y']).model, 'opus');
  assert.equal(parseArgv(['sessions', '--limit=7']).limit, 7);
});

const widest = (s: string) => Math.max(...s.split('\n').map((l) => [...stripAnsi(l)].length));

test('help: grouped, within 80 columns, plain when not on a terminal', () => {
  const plain = helpText(makePaint(false))!;
  assert.ok(!plain.includes('\x1b['));
  assert.equal(plain, USAGE);
  assert.ok(widest(plain) <= 80, `${widest(plain)} columns`);
  const order = ['Talk to an agent', 'Sessions', 'Your work', 'Agents and models', 'What agents know and use', 'This Hydor', 'Maintenance', 'Examples'].map((h) => plain.indexOf(`\n${h}\n`));
  assert.ok(
    order.every((n, i) => n > 0 && (i === 0 || n > order[i - 1])),
    'the groups come in order',
  );
  assert.match(plain, /hydor help <command>/);
  assert.match(plain, /hydor completion install/);
  assert.ok(plain.trimEnd().endsWith('Tab completion for bash, zsh and fish'));
  for (const c of CMD_TABLE) assert.ok(plain.includes(`hydor ${c.bare ? '' : c.name}`), c.name);
  const coloured = helpText(makePaint(true))!;
  assert.ok(coloured.includes('\x1b['));
  assert.equal(stripAnsi(coloured), plain, 'colours change nothing else');
  assert.ok(widest(coloured) <= 80);
});

test('help: one command', () => {
  const text = helpText(makePaint(false), 'sessions')!;
  assert.match(text, /^Usage: hydor sessions \[options\]\n/);
  assert.match(text, /--all/);
  assert.match(text, /\nExamples\n {2}hydor sessions\n/);
  assert.equal(helpText(makePaint(false), 'nothing-like-it'), null);
  for (const c of CMD_TABLE) {
    const h = helpText(makePaint(true), c.name)!;
    assert.ok(widest(h) <= 80, `${c.name}: ${widest(h)} columns`);
    assert.ok(stripAnsi(h).includes(`Usage: hydor ${c.bare ? '' : c.name}`.trimEnd()), c.name);
    assert.ok(stripAnsi(h).includes(c.examples[0]), `${c.name} has its examples`);
  }
  assert.match(helpText(makePaint(false), 'service')!, /\n {2}install +Run Hydor as a service/);
  assert.match(helpText(makePaint(false), 'tiers')!, /Usage: hydor tiers \[set\|reset\|team\|hard\] \[options\]/);
});

// ---- installing ------------------------------------------------------------------------------------------------

test('install: fish, bash and zsh write their files, once', () => {
  const home = path.join(DATA, 'home');
  fs.rmSync(home, { recursive: true, force: true });
  fs.mkdirSync(home, { recursive: true });
  const env = { HOME: home } as NodeJS.ProcessEnv;
  const none = () => false;

  // fish: its completions folder; no rc.
  let said = installCompletion('fish', env, none);
  assert.equal(fs.readFileSync(path.join(home, '.config/fish/completions/hydor.fish'), 'utf8'), completionScript('fish'));
  assert.ok(said.some((l) => /open a new terminal/i.test(l)));
  assert.ok(!fs.existsSync(path.join(home, '.bashrc')) && !fs.existsSync(path.join(home, '.zshrc')));

  // bash without bash-completion: the file, and one line in .bashrc, never two.
  const bashFile = path.join(home, '.local/share/bash-completion/completions/hydor');
  fs.writeFileSync(path.join(home, '.bashrc'), 'export A=1');
  installCompletion('bash', env, none);
  installCompletion('bash', env, none);
  assert.equal(fs.readFileSync(bashFile, 'utf8'), completionScript('bash'));
  const rc = fs.readFileSync(path.join(home, '.bashrc'), 'utf8');
  assert.equal(rc, `export A=1\n[ -f "${bashFile}" ] && . "${bashFile}"  # hydor completion\n`);

  // bash with bash-completion: the file only.
  fs.rmSync(path.join(home, '.bashrc'));
  fs.rmSync(bashFile);
  said = installCompletion('bash', env, (f) => f === '/usr/share/bash-completion/bash_completion');
  assert.ok(fs.existsSync(bashFile) && !fs.existsSync(path.join(home, '.bashrc')));
  assert.ok(said.some((l) => /bash-completion/.test(l)));

  // zsh: its own file, and one line in .zshrc (ZDOTDIR when set).
  const zshFile = path.join(home, '.local/share/hydor/completion.zsh');
  installCompletion('zsh', env, none);
  installCompletion('zsh', env, none);
  assert.equal(fs.readFileSync(zshFile, 'utf8'), completionScript('zsh'));
  assert.equal(fs.readFileSync(path.join(home, '.zshrc'), 'utf8'), `[ -f "${zshFile}" ] && source "${zshFile}"  # hydor completion\n`);
  const zd = path.join(home, 'zd');
  const data = path.join(home, 'xdg');
  installCompletion('zsh', { HOME: home, ZDOTDIR: zd, XDG_DATA_HOME: data }, none);
  assert.ok(fs.existsSync(path.join(data, 'hydor/completion.zsh')));
  assert.match(fs.readFileSync(path.join(zd, '.zshrc'), 'utf8'), /source ".*xdg\/hydor\/completion\.zsh"  # hydor completion\n$/);

  // A changed script is written again.
  fs.writeFileSync(zshFile, 'old');
  installCompletion('zsh', env, none);
  assert.equal(fs.readFileSync(zshFile, 'utf8'), completionScript('zsh'));
  fs.rmSync(home, { recursive: true, force: true });
});

// ---- run -------------------------------------------------------------------------------------------------------

for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}\n${(e as Error).stack}`);
    process.exitCode = 1;
  }
}
console.log(`${passed}/${tests.length} passed`);
process.exit(process.exitCode ?? 0);
