// Script tests for the sandbox's parts that need no particular system: Seatbelt's profile (macOS), which folders
// Windows' sandbox never marks, and how each system words a command that ran into the walls. The sandbox itself runs
// in server/platform-test.ts, on each system in the desktop apps' CI.
//   OUTDIR=dist/dev node scripts/build-server.mjs server/agent/sandbox-test.ts && node dist/dev/sandbox-test.js
import assert from 'node:assert/strict';
import { gitRoot, mirrorPath, tooBroad } from './lowbox.ts';
import { netRefused, seatbeltProfile, wallsHit } from './sandbox.ts';

const tests: [string, () => void][] = [
  [
    'Seatbelt: writes only in the folders given, the terminal devices too; the network as it is',
    () => {
      const p = seatbeltProfile(3, { walls: true, cut: false });
      assert.match(p, /^\(version 1\)\n\(allow default\)\n/);
      assert.match(p, /\(deny file-write\*\)\n\(allow file-write\* \(subpath \(param "W0"\)\) \(subpath \(param "W1"\)\) \(subpath \(param "W2"\)\) /, 'the allowed folders come after the deny, so they win');
      for (const dev of ['(literal "/dev/null")', '(regex #"^/dev/tty")', '(regex #"^/dev/fd/")']) assert.ok(p.includes(dev), dev);
      assert.ok(!p.includes('network'), 'other sessions keep the network');
      assert.ok(!p.includes('W3'));
    },
  ],
  [
    'Seatbelt: a confidential session has no network, in every mode; files as the mode has them',
    () => {
      const cut = seatbeltProfile(0, { walls: false, cut: true });
      assert.match(cut, /\(deny network\*\)/);
      assert.ok(!cut.includes('file-write'), 'Ask mode: files as they are');
      const both = seatbeltProfile(1, { walls: true, cut: true });
      assert.match(both, /\(deny network\*\)/);
      assert.match(both, /\(subpath \(param "W0"\)\)/);
    },
  ],
  [
    'Windows: never a drive, the home folder or one above it, system folders, or app data but for the temporary folder',
    () => {
      const home = 'C:\\Users\\Ana';
      const tmp = 'C:\\Users\\Ana\\AppData\\Local\\Temp';
      const env = { WINDIR: 'C:\\Windows', ProgramFiles: 'C:\\Program Files', 'ProgramFiles(x86)': 'C:\\Program Files (x86)', ProgramData: 'C:\\ProgramData' };
      const broad = (d: string) => tooBroad(d, home, tmp, env);
      for (const d of ['C:\\', 'D:\\', 'C:\\Users', 'C:\\Users\\Ana', 'c:\\users\\ana\\', 'C:\\Windows\\Temp', 'C:\\Program Files\\Git', 'C:\\ProgramData\\x', 'C:\\Users\\Ana\\AppData', 'C:\\Users\\Ana\\AppData\\Roaming\\Code', tmp, '\\\\server\\share'])
        assert.equal(broad(d), true, d);
      for (const d of ['C:\\Users\\Ana\\code\\app', 'C:\\Users\\Ana\\Documents\\Hydor\\task-1', 'D:\\work\\repo', `${tmp}\\hydor-platform-1\\sandbox-2`, 'C:\\Users\\Anabel\\x', '\\\\server\\share\\repo'])
        assert.equal(broad(d), false, d);
    },
  ],
  [
    'Windows: Git’s folder for its bash, and PATH for sandboxed commands: Git’s programs from the mirror',
    () => {
      assert.equal(gitRoot('C:\\Program Files\\Git\\bin\\bash.exe'), 'C:\\Program Files\\Git');
      assert.equal(gitRoot('C:\\Program Files\\Git\\usr\\bin\\bash.exe'), 'C:\\Program Files\\Git');
      assert.equal(gitRoot('D:\\Tools\\PortableGit\\bin\\bash.exe'), 'D:\\Tools\\PortableGit');
      const mirror = 'C:\\Users\\Ana\\AppData\\Local\\Hydor\\sandbox\\msys-0123456789';
      const before = ['C:\\Windows\\system32', 'C:\\Program Files\\Git\\cmd', 'c:\\program files\\git\\usr\\bin\\', 'C:\\Program Files\\Git\\bin', 'C:\\Program Files\\Git\\mingw64\\bin', 'C:\\Program Files\\Git2\\usr\\bin', 'C:\\Program Files\\nodejs'].join(';');
      assert.equal(
        mirrorPath(before, 'C:\\Program Files\\Git', mirror),
        ['C:\\Windows\\system32', 'C:\\Program Files\\Git\\mingw64\\bin', `${mirror}\\usr\\bin`, `${mirror}\\usr\\bin`, 'C:\\Program Files\\Git\\mingw64\\bin', 'C:\\Program Files\\Git2\\usr\\bin', 'C:\\Program Files\\nodejs'].join(';'),
        'bash and its programs from the mirror, git without its launcher, other folders as they are',
      );
    },
  ],
  [
    'the walls, as each system words them',
    () => {
      assert.equal(wallsHit('touch: cannot touch \'/home/a/x\': Read-only file system', 'linux'), true);
      assert.equal(wallsHit('bash: /Users/a/x: Operation not permitted', 'darwin'), true);
      assert.equal(wallsHit('bash: /c/Users/a/x: Permission denied', 'win32'), true);
      assert.equal(wallsHit("Error: EPERM: operation not permitted, open 'C:\\Users\\a\\x'", 'win32'), true);
      assert.equal(wallsHit('all good', 'darwin'), false);
      assert.equal(wallsHit('bash: /x: Operation not permitted', 'linux'), false, 'each system its own words');
    },
  ],
  [
    'no network, as a Mac words it',
    () => {
      assert.equal(netRefused('curl: (6) Could not resolve host: example.com'), true);
      assert.equal(netRefused('getaddrinfo ENOTFOUND example.com'), true);
      assert.equal(netRefused('nodename nor servname provided, or not known'), true);
      assert.equal(netRefused('bash: connect: Operation not permitted'), true);
      assert.equal(netRefused('all good'), false);
    },
  ],
];

let passed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    console.log(`FAIL ${name}\n${(e as Error).stack}`);
    process.exitCode = 1;
  }
}
console.log(`\n${passed}/${tests.length} passed`);
process.exit(process.exitCode ?? 0);
