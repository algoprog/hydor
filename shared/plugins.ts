// Plugins, shared by the server and the pages. A plugin is a folder in the open Agent Plugins 1.0 format
// (agent-plugins.org): a plugin.json, skills in skills/ and MCP servers in mcp.json. Naget Agent reads
// Claude Code's plugin layout too (.claude-plugin/plugin.json, .mcp.json). What only this app does (other
// plugins and packages a plugin needs, files to download, keys, instructions for every agent) goes under
// the manifest's extension "com.naget.agent" and the folder of that name. Every agent the app runs gets an
// enabled plugin: Claude Code, Codex, Custom and the other ACP agents alike.

export const AGENT_PLUGINS_SCHEMA = 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json';
export const AGENT_PLUGINS_MCP_SCHEMA = 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json';
/** The manifest extension and folder this app reads (Agent Plugins §8). */
export const NAGET_EXT = 'com.naget.agent';

/** A plugin's name (Agent Plugins §5.5): lowercase letters, digits, dashes and dots, no -- or .., letters or digits at both ends. */
export function validPluginName(n: unknown): n is string {
  return typeof n === 'string' && /^[a-z0-9](?:[a-z0-9.-]{0,62}[a-z0-9])?$/.test(n) && !/--|\.\.|-\.|\.-/.test(n);
}

/** Which agents a plugin is for: Claude Code, Codex, Custom (the app's own agent) and the other ACP agents. */
export type PluginAgent = 'claude' | 'codex' | 'custom' | 'acp';
export const PLUGIN_AGENTS: PluginAgent[] = ['claude', 'codex', 'custom', 'acp'];

export interface PluginRequires {
  /** Other plugins it needs, with the versions it works with (a semver range: ^1.2, >=2, *). */
  plugins: { name: string; range: string }[];
  /** Node packages, installed in its own folder: name → version. */
  npm: Record<string, string>;
  /** Python packages, installed in its own environment ("pandas>=2.2,<3"). */
  pip: string[];
  /** The Python version for that environment (">=3.10"). */
  python?: string;
  /** Programs it needs on this computer (ffmpeg), with how to get them. */
  commands: { name: string; hint?: string; optional?: boolean }[];
  /** Files it downloads into its data folder, checked against their SHA-256 when given. */
  files: { url: string; path: string; sha256?: string; size?: number }[];
  /** Keys from the vault (Apps → Connected apps → Keys) its servers get in their environment, by name. */
  keys: { name: string; description?: string; optional?: boolean; url?: string }[];
}

export const noRequires = (): PluginRequires => ({ plugins: [], npm: {}, pip: [], commands: [], files: [], keys: [] });

export interface PluginSkillInfo {
  name: string;
  description: string;
  category?: string;
  /** Another skill of the same name that agents get in its place (the library's, or another plugin's). */
  shadowedBy?: string;
}

export interface PluginServerInfo {
  name: string;
  type: 'stdio' | 'streamable-http' | 'sse';
  /** What it runs, or where it is. */
  command?: string;
  args?: string[];
  url?: string;
  /** Why it is left out (an invalid entry, a transport agents cannot use). */
  problem?: string;
}

/**
 * Where an installed plugin comes from: the app (built in), a Git repository (it can update), a .zip file,
 * or a folder on this computer used in place (the plugins you make here live in one of those, and can be
 * edited in the app).
 */
export type PluginSource =
  | { kind: 'builtin' }
  | { kind: 'git'; url: string; ref?: string; subdir?: string; commit?: string }
  | { kind: 'file'; file: string }
  | { kind: 'folder'; path: string; mine?: boolean };

/** How a plugin's own setup stands: nothing to set up, setting up, ready, failed, or its needs changed since. */
export type SetupState = 'none' | 'installing' | 'ready' | 'failed' | 'outdated';

export interface PluginView {
  name: string;
  /** The name to show (the extension's title, else the name). */
  title: string;
  version?: string;
  description?: string;
  author?: string;
  homepage?: string;
  repository?: string;
  license?: string;
  keywords: string[];
  category?: string;
  icon?: string;
  /** Agent Plugins 1.0, or Claude Code's layout. */
  format: 'agent-plugins' | 'claude';
  source: PluginSource;
  installed: boolean;
  enabled: boolean;
  setup: { state: SetupState; error?: string; at?: number };
  skills: PluginSkillInfo[];
  servers: PluginServerInfo[];
  /** It adds instructions to every agent's own. */
  instructions: boolean;
  /** Its own files (in its files/ folder): data, templates, pictures its skills and tools use. */
  files: { name: string; bytes: number }[];
  /** Made here or used from a folder: it can be changed in the plugin editor. */
  editable: boolean;
  /** Parts only Claude Code has (commands, agents, hooks): left out here. */
  claudeOnly: string[];
  requires: PluginRequires;
  /** What it needs that is not here: programs, keys, plugins. */
  missing: { commands: string[]; keys: string[]; plugins: string[] };
  /** Installed plugins that need this one. */
  dependents: string[];
  agents: PluginAgent[];
  /** What is wrong in its folder: shown, never fatal unless it cannot load at all. */
  problems: string[];
  /** Its folder (PLUGIN_ROOT) and its data folder (PLUGIN_DATA). */
  root: string;
  data: string;
  installedAt?: number;
  /** Its README, for the details. */
  readme?: string;
}

