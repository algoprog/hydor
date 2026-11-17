# Wiki memory development

Wiki memory (formerly the LLM Wiki) is the `wiki` capability registered in `server/features/index.ts`, with the document digest `wiki-digest` and the session checkpoints `wiki-session`. Its implementation and tests live under `server/wiki/`; its pages are in `web/src/features/wiki/` and the project's Memory tab (`web/src/features/spaces/SpacePage.tsx`). The shared types are in `shared/wiki.ts`, and a project's own switch is `Space.wikiMemory` (`shared/spaces.ts`).

It is one part of Hydor's memory with memory notes (`server/memory/`) and documents (`server/knowledge/`): see [How it works](how-it-works.md). It is on by default for every project (Settings → Memory → Wiki memory has the default; a project's Settings tab can override it), and the file layer works with existing file-backed wiki hubs and project wikis. It resolves active wikis, reads their Markdown, preserves source text and applies changes with expected hashes. Agents synthesize linked articles from sources, and the document digest does so with the helper model; the deterministic file layer does not generate contents.

## Boundaries

- `server/wiki/roots.ts` decides whether wiki memory is on for a project and where its folder is: the shared wiki is the hub folder, a project's wiki is `<hub>/projects/<dir>` (or inside the project's folder, or the folder its `AGENTS.md` names), and every folder must resolve inside the hub or its project: that is the one place to change where a wiki may live.
- `server/wiki/core.ts` owns wiki file access and basic structural checks. `tools.ts` exposes the agent workflow and `browse-feature.ts` provides the project view's read-only endpoints.
- `server/wiki/knowledge/` binds wiki folders to Hydor's existing Knowledge index and search. `server/knowledge/` continues to own indexing, retrieval and citations.
- `server/wiki/digest/` listens to knowledge's `indexed` event (`server/knowledge/events.ts`) and, with the helper model, turns new and changed documents into wiki articles and memory notes, gently (a quiet period, one document at a time, a few dozen an hour) and with every outcome recorded for the project's Recent updates. `limit.ts` counts a place's indexed documents (wikis' own left out) against the most its wiki reads (`wiki.documentLimit` in Settings, `Space.wikiDocumentLimit` for a project): over it, `digestOne` skips quietly and the backfill (`index.ts`, per place, `wiki.digest.backfilled.<project id | shared>`, looked at again every ten minutes) leaves the place unmarked until it is under.
- `server/wiki/session/` records permitted session checkpoints (one per session, on compaction). Hydor's agent and session implementations supply lifecycle events; support depends on the event each agent exposes.
- `server/wiki/lessons/` prepares reviewable lessons and uses Hydor's confirmation form before saving; `auto.ts` suggests them after a turn as a note the user keeps or dismisses (its routes are the user's alone: `server/guide/api.ts` refuses them to agents, and asks before an agent changes a chat's `wikiEnabled`/`wikiAutoLessons`).
- `server/wiki/plans/` is the only way to create or change anything under `output/projects/` (`area.ts` holds the rule; `core.ts` refuses a generic write there): adoption (`tools.ts`) and revision with a protected snapshot (`revision.ts`). Execution evidence lives in `output/evidence/`, which `wiki_write` can write and which is never a plan.
- `server/wiki/settings/` stores installation settings and maintains the optional project Git ignore entry.
- `web/src/features/wiki/` presents a project's wiki and its recent updates and the Wiki memory settings; the Memory tab itself is in `web/src/features/spaces/`. Hydor's i18n system translates application text.

The shared wiki and project wiki remain external data, not module source. Changes should preserve their formats, privacy boundaries and concurrent edits. External writers that do not use Hydor's lock cannot be guaranteed to cooperate with it.

## Checks

Run `npm run typecheck` and `npm test -- wiki/` for this module and its integrations. Changes to shared Knowledge, session or UI behavior also need the relevant existing tests, plus the project's full validation as described in [Contributing](../CONTRIBUTING.md). Follow that document for review and pull request expectations.
