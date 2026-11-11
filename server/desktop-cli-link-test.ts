// Script tests for the `hydor` command of the Mac app: desktop/cli-link.cjs (which puts it on the PATH of Terminal, with
// nothing asked) and the launcher scripts/stage.sh writes into the app (bin/hydor). Both are tried here on scratch
// folders: a fake app under a path with spaces, a scratch HOME, and PATH folders of the test's own. Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/desktop-cli-link-test.ts && node dist/dev/desktop-cli-link-test.js
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

const { linkCommand, MARKER, SH_LINE, FISH_LINE } = createRequire(import.meta.url)('../../desktop/cli-link.cjs') as {
  linkCommand: (o: { launcher?: string; loginPath?: string | null; home?: string; shell?: string; env?: Record<string, string>; candidates?: string[] }) => string;
  MARKER: string;
  SH_LINE: string;
  FISH_LINE: string;
};

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-cli-link-'));
const stage = fs.readFileSync(path.resolve(import.meta.dirname, '../../desktop/scripts/stage.sh'), 'utf8');
let n = 0;
const ok = (what: string) => console.log(`ok ${++n} ${what}`);
const root0 = process.getuid?.() === 0;
/** linkCommand with the scratch HOME's ~/.local/bin and ~/bin as the folders to link in, unless a test names others (the real /usr/local/bin is never touched). */
const lc = (o: Parameters<typeof linkCommand>[0]) => linkCommand({ candidates: [path.join(o.home!, '.local/bin'), path.join(o.home!, 'bin')], ...o });

/** A fake app (under a path with spaces) with the launcher stage.sh writes. */
function fakeApp(where: string) {
  const res = path.join(root, where, 'My Apps/Hydor.app/Contents/Resources');
  fs.mkdirSync(path.join(res, 'bin'), { recursive: true });
  fs.mkdirSync(path.join(res, 'node/bin'), { recursive: true });
  fs.mkdirSync(path.join(res, 'server/dist/server'), { recursive: true });
  const fn = /^write_launcher\(\) \{\n[\s\S]*?\n\}\n/m.exec(stage)?.[0];
  assert.ok(fn, 'stage.sh has write_launcher()');
  execFileSync('bash', ['-c', `${fn}\nwrite_launcher "$1"`, 'x', path.join(res, 'bin/hydor')]);
  fs.symlinkSync(process.execPath, path.join(res, 'node/bin/node'));
  fs.writeFileSync(path.join(res, 'server/dist/server/cli.js'), 'console.log(JSON.stringify([process.argv.slice(2), process.env.HYDOR_APP_BUNDLE ?? null]))\n');
  return { res, launcher: path.join(res, 'bin/hydor') };
}

// ---- the launcher ----------------------------------------------------------------------------------------------------
{
  const app = fakeApp('launcher');
  const clean = { ...process.env } as Record<string, string | undefined>;
  delete clean.HYDOR_APP_BUNDLE;
  const run = (cmd: string, ...args: string[]) => JSON.parse(execFileSync(cmd, args, { env: clean as NodeJS.ProcessEnv }).toString());
  const bundle = path.join(root, 'launcher/My Apps/Hydor.app');
  const l = path.join(root, 'launcher/links');
  fs.mkdirSync(path.join(l, 'a'), { recursive: true });
  fs.mkdirSync(path.join(l, 'b'), { recursive: true });
  fs.mkdirSync(path.join(l, 'c'), { recursive: true });
  fs.symlinkSync(app.launcher, path.join(l, 'a/hydor')); // absolute
  fs.symlinkSync('../../My Apps/Hydor.app/Contents/Resources/bin/hydor', path.join(l, 'b/hydor')); // relative
  fs.symlinkSync(path.join(l, 'a/hydor'), path.join(l, 'c/hydor')); // a chain of two
  assert.equal(fs.statSync(app.launcher).mode & 0o111, 0o111, 'executable');
  assert.deepEqual(run(app.launcher, 'a', 'b c'), [['a', 'b c'], bundle]);
  for (const d of ['a', 'b', 'c']) assert.deepEqual(run(path.join(l, d, 'hydor'), 'help', 'x y'), [['help', 'x y'], bundle], d);
  ok('the launcher runs the app’s Node.js on its cli.js, through links of every kind, with HYDOR_APP_BUNDLE and spaces in the path');
  // Not inside a .app: no bundle.
  const bare = path.join(root, 'launcher/bare');
  fs.cpSync(path.join(root, 'launcher/My Apps/Hydor.app/Contents/Resources'), bare, { recursive: true, verbatimSymlinks: true });
  assert.deepEqual(run(path.join(bare, 'bin/hydor'), 'x'), [['x'], null]);
  ok('outside an .app the launcher sets no HYDOR_APP_BUNDLE');
}

