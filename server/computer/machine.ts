// What each system's computer use does (mac.ts, windows.ts, linux.ts): see the main display, take the driver's steps
// (plan.ts's Op), open an app by its name, and say what keeps it from working there.
import type { DriverOut } from './driver.ts';
import type { Geometry, Op } from './plan.ts';

export interface Shot {
  jpeg: Buffer;
  geo: Geometry;
  /** The app in front and its window's title, the pointer (where the driver places it) and how many displays there are. */
  app?: string;
  window?: string;
  pos?: { x: number; y: number };
  displays?: number;
}

export interface Machine {
  /** The main display, scaled down to MAX_SIDE on its longer side, as a JPEG; and where it is. */
  screenshot(signal?: AbortSignal): Promise<Shot>;
  /** Takes the driver's steps; `started` is called as they go to the driver (the overlay's timeline starts then). */
  drive(ops: Op[], signal?: AbortSignal, started?: () => void): Promise<DriverOut>;
  /** Opens (or brings forward) an app by its name; returns the name of what it opened, when that is known. */
  openApp(name: string, signal?: AbortSignal): Promise<string | void>;
  /** What keeps computer use from working here now, in words for the user and the agent; null when nothing does. */
  problem?(): Promise<string | null>;
  /** Whether the desktop app may show its glow (Linux: only with a compositor, or see-through windows show black). */
  glow?(): boolean;
}
