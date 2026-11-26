// Where a finding's evidence opens (a finding: shared/findings.ts), worked out from its kind and ref alone, with no
// part of the page: a run, a score or a table in Experiments, a commit in the Git page's history, a file in the file
// viewer, a paper at its address, a session. What cannot be told apart stays plain text.
import type { FindingEvidence } from '@shared/findings';

export type EvidenceTarget =
  /** A page of the app. */
  | { type: 'page'; to: string }
  /** A file of the project, for the file viewer. */
  | { type: 'file'; path: string; line?: number }
  /** A page on the web. */
  | { type: 'web'; href: string };

const enc = encodeURIComponent;

/** A repository's history on the Git page, at a commit when one is named (as features/git/parts.tsx repoUrl). */
const history = (root: string, hash?: string) => `/git?${new URLSearchParams({ path: root, tab: 'history', ...(hash ? { c: hash } : {}) })}`;

/** `root`: the project's folder, where its files and commits are. */
export function evidenceTarget(e: FindingEvidence, root: string): EvidenceTarget | null {
  const ref = e.ref.trim();
  switch (e.kind) {
    case 'run': {
      const id = ref.replace(/^\/(?:system\/)?experiments\//, '');
      return /^[\w.-]+$/.test(id) ? { type: 'page', to: `/experiments/${enc(id)}` } : null;
    }
    case 'score': {
      const m = /^([\w.-]+)\/([\w.-]+)$/.exec(ref);
      return m ? { type: 'page', to: `/experiments?evaluation=${enc(m[1])}&score=${enc(m[2])}` } : null;
    }
    case 'table':
      return /^[\w.-]+$/.test(ref) ? { type: 'page', to: `/experiments?table=${enc(ref)}` } : null;
    case 'commit':
      // The history opens at a commit by its hash; by another name (a branch that was not resolved) it opens as it is.
      return root ? { type: 'page', to: history(root, /^[0-9a-f]{4,64}$/i.test(ref) ? ref : undefined) } : null;
    case 'file': {
      const m = /^(.*?)(?::(\d+)(?:-\d+)?)?$/.exec(ref)!;
      const absolute = m[1].startsWith('/') || /^[A-Za-z]:[\\/]/.test(m[1]) || m[1].startsWith('~');
      if (!m[1] || (!absolute && !root) || (!absolute && m[1].split('/').includes('..'))) return null;
      return { type: 'file', path: absolute ? m[1] : `${root.replace(/\/+$/, '')}/${m[1].replace(/^(\.\/)+/, '')}`, ...(m[2] ? { line: Number(m[2]) } : {}) };
    }
    case 'paper': {
      if (/^https?:\/\/\S+$/i.test(ref)) return { type: 'web', href: ref };
      const arxiv = /^(?:arxiv:\s*)?(\d{4}\.\d{4,5}(?:v\d+)?)$/i.exec(ref);
      if (arxiv) return { type: 'web', href: `https://arxiv.org/abs/${arxiv[1]}` };
      const doi = /^(?:doi:\s*)?(10\.\d{4,9}\/\S+)$/i.exec(ref);
      return doi ? { type: 'web', href: `https://doi.org/${doi[1]}` } : null;
    }
    case 'session':
      return /^[\w.-]+:[\w.:-]+$/.test(ref) ? { type: 'page', to: `/s/${enc(ref)}` } : null;
    default:
      return null;
  }
}

/** What a piece of evidence is called: its label, else its ref (a commit's hash cut short). */
export const evidenceName = (e: FindingEvidence) => e.label || (e.kind === 'commit' && /^[0-9a-f]{12,}$/i.test(e.ref) ? e.ref.slice(0, 7) : e.ref);
