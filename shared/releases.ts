// Release notes: what changed in each version (CHANGELOG.md at the top of the repository), as the server reads
// them and the app shows them. Each version is a "## 0.6.1 · 31 October 2026" heading, a line that sums it up,
// and what follows.

export interface Release {
  version: string;
  date?: string;
  /** Its first paragraph. */
  summary: string;
  /** All of it, as Markdown. */
  notes: string;
}

export interface ReleasesResponse {
  /** The version running. */
  current: string;
  /** Newest first. */
  releases: Release[];
}

/** How two versions ("0.6.1", "0.10.0") compare: below 0 when `a` is older. */
export function compareVersions(a: string, b: string): number {
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  return 0;
}

const HEAD = /^## (\d+\.\d+\.\d+)(?:[ \t]+·[ \t]+(.+?))?[ \t]*$/gm;

/** The versions in a CHANGELOG.md, in the order written. */
export function parseReleases(md: string): Release[] {
  const heads = [...md.matchAll(HEAD)];
  return heads.map((m, i) => {
    const notes = md.slice(m.index! + m[0].length, i + 1 < heads.length ? heads[i + 1].index : md.length).trim();
    return { version: m[1], date: m[2]?.trim() || undefined, summary: notes.split(/\n[ \t]*\n/)[0].replace(/\s+/g, ' ').trim(), notes };
  });
}
