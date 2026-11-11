# Hydor vs Atomic Agent

Hydor runs your local models too, and adds what Atomic Agent does not have: the official Claude Code and Codex with the sessions you started in VS Code or a terminal, many more agents beside its own, one memory for all of them, a phone app and a Library. Your memory and the skills you made in Atomic Agent come over with Bring in, and your local models work in Hydor. Checked 10 November 2026.

## At a glance

| | Hydor | Atomic Agent |
|---|---|---|
| **Runs the official Claude Code and Codex on your own plans, and shows the sessions you started in VS Code or a terminal** | ✓ | Partial: drives your Claude Code and Codex sign-ins through their CLIs; a handoff command picks up a stopped session [1] |
| **Runs other agents inside it**: Gemini CLI, OpenCode, Goose and more | ✓ | Partial: Claude Code and Codex [1] |
| **One memory that every agent shares**, found by meaning and checked against your conversations each day | ✓ | Partial: its own notes, lessons and procedures [1] |
| **On your phone**: installs as an app with notifications, and you approve or deny from the notification | ✓ | Partial: Telegram and Discord, with approval buttons [1] |
| **Desktop apps** for Mac (Apple silicon and Intel), Windows and Linux | ✓ | Partial: Apple silicon Macs, Windows and Linux; no Intel Macs yet [1] |
| **Approvals, a command sandbox and a vault** that agents use without seeing your keys | ✓ | Partial: approvals, and keys kept out of the commands it runs [1] |
| **Confidential sessions**: local models only, with every network tool off | ✓ | Partial: local models, which it is built for [1] |
| **No telemetry** | ✓ | — Anonymous usage analytics on by default [1] |
| **A strong model leading cheaper helpers** | ✓ 9% less than Best alone, 67% less than everything on Max [2] | Partial: Fusion, a planner with workers [1] |

## Why people switch to Hydor

- **The official Claude Code and Codex, and more agents.** Atomic Agent can drive your Claude Code and Codex sign-ins through their own CLIs, and pick up a session they stopped with a handoff command [1]. Hydor runs the official programs themselves on your plans and shows the sessions you started in VS Code or a terminal, so there is nothing to hand off. Gemini CLI, OpenCode, Qwen Code, Goose, Kimi CLI, Auggie and more run inside Hydor beside its own agent.
- **One memory for every agent.** Atomic Agent keeps notes, lessons and procedures for itself [1]. Hydor keeps one set of notes for every agent you use, found by meaning and checked each day against your conversations. After a hard task an agent can propose a skill, and it is kept only when you approve it.
- **Every screen.** A web app that installs on your phone, with notifications and **Approve** and **Deny** on the notification. Desktop apps for Mac (Apple silicon and Intel), Windows and Linux, the `hydor` command, and Telegram, Discord and Slack. On a Mac, Atomic Agent's builds are for Apple silicon; Intel Macs are not supported yet [1].
- **A Library and apps.** Documents, slides, spreadsheets, LaTeX and diagrams that agents write into and you edit in the app, and small apps with views of their own.
- **No telemetry.** Atomic Agent's README says "Anonymous usage analytics is on by default", with crash reports to Sentry on the same switch; you turn them off with a setting [1]. Hydor has no analytics libraries to switch off.
- **A strong model leading cheaper helpers.** Atomic Agent's Fusion has one model plan and a pool of workers do the clear parts [1]. Hydor's tiers and team work in a similar way, with a number behind it: in its own benchmark of 10 November 2026 (seven coding tasks, run by us) the team passed every check at **9% less than the Best tier alone, and 67% less than running everything on Max** [2].

## Your memory and your local models come with you

- **Bring in what it knows.** [Settings → Memory → Bring in](/settings?s=memory&find=Bring%20in%E2%80%A6) reads Atomic Agent's memory store (what it knows about you, its notes, lessons and procedures) and the skills you made in it, and shows them as notes you pick from. Nothing is added until you do. Hydor reads a copy and leaves the original untouched.
- **Your local models work in Hydor.** Hydor's own agent, Custom, runs any model through Ollama, vLLM, OpenRouter or any OpenAI-compatible endpoint, including the llama.cpp server you already run. Turn on **Confidential** for a session that must stay on your computer: it uses only local models, with every tool that reaches the internet off.

## Switch in a few minutes

1. [Install Hydor](../install.md) and sign in to Claude Code and Codex with the plans you pay for, under [Settings → Agents → Accounts](/settings?s=accounts).
2. Open [Settings → Memory → Bring in](/settings?s=memory&find=Bring%20in%E2%80%A6), and pick the notes and skills to keep (Atomic Agent's memory and the skills you made in it are read too). The setup tour offers it too.
3. Add your local model under [Settings → Agents → Models](/settings?s=models) and start a Custom session with it, or use **Confidential** when it must stay local.
4. Start your next job from the same place, and follow it from your phone.

## Sources

1. [Atomic Agent README](https://github.com/AtomicBot-ai/atomic-agent#readme): local models, Claude Code and Codex sign-ins and handoff, Fusion, memory, Telegram and Discord, platforms, privacy and analytics. Its site is [atomicagent.io](https://atomicagent.io).
2. [Tiers and the team](../plans/tiers-and-the-team.md): Hydor's benchmark, with its tasks and runs.

Checked 10 November 2026. Something out of date? [Open an issue](https://github.com/algoprog/hydor/issues) and it will be corrected. Hydor is not affiliated with AtomicBot.

[Back to all comparisons](README.md)
