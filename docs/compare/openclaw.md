# Hydor and OpenClaw

OpenClaw is an open-source assistant that runs on your own computer and meets you in the chat apps you already use. Hydor is an app that runs coding and research agents, with one memory, from any device. This page says where each is the better fit, and how to use both. Checked 10 November 2026.

## Who OpenClaw is for

People who want a personal assistant that answers in WhatsApp, Telegram, Slack, Discord, iMessage and 20 or more other channels, with companion apps for macOS, iOS, Android, Windows and Linux [1]. It is under the MIT license, written in TypeScript, and stewarded by the OpenClaw Foundation, which its README describes as an independent 501(c)(3) with no paid tier, hosted service or token [1][2]. As of 10 November 2026 its repository has 394k stars and 83k forks [2].

## What OpenClaw does better than Hydor

- **Chat apps, and a phone in your pocket.** More than 20 channels, and native apps for iOS and Android with voice, a canvas, camera and screen on the devices that have them [1]. Hydor has a web app that installs on a phone, and Telegram, Discord and Slack.
- **A shared assistant.** One gateway can run as a personal assistant or as a shared one for several people [1].
- **Plugins and a registry.** Models, channels and agent harnesses are plugins, shared through ClawHub [1].
- **Size and age in the field.** Far more people use it; Hydor's repository went public in late October 2026.
- **An organisation behind it.** A foundation that employs its core team and signs releases [1].

## Where Hydor is ahead

- **Coding agents as the centre.** Hydor is built around approvals, diffs, worktrees and following long coding sessions from your phone, and shows sessions you started in VS Code or a terminal. OpenClaw's docs describe reusing the Claude CLI and running Codex through its app-server [3]; Hydor's design centres on running those programs.
- **More agents.** Gemini CLI, OpenCode, Qwen Code, Goose, Kimi CLI, Auggie, Hermes Agent and pi run inside Hydor beside Claude Code, Codex and its own agent.
- **One memory for every agent**, checked each day against your conversations, and skills that agents propose after hard tasks and you approve.
- **A strong model leading cheaper helpers.** In Hydor's own benchmark of 10 November 2026 (seven coding tasks, run by us) the team passed every check at 9% less than the Best tier alone and 67% less than everything on Max [4]. We have not compared this with OpenClaw.
- **A Library and apps.** Documents, slides, spreadsheets, LaTeX and diagrams that agents write into, and small apps with views of their own.
- **Confidential sessions and a vault.** Sessions that use only models on your computer, and keys that agents use without seeing them.
- **No telemetry.** OpenClaw sends a daily update check by default; its anonymous feature statistics are opt-in, and `DO_NOT_TRACK` turns off the counting but not the update check [5]. Hydor sends nothing of the kind: it has no analytics libraries.
- **Safety defaults.** OpenClaw's README says tools run on the host for the main session unless you set up sandboxing [1]. It also pairs unknown senders on direct messages by default. Hydor asks before risky steps and can sandbox commands.

## Is OpenClaw built on pi?

In part, as far as we can tell. pi's own page points to OpenClaw as a real-world integration of pi's SDK [6]; OpenClaw's README thanks pi's author "for pi" [1]; and OpenClaw's package depends on pi's terminal-interface library, `@earendil-works/pi-tui` [7]. We did not find OpenClaw's own docs saying how much of its agent loop is pi's, so we say no more than that. [Hydor and pi](pi.md) compares Hydor with pi itself.

## How to switch

1. Keep OpenClaw for the chat apps it covers, and open Hydor beside it.
2. To keep what OpenClaw knows, open [Settings → Memory → Bring in](/settings?s=memory&find=Bring%20in%E2%80%A6): it reads OpenClaw's memory and skills and shows them as notes you pick from; nothing is added until you do. The setup tour offers it too.
3. For talking to agents from a chat app, connect Telegram, Discord or Slack under **Settings → Chat apps**.

OpenClaw can also import from Claude Code [3], and Hermes Agent and Atomic Agent import from OpenClaw.

## Sources

1. [OpenClaw README](https://github.com/openclaw/openclaw#readme): what it is, channels, apps, license, foundation, security, thanks to pi.
2. [GitHub API, openclaw/openclaw](https://api.github.com/repos/openclaw/openclaw): stars, forks, license, language.
3. [OpenClaw docs](https://docs.openclaw.ai/llms.txt): its index lists the Codex harness, the Claude CLI backend and the Claude Code import.
4. [Tiers and the team](../plans/tiers-and-the-team.md): Hydor's benchmark, with its tasks and runs.
5. [OpenClaw docs: usage telemetry and update checks](https://docs.openclaw.ai/gateway/telemetry).
6. [pi.dev](https://pi.dev/).
7. [OpenClaw package.json](https://github.com/openclaw/openclaw/blob/main/package.json).

Checked 10 November 2026. Something out of date? [Open an issue](https://github.com/algoprog/hydor/issues) and it will be corrected. Hydor is not affiliated with OpenClaw or the OpenClaw Foundation.

[Back to all comparisons](README.md)
