---
name: library-docs
description: Use when writing or fixing code that uses a library, framework or SDK whose API may have changed since you learned it, or when the user names a version, before guessing at function names, options or config.
category: coding
triggers: [latest docs, current docs, documentation for, which version of, deprecated in]
---

# Library docs

Libraries change faster than any model's memory: options get renamed, functions move, defaults
change. With the Library docs plugin you can read the current documentation instead of guessing.

## 1. Find the library

Call `resolve-library-id` with the library's name and what you are trying to do. Pick the result whose
name matches exactly, with high source reputation and many code snippets. When the project pins a
version (package.json, requirements.txt, pyproject.toml, go.mod), check it first and choose that
version's id (`/org/project/version`) when one is listed.

## 2. Ask a precise question

Call `query-docs` with the id and a question about the exact thing you need: "how to stream
responses with the async client", "the config option for retries", "migrating from v4 to v5". One topic
per question gives better answers than "everything about X".

## 3. Use what it says, and check

- Prefer the documentation over memory where they differ, and say so when it matters ("in v5 this
  is `createRoot`, not `render`").
- Copy the shape of the official examples, then fit them to the code base's own style.
- Run the code or its tests: the documentation can be ahead of, or behind, the version installed.
  Check the installed version (`npm ls <pkg>`, `pip show <pkg>`) when something does not match.

## When not to use it

- Standard language features and well-settled APIs you are sure of.
- Private or in-house code: read its source instead.
- When the project already vendors the library's docs: read those.

## Pitfalls

- Picking a similarly named library (two "dotenv"s, forks): check the id's organisation.
- Mixing examples from two major versions.
- Sending secrets or private code in a question: questions go to Context7's server.
