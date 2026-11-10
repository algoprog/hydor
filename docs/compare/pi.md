# Hydor and pi

pi is a minimal terminal coding agent that you shape with TypeScript extensions. Hydor is an app that runs agents, pi among them, and gives them memory, a phone, a Library and approvals. This page says where each is the better fit, and how to use both. Checked 10 November 2026.

## Who pi is for

Developers who want a small, fast coding agent in the terminal that does exactly what they build into it. pi is by Earendil, under the MIT license, written in TypeScript [1]. It ships a minimal core with a short system prompt, and "skips features like sub-agents and plan mode": you add what you want with extensions, skills, prompt templates and packages [2]. As of 10 November 2026 its repository has 121k stars [3], and its coding-agent package on npm was downloaded 6.2 million times in the week to 9 November [4]. Its 1.0 reached 1,689 points on Hacker News on 1 October 2026 [5].

## What pi does better than Hydor

- **Small and yours.** Extensions are TypeScript modules with access to tools, commands, shortcuts, events and the terminal interface; ask pi to change itself, press `/reload` and carry on [2]. Hydor is a larger app with a server; you extend it with skills, plugins, apps and connected tools, not by rewriting its loop.
- **A context you control.** A minimal system prompt, project instructions loaded from AGENTS.md, and compaction you can replace by an extension [2].
- **Sessions as a tree.** `/tree` goes back to any earlier point and carries on from there; every branch lives in one file, and `/export` and `/share` make a page of a session [2]. Hydor can fork a session from any reply, but keeps them as separate sessions.
- **Four ways to run it.** Interactive, print or JSON for scripts, RPC for other programs, and an SDK to build it into your own app; its page points to OpenClaw as a real-world example [2]. Hydor has the `hydor` command, `hydor run` for scripts, and an HTTP API.
- **Many providers, by choice.** More than 15 providers and hundreds of models, with `/login` for a subscription or an API key, and local models through llama.cpp [2][6].
- **Lighter to install and audit.** Its installer pins every dependency, and a written supply-chain policy says how changes to them are reviewed [1].

## Where Hydor is ahead

- **Official Claude Code and Codex on your plans**, with sessions from VS Code or a terminal shown too. pi is its own agent.
- **A phone and a screen.** A web app that installs on a phone, notifications, approvals and diffs; desktop apps for Mac, Windows and Linux. pi is a terminal program, and its chat automation for Slack is a separate package [1].
- **Approvals and a sandbox, if you want them.** pi does not ask before every tool call and has no built-in permission system; its guide says to run it in a container or a virtual machine [7]. That is a clear choice and a good fit for people who already do. Hydor asks before risky steps, shows them on your phone and can sandbox commands, and has a Full access mode when you want none of it.
- **One memory for every agent**, checked against your conversations each day, and skills that agents propose after hard tasks and you approve. pi leaves memory to extensions [2].
- **Sub-agents and tiers.** By design pi has no sub-agents [2]. Hydor has a strong model lead cheaper helpers: in our own benchmark of 10 November 2026 (seven coding tasks, run by us) the team passed every check at 9% less than the Best tier alone and 67% less than everything on Max [8].
- **More than code.** A Library of documents, slides, spreadsheets, LaTeX and diagrams, apps, research with sources, scheduled tasks and watchers.
- **Confidential sessions, a vault and no telemetry.** pi's settings say anonymous install and update reporting is on by default; you turn it off with a setting or `PI_TELEMETRY=0` [9]. Hydor has no analytics libraries.

## A note on contributing

pi closes issues and pull requests from new contributors automatically by default, and its maintainers review the closed ones daily [1]. Hydor asks you to open an issue first for anything bigger than a small change ([CONTRIBUTING.md](../../CONTRIBUTING.md)), and closes ones that read as unchecked output.

## How to switch

Hydor runs pi as one of its agents, so you can use both.

1. Install pi with its own installer or `npm install -g --ignore-scripts @earendil-works/pi-coding-agent`, and run `/login` in it once.
2. In Hydor, add it under [Settings → Agents → More agents](/settings?s=agents&find=Agents%20that%20speak%20ACP) and pick it as the agent of a session.
3. To keep your pi skills, open [Settings → Memory → Bring in](/settings?s=memory&find=Bring%20in%E2%80%A6). It shows what it found as notes and skills you pick from, and adds nothing until you do. The setup tour offers it too.

Your pi sessions and extensions stay where they are: run `pi` in a terminal whenever you like.

## Sources

1. [pi README](https://github.com/earendil-works/pi#readme): license, packages, contributor policy, supply-chain notes, Slack automation.
2. [pi.dev](https://pi.dev/): what it is, extensions, sessions, modes, providers.
3. [GitHub API, earendil-works/pi](https://api.github.com/repos/earendil-works/pi): stars, license, language.
4. [npm downloads of @earendil-works/pi-coding-agent](https://api.npmjs.org/downloads/point/last-week/@earendil-works/pi-coding-agent), 3 to 9 November 2026.
5. [Pi 1.0 on Hacker News](https://news.ycombinator.com/item?id=49926069).
6. [pi docs: providers](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/providers.md) and [llama.cpp](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/llama-cpp.md).
7. [pi docs: Run Pi safely](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/security.md).
8. [Tiers and the team](../plans/tiers-and-the-team.md): Hydor's benchmark, with its tasks and runs.
9. [pi docs: settings](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/settings.md) and [environment variables](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/environment-variables.md).

Checked 10 November 2026. Something out of date? [Open an issue](https://github.com/algoprog/hydor/issues) and it will be corrected. Hydor is not affiliated with Earendil or the pi project.

[Back to all comparisons](README.md)
