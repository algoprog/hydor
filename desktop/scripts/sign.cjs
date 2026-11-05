// Without a Developer ID, the Mac app is signed with Hydor's own certificate: a self-signed one, the same for every
// version (MAC_SELF_SIGNED_CERTIFICATE, a .p12 in base64, and MAC_SELF_SIGNED_CERTIFICATE_PASSWORD). macOS remembers the
// permissions people give an app (Accessibility, Screen Recording) by its signature's designated requirement, which a
// certificate makes "this identifier, signed with this certificate": every version meets it, so the permissions carry
// over from one version to the next. Without the certificate (a fork's build, say) it is signed ad hoc, whose
// requirement is the build's own hash: each version is then a new app to macOS, and computer use has to be allowed
// again after every update. Each program in it (Node.js, tmux, the native modules, the agents' bundled programs) is
// signed, then the app; Apple silicon runs nothing unsigned. Either way it is not notarized: people opening it the
// first time right-click it and choose Open.
const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
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

/**
 * Hydor's certificate in a keychain of its own, made for this build and gone after it: the identity to sign with (its
 * SHA-1), the keychain, and how to remove it. Null without the certificate.
 */
function identity() {
  const p12 = process.env.MAC_SELF_SIGNED_CERTIFICATE;
  if (!p12) {
    console.warn('[sign] No MAC_SELF_SIGNED_CERTIFICATE: signing ad hoc, so the permissions people give this version (Accessibility, Screen Recording) will not carry over to the next.');
    return null;
  }
  const security = (...args) => execFileSync('security', args, { encoding: 'utf8' });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-sign-'));
  const keychain = path.join(dir, 'hydor-sign.keychain-db');
  const password = crypto.randomBytes(24).toString('hex');
  const before = security('list-keychains', '-d', 'user')
    .split('\n')
    .map((l) => l.trim().replace(/^"|"$/g, ''))
    .filter(Boolean);
  const cleanup = () => {
    try {
      security('list-keychains', '-d', 'user', '-s', ...before);
    } catch {}
    try {
      security('delete-keychain', keychain);
    } catch {}
    fs.rmSync(dir, { recursive: true, force: true });
  };
  try {
    const file = path.join(dir, 'hydor.p12');
    fs.writeFileSync(file, Buffer.from(p12, 'base64'), { mode: 0o600 });
    security('create-keychain', '-p', password, keychain);
    security('set-keychain-settings', '-lut', '21600', keychain);
    security('unlock-keychain', '-p', password, keychain);
    security('import', file, '-k', keychain, '-f', 'pkcs12', '-P', process.env.MAC_SELF_SIGNED_CERTIFICATE_PASSWORD ?? '', '-T', '/usr/bin/codesign');
    // codesign may use the key without asking anyone.
    security('set-key-partition-list', '-S', 'apple-tool:,apple:,codesign:', '-s', '-k', password, keychain);
    security('list-keychains', '-d', 'user', '-s', keychain, ...before);
    // Not with -v: a self-signed certificate is not trusted (CSSMERR_TP_NOT_TRUSTED), which signing does not need.
    const hash = /^\s*\d+\)\s+([0-9A-F]{40})\s/m.exec(security('find-identity', '-p', 'codesigning', keychain))?.[1];
    if (!hash) throw new Error('MAC_SELF_SIGNED_CERTIFICATE holds no identity for signing code');
    return { hash, keychain, cleanup };
  } catch (e) {
    cleanup();
    throw e;
  }
}

exports.default = async function (ctx) {
  if (ctx.electronPlatformName !== 'darwin') return;
  const app = path.join(ctx.appOutDir, `${ctx.packager.appInfo.productFilename}.app`);
  const id = identity();
  const sign = (target, deep) => execFileSync('codesign', ['--force', ...(deep ? ['--deep'] : []), '--sign', id ? id.hash : '-', ...(id ? ['--keychain', id.keychain] : []), target], deep ? { stdio: 'inherit' } : {});
  try {
    for (const f of files(path.join(app, 'Contents/Resources'))) if (isMachO(f)) sign(f, false);
    sign(app, true);
    execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' });
    // What macOS knows the app by, and keeps its permissions for: with the certificate, its identifier and the certificate.
    const requirement = execFileSync('codesign', ['--display', '--requirements', '-', app], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    console.log(`[sign] ${requirement}`);
    if (id && !requirement.toLowerCase().includes(id.hash.toLowerCase())) throw new Error(`the app's designated requirement does not name Hydor's certificate: ${requirement}`);
  } finally {
    id?.cleanup();
  }
};
