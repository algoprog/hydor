// A scratch folder with a data file, and a way to run tt in it.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const cli = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli.mjs');

export function workspace(data = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-test-'));
  const file = path.join(dir, 'timesheet.json');
  const base = { timeZone: 'Europe/Athens', currency: 'EUR', rates: { acme: 9000, globex: 7550 }, entries: [] };
  fs.writeFileSync(file, JSON.stringify({ ...base, ...data }));
  return {
    dir,
    file,
    // Runs tt with the arguments; returns { code, stdout, stderr }.
    tt(...args) {
      const r = spawnSync(process.execPath, [cli, ...args], { cwd: dir, encoding: 'utf8' });
      return { code: r.status, stdout: r.stdout, stderr: r.stderr };
    },
    read: () => JSON.parse(fs.readFileSync(file, 'utf8')),
    write: (name, text) => fs.writeFileSync(path.join(dir, name), text),
  };
}
