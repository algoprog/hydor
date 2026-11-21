// The app's own single lowercase words that words.ts returns as strings ("holds", "paused"): the extract script finds a
// single lowercase word only as an element's text, so they are written out as JSX here, and a screen draws any phrase from
// words.ts through say(): the word, as a node the dictionary translates, or the phrase as it is.
import type { ReactNode } from 'react';

const WORDS: Record<string, ReactNode> = {
  paused: <>paused</>,
  reached: <>reached</>,
  stopped: <>stopped</>,
  pass: <>pass</>,
  you: <>you</>,
  holds: <>holds</>,
  fails: <>fails</>,
};

export const say = (s: string): ReactNode => (Object.hasOwn(WORDS, s) ? WORDS[s] : s);
