// The old addresses of the Library (/library…, and /pages, which was its other address) go to where its parts live now:
// a project's files, the New dialog, a list of your own browser, the published sites, or the start page.
import { useEffect } from 'react';
import { useSearch } from 'wouter';
import { go } from '../../lib/nav';
import { ownBrowserHere } from '../browser/browsing';
import { isBrowserKind } from './BrowserLists';

/** Where an old Library address (its query, without the ?) goes now. */
export function libraryTarget(search: string): string {
  const q = new URLSearchParams(search);
  const project = q.get('project');
  const make = q.get('new');
  const kind = q.get('kind');
  // A project's New dialog is opened from its own Files; here the start page opens it in that project.
  if (make) return `/?new=${encodeURIComponent(make)}${project && /^[\w-]{1,80}$/.test(project) ? `&space=${encodeURIComponent(project)}` : ''}`;
  if (project && /^[\w-]{1,80}$/.test(project)) return `/projects/${encodeURIComponent(project)}/files`;
  if (isBrowserKind(kind)) return ownBrowserHere() ? `/browser?panel=${kind}` : '/';
  if (q.get('tab') === 'published') return '/published';
  return '/';
}

/** Shown for an instant at an old address: it moves on to where that is now. */
export function LibraryRedirect() {
  const search = useSearch();
  useEffect(() => go(libraryTarget(search), true), [search]);
  return null;
}
