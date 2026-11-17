---
name: wiki-planning
description: Use when adopting or revising a project wiki plan or recording implementation, deployment and acceptance evidence in Hydor Wiki memory.
category: planning
triggers: [wiki plan, wiki plans, wiki planning, wiki execution, execution tracking, wiki planung, wiki-plan, umsetzungskontrolle, umsetzungsnachweis, nachweisregister]
---

# Wiki planning and execution tracking

Keep one current plan and one authoritative execution register. Use the `project-plan` skill for
general planning; this skill covers Hydor's wiki workflow.

1. Use `wiki_status` and `wiki_read` to find the project, existing plan and register; preserve their
   IDs and links. Respect disabled Wiki plans and execution tracking; never bypass a switch.
2. Adopt with `wiki_plan_preview` and `wiki_plan_adopt`, using the preview hash; Hydor asks the user
   to confirm. Supply an existing register or a proposed embedded register. With execution tracking
   off, omit a new register or link an existing one unchanged.
3. Revise with `wiki_plan_revision_preview` and `wiki_plan_revise`, using the read hash and showing
   old text, new text and reason. Hydor asks for confirmation and preserves the previous revision. Plan approval
   does not authorize implementation, deployment or release.
4. With execution tracking on, update a separate register in `wiki/` or `output/evidence/`, or create
   one in `output/evidence/<plan>/<name>.md`, via `wiki_write` with its read hash or `null` for a new file.
   For an identified register embedded in
   a plan, use `wiki_plan_revision_preview` and `wiki_plan_revise` with `mode: execution`; change
   only that section. This works even with plan editing off. Keep implementation, deployment and
   acceptance separate; unknown and untested work stays unknown.
5. A new register can use this table, which Hydor's project Wiki view reads directly. Use `Open`,
   `In progress`, `Done`, `Blocked` or `Offen`, `In Arbeit`, `Abgeschlossen`, `Blockiert`; include
   actual evidence. Preserve established registers instead of creating a second status list.

   | Work item | Task | Description | Implementation | Deployment | Acceptance | Evidence |
   | --- | --- | --- | --- | --- | --- | --- |
   | WI-01 | Login | Check mobile login | Open | Open | Open | Not yet available |

An unrecognized status is unknown, not a failure. Never infer completion from a plan checklist.
