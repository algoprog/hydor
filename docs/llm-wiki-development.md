# LLM Wiki development

Hydor's LLM Wiki is the `wiki` capability registered in `server/features/index.ts`. Its implementation and tests live under `server/wiki/`; its project view is in `web/src/features/wiki/`. The project and memory settings pages connect to those components.

The capability works with existing file-backed LLM Wiki hubs and project wikis. The file layer resolves active wikis, reads their Markdown, preserves source text and applies changes with expected hashes. Agents synthesize linked articles from sources; the deterministic file layer does not generate their contents.

## Boundaries

- `server/wiki/core.ts` owns wiki file access and basic structural checks. `tools.ts` exposes the agent workflow and `browse-feature.ts` provides the project view's read-only endpoints.
- `server/wiki/knowledge/` binds wiki folders to Hydor's existing Knowledge index and search. `server/knowledge/` continues to own indexing, retrieval and citations.
- `server/wiki/session/` records permitted session checkpoints. Hydor's agent and session implementations supply lifecycle events; support depends on the event each agent exposes.
- `server/wiki/lessons/` prepares reviewable lessons and uses Hydor's confirmation form before saving.
- `server/wiki/settings/` stores installation settings and maintains the optional project Git ignore entry.
- `web/src/features/wiki/` presents project articles and sources. The existing Projects and Memory settings components host the entry points, and Hydor's i18n system translates application text.

The shared wiki and project wiki remain external data, not module source. Changes should preserve their formats, privacy boundaries and concurrent edits. External writers that do not use Hydor's lock cannot be guaranteed to cooperate with it.

## Checks

Run `npm run typecheck` and `npm test -- wiki/` for this module and its integrations. Changes to shared Knowledge, session or UI behavior also need the relevant existing tests, plus the project's full validation as described in [Contributing](../CONTRIBUTING.md). Follow that document for review and pull request expectations.
