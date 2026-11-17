// Derive the project's contract, template and execution overview directly from active wiki documents.
import path from 'node:path';
import { readWiki } from './core.ts';
import type { WikiEntry } from './browse.ts';
import { embeddedExecutionSections, executionRegisterDocument } from './plans/register.ts';

export interface WikiProgressEntry { path: string; title: string; description?: string; descriptionPath?: string; workItemId?: string; stage?: string; label: string; state: 'done' | 'open' | 'progress' | 'blocked' | 'unknown' }
type ProgressState = WikiProgressEntry['state'];

/** Map only complete, explicit values: mixed or unfamiliar values stay unknown. */
function stateOf(value: string): ProgressState {
  const v = value.trim().toLocaleLowerCase();
  if (['done', 'completed', 'complete', 'passed', 'erledigt', 'abgeschlossen', 'bestanden'].includes(v)) return 'done';
  if (['open', 'pending', 'not started', 'offen', 'ausstehend', 'nicht begonnen'].includes(v)) return 'open';
  if (['in progress', 'in arbeit', 'in bearbeitung'].includes(v)) return 'progress';
  if (['blocked', 'blockiert'].includes(v)) return 'blocked';
  return 'unknown';
}

/** Recognize the same stage across common English and German column names. */
function stageOf(header: string): string {
  const value = header.toLocaleLowerCase();
  if (/^(?:status|state|stand|fortschritt)$/.test(value)) return 'status';
  if (/^(?:implementation|implementierung|umsetzung)$/.test(value)) return 'implementation';
  if (/^(?:deployment|delivery|auslieferung)$/.test(value)) return 'deployment';
  if (/^(?:acceptance|abnahme)$/.test(value)) return 'acceptance';
  if (/^(?:test(?:ing)?|(?:lokale )?funktionsprüfung)$/.test(value)) return 'test';
  return value;
}

/** Exclude fenced Markdown examples from evidence and plan metadata. */
function outsideFences(text: string): string[] {
  let fence: { char: string; length: number } | null = null;
  return text.split(/\r?\n/).map((line) => {
    const marker = /^\s{0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      if (marker && marker[1][0] === fence.char && marker[1].length >= fence.length && !marker[2].trim()) fence = null;
      return '';
    }
    if (marker) { fence = { char: marker[1][0], length: marker[1].length }; return ''; }
    return line;
  });
}