// ---- cli-link.cjs ----------------------------------------------------------------------------------------------------
const world = (name: string) => {
  const home = path.join(root, name, 'home');
  fs.mkdirSync(home, { recursive: true });
  const dir = (d: string) => (fs.mkdirSync(path.join(root, name, d), { recursive: true }), path.join(root, name, d));
  return { home, dir, app: fakeApp(name), name };
};
const same = (p: string, launcher: string) => fs.lstatSync(p).isSymbolicLink() && path.resolve(path.dirname(p), fs.readlinkSync(p)) === launcher;
const count = (file: string, what: string) => fs.readFileSync(file, 'utf8').split(what).length - 1;
const SYS = '/usr/bin:/bin';

{
  const w = world('writable');
  const bin = path.join(w.home, 'bin');
  fs.mkdirSync(bin);
  const o = { launcher: w.app.launcher, home: w.home, shell: '/bin/zsh', loginPath: [SYS, bin].join(':') };
  assert.equal(lc(o), 'linked ~/bin');
  assert.ok(same(path.join(bin, 'hydor'), w.app.launcher));
  assert.ok(!fs.existsSync(path.join(w.home, '.zprofile')) && !fs.existsSync(path.join(w.home, '.local')));
  assert.equal(lc(o), 'fine');
  ok('~/bin on the PATH and yours gets the link, a second run changes nothing, and no startup file is touched');
  // The order: ~/.local/bin before ~/bin; a folder that is not on the PATH is not used.
  const x = world('order');
  fs.mkdirSync(path.join(x.home, 'bin'));
  fs.mkdirSync(path.join(x.home, '.local/bin'), { recursive: true });
  assert.equal(lc({ launcher: x.app.launcher, home: x.home, shell: '/bin/zsh', loginPath: [SYS, path.join(x.home, 'bin'), path.join(x.home, '.local/bin')].join(':') }), 'linked ~/.local/bin');
  const y = world('not-on-path');
  fs.mkdirSync(path.join(y.home, 'bin'));
  assert.equal(lc({ launcher: y.app.launcher, home: y.home, shell: '/bin/zsh', loginPath: SYS }), 'linked ~/.local/bin + ~/.zprofile');
  assert.ok(!fs.existsSync(path.join(y.home, 'bin/hydor')));
  ok('the folders are tried in order (~/.local/bin, ~/bin, …), and only when they are on the PATH');
}

{
  // A tool's own folder on the PATH is not used, writable or not.
  const w = world('tools');
  const cargo = w.dir('.cargo/bin');
  const nvm = w.dir('.nvm/versions/node/v22/bin');
  const o = { launcher: w.app.launcher, home: w.home, shell: '/bin/zsh', loginPath: [cargo, nvm, SYS].join(':') };
  assert.equal(lc(o), 'linked ~/.local/bin + ~/.zprofile');
  assert.ok(!fs.existsSync(path.join(cargo, 'hydor')) && !fs.existsSync(path.join(nvm, 'hydor')));
  ok('a writable folder on the PATH that is not one of the general ones (~/.cargo/bin, a Node.js version’s) is not used');
  if (!root0) {
    const x = world('readonly');
    const ro = path.join(x.home, 'bin');
    fs.mkdirSync(ro);
    fs.chmodSync(ro, 0o555);
    assert.match(lc({ launcher: x.app.launcher, home: x.home, shell: '/bin/zsh', loginPath: [SYS, ro].join(':') }), /^linked ~\/\.local\/bin \+/);
    assert.ok(!fs.existsSync(path.join(ro, 'hydor')));
    fs.chmodSync(ro, 0o755);
    ok('a general folder you cannot write to is not used');
  }
}

{
  // zsh: ~/.zprofile (or ZDOTDIR's), once.
  const w = world('zsh');
  fs.writeFileSync(path.join(w.home, '.zprofile'), 'export FOO=1'); // no newline at its end
  const o = { launcher: w.app.launcher, home: w.home, shell: '/bin/zsh', loginPath: SYS };
  assert.equal(lc(o), 'linked ~/.local/bin + ~/.zprofile');
  assert.ok(same(path.join(w.home, '.local/bin/hydor'), w.app.launcher));
  const rc = fs.readFileSync(path.join(w.home, '.zprofile'), 'utf8');
  assert.equal(rc, `export FOO=1\n\n${MARKER}\n${SH_LINE}\n`);
  // The app's next start has the new PATH from the login shell: fine. And with the same old PATH again: still one line.
  assert.equal(lc(o), 'linked ~/.local/bin + ~/.zprofile');
  assert.equal(count(path.join(w.home, '.zprofile'), MARKER), 1);
  assert.equal(lc({ ...o, loginPath: `${SYS}:${path.join(w.home, '.local/bin')}` }), 'fine');
  ok('zsh: the link in ~/.local/bin and its line in .zprofile, added once however many times it runs; fine once the PATH has it');
  const z = world('zdotdir');
  const zd = z.dir('zd');
  lc({ launcher: z.app.launcher, home: z.home, shell: '/bin/zsh', loginPath: SYS, env: { ZDOTDIR: zd } });
  assert.equal(count(path.join(zd, '.zprofile'), MARKER), 1);
  assert.ok(!fs.existsSync(path.join(z.home, '.zprofile')));
  ok('zsh with ZDOTDIR: its .zprofile');
}

