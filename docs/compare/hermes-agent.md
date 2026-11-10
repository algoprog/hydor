# Hydor and Hermes Agent

Hermes Agent is an open-source agent from Nous Research that lives on a server, answers in your chat apps and learns by itself. Hydor is an app that runs the agents you already use, Hermes among them, with one memory and from any device. This page says where each is the better fit, and how to use both. Checked 10 November 2026.

## Who Hermes Agent is for

People who want one agent that is always on: it runs on a small server or in the cloud, you talk to it from Telegram, Discord, Slack, WhatsApp or a terminal, and it gets better at your jobs over time without being asked. It is by [Nous Research](https://nousresearch.com), under the MIT license, written in Python, and works with many model providers [1][2]. As of 10 November 2026 its repository has 262k stars and 58.6k forks [3].

## What Hermes Agent does better than Hydor

- **Chat apps.** Its gateway answers on more than 20 messaging platforms [4]: Telegram, Discord, Slack, WhatsApp, Signal, email, SMS, Matrix, Teams, iMessage through BlueBubbles, Feishu, WeChat and more. Hydor has Telegram, Discord and Slack.
- **It learns by itself.** In its example configuration it nudges itself to save a memory every 10 turns and to write a skill every 15, and a background review writes skills without being asked [1]. Hydor proposes skills and waits for your yes. If you want an agent that grows on its own, Hermes does that more.
- **Where it runs.** Six built-in terminal backends (local, Docker, SSH, Modal, Daytona and Vercel Sandbox), two of them able to sleep when idle [2]. Nous also sells a plan with a hosted agent: each paid Nous Portal plan includes one Cloud agent [5]. Hydor runs on your own computer, a server you set up or a cloud service you deploy it to, and is self-hosted: there is no hosted plan.
- **Its own app and tools.** Hermes Desktop, a terminal interface, more than 40 tools, and batch trajectory generation for people training models [2].
- **Interface languages.** Its own page says the interface has 17 languages [4]. Hydor has English, Chinese and Greek.
- **Size.** Far more people use it, so more questions have been asked and answered. Hydor's repository went public in late October 2026 and is small beside it.

## Where Hydor is ahead

- **The official Claude Code and Codex, on your plans.** Hydor runs the `claude` and `codex` programs themselves, signed in with the plans you pay for, and shows sessions you started in VS Code or a terminal. Hermes's own comparison page says a Claude Max sign-in "draws only on purchased extra usage credits, not the base Max allowance" and that Claude Pro cannot sign in [4]; it can hand coding to the Claude Code CLI through a bundled skill [4].
- **One memory for every agent.** Hydor keeps notes found by meaning and checks them each day against your conversations, whichever agent you used. Hermes keeps two small files per profile by default, MEMORY.md (2,200 characters) and USER.md (1,375), and searches past sessions [1].
- **Nothing is kept without you.** Skills are proposed after hard tasks and you approve them; memory is checked, not silently grown.
- **A phone, with approvals and diffs.** A web app that installs on your phone, with notifications, approvals and every change as a diff; desktop apps for Mac, Windows and Linux.
- **More than chat.** A Library of pages, documents, slides, spreadsheets, LaTeX and diagrams that agents write into, and apps with views of their own.
- **A strong model leading cheaper helpers.** In Hydor's own benchmark of 10 November 2026 (seven coding tasks, run by us) the team passed every check at 9% less than the Best tier alone, and at 67% less than running everything on Max [6]. Hermes can run subagents on a model of your choice; we have not compared the two.
- **Confidential sessions and a vault.** Sessions that use only models on your computer, and keys that agents use without seeing them.
- **No telemetry.** Hydor has no analytics libraries. Hermes's own page says it has no telemetry by default [4], so here you are even.

## How to switch

You do not have to choose. Hermes speaks ACP (`hermes acp`), so it runs inside Hydor as one of its agents, beside Claude Code, Codex and the rest.

1. Install Hermes Agent with its own installer and sign it in with `hermes setup`.
2. In Hydor, add it under [Settings → Agents → More agents](/settings?s=agents&find=Agents%20that%20speak%20ACP), then pick it as the agent of a session.
3. To keep what Hermes knows, open [Settings → Memory → Bring in](/settings?s=memory&find=Bring%20in%E2%80%A6). It reads Hermes's memory files and skills and shows them as notes you pick from; nothing is added until you do. The setup tour offers it too.
4. Keep Hermes's own gateway running for a chat app Hydor does not have.

Going the other way, Hermes's own importer brings in what OpenClaw, Claude Code, Codex and Cursor left behind [1].

## Sources

1. [Hermes Agent README](https://github.com/NousResearch/hermes-agent#readme) and its example configuration, MIT license, memory limits and migration notes.
2. [Hermes Agent, hermes-agent.nousresearch.com](https://hermes-agent.nousresearch.com/): terminal backends, tools, Hermes Desktop.
3. [GitHub API, NousResearch/hermes-agent](https://api.github.com/repos/NousResearch/hermes-agent): stars, forks, license, language.
4. [Hermes Agent vs Claude Code](https://hermes-agent.nousresearch.com/compare/claude-code), Hermes's own page: messaging platforms, 17 languages, Claude plan sign-in, telemetry.
5. [Nous Portal](https://portal.nousresearch.com/): the subscription and its Cloud agent.
6. [Tiers and the team](../plans/tiers-and-the-team.md): Hydor's benchmark, with its tasks and runs.

Checked 10 November 2026. Something out of date? [Open an issue](https://github.com/algoprog/hydor/issues) and it will be corrected. Hydor is not affiliated with Nous Research.

[Back to all comparisons](README.md)
