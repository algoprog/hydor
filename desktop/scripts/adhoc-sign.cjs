// Without a Developer ID, the app is signed ad hoc: each program in it (Node.js, tmux, the native modules, the
// agents' bundled programs), then the app. Apple silicon runs nothing unsigned, and the app's own updater
// (main.cjs) needs no more than this. People opening it the first time right-click it and choose Open (it is
// not notarized).
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const MACHO = new Set([0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe, 0xcafebabe, 0xbebafeca]);

function isMachO(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const b = Buffer.alloc(4);
    return fs.readSync(fd, b, 0, 4, 0) === 4 && MACHO.has(b.readUInt32BE(0));
  } finally {
    fs.closeSync(fd);
  }
}

function* files(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* files(p);
    else if (e.isFile()) yield p;
  }
}

exports.default = async function (ctx) {
  if (ctx.electronPlatformName !== 'darwin') return;
  const app = path.join(ctx.appOutDir, `${ctx.packager.appInfo.productFilename}.app`);
  for (const f of files(path.join(app, 'Contents/Resources'))) if (isMachO(f)) execFileSync('codesign', ['--force', '--sign', '-', f]);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
  execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' });
};
