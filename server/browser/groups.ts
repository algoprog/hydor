// The groups of your own browsing's tabs (the tab column shows each as a header with its tabs under it): a name and a
// colour, folded or open. They are kept with the tabs for the next start (browsing.ts TABS_KEY), by place: a saved
// tab says which saved group it was in. A group with no tab left is gone. Nothing here sends anything anywhere; Group my
// tabs with AI (browsing.ts) sends titles and addresses to the helper model only when you press its button.
import crypto from 'node:crypto';
import { GROUP_COLORS, type BrowserGroup, type GroupColor } from '../../shared/browser.ts';
import { HttpError } from '../auth.ts';

export const MAX_GROUP_NAME = 40;
export const MAX_GROUPS = 20;

/** A group's name as kept: one line, no longer than the column can use. */
export const cleanGroupName = (v: unknown): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, MAX_GROUP_NAME) : '');

export const isGroupColor = (v: unknown): v is GroupColor => (GROUP_COLORS as readonly unknown[]).includes(v);

export class TabGroups {
  groups: BrowserGroup[] = [];
  /** A tab's id → its group's id. */
  private of = new Map<string, string>();

  groupOf(tab: string): string | undefined {
    return this.of.get(tab);
  }

  /** The groups that have a tab among `alive`, in the order they were made (a group with none is dropped). */
  list(alive: Iterable<string>): BrowserGroup[] {
    const used = new Set<string>();
    for (const t of alive) {
      const g = this.of.get(t);
      if (g) used.add(g);
    }
    this.groups = this.groups.filter((g) => used.has(g.id));
    return this.groups.map((g) => ({ ...g }));
  }

  /** A colour not in use yet (the first of them, else the one used least). */
  nextColor(): GroupColor {
    const count = (c: GroupColor) => this.groups.filter((g) => g.color === c).length;
    return [...GROUP_COLORS].filter((c) => c !== 'grey').sort((a, b) => count(a) - count(b))[0];
  }

  /** Makes a group of these tabs (taken from the groups they were in). */
  create(tabs: string[], o: { name?: unknown; color?: unknown; folded?: boolean; id?: string } = {}): BrowserGroup {
    if (this.groups.length >= MAX_GROUPS) throw new HttpError(409, `There can be ${MAX_GROUPS} groups: ungroup one first`);
    if (o.color !== undefined && !isGroupColor(o.color)) throw new HttpError(400, `The colour should be one of: ${GROUP_COLORS.join(', ')}`);
    const g: BrowserGroup = { id: o.id ?? crypto.randomBytes(4).toString('hex'), name: cleanGroupName(o.name), color: (o.color as GroupColor | undefined) ?? this.nextColor(), ...(o.folded ? { folded: true } : {}) };
    this.groups.push(g);
    this.put(tabs, g.id);
    return g;
  }

  find(id: string): BrowserGroup {
    const g = this.groups.find((x) => x.id === id);
    if (!g) throw new HttpError(404, 'No such group');
    return g;
  }

  update(id: string, patch: { name?: unknown; color?: unknown; folded?: unknown }): BrowserGroup {
    const g = this.find(id);
    if (patch.name !== undefined) {
      if (typeof patch.name !== 'string') throw new HttpError(400, 'The name should be text');
      g.name = cleanGroupName(patch.name);
    }
    if (patch.color !== undefined) {
      if (!isGroupColor(patch.color)) throw new HttpError(400, `The colour should be one of: ${GROUP_COLORS.join(', ')}`);
      g.color = patch.color;
    }
    if (patch.folded !== undefined) {
      if (typeof patch.folded !== 'boolean') throw new HttpError(400, 'folded should be true or false');
      if (patch.folded) g.folded = true;
      else delete g.folded;
    }
    return g;
  }

  /** Puts tabs in a group (taking them out of the one they were in), or in none (`null`). */
  put(tabs: string[], group: string | null) {
    if (group !== null) this.find(group);
    for (const t of tabs) {
      if (group === null) this.of.delete(t);
      else this.of.set(t, group);
    }
  }

  /** Takes a group apart: its tabs stay, in no group. The tabs it had. */
  ungroup(id: string): string[] {
    const mine = this.tabsOf(id);
    this.find(id);
    for (const t of mine) this.of.delete(t);
    this.groups = this.groups.filter((g) => g.id !== id);
    return mine;
  }

  tabsOf(id: string): string[] {
    return [...this.of].filter(([, g]) => g === id).map(([t]) => t);
  }

  /** A tab that closed. */
  forget(tab: string) {
    this.of.delete(tab);
  }

  /** The whole state, to put back (Undo of Group my tabs). */
  snapshot(): { groups: BrowserGroup[]; of: Record<string, string> } {
    return { groups: this.groups.map((g) => ({ ...g })), of: Object.fromEntries(this.of) };
  }

  /** Puts a snapshot back, for the tabs still open (`alive`). */
  restore(s: { groups: BrowserGroup[]; of: Record<string, string> }, alive: Set<string>) {
    this.groups = s.groups.map((g) => ({ ...g }));
    this.of = new Map(Object.entries(s.of).filter(([t, g]) => alive.has(t) && this.groups.some((x) => x.id === g)));
  }
}

/** What the helper model answered, checked: groups of ids of the tabs asked about, each tab in at most one, at least two tabs in a group. */
export function checkProposal(raw: unknown, known: Set<string>): { name: string; color: GroupColor | undefined; tabs: string[] }[] {
  const list = Array.isArray((raw as { groups?: unknown })?.groups) ? (raw as { groups: unknown[] }).groups : [];
  const taken = new Set<string>();
  const out: { name: string; color: GroupColor | undefined; tabs: string[] }[] = [];
  for (const g of list) {
    if (!g || typeof g !== 'object') continue;
    const o = g as { name?: unknown; color?: unknown; tabs?: unknown };
    const tabs = (Array.isArray(o.tabs) ? o.tabs : []).map(String).filter((t) => known.has(t) && !taken.has(t));
    const unique = [...new Set(tabs)];
    if (unique.length < 2) continue;
    for (const t of unique) taken.add(t);
    out.push({ name: cleanGroupName(o.name), color: isGroupColor(o.color) ? o.color : undefined, tabs: unique });
    if (out.length >= MAX_GROUPS) break;
  }
  return out;
}
