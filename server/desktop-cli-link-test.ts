// Script tests for the `hydor` command of the desktop apps: desktop/cli-link.cjs (which puts it on the PATH of Terminal, with
// nothing asked: a link on a Mac, a shim file on Linux, a hydor.cmd and the user's Path on Windows), the launchers
// scripts/stage.sh writes into the app (bin/hydor, bin/hydor.cmd), and what `hydor` does inside the app (HYDOR_APP_OPEN, in
// server/tui/client.ts). All are tried here on scratch folders: a fake app under a path with spaces, a scratch HOME, PATH
// folders of the test's own, and for Windows a fake registry. Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/desktop-cli-link-test.ts && node dist/dev/desktop-cli-link-test.js
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { ApiError, openApp, startServer } from './tui/client.ts';

type Registry = { get(): { type: string; value: string } | null; set(type: string, value: string): void; broadcast(): void };
type LinkOptions = {
  launcher?: string;
  loginPath?: string | null;
  home?: string;
  shell?: string;
  env?: Record<string, string>;
  candidates?: string[];
  open?: string;
  appProgram?: string;
  platform?: string;
  localAppData?: string;
  registry?: Registry;
};
const { linkCommand, MARKER, SH_LINE, FISH_LINE, PRE_SH_LINE, SHIM_MARK, parseRegQuery, cmdShimText } = createRequire(import.meta.url)('../../desktop/cli-link.cjs') as {
  linkCommand: (o: LinkOptions) => string;
  MARKER: string;
  SH_LINE: string;
  FISH_LINE: string;
  PRE_SH_LINE: string;
  SHIM_MARK: string;
  parseRegQuery: (t: string) => { type: string; value: string } | null;
  cmdShimText: (launcher: string, open: string, localAppData: string) => string;
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

// ---- Linux: the shim --------------------------------------------------------------------------------------------------
const APPIMAGE = "/Apps/My Apps/it's $HOME/Hydor.AppImage";
/** linkCommand for Linux: a shim (`open` is given), with ~/.local/bin and ~/bin as the folders to link in. */
const sh = (o: LinkOptions) => linkCommand({ candidates: [path.join(o.home!, '.local/bin'), path.join(o.home!, 'bin')], open: APPIMAGE, ...o });
/** A fake runtime copy of a version (…/runtime/<id>/bin/hydor, as an AppImage's or Windows' app makes), whose command prints what it was given. */
function fakeCopy(where: string, id: string) {
  const res = path.join(root, where, 'Local/Hydor/runtime', id);
  fs.mkdirSync(path.join(res, 'bin'), { recursive: true });
  fs.mkdirSync(path.join(res, 'node/bin'), { recursive: true });
  fs.mkdirSync(path.join(res, 'server/dist/server'), { recursive: true });
  const fn = /^write_launcher\(\) \{\n[\s\S]*?\n\}\n/m.exec(stage)?.[0]!;
  execFileSync('bash', ['-c', `${fn}\nwrite_launcher "$1"`, 'x', path.join(res, 'bin/hydor')]);
  fs.symlinkSync(process.execPath, path.join(res, 'node/bin/node'));
  fs.writeFileSync(path.join(res, 'server/dist/server/cli.js'), `console.log(JSON.stringify([process.argv.slice(2), ${JSON.stringify(id)}, process.env.HYDOR_APP_OPEN ?? null, process.env.HYDOR_APP_BUNDLE ?? null]))\n`);
  return path.join(res, 'bin/hydor');
}
const runShim = (file: string, ...args: string[]) => {
  const env = { ...process.env } as Record<string, string | undefined>;
  delete env.HYDOR_APP_OPEN;
  return JSON.parse(execFileSync(file, args, { env: env as NodeJS.ProcessEnv }).toString());
};
const text = (f: string) => fs.readFileSync(f, 'utf8');

{
  const w = world('shim');
  const l1 = fakeCopy('shim', '0.57.0-aaaa1111');
  const l2 = fakeCopy('shim', '0.58.0-bbbb2222');
  const bin = path.join(w.home, '.local/bin/hydor');
  const o = { launcher: l1, home: w.home, shell: '/bin/zsh', loginPath: SYS };
  assert.equal(sh(o), 'linked ~/.local/bin + ~/.zprofile');
  assert.ok(text(bin).startsWith('#!/bin/sh\n') && text(bin).includes(SHIM_MARK) && fs.statSync(bin).mode & 0o100);
  assert.ok(!fs.lstatSync(bin).isSymbolicLink());
  assert.equal(text(path.join(w.home, '.zprofile')), `${MARKER}\n${SH_LINE}\n`);
  // It runs the launcher of its copy, with the program that opens the app, and quotes it whatever is in it.
  assert.deepEqual(runShim(bin, 'help', 'a b'), [['help', 'a b'], '0.57.0-aaaa1111', APPIMAGE, null]);
  ok('Linux: the shim is written in ~/.local/bin with its startup line, and runs the launcher with HYDOR_APP_OPEN, a path with spaces, a quote and a $ intact');
  // Run again: nothing changes, nothing is added twice (not even with the PATH of a new terminal).
  const before = fs.statSync(bin).mtimeMs;
  assert.equal(sh(o), 'linked ~/.local/bin + ~/.zprofile');
  assert.equal(count(path.join(w.home, '.zprofile'), MARKER), 1);
  assert.equal(fs.statSync(bin).mtimeMs, before);
  assert.equal(sh({ ...o, loginPath: `${SYS}:${path.join(w.home, '.local/bin')}` }), 'fine');
  ok('Linux: the startup line is there once however many starts, an unchanged shim is not written again, and a PATH that has it is fine');
  // A new version: the shim is written again, with the new copy's launcher (and a new program to open).
  assert.equal(sh({ ...o, launcher: l2, loginPath: `${SYS}:${path.join(w.home, '.local/bin')}` }), 'updated');
  assert.deepEqual(runShim(bin, 'x'), [['x'], '0.58.0-bbbb2222', APPIMAGE, null]);
  assert.equal(sh({ ...o, launcher: l2, open: '/opt/Hydor/hydor', loginPath: `${SYS}:${path.join(w.home, '.local/bin')}` }), 'updated');
  assert.equal(runShim(bin)[2], '/opt/Hydor/hydor');
  assert.equal(sh({ ...o, launcher: l2, open: '/opt/Hydor/hydor', loginPath: `${SYS}:${path.join(w.home, '.local/bin')}` }), 'fine');
  ok('Linux: a new version’s start writes the shim again for its launcher and program, and again only when that changes');
}

{
  // Another hydor on the PATH (install.sh's link to a checkout's bin/hydor.mjs): everything is left alone.
  const w = world('shim-other');
  const l = fakeCopy('shim-other', '0.57.0-aaaa1111');
  const a = w.dir('checkout-bin');
  fs.writeFileSync(path.join(w.dir('checkout'), 'hydor.mjs'), '#!/usr/bin/env node\n', { mode: 0o755 });
  fs.symlinkSync(path.join(root, 'shim-other/checkout/hydor.mjs'), path.join(a, 'hydor'));
  const o = { launcher: l, home: w.home, shell: '/bin/zsh', loginPath: [a, SYS].join(':'), candidates: [a, path.join(w.home, '.local/bin')] };
  assert.equal(linkCommand({ ...o, open: APPIMAGE }), `skipped: another hydor on the PATH: ${path.join(a, 'hydor')}`);
  assert.deepEqual(fs.readdirSync(w.home), []);
  assert.equal(fs.readlinkSync(path.join(a, 'hydor')), path.join(root, 'shim-other/checkout/hydor.mjs'));
  // Even when ours is already in ~/.local/bin behind it: not touched.
  const lb = path.join(w.home, '.local/bin');
  fs.mkdirSync(lb, { recursive: true });
  fs.writeFileSync(path.join(lb, 'hydor'), `#!/bin/sh\n# ${SHIM_MARK}\nexec old\n`, { mode: 0o755 });
  assert.match(linkCommand({ ...o, open: APPIMAGE, loginPath: [a, lb, SYS].join(':') }), /^skipped: another hydor on the PATH:/);
  assert.equal(text(path.join(lb, 'hydor')), `#!/bin/sh\n# ${SHIM_MARK}\nexec old\n`);
  ok('Linux: a hydor on the PATH that is not ours (install.sh’s link to a checkout) is left alone, with everything else');
  // A hydor of someone else in ~/.local/bin, PATH unknown: skipped, no startup line.
  const y = world('shim-other2');
  const ll = fakeCopy('shim-other2', '0.57.0-aaaa1111');
  fs.mkdirSync(path.join(y.home, '.local/bin'), { recursive: true });
  fs.writeFileSync(path.join(y.home, '.local/bin/hydor'), 'mine');
  assert.match(sh({ launcher: ll, home: y.home, shell: '/bin/zsh', loginPath: null }), /^skipped: ~\/\.local\/bin\/hydor is something else/);
  assert.equal(text(path.join(y.home, '.local/bin/hydor')), 'mine');
  assert.ok(!fs.existsSync(path.join(y.home, '.zprofile')));
  ok('Linux: a hydor that is not ours in ~/.local/bin is never replaced');
}

{
  // The Mac-style link of an older version counts as ours, and is replaced by the shim (the launcher is not written through it).
  const w = world('shim-old');
  const l = fakeCopy('shim-old', '0.57.0-aaaa1111');
  const lb = path.join(w.home, '.local/bin');
  fs.mkdirSync(lb, { recursive: true });
  const old = fakeCopy('shim-old', '0.50.0-oldold00');
  const oldText = text(old);
  fs.symlinkSync(old, path.join(lb, 'hydor'));
  assert.equal(sh({ launcher: l, home: w.home, shell: '/bin/zsh', loginPath: `${SYS}:${lb}` }), 'updated');
  assert.ok(!fs.lstatSync(path.join(lb, 'hydor')).isSymbolicLink() && text(path.join(lb, 'hydor')).includes(SHIM_MARK));
  assert.equal(text(old), oldText);
  // A link whose copy is gone (pruned) as well.
  const z = world('shim-old2');
  const l2 = fakeCopy('shim-old2', '0.57.0-aaaa1111');
  const lb2 = path.join(z.home, '.local/bin');
  fs.mkdirSync(lb2, { recursive: true });
  fs.symlinkSync(path.join(root, 'shim-old2/Local/Hydor/runtime/0.40.0-gone0000/bin/hydor'), path.join(lb2, 'hydor'));
  assert.equal(sh({ launcher: l2, home: z.home, shell: '/bin/zsh', loginPath: `${SYS}:${lb2}` }), 'updated');
  assert.ok(text(path.join(lb2, 'hydor')).includes(SHIM_MARK));
  ok('Linux: an older version’s link to a launcher of the app (even one gone) counts as ours and becomes the shim, without writing through it');
}

{
  // The .deb: /usr/bin/hydor is the app's own program. It is not "another hydor", and ours goes before it.
  const w = world('shim-deb');
  const l = fakeCopy('shim-deb', '0.57.0-aaaa1111');
  const usr = w.dir('usr-bin');
  const program = path.join(w.dir('opt'), 'hydor');
  fs.writeFileSync(program, '#!/bin/sh\n', { mode: 0o755 });
  fs.symlinkSync(program, path.join(usr, 'hydor'));
  const lb = path.join(w.home, '.local/bin');
  const o = { launcher: l, home: w.home, shell: '/bin/bash', appProgram: program, open: program, candidates: [lb, path.join(w.home, 'bin')] };
  // ~/.local/bin is not on the PATH yet: the shim, and a line that puts it first.
  assert.equal(linkCommand({ ...o, loginPath: [usr, SYS].join(':') }), 'linked ~/.local/bin + ~/.bash_profile');
  assert.equal(text(path.join(w.home, '.bash_profile')), `${MARKER}\n${PRE_SH_LINE}\n`);
  // It is on the PATH but after /usr/bin: still shadowed, nothing more is added.
  assert.equal(linkCommand({ ...o, loginPath: [usr, SYS, lb].join(':') }), 'linked ~/.local/bin + ~/.bash_profile');
  assert.equal(count(path.join(w.home, '.bash_profile'), MARKER), 1);
  // Once the new shell has it first, it is fine.
  assert.equal(linkCommand({ ...o, loginPath: [lb, usr, SYS].join(':') }), 'fine');
  assert.equal(runShim(path.join(lb, 'hydor'), 'a')[2], program);
  // A writable folder of the general ones before /usr/bin gets it.
  const x = world('shim-deb2');
  const l3 = fakeCopy('shim-deb2', '0.57.0-aaaa1111');
  const u2 = x.dir('usr-bin');
  const pr2 = path.join(x.dir('opt'), 'hydor');
  fs.writeFileSync(pr2, '#!/bin/sh\n', { mode: 0o755 });
  fs.symlinkSync(pr2, path.join(u2, 'hydor'));
  const hb = x.dir('home/bin');
  assert.equal(linkCommand({ launcher: l3, home: path.join(root, 'shim-deb2/home'), shell: '/bin/bash', appProgram: pr2, open: pr2, candidates: [hb], loginPath: [hb, u2, SYS].join(':') }), "linked ~/bin");
  ok('Linux .deb: /usr/bin/hydor (the app’s own program) is not another hydor; the shim goes before it, or its line puts ~/.local/bin first');
}

// ---- Windows: hydor.cmd, WindowsApps, the user's Path ----------------------------------------------------------------
/** A fake registry holding the user's Path, and what was done to it. */
function fakeRegistry(initial: { type: string; value: string } | null, o: { fail?: string } = {}) {
  const r = { value: initial, gets: 0, sets: [] as string[], broadcasts: 0 } as { value: { type: string; value: string } | null; gets: number; sets: string[]; broadcasts: number } & Registry;
  r.get = () => {
    r.gets++;
    if (o.fail) throw new Error(o.fail);
    return r.value ? { ...r.value } : null;
  };
  r.set = (type, value) => {
    r.sets.push(`${type} ${value}`);
    r.value = { type, value };
  };
  r.broadcast = () => void r.broadcasts++;
  return r;
}
const lcw = (o: LinkOptions) => linkCommand({ platform: 'win32', ...o });
/** A fake Windows world: LOCALAPPDATA (a scratch folder), a runtime copy of a version with its bin\hydor.cmd, the program of the app. */
function winWorld(name: string, id = '0.57.0-aaaa1111') {
  const la = path.join(root, name, 'Local');
  const res = path.join(la, 'Hydor/runtime', id);
  fs.mkdirSync(path.join(res, 'bin'), { recursive: true });
  const fn = /^write_cmd_launcher\(\) \{\n[\s\S]*?\n\}\n/m.exec(stage)?.[0];
  assert.ok(fn, 'stage.sh has write_cmd_launcher()');
  execFileSync('bash', ['-c', `${fn}\nwrite_cmd_launcher "$1"`, 'x', path.join(res, 'bin/hydor.cmd')]);
  const program = path.join(la, 'Programs/Hydor/Hydor.exe');
  return { la, launcher: path.join(res, 'bin/hydor.cmd'), program, env: { LOCALAPPDATA: la, USERPROFILE: path.join(root, name, 'user') }, apps: path.join(la, 'Microsoft/WindowsApps'), mine: path.join(la, 'Hydor/bin') };
}
const USERPATH = 'C:\\Users\\me\\bin;%USERPROFILE%\\.cargo\\bin;%SystemRoot%\\system32;C:\\Program Files\\Git\\cmd';

{
  const cmd = fs.readFileSync(path.join(winWorld('w-launcher').launcher), 'latin1');
  assert.equal(cmd, '@echo off\r\nrem The hydor command of the Hydor app: runs the app\'s own Node.js on the app\'s own command (server\\dist\\server\\cli.js).\r\n"%~dp0..\\node\\node.exe" "%~dp0..\\server\\dist\\server\\cli.js" %*\r\nexit /b %ERRORLEVEL%\r\n');
  ok('stage.sh writes bin\\hydor.cmd: the copy’s node.exe on its cli.js through %~dp0, the arguments and the exit code passed on, CR LF line ends');
}

{
  // WindowsApps exists and is on the PATH: the shim there, and neither the registry nor the PATH is touched.
  const w = winWorld('w-apps');
  fs.mkdirSync(w.apps, { recursive: true });
  const reg = fakeRegistry({ type: 'REG_EXPAND_SZ', value: USERPATH });
  const o = { launcher: w.launcher, open: w.program, env: w.env, localAppData: w.la, registry: reg, loginPath: `${path.join(root, 'w-apps/sys')};${w.apps}` };
  assert.equal(lcw(o), 'linked %LOCALAPPDATA%\\Microsoft\\WindowsApps');
  const shim = fs.readFileSync(path.join(w.apps, 'hydor.cmd'), 'latin1');
  assert.equal(
    shim,
    [
      '@echo off',
      `rem ${SHIM_MARK}`,
      'rem The Hydor app writes this file each time it starts, so it names the version that runs now: changes made here are lost.',
      'setlocal',
      'set "HYDOR_APP_OPEN=%LOCALAPPDATA%\\Programs\\Hydor\\Hydor.exe"',
      '"%LOCALAPPDATA%\\Hydor\\runtime\\0.57.0-aaaa1111\\node\\node.exe" "%LOCALAPPDATA%\\Hydor\\runtime\\0.57.0-aaaa1111\\server\\dist\\server\\cli.js" %*',
      'exit /b %ERRORLEVEL%',
      '',
    ].join('\r\n'),
  );
  assert.deepEqual([reg.gets, reg.sets.length, reg.broadcasts], [0, 0, 0]);
  assert.equal(lcw(o), 'fine');
  // A new version.
  const w2 = winWorld('w-apps', '0.58.0-bbbb2222');
  assert.equal(lcw({ ...o, launcher: w2.launcher }), 'updated');
  assert.ok(fs.readFileSync(path.join(w.apps, 'hydor.cmd'), 'latin1').includes('0.58.0-bbbb2222\\node\\node.exe'));
  assert.equal(lcw({ ...o, launcher: w2.launcher }), 'fine');
  assert.deepEqual([reg.gets, reg.sets.length, reg.broadcasts], [0, 0, 0]);
  ok('Windows: with WindowsApps on the PATH the shim goes there (paths under %LOCALAPPDATA%, the registry untouched), is rewritten for a new version, and is fine otherwise');
}

{
  // WindowsApps is not on the PATH (or is not there): %LOCALAPPDATA%\Hydor\bin, and the user's Path in the registry gets it once.
  for (const [label, makeApps] of [['not on the PATH', true], ['not there', false]] as const) {
    const w = winWorld(`w-mine-${label.replace(/\W/g, '')}`);
    if (makeApps) fs.mkdirSync(w.apps, { recursive: true });
    const reg = fakeRegistry({ type: 'REG_EXPAND_SZ', value: USERPATH });
    const sys = path.join(root, `w-mine-${label.replace(/\W/g, '')}`, 'sys');
    const o = { launcher: w.launcher, open: w.program, env: w.env, localAppData: w.la, registry: reg, loginPath: sys };
    assert.equal(lcw(o), 'linked %LOCALAPPDATA%\\Hydor\\bin + the user Path', label);
    assert.ok(fs.existsSync(path.join(w.mine, 'hydor.cmd')) && !fs.existsSync(path.join(w.apps, 'hydor.cmd')));
    assert.deepEqual(reg.sets, [`REG_EXPAND_SZ ${USERPATH};${w.mine.replace(/\//g, '\\')}`]);
    assert.equal(reg.broadcasts, 1);
    // The apps's next start, before a new login gives it the PATH: the same Path, nothing added or set again.
    assert.equal(lcw(o), 'fine');
    assert.equal(reg.sets.length, 1);
    // And with the new PATH.
    assert.equal(lcw({ ...o, loginPath: `${sys};${w.mine}` }), 'fine');
    assert.equal(reg.sets.length, 1);
  }
  ok('Windows: without WindowsApps on the PATH, Hydor\\bin gets the shim and the user Path gets the folder once, with its type and every entry (the %VARS% unexpanded), and running programs are told');
  // REG_SZ keeps its type; an empty or missing Path is made; the folder by its %LOCALAPPDATA% name is there already.
  const a = winWorld('w-regsz');
  const r1 = fakeRegistry({ type: 'REG_SZ', value: 'C:\\a;C:\\b;' });
  lcw({ launcher: a.launcher, open: a.program, env: a.env, localAppData: a.la, registry: r1, loginPath: '' });
  assert.deepEqual(r1.sets, [`REG_SZ C:\\a;C:\\b;${a.mine.replace(/\//g, '\\')}`]);
  const b = winWorld('w-noreg');
  const r2 = fakeRegistry(null);
  lcw({ launcher: b.launcher, open: b.program, env: b.env, localAppData: b.la, registry: r2, loginPath: '' });
  assert.deepEqual(r2.sets, [`REG_EXPAND_SZ ${b.mine.replace(/\//g, '\\')}`]);
  const c = winWorld('w-has');
  const r3 = fakeRegistry({ type: 'REG_EXPAND_SZ', value: `C:\\a;%LOCALAPPDATA%\\Hydor\\bin\\` });
  assert.match(lcw({ launcher: c.launcher, open: c.program, env: c.env, localAppData: c.la, registry: r3, loginPath: '' }), /^linked %LOCALAPPDATA%\\Hydor\\bin$/);
  assert.equal(r3.sets.length, 0);
  const d = winWorld('w-has2');
  const r4 = fakeRegistry({ type: 'REG_SZ', value: `C:\\a;${d.mine.replace(/\//g, '\\').toUpperCase()}` });
  lcw({ launcher: d.launcher, open: d.program, env: d.env, localAppData: d.la, registry: r4, loginPath: '' });
  assert.equal(r4.sets.length, 0);
  ok('Windows: REG_SZ stays REG_SZ, no Path value is made as REG_EXPAND_SZ, and the folder in any spelling (%LOCALAPPDATA%, upper case, a final \\) is never added twice');
  // A registry that cannot be read safely: the shim is there, the Path is not touched, and it says so.
  const e = winWorld('w-regfail');
  const r5 = fakeRegistry(null, { fail: 'your user Path has characters outside ASCII' });
  assert.equal(lcw({ launcher: e.launcher, open: e.program, env: e.env, localAppData: e.la, registry: r5, loginPath: '' }), 'linked %LOCALAPPDATA%\\Hydor\\bin (the user Path could not be changed: your user Path has characters outside ASCII)');
  assert.equal(r5.sets.length, 0);
  const f = winWorld('w-multi');
  const r6 = fakeRegistry({ type: 'REG_MULTI_SZ', value: 'a' });
  assert.match(lcw({ launcher: f.launcher, open: f.program, env: f.env, localAppData: f.la, registry: r6, loginPath: '' }), /the user Path could not be changed: your user Path is a REG_MULTI_SZ/);
  assert.equal(r6.sets.length, 0);
  // Written but read back differently: the old value is put back.
  const g = winWorld('w-readback');
  const r7 = fakeRegistry({ type: 'REG_EXPAND_SZ', value: 'C:\\a' });
  const set7 = r7.set;
  r7.set = (type, value) => set7(type, value === 'C:\\a' ? value : `${value}X`);
  assert.match(lcw({ launcher: g.launcher, open: g.program, env: g.env, localAppData: g.la, registry: r7, loginPath: '' }), /did not read back as written/);
  assert.equal(r7.value?.value, 'C:\\a');
  ok('Windows: a Path that cannot be read safely, is not text, or does not read back as written is left as it was, and the shim is still made');
}

{
  // Another hydor on the PATH (a .cmd, a .exe) is left alone, with the registry too.
  for (const ext of ['cmd', 'exe']) {
    const w = winWorld(`w-other-${ext}`);
    fs.mkdirSync(w.apps, { recursive: true });
    const other = path.join(w.la, 'npm');
    fs.mkdirSync(other, { recursive: true });
    fs.writeFileSync(path.join(other, `hydor.${ext}`), '@echo off\r\necho some other hydor\r\n');
    const reg = fakeRegistry({ type: 'REG_EXPAND_SZ', value: USERPATH });
    assert.equal(lcw({ launcher: w.launcher, open: w.program, env: w.env, localAppData: w.la, registry: reg, loginPath: `${other};${w.apps}` }), `skipped: another hydor on the PATH: ${path.join(other, `hydor.${ext}`)}`);
    assert.ok(!fs.existsSync(path.join(w.apps, 'hydor.cmd')) && !fs.existsSync(w.mine));
    assert.deepEqual([reg.gets, reg.sets.length], [0, 0]);
  }
  ok('Windows: a hydor.cmd or hydor.exe on the PATH that is not ours is left alone: nothing written, the registry untouched');
}

{
  // The quoting of a path with spaces, an ampersand and a percent sign (not under %LOCALAPPDATA%).
  const t = cmdShimText('/Prog Files & Co/100%/Hydor/runtime/v1/bin/hydor.cmd', '/Prog Files & Co/100%/Hydor.exe', '/elsewhere/Local');
  const lines = t.split('\r\n');
  assert.equal(lines.at(-1), '');
  assert.equal(lines[4], 'set "HYDOR_APP_OPEN=\\Prog Files & Co\\100%%\\Hydor.exe"');
  assert.equal(lines[5], '"\\Prog Files & Co\\100%%\\Hydor\\runtime\\v1\\node\\node.exe" "\\Prog Files & Co\\100%%\\Hydor\\runtime\\v1\\server\\dist\\server\\cli.js" %*');
  assert.ok(!t.replace(/\r\n/g, '').includes('\n') && !t.includes('call '));
  // …and what a .cmd file cannot hold is refused, not written wrong.
  const w = winWorld('w-quote');
  fs.mkdirSync(w.apps, { recursive: true });
  for (const bad of ['C:\\a"b\\Hydor.exe', 'C:\\Hey!\\Hydor.exe', 'C:\\Ελλάδα\\Hydor.exe']) {
    const r = lcw({ launcher: w.launcher, open: bad, env: w.env, localAppData: w.la, registry: fakeRegistry(null), loginPath: w.apps });
    assert.match(r, /^skipped: a path with /, bad);
  }
  assert.ok(!fs.existsSync(path.join(w.apps, 'hydor.cmd')));
  ok('Windows: the shim quotes every path (spaces, &, % doubled), keeps %LOCALAPPDATA% for a path under it, and refuses a quote, a ! or non-ASCII outside it');
  assert.deepEqual(parseRegQuery('\r\nHKEY_CURRENT_USER\\Environment\r\n    Path    REG_EXPAND_SZ    C:\\a;%USERPROFILE%\\b\r\n\r\n'), { type: 'REG_EXPAND_SZ', value: 'C:\\a;%USERPROFILE%\\b' });
  assert.deepEqual(parseRegQuery('\r\nHKEY_CURRENT_USER\\Environment\r\n    PATH    REG_SZ    \r\n'), { type: 'REG_SZ', value: '' });
  assert.equal(parseRegQuery('ERROR: The system was unable to find the specified registry key or value.\r\n'), null);
  ok('Windows: reg query’s output is read into a type and a value');
}

// ---- `hydor` inside the Linux and Windows apps: HYDOR_APP_OPEN ---------------------------------------------------------
{
  const dir = path.join(root, 'open');
  fs.mkdirSync(dir, { recursive: true });
  const seen = path.join(dir, 'seen.json');
  // A fake app: starts "its server" a moment later and notes what it was run with.
  const serverJs = path.join(dir, 'server.js');
  fs.writeFileSync(
    serverJs,
    `const http = require('http'), fs = require('fs');
fs.writeFileSync(${JSON.stringify(seen)}, JSON.stringify({ args: process.argv.slice(2), open: process.env.HYDOR_APP_OPEN ?? null, pid: process.pid }));
setTimeout(() => http.createServer((q, r) => r.end(JSON.stringify({ ok: true, version: '9.9.9' }))).listen(Number(process.env.FAKE_PORT), '127.0.0.1'), 1600);
`,
  );
  const app = path.join(dir, 'My App & Co/Hydor');
  fs.mkdirSync(path.dirname(app), { recursive: true });
  fs.writeFileSync(app, `#!/bin/sh\nexec "${process.execPath}" "${serverJs}" "$@"\n`, { mode: 0o755 });
  const port = 30000 + Math.floor(Math.random() * 20000);
  const base = `http://127.0.0.1:${port}`;
  const said: string[] = [];
  const keep = { ...process.env };
  process.env.FAKE_PORT = String(port);
  process.env.HYDOR_APP_OPEN = app;
  delete process.env.HYDOR_APP_BUNDLE;
  try {
    const t0 = Date.now();
    assert.equal(await startServer(base, (m) => said.push(m)), '9.9.9');
    assert.ok(Date.now() - t0 >= 1500);
    assert.deepEqual(said, ['Opening Hydor…']);
    const got = JSON.parse(fs.readFileSync(seen, 'utf8'));
    assert.deepEqual([got.args, got.open], [['--hidden'], null]);
    try {
      process.kill(got.pid);
    } catch {}
    ok('HYDOR_APP_OPEN: `hydor` starts that program (a path with spaces and &, no shell) without its window, says “Opening Hydor…”, and waits for the server; the app does not get HYDOR_APP_OPEN');
    // No screen: the program stops at once with an error, and it says to open the app, quickly.
    const bad = path.join(dir, 'no-display');
    fs.writeFileSync(bad, '#!/bin/sh\necho "Missing X server or $DISPLAY" >&2\nexit 1\n', { mode: 0o755 });
    process.env.HYDOR_APP_OPEN = bad;
    const t1 = Date.now();
    await assert.rejects(startServer(`http://127.0.0.1:${port + 1}`, () => {}), (e: unknown) => e instanceof ApiError && /open the Hydor app yourself/.test(e.message) && /stopped at once \(exit code 1\)/.test(e.message));
    assert.ok(Date.now() - t1 < 10_000);
    process.env.HYDOR_APP_OPEN = path.join(dir, 'not-there');
    await assert.rejects(startServer(`http://127.0.0.1:${port + 1}`, () => {}), (e: unknown) => e instanceof ApiError && /could not be started \(ENOENT\)/.test(e.message));
    ok('HYDOR_APP_OPEN: a program that stops at once with an error (no screen), or is not there, ends it in a moment with “open the Hydor app yourself”');
    // Exit code 0 (a second start handing over to the app that runs): it carries on waiting, then gives up after its time.
    const second = path.join(dir, 'second');
    fs.writeFileSync(second, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    await assert.rejects(openApp(`http://127.0.0.1:${port + 1}`, () => {}, second, ['--hidden'], { failFast: true, timeoutMs: 1500 }), (e: unknown) => e instanceof ApiError && /did not start in time/.test(e.message));
    ok('HYDOR_APP_OPEN: a start that hands over and exits with 0 is not a failure: it waits for the server');
  } finally {
    for (const k of ['FAKE_PORT', 'HYDOR_APP_OPEN', 'HYDOR_APP_BUNDLE']) {
      if (keep[k] === undefined) delete process.env[k];
      else process.env[k] = keep[k];
    }
  }
}

// The commands that the app does itself say so under HYDOR_APP_OPEN too.
{
  const cli = fs.readFileSync(path.resolve(import.meta.dirname, '../../server/cli.ts'), 'utf8') + fs.readFileSync(path.resolve(import.meta.dirname, '../../server/tui/commands.ts'), 'utf8');
  assert.equal(cli.split('process.env.HYDOR_APP_BUNDLE || process.env.HYDOR_APP_OPEN').length - 1, 3, 'update, service install and serve refuse under both');
  ok('hydor update, service install and serve refuse inside the app under HYDOR_APP_BUNDLE and HYDOR_APP_OPEN');
}

fs.rmSync(root, { recursive: true, force: true });
console.log(`\n${n} checks passed`);
