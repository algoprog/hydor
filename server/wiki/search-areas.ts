// Reading a wiki's areas for the search: `.structure/areas.json` (hidden: the wiki tools never list it, but the
// search reads it here), and an article's `areas:` front matter. Defensive: a wiki with no registry, or one that does
// not read as the registry's format, has no areas.
import fs from 'node:fs';
import path from 'node:path';
import { frontMatter } from './deliver.ts';
import { slugOf } from './sections.ts';

export interface AreaRec {
  id: string;
  name: string;
  about: string;
  parent: string | null;
  aliases: string[];
}

/** Where the registry is, relative to the wiki's folder. */
export const AREAS_FILE = '.structure/areas.json';

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/** A wiki's areas (the built-in "Other" last), or null when it keeps none. Never throws. */
export function readAreas(root: string): AreaRec[] | null {
  try {
    const file = path.join(root, ...AREAS_FILE.split('/'));
    const st = fs.lstatSync(file);
    if (!st.isFile() || st.size > 2 * 1024 * 1024) return null;
    const data = JSON.parse(fs.readFileSync(file, 'utf8')) as { areas?: unknown };
    if (!Array.isArray(data.areas)) return null;
    const out: AreaRec[] = [];
    for (const a of data.areas as Record<string, unknown>[]) {
      const id = str(a?.id);
      if (!id || out.some((x) => x.id === id)) continue;
      out.push({
        id,
        name: str(a.name) || id,
        about: str(a.about),
        parent: str(a.parent) || null,
        aliases: Array.isArray(a.aliases) ? a.aliases.map(str).filter(Boolean) : [],
      });
    }
    if (!out.length) return null;
    if (!out.some((a) => a.id === 'other')) out.push({ id: 'other', name: 'Other', about: 'Other: not yet placed in an area', parent: null, aliases: [] });
    return out;
  } catch {
    return null;
  }
}

const key = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * The ids an `area` input names: the area whose name, id or alias it is (case aside), and its sub-areas. Throws, listing
 * the areas, for a name none goes by.
 */
export function areaIds(areas: AreaRec[], name: string): Set<string> {
  const q = key(name);
  const hit = areas.filter((a) => key(a.id) === q || key(a.name) === q || a.aliases.some((x) => key(x) === q) || slugOf(a.name) === slugOf(q));
  if (!hit.length) throw new Error(`No area “${name.trim().slice(0, 80)}” in this wiki. Its areas: ${areas.map((a) => a.name).join(', ')}.`);
  const ids = new Set(hit.map((a) => a.id));
  // Sub-areas, two levels at most.
  for (const a of areas) if (a.parent && ids.has(a.parent)) ids.add(a.id);
  return ids;
}

/** What an article's front matter says about structure: a redirect stub, a hub (and its area), its areas. */
export interface Head {
  redirect: boolean;
  hub: boolean;
  hubArea: string;
  areas: string[];
}

const list = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v : (v ?? '').split(','))
    .map((x) => x.trim())
    .filter(Boolean);

export function headOfText(text: string): Head {
  const { fields } = frontMatter(text.slice(0, 16 * 1024));
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? (v[0] ?? '') : (v ?? '')).trim();
  return { redirect: !!one(fields.redirect), hub: one(fields.kind).toLowerCase() === 'hub', hubArea: one(fields.area), areas: list(fields.areas) };
}

/** The areas an article is in, as the registry knows them (the ones it does not know dropped; none left: other). */
export function areasOfHead(areas: AreaRec[], h: Head): string[] {
  if (h.hub) return h.hubArea && areas.some((a) => a.id === h.hubArea) ? [h.hubArea] : [];
  const known = h.areas.filter((id) => areas.some((a) => a.id === id));
  return known.length ? known : ['other'];
}

/** An area and the areas above it, for scoring a parent by what is in its sub-areas. */
export function withAncestors(areas: AreaRec[], ids: string[]): string[] {
  const out = new Set(ids);
  for (const id of ids) {
    const parent = areas.find((a) => a.id === id)?.parent;
    if (parent) out.add(parent);
  }
  return [...out];
}
