// The words picked in a document as the Rewrite menu takes them (slides/Rewrite.tsx): a paragraph (or a table's cell) a
// line, the paragraph they are in for the sense; the new words go in their place looking as the first of the old did,
// a line in each paragraph it stands for, as one change to undo (a suggestion while suggesting). An equation among them
// is not words to rewrite: the words around it are picked instead.
import { runsText } from '@shared/docs';
import type { RewriteTarget } from '../slides/Rewrite';
import type { DocEngine } from './engine';
import * as ops from './ops';

export function docsTarget(engine: DocEngine): RewriteTarget | null {
  const [s, e] = engine.range();
  if (ops.samePos(s, e)) return null;
  const doc = engine.doc;
  const boxes = ops.boxesIn(doc, s, e).filter((b) => b.to > b.from);
  if (!boxes.length) return null;
  const textOf = (d: typeof doc, b: (typeof boxes)[number]) => ops.textBetween(d, { b: b.b, ...(b.c ? { c: b.c } : {}), o: b.from }, { b: b.b, ...(b.c ? { c: b.c } : {}), o: b.to });
  // An equation is not words: it stays out of what is rewritten.
  const mathIn = boxes.some((b) => (ops.boxRuns(doc, b.b, b.c) ?? []).some((r, i, all) => r.math && runsLen(all.slice(0, i)) < b.to && runsLen(all.slice(0, i + 1)) > b.from));
  if (mathIn) return null;
  const texts = boxes.map((b) => textOf(doc, b));
  const around = runsText(ops.boxRuns(doc, boxes[0].b, boxes[0].c) ?? [])
    .replace(/\s+/g, ' ')
    .trim();
  const text = texts.join('\n');
  return {
    text,
    context: around.length > text.length + 10 ? `a document, in the paragraph “${around.slice(0, 400)}”` : 'a document',
    put(next) {
      if (boxes.some((b, k) => textOf(engine.doc, b) !== texts[k])) return false;
      const lines = next.split('\n');
      const list: ops.Found[] = boxes.map((b) => ({ b: b.b, ...(b.c ? { c: b.c } : {}), s: b.from, e: b.to }));
      // A line for each paragraph picked; when the answer has more or fewer, they go together in the first, the rest emptied.
      const each =
        lines.length === boxes.length
          ? lines
          : [
              lines
                .map((l) => l.trim())
                .filter(Boolean)
                .join(' '),
              ...boxes.slice(1).map(() => ''),
            ];
      const key = (f: ops.Found) => `${f.b}|${f.c?.join(',') ?? ''}|${f.s}`;
      const by = new Map(list.map((f, k) => [key(f), each[k]]));
      engine.replace(list, (f) => by.get(key(f)) ?? '');
      return true;
    },
  };
}

const runsLen = (runs: { t: string }[]) => runs.reduce((n, r) => n + r.t.length, 0);
