# Research and engineering: a plan

*5 November 2026. The owner picked 34 ideas from a brainstorm for researchers and engineers; this is how they fit
Hydor. Several builders work on it at once, each in its own worktree and branch (`rs/<workstream>`); the lead
merges them, translates, makes the vectors, writes the release notes and ships one release.*

## In short

- **Reuse first.** Every feature is built from what Hydor has: ready-made apps (flows of model, code, tool and agent
  steps, views, records, screens, own pages with Update every day), scheduled tasks and their webhooks and watchers,
  skills, child sessions and worktrees, Swarm's board, the LaTeX editor and its comments, Machines, Monitor, the
  vault, local models and the local embedding model. New core code only where nothing fits: **Experiments**, the
  **pre-submission check**, **Confidential sessions** and **project sharing**.
- **Calm screens.** Few visible controls; new things go inside the places they belong (a tab under System, a
  choice under Options, items in an editor's menus, apps under their kinds), not new sidebar entries. No fades,
  menus that fit on screen, bottom sheets on phones, both themes, plain words.
- **Words for people who are not programmers**, as the rest of the app: second person, the UI's own labels.

## Where each feature lives

| Feature | Where people find it | Built as | Workstream |
|---|---|---|---|
| Paper radar | Apps → Research; its own page, Update every day | ready-made app | B1 |
| Citation alerts | Apps → Research; own page | ready-made app | B1 |
| New-model watch | Apps → Research; own page | ready-made app + Experiments jobs | B1 |
| Deadline radar | Apps → Research; own page | ready-made app (ccfddl and ai-deadlines data) | B1 |
| Living related work | Apps → Research; own page | ready-made app + its records | B1 |
| Gap finder | Apps → Research | ready-made app | B1 |
| Reading list with Zotero sync | Apps → Research; its screen | ready-made app with records, screen, Zotero keys | B2 |
| Literature matrix in one click | Apps → Research; from the Reading list | ready-made app → a Library spreadsheet | B2 |
| Reproduce a paper | Apps → Research | ready-made app (agent step) + skill | B2 |
| Reviewer simulator | Apps → Writing; LaTeX editor's Tools | ready-made app | B2 |
| Rebuttal workbench | Apps → Writing; LaTeX editor's Tools | ready-made app | B2 |
| Paper to talk, poster and thread | Apps → Writing; LaTeX editor's Tools | ready-made app → slides, a LaTeX poster, a page | B2 |
| Figure doctor | Apps → Writing | ready-made app (agent step) + skill | B2 |
| Pre-submission check | LaTeX editor → Tools → Check before submitting | server checks + a dialog + comments + agent tool | C |
| Numbers that match the runs | inside the pre-submission check | server checks against Experiments | C |
| arXiv and camera-ready packer | LaTeX editor → File/Export | server packer + agent asks | C |
| Experiments: queue, run records, agent on call | System → Experiments | new capability `server/experiments` | A |
| Clusters over SSH | Experiments → Where it runs | part of Experiments | A |
| Results tables with significance | Experiments → pick runs → Make a table | part of Experiments | A |
| Sweep planner | Apps → Lab; Experiments → New → Sweep | ready-made app + Experiments sweeps | D (app), A (sweeps) |
| Annotation workbench | Apps → Lab; its screen | ready-made app with records and screen | D |
| Research sprint | Apps → Lab | ready-made app with person steps | D |
| Weekly progress report | Apps → Work; own page, Update once a week | ready-made app + `work_log` step tool | D |
| Lab notebook | Apps → Work; own page, every evening | ready-made app with records | D |
| CI doctor | Scheduled tasks → examples (Engineering) | task template + skill | E |
| Issue triage | Scheduled tasks → examples | task template + skill | E |
| Dependency gardener | Scheduled tasks → examples | task template + skill | E |
| Incident first responder | Scheduled tasks → examples | task template + skill | E |
| Auto-bisect | Git → a commit's menu → Find what broke it | session in a worktree + skill | E |
| Migration campaign | Options → Swarm → Campaign | Swarm's lead with other instructions, members in worktrees | E |
| Confidential sessions | Options → Confidential (a lock) | a session setting enforced by a capability | F |
| Highlights and Ask on PDFs | Files → a PDF | after the other session's PDF reader lands | F (later) |
| Shared lab projects | A project's menu → Share | personal links to a project portal: view, comment, edit documents | G |

## Contracts between workstreams

These names are fixed so the workstreams fit together when merged. Add fields if you need to; do not rename.

### Experiments (A provides)

- Types in `shared/experiments.ts` (in the base branch): `JobSpec`, `RunRecord`, `RunEvent`, `RunStatus`,
  `ResultsTableSpec`, `ResultsTable`, `ClusterSpec`.
- Server functions in `server/experiments/records.ts` (stubs in the base branch, A writes them for real):
  `listRuns(db, q)`, `getRun(db, id)`, `getTable(db, id)`, `recomputeTable(db, id)`.
- Tools, for agents in sessions and as app steps (their names are already in `STEP_TOOLS` in the base branch):
  - `experiment_run` `{ command, cwd?, name?, group?, where?, gpus?, gpuMemGb?, params?, seed?, tags?, onCall?, notify? }` → `{ id, status, why? }`
  - `experiment_sweep` `{ command (with {name} placeholders), params: { name: values[] }, mode?: grid|random, maxRuns?, group, gpus?, gpuMemGb?, earlyStop?: { metric, better: max|min, afterSteps? } }` → `{ sweep, runs: [ids] }`
  - `experiment_list` `{ group?, tag?, status?, cwd?, limit? }` → `{ runs: [{ id, name, group, status, metrics, startedAt, endedAt }] }`
  - `experiment_get` `{ id, lines? }` → the record and the end of its log
  - `experiment_wait` `{ ids?, group?, tag?, hours? }` → when they have all ended (or the hours ran out): their records. For app steps (a Research sprint waits for its runs); agents in sessions should not wait hours.
  - `experiment_stop` `{ id }`
  - `experiment_table` `ResultsTableSpec` → `ResultsTable` (with `latex`, `markdown`, `csv`, and an `id` kept so it can be checked again later)
- A results table put into a LaTeX document carries a marker line `% hydor:table <id>` just above its `tabular`, so the
  pre-submission check can work the numbers out again and say which changed.
- Routes under `/api/experiments/…` (A documents them in `docs/guide/90-api.md`).

### Step tools for apps (B1, D, B2)

- `rank_by_interest` (B1): `{ items: [{ id, text }], interests?: string[], liked?: string[], disliked?: string[], limit? }`
  → `[{ id, score, why? }]`. Interests default to the user's profile, their projects' names and descriptions and their
  latest session titles. By meaning with the local embedding model when search by meaning is on (`server/memory/embed.ts`),
  else by words (BM25); liked and disliked texts move the ranking (relevance feedback).
- `work_log` (D): `{ from, to, project? }` → `{ sessions: [{ title, project, folder, agent, started, ended, cost, outcome, asked, replied }], commits: [{ repo, hash, date, subject }], runs: [{ id, name, status, metrics }], library: [{ kind, title, changed }], read: [{ title }] }`.
  What the user did in a period, for the weekly report and the lab notebook. Leaves out sessions with memory off
  and Confidential sessions.
- `user_profile` (exists) gains `projects: [{ name, about }]` (B1).
- Library saves from a step (B2 decides): `save_sheet`, `save_doc`, `save_slides`, `save_latex`, `save_page` as step
  tools if they work without a session (their names are in `STEP_TOOLS` in the base branch); otherwise an agent step
  saves it.

### Apps that take a paper (B2), opened from the LaTeX editor (C)

- Ready-made app ids: `reviewer-simulator`, `rebuttal-workbench`, `paper-to-talk`, `figure-doctor`,
  `literature-matrix`, `reading-list`, `reproduce-paper`.
- A paper is asked for with two fields: `paper` (text: a link, an arXiv id or DOI, or a file or folder on this
  computer: a PDF, a `.tex` file or a LaTeX project's folder) and `upload` (file, optional: "Or upload it"). The
  flow uses the upload when there is one.
- The app's page fills its form from its address: `/apps/tpl:<id>?in.<field>=<value>` (B2 adds this to the app page;
  C links to it from the LaTeX editor with `in.paper` set to the compiled PDF's path or the project's folder).

### Updates on chosen days (D)

- An app's own page's **Update every day** becomes **Update automatically** with *Every day*, *On weekdays* or *Once a
  week on …*: `HomeSettings.daily.days?: number[]` (0 is Sunday), carried into the task's `{ kind: 'daily', time, days }`.
  A ready-made app can say what it starts with: `home?: { time?: string; days?: number[] }` on the recipe
  (the weekly report: Fridays at 16:00).

### Confidential sessions (F)

- `SessionExtra.confidential?: true`. Other capabilities check `extra.confidential` where they would send the
  session's words elsewhere (the helper model's titles and summaries, memory, apps, a second opinion, the arena,
  push notification text, share links). F does those checks.

## Guide topics

- New topics: `24-experiments.md` (A), `25-research.md` (B1, B2, C, D: one section each, as the skeleton in the base
  branch says), `26-engineering.md` (E). Each new topic needs its pictures and its Chinese and Greek translations:
  the lead does those after merging.
- Existing topics: `10-apps.md` (B1, B2, D add their apps to the ready-made list, in their own regions), `11-library.md`
  (C: the LaTeX tools), `12-tasks.md` (E: the new examples), `02-sessions.md` (F: Confidential; E: Campaign under
  Options), `08-research.md` (E: Campaign beside Swarm), `04-projects.md` (G: Share), `19-files-git.md` (E:
  Find what broke it; F later: PDF highlights), `90-api.md` (each its own area, as the skeleton says).

## Order of work

1. The workstreams build in parallel; each commits to its own branch, with its tests and its English docs.
2. The lead merges A first (others depend on it), then the rest, fixing what meets.
3. The lead extracts the new words and translates them (Chinese and Greek), translates the new and changed guide
   topics, takes the guide's pictures, makes the vectors, writes `docs/features.md`, `README.md` and the release notes.
4. One release, after the other session's editors round has landed: rebase, check, deploy, tag.
