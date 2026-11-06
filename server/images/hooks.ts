// What the parts of server/images lend each other, set when each loads: the picture tools on this computer
// (local.ts) cut pictures out, erase parts of them and run plots' Python; the pictures made through OpenRouter
// (make.ts) change a picture as words say and clean drawings (SVG). So a picture asked for with a see-through
// background can be cut out here, a cutout without the local tools can go through OpenRouter, and a plot is drawn
// by Python and cleaned, without the files importing each other.
import type { EditImageAsk, LocalToolsState, PictureAnswer } from '../../shared/images.ts';
import type { DB } from '../db.ts';
import type { Reference } from './openrouter.ts';

/** What a run of Python left: whether it ended well, what it said, and the files it wrote in its folder. */
export interface PythonRun {
  ok: boolean;
  stdout: string;
  stderr: string;
  files: Record<string, Buffer>;
}

export interface LocalTools {
  state(): LocalToolsState;
  ready(): boolean;
  /** The picture (PNG, JPEG or WebP) with its background taken out: a PNG with see-through parts. */
  cutout(img: Buffer, signal?: AbortSignal): Promise<Buffer>;
  /** The picture with what is under the mask (white) erased and filled in from around it: a PNG. */
  erase(img: Buffer, mask: Buffer, signal?: AbortSignal): Promise<Buffer>;
  /**
   * Python code run in a folder of its own (with `files` written in it first), in the picture tools' Python when
   * they are set up, else a Python on this computer that has matplotlib; throws, in words a person can act on, when
   * there is none.
   */
  runPython(code: string, o: { cwd: string; timeoutMs: number; files?: Record<string, Buffer>; signal?: AbortSignal }): Promise<PythonRun>;
}

export interface CloudTools {
  /** A picture changed through OpenRouter as the words say (with a mask, only there: the answer may be `whole`). */
  edit(db: DB, ask: EditImageAsk & { refs?: Reference[] }, signal?: AbortSignal): Promise<PictureAnswer>;
  /** A drawing's SVG made safe to keep and show, or null when nothing safe is left of it. */
  cleanSvg(text: string): string | null;
}

let local: LocalTools | null = null;
let cloud: CloudTools | null = null;

export const setLocalTools = (t: LocalTools) => void (local = t);
export const localTools = (): LocalTools | null => local;
export const setCloudTools = (t: CloudTools) => void (cloud = t);
export const cloudTools = (): CloudTools | null => cloud;