{
  const a = world('bash-profile');
  fs.writeFileSync(path.join(a.home, '.profile'), '# mine\n');
  const o = { launcher: a.app.launcher, home: a.home, shell: '/bin/bash', loginPath: SYS };
  assert.equal(lc(o), 'linked ~/.local/bin + ~/.profile');
  lc(o);
  assert.equal(count(path.join(a.home, '.profile'), MARKER), 1);
  assert.ok(!fs.existsSync(path.join(a.home, '.bash_profile')));
  ok('bash with only ~/.profile: that file, once, and no .bash_profile made (it would hide .profile)');
  const b = world('bash-login');
  fs.writeFileSync(path.join(b.home, '.bash_login'), '');
  fs.writeFileSync(path.join(b.home, '.profile'), '');
  lc({ launcher: b.app.launcher, home: b.home, shell: '/bin/bash', loginPath: SYS });
  assert.equal(count(path.join(b.home, '.bash_login'), SH_LINE), 1);
  assert.equal(count(path.join(b.home, '.profile'), SH_LINE), 0);
  ok('bash: the first of .bash_profile, .bash_login, .profile that exists');
  const c = world('bash-none');
  assert.equal(lc({ launcher: c.app.launcher, home: c.home, shell: '/bin/bash', loginPath: SYS }), 'linked ~/.local/bin + ~/.bash_profile');
  assert.equal(fs.readFileSync(path.join(c.home, '.bash_profile'), 'utf8'), `${MARKER}\n${SH_LINE}\n`);
  ok('bash with none of them: .bash_profile is made');
}

