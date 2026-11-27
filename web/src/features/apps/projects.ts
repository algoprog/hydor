// Apps' project questions in the pages: the parts that need the person's projects. (The form's own select is in
// Form.tsx.)
import { useMemo } from 'react';
import type { AppInfo } from '@shared/app-manifest';
import { appInfo } from '@shared/app-manifest';
import type { AppDef, AppTemplate } from '@shared/apps';
import { useSpaces } from '../spaces/state';

/** An app's info for its view or screen, with each project question's choices: the projects' names (a form there picks by name). */
export function withProjects(info: AppInfo, names: string[]): AppInfo {
  return { ...info, flows: info.flows.map((f) => ({ ...f, inputs: f.inputs.map((i) => (i.type === 'project' ? { ...i, options: names } : i)) })) };
}

/** appInfo for a view or screen, kept up to date with the projects. */
export function useAppInfo(id: string, app: AppDef | AppTemplate): AppInfo {
  const spaces = useSpaces();
  return useMemo(() => withProjects(appInfo(id, app), (spaces ?? []).map((s) => s.name)), [id, app, spaces]);
}
