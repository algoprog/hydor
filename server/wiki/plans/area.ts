// Where a project wiki keeps plans and the records of carrying them out, and who may change what.
//
// output/projects/ is the plans area. Only the plan tools (wiki_plan_adopt, wiki_plan_revise) create or change anything
// there: they show the exact text and ask, keep every earlier revision, and run under the wiki's write lock. No generic
// write (wiki_write) can create or change a file in it, whatever the file is called or whether it carries a header.
//
// output/evidence/ is the one place under output/ that wiki_write can write: for the records of carrying a plan out
// (what was done, deployed, accepted, with evidence or blockers). Nothing there is a plan, however it is headed: the
// plan tools never read it as one, and a file written there with a plan's header is refused.

/** The folder of plans (and nothing else), relative to a wiki's folder. */
export const PLANS_AREA = 'output/projects';
/** The folder for execution evidence, relative to a wiki's folder. */
export const EVIDENCE_AREA = 'output/evidence';

/** A wiki-relative path as the file system would read it: slashes, no `.`/`..` parts, no empty parts, in lower case. Null when it is not one. */
function plain(relative: string): string[] | null {
  if (typeof relative !== 'string' || /[\0]/.test(relative)) return null;
  const parts: string[] = [];
  for (const part of relative.replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') { if (!parts.pop()) return null; continue; }
    parts.push(part.trim().toLowerCase());
  }
  return parts;
}

/** Is this path (however it is written) in the plans area, or is it output/ itself or anything in it but the evidence folder? Those are for the plan tools. */
export function inPlansArea(relative: string): boolean {
  const parts = plain(relative);
  if (!parts) return true;
  if (parts[0] !== 'output') return false;
  return !(parts[1] === 'evidence' && parts.length >= 3);
}

/** Is this path a file in the evidence folder? */
export function inEvidenceArea(relative: string): boolean {
  const parts = plain(relative);
  return !!parts && parts[0] === 'output' && parts[1] === 'evidence' && parts.length >= 3;
}

/** The header of a document that says it is a plan (document_kind: plan), in the forms the revision workflow reads. */
export function claimsToBePlan(content: string): boolean {
  const frontmatter = /^\s*---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content)?.[1] ?? '';
  return /^\s*["']?document_kind["']?\s*:\s*["']?plan["']?\s*(?:#.*)?$/im.test(frontmatter);
}
