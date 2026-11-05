// Computer use on Windows: windows-helper.cs runs while an agent uses the PC, one request per line (helper.ts). The
// desktop app ships it built, as bin/hydor-computer.exe beside the server (desktop/scripts/stage.sh builds it with the
// C# compiler Windows has); without that (developing), PowerShell compiles the same file as it starts. It sees the
// main display (a copy of the screen, scaled down and made a JPEG), uses the mouse and keyboard with SendInput, in the
// screen's own pixels, and opens apps by their names in the Start menu. The app's glow is hidden while the helper
// looks: Windows' copy of the screen took it in, though its windows ask to be left out of captures.
import fs from 'node:fs';
import path from 'node:path';
import { APP_ROOT } from '../config.ts';
import type { DriverOut } from './driver.ts';
import { withoutGlow } from './glow.ts';
import { Helper } from './helper.ts';
import type { Machine, Shot } from './machine.ts';
import { driverTimeout, jpegSize, MAX_SIDE, type Op } from './plan.ts';

const SOURCE = path.join(APP_ROOT, 'server/computer/windows-helper.cs');
/** The helper built with the app: in its bin folder, beside the server's. */
const BUILT = [path.resolve(APP_ROOT, '..', 'bin', 'hydor-computer.exe'), path.join(APP_ROOT, 'bin', 'hydor-computer.exe')];

function command(): { cmd: string; args: string[] } {
  // HYDOR_COMPUTER_HELPER: a built helper elsewhere (the desktop workflow's test of the one it just built).
  const exe = [process.env.HYDOR_COMPUTER_HELPER, ...BUILT].find((f) => f && fs.existsSync(f));
  if (exe) return { cmd: exe, args: [] };
  const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const quoted = (s: string) => `'${s.replace(/'/g, "''")}'`;
  // No double quotes: the line reaches PowerShell as one argument.
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "if ($ExecutionContext.SessionState.LanguageMode -ne 'FullLanguage') { [Console]::Error.WriteLine('PowerShell runs in ' + $ExecutionContext.SessionState.LanguageMode + ' on this PC (a policy), where it cannot use the mouse and keyboard'); exit 3 }",
    `Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition ([IO.File]::ReadAllText(${quoted(SOURCE)}))`,
    '[HydorComputer]::Run()',
  ].join('; ');
  return { cmd: powershell, args: ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script] };
}

const helper = new Helper({ name: 'The Windows helper', command, startMs: 60_000 });

type Place = { x: number; y: number; w: number; h: number };

async function drive(ops: Op[], signal?: AbortSignal, started?: () => void): Promise<DriverOut> {
  return (await helper.call({ ops }, { signal, timeoutMs: driverTimeout(ops), sent: started })) as unknown as DriverOut;
}

async function screenshot(signal?: AbortSignal): Promise<Shot> {
  const r = await withoutGlow(() => helper.call({ shot: { max: MAX_SIDE, quality: 70 } }, { signal, timeoutMs: 30_000 }));
  const jpeg = Buffer.from(String(r.jpeg ?? ''), 'base64');
  const size = jpegSize(jpeg);
  const d = r.display as Place | undefined;
  if (!size) throw new Error('the helper made no picture of the screen');
  if (!d || !(d.w > 0 && d.h > 0)) throw new Error('could not read the size of the main display');
  return {
    jpeg,
    geo: { width: size.width, height: size.height, x: d.x, y: d.y, w: d.w, h: d.h },
    app: typeof r.app === 'string' ? r.app : undefined,
    window: typeof r.window === 'string' ? r.window : undefined,
    pos: r.pos as Shot['pos'],
    displays: typeof r.displays === 'number' ? r.displays : undefined,
  };
}

async function openApp(name: string, signal?: AbortSignal): Promise<string | void> {
  const r = await helper.call({ open: name }, { signal, timeoutMs: 30_000 });
  return typeof r.app === 'string' && r.app ? r.app : undefined;
}

export const windowsMachine: Machine = { drive, screenshot, openApp };
