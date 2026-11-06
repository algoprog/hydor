// The page editor's newer blocks (part of the editor: writing.ts hands it what it needs).
//
// Like the writing, the function runs in the browser: its source is sent as text, so it uses only its argument and the
// browser's own globals.
import type { Extra, ExtraCore } from './writing.ts';

export function writingBlocks(X: ExtraCore): Extra {
  void X;
  return {};
}
