// The app's guide (docs/guide/NN-<topic>.md): every feature, described for the people using it. The Help page
// shows it, the search box finds its sections, and agents read it (app_guide) to answer questions about the
// app. A topic is one file: `# Title`, a paragraph that sums it up, then `## ` sections (with `### ` parts).
// Section ids are the headings as GitHub makes them, the same the page's Markdown gives its headings, so a
// link to /guide/<topic>#<section> lands.

export interface GuideSection {
  /** The heading as an id ("make-a-space"). */
  id: string;
  title: string;
  /** Its Markdown, its `### ` parts included, without its own heading. */
  text: string;
}

export interface GuideTopic {
  /** The file's name without its number ("spaces"). */
  id: string;
  title: string;
  /** The paragraph under the title. */
  summary: string;
  /** Everything under the title (the summary and the sections), as the page shows it. */
  body: string;
  sections: GuideSection[];
}

/** GET /api/guide. */
export interface GuideResponse {
  topics: GuideTopic[];
}

/** Topics shown to agents and in search, but not in the page's contents up front (the API, for agents). */
export const AGENT_TOPICS = ['api'];

/** A heading's words without Markdown: `**Bold**`, `code`, [links](…). */
export const plainHeading = (h: string) =>
  h
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~]/g, '')
    .trim();

/** As GitHub (and the page's Markdown) make a heading's id: lowercased, punctuation dropped, spaces to hyphens. */
export const headingId = (h: string) =>
  plainHeading(h)
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');

/** A topic's id from its file name: "04-spaces.md" → "spaces". */
export const topicId = (file: string) => file.replace(/\.md$/, '').replace(/^\d+-/, '');

/** One topic from its file. Headings inside code blocks are not headings. */
export function parseTopic(file: string, md: string): GuideTopic {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  let title = topicId(file);
  let start = 0;
  const first = lines.findIndex((l) => l.trim());
  if (first >= 0 && /^# /.test(lines[first])) {
    title = plainHeading(lines[first].slice(2));
    start = first + 1;
  }
  const body = lines.slice(start).join('\n').trim();
  const sections: GuideSection[] = [];
  const seen = new Map<string, number>();
  let fence = false;
  let cur: { id: string; title: string; lines: string[] } | null = null;
  const intro: string[] = [];
  for (const line of lines.slice(start)) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    const h = fence ? null : /^(#{2,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (h) {
      // Every heading counts for the ids, as on the page, where `### ` parts get theirs too.
      const base = headingId(h[2]);
      const n = seen.get(base) ?? 0;
      seen.set(base, n + 1);
      const id = n ? `${base}-${n}` : base;
      if (h[1].length === 2) {
        if (cur) sections.push({ id: cur.id, title: cur.title, text: cur.lines.join('\n').trim() });
        cur = { id, title: plainHeading(h[2]), lines: [] };
        continue;
      }
    }
    (cur ? cur.lines : intro).push(line);
  }
  if (cur) sections.push({ id: cur.id, title: cur.title, text: cur.lines.join('\n').trim() });
  const summary = intro.join('\n').trim().split(/\n\s*\n/)[0]?.replace(/\s+/g, ' ').trim() ?? '';
  return { id: topicId(file), title, summary, body, sections };
}

/** Markdown as plain words (for search and short texts). */
export const plainText = (md: string) =>
  md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__|[*`])/g, '')
    .replace(/^\s*(#+|>|-|\d+\.)\s+/gm, '')
    .replace(/[|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** What the search box reads for a section (and what its shipped vector is made of). */
export const sectionText = (t: Pick<GuideTopic, 'title'>, s: GuideSection) => `${s.title}. ${t.title}. ${plainText(s.text)}`.replace(/\s+/g, ' ').trim().slice(0, 400);
