// The app as a systemd service of your user: its unit and its settings file. Installs from before the
// rename keep their agent-console unit and settings file. Used by the CLI (service install) and by
// Settings → General (start when this computer starts).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const UNIT_DIR = path.join(os.homedir(), '.config/systemd/user');
/** hydor.service, or an older install's unit (Naget Agent's, then Agent Console's) where one is there. */
export const UNIT = ['hydor.service', 'naget-agent.service', 'agent-console.service'].find((u) => fs.existsSync(path.join(UNIT_DIR, u))) ?? 'hydor.service';
export const UNIT_PATH = path.join(UNIT_DIR, UNIT);
export const ENV_FILE =
  [path.join(os.homedir(), '.config/hydor.env'), path.join(os.homedir(), '.config/naget-agent.env'), path.join(os.homedir(), '.config/agent-console.env')].find((f) => fs.existsSync(f)) ??
  path.join(os.homedir(), '.config/hydor.env');

/** The unit that runs the app in `root` with this Node. */
export function unitText(root: string): string {
  return `[Unit]
Description=Hydor
After=network-online.target

[Service]
WorkingDirectory=${root}
Environment=NODE_ENV=production
# PORT, HOST, DATA_DIR, ALLOWED_ORIGINS and the like, one per line (optional).
EnvironmentFile=-${ENV_FILE}
ExecStart=${process.execPath} ${path.join(root, 'dist/server/index.js')}
Restart=on-failure
# Live agents run in their own processes and must outlive restarts of the web server.
KillMode=process

[Install]
WantedBy=default.target
`;
}
