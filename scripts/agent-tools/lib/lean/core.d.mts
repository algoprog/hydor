// The types of core.mjs, for the server (which bundles it).

export interface Lean {
  lake: string;
  lean: string;
  /** Your own Lean, from your PATH; false: the app's. */
  own: boolean;
  env: Record<string, string>;
}
export interface Message {
  line: number;
  column: number;
  message: string;
  /** Another file than the one checked. */
  file?: string;
}
export interface Spot {
  line: number;
  column: number;
}
export interface Checked {
  ok: boolean;
  errors: Message[];
  warnings: Message[];
  info: Message[];
  sorries: Spot[];
  seconds: number;
}
export interface Theorem {
  name: string;
  axioms: string[];
  ok: boolean;
}
export interface Verdict {
  ok: boolean;
  why?: string;
  theorems: Theorem[];
  sorries: Spot[];
  errors?: Message[];
  note?: string;
  seconds: number;
}
export interface Ran {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  aborted: boolean;
  failed?: string;
}
export type Shell = (command: string) => { cmd: string; args: string[]; env?: Record<string, string> };
export interface RunOptions {
  cwd?: string;
  env?: Record<string, string | undefined>;
  timeoutMs?: number;
  signal?: AbortSignal;
  shell?: Shell;
  onLine?: (line: string) => void;
}
export interface CheckOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
  shell?: Shell;
  /** Mathlib's project, when it is set up. */
  mathlib?: string | null;
  /** A snippet of its own, never taken as part of a project around it. */
  snippet?: boolean;
}

export const STANDARD_AXIOMS: string[];
export const DEFAULT_TIMEOUT_MS: number;
export const NEEDS_MATHLIB: string;
export const AUDIT: string;
export function onPath(name: string, env: Record<string, string | undefined>): string | null;
export function appPaths(leanDir: string): { elan: string; bin: string; marker: string; mathlib: string; mathlibMarker: string; mathlibCache: string };
export function appEnv(leanDir: string, env: Record<string, string>): Record<string, string>;
export function findLean(env: Record<string, string>, leanDir?: string): Lean | null;
export function mathlibDir(leanDir?: string): string | null;
export function run(cmd: string, args: string[], o?: RunOptions): Promise<Ran>;
export function lastLines(r: { stdout: string; stderr: string }, n?: number): string;
export function stripLean(text: string): string;
export function scanLean(text: string): { sorries: Spot[]; imports: string[]; theorems: (Spot & { name: string })[]; skipsKernel: boolean };
export function needsMathlib(imports: string[]): boolean;
export function findProject(file: string): string | null;
export function readMessages(stdout: string, stderr?: string): { errors: Message[]; warnings: Message[]; info: Message[]; sorryWarnings: Spot[]; count: number };
export class LeanProblem extends Error {
  constructor(message: string, kind: string);
  kind: 'file' | 'mathlib' | 'lake';
}
export function checkFile(lean: Lean, file: string, o?: CheckOptions): Promise<Checked>;
export function verifyFile(lean: Lean, file: string, o?: CheckOptions & { theorems?: string[]; allowSorry?: boolean }): Promise<Verdict>;
