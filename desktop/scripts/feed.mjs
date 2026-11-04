// Writes the update feeds each release carries, which the apps' updater (server/updates.ts) reads from the newest
// release: the version, and for each build its address, size and SHA-512, which the download is checked against.
//   hydor-mac.json      the Mac builds (.zip), by processor: arm64, x64
//   hydor-windows.json  the Windows installers (.exe), as nsis-<processor>
//   hydor-linux.json    the AppImages and the .deb packages, as appimage-<processor> and deb-<processor>
//   node desktop/scripts/feed.mjs <version> <folder with the builds> <mac|windows|linux>  >  hydor-<system>.json
// Settings (environment): GITHUB_REPOSITORY (owner/name; default algoprog/hydor)
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const [version, dir, system = 'mac'] = process.argv.slice(2);
if (!version || !dir || !['mac', 'windows', 'linux'].includes(system)) {
  console.error('usage: node feed.mjs <version> <folder with the builds> <mac|windows|linux>');
  process.exit(2);
}
const repo = process.env.GITHUB_REPOSITORY || 'algoprog/hydor';
/** electron-builder's names for the processors, in its Linux file names. */
const ARCH = { x86_64: 'x64', amd64: 'x64', x64: 'x64', arm64: 'arm64', aarch64: 'arm64' };
/** Each system's builds: a file name's version, processor and kind. */
const NAMES = {
  mac: [[/^Hydor-(.+)-(arm64|x64)-mac\.zip$/, () => '']],
  windows: [[/^Hydor-(.+)-(x64|arm64)-win\.exe$/, () => 'nsis-']],
  linux: [
    [/^Hydor-(.+)-(x86_64|arm64)\.AppImage$/, () => 'appimage-'],
    [/^Hydor-(.+)-(amd64|arm64)\.deb$/, () => 'deb-'],
  ],
};
const files = {};
for (const name of fs.readdirSync(dir)) {
  for (const [re, kind] of NAMES[system]) {
    const m = re.exec(name);
    if (!m) continue;
    if (m[1] !== version) throw new Error(`${name} is not version ${version}`);
    const buf = fs.readFileSync(path.join(dir, name));
    files[kind() + ARCH[m[2]]] = {
      url: `https://github.com/${repo}/releases/download/v${version}/${encodeURIComponent(name)}`,
      sha512: createHash('sha512').update(buf).digest('base64'),
      size: buf.length,
    };
  }
}
const needed = { mac: ['arm64', 'x64'], windows: ['nsis-x64'], linux: ['appimage-x64', 'appimage-arm64', 'deb-x64', 'deb-arm64'] }[system];
const missing = needed.filter((k) => !files[k]);
if (missing.length) throw new Error(`Builds missing for ${system}: ${missing.join(', ')} (found: ${Object.keys(files).join(', ') || 'none'})`);
process.stdout.write(JSON.stringify({ version, date: new Date().toISOString(), files }, null, 2) + '\n');
