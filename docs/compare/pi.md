# Hydor vs pi

People switch from pi to Hydor for the official Claude Code and Codex on their own plans, approvals and a sandbox, one memory for every agent, and a phone app. The instructions you gave pi and the skills you made in it come over. Checked 10 November 2026.

## At a glance

| | Hydor | pi |
|---|---|---|
| **Runs the official Claude Code and Codex on your own plans, and shows the sessions you started in VS Code or a terminal** | ✓ | — Its own agent [2] |
| **Runs other agents inside it**: Gemini CLI, OpenCode, Goose and more | ✓ | — |
| **One memory that every agent shares**, found by meaning and checked against your conversations each day | ✓ | — None built in; left to extensions [2] |
| **On your phone**: installs as an app with notifications, and you approve or deny from the notification | ✓ | Partial: a terminal program; its Slack bot is a separate package [1] |
| **Desktop apps** for Mac (Apple silicon and Intel), Windows and Linux | ✓ | — Terminal only [2] |
| **Approvals, a command sandbox and a vault** that agents use without seeing your keys | ✓ | — No built-in permission system; run it in a container [1][4] |
| **A Library** of documents, slides, spreadsheets, LaTeX and diagrams that you edit in the app | ✓ | Partial: `/export` and `/share` make a page of a session [2] |
| **Confidential sessions**: local models only, with every network tool off | ✓ | Partial: local models through llama.cpp [3] |
| **No telemetry** | ✓ | — Install and update reports on by default; off with a setting [6] |
| **A strong model leading cheaper helpers** | ✓ 9% less than Best alone, 67% less than everything on Max [5] | — No sub-agents by design [2] |

## Why people switch to Hydor

- **Approvals and a sandbox, when you want them.** pi does not ask before every tool call and has no built-in permission system; its guide says to run it in a container or a virtual machine [1][4]. Hydor asks before risky steps and shows them on your phone with **Approve** and **Deny**, can sandbox commands, keeps your keys in a vault that agents use without seeing them, and has a Full access mode for when you want none of it.
- **The official Claude Code and Codex on your plans.** Hydor runs the `claude` and `codex` programs themselves, signed in with what you pay for, and shows the sessions you started in VS Code or a terminal. pi is its own agent [2].
- **One memory for every agent.** pi leaves memory to extensions [2]. Hydor keeps notes found by meaning, checks them each day against your conversations, and shares them with every agent you run. After a hard task an agent can propose a skill, and it is kept only when you approve it.
- **A phone and a screen.** A web app that installs on your phone, with notifications and diffs, and desktop apps for Mac, Windows and Linux. pi is a terminal program, and its chat automation for Slack is a separate package [1].
- **More than code.** A Library of documents, slides, spreadsheets, LaTeX and diagrams, apps with views of their own, research with sources, scheduled tasks and watchers.
- **A strong model leading cheaper helpers, and no telemetry.** pi skips sub-agents by design [2]. In Hydor's own benchmark of 10 November 2026 (seven coding tasks, run by us) the team passed every check at **9% less than the Best tier alone, and 67% less than running everything on Max** [5]. pi's settings say anonymous install and update reporting is on by default, off with a setting or `PI_TELEMETRY=0` [6]; Hydor has no analytics libraries.

## Switch in a few minutes

1. [Install Hydor](../install.md) and sign in to Claude Code and Codex with the plans you pay for, under [Settings → Agents → Accounts](/settings?s=accounts).
2. Open [Settings → Memory → Bring in](/settings?s=memory&find=Bring%20in%E2%80%A6). It reads the instructions you gave pi and lists the skills you made in it, as notes and skills you pick from; you see it all first, and nothing is added until you pick it. The setup tour offers it too.
3. Start your next job in Hydor, with Claude Code, Codex or Hydor's own agent, and follow it from your phone.

## Sources

1. [pi README](https://github.com/earendil-works/pi#readme): packages, permissions and containers, Slack automation.
2. [pi.dev](https://pi.dev/): what it is, extensions, sessions, no sub-agents, no permission popups.
3. [pi docs: providers](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/providers.md) and [llama.cpp](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/llama-cpp.md).
4. [pi docs: Run Pi safely](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/security.md).
5. [Tiers and the team](../plans/tiers-and-the-team.md): Hydor's benchmark, with its tasks and runs.
6. [pi docs: settings](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/settings.md) and [environment variables](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/environment-variables.md).

Checked 10 November 2026. Something out of date? [Open an issue](https://github.com/algoprog/hydor/issues) and it will be corrected. Hydor is not affiliated with Earendil or the pi project.

[Back to all comparisons](README.md)
