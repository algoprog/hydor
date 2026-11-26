// Which project each job belongs to (JobEntry.project): its session's, else the project whose folder it runs in, so a
// `job run` from a terminal or a run of Experiments started from its page is its folder's project's too. The Jobs page
// filters by it, a project's page shows its work in hand, and GET /api/jobs?project= gives only one project's jobs.
import os from 'node:os';
import path from 'node:path';
import type { JobEntry, JobsList } from '../../shared/jobs.ts';
import { isGroup, type Space } from '../../shared/spaces.ts';

type ProjectRef = NonNullable<JobEntry['project']>;

/**
 * The project a folder is in: the one whose own folder holds it, the innermost when several do. A project whose folder
 * is the home folder or a disk's root holds everything, so it is never found this way; nor is a group, whose folder is
 * not its projects' own.
 */
export function folderProjects(spaces: Space[], home = os.homedir()): (cwd?: string) => ProjectRef | undefined {
  const top = path.resolve(home);
  const roots = spaces
    .filter((s) => !isGroup(s) && s.folder)
    .map((s) => ({ dir: path.resolve(s.folder), ref: { id: s.id, name: s.name } }))
    .filter((r) => r.dir !== top && r.dir !== path.parse(r.dir).root)
    .sort((a, b) => b.dir.length - a.dir.length);
  return (cwd) => {
    if (!cwd || !roots.length) return undefined;
    const at = path.resolve(cwd);
    return roots.find((r) => at === r.dir || at.startsWith(r.dir + path.sep))?.ref;
  };
}

/** A job with its project: its session's, else the one whose folder it runs in; none when neither. */
export function withProject(e: JobEntry, byFolder: (cwd?: string) => ProjectRef | undefined): JobEntry {
  const project = e.session?.project ?? byFolder(e.cwd);
  return project ? { ...e, project } : e;
}

/** The projects a filter by one takes: that project, and for a group the projects it brings together too. */
export function projectIds(id: string, spaces: Space[]): Set<string> {
  const s = spaces.find((x) => x.id === id);
  return new Set([id, ...(s?.members ?? [])]);
}

/** When all of these should be done: nothing while one of them has no estimate still to come. Subagents never say how
 *  long they take, so the end of everything is told without them. */
export function doneAt(entries: JobEntry[], now: number): number | undefined {
  const ends = entries.filter((e) => e.kind !== 'subagent' && e.kind !== 'hydor-subagent').map((e) => e.estimate?.endsAt);
  return ends.length && ends.every((t): t is number => t !== undefined && t > now) ? Math.max(...(ends as number[])) : undefined;
}

/** The list with only the jobs of these projects, and the end of everything worked out again from those. */
export function onlyProjects(list: JobsList, ids: Set<string>): JobsList {
  const keep = (entries: JobEntry[]) => entries.filter((e) => !!e.project && ids.has(e.project.id));
  const running = keep(list.running);
  const queued = keep(list.queued);
  return { ...list, running, queued, servers: keep(list.servers), ended: keep(list.ended), allDoneAt: doneAt([...running, ...queued], list.at) };
}
