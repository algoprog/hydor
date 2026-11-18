// Script tests for the app's pages by their address (shared/app-pages.ts): a reply's link to one of them
// (/settings?s=models, /guide/projects#…) opens that page, while a file of this computer whose path starts with a page's
// name stays a file. Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs shared/app-pages-test.ts
//   DATA_DIR=/tmp/hydor-test-app-pages node dist/dev/app-pages-test.js
import assert from 'node:assert/strict';
import { appPageLink, isAppPage } from './app-pages.ts';

const pages = [
  '/settings?s=models',
  '/settings?s=memory&find=Search%20by%20meaning',
  '/settings',
  '/guide',
  '/guide/projects#make-a-project',
  '/',
  '/?project=sp0123456789',
  '/s/claude%3A0b1c2d3e-4f50-6172-8394-a5b6c7d8e9f0',
  '/review/codex%3Aabc',
  '/projects',
  '/projects/sp0123456789',
  '/projects/sp0123456789/wiki',
  '/spaces/sp0123456789',
  '/apps',
  '/apps/new?template=quiz',
  '/apps/t/trip-planner',
  '/apps/runs/r1a2b3',
  '/apps/a1b2c3/edit',
  '/agents',
  '/agents/schedules',
  '/agents/research-helper-ab12',
  '/library?project=sp0123456789',
  '/pages/0123456789',
  '/pages/0123456789/show',
  '/media/0123456789',
  '/remote/AbCd_1234-xyz',
  '/arena/x1y2',
  '/usage',
  '/stats',
  '/inbox',
  '/knowledge',
  '/answers',
  '/browser',
  '/system',
  '/system/monitor',
  '/system/experiments/abcd12',
  '/files',
  '/file?path=%2Fhome%2Fyou%2Fa.md',
  '/git',
  '/terminal',
];
for (const h of pages) assert.equal(appPageLink(h), h, `${h} is one of the app's pages`);

const files = [
  '/home/you/report.pdf',
  '/tmp/x.md',
  '/media/you/USB/photo.jpg',
  '/media/you',
  '/projects/repo/src/app.ts',
  '/apps/tool/run.py',
  '/apps/run.py',
  '/agents/notes.md',
  '/settings.json',
  '/settings/x',
  '/guidelines.md',
  '/guide/Intro.md',
  '/systemd/foo.service',
  '/github/x',
  '/files/data.csv',
  '/files#L12',
  '/s',
  '//elsewhere.example/settings',
  'settings',
  'https://example.com/settings',
  '#settings',
];
for (const h of files) assert.equal(appPageLink(h), null, `${h} is no page of the app`);

assert.ok(isAppPage('/settings') && !isAppPage('/settings?s=models'), 'isAppPage takes a path alone');
console.log(`app-pages: ${pages.length} pages and ${files.length} files told apart`);
