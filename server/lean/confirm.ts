// Whether the names lean_search found are there in the Lean and Mathlib installed here (the services index a newer
// Mathlib, in which a lemma may have another name): one file that imports Mathlib and asks #check of each.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkFile, type CheckOptions, type Lean } from '../../scripts/agent-tools/lib/lean/core.mjs';
import type { LeanHit } from '../../shared/lean.ts';

/** A name as it can stand in a line of Lean, and nothing else: what a web service answers is never run as it is. */
const NAME = /^[\p{L}_][\p{L}\p{M}\p{N}_'!?]*(?:\.(?:[\p{L}\p{M}\p{N}_'!?]+|«[^»\s]*»))*$/u;

export const NO_MATHLIB =
  'The names were not checked against what is installed here: Mathlib is not set up (add it in Settings → General → Lean (proof checker) → Add Mathlib, or ask with lean_setup { mathlib: true }).';

/** Each hit with `here`, whether Lean finds its name; or why that could not be said, in a sentence. */
export async function confirmHere(lean: Lean, hits: LeanHit[], o: CheckOptions): Promise<{ hits: LeanHit[]; note?: string }> {
  if (!o.mathlib) return { hits, note: NO_MATHLIB };
  const asked = hits.filter((h) => NAME.test(h.name));
  if (!asked.length) return { hits };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-lean-names-'));
  const not = (why: string) => ({ hits, note: `The names could not be checked here: ${why}` });
  try {
    const file = path.join(dir, 'Names.lean');
    // One #check a line, from the third on: an error's line says which name it is about.
    fs.writeFileSync(file, `import Mathlib\n\n${asked.map((h) => `#check @${h.name}`).join('\n')}\n`);
    const x = await checkFile(lean, file, { ...o, snippet: true });
    // An error of any other kind, or none at all from a check that failed, leaves nothing to say about the names.
    const other = x.errors.find((e) => e.file || e.line < 3);
    if (other || (!x.ok && !x.errors.length)) return not(other?.message.split('\n')[0] ?? 'Lean did not finish.');
    const unknown = new Set(x.errors.map((e) => e.line));
    return { hits: hits.map((h) => (asked.includes(h) ? { ...h, here: !unknown.has(asked.indexOf(h) + 3) } : h)) };
  } catch (e) {
    return not((e as Error).message);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
