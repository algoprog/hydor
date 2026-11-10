# Hydor vs OpenClaw

Like OpenClaw? Keep it: it runs inside Hydor as one of its agents, and you add the things Hydor is built around: the official Claude Code and Codex on your own plans with approvals and diffs, one memory for every agent, a Library, and a phone app. Bring in OpenClaw's memory and skills, and keep its Gateway for your chat apps. Checked 10 November 2026.

## At a glance

| | Hydor | OpenClaw |
|---|---|---|
| **Runs the official Claude Code and Codex on your own plans, and shows the sessions you started in VS Code or a terminal** | ✓ | Partial: runs the Claude CLI and Codex through its app-server [2] |
| **Runs other agents inside it**: Hermes Agent, pi, OpenClaw, Gemini CLI, OpenCode, Goose and more | ✓ | Partial: Claude Code, Gemini CLI, OpenCode and others through ACP [4] |
| **One memory that every agent shares**, found by meaning and checked against your conversations each day | ✓ | Partial: its own memory, on your computer [1] |
| **On your phone**: installs as an app with notifications, and you approve or deny from the notification | ✓ | Partial: iOS and Android apps, and chat apps [1] |
| **Desktop apps** for Mac (Apple silicon and Intel), Windows and Linux | ✓ | ✓ Companion apps for macOS, Windows and Linux [1] |
| **Approvals, a command sandbox and a vault** that agents use without seeing your keys | ✓ | Partial: sender pairing, a sandbox you set up, approvals in chat apps [1][2] |
| **A Library** of documents, slides, spreadsheets, LaTeX and diagrams that you edit in the app | ✓ | Partial: a Canvas in its companion apps [1] |
| **Confidential sessions**: local models only, with every network tool off | ✓ | Partial: local models [1] |
| **A strong model leading cheaper helpers** | ✓ 9% less than Best alone, 67% less than everything on Max [3] | Partial: sub-agents [2] |

## Why people switch to Hydor

- **Built around coding agents.** Hydor runs the official `claude` and `codex` programs on your plans and shows the sessions you started in VS Code or a terminal. You follow long sessions from your phone: every step in plain words, every change as a diff, and worktrees to keep jobs apart. OpenClaw's docs describe reusing the Claude CLI and running Codex through its app-server [2]; in Hydor those programs are the centre.
- **More agents, one memory.** Gemini CLI, OpenCode, Qwen Code, Goose, Kimi CLI, Auggie, Hermes Agent and pi run inside Hydor beside Claude Code, Codex and its own agent, and they all share one set of notes, found by meaning and checked each day against your conversations. After a hard task an agent can propose a skill, and it is kept only when you approve it.
- **Approvals on your phone, a sandbox and a vault.** OpenClaw's README says tools run on the host for the main session unless you configure sandboxing [1]. Hydor asks before risky steps and shows them on your phone with **Approve** and **Deny**, can sandbox commands, and keeps your keys in a vault that agents use without seeing them.
- **A Library and apps.** Documents, slides, spreadsheets, LaTeX and diagrams that agents write into and you edit as in Word, PowerPoint, Excel and Overleaf, and small apps with views of their own.
- **A strong model leading cheaper helpers.** In Hydor's own benchmark of 10 November 2026 (seven coding tasks, run by us) the team passed every check at **9% less than the Best tier alone, and 67% less than running everything on Max** [3]. We have not compared this with OpenClaw.
- **Private by choice.** Confidential sessions use only models on your computer, with every tool that reaches the internet turned off.

## Keep what you like about OpenClaw

- **Run it in Hydor.** OpenClaw's `openclaw acp` bridge connects Hydor to your Gateway, so set OpenClaw up first (`openclaw onboard`) and keep its Gateway running. Add it under [Settings → Agents → More agents](/settings?s=agents&find=Agents%20that%20speak%20ACP) and pick it as the agent of a session: you get the phone app and the Library around it, and Hydor's guidelines, memory notes and skills reach it with the first message. Hydor's own tools do not: its bridge refuses them, so it works with its own tools.
- **Bring in what it knows.** [Settings → Memory → Bring in](/settings?s=memory&find=Bring%20in%E2%80%A6) reads OpenClaw's MEMORY.md and USER.md and the skills it holds (its workspace, shared and learned skills), and shows them as notes you pick from. Nothing is added until you do. The setup tour offers it too.
- **Keep its Gateway for your chat apps.** Leave OpenClaw answering in the chat apps it covers, and connect Telegram, Discord or Slack for the agents you run in Hydor under **Settings → Chat apps**.

## Switch in a few minutes

1. [Install Hydor](../install.md) and sign in to Claude Code and Codex with the plans you pay for, under [Settings → Agents → Accounts](/settings?s=accounts).
2. Open [Settings → Memory → Bring in](/settings?s=memory&find=Bring%20in%E2%80%A6), tick OpenClaw, and pick the notes and skills to keep.
3. If you want OpenClaw in Hydor too, keep its Gateway running and add it under [Settings → Agents → More agents](/settings?s=agents&find=Agents%20that%20speak%20ACP).
4. For talking to your agents from a chat app, connect Telegram, Discord or Slack under **Settings → Chat apps**.

## Sources

1. [OpenClaw README](https://github.com/openclaw/openclaw#readme): what it is, apps, memory, security and sandboxing, local models.
2. [OpenClaw docs](https://docs.openclaw.ai/llms.txt): its index lists the Codex harness, the Claude CLI backend, exec approvals in chat apps, sub-agents and the Claude Code import.
3. [Tiers and the team](../plans/tiers-and-the-team.md): Hydor's benchmark, with its tasks and runs.
4. [OpenClaw docs: ACP agents](https://docs.openclaw.ai/tools/acp-agents): the external harnesses it runs through ACP.

Checked 10 November 2026. Something out of date? [Open an issue](https://github.com/algoprog/hydor/issues) and it will be corrected. Hydor is not affiliated with OpenClaw or the OpenClaw Foundation.

[Back to all comparisons](README.md)