export interface PluginJobStep {
  label: string;
  state: 'waiting' | 'running' | 'done' | 'failed';
}

/** Adding a plugin, setting it up again or updating it: what the page follows while it runs. */
export interface PluginJob {
  id: string;
  plugin: string;
  action: 'install' | 'setup' | 'update';
  state: 'running' | 'done' | 'failed';
  steps: PluginJobStep[];
  log: string;
  error?: string;
  startedAt: number;
  endedAt?: number;
}

export interface PluginList {
  installed: PluginView[];
  /** Built-in plugins not added yet. */
  available: PluginView[];
  jobs: PluginJob[];
  folders: { installed: string; data: string; mine: string };
}

/** A plugin as its editor shows and saves it (the plugins you make, and those used from a folder). */
export interface PluginDraft {
  name: string;
  title: string;
  version: string;
  description: string;
  category?: string;
  icon?: string;
  keywords: string[];
  /** For every agent, added to its own instructions. */
  instructions: string;
  /** Its skills, each a whole SKILL.md. */
  skills: { name: string; text: string }[];
  /** Its MCP servers, as mcp.json holds them: a command to start, or an address. */
  servers: ({ name: string; type: 'stdio'; command: string; args: string[]; env: Record<string, string> } | { name: string; type: 'streamable-http'; url: string; headers: Record<string, string> })[];
  requires: PluginRequires;
  /** Its own files (read only here: they are added and removed one at a time). */
  files: { name: string; bytes: number }[];
}

/** A plugin looked at before it is added (from a link, a file or a folder): what it is and needs. */
export interface PluginPreview {
  /** Hands the looked-at copy to the install. */
  token: string;
  view: PluginView;
  /** Other plugins it brings along (built in), and those it needs that cannot be found. */
  brings: string[];
  unavailable: string[];
  /** A plugin of the same name is installed: adding replaces it. */
  replaces?: string;
}

/** A file name for a plugin's own files: letters, digits, dots, dashes, underscores, spaces; folders by /. */
export const PLUGIN_FILE = /^(?!.*\.\.)(?!\/)[\w][\w .()+,-]*(?:\/[\w][\w .()+,-]*)*$/;
/** Largest own file, and all of them together. */
export const PLUGIN_FILE_LIMITS = { file: 50 << 20, total: 200 << 20 };

// ---- versions ------------------------------------------------------------------------------------

const parse = (v: string): number[] | null => {
  const m = /^v?(\d+)(?:\.(\d+|x|\*))?(?:\.(\d+|x|\*))?(?:[-+].*)?$/i.exec(v.trim());
  if (!m) return null;
  return [Number(m[1]), m[2] && !/x|\*/i.test(m[2]) ? Number(m[2]) : NaN, m[3] && !/x|\*/i.test(m[3]) ? Number(m[3]) : NaN];
};
const cmp = (a: number[], b: number[]) => (a[0] - b[0]) || ((a[1] || 0) - (b[1] || 0)) || ((a[2] || 0) - (b[2] || 0));

function one(version: number[], c: string): boolean {
  const m = /^(\^|~|>=|<=|>|<|=)?\s*(.+)$/.exec(c.trim());
  if (!m) return false;
  const op = m[1] ?? '';
  const want = parse(m[2]);
  if (!want) return false;
  const [maj, min, pat] = want;
  if (!op || op === '=') {
    // 1, 1.2, 1.x: any version starting so; 1.2.3: that one.
    if (Number.isNaN(min)) return version[0] === maj;
    if (Number.isNaN(pat)) return version[0] === maj && version[1] === min;
    return cmp(version, want) === 0;
  }
  const w = [maj, Number.isNaN(min) ? 0 : min, Number.isNaN(pat) ? 0 : pat];
  if (op === '>=') return cmp(version, w) >= 0;
  if (op === '>') return cmp(version, w) > 0;
  if (op === '<=') return cmp(version, w) <= 0;
  if (op === '<') return cmp(version, w) < 0;
  if (op === '~') return cmp(version, w) >= 0 && version[0] === w[0] && (Number.isNaN(min) || version[1] === w[1]);
  // ^: the same leftmost non-zero part.
  if (cmp(version, w) < 0) return false;
  if (w[0] > 0 || Number.isNaN(min)) return version[0] === w[0];
  if (w[1] > 0 || Number.isNaN(pat)) return version[0] === 0 && version[1] === w[1];
  return version[0] === 0 && version[1] === 0 && version[2] === w[2];
}

/** Whether a version is in a semver range: "^1.2", "~1.2.3", ">=2 <3", "1.x", "*", "a || b". No version only fits "*". */
export function satisfies(version: string | undefined, range: string): boolean {
  const r = (range || '*').trim();
  if (r === '*' || r === '' || r.toLowerCase() === 'latest') return true;
  const v = version ? parse(version) : null;
  if (!v || v.some((n) => Number.isNaN(n))) return false;
  return r.split('||').some((alt) => {
    const parts = alt.trim().replace(/(>=|<=|>|<|=|\^|~)\s+/g, '$1').split(/\s+/).filter(Boolean);
    return parts.length > 0 && parts.every((c) => one(v, c));
  });
}
