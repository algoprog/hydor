// Lean, the proof checker agents check mathematical proofs with (server/lean): how it stands on this computer, and
// what its tools answer.

/** About what setting Lean up downloads, in MB (Lean 4.36 for Linux, macOS or Windows: 610 to 650; about 3.2 GB once unpacked). */
export const LEAN_SIZE_MB = 620;
/**
 * About what adding Mathlib, the library most mathematics needs, downloads, in MB: its built files (9,117 of them,
 * 480 MB) and the source it and its libraries are fetched from (Mathlib of Lean 4.36).
 */
export const MATHLIB_DOWNLOAD_MB = 600;
/** About what it takes on disk once unpacked, in MB (measured: 7.8 GB). */
export const MATHLIB_SIZE_MB = 7500;

export interface LeanState {
  /** `lake` and `lean` are there to use: yours, or the app's own. */
  ready: boolean;
  /** It is your own Lean, from your PATH, used as it is and never changed. */
  own: boolean;
  version?: string;
  /** Lean or Mathlib is being set up now. */
  installing: boolean;
  /** What the set-up is doing. */
  step?: string;
  /** Why the last set-up failed, with the last lines it printed. */
  error?: string;
  /** This computer can set Lean up. */
  canInstall: boolean;
  /** Why it cannot, in words. */
  why?: string;
  /** About how much setting Lean up downloads, in MB. */
  sizeMb: number;
  mathlib: 'none' | 'installing' | 'ready';
  /** About how much adding Mathlib downloads, in MB. */
  mathlibDownloadMb: number;
  /** About what Mathlib takes on disk, in MB. */
  mathlibSizeMb: number;
}

/** POST /api/lean/setup */
export interface LeanSetupAsk {
  /** Add Mathlib too (setting Lean up first when it is not there). */
  mathlib?: boolean;
}

/** The services lean_search asks. */
export type LeanService = 'Loogle' | 'LeanSearch';

/** One theorem lean_search found. */
export interface LeanHit {
  name: string;
  type: string;
  module: string;
  doc?: string;
  /** The service that gave it. */
  from: LeanService;
  /** Its page in Mathlib's documentation. */
  url?: string;
  /** Asked with confirm: whether the Lean and Mathlib installed here have the name. */
  here?: boolean;
}