/** Recognize explicit checklist, status-field and multi-stage table entries without guessing. */
export function progressOf(path: string, text: string, onTruncated?: () => void, onEntry?: (entry: WikiProgressEntry) => void): WikiProgressEntry[] {
  const out: WikiProgressEntry[] = [];
  // Inspect every source status for contradictions, even after the display limit is reached.
  const add = (entry: WikiProgressEntry) => { onEntry?.(entry); if (out.length < 200) out.push(entry); else onTruncated?.(); };
  const lines = outsideFences(text);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const check = /^\s*[-*]\s+\[([ xX])\]\s+(.+?)\s*$/.exec(line);
    const field = /^\s*[-*]\s+(.+?)\s*:\s*(done|completed|open|pending|in progress|blocked|erledigt|abgeschlossen|bestanden|offen|in arbeit|blockiert)\s*$/i.exec(line);
    if (check) add({ path, title: check[2], label: `[${check[1]}]`, state: check[1] === ' ' ? 'open' : 'done' });
    else if (field) add({ path, title: field[1], label: field[2], state: stateOf(field[2]) });
    // Work-item tables preserve implementation, delivery and acceptance as separate entries.
    if (!/^\s*\|/.test(line) || !/^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] ?? '')) continue;
    const cells = (v: string) => v.trim().replace(/^\||\|$/g, '').split('|').map((x) => x.trim());
    const headers = cells(line);
    const columns = headers.map((header, index) => ({ header, index })).filter(({ header }) => /^(?:status|state|stand|fortschritt|implementation|deployment|delivery|acceptance|test(?:ing)?|implementierung|umsetzung|auslieferung|abnahme|(?:lokale )?funktionsprüfung)$/i.test(header));
    if (!columns.length) continue;
    // Use explicitly labelled task and description columns; never invent a description.
    const taskIndex = headers.findIndex((header) => /^(?:task|title|name|aufgabe|titel|arbeitspaket)$/i.test(header));
    const idIndex = headers.findIndex((header) => /^(?:id|work item|work-item|workitem|arbeitspaket-id)$/i.test(header));
    const descriptionIndex = headers.findIndex((header) => /^(?:description|details?|beschreibung|erläuterung|erlaeuterung)$/i.test(header));
    i++;
    while (i + 1 < lines.length && /^\s*\|/.test(lines[i + 1])) {
      const row = cells(lines[++i]);
      if (row.length !== headers.length || !row[0] || /[\[\]`]/.test(row[0])) continue;
      for (const column of columns) {
        const value = row[column.index];
        if (!value) continue;
        const task = (taskIndex >= 0 && row[taskIndex]) || row[0];
        const description = descriptionIndex >= 0 ? row[descriptionIndex] : '';
        // A generic status column does not add meaning to the task name.
        const title = /^(?:status|state|stand|fortschritt)$/i.test(column.header) ? task : `${task} · ${column.header}`;
        const workItemId = idIndex >= 0 ? row[idIndex] : row[0];
        add({ path, title, stage: stageOf(column.header), ...(workItemId ? { workItemId } : {}), ...(description ? { description } : {}), label: value, state: stateOf(value) });
      }
    }
  }
  return out.length ? out : [{ path, title: path.split('/').at(-1) ?? path, label: 'Unknown', state: 'unknown' }];
}

/** Read a bounded scalar for display without treating it as verified approval. */
function scalar(front: string, key: string): string | undefined {
  const line = new RegExp(`^\\s*["']?${key}["']?\\s*:\\s*(.+?)\\s*$`, 'im').exec(front)?.[1];
  if (!line) return undefined;
  if (line.startsWith('"')) { try { const value: unknown = JSON.parse(line); return typeof value === 'string' ? value.slice(0, 500) : undefined; } catch { return undefined; } }
  return line.replace(/^'|'$/g, '').slice(0, 500);
}

/** Match a status only to the same exact initiative, work item and status category. */
function stageKey(entry: WikiProgressEntry): string | null {
  const scope = /^output\/(?:projects|evidence)\/(.+)\/[^/]+$/i.exec(entry.path)?.[1];
  return scope && entry.workItemId && entry.stage ? `${scope}\0${entry.workItemId}\0${entry.stage}` : null;
}

/** Use the existing bounded browser's active, safe paths; read errors remain visible. */
export function wikiOverview(root: string, articles: WikiEntry[], plans: WikiEntry[]) {
  const contracts: WikiEntry[] = [], contractCandidates: WikiEntry[] = [], templates: WikiEntry[] = [], progress: WikiProgressEntry[] = [];
  let unreadable = false, progressTruncated = false;
  // Reuse the exact document bytes read for the view when resolving its links and plan descriptions.
  const contents = new Map<string, string>();
  const markProgressTruncated = () => { progressTruncated = true; };
  const allStates = new Map<string, Set<ProgressState>>();
  const observeStatus = (entry: WikiProgressEntry) => {
    const key = stageKey(entry);
    if (!key) return;
    const states = allStates.get(key) ?? new Set<ProgressState>();
    states.add(entry.state);
    allStates.set(key, states);
  };
  for (const item of [...articles, ...plans]) {
    try {
      const content = readWiki(root, item.path).content;
      contents.set(item.path, content);
      const front = /^---\s*\r?\n([\s\S]*?)\r?\n---/.exec(content)?.[1] ?? '';
      if (/^\s*["']?document_kind["']?\s*:\s*["']?contract["']?\s*$/im.test(front) || /^wiki\/contracts\//i.test(item.path)) contracts.push({ ...item, scope: scalar(front, 'scope'), status: scalar(front, 'document_status'), revision: scalar(front, 'revision'), origin: scalar(front, 'authorization_ref') });
      // Older wikis may have contract-like titles or tags without lifecycle metadata; never infer approval.
      else if (/(?:^|[\/_-])(?:vertrag|vertr[aä]ge|vertraege|contracts?|projektvertrag|projektvertr[aä]ge|projektvertraege)(?:[\/_.-]|$)/i.test(item.path) || /^\s*tags\s*:\s*\[[^\]]*projektvertr(?:[aä]ge|aege|ag)/i.test(front)) contractCandidates.push(item);
      if (/^\s*(?:document_kind|type)\s*:\s*["']?(?:template|plan-template)["']?\s*$/im.test(front) || /(?:^|\/)(?:templates|vorlagen)\//i.test(item.path) || /(?:^|[\/_-])(?:plan(?:ungs?)?[-_]?vorlage|plan[-_]?template|planning[-_]?template|vorlage[-_]?plan)(?:[\/_.-]|$)/i.test(item.path)) templates.push(item);
      // Established wikis may retain registers beside plans; never infer task completion from a plan itself.
      if (/^output\/evidence\//i.test(item.path) || /^output\/projects\/.+\/(?:nachweise|evidence|register|status)(?:[-_.][^/]*)?\.md$/i.test(item.path)) progress.push(...progressOf(item.path, content, markProgressTruncated, observeStatus));
      else if (/^output\/projects\//i.test(item.path)) {
        // Only an identified register section is evidence; ordinary plan checklists are not.
        for (const section of embeddedExecutionSections(content).filter((s) => /^#{1,6}\s/.test(s))) progress.push(...progressOf(item.path, section, markProgressTruncated, observeStatus));
      } else if (/^wiki\//i.test(item.path) && executionRegisterDocument(item.path, content)) {
        // Existing wiki articles can own a register without a copy or synchronization step.
        const sections = embeddedExecutionSections(content).filter((s) => /^#{1,6}\s/.test(s));
        if (sections.length) for (const section of sections) progress.push(...progressOf(item.path, section, markProgressTruncated, observeStatus));
        else progress.push(...progressOf(item.path, content, markProgressTruncated, observeStatus));
      }
    } catch { unreadable = true; }
  }
  // A register can name work items while its same-initiative plan describes them.
  // Join only explicit, unique IDs from that wiki; statuses still come from the register.
  const planDescriptions = new Map<string, { text: string; path: string; title?: string } | null>();
  for (const plan of plans) {
    const match = /^output\/projects\/(.+)\/plan\.md$/i.exec(plan.path);
    if (!match) continue;
    try {
      const content = contents.get(plan.path);
      if (content === undefined) throw new Error('Plan was not read');
      for (const line of outsideFences(content)) {
        const item = /^\s*[-*]\s+(?:\*\*)?([A-Z][A-Z0-9_-]*-\d+)(?:\s+([^:*]{1,160}?))?(?:\*\*)?\s*:\s*(?:\*\*)?\s*(.+?)\s*$/i.exec(line);
        if (!item) continue;
        const key = `${match[1]}\0${item[1]}`;
        const description = [item[2]?.trim(), item[3].trim()].filter(Boolean).join(': ').slice(0, 1000);
        planDescriptions.set(key, planDescriptions.has(key) ? null : { text: description, path: plan.path, ...(item[2]?.trim() ? { title: item[2].trim() } : {}) });
      }
    } catch { unreadable = true; }
  }
  // Explicit links disambiguate separate evidence folders and prevent cross-plan matches.
  const planLinks = new Map<string, Set<string>>();
  const linksIn = (relative: string): Set<string> => {
    if (planLinks.has(relative)) return planLinks.get(relative)!;
    const links = new Set<string>();
    try {
      const content = contents.get(relative);
      if (content === undefined) throw new Error('Register was not read');
      const text = outsideFences(content).join('\n');
      for (const match of text.matchAll(/\]\(([^\s)]+)(?:\s+[^)]*)?\)/g)) {
        const target = match[1].split('#', 1)[0];
        if (!target || /^(?:[a-z]+:|\/)/i.test(target)) continue;
        const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(relative), target));
        if (/^output\/projects\/.+\/plan\.md$/.test(resolved)) links.add(resolved);
      }
    } catch { /* An unreadable link source supplies no inferred description. */ }
    planLinks.set(relative, links);
    return links;
  };
  for (const entry of progress) {
    if (!entry.workItemId) continue;
    const scope = /^output\/(?:projects|evidence)\/(.+)\/[^/]+$/i.exec(entry.path)?.[1];
    const item = scope && planDescriptions.get(`${scope}\0${entry.workItemId}`);
    if (!item) continue;
    const links = linksIn(entry.path);
    if ((links.size && (links.size !== 1 || !links.has(item.path))) || (/^output\/evidence\//i.test(entry.path) && !links.has(item.path))) continue;
    if (!entry.description) { entry.description = item.text; entry.descriptionPath = item.path; }
    // Use an explicit plan title as the task keyword; never infer one from prose.
    if (item.title && (entry.title === entry.workItemId || entry.title.startsWith(`${entry.workItemId} · `))) {
      entry.title = `${entry.workItemId} · ${item.title}${entry.title.slice(entry.workItemId.length)}`;
    }
  }
  // Include out-of-view source rows when checking whether a displayed status is contradictory.
  for (const entry of progress) {
    const key = stageKey(entry);
    if (key && (allStates.get(key)?.size ?? 0) > 1) entry.state = 'unknown';
  }
  progressTruncated ||= progress.length > 500;
  return { contracts, contractCandidates, templates, progress: progress.slice(0, 500), progressTruncated, unreadable };
}
