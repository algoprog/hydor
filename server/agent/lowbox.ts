// Custom's command sandbox on Windows: commands run at low integrity, Windows' own rule that a program at a lower
// level cannot change what belongs to a higher one. Files and folders are at medium (the user's level) unless marked
// otherwise, so a sandboxed command can read everything, but changes files only in folders given a low label (the
// session's folder, the repository's own folder) and in LocalLow, where the sandbox's temporary folder and package
// caches go. The network stays open, as with bubblewrap in Auto mode.
//
// A small helper does it: `hydor-lowbox.exe <program> <arguments>` lowers its own integrity level, then starts the
// program with the rest of its command line exactly as it was given (bash gets the same command line it would have
// had), and ends with its exit code; `--label <folder>` gives a folder a low label its files and subfolders inherit.
// It is compiled here at first use with the C# compiler of the .NET Framework that comes with Windows (C# 5), into
// the local app data folder (medium, so a sandboxed command cannot replace it). Without that compiler, or where the
// helper cannot run, there is no sandbox and commands run as before.
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SOURCE = String.raw`using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;

static class Lowbox {
  const uint TOKEN_QUERY = 0x0008, TOKEN_ADJUST_DEFAULT = 0x0080;
  const int TokenIntegrityLevel = 25;
  const uint SE_GROUP_INTEGRITY = 0x20;
  const uint STARTF_USESTDHANDLES = 0x100;
  const uint CREATE_NO_WINDOW = 0x08000000;
  const uint INFINITE = 0xFFFFFFFF;
  const int STD_INPUT_HANDLE = -10, STD_OUTPUT_HANDLE = -11, STD_ERROR_HANDLE = -12;
  const int SE_FILE_OBJECT = 1;
  const uint LABEL_SECURITY_INFORMATION = 0x10;
  const uint LOW = 0x1000;

  [StructLayout(LayoutKind.Sequential)] struct SID_AND_ATTRIBUTES { public IntPtr Sid; public uint Attributes; }
  [StructLayout(LayoutKind.Sequential)] struct TOKEN_MANDATORY_LABEL { public SID_AND_ATTRIBUTES Label; }
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] struct STARTUPINFO {
    public int cb; public string lpReserved; public string lpDesktop; public string lpTitle;
    public int dwX, dwY, dwXSize, dwYSize, dwXCountChars, dwYCountChars, dwFillAttribute;
    public uint dwFlags; public short wShowWindow; public short cbReserved2; public IntPtr lpReserved2;
    public IntPtr hStdInput, hStdOutput, hStdError;
  }
  [StructLayout(LayoutKind.Sequential)] struct PROCESS_INFORMATION { public IntPtr hProcess, hThread; public int dwProcessId, dwThreadId; }

  [DllImport("advapi32.dll", SetLastError = true)] static extern bool OpenProcessToken(IntPtr process, uint access, out IntPtr token);
  [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)] static extern bool ConvertStringSidToSid(string sid, out IntPtr psid);
  [DllImport("advapi32.dll")] static extern int GetLengthSid(IntPtr sid);
  [DllImport("advapi32.dll", SetLastError = true)] static extern bool SetTokenInformation(IntPtr token, int cls, ref TOKEN_MANDATORY_LABEL info, int len);
  [DllImport("advapi32.dll", SetLastError = true)] static extern bool GetTokenInformation(IntPtr token, int cls, IntPtr info, int len, out int returned);
  [DllImport("advapi32.dll")] static extern IntPtr GetSidSubAuthorityCount(IntPtr sid);
  [DllImport("advapi32.dll")] static extern IntPtr GetSidSubAuthority(IntPtr sid, uint n);
  [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)] static extern bool ConvertStringSecurityDescriptorToSecurityDescriptor(string sddl, uint revision, out IntPtr sd, out uint size);
  [DllImport("advapi32.dll", SetLastError = true)] static extern bool GetSecurityDescriptorSacl(IntPtr sd, out bool present, out IntPtr sacl, out bool defaulted);
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode)] static extern uint SetNamedSecurityInfo(string name, int type, uint info, IntPtr owner, IntPtr group, IntPtr dacl, IntPtr sacl);
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode)] static extern uint GetNamedSecurityInfo(string name, int type, uint info, IntPtr owner, IntPtr group, IntPtr dacl, out IntPtr sacl, out IntPtr sd);
  [DllImport("advapi32.dll", SetLastError = true)] static extern bool GetAce(IntPtr acl, int index, out IntPtr ace);
  [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
  [DllImport("kernel32.dll")] static extern IntPtr GetStdHandle(int n);
  [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)] static extern bool CreateProcess(string app, StringBuilder cmd, IntPtr pa, IntPtr ta, bool inherit, uint flags, IntPtr env, string dir, ref STARTUPINFO si, out PROCESS_INFORMATION pi);
  [DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr h, uint ms);
  [DllImport("kernel32.dll")] static extern bool GetExitCodeProcess(IntPtr h, out uint code);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr p);

  static int Main(string[] args) {
    try {
      if (args.Length == 2 && args[0] == "--label") return Label(args[1]);
      if (args.Length == 1 && args[0] == "--level") { Console.WriteLine(Level()); return 0; }
      if (args.Length == 0) { Console.Error.WriteLine("usage: hydor-lowbox <program> [arguments] | --label <folder> | --level"); return 125; }
      return Run(Rest(Environment.CommandLine));
    } catch (Exception e) {
      Console.Error.WriteLine("Hydor's sandbox: " + e.Message);
      return 125;
    }
  }

  // The command line after this program's own name, exactly as it was given.
  static string Rest(string line) {
    int i = 0;
    while (i < line.Length && char.IsWhiteSpace(line[i])) i++;
    if (i < line.Length && line[i] == '"') { int q = line.IndexOf('"', i + 1); i = q < 0 ? line.Length : q + 1; }
    while (i < line.Length && !char.IsWhiteSpace(line[i])) i++;
    while (i < line.Length && char.IsWhiteSpace(line[i])) i++;
    return line.Substring(i);
  }

  // This process's integrity level (0x1000 low, 0x2000 medium, 0x3000 high).
  static uint Level() {
    IntPtr token;
    if (!OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, out token)) throw new Win32Exception();
    try {
      int len;
      GetTokenInformation(token, TokenIntegrityLevel, IntPtr.Zero, 0, out len);
      IntPtr buf = Marshal.AllocHGlobal(len);
      try {
        if (!GetTokenInformation(token, TokenIntegrityLevel, buf, len, out len)) throw new Win32Exception();
        IntPtr sid = Marshal.ReadIntPtr(buf);
        int count = Marshal.ReadByte(GetSidSubAuthorityCount(sid));
        return (uint)Marshal.ReadInt32(GetSidSubAuthority(sid, (uint)(count - 1)));
      } finally { Marshal.FreeHGlobal(buf); }
    } finally { CloseHandle(token); }
  }

  // Lowers this process to low integrity: what it starts from now on is low too. Fails rather than run a command above it.
  static void Lower() {
    IntPtr token, sid;
    if (!OpenProcessToken(GetCurrentProcess(), TOKEN_ADJUST_DEFAULT | TOKEN_QUERY, out token)) throw new Win32Exception();
    try {
      if (!ConvertStringSidToSid("S-1-16-4096", out sid)) throw new Win32Exception();
      try {
        TOKEN_MANDATORY_LABEL tml = new TOKEN_MANDATORY_LABEL();
        tml.Label.Sid = sid;
        tml.Label.Attributes = SE_GROUP_INTEGRITY;
        if (!SetTokenInformation(token, TokenIntegrityLevel, ref tml, Marshal.SizeOf(typeof(TOKEN_MANDATORY_LABEL)) + GetLengthSid(sid))) throw new Win32Exception();
      } finally { LocalFree(sid); }
    } finally { CloseHandle(token); }
    if (Level() > LOW) throw new Exception("could not lower its integrity level");
  }

  static int Run(string command) {
    if (command.Length == 0) throw new Exception("no program to run");
    Lower();
    STARTUPINFO si = new STARTUPINFO();
    si.cb = Marshal.SizeOf(typeof(STARTUPINFO));
    si.dwFlags = STARTF_USESTDHANDLES;
    si.hStdInput = GetStdHandle(STD_INPUT_HANDLE);
    si.hStdOutput = GetStdHandle(STD_OUTPUT_HANDLE);
    si.hStdError = GetStdHandle(STD_ERROR_HANDLE);
    PROCESS_INFORMATION pi;
    if (!CreateProcess(null, new StringBuilder(command), IntPtr.Zero, IntPtr.Zero, true, CREATE_NO_WINDOW, IntPtr.Zero, null, ref si, out pi)) throw new Win32Exception();
    CloseHandle(pi.hThread);
    WaitForSingleObject(pi.hProcess, INFINITE);
    uint code;
    GetExitCodeProcess(pi.hProcess, out code);
    CloseHandle(pi.hProcess);
    return (int)code;
  }

  // Gives a folder a low label that its files and subfolders inherit (Windows passes it on to those already there).
  // Nothing to do when the folder has it already.
  static int Label(string dir) {
    if (HasLowLabel(dir)) return 0;
    IntPtr sd; uint size;
    if (!ConvertStringSecurityDescriptorToSecurityDescriptor("S:(ML;OICI;NW;;;LW)", 1, out sd, out size)) throw new Win32Exception();
    try {
      bool present, defaulted; IntPtr sacl;
      if (!GetSecurityDescriptorSacl(sd, out present, out sacl, out defaulted)) throw new Win32Exception();
      uint r = SetNamedSecurityInfo(dir, SE_FILE_OBJECT, LABEL_SECURITY_INFORMATION, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, sacl);
      if (r != 0) throw new Win32Exception((int)r);
    } finally { LocalFree(sd); }
    return HasLowLabel(dir) ? 0 : 1;
  }

  // Whether the folder's own label is low, passed on to files and subfolders (object and container inherit).
  static bool HasLowLabel(string dir) {
    IntPtr sacl, sd;
    if (GetNamedSecurityInfo(dir, SE_FILE_OBJECT, LABEL_SECURITY_INFORMATION, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, out sacl, out sd) != 0) return false;
    try {
      IntPtr ace;
      if (sacl == IntPtr.Zero || !GetAce(sacl, 0, out ace)) return false;
      byte type = Marshal.ReadByte(ace, 0), flags = Marshal.ReadByte(ace, 1);
      if (type != 0x11 || (flags & 0x3) != 0x3) return false;
      IntPtr sid = new IntPtr(ace.ToInt64() + 8);
      int count = Marshal.ReadByte(GetSidSubAuthorityCount(sid));
      return (uint)Marshal.ReadInt32(GetSidSubAuthority(sid, (uint)(count - 1))) == LOW;
    } finally { LocalFree(sd); }
  }
}
`;

