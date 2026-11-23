// The articles of a wiki as the areas see them: every active article under wiki/ (not hubs, not redirects), with
// its title, summary, headings, the areas its front matter names and a hash of its body (what changed since).
import { walkWiki } from '../browse.ts';
import { wikiHash } from '../core.ts';
import { areasOfArticle, frontValue, headingsOf, splitFront, summaryOf, titleOfArticle } from '../digest/write.ts';
import { isHubPath, OTHER, placedIn, type Area, type Registry } from './registry.ts';

export interface AreaArticle {
  path: string;
  title: string;
  summary: string;
  headings: string[];
  /** The ids its front matter names (as written: maybe unknown ones). */
  raw: string[];
  /** A short hash of its body: changes when what it says does. */
  hash: string;
  /** Its `updated:` date, when it has one. */
  updated: string;
  content: string;
  body: string;
}

/** Every article of the wiki (not a hub, not a redirect), by path. It walks wiki/ only, and reads each article once. */
export async function areaArticles(root: string): Promise<AreaArticle[]> {
  const out: AreaArticle[] = [];
  for (const a of (await walkWiki(root, ['articles'], true)).articles) {
    if (isHubPath(a.path)) continue;
    const f = splitFront(a.content);
    out.push({
      path: a.path,
      title: titleOfArticle(a.content, a.title),
      summary: summaryOf(a.content),
      headings: headingsOf(f.body),
      raw: areasOfArticle(a.content),
      hash: wikiHash(f.body.trim()).slice(0, 12),
      updated: frontValue(f, 'updated') ?? '',
      content: a.content,
      body: f.body,
    });
  }
  return out;
}

/** The articles in each area (an article in two areas is in both), by area id; every article is in one. */
export function membersByArea(articles: AreaArticle[], r: Registry): Map<string, AreaArticle[]> {
  const out = new Map<string, AreaArticle[]>(r.areas.map((a) => [a.id, []]));
  for (const a of articles) for (const id of placedIn(a.raw, r)) out.get(id)?.push(a);
  return out;
}

/** An area's articles with those of its sub-areas, each once. */
export function allMembers(r: Registry, members: Map<string, AreaArticle[]>, id: string): AreaArticle[] {
  const seen = new Map<string, AreaArticle>();
  for (const a of members.get(id) ?? []) seen.set(a.path, a);
  for (const c of r.areas.filter((x) => x.parent === id)) for (const a of members.get(c.id) ?? []) seen.set(a.path, a);
  return [...seen.values()];
}

/** The top-level areas with how many articles each holds (sub-areas counted in), Other last: `Name (n)`. */
export function areaCounts(r: Registry, members: Map<string, AreaArticle[]>): { area: Area; count: number }[] {
  return r.areas.filter((a) => !a.parent).map((area) => ({ area, count: allMembers(r, members, area.id).length })).filter((x) => x.count > 0 || x.area.id !== OTHER);
}

const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim();
export const clip = (s: string, n: number) => {
  const t = oneLine(s);
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
};

/** An article as the prompts show it: path, title, summary and headings, on a line or two. */
export function articleLine(a: AreaArticle, o: { areas?: string; headings?: number } = {}): string {
  const heads = a.headings.slice(0, o.headings ?? 6).map((h) => clip(h, 50));
  return `- ${a.path} · ${clip(a.title, 90)} · ${clip(a.summary, 160)}${heads.length ? ` · sections: ${heads.join('; ')}` : ''}${o.areas != null ? ` · areas: ${o.areas || '(none)'}` : ''}`;
}

/** An area as the prompts show it. */
export const areaLine = (a: Area, r?: Registry) => `- ${a.id} · ${clip(a.name, 60)} · ${clip(a.about, 160)}${a.parent && r ? ` · sub-area of ${a.parent}` : ''}`;