{
  const w = world('fish');
  const o = { launcher: w.app.launcher, home: w.home, shell: '/opt/homebrew/bin/fish', loginPath: SYS };
  assert.equal(lc(o), 'linked ~/.local/bin + ~/.config/fish/conf.d/hydor.fish');
  lc(o);
  assert.equal(fs.readFileSync(path.join(w.home, '.config/fish/conf.d/hydor.fish'), 'utf8'), `${MARKER}\n${FISH_LINE}\n`);
  ok('fish: its own file in conf.d, once');
  const t = world('tcsh');
  assert.match(lc({ launcher: t.app.launcher, home: t.home, shell: '/bin/tcsh', loginPath: SYS }), /^linked ~\/\.local\/bin \(no startup file/);
  assert.ok(same(path.join(t.home, '.local/bin/hydor'), t.app.launcher));
  assert.deepEqual(fs.readdirSync(t.home), ['.local']);
  ok('another shell: only the link');
}

{
  // ~/.local/bin is on the PATH already but not there yet: the link, and no line.
  const w = world('local-on-path');
  const lb = path.join(w.home, '.local/bin');
  assert.equal(lc({ launcher: w.app.launcher, home: w.home, shell: '/bin/zsh', loginPath: `${SYS}:${lb}` }), 'linked ~/.local/bin');
  assert.ok(!fs.existsSync(path.join(w.home, '.zprofile')));
  ok('~/.local/bin already on the PATH: the link only');
}

{
  const w = world('stale');
  const a = w.dir('a');
  fs.symlinkSync('/Users/me/Downloads/Hydor.app/Contents/Resources/bin/hydor', path.join(a, 'hydor')); // the app was somewhere else
  const o = { launcher: w.app.launcher, home: w.home, shell: '/bin/zsh', loginPath: `${SYS}:${a}`, candidates: [a] };
  assert.equal(lc(o), 'relinked');
  assert.ok(same(path.join(a, 'hydor'), w.app.launcher));
  assert.equal(lc(o), 'fine');
  const u = world('stale-unknown');
  fs.mkdirSync(path.join(u.home, '.local/bin'), { recursive: true });
  fs.symlinkSync('/Applications/Hydor.app/Contents/Resources/bin/hydor', path.join(u.home, '.local/bin/hydor'));
  assert.equal(lc({ launcher: u.app.launcher, home: u.home, shell: '/bin/zsh', loginPath: null }), 'relinked');
  assert.ok(same(path.join(u.home, '.local/bin/hydor'), u.app.launcher));
  ok('a link of ours that went stale (the app moved) points at this app, on the PATH or in ~/.local/bin');
}

{
  // Someone else's hydor is never replaced.
  const w = world('other');
  const a = w.dir('a');
  const b = w.dir('b');
  fs.writeFileSync(path.join(a, 'hydor'), '#!/bin/sh\necho some other hydor\n', { mode: 0o755 });
  fs.symlinkSync('/opt/homebrew/Cellar/other/bin/hydor', path.join(b, 'hydor')); // a broken link that is not ours
  const o = { launcher: w.app.launcher, home: w.home, shell: '/bin/zsh', loginPath: [SYS, a, b].join(':'), candidates: [a, b] };
  assert.equal(lc(o), 'linked ~/.local/bin + ~/.zprofile');
  assert.equal(fs.readFileSync(path.join(a, 'hydor'), 'utf8'), '#!/bin/sh\necho some other hydor\n');
  assert.equal(fs.readlinkSync(path.join(b, 'hydor')), '/opt/homebrew/Cellar/other/bin/hydor');
  const x = world('other2');
  const a2 = x.dir('a');
  const c2 = x.dir('c');
  fs.writeFileSync(path.join(a2, 'hydor'), '#!/bin/sh\necho some other hydor\n', { mode: 0o755 });
  assert.equal(lc({ launcher: x.app.launcher, home: x.home, shell: '/bin/zsh', loginPath: [SYS, a2, c2].join(':'), candidates: [a2, c2] }), `linked ${c2}`);
  assert.equal(fs.readFileSync(path.join(a2, 'hydor'), 'utf8'), '#!/bin/sh\necho some other hydor\n');
  ok('someone else’s hydor (a file or a link) is left alone: the link goes to another folder, or to ~/.local/bin');
  // …also in ~/.local/bin, with the PATH unknown.
  const y = world('other3');
  fs.mkdirSync(path.join(y.home, '.local/bin'), { recursive: true });
  fs.writeFileSync(path.join(y.home, '.local/bin/hydor'), 'mine');
  assert.match(lc({ launcher: y.app.launcher, home: y.home, shell: '/bin/zsh', loginPath: null }), /^skipped: ~\/\.local\/bin\/hydor is something else/);
  assert.equal(fs.readFileSync(path.join(y.home, '.local/bin/hydor'), 'utf8'), 'mine');
  assert.ok(!fs.existsSync(path.join(y.home, '.zprofile')));
  ok('and in ~/.local/bin: skipped, nothing added to the startup file');
}

{
  // A script written by hand (what the user has today) is fine.
  const w = world('script');
  const a = w.dir('a');
  const body = `#!/bin/sh\nexec "/Applications/Hydor.app/Contents/Resources/node/bin/node" "/Applications/Hydor.app/Contents/Resources/server/dist/server/cli.js" "$@"\n`;
  fs.writeFileSync(path.join(a, 'hydor'), body, { mode: 0o755 });
  const b = w.dir('b');
  assert.equal(lc({ launcher: w.app.launcher, home: w.home, shell: '/bin/zsh', loginPath: `${SYS}:${a}:${b}`, candidates: [a, b] }), 'fine');
  assert.equal(fs.readFileSync(path.join(a, 'hydor'), 'utf8'), body);
  assert.ok(!fs.existsSync(path.join(b, 'hydor')) && !fs.existsSync(path.join(w.home, '.local')));
  ok('a script someone wrote by hand to run the app’s cli.js is left as it is, and nothing is added');
}

{
  // The PATH is unknown (the login shell could not be read): only ~/.local/bin, and never a folder of a guessed PATH.
  for (const unknown of [null, '', undefined]) {
    const w = world(`unknown-${String(unknown)}`);
    assert.equal(lc({ launcher: w.app.launcher, home: w.home, shell: '/bin/zsh', loginPath: unknown }), 'linked ~/.local/bin + ~/.zprofile');
    assert.equal(lc({ launcher: w.app.launcher, home: w.home, shell: '/bin/zsh', loginPath: unknown }), 'linked ~/.local/bin + ~/.zprofile');
    assert.equal(count(path.join(w.home, '.zprofile'), MARKER), 1);
  }
  ok('an unknown PATH: ~/.local/bin and its line, once');
}

{
  // It never throws.
  const w = world('never');
  assert.match(lc({ launcher: path.join(root, 'nowhere/hydor'), home: w.home, loginPath: SYS }), /^skipped:/);
  assert.match(linkCommand({}), /^skipped:/);
  fs.writeFileSync(path.join(w.home, '.local'), 'a file where a folder should go');
  assert.match(lc({ launcher: w.app.launcher, home: w.home, shell: '/bin/zsh', loginPath: SYS }), /^skipped:/);
  ok('it never throws: a missing launcher or a blocked folder is reported as skipped');
}

fs.rmSync(root, { recursive: true, force: true });
console.log(`\n${n} checks passed`);
