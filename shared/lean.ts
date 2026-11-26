// Lean, the proof checker agents check mathematical proofs with (server/lean): how it stands on this computer, and
// what its tools answer.

/** About what setting Lean up downloads, in MB (Lean 4.36 for Linux, macOS or Windows: 610 to 650; about 3.2 GB once unpacked). */
export const LEAN_SIZE_MB = 620;
/** About what Mathlib, the library most mathematics needs, takes on disk with its built files, in MB. */
export const MATHLIB_SIZE_MB = 6000;

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
  mathlibSizeMb: number;
}

/** POST /api/lean/setup */
export interface LeanSetupAsk {
  /** Add Mathlib too (setting Lean up first when it is not there). */
  mathlib?: boolean;
}

/** One theorem lean_search found. */
export interface LeanHit {
  name: string;
  type: string;
  module: string;
  doc?: string;
}
