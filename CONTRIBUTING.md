# Contributing to Hydor

Thank you for helping. This page says where to start, how to set up and test, and what a pull request needs.
[AGENTS.md](AGENTS.md) has the rules every change follows (what agents working on the code read too), and
[docs/development.md](docs/development.md) how the code is laid out.

## Where to start

Much of Hydor can grow without touching its core, and those are the best first contributions:

- **A connected app**: one JSON file in `catalog/connections/` puts a service's MCP server in Apps → Connected apps for
  everyone. [catalog/CONTRIBUTING.md](catalog/CONTRIBUTING.md) says what makes a good entry.
- **A skill**: a folder in `skills/` with a `SKILL.md`, a way of working agents load when a task needs it.
- **A plugin**: a folder in `plugins/` in the Agent Plugins 1.0 format (skills, tool servers, what they need).
- **An app template** (`server/apps/templates*.ts`): a small tool for one job, with a form, steps and a view.
- **An answer UI** (`shared/answer-ui/`, drawn by `web/src/components/answer/`): a card, chart or table agents fill in
  as they answer.
- **A translation**: the app is in English, Chinese and Greek (`web/src/i18n/`, `docs/guide/zh/`, `docs/guide/el/`);
  a new language, or better words in one, is welcome.
- **The guide** (`docs/guide/`): what it says wrong or leaves out.

For anything bigger, open an issue first and say what you would like to change and why, so we can agree on it before
you spend time on it.

## Setting up

You need Node.js 22.12 or newer and git; on Linux and macOS, tmux too.

```bash
git clone https://github.com/algoprog/hydor && cd hydor
npm ci
npm run build:server && npm start   # the server on http://localhost:8790 (its setup link is in what it prints)
npm run dev:web                     # the web app with hot reload on http://localhost:5173
```

To try a change without touching your own Hydor, give the server a data folder of its own:
`DATA_DIR=/tmp/hydor-dev PORT=8800 npm start`.

## Testing

```bash
npm run typecheck
npm test                 # every test that needs nothing beyond a checkout, a few at a time
npm test -- memory/      # only those whose path has these words
```

Each test is a script beside the code it checks (`*-test.ts`, `tests.ts`). A change comes with tests for what it
changes. A change to how a page looks or works comes with pictures of it before and after
(`scripts/guide-shots/README.md` says how to take them).

## What a change brings with it

The app is described in several places, and people and agents rely on each: a change to something people can see or
do updates the guide (in all three languages), the feature list and the README where they describe it, the search
box's catalog and its vectors, and the texts in `web/src/i18n`. [AGENTS.md](AGENTS.md) says which, and the guide's
test (`npm test -- guide/`) checks much of it. Code you change keeps the style around it (there is no formatter run
over existing files), and new text is written as the guide is: plain words, for people who are not programmers.

## Pull requests

- One change per pull request, with its tests and docs, and a description of what it changes, why, and how you checked
  it (what you ran, what you looked at).
- `npm run typecheck` and `npm test` pass; pull requests run them on GitHub too.
- Written with an AI's help is fine, as long as you have read every line, run it and stand behind it. Issues and pull
  requests that read as unchecked output (a diagnosis no one confirmed, code no one ran) are closed.
- Hydor is under the [Apache License 2.0](LICENSE): what you contribute is too.

## Conduct and security

Everyone who takes part follows the [Code of Conduct](CODE_OF_CONDUCT.md). To report a vulnerability, use GitHub's
private reporting as [SECURITY.md](SECURITY.md) says, not a public issue.
