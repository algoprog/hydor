// The places the start page keeps its picks for (StartSettings.places): each project, the new task folder, and each
// folder. Shared by the server (which keeps them) and the start page (which opens with a place's picks).

/** How many places keep their picks: the ones used last. */
export const MAX_PLACES = 60;

/**
 * A place's name: "task" for a new task folder, "project:<id>" for a project, "folder:<path>" for any other folder
 * (its path without a trailing slash); null with none picked.
 */
export function placeKey(s: { task?: boolean | null; space?: string | null; cwd?: string | null }): string | null {
  if (s.task) return 'task';
  if (s.space) return `project:${s.space}`;
  const dir = s.cwd ? s.cwd.replace(/[\\/]+$/, '') || s.cwd : '';
  return dir ? `folder:${dir}` : null;
}
