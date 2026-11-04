// Small helpers Custom's tools share.
import path from 'node:path';
import os from 'node:os';

/** A path the model gave, from the session's folder (~ is the home folder). */
export const resolvePath = (cwd: string, p: unknown) => path.resolve(cwd, String(p ?? '.').replace(/^~(?=[\\/]|$)/, os.homedir()));

/** A path as the model is shown it: from the session's folder when inside it. */
export const relPath = (cwd: string, p: string) => (p.startsWith(cwd + path.sep) ? p.slice(cwd.length + 1) : p);

/** ACP content: text. */
export const textContent = (t: string) => [{ type: 'content', content: { type: 'text', text: t } }];

/** ACP content: a file's change. */
export const diffContent = (p: string, oldText: string | null, newText: string) => [{ type: 'diff', path: p, oldText, newText }];

/** Long output keeps its start and its end; the middle is cut. */
export function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  const head = Math.floor(max * 0.4);
  return `${s.slice(0, head)}\n\n… [${s.length - max} characters cut] …\n\n${s.slice(s.length - (max - head))}`;
}

export const isBinary = (b: Buffer) => b.subarray(0, 8000).includes(0);

/** Terminal colours and cursor moves, which only cost the model tokens; carriage-return progress keeps its last state. */
export const stripAnsi = (s: string) =>
  s
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, '')
    .replace(/\x1b[@-Z\\-_]/g, '')
    .replace(/^.*\r(?!\n)/gm, '');

/** What commands run with: no pagers, prompts or colours that would wait for a person or cost tokens. */
export const shellEnv = (): NodeJS.ProcessEnv => ({
  ...process.env,
  PAGER: 'cat',
  GIT_PAGER: 'cat',
  GIT_TERMINAL_PROMPT: '0',
  GIT_EDITOR: 'true',
  EDITOR: 'true',
  NO_COLOR: '1',
  FORCE_COLOR: '0',
  TERM: 'dumb',
  DEBIAN_FRONTEND: 'noninteractive',
  PIP_NO_INPUT: '1',
  npm_config_yes: 'true',
});