const VERSION = crypto.createHash('sha256').update(SOURCE).digest('hex').slice(0, 12);

/** Where the helper goes: the local app data folder, which a command at low integrity cannot change. */
export function lowboxDir(): string {
  return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Hydor', 'sandbox');
}

/** The sandbox's own folder for temporary files and caches, in LocalLow (low already, so commands there can write). */
export function lowTemp(): string {
  return path.join(os.homedir(), 'AppData', 'LocalLow', 'Hydor');
}

function compiler(): string | null {
  const win = process.env.WINDIR || process.env.SystemRoot || 'C:\\Windows';
  for (const fw of ['Framework64', 'Framework']) {
    const p = path.join(win, 'Microsoft.NET', fw, 'v4.0.30319', 'csc.exe');
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/** The sandbox on Windows, once it runs here: the helper, and Git's bash as sandboxed commands reach it. */
export interface Lowbox {
  /** hydor-lowbox.exe. */
  exe: string;
  /** Git's bash in the sandbox's mirror of Git's programs (gitMirror). */
  bash: string;
  /** Git's folder (…\Git), and the mirror. */
  root: string;
  mirror: string;
}

let found: Lowbox | null | undefined;
let problem = '';

/** Why the sandbox is not there or does not run (for tests and diagnosis). */
export function lowboxProblem(): string {
  return problem;
}

/** Git's own folder for its bash: …\Git for …\Git\bin\bash.exe and …\Git\usr\bin\bash.exe. */
export function gitRoot(bash: string): string {
  const bin = path.win32.dirname(bash);
  const up = path.win32.dirname(bin);
  return path.win32.basename(up).toLowerCase() === 'usr' ? path.win32.dirname(up) : up;
}

/**
 * A PATH for sandboxed commands: Git's bash and its programs (…\Git\usr\bin, and …\Git\bin, whose bash only starts
 * that one) from the mirror; git itself straight from …\Git\mingw64\bin rather than …\Git\cmd, whose launcher puts the
 * original programs first again (git's hooks run its sh). Other folders stay as they are.
 */
export function mirrorPath(value: string, root: string, mirror: string): string {
  const r = root.toLowerCase().replace(/[\\/]+$/, '');
  const swap: Record<string, string> = {
    [`${r}\\usr\\bin`]: `${mirror}\\usr\\bin`,
    [`${r}\\bin`]: `${mirror}\\usr\\bin`,
    [`${r}\\cmd`]: `${root}\\mingw64\\bin`,
  };
  return value
    .split(';')
    .map((p) => swap[p.toLowerCase().replace(/[\\/]+$/, '')] ?? p)
    .join(';');
}

/**
 * Git's bash (MSYS2) keeps what its processes share in a folder of named objects keyed by where its DLL lies; the
 * user's ordinary bash made that folder at their own level, which a program at low integrity cannot use, so bash would
 * stop at once ("NtCreateDirectoryObject … access denied"). Sandboxed commands use a mirror of Git's programs instead:
 * …\Git\usr\bin in hard links (no room taken; copies where Git is on another drive), and Git's other folders through
 * junctions. MSYS sees another install there, with a folder of shared objects only sandboxed commands use. A mirror is
 * made once for each version of Git's DLL, and finished when its ready file is written.
 */
function gitMirror(bash: string): { bash: string; root: string; mirror: string } {
  const root = gitRoot(bash);
  const bin = path.join(root, 'usr', 'bin');
  const dll = fs.statSync(path.join(bin, 'msys-2.0.dll'));
  const mirror = path.join(lowboxDir(), `msys-${crypto.createHash('sha256').update(`${root.toLowerCase()}|${dll.size}|${dll.mtimeMs}`).digest('hex').slice(0, 10)}`);
  const ready = path.join(mirror, 'ready');
  if (!fs.existsSync(ready)) {
    const to = path.join(mirror, 'usr', 'bin');
    fs.mkdirSync(to, { recursive: true });
    const exists = (e: unknown) => (e as NodeJS.ErrnoException).code === 'EEXIST';
    for (const f of fs.readdirSync(bin, { withFileTypes: true })) {
      if (!f.isFile()) continue;
      try {
        fs.linkSync(path.join(bin, f.name), path.join(to, f.name));
      } catch (e) {
        if (!exists(e)) fs.copyFileSync(path.join(bin, f.name), path.join(to, f.name));
      }
    }
    for (const d of ['etc', 'mingw64', path.join('usr', 'share'), path.join('usr', 'lib'), path.join('usr', 'libexec')]) {
      if (!fs.existsSync(path.join(root, d))) continue;
      try {
        fs.symlinkSync(path.join(root, d), path.join(mirror, d), 'junction');
      } catch (e) {
        if (!exists(e)) throw e;
      }
    }
    fs.writeFileSync(ready, `${root}\n`);
  }
  return { bash: path.join(mirror, 'usr', 'bin', 'bash.exe'), root, mirror };
}

/** The environment's PATH for sandboxed commands (mirrorPath), under the key the environment spells it with. */
export function lowboxPath(env: NodeJS.ProcessEnv, box: Lowbox): Record<string, string> {
  const key = Object.keys(env).find((k) => k.toUpperCase() === 'PATH') ?? 'PATH';
  return { [key]: mirrorPath(env[key] ?? '', box.root, box.mirror) };
}

/** The sandbox once its helper is built and runs Git's bash at low integrity here (tried once). */
export function lowboxAvailable(bash: string | null): Lowbox | null {
  if (found !== undefined) return found;
  found = null;
  if (process.platform !== 'win32') return found;
  if (!bash) {
    problem = 'no bash (Git for Windows)';
    return found;
  }
  try {
    const dir = lowboxDir();
    const exe = path.join(dir, `hydor-lowbox-${VERSION}.exe`);
    if (!fs.existsSync(exe)) {
      const csc = compiler();
      if (!csc) {
        problem = 'no C# compiler of the .NET Framework';
        return found;
      }
      fs.mkdirSync(dir, { recursive: true });
      const tag = `${process.pid}-${Date.now()}`;
      const src = path.join(dir, `lowbox-${tag}.cs`);
      const out = path.join(dir, `lowbox-${tag}.exe`);
      fs.writeFileSync(src, SOURCE);
      const r = spawnSync(csc, ['/nologo', '/target:exe', '/optimize+', `/out:${out}`, src], { timeout: 60_000, windowsHide: true, encoding: 'utf8' });
      fs.rmSync(src, { force: true });
      if (r.status !== 0 || !fs.existsSync(out)) {
        problem = `the helper did not compile (${r.status ?? r.error?.message}): ${(r.stdout || r.stderr || '').slice(0, 2000)}`;
        return found;
      }
      try {
        fs.renameSync(out, exe);
      } catch {
        // Another process built it at the same moment.
        fs.rmSync(out, { force: true });
      }
    }
    const box = { exe, ...gitMirror(bash) };
    const tmp = path.join(lowTemp(), 'tmp');
    fs.mkdirSync(tmp, { recursive: true });
    // It must run bash at low integrity, and bash must start there.
    const r = spawnSync(exe, [box.bash, '-c', 'echo ok'], { timeout: 30_000, windowsHide: true, encoding: 'utf8', env: { ...process.env, ...lowboxPath(process.env, box), TMP: tmp, TEMP: tmp, TMPDIR: tmp } });
    if (r.status === 0 && r.stdout.trim() === 'ok') found = box;
    else problem = `bash did not run at low integrity (${r.status ?? r.error?.message}): ${`${r.stdout}${r.stderr}`.slice(0, 2000)}`;
  } catch (e) {
    problem = (e as Error).message;
  }
  return found;
}

/**
 * Folders a sandboxed command must never be let write all of: a drive, the home folder or one above it, Windows and
 * programs, and the app data folders (other programs' settings and data), but for folders inside the temporary one.
 */
export function tooBroad(dir: string, home = os.homedir(), tmp = os.tmpdir(), env: Record<string, string | undefined> = process.env): boolean {
  // Long names (Windows may give the temporary folder as C:\Users\RUNNER~1\…), lower case, no slash at the end.
  const norm = (p: string) => {
    let q = path.win32.resolve(p);
    try {
      q = fs.realpathSync.native(q);
    } catch {}
    return q.toLowerCase().replace(/[\\/]+$/, '');
  };
  const d = norm(dir);
  const inside = (parent: string) => d === parent || d.startsWith(parent + '\\');
  const h = norm(home);
  if (/^[a-z]:$/.test(d) || /^\\\\[^\\]+\\[^\\]+$/.test(d)) return true;
  if (h === d || h.startsWith(d + '\\')) return true;
  const t = norm(tmp);
  if (inside(norm(path.win32.join(home, 'AppData'))) && !d.startsWith(t + '\\')) return true;
  const system = [env.WINDIR, env.SystemRoot, env.ProgramFiles, env['ProgramFiles(x86)'], env.ProgramData].filter((x): x is string => !!x).map(norm);
  return system.some(inside);
}

const labelled = new Set<string>();

/** Gives a folder the low label sandboxed commands need to change files in it (once a process). False: it can't be, or must not. */
export function labelLow(exe: string, dir: string): boolean {
  const key = path.win32.resolve(dir).toLowerCase();
  if (labelled.has(key)) return true;
  if (tooBroad(dir)) return false;
  const r = spawnSync(exe, ['--label', dir], { timeout: 300_000, windowsHide: true, encoding: 'utf8' });
  if (r.status !== 0) return false;
  labelled.add(key);
  return true;
}
