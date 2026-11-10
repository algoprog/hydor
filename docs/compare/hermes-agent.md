# Hydor vs Hermes Agent

Like Hermes Agent? Keep it: it runs inside Hydor as one of its agents, and you get the official Claude Code and Codex on your own plans, one memory for every agent, and a phone app with approvals on top. Hydor does what people pick Hermes for, an agent in your chat apps that works on its own schedules and proposes skills it has learned, and adds the rest. Checked 10 November 2026.

## At a glance

| | Hydor | Hermes Agent |
|---|---|---|
| **Runs the official Claude Code and Codex on your own plans, and shows the sessions you started in VS Code or a terminal** | ✓ | Partial: Claude Code only, through a bundled skill [3] |
| **Runs other agents inside it**: Hermes Agent, pi, OpenClaw, Gemini CLI, OpenCode, Goose and more | ✓ | Partial: hands coding to Claude Code [3] |
| **One memory that every agent shares**, found by meaning and checked against your conversations each day | ✓ | Partial: two small files per profile, MEMORY.md (2,200 characters) and USER.md (1,375) by default, and search over past sessions [1] |
| **On your phone**: installs as an app with notifications, and you approve or deny from the notification | ✓ | Partial: chat apps [3] |
| **Desktop apps** for Mac (Apple silicon and Intel), Windows and Linux | ✓ | Partial: apps for macOS and Windows [2] |
| **Approvals, a command sandbox and a vault** that agents use without seeing your keys | ✓ | Partial: command approval and container isolation [1] |
| **Confidential sessions**: local models only, with every network tool off | ✓ | Partial: local models [3] |
| **A strong model leading cheaper helpers** | ✓ 9% less than Best alone, 67% less than everything on Max [4] | Partial: subagents on a model you choose [1] |

## Why people switch to Hydor

- **The official Claude Code on your plan.** Hydor runs the `claude` and `codex` programs themselves, signed in with the plans you pay for, and shows the sessions you started in VS Code or a terminal. Hermes's own page says a Claude Max sign-in in Hermes "draws only on purchased extra usage credits, not the base Max allowance", and that Claude Pro subscribers "cannot sign in this way" [3]. Hermes can still hand coding to the Claude Code CLI through a bundled skill [3]. In Hydor you start Claude Code or Codex itself, and follow every step from your phone.
- **One memory, for every agent.** Hydor keeps notes found by meaning and checks them each day against your conversations, whichever agent you used, Hermes included. Hermes keeps two small files per profile by default, MEMORY.md (2,200 characters) and USER.md (1,375), and searches past sessions [1]. In Hydor you can read, edit and delete every note, and a skill is kept only when you approve it.
- **Your phone, with approvals and diffs.** A web app that installs on your phone, with notifications; an approval comes with **Approve** and **Deny** right on the notification. Every change is a diff you can read. There are desktop apps for Mac (Apple silicon and Intel), Windows and Linux.
- **More than chat.** A Library of pages, documents, slides, spreadsheets, LaTeX and diagrams that agents write into and you edit as in Word, PowerPoint, Excel and Overleaf. Apps with views of their own. More than 100 ready-made views for replies: charts, maps, tables.
- **A strong model leading cheaper helpers.** In Hydor's own benchmark of 10 November 2026 (seven coding tasks, run by us) the team passed every check at **9% less than the Best tier alone, and 67% less than running everything on Max** [4]. Hermes can run subagents on a model of your choice [1]; we have not compared the two.
- **Private by choice.** Confidential sessions use only models on your computer, with every tool that reaches the internet turned off. A vault holds your keys, and agents use them without seeing them.

## Keep what you like about Hermes Agent

You do not have to choose. Hermes speaks ACP (`hermes acp`), so it runs inside Hydor as one of its agents, beside Claude Code, Codex and the rest.

- **Run it in Hydor.** Pick Hermes as the agent of a session and you get it with its own models and tools, plus Hydor's memory notes, the phone app, approval cards on your phone and the Library. Hermes keeps its own sessions and memory in its own folder, as before.
- **Bring in what it knows.** [Settings → Memory → Bring in](/settings?s=memory&find=Bring%20in%E2%80%A6) reads Hermes's memory files and the skills you made in it, and shows them as notes you pick from. Nothing is added until you do.
- **Keep its gateway for more chat apps.** Hermes's gateway answers on more than 20 messaging platforms [3]. Leave it running for the ones Hydor does not have, and use Hydor's own Telegram, Discord and Slack under **Settings → Chat apps** for the agents you run in Hydor.

## Switch in a few minutes

1. [Install Hydor](../install.md) (a desktop app for Mac, Windows and Linux, or Docker) and sign in to Claude Code and Codex with the plans you pay for, under [Settings → Agents → Accounts](/settings?s=accounts).
2. Install Hermes Agent with its own installer if you have not, and sign it in with `hermes setup`. Then add it under [Settings → Agents → More agents](/settings?s=agents&find=Agents%20that%20speak%20ACP) and pick it as the agent of a session.
3. Open [Settings → Memory → Bring in](/settings?s=memory&find=Bring%20in%E2%80%A6), tick Hermes, and pick the notes and skills to keep. The setup tour offers this too.
4. Start your next job in Claude Code, Codex or Hermes from the same place, and follow it from your phone.

Going the other way, Hermes's own importer brings in what OpenClaw, Claude Code, Codex and Cursor left behind [1].

## Sources

1. [Hermes Agent README](https://github.com/NousResearch/hermes-agent#readme) and its example configuration: memory limits, subagents, security, migration notes.
2. [Hermes Agent, hermes-agent.nousresearch.com](https://hermes-agent.nousresearch.com/): terminal backends, tools, Hermes Desktop for macOS and Windows.
3. [Hermes Agent vs Claude Code](https://hermes-agent.nousresearch.com/compare/claude-code), Hermes's own page: messaging platforms, Claude plan sign-in, the Claude Code skill, telemetry.
4. [Tiers and the team](../plans/tiers-and-the-team.md): Hydor's benchmark, with its tasks and runs.

Checked 10 November 2026. Something out of date? [Open an issue](https://github.com/algoprog/hydor/issues) and it will be corrected. Hydor is not affiliated with Nous Research.

[Back to all comparisons](README.md)
