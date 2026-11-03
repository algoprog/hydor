// Writes hydor-mac.json, which each release carries: the version, and for each Mac processor its build's
// address, size and SHA-512. The app's updater (server/updates.ts) reads it from the newest release and checks
// the download against it.
//   node mac/scripts/feed.mjs <version> <folder with the .zip builds>  >  hydor-mac.json
// Settings (environment): GITHUB_REPOSITORY (owner/name; default algoprog/hydor)
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const [version, dir] = process.argv.slice(2);
if (!version || !dir) {
  console.error('usage: node feed.mjs <version> <folder with the .zip builds>');
  process.exit(2);
}
const repo = process.env.GITHUB_REPOSITORY || 'algoprog/hydor';
const files = {};
for (const name of fs.readdirSync(dir)) {
  const m = /^Hydor-(.+)-(arm64|x64)-mac\.zip$/.exec(name);
  if (!m) continue;
  if (m[1] !== version) throw new Error(`${name} is not version ${version}`);
  const buf = fs.readFileSync(path.join(dir, name));
  files[m[2]] = {
    url: `https://github.com/${repo}/releases/download/v${version}/${encodeURIComponent(name)}`,
    sha512: createHash('sha512').update(buf).digest('base64'),
    size: buf.length,
  };
}
if (!files.arm64 || !files.x64) throw new Error(`Both builds are needed (found: ${Object.keys(files).join(', ') || 'none'})`);
process.stdout.write(JSON.stringify({ version, date: new Date().toISOString(), files }, null, 2) + '\n');
